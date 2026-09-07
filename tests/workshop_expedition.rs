use clause_package::Term;
use clause_runtime::{
    ExecutableInputSourceV1, ExecutableKeyPhaseV1, ExecutableValueV1, projected_referent_value_v1,
};
use greywrought_clause::native::{NativeSession, field};
use std::time::Instant;

const SOURCE: &[u8] = include_bytes!("../src/world/workshop-expedition.clause");

#[test]
fn encounter_unavailable_weapon_returns_without_reapproaching() {
    let started = Instant::now();
    let source = std::str::from_utf8(SOURCE)
        .unwrap()
        .replace("  phase: \"Workshop\"\n", "  phase: \"Expedition\"\n")
        .replace("  position: 0.0\n", "  position: 8.0\n")
        .replace("  firepower: 9.0\n", "  firepower: 0.0\n");
    let mut session = NativeSession::open(source.as_bytes()).unwrap();
    let mut trace = Vec::new();
    for _ in 0..12 {
        session.tick().unwrap();
        let world = projection(&session);
        trace.push((
            number(&world, "workshop", "action"),
            number(&world, "workshop", "position"),
        ));
    }
    eprintln!("unavailable weapon trace: {trace:?}");
    assert!(
        trace.windows(2).all(|pair| pair[1].1 < pair[0].1),
        "withdrawal must not reverse: {trace:?}"
    );
    for _ in 0..1000 {
        let before = projection(&session);
        if text(&before, "workshop", "phase") == "Returned" {
            break;
        }
        session.tick().unwrap();
        let after = projection(&session);
        assert_eq!(number(&after, "workshop", "action"), 0.0);
        assert!(number(&after, "workshop", "position") < number(&before, "workshop", "position"));
    }
    assert_eq!(text(&projection(&session), "workshop", "phase"), "Returned");
    eprintln!("unavailable weapon return elapsed {:?}", started.elapsed());
}

#[test]
fn encounter_cooling_finishes_before_firing_resumes() {
    let source = std::str::from_utf8(SOURCE)
        .unwrap()
        .replace("  phase: \"Workshop\"\n", "  phase: \"Expedition\"\n")
        .replace("  position: 0.0\n", "  position: 8.0\n")
        .replace("  heat: 0.0\n", "  heat: 35.0\n")
        .replace("  action: 0.0\n", "  action: 2.0\n");
    let mut session = NativeSession::open(source.as_bytes()).unwrap();
    let mut trace = Vec::new();
    for _ in 0..12 {
        session.tick().unwrap();
        let world = projection(&session);
        trace.push((
            number(&world, "workshop", "action"),
            number(&world, "workshop", "heat"),
        ));
    }
    eprintln!("cooling trace: {trace:?}");
    assert!(
        trace.iter().all(|point| point.0 == 3.0),
        "cooling must persist below the upper limit: {trace:?}"
    );
    for _ in 0..100 {
        let before = projection(&session);
        session.tick().unwrap();
        let after = projection(&session);
        if number(&after, "workshop", "action") == 2.0 {
            assert!(number(&before, "workshop", "heat") <= 25.0);
            assert!(
                number(&after, "workshop", "threat-health")
                    < number(&before, "workshop", "threat-health")
            );
            return;
        }
        assert_eq!(number(&after, "workshop", "action"), 3.0);
        assert!(number(&after, "workshop", "heat") < number(&before, "workshop", "heat"));
    }
    panic!("cooling never finished");
}

fn projection(session: &NativeSession) -> Term {
    session.workbench.project_current_world().unwrap()
}

fn subject<'a>(world: &'a Term, id: &str) -> &'a Term {
    field(world, id).unwrap_or_else(|| panic!("missing subject {id}"))
}

fn number(world: &Term, id: &str, name: &str) -> f64 {
    let value = field(subject(world, id), name).unwrap_or_else(|| panic!("missing {id}.{name}"));
    f64::from_le_bytes(
        value
            .as_atom()
            .unwrap()
            .canonical_payload()
            .try_into()
            .unwrap(),
    )
}

fn text(world: &Term, id: &str, name: &str) -> String {
    String::from_utf8(
        field(subject(world, id), name)
            .unwrap()
            .as_atom()
            .unwrap()
            .canonical_payload()
            .to_vec(),
    )
    .unwrap()
}

