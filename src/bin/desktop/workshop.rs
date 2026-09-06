//! Workshop layout and input bindings; all outcomes are projected from Clause.
use super::*;

#[derive(Component, Clone)]
pub(super) enum Control {
    Pick(usize),
    Wire(usize),
    Doctrine(usize),
    Key(&'static str),
}
#[derive(Component)]
pub(super) struct Panel;
#[derive(Component)]
pub(super) struct Readout;
#[derive(Component)]
pub(super) struct Detail;
#[derive(Component)]
pub(super) struct Report;
#[derive(Component)]
pub(super) struct Part(usize);
#[derive(Component)]
pub(super) struct Roster;
#[derive(Component)]
pub(super) struct WorkshopCamera;
#[derive(Component)]
pub(super) enum Scenery {
    Bench,
    Ash,
    Chassis(Vec3),
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

pub(super) fn setup(commands: &mut Commands) {
    commands.spawn((
        Camera3d::default(),
        WorkshopCamera,
        Transform::from_xyz(0.0, 17.0, 15.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: 18000.0,
            ..default()
        },
        Transform::from_xyz(-8.0, 15.0, 8.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        label("Opening the workshop...", 17.0),
        Node {
            position_type: PositionType::Absolute,
            left: px(24),
            top: px(12),
            right: px(24),
            ..default()
        },
        Hud,
    ));
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: px(22),
                top: px(22),
                width: px(300),
                bottom: px(92),
                flex_direction: FlexDirection::Column,
                row_gap: px(7),
                padding: UiRect::all(px(16)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.06, 0.09, 0.10, 0.96)),
            Panel,
        ))
        .with_children(|parent| {
            parent.spawn(label("GREYWROUGHT", 27.0));
            parent.spawn(label("MACHINE ASSEMBLY", 14.0));
            parent.spawn(label(
                "Select a part. Wire it to a power source using that source’s WIRE TO button.",
                14.0,
            ));
            parent.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    row_gap: px(4),
                    ..default()
                },
                Roster,
            ));
            parent.spawn((label("", 14.0), Detail));
        });
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                right: px(22),
                top: px(22),
                width: px(290),
                bottom: px(92),
                flex_direction: FlexDirection::Column,
                row_gap: px(12),
                padding: UiRect::all(px(18)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.06, 0.09, 0.10, 0.96)),
            Panel,
        ))
        .with_children(|parent| {
            parent.spawn((label("", 18.0), Readout));
            parent.spawn(label("PILOT DOCTRINE", 15.0));
            for index in 0..2 {
                parent
                    .spawn((
                        Button,
                        Node {
                            padding: UiRect::all(px(10)),
                            min_height: px(62),
                            ..default()
                        },
                        BackgroundColor(Color::srgb(0.12, 0.18, 0.20)),
                        Control::Doctrine(index),
                    ))
                    .with_children(|button| {
                        button.spawn(label("Loading doctrine", 15.0));
                    });
            }
            for (binding, caption) in [
                ("ToggleMount", "M · Mount / remove selected"),
                ("DisconnectComponent", "X · Disconnect selected"),
                ("RepairComponent", "R · Repair selected"),
                ("LaunchExpedition", "ENTER · Depart"),
                ("WithdrawExpedition", "BACKSPACE · Return home"),
            ] {
                parent
                    .spawn((
                        Button,
                        Node {
                            padding: UiRect::all(px(10)),
                            min_height: px(38),
                            ..default()
                        },
                        BackgroundColor(Color::srgb(0.17, 0.23, 0.23)),
                        Control::Key(binding),
                    ))
                    .with_children(|button| {
                        button.spawn(label(caption, 15.0));
                    });
            }
        });
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: px(345),
                right: px(335),
                top: px(30),
                padding: UiRect::all(px(18)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.06, 0.09, 0.10, 0.94)),
            Panel,
        ))
        .with_children(|parent| {
            parent.spawn((label("", 22.0), Report));
        });
    commands.spawn((Node { position_type: PositionType::Absolute, left: px(22), right: px(22), bottom: px(20), padding: UiRect::all(px(15)), ..default() }, BackgroundColor(Color::srgb(0.06, 0.09, 0.10)), Panel)).with_children(|parent| {
        parent.spawn(label("1–6 select part · Shift + 1–6 wire selected part to target · C / V choose doctrine\nBright = powered · Rust = damaged · Detached parts sit outside the frame · F5 save · F6 developer tuning", 15.0));
    });
}

