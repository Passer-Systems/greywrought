//! Passive developer views of accepted state and the compiler's recorded evidence.
use super::*;
use clause_package::FormationLocalId;
use clause_runtime::{
    ExecutableExpressionV1 as E, ExecutableInterventionChangeV1, ExecutableInterventionQueryV1,
};

#[derive(Clone, Debug)]
pub struct InspectionHandler {
    pub identity: FormationLocalId,
    pub label: String,
}

#[derive(Clone, Debug)]
pub struct Inspection {
    pub generation: WasmSessionHandleV1,
    pub title: String,
    pub lines: Vec<String>,
}

impl NativeSession {
    pub fn inspection_handlers(&self) -> Result<Vec<InspectionHandler>> {
        let mut seen = std::collections::BTreeSet::new();
        Ok(self
            .workbench
            .scalar_effects()?
            .into_iter()
            .filter_map(|effect| {
                seen.insert(effect.handler).then(|| InspectionHandler {
                    identity: effect.handler,
                    label: String::from_utf8_lossy(
                        &self.workbench.exact_source()[effect.handler_origin.start as usize
                            ..effect.handler_origin.end as usize],
                    )
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .trim()
                    .to_string(),
                })
            })
            .collect())
    }

    fn inspect_generation(&self, captured: WasmSessionHandleV1) -> Result<()> {
        if captured != self.workbench.generation().handle {
            return Err("inspection belongs to an earlier source generation; refresh it".into());
        }
        Ok(())
    }

    pub fn inspect_state(&self, captured: WasmSessionHandleV1) -> Result<Inspection> {
        self.inspect_generation(captured)?;
        let projection = self.workbench.project_current_world()?;
        let mut lines = Vec::new();
        state_lines(&projection, "", &mut lines);
        Ok(Inspection {
            generation: captured,
            title: format!("Accepted world at tick {}", self.ticks),
            lines,
        })
    }

    pub fn inspect_handler(
        &self,
        captured: WasmSessionHandleV1,
        handler: FormationLocalId,
    ) -> Result<Inspection> {
        self.inspect_generation(captured)?;
        if self.workbench.recorded_handler_event(handler)?.is_none() {
            return Ok(Inspection {
                generation: captured,
                title: "Recorded action".into(),
                lines: vec!["This action has not occurred in this generation.".into()],
            });
        }
        let explanation = self.workbench.handler_explanation(handler)?;
        Self::explanation_view(captured, explanation)
    }

    pub fn inspect_action(
        &self,
        captured: WasmSessionHandleV1,
        designation: &[u8],
    ) -> Result<Inspection> {
        self.inspect_generation(captured)?;
        Self::explanation_view(captured, self.workbench.explanation(designation)?)
    }

    fn explanation_view(captured: WasmSessionHandleV1, explanation: Term) -> Result<Inspection> {
        let mut lines = vec![
            format!("Step {}", text_field(&explanation, "step")),
            format!(
                "Applied: {}; trace truncated: {}",
                bool_field(&explanation, "rule-applied"),
                bool_field(&explanation, "truncated")
            ),
        ];
        if let Some(states) = field(&explanation, "states") {
            for (slot, state) in fields(states) {
                let relation = field(state, "source")
                    .map(|s| text_field(s, "relation"))
                    .unwrap_or_default();
                if let Some(rows) = field(state, "rows") {
                    for row in index_values(rows) {
                        let before = field(row, "before");
                        let after = field(row, "after");
                        if before != after {
                            lines.push(format!(
                                "{relation} [{}]: {} -> {}",
                                subject_label(&explanation, field(row, "subject")),
                                show(before),
                                show(after)
                            ));
                        }
                    }
                } else if field(state, "before") != field(state, "after") {
                    lines.push(format!(
                        "{relation} (slot {slot}): {} -> {}",
                        show(field(state, "before")),
                        show(field(state, "after"))
                    ));
                }
            }
        }
        if let Some(rules) = field(&explanation, "rules") {
            for (index, rule) in fields(rules) {
                let source = field(rule, "source");
                let origin = source.and_then(|s| field(s, "origin"));
                lines.push(format!(
                    "Rule {index}: {} | {} @ {}..{}",
                    if bool_field(rule, "selected") {
                        "selected"
                    } else {
                        "blocked"
                    },
                    source
                        .map(|s| text_field(s, "designation"))
                        .unwrap_or_default(),
                    origin.map(|s| number_field(s, "start")).unwrap_or_default(),
                    origin.map(|s| number_field(s, "end")).unwrap_or_default()
                ));
                if let Some(premises) = field(rule, "premises") {
                    for (index, premise) in fields(premises) {
                        lines.push(format!(
                            "  Premise {index}: {}",
                            show(field(premise, "value"))
                        ));
                        if let Some(reads) = field(premise, "reads") {
                            for (_, read) in fields(reads) {
                                lines.push(format!(
                                    "    {} [{}] = {}",
                                    text_field(read, "kind"),
                                    show(field(read, "coordinate")),
                                    show(field(read, "value"))
                                ));
                            }
                        }
                    }
                }
            }
        }
        Ok(Inspection {
            generation: captured,
            title: "Recorded action (historical evidence)".into(),
            lines,
        })
    }

