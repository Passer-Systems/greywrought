//! Creature dressing and physical inputs; all equipment outcomes come from the world.
use super::*;

#[derive(Component, Clone)]
pub(super) enum Control {
    Outfit,
    Help,
    Pick(usize),
    Wire(usize),
    Body(usize),
    Equip,
    Wiring,
    Doctrine(usize),
    Key(&'static str),
}
#[derive(Resource, Default)]
pub(super) struct Selection {
    open: bool,
    help_dismissed: bool,
    body: Option<usize>,
    wiring: bool,
}
#[derive(Component)]
pub(super) struct Panel;
#[derive(Component)]
pub(super) struct Outfitting;
#[derive(Component)]
pub(super) struct Readout;
#[derive(Component)]
pub(super) struct Detail;
#[derive(Component)]
pub(super) struct Report;
#[derive(Component)]
pub(super) struct SentinelLabel;
#[derive(Component)]
pub(super) struct Roster;
#[derive(Component)]
pub(super) struct BodyRoster;
#[derive(Component)]
pub(super) struct WireRoster;
#[derive(Component)]
pub(super) struct WorkshopCamera;
#[derive(Component)]
pub(super) struct Creature;
#[derive(Component)]
pub(super) struct Socket;
#[derive(Component)]
pub(super) struct Gear {
    component: usize,
    part: String,
}
#[derive(Component)]
pub(super) enum Scenery {
    Bench,
    Ash,
    Sentinel,
    Cache,
}

fn label(text: impl Into<String>, size: f32) -> (Text, TextFont, TextColor) {
    (
        Text::new(text),
        TextFont {
            font_size: FontSize::Px(size),
            ..default()
        },
        TextColor(Color::srgb(0.90, 0.91, 0.85)),
    )
}
fn button(control: Control) -> impl Bundle {
    (
        Button,
        Node {
            padding: UiRect::all(px(8)),
            min_height: px(33),
            ..default()
        },
        BackgroundColor(Color::srgb(0.12, 0.19, 0.21)),
        control,
    )
}
fn column() -> Node {
    Node {
        flex_direction: FlexDirection::Column,
        row_gap: px(6),
        ..default()
    }
}

pub(super) fn setup(commands: &mut Commands) {
    commands.insert_resource(Selection::default());
    commands.spawn((
        label("", 15.0),
        Node {
            position_type: PositionType::Absolute,
            padding: UiRect::all(px(5)),
            ..default()
        },
        BackgroundColor(Color::srgba(0.15, 0.035, 0.02, 0.9)),
        SentinelLabel,
    ));
    commands.spawn((
        Camera3d::default(),
        WorkshopCamera,
        Transform::from_xyz(4.5, 3.1, 7.5).looking_at(Vec3::Y, Vec3::Y),
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: 18000.0,
            ..default()
        },
        Transform::from_xyz(-8.0, 15.0, 8.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        PointLight {
            intensity: 180000.0,
            color: Color::srgb(0.38, 0.76, 1.0),
            shadow_maps_enabled: true,
            ..default()
        },
        Transform::from_xyz(2.0, 4.0, -3.0),
    ));
    commands.spawn((
        label("Opening the workshop...", 17.0),
        Node {
            position_type: PositionType::Absolute,
            left: px(16),
            top: px(12),
            right: px(16),
            ..default()
        },
        Hud,
    ));
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: px(16),
                right: px(16),
                top: px(12),
                padding: UiRect::all(px(10)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.045, 0.075, 0.085, 0.88)),
            Panel,
        ))
        .with_children(|p| {
            p.spawn((label("", 17.0), Readout));
        });
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: px(16),
                top: px(88),
                column_gap: px(8),
                ..default()
            },
            Panel,
        ))
        .with_children(|p| {
            for (control, caption) in [
                (Control::Outfit, "Outfit [O]"),
                (Control::Key("LaunchExpedition"), "Deploy [Enter]"),
                (Control::Key("WithdrawExpedition"), "Return [Backspace]"),
                (Control::Help, "How to play [?]"),
            ] {
                p.spawn(button(control)).with_children(|b| {
                    b.spawn(label(caption, 15.0));
                });
            }
        });
    commands.spawn((Node { position_type: PositionType::Absolute, left: px(16), top: px(136), width: px(660), bottom: px(62), padding: UiRect::all(px(14)), overflow: Overflow::scroll_y(), ..column() }, ScrollPosition::default(), BackgroundColor(Color::srgba(0.045, 0.075, 0.085, 0.98)), Panel, Outfitting)).with_children(|p| {
        p.spawn(label("OUTFIT  /  Choose gear, then a body part. Scroll for more.", 16.0));
        p.spawn((Node { column_gap: px(16), ..default() },)).with_children(|p| {
            p.spawn((Node { width: px(200), flex_shrink: 0.0, ..column() },)).with_children(|p| {
                p.spawn(label("Equipment", 17.0)); p.spawn((column(), Roster));
                p.spawn(label("Body parts", 17.0)); p.spawn((column(), BodyRoster));
            });
            p.spawn((Node { flex_grow: 1.0, min_width: px(0), ..column() },)).with_children(|p| {
                p.spawn((label("", 15.0), Detail));
                for (control, caption) in [(Control::Equip, "Equip on chosen body part"), (Control::Key("UnequipComponent"), "Remove gear"), (Control::Wiring, "Connect power..."), (Control::Key("DisconnectComponent"), "Disconnect power"), (Control::Key("RepairComponent"), "Repair gear with supplies"), (Control::Key("RestCreature"), "Rest - heal the wayfarer")] {
                    p.spawn(button(control)).with_children(|b| { b.spawn(label(caption, 15.0)); });
                }
                p.spawn((column(), WireRoster));
                p.spawn(label("Repair fixes gear and costs supplies. Rest heals the body. Neither replaces the other.", 14.0));
                p.spawn(label("Automatic expedition orders", 16.0));
                for i in 0..2 { p.spawn(button(Control::Doctrine(i))).with_children(|b| { b.spawn(label("", 14.0)); }); }
            });
        });
    });
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: px(16),
                right: px(16),
                bottom: px(44),
                max_width: px(680),
                padding: UiRect::all(px(10)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.045, 0.075, 0.085, 0.9)),
            Panel,
        ))
        .with_children(|p| {
            p.spawn((label("", 15.0), Report));
        });
    commands.spawn((
        label("F5 Save  |  F6 Developer tuning", 13.0),
        Node {
            position_type: PositionType::Absolute,
            left: px(16),
            bottom: px(16),
            ..default()
        },
        Panel,
    ));
}