pub(super) fn controls(
    bridge: Res<Bridge>,
    display: Res<Displayed>,
    keys: Res<ButtonInput<KeyCode>>,
    interactions: Query<(&Interaction, &Control), Changed<Interaction>>,
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
    let mut actions = Vec::new();
    for (interaction, control) in &interactions {
        if *interaction == Interaction::Pressed {
            actions.push(control.clone());
        }
    }
    for (index, key) in [
        KeyCode::Digit1,
        KeyCode::Digit2,
        KeyCode::Digit3,
        KeyCode::Digit4,
        KeyCode::Digit5,
        KeyCode::Digit6,
    ]
    .into_iter()
    .enumerate()
    {
        if keys.just_pressed(key) {
            actions.push(
                if keys.pressed(KeyCode::ShiftLeft) || keys.pressed(KeyCode::ShiftRight) {
                    Control::Wire(index)
                } else {
                    Control::Pick(index)
                },
            );
        }
    }
    for (key, binding) in [
        (KeyCode::KeyM, "ToggleMount"),
        (KeyCode::KeyX, "DisconnectComponent"),
        (KeyCode::KeyR, "RepairComponent"),
        (KeyCode::Enter, "LaunchExpedition"),
        (KeyCode::Backspace, "WithdrawExpedition"),
    ] {
        if keys.just_pressed(key) {
            actions.push(Control::Key(binding));
        }
    }
    for (index, key) in [KeyCode::KeyC, KeyCode::KeyV].into_iter().enumerate() {
        if keys.just_pressed(key) {
            actions.push(Control::Doctrine(index));
        }
    }
    let inputs = actions
        .into_iter()
        .filter_map(|action| match action {
            Control::Key(binding) => Some(native::key(binding)),
            Control::Pick(index) => view
                .components
                .get(index)
                .map(|part| native::reference("PickComponent", part.pick.clone())),
            Control::Wire(index) => view
                .components
                .get(index)
                .and_then(|part| part.wire.clone())
                .map(|reference| native::reference("WireComponent", reference)),
            Control::Doctrine(index) => view
                .doctrines
                .get(index)
                .map(|doctrine| native::reference("ChooseDoctrine", doctrine.reference.clone())),
        })
        .collect::<Vec<_>>();
    if !inputs.is_empty() {
        submit(&bridge, Request::Input(snapshot.generation, inputs));
    }
}

fn part_position(index: usize, mounted: bool) -> Vec3 {
    let x = if index % 2 == 0 { -1.6_f32 } else { 1.6_f32 };
    let z = (index / 2) as f32 * 1.8 - 1.8;
    Vec3::new(x + if mounted { 0.0 } else { 3.2 * x.signum() }, 0.7, z)
}

