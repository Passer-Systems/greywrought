use super::*;

fn distance_squared(a: [f64; 2], b: [f64; 2]) -> f64 {
    (a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)
}
fn countdown(value: f64) -> f64 {
    (value - STEP_SECONDS).max(0.0)
}

impl Game {
    fn living_connected(&self) -> bool {
        self.connected && self.torso().health > 0.0
    }
    fn ready_in_forest(&self) -> bool {
        self.phase == "Expedition" && self.living_connected() && self.action_cooldown <= 0.0
    }
    fn near_place(&self, id: &str, range_squared: f64) -> bool {
        self.places
            .iter()
            .any(|p| p.id == id && distance_squared(self.position, p.position) <= range_squared)
    }
    /// Applies one input before the next fixed step. Unavailable actions leave gameplay unchanged.
    /// Returns an error for unknown entity IDs or non-finite movement values.
    pub fn command(&mut self, command: Command) -> crate::Result<()> {
        match command {
            Command::Move { x, z } => {
                if !x.is_finite() || !z.is_finite() {
                    return Err("Movement must be finite".into());
                }
                self.movement = [x.clamp(-1.0, 1.0), z.clamp(-1.0, 1.0)];
                self.move_remaining = 0.25;
            }
            Command::ConnectionLost => self.connected = false,
            Command::ConnectionRestored => self.connected = true,
            Command::PartySize(size) => {
                if self.at_home() && (1..=4).contains(&size) {
                    self.party_size = size;
                }
            }
            Command::TargetThreat(id) => {
                if !self.threats.iter().any(|t| t.id == id) {
                    return Err(format!("Unknown threat: {id}").into());
                }
                if self.connected {
                    self.selected_threat = id;
                }
            }
            Command::Strike if self.ready_in_forest() => {
                let capacity = self.capacity();
                if capacity.weapon > 0.0 {
                    if let Some(target) = self.threats.iter_mut().find(|t| {
                        t.id == self.selected_threat
                            && t.active
                            && t.health > 0.0
                            && distance_squared(self.position, t.position) <= 12.25
                    }) {
                        target.health -= capacity.weapon
                            + self.tuning.party_damage * (f64::from(self.party_size) - 1.0)
                            + self.tuning.relic_damage * self.banked_relics;
                        self.action_cooldown =
                            self.tuning.base_strike_cooldown / (1.0 + capacity.cooling / 20.0);
                        self.presence += self.tuning.strike_presence
                            + self.tuning.party_strike_presence
                                * (f64::from(self.party_size) - 1.0);
                    }
                }
            }
            Command::Brace if self.ready_in_forest() => {
                self.action_cooldown = self.tuning.brace_cooldown;
                self.guard_remaining = self.tuning.brace_duration;
            }
            Command::Gather
                if self.ready_in_forest()
                    && self.near_place("frost-cores", 9.0)
                    && self.resource_remaining >= self.tuning.gather_yield =>
            {
                self.resource_remaining -= self.tuning.gather_yield;
                self.cargo += self.tuning.gather_yield;
                self.presence += self.tuning.gather_presence;
                self.action_cooldown = self.tuning.gather_cooldown;
                self.report = if self.tuning.gather_yield == 3.0 {
                    "Three frost cores gathered. They are yours only if you return alive.".into()
                } else {
                    format!(
                        "{} frost cores gathered. They are yours only if you return alive.",
                        self.tuning.gather_yield
                    )
                };
                if self
                    .threats
                    .iter()
                    .any(|t| t.id == "warder" && t.health > 0.0)
                {
                    let damage = self.tuning.gather_damage
                        * if self.guard_remaining > 0.0 {
                            self.tuning.guard_multiplier
                        } else {
                            1.0
                        };
                    self.torso_mut().health -= damage;
                }
            }
            Command::Ritual
                if self.ready_in_forest()
                    && self.near_place("ritual-site", 9.0)
                    && self.cargo >= self.tuning.ritual_cost
                    && !self.ritual_called =>
            {
                if let Some(guardian) = self
                    .threats
                    .iter_mut()
                    .find(|t| t.id == "ritual-guardian" && !t.active)
                {
                    guardian.active = true;
                    self.cargo -= self.tuning.ritual_cost;
                    self.ritual_called = true;
                    self.action_cooldown = self.tuning.ritual_cooldown;
                    self.presence += self.tuning.ritual_presence;
                    self.report = if self.tuning.ritual_cost == 6.0 {
                        "Six cores offered. The frost guardian answers; its relic still has to be carried home.".into()
                    } else {
                        format!(
                            "{} cores offered. The frost guardian answers; its relic still has to be carried home.",
                            self.tuning.ritual_cost
                        )
                    };
                }
            }
            Command::Jump
                if self.living_connected()
                    && self.elevation == 0.0
                    && self.vertical_speed == 0.0 =>
            {
                self.vertical_speed = self.tuning.jump_speed;
            }
            Command::Interact if self.living_connected() => {
                self.shop_open = self.near_place("mara", 6.25);
                self.shop_status = if self.shop_open {
                    "Mara: A little preparation goes a long way."
                } else {
                    "Approach Mara beside the Hearthstead road to trade."
                }
                .into();
            }
            Command::CloseShop => self.shop_open = false,
            Command::BuyPotion if self.living_connected() && self.shop_open => {
                self.shop_status = if !self.near_place("mara", 6.25) {
                    "You are too far from Mara. Move closer to buy."
                } else if self.stock < self.tuning.potion_price {
                    "Not enough supplies for a health potion."
                } else {
                    self.stock -= self.tuning.potion_price;
                    self.potions += 1.0;
                    "Health potion purchased. Press H to drink when hurt."
                }
                .into();
            }
            Command::DrinkPotion if self.living_connected() => {
                self.shop_status = if self.torso().health >= self.torso().maximum_health {
                    "Your health is already full. Potion kept."
                } else if self.potions < 1.0 {
                    "No health potions. Visit Mara in Hearthstead."
                } else {
                    self.torso_mut().health = (self.torso().health + self.tuning.potion_healing)
                        .clamp(0.0, self.torso().maximum_health);
                    self.potions -= 1.0;
                    "You drink a health potion and recover health."
                }
                .into();
            }
            equipment => self.equipment_command(equipment)?,
        }
        Ok(())
    }

