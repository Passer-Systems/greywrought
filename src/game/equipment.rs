use super::*;

impl Game {
    pub(super) fn at_home(&self) -> bool {
        matches!(self.phase.as_str(), "Workshop" | "Returned")
    }
    pub(super) fn torso(&self) -> &BodyPart {
        self.body_parts
            .iter()
            .find(|p| p.id == "torso")
            .expect("game has a torso")
    }
    pub(super) fn torso_mut(&mut self) -> &mut BodyPart {
        self.body_parts
            .iter_mut()
            .find(|p| p.id == "torso")
            .expect("game has a torso")
    }
    pub(super) fn mounted(&self, component: &Component) -> bool {
        self.body_parts.iter().any(|part| {
            Some(&part.id) == component.attached_to.as_ref() && part.kind == component.accepted_kind
        })
    }
    pub(super) fn powered_components(&self) -> Vec<bool> {
        let mut powered: Vec<_> = self
            .components
            .iter()
            .map(|c| self.mounted(c) && c.health > 0.0 && c.generation > 0.0)
            .collect();
        loop {
            let mut changed = false;
            for (i, component) in self.components.iter().enumerate() {
                if !powered[i]
                    && self.mounted(component)
                    && component.health > 0.0
                    && component.linked
                    && self
                        .components
                        .iter()
                        .enumerate()
                        .any(|(j, source)| source.id == component.upstream && powered[j])
                {
                    powered[i] = true;
                    changed = true;
                }
            }
            if !changed {
                return powered;
            }
        }
    }
    pub(super) fn available_fit(&self, component: &Component, part: &BodyPart) -> bool {
        self.at_home()
            && component.accepted_kind == part.kind
            && (self
                .components
                .iter()
                .filter(|other| {
                    other.id != component.id && other.attached_to.as_ref() == Some(&part.id)
                })
                .count() as f64)
                < part.slot_capacity
    }
    pub(super) fn capacity(&self) -> Capacity {
        let mut capacity = Capacity::default();
        for (component, powered) in self.components.iter().zip(self.powered_components()) {
            if self.mounted(component) {
                capacity.mass += component.mass;
            }
            if !powered {
                continue;
            }
            capacity.power += component.generation;
            if let Some(part) = self
                .body_parts
                .iter()
                .find(|p| Some(&p.id) == component.attached_to.as_ref())
            {
                capacity.drive += component.thrust * part.health / part.maximum_health;
                capacity.weapon += component.firepower * part.health / part.maximum_health;
            }
            capacity.cooling += component.cooling;
            if component.thrust > 0.0 {
                capacity.drive_draw += component.draw;
            }
            if component.firepower > 0.0 {
                capacity.weapon_draw += component.draw;
            }
            if component.cooling > 0.0 {
                capacity.cooling_draw += component.draw;
            }
        }
        if capacity.power < capacity.drive_draw {
            capacity.drive = 0.0;
        }
        if capacity.power < capacity.weapon_draw {
            capacity.weapon = 0.0;
        }
        if capacity.power < capacity.cooling_draw {
            capacity.cooling = 0.0;
        }
        capacity
    }
    pub(super) fn selected_component_index(&self) -> crate::Result<usize> {
        self.components
            .iter()
            .position(|c| c.id == self.selected_component)
            .ok_or_else(|| "Selected equipment is missing".into())
    }
    pub(super) fn equipment_command(&mut self, command: Command) -> crate::Result<()> {
        match command {
            Command::PickComponent(id) => {
                if !self.components.iter().any(|c| c.id == id) {
                    return Err(format!("Unknown equipment: {id}").into());
                }
                self.selected_component = id;
            }
            Command::FitComponent(id) => {
                let index = self.selected_component_index()?;
                let part = self
                    .body_parts
                    .iter()
                    .find(|p| p.id == id)
                    .ok_or_else(|| format!("Unknown body part: {id}"))?;
                let component = &self.components[index];
                let available = self.available_fit(component, part);
                self.fit_report = if self.phase == "Expedition" {
                    "Return before changing equipment."
                } else if component.accepted_kind != part.kind {
                    "That equipment does not fit this body part."
                } else if available {
                    "Equipment fitted to the selected body part."
                } else {
                    "That body part has no free attachment slot."
                }
                .into();
                if available {
                    self.components[index].attached_to = Some(id);
                }
            }
            Command::WireComponent(id) => {
                if !self.components.iter().any(|c| c.id == id) {
                    return Err(format!("Unknown equipment: {id}").into());
                }
                if self.at_home() {
                    let index = self.selected_component_index()?;
                    self.components[index].upstream = id;
                    self.components[index].linked = true;
                }
            }
            Command::UnequipComponent | Command::DisconnectComponent | Command::RepairComponent => {
                if self.at_home() {
                    let index = self.selected_component_index()?;
                    let component = &mut self.components[index];
                    match command {
                        Command::UnequipComponent => component.attached_to = None,
                        Command::DisconnectComponent => component.linked = false,
                        Command::RepairComponent
                            if component.health < component.maximum_health && self.stock >= 1.0 =>
                        {
                            let repair =
                                (self.stock * 4.0).min(component.maximum_health - component.health);
                            component.health += repair;
                            self.stock -= repair / 4.0;
                        }
                        _ => {}
                    }
                }
            }
            Command::Rest if self.at_home() => {
                for part in &mut self.body_parts {
                    part.health = part.maximum_health;
                }
            }
            _ => {}
        }
        Ok(())
    }
}
