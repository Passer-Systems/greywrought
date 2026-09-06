//! Passive native custody of the compiler's resident world and opaque saves.
use clause_package::Term;
use clause_runtime::{
    ExecutableInputSourceV1, ExecutableKeyPhaseV1, ExecutableReferentV1, ExecutableValueV1,
    WasmSessionHandleV1, WasmSessionPhysicalInputV1, WasmSessionTickV1,
    projected_referent_value_v1,
};
use clause_workbench::ResidentSourceWorkbenchV1;
use std::{collections::BTreeMap, error::Error, fs, io::Write, path::Path};

pub type Result<T> = std::result::Result<T, Box<dyn Error + Send + Sync>>;

#[derive(Clone, Debug)]
pub struct ActorView {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub position: [f32; 3],
    pub selected: bool,
    pub moving: bool,
    pub alive: bool,
    pub vitality: f64,
    pub maximum_vitality: f64,
    pub references: BTreeMap<String, ExecutableReferentV1>,
}

#[derive(Clone, Debug)]
pub struct Snapshot {
    pub generation: WasmSessionHandleV1,
    pub actors: Vec<ActorView>,
    pub scenarios: Vec<(String, String, ExecutableReferentV1)>,
    pub obstacles: Vec<(String, [f32; 3], f32)>,
    pub selected_target: Option<ExecutableReferentV1>,
    pub message: String,
    pub ticks: u64,
    pub tick_millis: u128,
    pub status: String,
}

pub struct NativeSession {
    pub workbench: ResidentSourceWorkbenchV1,
    input_sequence: u64,
    configuration_revision: u64,
    pub ticks: u64,
}

impl NativeSession {
    pub fn open(source: &[u8]) -> Result<Self> {
        Ok(Self {
            workbench: ResidentSourceWorkbenchV1::open_continuous(source)?,
            input_sequence: 0,
            configuration_revision: 0,
            ticks: 0,
        })
    }

    pub fn load(path: &Path, initial_source: &[u8]) -> Result<Self> {
        let bytes = match fs::read(path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Self::open(initial_source);
            }
            Err(error) => return Err(error.into()),
        };
        // This envelope frames exact compiler artifacts; all world serialization
        // and validation belongs to Clause's checkpoint/reopen operation.
        if bytes.len() < 32 || &bytes[..8] != b"GWCP0001" {
            return Err("unrecognized save file".into());
        }
        let count = u64::from_le_bytes(bytes[8..16].try_into()?) as usize;
        let input_sequence = u64::from_le_bytes(bytes[16..24].try_into()?);
        let configuration_revision = u64::from_le_bytes(bytes[24..32].try_into()?);
        let end = 32usize
            .checked_add(count)
            .filter(|end| *end <= bytes.len())
            .ok_or("truncated save")?;
        let workbench = ResidentSourceWorkbenchV1::reopen(&bytes[32..end], &bytes[end..])?;
        Ok(Self {
            workbench,
            input_sequence,
            configuration_revision,
            ticks: 0,
        })
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        let checkpoint = self.workbench.checkpoint_admitted()?;
        let source = self.workbench.exact_source();
        let parent = path.parent().ok_or("save path has no parent")?;
        fs::create_dir_all(parent)?;
        let pending = path.with_extension(format!("pending-{}", std::process::id()));
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&pending)?;
        file.write_all(b"GWCP0001")?;
        file.write_all(&(source.len() as u64).to_le_bytes())?;
        file.write_all(&self.input_sequence.to_le_bytes())?;
        file.write_all(&self.configuration_revision.to_le_bytes())?;
        file.write_all(source)?;
        file.write_all(&checkpoint)?;
        file.sync_all()?;
        fs::rename(pending, path)?;
        fs::File::open(parent)?.sync_all()?;
        Ok(())
    }

    pub fn input(
        &mut self,
        captured: WasmSessionHandleV1,
        source: ExecutableInputSourceV1,
        value: Option<ExecutableValueV1>,
    ) -> Result<()> {
        self.input_sequence += 1;
        self.workbench.apply_physical_input(
            captured,
            WasmSessionPhysicalInputV1 {
                input_sequence: self.input_sequence,
                source,
                value,
            },
        )?;
        Ok(())
    }

    pub fn tick(&mut self) -> Result<()> {
        self.configuration_revision += 1;
        self.workbench.tick_to_candidate(WasmSessionTickV1 {
            configuration_revision: self.configuration_revision,
            fixed_tick_milliseconds: 16,
        })?;
        self.workbench.admit()?;
        self.ticks += 1;
        Ok(())
    }

    pub fn edit(
        &mut self,
        captured: WasmSessionHandleV1,
        index: usize,
        replacement: &[u8],
    ) -> Result<()> {
        let effects = self.workbench.scalar_effects()?;
        let effect = effects.get(index).ok_or("unknown offered expression")?;
        self.workbench
            .edit_scalar_effect(captured, effect, replacement)?;
        if self.workbench.generation().handle != captured {
            self.input_sequence = 0;
            self.configuration_revision = 0;
        }
        Ok(())
    }

    pub fn snapshot(&self, tick_millis: u128, status: String) -> Result<Snapshot> {
        let projection = self.workbench.project_current_world()?;
        let mut actors = Vec::new();
        let mut scenarios = Vec::new();
        let mut obstacles = Vec::new();
        let scenario = field(&projection, "encounter")
            .and_then(|s| field(s, "encounter-scenario"))
            .and_then(|t| projected_referent_value_v1(t).ok().flatten());
        for (id, subject) in fields(&projection) {
            if let Some(position) = field(subject, "obstacle-position") {
                obstacles.push((
                    id.clone(),
                    ["x", "y", "z"].map(|axis| number_field(position, axis) as f32),
                    number_field(subject, "obstacle-radius") as f32,
                ));
            }
            if let Some(position) = field(subject, "actor-position") {
                let actor_scenario = field(subject, "actor-scenario")
                    .and_then(|t| projected_referent_value_v1(t).ok().flatten());
                if actor_scenario.is_some() && actor_scenario != scenario {
                    continue;
                }
                let references = ["Pick", "TogglePick", "Target"]
                    .into_iter()
                    .filter_map(|channel| {
                        referent(&projection, subject, channel).map(|r| (channel.to_string(), r))
                    })
                    .collect();
                actors.push(ActorView {
                    id: id.clone(),
                    name: text_field(subject, "actor-name"),
                    kind: text_field(subject, "presentation-kind"),
                    position: ["x", "y", "z"].map(|axis| number_field(position, axis) as f32),
                    selected: bool_field(subject, "selected"),
                    moving: bool_field(subject, "moving"),
                    alive: bool_field(subject, "alive"),
                    vitality: number_field(subject, "vitality"),
                    maximum_vitality: number_field(subject, "maximum-vitality"),
                    references,
                });
            }
            if let Some(reference) = referent(&projection, subject, "Scenario") {
                scenarios.push((id, text_field(subject, "scenario-name"), reference));
            }
        }
        let selected_target = field(&projection, "player-1")
            .and_then(|s| field(s, "chosen-target"))
            .and_then(|t| projected_referent_value_v1(t).ok().flatten());
        let state = field(&projection, "encounter")
            .and_then(|s| field(s, "encounter-state"))
            .and_then(|t| projected_referent_value_v1(t).ok().flatten());
        let message = fields(&projection)
            .find_map(|(_, subject)| {
                let reference = field(subject, "$referent")
                    .and_then(|t| projected_referent_value_v1(t).ok().flatten());
                let facet_matches = field(subject, "$referents").is_some_and(|facets| {
                    fields(facets).any(|(_, value)| {
                        projected_referent_value_v1(value).ok().flatten() == state
                    })
                });
                if state.is_some() && (reference == state || facet_matches) {
                    Some(text_field(subject, "state-message"))
                } else {
                    None
                }
            })
            .unwrap_or_default();
        Ok(Snapshot {
            generation: self.workbench.generation().handle,
            actors,
            scenarios,
            obstacles,
            selected_target,
            message,
            ticks: self.ticks,
            tick_millis,
            status,
        })
    }
}