pub(super) fn layout(
    mode: Res<Mode>,
    windows: Query<&Window, With<PrimaryWindow>>,
    mut panels: Query<(&mut Node, &mut ScrollPosition), With<Outfitting>>,
    selection: Option<Res<Selection>>,
    mut wheel: MessageReader<MouseWheel>,
) {
    if !mode.workshop {
        return;
    }
    let Ok(window) = windows.single() else {
        return;
    };
    for (mut node, mut scroll) in &mut panels {
        node.width = px((window.width() - 32.0).min(660.0));
        if selection.as_ref().is_some_and(|s| s.open) {
            for event in wheel.read() {
                scroll.y = (scroll.y - event.y * 32.0).max(0.0);
            }
        }
    }
}

fn unavailable(
    control: &Control,
    view: &native::WorkshopView,
    selection: &Selection,
) -> Option<&'static str> {
    let chosen = view.components.iter().find(|c| c.selected);
    match control {
        Control::Outfit if view.phase == "Expedition" => Some("Return to change gear"),
        Control::Equip if selection.body.is_none() => Some("Choose a body part first"),
        Control::Equip
            if !chosen.is_some_and(|c| {
                selection
                    .body
                    .and_then(|i| view.body_parts.get(i))
                    .is_some_and(|p| c.available_fit.contains(&p.fit))
            }) =>
        {
            Some("Choose a body part marked fits")
        }
        Control::Key("UnequipComponent") if !chosen.is_some_and(|c| c.mounted) => {
            Some("Gear is already removed")
        }
        Control::Key("DisconnectComponent") if !chosen.is_some_and(|c| c.linked) => {
            Some("Already disconnected")
        }
        Control::Key("RepairComponent")
            if chosen.is_some_and(|c| c.readings["health"] >= c.readings["max-health"]) =>
        {
            Some("Gear needs no repair")
        }
        Control::Key("RepairComponent") if view.readings["stock"] < 1.0 => {
            Some("Repair needs supplies")
        }
        Control::Key("RestCreature") if view.creature_condition >= 100.0 => {
            Some("Wayfarer is fully rested")
        }
        Control::Key("LaunchExpedition") if view.phase == "Expedition" => {
            Some("Already on expedition")
        }
        Control::Key("WithdrawExpedition") if view.phase != "Expedition" => Some("Already home"),
        _ => None,
    }
}

