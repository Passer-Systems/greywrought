use super::*;
use std::collections::BTreeSet;

impl Game {
    /// Checks the identities and ranges required to resume a saved journey.
    pub fn validate(&self) -> crate::Result<()> {
        fn unique<'a>(ids: impl Iterator<Item = &'a str>) -> bool {
            let mut seen = BTreeSet::new();
            ids.into_iter().all(|id| !id.is_empty() && seen.insert(id))
        }
        if !matches!(
            self.phase.as_str(),
            "Workshop" | "Returned" | "Expedition" | "Lost"
        ) {
            return Err("Unknown journey phase".into());
        }
        if !(1..=4).contains(&self.party_size) {
            return Err("Invalid company size".into());
        }
        if !unique(self.body_parts.iter().map(|p| p.id.as_str()))
            || !unique(self.components.iter().map(|c| c.id.as_str()))
            || !unique(self.threats.iter().map(|t| t.id.as_str()))
            || !unique(self.places.iter().map(|p| p.id.as_str()))
        {
            return Err("Journey contains empty or duplicate entity identities".into());
        }
        if !self.body_parts.iter().any(|p| p.id == "torso") {
            return Err("Journey is missing the wayfarer's torso".into());
        }
        if !self
            .components
            .iter()
            .any(|c| c.id == self.selected_component)
            || !self.threats.iter().any(|t| t.id == self.selected_threat)
        {
            return Err("Journey selection refers to a missing entity".into());
        }
        for part in &self.body_parts {
            if part.maximum_health <= 0.0 || part.slot_capacity < 0.0 || part.kind.is_empty() {
                return Err(format!("Invalid body part: {}", part.id).into());
            }
        }
        for component in &self.components {
            if !self.components.iter().any(|c| c.id == component.upstream)
                || component
                    .attached_to
                    .as_ref()
                    .is_some_and(|id| !self.body_parts.iter().any(|p| &p.id == id))
            {
                return Err(format!(
                    "Equipment has a missing attachment or connection: {}",
                    component.id
                )
                .into());
            }
        }
        if self
            .threats
            .iter()
            .any(|t| t.intent_stage > 1 || t.maximum_health <= 0.0 || t.intent_remaining <= 0.0)
        {
            return Err("Invalid enemy health or intention timing".into());
        }
        for id in ["nest", "warder", "ritual-guardian"] {
            if !self.threats.iter().any(|t| t.id == id) {
                return Err(format!("Journey is missing threat {id}").into());
            }
        }
        for id in ["frost-cores", "ritual-site", "mara"] {
            if !self.places.iter().any(|p| p.id == id) {
                return Err(format!("Journey is missing place {id}").into());
            }
        }
        if self.tuning.intent_duration <= 0.0
            || self.tuning.action_duration <= 0.0
            || self.tuning.action_duration >= self.tuning.intent_duration
            || self.tuning.gather_yield <= 0.0
        {
            return Err("Invalid journey timing or gathering yield".into());
        }
        Ok(())
    }
}