pub(super) fn scene(
    mut commands: Commands,
    display: Res<Displayed>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut scenery: Query<(&Scenery, &mut Transform, &mut Visibility), Without<WorkshopCamera>>,
    mut camera: Query<&mut Transform, (With<WorkshopCamera>, Without<Scenery>)>,
    mut initialized: Local<bool>,
    mut gizmos: Gizmos,
) {
    let Some(view) = display
        .snapshot
        .as_ref()
        .and_then(|snapshot| snapshot.workshop.as_ref())
    else {
        return;
    };
    let expedition = view.phase == "Expedition";
    let position = Vec3::new(0.0, 0.0, -view.readings["position"] as f32);
    let destination = view.readings["encounter-position"] as f32;
    if !*initialized {
        let steel = materials.add(Color::srgb(0.12, 0.17, 0.19));
        let ash = materials.add(Color::srgb(0.19, 0.17, 0.16));
        let rock = materials.add(Color::srgb(0.29, 0.24, 0.21));
        commands.spawn((
            Scenery::Bench,
            Mesh3d(meshes.add(Cuboid::new(12.0, 0.4, 7.0))),
            MeshMaterial3d(steel.clone()),
            Transform::from_xyz(0.0, -0.55, 0.0),
        ));
        commands.spawn((
            Scenery::Ash,
            Mesh3d(meshes.add(Plane3d::default().mesh().size(90.0, 90.0))),
            MeshMaterial3d(ash),
            Transform::from_xyz(0.0, -0.55, -10.0),
        ));
        for (x, z, scale) in [
            (-7.0, 2.0, 1.5),
            (7.0, -2.0, 1.0),
            (-6.0, -7.0, 1.2),
            (6.0, -12.0, 1.8),
            (-8.0, -16.0, 2.0),
            (7.0, -22.0, 1.0),
        ] {
            commands.spawn((
                Scenery::Ash,
                Mesh3d(meshes.add(Sphere::new(scale))),
                MeshMaterial3d(rock.clone()),
                Transform::from_xyz(x, -0.2, z).with_scale(Vec3::new(1.0, 0.6, 0.8)),
            ));
        }
        commands.spawn((
            Scenery::Chassis(Vec3::new(0.0, -0.1, 0.0)),
            Mesh3d(meshes.add(Cuboid::new(5.0, 0.45, 5.5))),
            MeshMaterial3d(steel.clone()),
            Transform::default(),
        ));
        for x in [-2.5, 2.5] {
            commands.spawn((
                Scenery::Chassis(Vec3::new(x, -0.1, 0.0)),
                Mesh3d(meshes.add(Cuboid::new(0.7, 0.65, 5.1))),
                MeshMaterial3d(rock.clone()),
                Transform::default(),
            ));
        }
        commands.spawn((
            Scenery::Sentinel,
            Mesh3d(meshes.add(Capsule3d::new(0.9, 2.0))),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: Color::srgb(0.55, 0.15, 0.07),
                emissive: LinearRgba::new(0.3, 0.03, 0.0, 1.0),
                metallic: 0.7,
                ..default()
            })),
            Transform::default(),
        ));
        commands.spawn((
            Scenery::Cache,
            Mesh3d(meshes.add(Cuboid::new(1.6, 1.2, 1.6))),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: Color::srgb(0.9, 0.64, 0.19),
                emissive: LinearRgba::new(0.3, 0.15, 0.01, 1.0),
                ..default()
            })),
            Transform::default(),
        ));
        *initialized = true;
    }
    for (kind, mut transform, mut visibility) in &mut scenery {
        *visibility = match kind {
            Scenery::Bench if expedition => Visibility::Hidden,
            Scenery::Ash | Scenery::Sentinel | Scenery::Cache if !expedition => Visibility::Hidden,
            _ => Visibility::Inherited,
        };
        match kind {
            Scenery::Chassis(local) => {
                transform.translation = *local + if expedition { position } else { Vec3::ZERO }
            }
            Scenery::Sentinel => {
                transform.translation = Vec3::new(0.0, 1.3, -destination - 4.0);
                transform.rotation = if view.readings["threat-health"] <= 0.0 {
                    Quat::from_rotation_z(std::f32::consts::FRAC_PI_2)
                } else {
                    Quat::IDENTITY
                };
                if view.readings["threat-health"] <= 0.0 {
                    transform.translation.y = 0.1;
                }
            }
            Scenery::Cache => {
                transform.translation = Vec3::new(3.0, 0.4, -destination - 4.0);
                transform.scale = Vec3::splat(if view.readings["objective"] > 0.0 {
                    (1.0 - view.readings["cargo"] / view.readings["objective"]).clamp(0.15, 1.0)
                        as f32
                } else {
                    1.0
                });
            }
            _ => {}
        }
    }
    for mut transform in &mut camera {
        let center = if expedition {
            Vec3::new(0.0, 0.0, -destination * 0.5)
        } else {
            Vec3::ZERO
        };
        *transform = Transform::from_translation(
            center
                + if expedition {
                    Vec3::new(10.0, 21.0, 22.0)
                } else {
                    Vec3::new(0.0, 17.0, 15.0)
                },
        )
        .looking_at(center, Vec3::Y);
    }
    if expedition {
        for x in [-3.6, 3.6] {
            gizmos.line(
                Vec3::new(x, -0.48, 4.0),
                Vec3::new(x, -0.48, -destination - 7.0),
                Color::srgb(0.43, 0.34, 0.22),
            );
        }
        let health = view.readings["threat-health"];
        let maximum = view.readings["threat-maximum"];
        if maximum > 0.0 {
            let start = Vec3::new(-1.0, 3.6, -destination - 4.0);
            gizmos.line(start, start + Vec3::X * 2.0, Color::srgb(0.15, 0.1, 0.1));
            gizmos.line(
                start,
                start + Vec3::X * (2.0 * health / maximum) as f32,
                Color::srgb(1.0, 0.3, 0.1),
            );
        }
    }
}

