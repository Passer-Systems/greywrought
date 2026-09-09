use super::*;

impl Game {
    pub fn snapshot(&self) -> Snapshot {
        let powered = self.powered_components();
        let components = self
            .components
            .iter()
            .zip(powered)
            .map(|(c, powered)| ComponentView {
                id: c.id.clone(),
                label: c.label.clone(),
                mounted: self.mounted(c),
                powered,
                linked: c.linked,
                selected: c.id == self.selected_component,
                upstream: Some(c.upstream.clone()),
                attached_to: c.attached_to.clone(),
                accepted_kind: Some(c.accepted_kind.clone()),
                available_fit: self
                    .body_parts
                    .iter()
                    .filter(|p| self.available_fit(c, p))
                    .map(|p| p.id.clone())
                    .collect(),
                pick: c.id.clone(),
                wire: Some(c.id.clone()),
                readings: [
                    ("health", c.health),
                    ("max-health", c.maximum_health),
                    ("mass", c.mass),
                    ("generation", c.generation),
                    ("draw", c.draw),
                    ("thrust", c.thrust),
                    ("firepower", c.firepower),
                    ("cooling", c.cooling),
                    ("protection", c.protection),
                ]
                .into_iter()
                .map(|(k, v)| (k.into(), v))
                .collect(),
            })
            .collect();
        let body_parts = self
            .body_parts
            .iter()
            .map(|p| BodyPartView {
                id: p.id.clone(),
                label: p.label.clone(),
                owner: Some(p.owner.clone()),
                kind: Some(p.kind.clone()),
                health: p.health,
                maximum_health: p.maximum_health,
                capacity: p.slot_capacity,
                fit: p.id.clone(),
            })
            .collect();
        let maximum: f64 = self
            .body_parts
            .iter()
            .filter(|p| p.owner == "wayfarer")
            .map(|p| p.maximum_health)
            .sum();
        let health: f64 = self
            .body_parts
            .iter()
            .filter(|p| p.owner == "wayfarer")
            .map(|p| p.health)
            .sum();
        let c = self.capacity_readings;
        let equipment = EquipmentView {
            phase: self.phase.clone(),
            report: self.report.clone(),
            fit_report: self.fit_report.clone(),
            creature_name: self.creature_name.clone(),
            creature_condition: if maximum > 0.0 {
                100.0 * health / maximum
            } else {
                0.0
            },
            body_parts,
            components,
            doctrines: Vec::new(),
            readings: [
                ("stock", self.stock),
                ("cargo", self.cargo),
                ("total-mass", c.mass),
                ("available-power", c.power),
                ("drive-power", c.drive),
                ("weapon-power", c.weapon),
                ("cooling-power", c.cooling),
                ("action-cooldown", self.action_cooldown),
                ("guard-remaining", self.guard_remaining),
            ]
            .into_iter()
            .map(|(k, v)| (k.into(), v))
            .collect(),
        };
        let threats = self
            .threats
            .iter()
            .map(|t| {
                let elapsed = (self.tuning.intent_duration - t.intent_remaining).max(0.0);
                let (phase, progress) = if !t.active {
                    (ThreatPhase::Dormant, 0.0)
                } else if t.health <= 0.0 {
                    (ThreatPhase::Cleared, 1.0)
                } else if t.intent_stage == 0 {
                    (
                        ThreatPhase::Preparation,
                        elapsed / self.tuning.intent_duration,
                    )
                } else if elapsed < self.tuning.action_duration {
                    (ThreatPhase::Action, elapsed / self.tuning.action_duration)
                } else {
                    (
                        ThreatPhase::Recovery,
                        (elapsed - self.tuning.action_duration)
                            / (self.tuning.intent_duration - self.tuning.action_duration),
                    )
                };
                ForestThreatView {
                    id: t.id.clone(),
                    name: t.name.clone(),
                    position: t.position,
                    health: t.health,
                    maximum_health: t.maximum_health,
                    active: t.active,
                    selected: t.id == self.selected_threat,
                    current_intent: if !t.active {
                        "Dormant until called"
                    } else if t.health <= 0.0 {
                        "Cleared"
                    } else if t.intent_stage == 0 {
                        &t.intent_preparation
                    } else {
                        &t.intent_action
                    }
                    .into(),
                    upcoming_intent: if !t.active {
                        "Offer six frost cores at the deep grove"
                    } else if t.health <= 0.0 {
                        "Route remains clear"
                    } else if t.intent_stage == 0 {
                        &t.intent_action
                    } else {
                        &t.intent_preparation
                    }
                    .into(),
                    benefit: t.benefit.clone(),
                    target: t.id.clone(),
                    phase,
                    phase_progress: progress.clamp(0.0, 1.0),
                    action_sequence: t.action_sequence,
                    intent_reach: t.intent_reach,
                    intent_damage: t.intent_damage,
                    last_action_hit: t.last_action_hit,
                    last_action_target: t.last_action_target,
                }
            })
            .collect();
        Snapshot {
            ticks: self.ticks,
            status: self.status.clone(),
            forest: ForestView {
                equipment,
                position: self.position,
                elevation: self.elevation,
                vertical_speed: self.vertical_speed,
                potions: self.potions,
                shop_open: self.shop_open,
                shop_status: self.shop_status.clone(),
                potion_price: self.tuning.potion_price,
                potion_healing: self.tuning.potion_healing,
                places: self
                    .places
                    .iter()
                    .map(|p| (p.id.clone(), p.name.clone(), p.position))
                    .collect(),
                presence: self.presence,
                vitality: self.torso().health,
                cargo: self.cargo,
                stock: self.stock,
                resource_remaining: self.resource_remaining,
                carried_relics: self.carried_relics,
                banked_relics: self.banked_relics,
                connected: self.connected,
                threats,
            },
        }
    }
}