fn gear_description(id: &str) -> &'static str {
    match id {
        "ember-core" | "auxiliary-core" => {
            "Supplies power to connected gear. Fit it to the back, then connect other gear to it."
        }
        "drive" => "Powered braces help the wayfarer carry equipment and travel faster.",
        "lance" => {
            "An arm-mounted weapon for fighting the sentinel. It needs a live power connection."
        }
        "cooler" => "Vents heat while powered, helping the wayfarer keep fighting.",
        "armor" | "helmet" => "Protects the body part it covers. Heavier equipment slows travel.",
        _ => "Fit this equipment to a compatible body part.",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn damage_feedback_requires_fresh_health_loss_and_expires_without_new_events() {
        let session =
            NativeSession::open(include_bytes!("../../world/workshop-expedition.clause")).unwrap();
        let mut snapshot = session.snapshot(0, String::new()).unwrap();
        snapshot.workshop.as_mut().unwrap().phase = "Expedition".into();
        let mut feedback = CombatFeedback::default();
        feedback.observe(&snapshot, 0.0);
        assert_eq!(feedback.enemy_impact, 0.0);
        assert_eq!(feedback.wayfarer_impact, 0.0);
        snapshot.ticks += 1;
        snapshot
            .workshop
            .as_mut()
            .unwrap()
            .readings
            .insert("action".into(), 2.0);
        feedback.observe(&snapshot, 0.0);
        assert_eq!(
            feedback.enemy_impact, 0.0,
            "firing alone does not invent a hit"
        );
        snapshot.ticks += 1;
        let view = snapshot.workshop.as_mut().unwrap();
        *view.readings.get_mut("threat-health").unwrap() -= 1.0;
        view.creature_condition -= 1.0;
        feedback.observe(&snapshot, 0.0);
        assert!(feedback.enemy_impact > 0.0 && feedback.wayfarer_impact > 0.0);
        feedback.observe(&snapshot, 0.3);
        assert_eq!(
            feedback.enemy_impact, 0.0,
            "repeated frames do not replay health loss"
        );
        assert_eq!(feedback.wayfarer_impact, 0.0);
        snapshot.ticks += 1;
        snapshot.workshop.as_mut().unwrap().creature_condition += 1.0;
        feedback.observe(&snapshot, 0.0);
        assert_eq!(feedback.wayfarer_impact, 0.0, "healing is not an impact");
    }

    #[test]
    fn outfit_is_closed_until_requested_and_recovery_controls_explain_availability() {
        let session =
            NativeSession::open(include_bytes!("../../world/workshop-expedition.clause")).unwrap();
        let snapshot = session.snapshot(0, "Workshop ready".into()).unwrap();
        let view = snapshot.workshop.as_ref().unwrap();
        assert_eq!(
            unavailable(
                &Control::Key("RepairComponent"),
                view,
                &Selection::default()
            ),
            Some("Gear needs no repair")
        );
        assert_eq!(
            unavailable(&Control::Key("RestCreature"), view, &Selection::default()),
            Some("Wayfarer is fully rested")
        );
        assert_eq!(
            unavailable(&Control::Equip, view, &Selection::default()),
            Some("Choose a body part first")
        );
        let mut app = App::new();
        app.insert_resource(Displayed {
            snapshot: Some(snapshot),
            status: "Workshop ready".into(),
            ..default()
        });
        app.add_systems(Startup, |mut commands: Commands| setup(&mut commands));
        app.add_systems(Update, present);
        app.update();
        let panel = app
            .world_mut()
            .query_filtered::<Entity, With<Outfitting>>()
            .single(app.world())
            .unwrap();
        assert_eq!(
            *app.world().get::<Visibility>(panel).unwrap(),
            Visibility::Hidden
        );
        app.world_mut().resource_mut::<Selection>().open = true;
        app.update();
        assert_eq!(
            *app.world().get::<Visibility>(panel).unwrap(),
            Visibility::Inherited
        );
        let reports = app
            .world_mut()
            .query_filtered::<&Text, With<Report>>()
            .iter(app.world())
            .map(|t| t.0.clone())
            .collect::<Vec<_>>();
        assert!(reports.iter().all(|text| !text.contains("Workshop ready")));
    }
}

pub(super) fn controls(
    bridge: Res<Bridge>,
    display: Res<Displayed>,
    keys: Res<ButtonInput<KeyCode>>,
    interactions: Query<(&Interaction, &Control), Changed<Interaction>>,
    selection: Option<ResMut<Selection>>,
) {
    if display.editing || display.editor_handled_frame {
        return;
    }
    let Some(snapshot) = &display.snapshot else {
        return;
    };
    let Some(view) = &snapshot.workshop else {
        return;
    };
    let Some(mut selection) = selection else {
        return;
    };
    let mut actions = interactions
        .iter()
        .filter(|(i, _)| **i == Interaction::Pressed)
        .map(|(_, c)| c.clone())
        .collect::<Vec<_>>();
    if keys.just_pressed(KeyCode::KeyO) {
        actions.push(Control::Outfit);
    }
    if keys.just_pressed(KeyCode::Slash) {
        actions.push(Control::Help);
    }
    if keys.just_pressed(KeyCode::Escape) {
        selection.open = false;
        selection.wiring = false;
    }
    for (key, binding) in [
        (KeyCode::Enter, "LaunchExpedition"),
        (KeyCode::Backspace, "WithdrawExpedition"),
    ] {
        if keys.just_pressed(key) {
            actions.push(Control::Key(binding));
        }
    }
    let mut inputs = Vec::new();
    for action in actions {
        if unavailable(&action, view, &selection).is_some() {
            continue;
        }
        let input = match action {
            Control::Outfit => {
                selection.open = !selection.open;
                selection.wiring = false;
                None
            }
            Control::Help => {
                selection.help_dismissed = !selection.help_dismissed;
                None
            }
            Control::Body(i) => {
                selection.body = Some(i);
                None
            }
            Control::Wiring => {
                selection.wiring = !selection.wiring;
                None
            }
            Control::Equip => selection
                .body
                .and_then(|i| view.body_parts.get(i))
                .map(|p| native::reference("FitComponent", p.fit.clone())),
            Control::Pick(i) => {
                selection.wiring = false;
                view.components
                    .get(i)
                    .map(|p| native::reference("PickComponent", p.pick.clone()))
            }
            Control::Wire(i) => {
                selection.wiring = false;
                view.components
                    .get(i)
                    .and_then(|p| p.wire.clone())
                    .map(|r| native::reference("WireComponent", r))
            }
            Control::Doctrine(i) => view
                .doctrines
                .get(i)
                .map(|d| native::reference("ChooseDoctrine", d.reference.clone())),
            Control::Key(binding) => {
                if binding == "LaunchExpedition" {
                    selection.open = false;
                    selection.help_dismissed = true;
                }
                Some(native::key(binding))
            }
        };
        if let Some(input) = input {
            inputs.push(input);
        }
    }
    if !inputs.is_empty() {
        submit(&bridge, Request::Input(snapshot.generation, inputs));
    }
}

