//! Developer journey over the game's checked source and admitted world.
use std::error::Error;

use clause_package::{CanonicalStatePathV1, Term, decode_canonical_term_bytes};
use clause_runtime::{
    ExecutableCanonicalStateBindingV1 as State, ExecutableExpressionV1 as E,
    ExecutableInterventionChangeV1 as Change, ExecutableInterventionQueryV1 as Query,
    ExecutableReadV1 as Read, ExecutableValueV1 as V,
};
use clause_workbench::ResidentSourceWorkbenchV1;
use greywrought_clause::WORLD_SOURCE;

const ACTION: &[u8] = b"apply-damage";
const SOURCE_PATH: &str = "greywrought:src/world/ember-reconnection.clause";

fn field<'a>(term: &'a Term, name: &[u8]) -> Result<&'a Term, Box<dyn Error>> {
    let mut current = term;
    while let Some(triple) = current.as_triple() {
        let [key, value, rest] = triple.slots();
        if key
            .as_atom()
            .is_some_and(|key| key.canonical_payload() == name)
        {
            return Ok(value);
        }
        current = rest;
    }
    Err(format!("missing diagnostic field {}", String::from_utf8_lossy(name)).into())
}

fn number(term: &Term) -> Result<f64, Box<dyn Error>> {
    let bytes = term
        .as_atom()
        .ok_or("expected diagnostic number")?
        .canonical_payload();
    Ok(f64::from_bits(u64::from_le_bytes(bytes.try_into()?)))
}

fn state_name(states: &[State], slot: u16) -> String {
    match states.iter().find(|state| state.slot == slot) {
        Some(binding) => {
            let state = &binding.state;
            let mut name = format!(
                "{} {}",
                String::from_utf8_lossy(&state.subject),
                String::from_utf8_lossy(&state.relation_designation)
            );
            if let CanonicalStatePathV1::Field { designation, .. } = &state.path {
                name.push_str(&format!(".{}", String::from_utf8_lossy(designation)));
            }
            name
        }
        None => format!("slot {slot}"),
    }
}

fn value(value: &V) -> String {
    if let Some(number) = value.as_number() {
        number.to_string()
    } else {
        format!("{value:?}")
    }
}

fn expression(term: &E, states: &[State]) -> String {
    match term {
        E::Slot(slot) => state_name(states, *slot),
        E::Constant(v) => value(v),
        E::Equal(left, right) => format!(
            "{} = {}",
            expression(left, states),
            expression(right, states)
        ),
        other => format!("{other:?}"),
    }
}

fn run(
    w: &mut ResidentSourceWorkbenchV1,
    name: &[u8],
    arguments: &[V],
) -> Result<(), Box<dyn Error>> {
    let occurrence = w.handler_occurrence(name, arguments)?;
    w.run_occurrences_to_candidate(&[occurrence])?;
    w.admit()?;
    Ok(())
}

fn accepted_world(w: &ResidentSourceWorkbenchV1) -> Result<Term, Box<dyn Error>> {
    let projection = w.last_projection().ok_or("no admitted projection")?;
    Ok(decode_canonical_term_bytes(&projection.exact_term_bytes)?)
}

fn explain(w: &ResidentSourceWorkbenchV1, states: &[State]) -> Result<(), Box<dyn Error>> {
    let Some(event) = w.recorded_event(ACTION)? else {
        println!(
            "No recorded attempt: absent evidence says nothing about whether the action could happen."
        );
        return Ok(());
    };
    let explanation = w.explanation(ACTION)?;
    println!(
        "Attempt {:?}: applied={}",
        event.step.id, event.step.rule_applied
    );
    let artifact = field(&explanation, b"artifact")?
        .as_atom()
        .ok_or("missing source artifact")?;
    println!(
        "Evidence artifact: {}",
        std::str::from_utf8(artifact.canonical_payload())?
    );
    for (index, rule) in event.trace.rules.iter().enumerate() {
        let source_rule = field(field(&explanation, b"rules")?, index.to_string().as_bytes())?;
        let origin = field(field(source_rule, b"source")?, b"origin")?;
        let start = number(field(origin, b"start")?)? as usize;
        let end = number(field(origin, b"end")?)? as usize;
        let source = WORLD_SOURCE
            .get(start..end)
            .ok_or("source origin outside checked artifact")?;
        let line = WORLD_SOURCE[..start]
            .iter()
            .filter(|byte| **byte == b'\n')
            .count()
            + 1;
        println!("Rule: {SOURCE_PATH}:{line} (bytes {start}..{end})");
        println!("{}", std::str::from_utf8(source)?);
        for predicate in &rule.predicates {
            println!(
                "  {} -> {}",
                expression(&predicate.expression, states),
                value(&predicate.value)
            );
            for read in &predicate.reads {
                match read {
                    Read::State(slot, v) => {
                        println!("    observed {}: {}", state_name(states, *slot), value(v))
                    }
                    other => println!("    observed {other:?}"),
                }
            }
        }
        for (slot, present) in &rule.required_present {
            if !present {
                println!("  required fact absent: {}", state_name(states, *slot));
            }
        }
        for (slot, absent) in &rule.required_absent {
            if !absent {
                println!(
                    "  required absence contradicted: {}",
                    state_name(states, *slot)
                );
            }
        }
    }
    if event.trace.truncated {
        println!("Evidence truncated; unreported rules remain unknown.");
    }
    println!("Only evaluated conditions are reported; later conditions may have been skipped.");
    Ok(())
}