fn powered(world: &Term, id: &str) -> bool {
    field(subject(world, id), "powered").is_some_and(|value| {
        value
            .as_atom()
            .is_some_and(|atom| atom.canonical_payload() == [1])
    })
}

fn key(session: &mut NativeSession, name: &str) {
    session
        .input(
            session.workbench.generation().handle,
            ExecutableInputSourceV1::Keyboard {
                code: name.as_bytes().to_vec(),
                phase: ExecutableKeyPhaseV1::Down,
            },
            None,
        )
        .unwrap();
    session.tick().unwrap();
}

fn choose(session: &mut NativeSession, channel: &str, id: &str) {
    let world = projection(session);
    let domain = number(&world, "$referent-inputs", channel) as u32;
    let selected = subject(&world, id);
    let value = if let Some(facets) = field(selected, "$referents") {
        field(facets, &domain.to_string()).unwrap()
    } else {
        field(selected, "$referent").unwrap()
    };
    let reference = projected_referent_value_v1(value).unwrap().unwrap();
    session
        .input(
            session.workbench.generation().handle,
            ExecutableInputSourceV1::Referent {
                channel: channel.as_bytes().to_vec(),
            },
            Some(ExecutableValueV1::Referent(reference)),
        )
        .unwrap();
    session.tick().unwrap();
}

fn equip(session: &mut NativeSession, component: &str, part: &str) {
    choose(session, "PickComponent", component);
    choose(session, "FitComponent", part);
}

fn attachment(world: &Term, component: &str) -> Option<clause_runtime::ExecutableReferentV1> {
    field(subject(world, component), "attached-to")
        .and_then(|value| projected_referent_value_v1(value).unwrap())
}