pub(super) fn present(
    mut commands: Commands,
    mut display: ResMut<Displayed>,
    selection: Option<Res<Selection>>,
    mut panels: Query<(&mut Visibility, Option<&Outfitting>), With<Panel>>,
    mut text: Query<(
        &mut Text,
        Option<&Readout>,
        Option<&Detail>,
        Option<&Report>,
    )>,
    mut buttons: Query<(
        &Control,
        &Children,
        &Interaction,
        &mut BackgroundColor,
        &mut Node,
    )>,
    roster: Query<Entity, With<Roster>>,
    body_roster: Query<Entity, With<BodyRoster>>,
    wire_roster: Query<Entity, With<WireRoster>>,
    mut initialized: Local<bool>,
) {
    let Some(view) = display.snapshot.as_ref().and_then(|s| s.workshop.as_ref()) else {
        return;
    };
    let Some(selection) = selection else {
        return;
    };
    let expedition = view.phase == "Expedition";
    for (mut visibility, outfit) in &mut panels {
        *visibility = if display.editing || (outfit.is_some() && (expedition || !selection.open)) {
            Visibility::Hidden
        } else {
            Visibility::Inherited
        };
    }
    let r = &view.readings;
    let chosen = view.components.iter().find(|c| c.selected);
    for (mut content, readout, detail, report) in &mut text {
        if readout.is_some() {
            let activity = if expedition {
                match r["action"] as i32 {
                    0 => "Returning",
                    1 => "Travelling",
                    2 => "Firing",
                    3 => "Cooling",
                    4 => "Gathering",
                    _ => "On expedition",
                }
            } else {
                "Home"
            };
            **content = format!(
                "{}  |  {}  |  Salvage {:.0}/{:.0}\nCondition {:.0}%  Heat {:.0}  Reserve {:.0}{}",
                view.creature_name,
                activity,
                r["cargo"],
                r["objective"],
                view.creature_condition,
                r["heat"],
                r["reserve"],
                if expedition {
                    String::new()
                } else {
                    format!("  |  Supplies {:.0}", r["stock"])
                }
            );
        } else if detail.is_some() {
            **content = chosen.map(|c| {
                let attachment = view.body_parts.iter().find(|p| Some(&p.fit) == c.attached_to.as_ref()).map(|p| p.label.as_str()).unwrap_or("Not equipped");
                let upstream = view.components.iter().find(|p| Some(&p.pick) == c.upstream.as_ref()).map(|p| p.label.as_str()).unwrap_or("None");
                format!("{}\n{}\n\n{}\n\nGear {:.0}/{:.0}  Weight {:.0}\n{} - connected to {}\nTotal load {:.0}  Available power {:.0}\n\n{}",
                    c.label, attachment, gear_description(&c.id), c.readings["health"], c.readings["max-health"], c.readings["mass"],
                    if c.powered { "Powered" } else { "No power" }, if c.linked { upstream } else { "nothing" }, r["total-mass"], r["available-power"], view.fit_report)
            }).unwrap_or_default();
        } else if report.is_some() {
            let notice = match display.status.as_str() {
                "Workshop ready" | "Company ready" => "",
                other => other,
            };
            let guidance = if !selection.help_dismissed && !selection.open {
                "FIRST TRIP: Outfit your gear, then Deploy. Travel, combat and gathering are automatic; you choose gear and orders, and can Return at any time.\nHeat pauses firing while cooling. Reserve is expedition energy; your orders set when to return. Condition is body health. Fill the salvage goal and bring it home for supplies.\nRepair fixes gear using supplies. Rest heals the body."
            } else if expedition {
                "Reach the ashfield sentinel, defeat it and gather salvage. Return at any time."
            } else if view.phase == "Returned" {
                "Home again. Salvage is banked. Open Outfit to repair worn gear and rest injuries before the next trip."
            } else {
                "Ready for a trip? Inspect your gear with Outfit, or Deploy to set out."
            };
            **content = if selection.open {
                notice.to_owned()
            } else if expedition && selection.help_dismissed {
                format!(
                    "Automatic expedition - Return at any time.\n{}{}",
                    view.report,
                    if notice.is_empty() {
                        String::new()
                    } else {
                        format!("\n{notice}")
                    }
                )
            } else if notice.is_empty() {
                guidance.to_owned()
            } else {
                format!("{guidance}\n{notice}")
            };
        }
    }
    for (control, children, interaction, mut background, mut node) in &mut buttons {
        node.display = match control {
            Control::Key("LaunchExpedition") if expedition => Display::None,
            Control::Outfit if expedition => Display::None,
            Control::Wire(_) if !selection.wiring => Display::None,
            Control::Equip
            | Control::Doctrine(_)
            | Control::Key(
                "UnequipComponent"
                | "DisconnectComponent"
                | "RepairComponent"
                | "RestCreature"
                | "LaunchExpedition",
            ) if selection.wiring => Display::None,
            Control::Key("WithdrawExpedition") if !expedition => Display::None,
            _ => Display::Flex,
        };
        let (mut caption, selected) = match control {
            Control::Outfit => (
                if selection.open {
                    "Close outfit [O]"
                } else {
                    "Outfit [O]"
                }
                .into(),
                selection.open,
            ),
            Control::Help => (
                if selection.help_dismissed {
                    "How to play [?]"
                } else {
                    "Hide help [?]"
                }
                .into(),
                false,
            ),
            Control::Equip => ("Equip on chosen body part".into(), false),
            Control::Key("RepairComponent") => ("Repair gear with supplies".into(), false),
            Control::Key("RestCreature") => ("Rest - heal the wayfarer".into(), false),
            Control::Key("UnequipComponent") => ("Remove gear".into(), false),
            Control::Key("DisconnectComponent") => ("Disconnect power".into(), false),
            Control::Wiring => (
                if selection.wiring {
                    "Cancel power connection"
                } else {
                    "Connect power..."
                }
                .into(),
                selection.wiring,
            ),
            Control::Pick(i) => view
                .components
                .get(*i)
                .map(|c| {
                    (
                        format!("{}{}", c.label, if c.mounted { " [on]" } else { "" }),
                        c.selected,
                    )
                })
                .unwrap_or_default(),
            Control::Wire(i) => view
                .components
                .get(*i)
                .map(|c| (format!("Connect to {}", c.label), false))
                .unwrap_or_default(),
            Control::Body(i) => view
                .body_parts
                .get(*i)
                .map(|p| {
                    (
                        format!(
                            "{}  {:.0}/{:.0}{}",
                            p.label,
                            p.health,
                            p.maximum_health,
                            if chosen.is_some_and(|c| c.available_fit.contains(&p.fit)) {
                                " [fits]"
                            } else {
                                ""
                            }
                        ),
                        selection.body == Some(*i),
                    )
                })
                .unwrap_or_default(),
            Control::Doctrine(i) => view
                .doctrines
                .get(*i)
                .map(|d| {
                    (
                        format!(
                            "{}\nHeat limit {:.0} / reserve {:.0}",
                            d.label, d.heat_limit, d.reserve_floor
                        ),
                        d.selected,
                    )
                })
                .unwrap_or_default(),
            _ => (String::new(), false),
        };
        let reason = unavailable(control, view, &selection);
        if let Some(reason) = reason {
            caption = reason.into();
        }
        background.0 = if reason.is_some() {
            Color::srgb(0.08, 0.10, 0.11)
        } else if *interaction == Interaction::Hovered {
            Color::srgb(0.28, 0.37, 0.35)
        } else if selected {
            Color::srgb(0.26, 0.36, 0.23)
        } else if matches!(control, Control::Key("LaunchExpedition")) {
            Color::srgb(0.34, 0.28, 0.10)
        } else {
            Color::srgb(0.10, 0.17, 0.19)
        };
        if !caption.is_empty() {
            for child in children.iter() {
                if let Ok((mut content, _, _, _)) = text.get_mut(child) {
                    **content = caption.clone();
                }
            }
        }
    }
    if !*initialized {
        for (entities, count, kind) in [
            (roster.single().ok(), view.components.len(), 0),
            (body_roster.single().ok(), view.body_parts.len(), 1),
            (wire_roster.single().ok(), view.components.len(), 2),
        ] {
            if let Some(entity) = entities {
                commands.entity(entity).with_children(|p| {
                    for i in 0..count {
                        p.spawn(button(match kind {
                            0 => Control::Pick(i),
                            1 => Control::Body(i),
                            _ => Control::Wire(i),
                        }))
                        .with_children(|b| {
                            b.spawn(label("", 14.0));
                        });
                    }
                });
            }
        }
        *initialized = true;
    }
    if let Some((generation, started)) = display.edit_receipt.take() {
        eprintln!(
            "native edited workshop projection submitted to scene: {} ms; generation {:?}",
            started.elapsed().as_millis(),
            generation
        );
    }
}