    /// Advances exactly 16 ms. Rules read the state at the start of the step, so simultaneous
    /// attacks share presence/guard values and a fatal hit resolves death on the following step.
    pub fn tick(&mut self) -> crate::Result<()> {
        let dt = STEP_SECONDS;
        let living = self.torso().health > 0.0;
        let expedition = self.phase == "Expedition";
        let entering = self.at_home() && self.connected && living && self.position[1] >= 2.0;
        let returning = expedition && self.connected && living && self.position[1] <= 0.0;
        let losing = expedition && !living;
        let active = expedition && self.connected && living;
        let position = self.position;
        let moving =
            self.move_remaining > 0.0 && (self.movement[0] != 0.0 || self.movement[1] != 0.0);
        let capacity = self.capacity();
        let presence = self.presence;
        let guard = self.guard_remaining;
        let protection: f64 = self
            .components
            .iter()
            .filter(|c| {
                c.attached_to.as_deref() == Some("torso") && self.mounted(c) && c.health > 0.0
            })
            .map(|c| c.protection)
            .sum();
        let nest_alive = self
            .threats
            .iter()
            .any(|t| t.id == "nest" && t.health > 0.0);
        let won_relic = active
            && self.ritual_called
            && self.carried_relics == 0.0
            && self
                .threats
                .iter()
                .any(|t| t.id == "ritual-guardian" && t.health <= 0.0);

        if self.phase != "Lost" && self.connected && living && moving {
            let length = self.movement[0].hypot(self.movement[1]).clamp(1.0, 2.0);
            let next = [
                (position[0] + self.movement[0] * self.tuning.move_speed * dt / length)
                    .clamp(-12.0, 12.0),
                (position[1] + self.movement[1] * self.tuning.move_speed * dt / length)
                    .clamp(-14.0, 45.0),
            ];
            let gate_blocked = (-0.5..=4.0).contains(&next[1]) && next[0] * next[0] > 9.0;
            let nest_blocked = (18.0..=24.0).contains(&next[1]) && nest_alive && next[0] > 2.0;
            if !gate_blocked && !nest_blocked {
                self.position = next;
            }
        }
        if self.move_remaining > 0.0 {
            self.move_remaining = countdown(self.move_remaining);
        }
        if self.connected {
            if self.action_cooldown > 0.0 {
                self.action_cooldown = countdown(self.action_cooldown);
            }
            if self.guard_remaining > 0.0 {
                self.guard_remaining = countdown(self.guard_remaining);
            }
            if self.elevation > 0.0 || self.vertical_speed > 0.0 {
                let height =
                    self.elevation + self.vertical_speed * dt - self.tuning.gravity * 0.5 * dt * dt;
                self.elevation = height.max(0.0);
                self.vertical_speed = if height > 0.0 {
                    self.vertical_speed - self.tuning.gravity * dt
                } else {
                    0.0
                };
            }
        }
        self.capacity_readings = capacity;
        if active {
            self.presence += self.tuning.passive_presence * dt;
            if moving {
                self.presence += (self.tuning.movement_presence
                    + self.tuning.party_movement_presence * (f64::from(self.party_size) - 1.0))
                    * dt;
            }
            let mut damage = 0.0;
            for threat in &mut self.threats {
                if !threat.active || threat.health <= 0.0 {
                    continue;
                }
                if threat.intent_remaining > dt {
                    threat.intent_remaining -= dt;
                } else {
                    let acts = threat.intent_stage == 0;
                    threat.intent_remaining = self.tuning.intent_duration;
                    threat.intent_stage = if acts { 1 } else { 0 };
                    if acts {
                        threat.action_sequence += 1;
                        threat.last_action_target = position;
                        threat.last_action_hit = position[1] > 0.0
                            && distance_squared(position, threat.position)
                                <= threat.intent_reach * threat.intent_reach;
                        if threat.last_action_hit {
                            damage += threat.intent_damage
                                * (1.0 + presence / 100.0)
                                * if guard > 0.0 {
                                    self.tuning.guard_multiplier
                                } else {
                                    1.0
                                }
                                / (1.0 + protection * 0.1);
                            self.presence += threat.intent_noise;
                        }
                    }
                }
            }
            self.torso_mut().health -= damage;
        }
        if entering {
            self.phase = "Expedition".into();
            self.cargo = 0.0;
            self.presence = 0.0;
            self.report = "The forest is listening. Frost cores wait near the lookout; Hearthstead lies behind you.".into();
            self.resource_remaining = self.tuning.resource_per_expedition;
            self.ritual_called = false;
            self.carried_relics = 0.0;
            for threat in &mut self.threats {
                threat.health = threat.maximum_health;
                threat.active = threat.id != "ritual-guardian";
                threat.intent_stage = 0;
                threat.intent_remaining = self.tuning.intent_duration;
                threat.last_action_hit = false;
            }
        }
        if returning {
            self.phase = "Returned".into();
            self.stock += self.cargo;
            self.banked_relics += self.carried_relics;
            self.cargo = 0.0;
            self.carried_relics = 0.0;
            self.report = "Safe at Hearthstead. Extracted cores and relics are secured.".into();
        }
        if won_relic {
            self.carried_relics = 1.0;
            self.report =
                "The frost relic is in your pack. Reach Hearthstead alive to keep it.".into();
        }
        if losing {
            self.phase = "Lost".into();
            self.cargo = 0.0;
            self.stock = 0.0;
            self.carried_relics = 0.0;
            self.banked_relics = 0.0;
            self.report =
                "The wayfarer is lost. Equipment, carried rewards and personal stores are gone."
                    .into();
            for component in &mut self.components {
                component.health = 0.0;
            }
            for part in &mut self.body_parts {
                part.health = 0.0;
            }
        }
        self.ticks += 1;
        Ok(())
    }
}