#[test]
fn anatomical_fit_coverage_and_living_movement_are_authoritative() {
    let source = std::str::from_utf8(SOURCE).unwrap();
    let template = source
        .split("\nhelmet\n")
        .nth(1)
        .unwrap()
        .split("\nworkshop\n")
        .next()
        .unwrap();
    let fixture = format!("{source}\nspare-helmet\n{template}\n");
    let mut session = NativeSession::open(fixture.as_bytes()).unwrap();
    choose(&mut session, "PickComponent", "helmet");
    choose(&mut session, "FitComponent", "legs");
    assert!(attachment(&projection(&session), "helmet").is_none());
    assert_eq!(
        text(&projection(&session), "workshop", "fit-report"),
        "That equipment does not fit this body part."
    );
    choose(&mut session, "FitComponent", "head");
    let fitted = projection(&session);
    assert_eq!(
        attachment(&fitted, "helmet"),
        projected_referent_value_v1(field(subject(&fitted, "head"), "$referent").unwrap()).unwrap()
    );
    assert_eq!(number(&fitted, "workshop", "total-mass"), 27.0);
    assert!(field(subject(&fitted, "helmet"), "mounted").is_some());
    equip(&mut session, "spare-helmet", "head");
    assert!(attachment(&projection(&session), "spare-helmet").is_none());
    assert_eq!(
        text(&projection(&session), "workshop", "fit-report"),
        "That body part has no free attachment slot."
    );
    key(&mut session, "LaunchExpedition");
    for _ in 0..1000 {
        if number(&projection(&session), "legs", "part-health") < 100.0 {
            break;
        }
        session.tick().unwrap();
    }
    let injured = projection(&session);
    assert!(number(&injured, "legs", "part-health") < 100.0);
    assert!(
        number(&injured, "head", "part-health") > number(&injured, "legs", "part-health"),
        "the helmet protects the head, not uncovered legs"
    );
    assert!(number(&injured, "wayfarer", "creature-condition") < 100.0);
    let checkpoint = session.workbench.checkpoint_admitted().unwrap();
    let reopened = clause_workbench::ResidentSourceWorkbenchV1::reopen(
        session.workbench.exact_source(),
        &checkpoint,
    )
    .unwrap();
    let saved = reopened.project_current_world().unwrap();
    assert_eq!(attachment(&saved, "helmet"), attachment(&injured, "helmet"));
    assert_eq!(
        number(&saved, "legs", "part-health"),
        number(&injured, "legs", "part-health")
    );
    key(&mut session, "WithdrawExpedition");
    for _ in 0..1000 {
        if text(&projection(&session), "workshop", "phase") == "Returned" {
            break;
        }
        session.tick().unwrap();
    }
    assert_eq!(text(&projection(&session), "workshop", "phase"), "Returned");
    let worn = projection(&session);
    key(&mut session, "RestCreature");
    assert_eq!(
        number(&projection(&session), "wayfarer", "creature-condition"),
        100.0
    );
    assert_eq!(
        number(&projection(&session), "helmet", "health"),
        number(&worn, "helmet", "health")
    );
    assert_eq!(
        number(&projection(&session), "workshop", "stock"),
        number(&worn, "workshop", "stock")
    );

    let without_power = source.replace("  generation: 10.0\n", "  generation: 0.0\n");
    let mut walker = NativeSession::open(without_power.as_bytes()).unwrap();
    key(&mut walker, "LaunchExpedition");
    let walking = projection(&walker);
    assert_eq!(number(&walking, "workshop", "drive-power"), 0.0);
    assert!(
        number(&walking, "workshop", "position") > 0.0,
        "a living creature walks without powered equipment"
    );

    let mut unladen = NativeSession::open(SOURCE).unwrap();
    for component in ["ember-core", "drive", "lance", "cooler"] {
        choose(&mut unladen, "PickComponent", component);
        key(&mut unladen, "UnequipComponent");
        let world = projection(&unladen);
        assert!(attachment(&world, component).is_none());
        assert!(field(subject(&world, component), "mounted").is_none());
    }
    key(&mut unladen, "LaunchExpedition");
    let walking = projection(&unladen);
    assert_eq!(number(&walking, "workshop", "total-mass"), 0.0);
    assert!((number(&walking, "workshop", "position") - 1.4 * 0.016).abs() < 1e-12);

    let exposed = source
        .replace("  attached-to: back\n", "")
        .replace("  attached-to: legs\n", "")
        .replace("  attached-to: right-arm\n", "")
        .replace("  phase: \"Workshop\"\n", "  phase: \"Expedition\"\n")
        .replace("  position: 0.0\n", "  position: 8.0\n");
    let mut exposed = NativeSession::open(exposed.as_bytes()).unwrap();
    exposed.tick().unwrap();
    let injured = projection(&exposed);
    assert_eq!(number(&injured, "workshop", "total-mass"), 0.0);
    for part in ["head", "torso", "back", "left-arm", "right-arm", "legs"] {
        assert!(number(&injured, part, "part-health") < 100.0);
    }
}

