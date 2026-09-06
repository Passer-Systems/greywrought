use greywrought_clause::native::{self, NativeSession};

#[test]
fn anatomy_and_equipment_inputs_use_exact_projected_body_referents() {
    let mut session =
        NativeSession::open(include_bytes!("../src/world/workshop-expedition.clause")).unwrap();
    let view = session
        .snapshot(0, String::new())
        .unwrap()
        .workshop
        .unwrap();
    assert_eq!(view.creature_name, "Wayfarer");
    assert_eq!(view.creature_condition, 100.0);
    assert_eq!(view.body_parts.len(), 6);
    let head = view.body_parts.iter().find(|p| p.id == "head").unwrap();
    let torso = view.body_parts.iter().find(|p| p.id == "torso").unwrap();
    assert_eq!(head.label, "Head");
    assert_eq!(head.health, head.maximum_health);
    let helmet = view.components.iter().find(|c| c.id == "helmet").unwrap();
    assert!(helmet.available_fit.contains(&head.fit));
    assert!(!helmet.available_fit.contains(&torso.fit));
    assert_eq!(helmet.accepted_kind, head.kind);
    assert!(helmet.attached_to.is_none());
    for (channel, reference) in [
        ("PickComponent", helmet.pick.clone()),
        ("FitComponent", torso.fit.clone()),
    ] {
        let (input, value) = native::reference(channel, reference);
        session
            .input(session.workbench.generation().handle, input, value)
            .unwrap();
        session.tick().unwrap();
    }
    let rejected = session
        .snapshot(0, String::new())
        .unwrap()
        .workshop
        .unwrap();
    assert_eq!(
        rejected.fit_report,
        "That equipment does not fit this body part."
    );
    assert!(
        rejected
            .components
            .iter()
            .find(|c| c.id == "helmet")
            .unwrap()
            .attached_to
            .is_none()
    );
    let (input, value) = native::reference("FitComponent", head.fit.clone());
    session
        .input(session.workbench.generation().handle, input, value)
        .unwrap();
    session.tick().unwrap();
    let fitted = session
        .snapshot(0, String::new())
        .unwrap()
        .workshop
        .unwrap();
    let helmet = fitted.components.iter().find(|c| c.id == "helmet").unwrap();
    assert_eq!(helmet.attached_to.as_ref(), Some(&head.fit));
    assert!(helmet.mounted);
    assert_eq!(
        fitted.fit_report,
        "Equipment fitted to the selected body part."
    );
}
