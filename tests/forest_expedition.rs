#[path = "common/forest.rs"]
mod movement;
use clause_package::Term;
use clause_runtime::{
    ExecutableInputSourceV1, ExecutableKeyPhaseV1, ExecutableValueV1, projected_referent_value_v1,
};
use greywrought_clause::native::{NativeSession, field};

const SOURCE: &[u8] = include_bytes!("../src/world/forest-expedition.clause");

fn world(session: &NativeSession) -> Term {
    session.workbench.project_current_world().unwrap()
}

fn number(world: &Term, subject: &str, role: &str) -> f64 {
    f64::from_le_bytes(
        field(field(world, subject).unwrap(), role)
            .unwrap()
            .as_atom()
            .unwrap()
            .canonical_payload()
            .try_into()
            .unwrap(),
    )
}

fn text(world: &Term, subject: &str, role: &str) -> String {
    String::from_utf8(
        field(field(world, subject).unwrap(), role)
            .unwrap()
            .as_atom()
            .unwrap()
            .canonical_payload()
            .to_vec(),
    )
    .unwrap()
}

fn press(session: &mut NativeSession, code: &str) {
    session
        .input(
            session.workbench.generation().handle,
            ExecutableInputSourceV1::Keyboard {
                code: code.as_bytes().to_vec(),
                phase: ExecutableKeyPhaseV1::Down,
            },
            None,
        )
        .unwrap();
    session.tick().unwrap();
}

fn ready(session: &mut NativeSession) {
    for _ in 0..200 {
        if number(&world(session), "workshop", "action-cooldown") <= 0.0 {
            return;
        }
        session.tick().unwrap();
    }
    panic!("the action did not become ready");
}

fn act(session: &mut NativeSession, code: &str) {
    ready(session);
    press(session, code);
}

fn ticks(session: &mut NativeSession, count: usize) {
    for _ in 0..count {
        session.tick().unwrap();
    }
}

fn target(session: &mut NativeSession, id: &str) {
    let projection = world(session);
    let domain = number(&projection, "$referent-inputs", "TargetThreat") as u32;
    let subject = field(&projection, id).unwrap();
    let reference = field(subject, "$referents")
        .and_then(|facets| field(facets, &domain.to_string()))
        .or_else(|| field(subject, "$referent"))
        .unwrap();
    let value = projected_referent_value_v1(reference).unwrap().unwrap();
    session
        .input(
            session.workbench.generation().handle,
            ExecutableInputSourceV1::Referent {
                channel: b"TargetThreat".to_vec(),
            },
            Some(ExecutableValueV1::Referent(value)),
        )
        .unwrap();
    session.tick().unwrap();
}

fn party(session: &mut NativeSession, size: f64) {
    session
        .input(
            session.workbench.generation().handle,
            ExecutableInputSourceV1::Scalar {
                channel: b"PartySize".to_vec(),
            },
            Some(ExecutableValueV1::number(size).unwrap()),
        )
        .unwrap();
    session.tick().unwrap();
}

fn clear(session: &mut NativeSession, id: &str) {
    let position = session
        .snapshot(0, String::new())
        .unwrap()
        .forest
        .unwrap()
        .threats
        .iter()
        .find(|t| t.id == id)
        .unwrap()
        .position;
    movement::walk(session, [0., position[1]]).unwrap();
    if id == "nest" {
        movement::walk(session, [2., position[1]]).unwrap();
    } else {
        movement::walk(session, position).unwrap();
    }
    target(session, id);
    for _ in 0..8 {
        if number(&world(session), id, "enemy-health") <= 0.0 {
            return;
        }
        act(session, "StrikeThreat");
    }
    panic!("the planned attacks did not clear {id}");
}

#[test]
fn forest_resource_is_permanent_only_after_extraction() {
    let mut session = NativeSession::open(SOURCE).unwrap();
    movement::walk(&mut session, [0., 5.]).unwrap();
    movement::walk(&mut session, [-2., 12.]).unwrap();
    act(&mut session, "GatherResource");
    let gathered = world(&session);
    assert_eq!(number(&gathered, "workshop", "cargo"), 3.0);
    assert_eq!(number(&gathered, "workshop", "stock"), 15.0);
    assert_eq!(number(&gathered, "workshop", "resource-remaining"), 9.0);
    session.tick().unwrap();
    assert_eq!(text(&world(&session), "workshop", "phase"), "Expedition");
    movement::walk(&mut session, [0., 5.]).unwrap();
    movement::walk(&mut session, [0., -1.]).unwrap();
    session.tick().unwrap();
    let returned = world(&session);
    assert_eq!(text(&returned, "workshop", "phase"), "Returned");
    assert_eq!(number(&returned, "workshop", "stock"), 18.0);
    assert_eq!(number(&returned, "workshop", "cargo"), 0.0);
    session.tick().unwrap();
    assert_eq!(number(&world(&session), "workshop", "stock"), 18.0);
}

