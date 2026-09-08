//! Passive native custody of the compiler's resident world and opaque saves.
use clause_package::Term;
use clause_runtime::{
    ExecutableInputSourceV1, ExecutableKeyPhaseV1, ExecutableReferentV1, ExecutableValueV1,
    WasmSessionHandleV1, WasmSessionPhysicalInputV1, WasmSessionTickV1,
    projected_referent_value_v1,
};
use clause_workbench::ResidentSourceWorkbenchV1;
use std::{collections::BTreeMap, error::Error, fs, io::Write, path::Path};

pub mod forest;
pub mod inspection;
pub use inspection::{Inspection, InspectionHandler};

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
    pub forest: Option<forest::ForestView>,
    pub workshop: Option<WorkshopView>,
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

#[derive(Debug)]
pub struct EditCatalog {
    pub labels: Vec<String>,
    pub expressions: Vec<String>,
    pub handlers: Vec<InspectionHandler>,
}

#[derive(Clone, Debug)]
pub struct ComponentView {
    pub id: String,
    pub label: String,
    pub mounted: bool,
    pub powered: bool,
    pub linked: bool,
    pub selected: bool,
    pub upstream: Option<ExecutableReferentV1>,
    pub attached_to: Option<ExecutableReferentV1>,
    pub accepted_kind: Option<ExecutableReferentV1>,
    pub available_fit: Vec<ExecutableReferentV1>,
    pub pick: ExecutableReferentV1,
    pub wire: Option<ExecutableReferentV1>,
    pub readings: BTreeMap<String, f64>,
}

#[derive(Clone, Debug)]
pub struct BodyPartView {
    pub id: String,
    pub label: String,
    pub owner: Option<ExecutableReferentV1>,
    pub kind: Option<ExecutableReferentV1>,
    pub health: f64,
    pub maximum_health: f64,
    pub capacity: f64,
    pub fit: ExecutableReferentV1,
}

#[derive(Clone, Debug)]
pub struct DoctrineView {
    pub label: String,
    pub reference: ExecutableReferentV1,
    pub selected: bool,
    pub heat_limit: f64,
    pub reserve_floor: f64,
}

#[derive(Clone, Debug)]
pub struct WorkshopView {
    pub phase: String,
    pub report: String,
    pub fit_report: String,
    pub creature_name: String,
    pub creature_condition: f64,
    pub body_parts: Vec<BodyPartView>,
    pub readings: BTreeMap<String, f64>,
    pub components: Vec<ComponentView>,
    pub doctrines: Vec<DoctrineView>,
}

fn projected_reference(subject: &Term, name: &str) -> Option<ExecutableReferentV1> {
    field(subject, name).and_then(|term| projected_referent_value_v1(term).ok().flatten())
}

fn projected_references(term: &Term, output: &mut Vec<ExecutableReferentV1>) {
    if let Some(triple) = term.as_triple() {
        let [left, value, right] = triple.slots();
        if left
            .as_atom()
            .is_some_and(|atom| atom.kind() == b"clause/process-projected-set-v1")
        {
            projected_references(value, output);
            return;
        }
        projected_references(left, output);
        if let Ok(Some(reference)) = projected_referent_value_v1(value) {
            output.push(reference);
        }
        projected_references(right, output);
    }
}