    /// One explicit historical alternative, evaluated only by the compiler.
    pub fn inspect_forest_gathering(
        &self,
        captured: WasmSessionHandleV1,
        maximum_evaluations: u32,
    ) -> Result<Inspection> {
        self.inspect_generation(captured)?;
        if !(1..=2).contains(&maximum_evaluations) {
            return Err("forest gathering query permits one or two evaluations".into());
        }
        let recorded = self
            .workbench
            .recorded_event(b"gather-resource")?
            .ok_or("Gather frost cores before asking about the last gathering.")?;
        let event = recorded.step.id;
        let explanation = self.workbench.explanation(b"gather-resource")?;
        let (warder_slot, warder, warder_before, _) =
            explained_numeric_row(&explanation, "enemy-health", "warder")?;
        let (health_slot, torso, before, after) =
            explained_numeric_row(&explanation, "part-health", "torso")?;
        let query = ExecutableInterventionQueryV1 {
            event,
            allowed: vec![ExecutableInterventionChangeV1 {
                slot: warder_slot,
                subject: Some(warder),
                value: ExecutableValueV1::Number(0f64.to_bits()),
            }],
            desired: E::LessThanOrEqual(
                Box::new(E::Constant(ExecutableValueV1::Number(before.to_bits()))),
                Box::new(E::RelationRead(
                    Box::new(E::Slot(health_slot)),
                    Box::new(E::Constant(ExecutableValueV1::Referent(torso.clone()))),
                )),
            ),
            maximum_evaluations,
        };
        let result = self.workbench.intervene(&query)?;
        let mut lines = vec![
            "Would clearing the warder have prevented the last gathering injury?".into(),
            format!(
                "Recorded gather-resource Step {}",
                text_field(&explanation, "step")
            ),
            format!(
                "Only allowed change: warder enemy-health {warder_before} -> 0 in that event's pre-state."
            ),
            format!(
                "Desired: torso part-health after gathering >= its recorded before value ({before})."
            ),
            format!("Observed torso vitality: {before} -> {after}."),
            format!(
                "Bound: {maximum_evaluations} evaluations; finite domain: unchanged state or that one changed row."
            ),
            format!(
                "Evaluations: {}; completed: {}; exhausted: {}",
                result.evaluations, result.completed, result.exhausted
            ),
        ];
        if let Some(solution) = &result.solution {
            lines.push(if solution.is_empty() {
                "The recorded gathering already met the condition; no alternative was needed."
                    .into()
            } else {
                "Yes, the cleared-warder alternative prevents injury in this recorded gathering."
                    .into()
            });
            if let Some(ExecutableValueV1::RelationTable(table)) = result
                .predicted
                .as_ref()
                .and_then(|p| p.get(health_slot as usize))
                .and_then(|s| s.value())
            {
                if let Some(ExecutableValueV1::Number(bits)) =
                    table.rows().get(&torso).and_then(|v| v.iter().next())
                {
                    lines.push(format!(
                        "Predicted torso vitality: {}",
                        f64::from_bits(*bits)
                    ));
                }
            }
        } else if result.completed {
            lines.push("Neither state in this finite domain met the condition; no broader impossibility is established.".into());
        } else {
            lines.push(
                "Evaluation limit reached without a witness; the alternative is unresolved.".into(),
            );
        }
        lines.push(
            "Historical prediction only; live world, source and orders are unchanged.".into(),
        );
        lines.push("This does not evaluate the time, injury or resources needed to clear the warder, or later actions.".into());
        Ok(Inspection {
            generation: captured,
            title: "What if? Gathering without the warder".into(),
            lines,
        })
    }