pub(super) fn scene(
    mut commands: Commands,
    display: Res<Displayed>,
    assets: Res<AssetServer>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut scenery: Query<
        (&Scenery, &mut Transform, &mut Visibility),
        (Without<WorkshopCamera>, Without<Creature>),
    >,
    mut camera: Query<&mut Transform, (With<WorkshopCamera>, Without<Scenery>, Without<Creature>)>,
    mut creature: Query<
        (&mut Transform, &mut Motion),
        (With<Creature>, Without<WorkshopCamera>, Without<Scenery>),
    >,
    mut initialized: Local<bool>,
) {
    let Some(view) = display.snapshot.as_ref().and_then(|s| s.workshop.as_ref()) else {
        return;
    };
    let expedition = view.phase == "Expedition";
    let position = Vec3::new(0.0, 0.0, -view.readings["position"] as f32);
    let destination = view.readings["encounter-position"] as f32;
    if !*initialized {
        commands
            .spawn((
                Creature,
                Actor {
                    id: "wayfarer".into(),
                },
                Motion {
                    moving: false,
                    alive: true,
                },
                Transform::default(),
                Visibility::default(),
            ))
            .with_children(|p| {
                p.spawn((
                    WorldAssetRoot(
                        assets.load(
                            GltfAssetLabel::Scene(0)
                                .from_asset("external/quaternius/rts-company/Worker_Female.gltf"),
                        ),
                    ),
                    Transform::default(),
                ));
            });
        let steel = materials.add(Color::srgb(0.12, 0.17, 0.19));
        commands.spawn((
            Scenery::Bench,
            Mesh3d(meshes.add(Cylinder::new(2.5, 0.18))),
            MeshMaterial3d(steel),
            Transform::from_xyz(0.0, -0.12, 0.0),
        ));
        let ash = materials.add(Color::srgb(0.16, 0.14, 0.13));
        commands.spawn((
            Scenery::Ash,
            Mesh3d(meshes.add(Plane3d::default().mesh().size(90.0, 90.0))),
            MeshMaterial3d(ash),
            Transform::from_xyz(0.0, -0.08, -10.0),
        ));
        let rock = materials.add(Color::srgb(0.29, 0.24, 0.21));
        for (x, z, scale) in [
            (-3.0, 2.0, 0.6),
            (3.0, -2.0, 0.8),
            (-3.0, -5.0, 0.7),
            (3.0, -9.0, 1.0),
            (-4.0, -12.0, 1.4),
            (4.0, -16.0, 0.8),
        ] {
            commands.spawn((
                Scenery::Ash,
                Mesh3d(meshes.add(Sphere::new(scale))),
                MeshMaterial3d(rock.clone()),
                Transform::from_xyz(x, 0.0, z).with_scale(Vec3::new(1.0, 0.6, 0.8)),
            ));
        }
        commands
            .spawn((
                Scenery::Sentinel,
                Mesh3d(meshes.add(Cuboid::new(1.5, 1.5, 0.9))),
                MeshMaterial3d(materials.add(StandardMaterial {
                    base_color: Color::srgb(0.55, 0.15, 0.07),
                    emissive: LinearRgba::new(0.3, 0.03, 0.0, 1.0),
                    metallic: 0.7,
                    ..default()
                })),
                Transform::default(),
            ))
            .with_children(|p| {
                let dark = materials.add(Color::srgb(0.13, 0.08, 0.06));
                let eye = materials.add(StandardMaterial {
                    base_color: Color::srgb(1.0, 0.25, 0.03),
                    emissive: LinearRgba::new(4.0, 0.3, 0.02, 1.0),
                    ..default()
                });
                p.spawn((
                    Mesh3d(meshes.add(Cuboid::new(1.1, 0.18, 0.15))),
                    MeshMaterial3d(eye),
                    Transform::from_xyz(0.0, 0.3, 0.53),
                ));
                for x in [-1.0, 1.0] {
                    p.spawn((
                        Mesh3d(meshes.add(Cuboid::new(0.35, 1.0, 0.45))),
                        MeshMaterial3d(dark.clone()),
                        Transform::from_xyz(x, 0.45, 0.0)
                            .with_rotation(Quat::from_rotation_z(-x * 0.3)),
                    ));
                    p.spawn((
                        Mesh3d(meshes.add(Cuboid::new(0.35, 0.35, 1.5))),
                        MeshMaterial3d(dark.clone()),
                        Transform::from_xyz(x, -0.35, 0.5),
                    ));
                }
            });
        commands.spawn((
            Scenery::Cache,
            Mesh3d(meshes.add(Cuboid::new(0.8, 0.6, 0.8))),
            MeshMaterial3d(materials.add(Color::srgb(0.9, 0.64, 0.19))),
            Transform::default(),
        ));
        *initialized = true;
    }
    for (mut transform, mut motion) in &mut creature {
        transform.translation = position;
        let action = view.readings["action"];
        motion.moving = expedition && (action == 0.0 || action == 1.0);
        transform.rotation = Quat::from_rotation_y(if !expedition {
            -0.4
        } else if action == 0.0 {
            0.0
        } else {
            std::f32::consts::PI
        });
    }
    for (kind, mut transform, mut visibility) in &mut scenery {
        *visibility = match kind {
            Scenery::Bench if expedition => Visibility::Hidden,
            Scenery::Ash | Scenery::Sentinel | Scenery::Cache if !expedition => Visibility::Hidden,
            _ => Visibility::Inherited,
        };
        match kind {
            Scenery::Sentinel => {
                transform.translation = Vec3::new(0.0, 1.0, -destination - 2.0);
                if view.readings["threat-health"] <= 0.0 {
                    transform.rotation = Quat::from_rotation_z(std::f32::consts::FRAC_PI_2);
                    transform.translation.y = 0.2;
                } else {
                    transform.rotation = Quat::IDENTITY;
                }
            }
            Scenery::Cache => {
                transform.translation = Vec3::new(1.6, 0.3, -destination - 2.0);
            }
            _ => {}
        }
    }
    for mut transform in &mut camera {
        let center = position + Vec3::Y * 1.2;
        *transform = Transform::from_translation(
            center
                + if expedition {
                    Vec3::new(5.0, 3.5, 6.5)
                } else {
                    Vec3::new(3.5, 1.5, 6.0)
                },
        )
        .looking_at(center, Vec3::Y);
    }
}