#[test]
fn wiring_withdrawal_damage_repair_checkpoint_and_checked_edit() {
    let started = Instant::now();
    let mut session = NativeSession::open(SOURCE).unwrap();
    assert!(powered(&projection(&session), "lance"));
    choose(&mut session, "PickComponent", "drive");
    key(&mut session, "DisconnectComponent");
    let disconnected = projection(&session);
    assert!(!powered(&disconnected, "drive"));
    assert!(
        !powered(&disconnected, "lance"),
        "the lance loses its actual upstream supply"
    );
    equip(&mut session, "lance", "left-arm");
    assert!(!powered(&projection(&session), "lance"));
    assert!(attachment(&projection(&session), "lance").is_some());
    choose(&mut session, "PickComponent", "lance");
    choose(&mut session, "WireComponent", "ember-core");
    assert!(powered(&projection(&session), "lance"));
    equip(&mut session, "auxiliary-core", "back");
    assert_eq!(
        number(&projection(&session), "workshop", "available-power"),
        16.0
    );
    assert_eq!(
        number(&projection(&session), "workshop", "total-mass"),
        32.0
    );

    let broken = std::str::from_utf8(SOURCE)
        .unwrap()
        .replace("  health: 45.0\n", "  health: 0.0\n");
    let mut damaged = NativeSession::open(broken.as_bytes()).unwrap();
    assert!(!powered(&projection(&damaged), "lance"));
    key(&mut damaged, "RepairComponent");
    let repaired = projection(&damaged);
    assert_eq!(number(&repaired, "lance", "health"), 45.0);
    assert_eq!(number(&repaired, "workshop", "stock"), 3.75);
    assert!(powered(&repaired, "lance"));

    let effects = damaged.workbench.scalar_effects().unwrap();
    let index = effects
        .iter()
        .position(|effect| effect.expression == b"if(?action = 4.0, ?cargo + 3.0 * ?dt, ?cargo)")
        .expect("salvage rate is an offered source effect");
    damaged
        .edit(
            damaged.workbench.generation().handle,
            index,
            b"if(?action = 4.0, ?cargo + 6.0 * ?dt, ?cargo)",
        )
        .unwrap();
    assert_eq!(number(&projection(&damaged), "workshop", "stock"), 3.75);
    assert_eq!(number(&projection(&damaged), "lance", "health"), 45.0);

    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join(format!("build/workshop-proof-{}.save", std::process::id()));
    damaged.save(&path).unwrap();
    let reopened = NativeSession::load(&path, SOURCE).unwrap();
    assert_eq!(
        reopened.workbench.exact_source(),
        damaged.workbench.exact_source()
    );
    assert_eq!(number(&projection(&reopened), "workshop", "stock"), 3.75);
    assert_eq!(number(&projection(&reopened), "lance", "health"), 45.0);
    std::fs::remove_file(path).unwrap();

    let at_salvage = std::str::from_utf8(SOURCE)
        .unwrap()
        .replace("  phase: \"Workshop\"\n", "  phase: \"Expedition\"\n")
        .replace("  position: 0.0\n", "  position: 8.0\n")
        .replace("  threat-health: 75.0\n", "  threat-health: 0.0\n");
    let mut salvaging = NativeSession::open(at_salvage.as_bytes()).unwrap();
    salvaging.tick().unwrap();
    let prior_cargo = number(&projection(&salvaging), "workshop", "cargo");
    assert!((prior_cargo - 0.048).abs() < 1e-12);
    let effects = salvaging.workbench.scalar_effects().unwrap();
    let index = effects
        .iter()
        .position(|effect| effect.expression == b"if(?action = 4.0, ?cargo + 3.0 * ?dt, ?cargo)")
        .unwrap();
    salvaging
        .edit(
            salvaging.workbench.generation().handle,
            index,
            b"if(?action = 4.0, ?cargo + 6.0 * ?dt, ?cargo)",
        )
        .unwrap();
    assert_eq!(
        number(&projection(&salvaging), "workshop", "cargo"),
        prior_cargo
    );
    salvaging.tick().unwrap();
    assert!(
        (number(&projection(&salvaging), "workshop", "cargo") - prior_cargo - 0.096).abs() < 1e-12
    );
    eprintln!(
        "workshop wiring/repair/checkpoint/edit proof elapsed {:?}",
        started.elapsed()
    );
}

struct Journey {
    session: NativeSession,
    ticks: usize,
    cooling_ticks: usize,
    maximum_heat: f64,
    departure_position: f64,
}

fn expedition(armored: bool, auxiliary: bool, cooler: bool, doctrine: &str) -> Journey {
    let mut session = NativeSession::open(SOURCE).unwrap();
    if armored {
        equip(&mut session, "armor", "torso");
    }
    if auxiliary {
        equip(&mut session, "auxiliary-core", "back");
    }
    if !cooler {
        choose(&mut session, "PickComponent", "cooler");
        key(&mut session, "DisconnectComponent");
    }
    choose(&mut session, "ChooseDoctrine", doctrine);
    key(&mut session, "LaunchExpedition");
    let departure_position = number(&projection(&session), "workshop", "position");
    let mut journey = Journey {
        session,
        ticks: 0,
        cooling_ticks: 0,
        maximum_heat: 0.0,
        departure_position,
    };
    for tick in 0..10_000 {
        journey.session.tick().unwrap();
        let world = projection(&journey.session);
        journey.ticks = tick + 1;
        journey.cooling_ticks += usize::from(number(&world, "workshop", "action") == 3.0);
        journey.maximum_heat = journey.maximum_heat.max(number(&world, "workshop", "heat"));
        if text(&world, "workshop", "phase") == "Returned" {
            return journey;
        }
    }
    panic!("pilot did not return within 160 simulated seconds");
}

