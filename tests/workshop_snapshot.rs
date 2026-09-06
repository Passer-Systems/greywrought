use clause_runtime::projected_text_value_v1;
use greywrought_clause::native::{self, NativeSession, WorkshopView, field};

const SOURCE: &[u8] = include_bytes!("../src/world/workshop-expedition.clause");

fn assert_projected_readings(session: &NativeSession, view: &WorkshopView) {
    let projection = session.workbench.project_current_world().unwrap();
    let workshop = field(&projection, "workshop").unwrap();
    for (name, actual) in &view.readings {
        let bytes = field(workshop, name)
            .unwrap()
            .as_atom()
            .unwrap()
            .canonical_payload();
        assert_eq!(
            *actual,
            f64::from_le_bytes(bytes.try_into().unwrap()),
            "{name}"
        );
    }
    for (name, actual) in [("phase", &view.phase), ("report", &view.report)] {
        assert_eq!(
            actual,
            projected_text_value_v1(field(workshop, name).unwrap())
                .unwrap()
                .unwrap()
        );
    }
}

#[test]
fn workshop_snapshot_reads_the_world_subject_through_launch_and_reopen() {
    let mut session = NativeSession::open(SOURCE).unwrap();
    let initial = session
        .snapshot(0, String::new())
        .unwrap()
        .workshop
        .unwrap();
    assert_eq!(initial.phase, "Workshop");
    assert_eq!(initial.readings["total-mass"], 24.0);
    assert_eq!(initial.readings["available-power"], 10.0);
    assert_eq!(initial.readings["stock"], 15.0);
    assert_eq!(
        initial.report,
        "Prepare your machine, then venture into the ashfield."
    );
    assert_projected_readings(&session, &initial);
    assert_eq!(
        initial
            .components
            .iter()
            .find(|component| component.selected)
            .unwrap()
            .id,
        "lance"
    );
    let drive = initial
        .components
        .iter()
        .find(|component| component.id == "drive")
        .unwrap();
    let (input, value) = native::reference("PickComponent", drive.pick.clone());
    session
        .input(session.workbench.generation().handle, input, value)
        .unwrap();
    session.tick().unwrap();
    let selected = session
        .snapshot(0, String::new())
        .unwrap()
        .workshop
        .unwrap();
    assert_eq!(
        selected
            .components
            .iter()
            .find(|component| component.selected)
            .unwrap()
            .id,
        "drive"
    );

    let (input, value) = native::key("LaunchExpedition");
    session
        .input(session.workbench.generation().handle, input, value)
        .unwrap();
    session.tick().unwrap();
    let launched = session
        .snapshot(0, String::new())
        .unwrap()
        .workshop
        .unwrap();
    assert_eq!(launched.phase, "Expedition");
    assert!(launched.readings["position"] > 0.0);
    assert_eq!(
        launched.report,
        "Approaching the sentinel. Mounted mass sets our pace."
    );
    assert_projected_readings(&session, &launched);

    let save = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!(
        "build/workshop-snapshot-{}.save",
        std::process::id()
    ));
    session.save(&save).unwrap();
    let reopened = NativeSession::load(&save, SOURCE).unwrap();
    let restored = reopened
        .snapshot(0, String::new())
        .unwrap()
        .workshop
        .unwrap();
    assert_eq!(restored.phase, launched.phase);
    assert_eq!(restored.report, launched.report);
    assert_eq!(restored.readings, launched.readings);
    assert_projected_readings(&reopened, &restored);
    std::fs::remove_file(save).unwrap();
}