#[derive(Default)]
pub(super) struct CombatFeedback {
    observed: Option<(WasmSessionHandleV1, u64, f64, f64, BTreeMap<String, f64>)>,
    enemy_impact: f32,
    wayfarer_impact: f32,
}

impl CombatFeedback {
    fn observe(&mut self, snapshot: &Snapshot, seconds: f32) {
        self.enemy_impact = (self.enemy_impact - seconds).max(0.0);
        self.wayfarer_impact = (self.wayfarer_impact - seconds).max(0.0);
        let Some(view) = &snapshot.workshop else {
            return;
        };
        if view.phase != "Expedition" {
            self.observed = None;
            self.enemy_impact = 0.0;
            self.wayfarer_impact = 0.0;
            return;
        }
        if let Some((generation, tick, enemy, condition, gear)) = &self.observed {
            if *generation == snapshot.generation && *tick == snapshot.ticks {
                return;
            }
            if *generation == snapshot.generation && *tick < snapshot.ticks {
                if view.readings["threat-health"] < *enemy {
                    self.enemy_impact = 0.18;
                }
                if view.creature_condition < *condition
                    || view.components.iter().any(|c| {
                        gear.get(&c.id)
                            .is_some_and(|old| c.readings["health"] < *old)
                    })
                {
                    self.wayfarer_impact = 0.18;
                }
            } else {
                self.enemy_impact = 0.0;
                self.wayfarer_impact = 0.0;
            }
        }
        self.observed = Some((
            snapshot.generation,
            snapshot.ticks,
            view.readings["threat-health"],
            view.creature_condition,
            view.components
                .iter()
                .map(|c| (c.id.clone(), c.readings["health"]))
                .collect(),
        ));
    }
}

