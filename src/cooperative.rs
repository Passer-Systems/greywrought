//! Passive Clause session custody for the native cooperative transport.
use clause_package::Term;
use clause_runtime::{
    CheckedReconnectAdmissionPlanV1, ExecutableValueV1, ForkedProcessBranchV1,
    PersistentProcessSessionV1, ProcessReconnectAdmissionV1, decode_wasm_process_request_v1,
    encode_wasm_process_request_v1, open_fresh_persistent_process_session_v1,
};
use clause_workbench::ResidentSourceWorkbenchV1;
use std::{collections::BTreeMap, fs::File, io::Read};

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

pub struct Command {
    pub claimed_player: String,
    pub sequence: u32,
    pub operation: String,
    pub x: f64,
    pub z: f64,
}

pub struct DisconnectedClient {
    connection: u32,
    branch: ForkedProcessBranchV1,
}

/// Opaque socket attachment, invalidated when that socket disconnects.
#[derive(Clone, Copy)]
pub struct AuthenticatedConnection {
    identity: u32,
    generation: u64,
}

struct ConnectionEntry {
    credential: [u8; 32],
    generation: u64,
    active: bool,
}

/// Passive credential custody. Provision only over a trusted local boundary;
/// bearer credentials require a confidential transport outside loopback.
#[derive(Default)]
pub struct ConnectionCustody {
    connections: BTreeMap<u32, ConnectionEntry>,
}

impl ConnectionCustody {
    pub fn provision(&mut self, source_connection: u32) -> Result<[u8; 32]> {
        if self.connections.contains_key(&source_connection) {
            return Err("connection already provisioned".into());
        }
        let credential = credential()?;
        self.connections.insert(
            source_connection,
            ConnectionEntry {
                credential,
                generation: 0,
                active: false,
            },
        );
        Ok(credential)
    }

    pub fn attach(&mut self, presented: &[u8; 32]) -> Result<(AuthenticatedConnection, [u8; 32])> {
        let (identity, entry) = self
            .connections
            .iter_mut()
            .find(|(_, entry)| {
                entry
                    .credential
                    .iter()
                    .zip(presented)
                    .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
                    == 0
            })
            .ok_or("unknown connection credential")?;
        if entry.active {
            return Err("connection already attached".into());
        }
        let next = credential()?;
        let generation = entry
            .generation
            .checked_add(1)
            .ok_or("attachment generation exhausted")?;
        entry.credential = next;
        entry.generation = generation;
        entry.active = true;
        Ok((
            AuthenticatedConnection {
                identity: *identity,
                generation,
            },
            next,
        ))
    }

    pub fn identity(&self, connection: AuthenticatedConnection) -> Result<u32> {
        let entry = self
            .connections
            .get(&connection.identity)
            .ok_or("unknown attachment")?;
        if !entry.active || entry.generation != connection.generation {
            return Err("stale attachment".into());
        }
        Ok(connection.identity)
    }

    pub fn detach(&mut self, connection: AuthenticatedConnection) -> Result<u32> {
        let identity = self.identity(connection)?;
        self.connections
            .get_mut(&identity)
            .ok_or("unknown attachment")?
            .active = false;
        Ok(identity)
    }
}

fn credential() -> Result<[u8; 32]> {
    let mut bytes = [0; 32];
    File::open("/dev/urandom")?.read_exact(&mut bytes)?;
    Ok(bytes)
}

pub struct CooperativeSession {
    source: ResidentSourceWorkbenchV1,
    exact_open: Vec<u8>,
    authoritative: PersistentProcessSessionV1,
    admitted_commands: u64,
}

impl CooperativeSession {
    pub fn open(source: &[u8]) -> Result<Self> {
        let source = ResidentSourceWorkbenchV1::open(source)?;
        let mut request = decode_wasm_process_request_v1(&source.generation().cwr1)?;
        request.authority.budget_units = 10_000;
        let exact_open = encode_wasm_process_request_v1(&request)?;
        let authoritative = open_fresh_persistent_process_session_v1(&exact_open)?;
        Ok(Self {
            source,
            exact_open,
            authoritative,
            admitted_commands: 0,
        })
    }