fn journey() -> Result<(), Box<dyn Error>> {
    let mut w = ResidentSourceWorkbenchV1::open(WORLD_SOURCE)?;
    let states = w.state_bindings()?;
    explain(&w, &states)?;
    let slot =
        |subject: &[u8], relation: &[u8], member: Option<&[u8]>| -> Result<u16, Box<dyn Error>> {
            states
                .iter()
                .find(|binding| {
                    binding.state.subject == subject
                        && binding.state.relation_designation == relation
                        && match (&binding.state.path, member) {
                            (CanonicalStatePathV1::Field { designation, .. }, Some(member)) => {
                                designation == member
                            }
                            (CanonicalStatePathV1::Scalar, None) => true,
                            _ => false,
                        }
                })
                .map(|binding| binding.slot)
                .ok_or_else(|| "missing checked state binding".into())
        };
    let health = slot(b"cinder-wraith", b"vitality", None)?;
    let signal = slot(b"combat-random", b"random-sample", Some(b"z"))?;
    run(&mut w, b"input", &[V::number(0.95)?, V::number(0.0)?])?;
    run(&mut w, ACTION, &[])?;
    let blocked = w
        .recorded_event(ACTION)?
        .ok_or("missing attempted action")?
        .clone();
    assert!(!blocked.step.rule_applied);
    assert_eq!(
        blocked.before[usize::from(health)],
        blocked.after[usize::from(health)]
    );
    assert!(blocked.trace.rules.iter().any(|rule| {
        rule.predicates
            .last()
            .is_some_and(|p| p.value == V::Boolean(false))
    }));
    println!("\nDamage did not happen. The recorded conditions explain why:");
    explain(&w, &states)?;

    let mut query = Query {
        event: blocked.step.id,
        allowed: vec![Change {
            slot: signal,
            subject: None,
            value: V::number(1.0)?,
        }],
        desired: E::GreaterThan(
            Box::new(E::Constant(
                blocked.before[usize::from(health)]
                    .value()
                    .ok_or("missing vitality")?
                    .clone(),
            )),
            Box::new(E::Slot(health)),
        ),
        maximum_evaluations: 1,
    };
    let accepted_before_queries = accepted_world(&w)?;
    let exhausted = w.intervene(&query)?;
    assert!(exhausted.exhausted && !exhausted.completed && exhausted.solution.is_none());
    println!("\nOne evaluation: search exhausted; no conclusion about a possible repair.");
    query.maximum_evaluations = 2;
    let answer = w.intervene(&query)?;
    let changes = answer
        .solution
        .as_ref()
        .ok_or("finite search found no repair")?;
    assert_eq!(changes, &query.allowed);
    println!(
        "Finite repair found after {} evaluations:",
        answer.evaluations
    );
    for change in changes {
        println!(
            "  {}: {}",
            state_name(&states, change.slot),
            value(&change.value)
        );
    }
    assert_eq!(
        w.recorded_event(ACTION)?.unwrap(),
        &blocked,
        "query changed recorded execution"
    );

    query.allowed.clear();
    let impossible = w.intervene(&query)?;
    assert!(impossible.completed && !impossible.exhausted && impossible.solution.is_none());
    println!("With no allowed changes: complete finite search found no repair in that set.");
    query.desired = E::GreaterThan(
        Box::new(E::Constant(V::Boolean(true))),
        Box::new(E::Constant(V::number(0.0)?)),
    );
    match w.intervene(&query) {
        Err(error) => println!(
            "Invalid desired comparison: evaluator failure ({error}); this is not a failed game condition."
        ),
        Ok(_) => return Err("invalid comparison unexpectedly evaluated".into()),
    }
    assert_eq!(
        accepted_world(&w)?,
        accepted_before_queries,
        "queries changed the admitted world"
    );

    run(&mut w, b"input", &[V::number(0.95)?, V::number(1.0)?])?;
    run(&mut w, ACTION, &[])?;
    let succeeded = w
        .recorded_event(ACTION)?
        .ok_or("missing successful attempt")?;
    assert!(succeeded.step.rule_applied);
    let predicted = answer
        .predicted
        .as_ref()
        .ok_or("repair omitted predicted state")?;
    assert_eq!(
        succeeded.after, *predicted,
        "real input/admission disagreed with finite prediction"
    );
    assert_ne!(succeeded.step.id, blocked.step.id);
    let admitted = accepted_world(&w)?;
    assert_eq!(
        number(field(field(&admitted, b"cinder-wraith")?, b"vitality")?)?,
        succeeded.after[usize::from(health)]
            .as_number()
            .ok_or("missing resulting vitality")?
    );
    println!("\nAfter the real input change, damage succeeds:");
    explain(&w, &states)?;
    println!(
        "Cinder-wraith vitality: {} -> {}",
        value(blocked.before[usize::from(health)].value().unwrap()),
        value(succeeded.after[usize::from(health)].value().unwrap())
    );
    println!(
        "PASS: failed condition, bounded queries, real blocker change, admitted success, and source origin agree."
    );
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    journey()
}
