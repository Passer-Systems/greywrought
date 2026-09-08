//! Read-only native presentation of the authored forest expedition.
use super::*;

#[derive(Clone, Debug)]
pub struct ForestThreatView {
    pub id: String,
    pub name: String,
    pub position: [f64; 2],
    pub health: f64,
    pub maximum_health: f64,
    pub active: bool,
    pub selected: bool,
    pub current_intent: String,
    pub upcoming_intent: String,
    pub benefit: String,
    pub target: ExecutableReferentV1,
}

#[derive(Clone, Debug)]
pub struct ForestView {
    pub equipment: WorkshopView,
    pub position: [f64; 2],
    pub elevation: f64,
    pub vertical_speed: f64,
    pub potions: f64,
    pub shop_open: bool,
    pub shop_status: String,
    pub potion_price: f64,
    pub potion_healing: f64,
    pub places: Vec<(String, String, [f64; 2])>,
    pub presence: f64,
    pub vitality: f64,
    pub cargo: f64,
    pub stock: f64,
    pub resource_remaining: f64,
    pub carried_relics: f64,
    pub banked_relics: f64,
    pub connected: bool,
    pub threats: Vec<ForestThreatView>,
}

impl ForestView {
    /// Player-facing names for the locations of the authored expedition phases.
    pub fn location_name(&self) -> &str {
        match self.equipment.phase.as_str() {
            "Workshop" | "Returned" => "Hearthstead",
            "Expedition" | "Lost" => "Frostwood",
            phase => phase,
        }
    }
}

pub(super) fn view(projection: &Term) -> Option<ForestView> {
    let workshop = field(projection, "workshop")?;
    field(workshop, "presence")?;
    let location = position(workshop, "position")?;
    let selected = projected_reference(workshop, "selected-threat");
    let threats = fields(projection)
        .filter_map(|(id, subject)| {
            let target = referent(projection, subject, "TargetThreat")?;
            Some(ForestThreatView {
                id,
                name: text_field(subject, "threat-name"),
                position: position(subject, "threat-position")?,
                health: number_field(subject, "enemy-health"),
                maximum_health: number_field(subject, "maximum-enemy-health"),
                active: bool_field(subject, "active-threat"),
                selected: selected.as_ref() == Some(&target),
                current_intent: text_field(subject, "current-intent"),
                upcoming_intent: text_field(subject, "upcoming-intent"),
                benefit: text_field(subject, "obstacle-benefit"),
                target,
            })
        })
        .collect();
    Some(ForestView {
        equipment: workshop_view(projection)?,
        position: location,
        elevation: number_field(workshop, "elevation"),
        vertical_speed: number_field(workshop, "vertical-speed"),
        potions: number_field(workshop, "potions"),
        shop_open: bool_field(workshop, "shop-open"),
        shop_status: text_field(workshop, "shop-status"),
        potion_price: number_field(field(projection, "mara")?, "potion-price"),
        potion_healing: number_field(field(projection, "mara")?, "potion-healing"),
        places: fields(projection)
            .filter_map(|(id, subject)| {
                let location = position(subject, "place-position")?;
                Some((id, text_field(subject, "place-name"), location))
            })
            .collect(),
        presence: number_field(workshop, "presence"),
        vitality: number_field(workshop, "journey-vitality"),
        cargo: number_field(workshop, "cargo"),
        stock: number_field(workshop, "stock"),
        resource_remaining: number_field(workshop, "resource-remaining"),
        carried_relics: number_field(workshop, "carried-relics"),
        banked_relics: number_field(workshop, "banked-relics"),
        connected: bool_field(workshop, "connected"),
        threats,
    })
}

fn position(subject: &Term, role: &str) -> Option<[f64; 2]> {
    let point = field(subject, role)?;
    let coordinate = |axis| {
        let payload = field(point, axis)?.as_atom()?.canonical_payload();
        Some(f64::from_le_bytes(payload.try_into().ok()?))
    };
    Some([coordinate("x")?, coordinate("z")?])
}