    pub fn command(
        &mut self,
        connection: u32,
        claimed_player: &str,
        sequence: u32,
        operation: &str,
        x: f64,
        z: f64,
    ) -> Result<Term> {
        let occurrence =
            self.command_occurrence(connection, claimed_player, sequence, operation, x, z)?;
        self.admit(&occurrence)?;
        self.projection()
    }

    fn command_occurrence(
        &self,
        connection: u32,
        claimed_player: &str,
        sequence: u32,
        operation: &str,
        x: f64,
        z: f64,
    ) -> Result<Vec<u8>> {
        Ok(self.source.handler_occurrence(
            b"command",
            &[
                ExecutableValueV1::number(f64::from(connection))?,
                ExecutableValueV1::text(claimed_player)?,
                ExecutableValueV1::number(f64::from(sequence))?,
                ExecutableValueV1::text(operation)?,
                ExecutableValueV1::number(x)?,
                ExecutableValueV1::number(z)?,
            ],
        )?)
    }

    fn admit(&mut self, occurrence: &[u8]) -> Result<()> {
        self.authoritative
            .apply_opaque_input_and_emit_candidate(occurrence)?;
        let authorization = self
            .authoritative
            .issue_candidate_admission_authorization()?;
        self.authoritative
            .admit_issued_candidate_with_projection(authorization)?;
        self.admitted_commands += 1;
        Ok(())
    }

    pub fn projection(&self) -> Result<Term> {
        self.authoritative
            .current_accepted_projection_term()?
            .cloned()
            .ok_or_else(|| "the accepted session has no projection".into())
    }

    /// Attempts the existing checked branch boundary without rewriting a parent
    /// StateRevision or an allocation identity in the host.
    pub fn disconnect_branch(&self, connection: u32) -> Result<ForkedProcessBranchV1> {
        let occurrence = self.source.handler_occurrence(
            b"disconnect-client",
            &[ExecutableValueV1::number(f64::from(connection))?],
        )?;
        let branch = open_fresh_persistent_process_session_v1(&self.exact_open)?;
        Ok(ForkedProcessBranchV1::fork_admitted(
            &self.authoritative,
            branch,
            self.admitted_commands,
            &occurrence,
        )?)
    }

    pub fn disconnect(&mut self, connection: u32) -> Result<DisconnectedClient> {
        let branch = self.disconnect_branch(connection)?;
        let occurrence = self.source.handler_occurrence(
            b"disconnect-client",
            &[ExecutableValueV1::number(f64::from(connection))?],
        )?;
        self.admit(&occurrence)?;
        Ok(DisconnectedClient { connection, branch })
    }

    /// Re-enter exact source commands against the current authoritative world.
    /// The branch candidate remains hidden and is never a state merge input.
    pub fn reconnect(
        &mut self,
        disconnected: &mut DisconnectedClient,
        pending: &[Command],
    ) -> Result<ProcessReconnectAdmissionV1> {
        let mut occurrences = vec![self.source.handler_occurrence(
            b"reconnect-client",
            &[ExecutableValueV1::number(f64::from(
                disconnected.connection,
            ))?],
        )?];
        for command in pending {
            occurrences.push(self.command_occurrence(
                disconnected.connection,
                &command.claimed_player,
                command.sequence,
                &command.operation,
                command.x,
                command.z,
            )?);
        }
        let proposal = disconnected.branch.resume_and_propose(&occurrences)?;
        let plan = CheckedReconnectAdmissionPlanV1 {
            branch_candidate: proposal.candidate,
            authoritative_base: self.authoritative.world_base(),
            occurrences,
        };
        let admitted = disconnected
            .branch
            .adjudicate(&mut self.authoritative, &proposal, &plan)?;
        self.admitted_commands += plan.occurrences.len() as u64;
        Ok(admitted)
    }
}