pub fn key(code: &str) -> (ExecutableInputSourceV1, Option<ExecutableValueV1>) {
    (
        ExecutableInputSourceV1::Keyboard {
            code: code.as_bytes().to_vec(),
            phase: ExecutableKeyPhaseV1::Down,
        },
        None,
    )
}
pub fn scalar(channel: &str, value: f64) -> (ExecutableInputSourceV1, Option<ExecutableValueV1>) {
    (
        ExecutableInputSourceV1::Scalar {
            channel: channel.as_bytes().to_vec(),
        },
        Some(ExecutableValueV1::Number(value.to_bits())),
    )
}
pub fn reference(
    channel: &str,
    value: ExecutableReferentV1,
) -> (ExecutableInputSourceV1, Option<ExecutableValueV1>) {
    (
        ExecutableInputSourceV1::Referent {
            channel: channel.as_bytes().to_vec(),
        },
        Some(ExecutableValueV1::Referent(value)),
    )
}
pub fn fields(mut term: &Term) -> impl Iterator<Item = (String, &Term)> {
    std::iter::from_fn(move || {
        let [name, value, rest] = term.as_triple()?.slots();
        term = rest;
        Some((
            String::from_utf8_lossy(name.as_atom()?.canonical_payload()).into_owned(),
            value,
        ))
    })
}
pub fn field<'a>(term: &'a Term, name: &str) -> Option<&'a Term> {
    fields(term).find_map(|(key, value)| (key == name).then_some(value))
}
pub fn number_field(term: &Term, name: &str) -> f64 {
    field(term, name)
        .and_then(|t| t.as_atom())
        .and_then(|a| a.canonical_payload().try_into().ok())
        .map(|b| f64::from_bits(u64::from_le_bytes(b)))
        .unwrap_or(0.0)
}
fn text_field(term: &Term, name: &str) -> String {
    field(term, name)
        .and_then(|t| t.as_atom())
        .map(|a| String::from_utf8_lossy(a.canonical_payload()).into_owned())
        .unwrap_or_default()
}
fn bool_field(term: &Term, name: &str) -> bool {
    field(term, name)
        .and_then(|t| t.as_atom())
        .is_some_and(|a| a.canonical_payload() == [1])
}
fn referent(projection: &Term, subject: &Term, channel: &str) -> Option<ExecutableReferentV1> {
    let inputs = field(projection, "$referent-inputs")?;
    field(inputs, channel)?;
    let domain = number_field(inputs, channel) as u32;
    let term = if let Some(facets) = field(subject, "$referents") {
        field(facets, &domain.to_string())?
    } else {
        field(subject, "$referent")?
    };
    let reference = projected_referent_value_v1(term).ok().flatten()?;
    (reference.domain() == domain).then_some(reference)
}