pub(super) fn combat_feedback(
    display: Res<Displayed>,
    time: Res<Time>,
    gear: Query<(&Gear, &GlobalTransform, &Visibility)>,
    mut feedback: Local<CombatFeedback>,
    mut gizmos: Gizmos,
) {
    let Some(snapshot) = &display.snapshot else {
        return;
    };
    feedback.observe(snapshot, time.delta_secs());
    let Some(view) = &snapshot.workshop else {
        return;
    };
    if view.phase != "Expedition" || display.editing {
        return;
    }
    let body = Vec3::new(0.0, 1.1, -view.readings["position"] as f32);
    let enemy = Vec3::new(0.0, 1.2, -view.readings["encounter-position"] as f32 - 1.45);
    let clock = time.elapsed_secs();
    // Shot cadence and spark travel are cosmetic; only source observations trigger damage flashes.
    if view.readings["action"] == 2.0 && (clock * 5.0).fract() < 0.6 {
        if let Some((_, transform, _)) = gear.iter().find(|(gear, _, visible)| {
            *visible != &Visibility::Hidden
                && view
                    .components
                    .get(gear.component)
                    .is_some_and(|c| c.id == "lance" && c.mounted)
        }) {
            let muzzle = transform.translation();
            let gold = Color::srgb(1.0, 0.85, 0.20);
            for offset in [-0.045, 0.0, 0.045] {
                gizmos.line(muzzle + Vec3::Y * offset, enemy + Vec3::Y * offset, gold);
            }
            gizmos.sphere(Isometry3d::from_translation(muzzle), 0.19, gold);
        }
    }
    for (point, strength, color) in [
        (enemy, feedback.enemy_impact, Color::srgb(1.0, 0.82, 0.23)),
        (body, feedback.wayfarer_impact, Color::srgb(1.0, 0.24, 0.08)),
    ] {
        if strength <= 0.0 {
            continue;
        }
        let radius = 0.25 + (0.18 - strength) * 3.0;
        gizmos.sphere(Isometry3d::from_translation(point), radius, color);
        for i in 0..8 {
            let angle = i as f32 * std::f32::consts::TAU / 8.0 + clock;
            let direction = Vec3::new(angle.cos(), angle.sin(), 0.3);
            gizmos.line(
                point + direction * radius,
                point + direction * (radius + 0.3),
                color,
            );
        }
    }
    if view.readings["action"] == 3.0 {
        for i in 0..6 {
            let rise = (clock * 0.7 + i as f32 / 6.0).fract();
            let plume = body + Vec3::new(if i % 2 == 0 { -0.35 } else { 0.35 }, rise * 1.2, 0.2);
            gizmos.sphere(
                Isometry3d::from_translation(plume),
                0.09 + rise * 0.14,
                Color::srgba(0.4, 0.85, 1.0, 1.0 - rise),
            );
        }
    }
}