pub(super) fn present(
    mut commands: Commands,
    mut display: ResMut<Displayed>,
    mut panels: Query<&mut Visibility, (With<Panel>, Without<Part>)>,
    mut text: Query<(
        &mut Text,
        Option<&Readout>,
        Option<&Detail>,
        Option<&Report>,
    )>,
    mut buttons: Query<(&Control, &Children, &Interaction, &mut BackgroundColor)>,
    mut parts: Query<
        (
            &Part,
            &mut Transform,
            &MeshMaterial3d<StandardMaterial>,
            &mut Visibility,
        ),
        Without<Panel>,
    >,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut initialized: Local<bool>,
    mut gizmos: Gizmos,
    roster: Query<Entity, With<Roster>>,
) {
    for mut panel in &mut panels {
        *panel = if display.editing {
            Visibility::Hidden
        } else {
            Visibility::Inherited
        };
    }
    let Some(snapshot) = &display.snapshot else {
        return;
    };
    let Some(view) = &snapshot.workshop else {
        return;
    };
    let r = &view.readings;
    for (mut content, readout, detail, report) in &mut text {
        if readout.is_some() {
            **content = format!(
                "{}\n\nMass {:.0}  ·  Power {:.0}\nDrive {:.0}  ·  Weapon {:.0}\nCooling {:.0}\n\nHeat {:.1}  ·  Reserve {:.1}\nStock {:.0}  ·  Cargo {:.0}/{:.0}\nDistance {:.1}  ·  Threat {:.1}",
                view.phase.to_uppercase(),
                r["total-mass"],
                r["available-power"],
                r["drive-power"],
                r["weapon-power"],
                r["cooling-power"],
                r["heat"],
                r["reserve"],
                r["stock"],
                r["cargo"],
                r["objective"],
                r["position"],
                r["threat-health"]
            );
        } else if detail.is_some() {
            **content = view.components.iter().find(|part| part.selected).map(|part| {
                let p = &part.readings;
                format!("{}\nMass {:.0} · Generation {:.0} · Draw {:.0}\nThrust {:.0} · Firepower {:.0}\nCooling {:.0} · Protection {:.0}", part.label, p["mass"], p["generation"], p["draw"], p["thrust"], p["firepower"], p["cooling"], p["protection"])
            }).unwrap_or_default();
        } else if report.is_some() {
            **content = format!("{}\n\n{}", view.report, display.status);
        }
    }
    for (control, children, interaction, mut background) in &mut buttons {
        let (caption, selected) = match control {
            Control::Pick(index) => view
                .components
                .get(*index)
                .map(|part| {
                    (
                        format!(
                            "{} · {}  {:.0}/{:.0}{}",
                            index + 1,
                            part.label,
                            part.readings["health"],
                            part.readings["max-health"],
                            if part.mounted { "" } else { " · off" }
                        ),
                        part.selected,
                    )
                })
                .unwrap_or_default(),
            Control::Wire(index) => view
                .components
                .get(*index)
                .map(|part| {
                    let upstream = view
                        .components
                        .iter()
                        .find(|candidate| Some(&candidate.pick) == part.upstream.as_ref())
                        .map(|part| part.label.as_str())
                        .unwrap_or("—");
                    (
                        format!(
                            "WIRE TO · {}\n{}",
                            part.label,
                            if part.linked {
                                format!("← {upstream}")
                            } else {
                                "Disconnected".into()
                            }
                        ),
                        false,
                    )
                })
                .unwrap_or_default(),
            Control::Doctrine(index) => view
                .doctrines
                .get(*index)
                .map(|doctrine| {
                    (
                        format!(
                            "{}{}\nHeat limit {:.0} · Reserve floor {:.0}",
                            if doctrine.selected { "● " } else { "" },
                            doctrine.label,
                            doctrine.heat_limit,
                            doctrine.reserve_floor
                        ),
                        doctrine.selected,
                    )
                })
                .unwrap_or_default(),
            Control::Key(_) => (String::new(), false),
        };
        background.0 = if *interaction == Interaction::Hovered {
            Color::srgb(0.25, 0.34, 0.34)
        } else if selected {
            Color::srgb(0.24, 0.35, 0.27)
        } else {
            Color::srgb(0.12, 0.18, 0.20)
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
        if let Ok(roster) = roster.single() {
            commands.entity(roster).with_children(|parent| {
                for (index, _) in view.components.iter().enumerate() {
                    for (control, caption) in [
                        (Control::Pick(index), "Select part"),
                        (Control::Wire(index), "Wire here"),
                    ] {
                        parent
                            .spawn((
                                Button,
                                Node {
                                    padding: UiRect::all(px(5)),
                                    ..default()
                                },
                                BackgroundColor(Color::srgb(0.12, 0.18, 0.20)),
                                control,
                            ))
                            .with_children(|button| {
                                button.spawn(label(caption, 13.0));
                            });
                    }
                }
            });
        }
        for (index, part) in view.components.iter().enumerate() {
            let (mesh, rotation) = if part.readings["generation"] > 0.0 {
                (Mesh::from(Cylinder::new(0.65, 1.5)), Quat::IDENTITY)
            } else if part.readings["firepower"] > 0.0 {
                (
                    Mesh::from(Capsule3d::new(0.32, 1.6)),
                    Quat::from_rotation_x(std::f32::consts::FRAC_PI_2),
                )
            } else if part.readings["thrust"] > 0.0 {
                (
                    Mesh::from(Cylinder::new(0.65, 1.3)),
                    Quat::from_rotation_z(std::f32::consts::FRAC_PI_2),
                )
            } else if part.readings["protection"] > 0.0 {
                (Mesh::from(Cuboid::new(1.7, 0.35, 1.6)), Quat::IDENTITY)
            } else {
                (Mesh::from(Cuboid::new(1.25, 1.1, 1.25)), Quat::IDENTITY)
            };
            commands.spawn((
                Part(index),
                Mesh3d(meshes.add(mesh)),
                MeshMaterial3d(materials.add(StandardMaterial {
                    metallic: 0.65,
                    perceptual_roughness: 0.4,
                    ..default()
                })),
                Transform::from_translation(part_position(index, part.mounted))
                    .with_rotation(rotation),
            ));
        }
        *initialized = true;
    }
    for (part, mut transform, material, mut visibility) in &mut parts {
        let Some(component) = view.components.get(part.0) else {
            continue;
        };
        *visibility = if view.phase == "Expedition" && !component.mounted {
            Visibility::Hidden
        } else {
            Visibility::Inherited
        };
        if *visibility == Visibility::Hidden {
            continue;
        }
        let offset = if view.phase == "Expedition" && component.mounted {
            Vec3::new(0.0, 0.0, -r["position"] as f32)
        } else {
            Vec3::ZERO
        };
        transform.translation = part_position(part.0, component.mounted) + offset;
        let damaged = component.readings["health"] < component.readings["max-health"];
        let color = if damaged {
            Color::srgb(0.65, 0.24, 0.12)
        } else if component.powered {
            Color::srgb(0.38, 0.78, 0.69)
        } else {
            Color::srgb(0.22, 0.28, 0.30)
        };
        if let Some(mut material) = materials.get_mut(&material.0) {
            material.base_color = color;
            material.emissive = color.to_linear() * if component.powered { 0.65 } else { 0.0 };
        }
        if component.selected {
            gizmos.cube(
                Transform::from_translation(transform.translation)
                    .with_scale(Vec3::new(1.65, 1.45, 1.45)),
                Color::srgb(1.0, 0.83, 0.40),
            );
        }
        if component.linked {
            if let Some((index, upstream)) = view
                .components
                .iter()
                .enumerate()
                .find(|(_, candidate)| Some(&candidate.pick) == component.upstream.as_ref())
            {
                if view.phase == "Expedition" && !upstream.mounted {
                    continue;
                }
                gizmos.line(
                    transform.translation + Vec3::Y,
                    part_position(index, upstream.mounted)
                        + Vec3::Y
                        + if view.phase == "Expedition" && upstream.mounted {
                            Vec3::new(0.0, 0.0, -r["position"] as f32)
                        } else {
                            Vec3::ZERO
                        },
                    if component.powered {
                        Color::srgb(0.5, 1.0, 0.8)
                    } else {
                        Color::srgb(0.4, 0.4, 0.4)
                    },
                );
            }
        }
    }
    if let Some((generation, started)) = display.edit_receipt.take() {
        eprintln!(
            "native edited workshop projection submitted to scene: {} ms; generation {:?}",
            started.elapsed().as_millis(),
            generation
        );
    }
}