#[test]
fn autonomous_expedition_returns_salvage_and_persistent_wear_then_redesign_changes_behavior() {
    let started = Instant::now();
    let mut cautious = expedition(false, false, true, "cautious");
    let assault = expedition(false, false, true, "assault");
    let first = projection(&cautious.session);
    let second = projection(&assault.session);
    assert!(number(&first, "workshop", "stock") >= 27.0);
    assert!(number(&second, "workshop", "stock") >= 27.0);
    assert!(number(&first, "lance", "health") < 45.0);
    assert!(number(&second, "lance", "health") > number(&first, "lance", "health"));
    assert_eq!(
        number(&second, "workshop", "total-mass"),
        number(&first, "workshop", "total-mass")
    );
    assert!(cautious.cooling_ticks > assault.cooling_ticks);
    assert_ne!(cautious.ticks, assault.ticks);
    let cooled = expedition(false, true, true, "assault");
    let disconnected = expedition(false, true, false, "assault");
    let extra_power = projection(&cooled.session);
    let severed_cooling = projection(&disconnected.session);
    assert!(
        cooled.departure_position < assault.departure_position,
        "the auxiliary source costs movement through actual mounted mass"
    );
    assert!(
        cooled.maximum_heat < assault.maximum_heat,
        "extra generation permits simultaneous firing and cooling"
    );
    assert!(disconnected.maximum_heat > cooled.maximum_heat);
    assert!(disconnected.cooling_ticks > cooled.cooling_ticks);
    assert!(number(&severed_cooling, "lance", "health") < number(&extra_power, "lance", "health"));
    let checkpoint = cautious.session.workbench.checkpoint_admitted().unwrap();
    let reopened = clause_workbench::ResidentSourceWorkbenchV1::reopen(
        cautious.session.workbench.exact_source(),
        &checkpoint,
    )
    .unwrap();
    let saved = reopened.project_current_world().unwrap();
    assert_eq!(
        number(&saved, "workshop", "stock"),
        number(&first, "workshop", "stock")
    );
    assert_eq!(
        number(&saved, "lance", "health"),
        number(&first, "lance", "health")
    );
    choose(&mut cautious.session, "PickComponent", "lance");
    key(&mut cautious.session, "RepairComponent");
    let repaired = projection(&cautious.session);
    assert_eq!(number(&repaired, "lance", "health"), 45.0);
    assert_eq!(
        number(&repaired, "workshop", "stock"),
        number(&first, "workshop", "stock") - (45.0 - number(&first, "lance", "health")) / 4.0
    );
    key(&mut cautious.session, "RestCreature");
    equip(&mut cautious.session, "armor", "torso");
    choose(&mut cautious.session, "ChooseDoctrine", "assault");
    key(&mut cautious.session, "LaunchExpedition");
    let relaunched = projection(&cautious.session);
    assert_eq!(text(&relaunched, "workshop", "phase"), "Expedition");
    assert_eq!(
        number(&relaunched, "workshop", "stock"),
        number(&repaired, "workshop", "stock")
    );
    assert_eq!(number(&relaunched, "lance", "health"), 45.0);
    assert!(
        number(&relaunched, "workshop", "total-mass") > number(&first, "workshop", "total-mass")
    );
    assert!(
        number(&relaunched, "workshop", "position") < cautious.departure_position,
        "fitting torso armor slows the rested wayfarer's departure"
    );
    eprintln!(
        "workshop journey elapsed {:?}; cautious ticks={} cooling={} heat={:.2} lance={:.2}; same-build assault ticks={} cooling={} heat={:.2} lance={:.2}",
        started.elapsed(),
        cautious.ticks,
        cautious.cooling_ticks,
        cautious.maximum_heat,
        number(&first, "lance", "health"),
        assault.ticks,
        assault.cooling_ticks,
        assault.maximum_heat,
        number(&second, "lance", "health")
    );
    eprintln!(
        "workshop cooling comparison: auxiliary source ticks={} heat={:.2} stock={:.2}; severed cooling ticks={} heat={:.2} stock={:.2}",
        cooled.ticks,
        cooled.maximum_heat,
        number(&extra_power, "workshop", "stock"),
        disconnected.ticks,
        disconnected.maximum_heat,
        number(&severed_cooling, "workshop", "stock")
    );
}