    /// The browser's finite deselection question, evaluated against the recorded
    /// strike's pre-state. No input, candidate or admission is created here.
    pub fn inspect_survival(
        &self,
        captured: WasmSessionHandleV1,
        target: ExecutableReferentV1,
    ) -> Result<Inspection> {
        self.inspect_generation(captured)?;
        let explanation = self.workbench.explanation(b"party-attack")?;
        let event = self
            .workbench
            .recorded_event(b"party-attack")?
            .ok_or("no recorded strike")?
            .step
            .id;
        let mut allowed = Vec::new();
        let mut vitality = None;
        for (slot, state) in fields(field(&explanation, "states").ok_or("no explained state")?) {
            let slot = slot.parse::<u16>()?;
            let relation = field(state, "source")
                .map(|s| text_field(s, "relation"))
                .unwrap_or_default();
            if relation == "vitality" {
                vitality = Some(slot);
            }
            if relation == "selected" {
                if let Some(rows) = field(state, "rows") {
                    for row in index_values(rows) {
                        if bool_field(row, "before") {
                            allowed.push(ExecutableInterventionChangeV1 {
                                slot,
                                subject: Some(
                                    projected_referent_value_v1(
                                        field(row, "subject").ok_or("missing subject")?,
                                    )?
                                    .ok_or("invalid subject")?,
                                ),
                                value: ExecutableValueV1::Boolean(false),
                            });
                        }
                    }
                }
            }
        }
        let vitality = vitality.ok_or("the recorded action has no vitality outcome")?;
        if allowed.is_empty() {
            return Err("the recorded action has no selected attackers".into());
        }
        let query = ExecutableInterventionQueryV1 {
            event,
            allowed,
            desired: E::GreaterThan(
                Box::new(E::RelationRead(
                    Box::new(E::Slot(vitality)),
                    Box::new(E::Constant(ExecutableValueV1::Referent(target.clone()))),
                )),
                Box::new(E::Constant(ExecutableValueV1::Number(0f64.to_bits()))),
            ),
            maximum_evaluations: 32,
        };
        let result = self.workbench.intervene(&query)?;
        let mut lines = vec![
            "Prediction only: the running world is unchanged.".into(),
            "Could the selected target survive the last strike with fewer attackers?".into(),
            format!(
                "Finite choices: {} Boolean deselections; at most 32 evaluations.",
                query.allowed.len()
            ),
            format!(
                "Evaluations: {}; completed: {}; exhausted: {}",
                result.evaluations, result.completed, result.exhausted
            ),
        ];
        if let Some(changes) = &result.solution {
            lines.push(format!(
                "Found a minimum-cost answer: {} deselections.",
                changes.len()
            ));
            for change in changes {
                lines.push(format!("  {:?} -> false", change.subject));
            }
            if let Some(ExecutableValueV1::RelationTable(table)) = result
                .predicted
                .as_ref()
                .and_then(|p| p.get(vitality as usize))
                .and_then(|s| s.value())
            {
                if let Some(ExecutableValueV1::Number(bits)) = table
                    .rows()
                    .get(&target)
                    .and_then(|values| values.iter().next())
                {
                    lines.push(format!(
                        "Predicted target vitality: {}",
                        f64::from_bits(*bits)
                    ));
                }
            }
        } else if result.completed {
            lines.push("No solution in this finite choice set.".into());
        } else {
            lines.push("Search limit reached; this does not prove impossibility.".into());
        }
        Ok(Inspection {
            generation: captured,
            title: "What if? Last strike".into(),
            lines,
        })
    }
}

