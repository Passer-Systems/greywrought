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
            parent.spawn(label("THE WORKSHOP", 14.0));
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

pub(super) fn present(
    mut commands: Commands,
    mut display: ResMut<Displayed>,
    mut panels: Query<&mut Visibility, With<Panel>>,
    mut text: Query<(
        &mut Text,
        Option<&Readout>,
        Option<&Detail>,
        Option<&Report>,
    )>,
    mut buttons: Query<(&Control, &Children, &Interaction, &mut BackgroundColor)>,
    mut parts: Query<(&Part, &mut Transform, &MeshMaterial3d<StandardMaterial>)>,
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
                format!("{}\nMass {:.0} · Generation {:.0}\nThrust {:.0} · Firepower {:.0}\nCooling {:.0} · Protection {:.0}", part.label, p["mass"], p["generation"], p["thrust"], p["firepower"], p["cooling"], p["protection"])
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
        commands.spawn((
            Mesh3d(meshes.add(Cuboid::new(6.0, 0.35, 5.0))),
            MeshMaterial3d(materials.add(Color::srgb(0.12, 0.17, 0.19))),
            Transform::from_xyz(0.0, -0.1, 0.0),
        ));
        for (index, part) in view.components.iter().enumerate() {
            commands.spawn((
                Part(index),
                Mesh3d(meshes.add(Cuboid::new(1.45, 1.25, 1.25))),
                MeshMaterial3d(materials.add(StandardMaterial {
                    metallic: 0.65,
                    perceptual_roughness: 0.4,
                    ..default()
                })),
                Transform::from_translation(part_position(index, part.mounted)),
            ));
        }
        *initialized = true;
    }
    for (part, mut transform, material) in &mut parts {
        let Some(component) = view.components.get(part.0) else {
            continue;
        };
        transform.translation = part_position(part.0, component.mounted);
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
                gizmos.line(
                    transform.translation + Vec3::Y,
                    part_position(index, upstream.mounted) + Vec3::Y,
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