fn workshop_view(projection: &Term) -> Option<WorkshopView> {
    let workshop = field(projection, "workshop")?;
    let selected = projected_reference(workshop, "selected");
    let doctrine = projected_reference(workshop, "doctrine");
    let mut components = Vec::new();
    let mut doctrines = Vec::new();
    let mut body_parts = Vec::new();
    let creature = field(projection, "wayfarer");
    for (id, subject) in fields(projection) {
        if let Some(fit) = referent(projection, subject, "FitComponent") {
            body_parts.push(BodyPartView {
                id: id.clone(),
                label: text_field(subject, "part-label"),
                owner: projected_reference(subject, "part-owner"),
                kind: projected_reference(subject, "part-kind"),
                health: number_field(subject, "part-health"),
                maximum_health: number_field(subject, "max-part-health"),
                capacity: number_field(subject, "slot-capacity"),
                fit,
            });
        }
        if let Some(pick) = referent(projection, subject, "PickComponent") {
            let mut available_fit = Vec::new();
            if let Some(term) = field(subject, "available-fit") {
                projected_references(term, &mut available_fit);
            }
            components.push(ComponentView {
                id,
                label: text_field(subject, "label"),
                mounted: bool_field(subject, "mounted"),
                powered: bool_field(subject, "powered"),
                linked: bool_field(subject, "linked"),
                selected: selected.as_ref() == Some(&pick),
                upstream: projected_reference(subject, "upstream"),
                attached_to: projected_reference(subject, "attached-to"),
                accepted_kind: projected_reference(subject, "accepted-kind"),
                available_fit,
                wire: referent(projection, subject, "WireComponent"),
                pick,
                readings: [
                    "health",
                    "max-health",
                    "mass",
                    "generation",
                    "draw",
                    "thrust",
                    "firepower",
                    "cooling",
                    "protection",
                ]
                .into_iter()
                .map(|key| (key.into(), number_field(subject, key)))
                .collect(),
            });
        }
        if let Some(reference) = referent(projection, subject, "ChooseDoctrine") {
            doctrines.push(DoctrineView {
                label: text_field(subject, "doctrine-label"),
                selected: doctrine.as_ref() == Some(&reference),
                reference,
                heat_limit: number_field(subject, "heat-limit"),
                reserve_floor: number_field(subject, "reserve-floor"),
            });
        }
    }
    Some(WorkshopView {
        phase: text_field(workshop, "phase"),
        report: text_field(workshop, "report"),
        fit_report: text_field(workshop, "fit-report"),
        creature_name: creature
            .map(|subject| text_field(subject, "creature-name"))
            .unwrap_or_default(),
        creature_condition: creature
            .map(|subject| number_field(subject, "creature-condition"))
            .unwrap_or_default(),
        body_parts,
        readings: [
            "position",
            "action",
            "encounter-position",
            "heat",
            "reserve",
            "stock",
            "cargo",
            "threat-health",
            "threat-maximum",
            "objective",
            "total-mass",
            "available-power",
            "drive-power",
            "weapon-power",
            "cooling-power",
        ]
        .into_iter()
        .map(|key| (key.into(), number_field(workshop, key)))
        .collect(),
        components,
        doctrines,
    })
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
        while self.workbench.reclaim_retired() {}
        if self.workbench.generation().handle != captured {
            self.input_sequence = 0;
            self.configuration_revision = 0;
        }
        Ok(())
    }

    pub fn replace_source_items(
        &mut self,
        captured: WasmSessionHandleV1,
        replacements: &[clause_package::CanonicalSourceItemReplacementV1],
    ) -> Result<()> {
        self.workbench
            .replace_source_items(captured, replacements)?;
        while self.workbench.reclaim_retired() {}
        if self.workbench.generation().handle != captured {
            self.input_sequence = 0;
            self.configuration_revision = 0;
        }
        Ok(())
    }

    pub fn edit_catalog(&self) -> Result<EditCatalog> {
        let effects = self.workbench.scalar_effects()?;
        let source = self.workbench.exact_source();
        let newlines = source
            .iter()
            .enumerate()
            .filter_map(|(offset, byte)| (*byte == b'\n').then_some(offset))
            .collect::<Vec<_>>();
        let labels = effects
            .iter()
            .map(|effect| {
                let line = newlines
                    .partition_point(|offset| *offset < effect.expression_origin.start as usize)
                    + 1;
                let handler = String::from_utf8_lossy(
                    &source[effect.handler_origin.start as usize..effect.handler_origin.end as usize],
                );
                format!("{}  |  source line {line}", handler.lines().next().unwrap_or(""))
            })
            .collect();
        let expressions = effects
            .iter()
            .map(|effect| String::from_utf8_lossy(&effect.expression).into_owned())
            .collect();
        Ok(EditCatalog {
            labels,
            expressions,
            handlers: self.inspection_handlers()?,
        })
    }

    pub fn snapshot(&self, tick_millis: u128, status: String) -> Result<Snapshot> {
        let projection = self.workbench.project_current_world()?;
        let referent_inputs = field(&projection, "$referent-inputs");
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
                        referent_with_inputs(referent_inputs, subject, channel)
                            .map(|r| (channel.to_string(), r))
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
            if let Some(reference) = referent_with_inputs(referent_inputs, subject, "Scenario") {
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
        let forest = forest::view(&projection);
        Ok(Snapshot {
            workshop: if forest.is_some() { None } else { workshop_view(&projection) },
            forest,
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
pub fn field<'a>(mut term: &'a Term, name: &str) -> Option<&'a Term> {
    loop {
        let [key, value, rest] = term.as_triple()?.slots();
        if String::from_utf8_lossy(key.as_atom()?.canonical_payload()) == name {
            return Some(value);
        }
        term = rest;
    }
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
    referent_with_inputs(field(projection, "$referent-inputs"), subject, channel)
}
fn referent_with_inputs(
    inputs: Option<&Term>,
    subject: &Term,
    channel: &str,
) -> Option<ExecutableReferentV1> {
    let inputs = inputs?;
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
