//! Passive Clause session custody for the native cooperative transport.
use clause_package::Term;
use clause_runtime::{
    ExecutableValueV1, ForkedProcessBranchV1, PersistentProcessSessionV1,
    decode_wasm_process_request_v1, encode_wasm_process_request_v1,
    open_fresh_persistent_process_session_v1,
};
use clause_workbench::ResidentSourceWorkbenchV1;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

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
        let occurrence = self.source.handler_occurrence(
            b"command",
            &[
                ExecutableValueV1::number(f64::from(connection))?,
                ExecutableValueV1::text(claimed_player)?,
                ExecutableValueV1::number(f64::from(sequence))?,
                ExecutableValueV1::text(operation)?,
                ExecutableValueV1::number(x)?,
                ExecutableValueV1::number(z)?,
            ],
        )?;
        self.authoritative
            .apply_opaque_input_and_emit_candidate(&occurrence)?;
        let authorization = self
            .authoritative
            .issue_candidate_admission_authorization()?;
        self.authoritative
            .admit_issued_candidate_with_projection(authorization)?;
        self.admitted_commands += 1;
        self.projection()
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
        Ok(ForkedProcessBranchV1::fork(
            &self.authoritative,
            branch,
            self.admitted_commands,
            &occurrence,
        )?)
    }
}