#[test]
fn forest_intents_remain_readable_for_thirty_seconds_and_clearing_scout_stops_alarms() {
    let mut session = NativeSession::open(SOURCE).unwrap();
    movement::walk(&mut session, [0., 5.]).unwrap();
    movement::walk(&mut session, [-3., 10.]).unwrap();
    let initial = world(&session);
    assert!(
        ["Listening for footsteps", "Sounding the alarm"]
            .contains(&text(&initial, "scout", "current-intent").as_str())
    );
    assert_ne!(
        text(&initial, "scout", "current-intent"),
        text(&initial, "scout", "upcoming-intent")
    );
    let mut observed = std::collections::BTreeSet::new();
    for _ in 0..30 {
        ticks(&mut session, 63);
        let projection = world(&session);
        observed.insert(text(&projection, "scout", "current-intent"));
        for id in ["scout", "nest", "warder", "patrol"] {
            assert!(!text(&projection, id, "current-intent").is_empty());
            assert!(!text(&projection, id, "upcoming-intent").is_empty());
            assert!(number(&projection, id, "intent-remaining") > 0.0);
        }
    }
    assert_eq!(observed.len(), 2);
    let added_presence =
        number(&world(&session), "workshop", "presence") - number(&initial, "workshop", "presence");
    assert!(
        (added_presence - 18.024).abs() < 0.000_001,
        "{added_presence}"
    );
    clear(&mut session, "scout");
    let cleared = world(&session);
    assert_eq!(text(&cleared, "scout", "current-intent"), "Cleared");
    assert_eq!(number(&cleared, "workshop", "stock"), 15.0);
    assert_eq!(number(&cleared, "workshop", "cargo"), 0.0);
    let before = number(&cleared, "workshop", "presence");
    ticks(&mut session, 375);
    let after = number(&world(&session), "workshop", "presence");
    assert!((after - before - 0.6).abs() < 0.000_001);
}

#[test]
fn forest_ritual_is_deliberate_and_its_known_reward_requires_a_living_return() {
    let mut session = NativeSession::open(SOURCE).unwrap();
    party(&mut session, 4.0);
    movement::walk(&mut session, [0., 5.]).unwrap();
    act(&mut session, "CallRitual");
    assert_eq!(
        text(&world(&session), "ritual-guardian", "current-intent"),
        "Dormant until called"
    );
    clear(&mut session, "scout");
    clear(&mut session, "nest");
    clear(&mut session, "warder");
    clear(&mut session, "patrol");
    movement::walk(&mut session, [0., 12.]).unwrap();
    movement::walk(&mut session, [-2., 12.]).unwrap();
    let safe_health = number(&world(&session), "torso", "part-health");
    for _ in 0..5 {
        act(&mut session, "GatherResource");
    }
    let gathered = world(&session);
    assert_eq!(number(&gathered, "torso", "part-health"), safe_health);
    assert_eq!(number(&gathered, "workshop", "cargo"), 12.0);
    assert_eq!(number(&gathered, "workshop", "resource-remaining"), 0.0);
    movement::walk(&mut session, [2., 40.]).unwrap();
    act(&mut session, "CallRitual");
    assert_eq!(number(&world(&session), "workshop", "cargo"), 6.0);
    clear(&mut session, "ritual-guardian");
    session.tick().unwrap();
    let won = world(&session);
    assert_eq!(number(&won, "workshop", "carried-relics"), 1.0);
    assert_eq!(number(&won, "workshop", "banked-relics"), 0.0);
    assert_eq!(number(&won, "workshop", "stock"), 15.0);
    act(&mut session, "CallRitual");
    assert_eq!(number(&world(&session), "workshop", "cargo"), 6.0);
    ready(&mut session);
    let retreat_health = number(&world(&session), "torso", "part-health");
    movement::walk(&mut session, [0., 5.]).unwrap();
    movement::walk(&mut session, [0., -1.]).unwrap();
    assert_eq!(
        number(&world(&session), "torso", "part-health"),
        retreat_health
    );
    session.tick().unwrap();
    let returned = world(&session);
    assert_eq!(text(&returned, "workshop", "phase"), "Returned");
    assert_eq!(number(&returned, "workshop", "stock"), 21.0);
    assert_eq!(number(&returned, "workshop", "banked-relics"), 1.0);
    assert_eq!(number(&returned, "workshop", "carried-relics"), 0.0);
    movement::walk(&mut session, [0., 5.]).unwrap();
    movement::walk(&mut session, [-3., 10.]).unwrap();
    target(&mut session, "scout");
    act(&mut session, "StrikeThreat");
    assert!((number(&world(&session), "scout", "enemy-health") + 7.0).abs() < 0.000_001);
}