fn explained_numeric_row(
    explanation: &Term,
    relation: &str,
    subject: &str,
) -> Result<(u16, ExecutableReferentV1, f64, f64)> {
    let mut found = None;
    for (slot, state) in
        fields(field(explanation, "states").ok_or("recorded event has no state evidence")?)
    {
        if field(state, "source")
            .map(|s| text_field(s, "relation"))
            .as_deref()
            != Some(relation)
        {
            continue;
        }
        let Some(rows) = field(state, "rows") else {
            continue;
        };
        for row in index_values(rows) {
            if subject_label(explanation, field(row, "subject")) != subject {
                continue;
            }
            if found.is_some() {
                return Err("ambiguous recorded source coordinate".into());
            }
            let reference = projected_referent_value_v1(
                field(row, "subject").ok_or("missing recorded subject")?,
            )?
            .ok_or("invalid recorded subject")?;
            let number = |name| -> Result<f64> {
                let atom = field(row, name)
                    .and_then(|t| t.as_atom())
                    .ok_or("missing recorded scalar")?;
                if atom.kind() != b"clause/process-projected-f64-v1" {
                    return Err("recorded state is not numeric".into());
                }
                let value = f64::from_le_bytes(atom.canonical_payload().try_into()?);
                if !value.is_finite() {
                    return Err("recorded state is not finite".into());
                }
                Ok(value)
            };
            found = Some((
                slot.parse()?,
                reference,
                number("before")?,
                number("after")?,
            ));
        }
    }
    found.ok_or_else(||format!("recorded gathering does not expose {subject}.{relation}; this question is unavailable for that event").into())
}

fn index_values(term: &Term) -> impl Iterator<Item = &Term> {
    fields(term).flat_map(|(_, page)| fields(page).map(|(_, value)| value))
}

fn subject_label(explanation: &Term, subject: Option<&Term>) -> String {
    let reference = subject.and_then(|t| projected_referent_value_v1(t).ok().flatten());
    for projection in ["after-projection", "before-projection"] {
        if let Some(projection) = field(explanation, projection) {
            for (id, actor) in fields(projection) {
                let matches = projected_reference(actor, "$referent") == reference
                    && reference.is_some()
                    || field(actor, "$referents").is_some_and(|refs| {
                        fields(refs).any(|(_, r)| {
                            projected_referent_value_v1(r).ok().flatten() == reference
                                && reference.is_some()
                        })
                    });
                if matches {
                    return id;
                }
            }
        }
    }
    show(subject)
}

fn state_lines(term: &Term, prefix: &str, lines: &mut Vec<String>) {
    if term.as_atom().is_some() || projected_referent_value_v1(term).ok().flatten().is_some() {
        lines.push(format!("{prefix}: {}", show(Some(term))));
    } else {
        for (name, value) in fields(term) {
            let name = if prefix.is_empty() {
                name
            } else {
                format!("{prefix}.{name}")
            };
            state_lines(value, &name, lines);
        }
    }
}

fn show(term: Option<&Term>) -> String {
    let Some(term) = term else {
        return "absent".into();
    };
    if let Ok(Some(reference)) = projected_referent_value_v1(term) {
        return format!("{reference:?}");
    }
    if let Some(atom) = term.as_atom() {
        let bytes = atom.canonical_payload();
        return match atom.kind() {
            b"clause/process-projected-f64-v1" => bytes
                .try_into()
                .ok()
                .map(|b| f64::from_bits(u64::from_le_bytes(b)).to_string())
                .unwrap_or_else(|| "invalid number".into()),
            b"clause/process-projected-bool-v1" => (bytes == [1]).to_string(),
            _ => String::from_utf8_lossy(bytes).into_owned(),
        };
    }
    fields(term)
        .map(|(name, value)| format!("{name}: {}", show(Some(value))))
        .collect::<Vec<_>>()
        .join(", ")
}
