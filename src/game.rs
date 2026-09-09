//! Deterministic forest expedition and equipment state.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const STEP_SECONDS: f64 = 0.016;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Command {
    Move { x: f64, z: f64 },
    Jump, Strike, Brace, Gather, Ritual, Interact, CloseShop, BuyPotion, DrinkPotion, Rest,
    TargetThreat(String), PickComponent(String), WireComponent(String), FitComponent(String),
    UnequipComponent, DisconnectComponent, RepairComponent,
    PartySize(u8), ConnectionLost, ConnectionRestored,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThreatPhase { Dormant, Preparation, Action, Recovery, Cleared }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Snapshot { pub forest: ForestView, pub ticks: u64, pub status: String }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ForestThreatView {
    pub id: String, pub name: String, pub position: [f64; 2],
    pub health: f64, pub maximum_health: f64, pub active: bool, pub selected: bool,
    pub current_intent: String, pub upcoming_intent: String, pub benefit: String, pub target: String,
    pub phase: ThreatPhase, pub phase_progress: f64, pub action_sequence: u64,
    pub intent_reach: f64, pub intent_damage: f64,
    pub last_action_hit: bool, pub last_action_target: [f64; 2],
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ForestView {
    pub equipment: EquipmentView, pub position: [f64; 2],
    pub elevation: f64, pub vertical_speed: f64, pub potions: f64,
    pub shop_open: bool, pub shop_status: String, pub potion_price: f64, pub potion_healing: f64,
    pub places: Vec<(String, String, [f64; 2])>,
    pub presence: f64, pub vitality: f64, pub cargo: f64, pub stock: f64,
    pub resource_remaining: f64, pub carried_relics: f64, pub banked_relics: f64,
    pub connected: bool, pub threats: Vec<ForestThreatView>,
}
impl ForestView {
    pub fn location_name(&self) -> &str {
        match self.equipment.phase.as_str() {
            "Workshop" | "Returned" => "Hearthstead", "Expedition" | "Lost" => "Frostwood",
            phase => phase,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EquipmentView {
    pub phase: String, pub report: String, pub fit_report: String,
    pub creature_name: String, pub creature_condition: f64,
    pub body_parts: Vec<BodyPartView>, pub readings: BTreeMap<String, f64>,
    pub components: Vec<ComponentView>, pub doctrines: Vec<DoctrineView>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ComponentView {
    pub id: String, pub label: String, pub mounted: bool, pub powered: bool,
    pub linked: bool, pub selected: bool, pub upstream: Option<String>,
    pub attached_to: Option<String>, pub accepted_kind: Option<String>,
    pub available_fit: Vec<String>, pub pick: String, pub wire: Option<String>,
    pub readings: BTreeMap<String, f64>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BodyPartView {
    pub id: String, pub label: String, pub owner: Option<String>, pub kind: Option<String>,
    pub health: f64, pub maximum_health: f64, pub capacity: f64, pub fit: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DoctrineView {
    pub label: String, pub reference: String, pub selected: bool,
    pub heat_limit: f64, pub reserve_floor: f64,
}

/// Saved game state. Entity references are stable subject names; derived views are not saved.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Game {
    pub ticks: u64, pub status: String,
    pub phase: String, pub position: [f64; 2], pub stock: f64, pub cargo: f64,
    pub report: String, pub fit_report: String, pub selected_component: String,
    pub creature_name: String, pub baseline_speed: f64, pub body_mass: f64, pub retreat_condition: f64,
    pub body_parts: Vec<BodyPart>, pub components: Vec<Component>,
    pub capacity_readings: Capacity,
    pub presence: f64, pub party_size: u8, pub connected: bool,
    pub resource_remaining: f64, pub ritual_called: bool, pub carried_relics: f64, pub banked_relics: f64,
    pub action_cooldown: f64, pub guard_remaining: f64, pub selected_threat: String,
    pub threats: Vec<Threat>, pub places: Vec<Place>,
    pub movement: [f64; 2], pub move_remaining: f64,
    pub elevation: f64, pub vertical_speed: f64, pub potions: f64,
    pub shop_open: bool, pub shop_status: String, pub tuning: Tuning,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BodyPart {
    pub id: String, pub label: String, pub owner: String, pub kind: String,
    pub health: f64, pub maximum_health: f64, pub slot_capacity: f64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Component {
    pub id: String, pub label: String, pub accepted_kind: String, pub attached_to: Option<String>,
    pub linked: bool, pub upstream: String, pub health: f64, pub maximum_health: f64,
    pub mass: f64, pub generation: f64, pub draw: f64, pub thrust: f64,
    pub firepower: f64, pub cooling: f64, pub protection: f64,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Capacity {
    pub mass: f64, pub power: f64, pub drive: f64, pub weapon: f64, pub cooling: f64,
    pub drive_draw: f64, pub weapon_draw: f64, pub cooling_draw: f64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Threat {
    pub id: String, pub name: String, pub position: [f64; 2], pub health: f64, pub maximum_health: f64,
    pub active: bool, pub intent_stage: u8, pub intent_remaining: f64,
    pub intent_preparation: String, pub intent_action: String,
    pub intent_damage: f64, pub intent_noise: f64, pub intent_reach: f64, pub benefit: String,
    pub action_sequence: u64, pub last_action_hit: bool, pub last_action_target: [f64; 2],
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Place { pub id: String, pub name: String, pub position: [f64; 2] }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Tuning {
    pub move_speed: f64, pub gather_yield: f64, pub gather_presence: f64,
    pub gather_cooldown: f64, pub gather_damage: f64, pub resource_per_expedition: f64,
    pub ritual_cost: f64, pub ritual_presence: f64, pub ritual_cooldown: f64,
    pub passive_presence: f64, pub movement_presence: f64, pub party_movement_presence: f64,
    pub strike_presence: f64, pub party_strike_presence: f64, pub base_strike_cooldown: f64,
    pub party_damage: f64, pub relic_damage: f64, pub brace_cooldown: f64,
    pub brace_duration: f64, pub guard_multiplier: f64,
    pub intent_duration: f64, pub action_duration: f64,
    pub jump_speed: f64, pub gravity: f64, pub potion_price: f64, pub potion_healing: f64,
}