#[test]
fn forest_party_presence_is_modest_and_disconnected_checkpoint_preserves_the_instance() {
    let mut solo = NativeSession::open(SOURCE).unwrap();
    let mut group = NativeSession::open(SOURCE).unwrap();
    party(&mut group, 4.0);
    movement::walk(&mut solo, [0., 3.]).unwrap();
    movement::walk(&mut group, [0., 3.]).unwrap();
    let solo_presence = number(&world(&solo), "workshop", "presence");
    let group_presence = number(&world(&group), "workshop", "presence");
    assert!(group_presence > solo_presence && group_presence < solo_presence * 1.3);
    party(&mut group, 1.0);
    assert_eq!(number(&world(&group), "workshop", "party-size"), 4.0);
    press(&mut group, "ConnectionLost");
    let paused = world(&group);
    let path = std::env::temp_dir().join(format!(
        "greywrought-forest-pause-{}.save",
        std::process::id()
    ));
    group.save(&path).unwrap();
    let mut reopened = NativeSession::load(&path, SOURCE).unwrap();
    ticks(&mut reopened, 100);
    let (input, value) = greywrought_clause::native::scalar("MoveZ", 1.);
    reopened
        .input(reopened.workbench.generation().handle, input, value)
        .unwrap();
    ticks(&mut reopened, 20);
    let retained = world(&reopened);
    for role in ["presence", "cargo", "stock", "action-cooldown"] {
        assert_eq!(
            number(&paused, "workshop", role),
            number(&retained, "workshop", role)
        );
    }
    assert_eq!(
        field(field(&paused, "workshop").unwrap(), "position"),
        field(field(&retained, "workshop").unwrap(), "position")
    );
    assert_eq!(
        number(&paused, "scout", "intent-remaining"),
        number(&retained, "scout", "intent-remaining")
    );
    assert_eq!(
        number(&paused, "torso", "part-health"),
        number(&retained, "torso", "part-health")
    );
    press(&mut reopened, "ConnectionRestored");
    movement::walk(&mut reopened, [0., 6.]).unwrap();
    assert!(
        (reopened
            .snapshot(0, String::new())
            .unwrap()
            .forest
            .unwrap()
            .position[1]
            - 6.)
            .abs()
            < 0.1
    );
    std::fs::remove_file(path).unwrap();
}

#[test]
fn forest_death_loses_carried_and_personal_power_and_cannot_be_restored_at_the_hub() {
    let source = std::str::from_utf8(SOURCE)
        .unwrap()
        .replace("  phase: \"Workshop\"\n", "  phase: \"Expedition\"\n")
        .replace("    z: -8.0\n", "    z: 35.0\n")
        .replace("  part-health: 100.0\n", "  part-health: 1.0\n")
        .replace("  cargo: 0.0\n", "  cargo: 3.0\n")
        .replace("  banked-relics: 0.0\n", "  banked-relics: 2.0\n")
        .replace("  intent-remaining: 3.0\n", "  intent-remaining: 0.016\n");
    let mut session = NativeSession::open(source.as_bytes()).unwrap();
    ticks(&mut session, 2);
    let lost = world(&session);
    assert_eq!(text(&lost, "workshop", "phase"), "Lost");
    for role in ["cargo", "stock", "carried-relics", "banked-relics"] {
        assert_eq!(number(&lost, "workshop", role), 0.0);
    }
    assert_eq!(number(&lost, "torso", "part-health"), 0.0);
    assert_eq!(number(&lost, "lance", "health"), 0.0);
    for command in ["RestCreature", "RepairComponent"] {
        press(&mut session, command);
    }
    let (input, value) = greywrought_clause::native::scalar("MoveZ", -1.);
    session
        .input(session.workbench.generation().handle, input, value)
        .unwrap();
    ticks(&mut session, 30);
    assert_eq!(text(&world(&session), "workshop", "phase"), "Lost");
    assert_eq!(number(&world(&session), "torso", "part-health"), 0.0);
}

#[test]
fn forest_walk_is_bounded_and_stops_when_input_expires() {
    let mut session = NativeSession::open(SOURCE).unwrap();
    for (channel, value) in [("MoveX", 1.), ("MoveZ", 1.)] {
        let (input, value) = greywrought_clause::native::scalar(channel, value);
        session
            .input(session.workbench.generation().handle, input, value)
            .unwrap();
    }
    ticks(&mut session, 10);
    let p = session
        .snapshot(0, String::new())
        .unwrap()
        .forest
        .unwrap()
        .position;
    let distance = (p[0] * p[0] + (p[1] + 8.) * (p[1] + 8.)).sqrt();
    assert!((distance - 0.72).abs() < 0.000_001);
    ticks(&mut session, 20);
    let stopped = session
        .snapshot(0, String::new())
        .unwrap()
        .forest
        .unwrap()
        .position;
    ticks(&mut session, 20);
    assert_eq!(
        session
            .snapshot(0, String::new())
            .unwrap()
            .forest
            .unwrap()
            .position,
        stopped
    );
    movement::walk(&mut session, [8., -1.]).unwrap();
    for _ in 0..10 {
        let (input, value) = greywrought_clause::native::scalar("MoveZ", 1.);
        session
            .input(session.workbench.generation().handle, input, value)
            .unwrap();
        ticks(&mut session, 10);
    }
    let bounded = session
        .snapshot(0, String::new())
        .unwrap()
        .forest
        .unwrap()
        .position;
    assert!(bounded[1] < -0.5);
    assert_eq!(text(&world(&session), "workshop", "phase"), "Workshop");
    press(&mut session, "GatherResource");
    assert_eq!(number(&world(&session), "workshop", "cargo"), 0.);
}