pub(super) fn enemy_label(
    display: Res<Displayed>,
    cameras: Query<(&Camera, &GlobalTransform), With<WorkshopCamera>>,
    mut labels: Query<(&mut Text, &mut Node, &mut Visibility), With<SentinelLabel>>,
) {
    let Some(view) = display.snapshot.as_ref().and_then(|s| s.workshop.as_ref()) else {
        return;
    };
    let Ok((camera, transform)) = cameras.single() else {
        return;
    };
    for (mut text, mut node, mut visibility) in &mut labels {
        let point = Vec3::new(0.0, 2.6, -view.readings["encounter-position"] as f32 - 2.0);
        if view.phase == "Expedition" && !display.editing {
            if let Ok(position) = camera.world_to_viewport(transform, point) {
                node.left = px(position.x - 100.0);
                node.top = px(position.y);
                **text = format!(
                    "ASHFIELD SENTINEL\n{:.0}/{:.0}",
                    view.readings["threat-health"], view.readings["threat-maximum"]
                );
                *visibility = Visibility::Inherited;
                continue;
            }
        }
        *visibility = Visibility::Hidden;
    }
}

// Bone names and local dressing geometry are presentation, never fitting rules.
pub(super) fn equipment(
    mut commands: Commands,
    display: Res<Displayed>,
    bones: Query<(Entity, &Name), Without<Socket>>,
    parents: Query<&ChildOf>,
    creatures: Query<(), With<Creature>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut gear: Query<(&Gear, &mut Visibility, &MeshMaterial3d<StandardMaterial>)>,
) {
    let Some(view) = display.snapshot.as_ref().and_then(|s| s.workshop.as_ref()) else {
        return;
    };
    for (entity, name) in &bones {
        let body = match name.as_str() {
            "Head" => "head",
            "Torso" => "torso",
            "Fist.L" => "left-arm",
            "Fist.R" => "right-arm",
            "UpperLeg.L" | "UpperLeg.R" => "legs",
            _ => continue,
        };
        let mut root = entity;
        let mut owned = false;
        for _ in 0..32 {
            if creatures.contains(root) {
                owned = true;
                break;
            }
            let Ok(parent) = parents.get(root) else {
                break;
            };
            root = parent.parent();
        }
        if !owned {
            continue;
        }
        commands.entity(entity).insert(Socket);
        for (index, component) in view.components.iter().enumerate() {
            // Every potential attachment is rendered from the matching source body referent.
            let shape = match component.id.as_str() {
                "helmet" if body == "head" => Some((
                    Mesh::from(Sphere::new(0.29)),
                    Vec3::new(0.0, 0.24, -0.035),
                    Vec3::new(1.12, 0.7, 1.0),
                )),
                "armor" if body == "torso" => Some((
                    Mesh::from(Sphere::new(0.38)),
                    Vec3::new(0.0, 0.13, 0.0),
                    Vec3::new(1.35, 1.0, 0.8),
                )),
                "drive" if body == "legs" => Some((
                    Mesh::from(Capsule3d::new(0.10, 0.40)),
                    Vec3::new(0.16, 0.24, 0.0),
                    Vec3::ONE,
                )),
                "lance" if body == "left-arm" || body == "right-arm" => Some((
                    Mesh::from(Capsule3d::new(0.12, 1.0)),
                    Vec3::new(0.0, 0.30, 0.0),
                    Vec3::ONE,
                )),
                "ember-core" | "auxiliary-core" if body == "torso" => Some((
                    Mesh::from(Cylinder::new(0.19, 0.60)),
                    Vec3::new(
                        if component.id == "ember-core" {
                            -0.23
                        } else {
                            0.23
                        },
                        0.10,
                        -0.34,
                    ),
                    Vec3::ONE,
                )),
                "cooler" if body == "torso" => Some((
                    Mesh::from(Cuboid::new(0.82, 0.12, 0.20)),
                    Vec3::new(0.0, 0.42, -0.35),
                    Vec3::ONE,
                )),
                _ => None,
            };
            if let Some((mesh, offset, scale)) = shape {
                let part = if matches!(
                    component.id.as_str(),
                    "ember-core" | "auxiliary-core" | "cooler"
                ) {
                    "back"
                } else {
                    body
                };
                commands.entity(entity).with_children(|p| {
                    p.spawn((
                        Gear {
                            component: index,
                            part: part.into(),
                        },
                        Mesh3d(meshes.add(mesh)),
                        MeshMaterial3d(materials.add(StandardMaterial {
                            metallic: 0.75,
                            perceptual_roughness: 0.35,
                            ..default()
                        })),
                        Transform::from_translation(offset).with_scale(scale),
                        Visibility::Hidden,
                    ));
                });
            }
        }
    }
    for (gear, mut visibility, material) in &mut gear {
        let Some(component) = view.components.get(gear.component) else {
            continue;
        };
        let attached = view
            .body_parts
            .iter()
            .any(|p| p.id == gear.part && Some(&p.fit) == component.attached_to.as_ref());
        *visibility = if attached && component.mounted {
            Visibility::Inherited
        } else {
            Visibility::Hidden
        };
        if let Some(mut material) = materials.get_mut(&material.0) {
            let damaged = component.readings["health"] < component.readings["max-health"];
            let color = if damaged {
                Color::srgb(0.56, 0.23, 0.10)
            } else if component.powered {
                Color::srgb(0.25, 0.62, 0.58)
            } else {
                Color::srgb(0.24, 0.28, 0.31)
            };
            material.base_color = color;
            material.emissive = color.to_linear() * if component.powered { 0.2 } else { 0.0 };
        }
    }
}
