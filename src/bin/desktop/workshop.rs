//! Creature dressing and physical inputs; all equipment outcomes come from the world.
use super::*;

#[derive(Component, Clone)]
pub(super) enum Control {
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
        Camera3d::default(),
        WorkshopCamera,
        Transform::from_xyz(4.5, 3.1, 7.5).looking_at(Vec3::new(0.0, 1.25, 0.0), Vec3::Y),
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
                top: px(24),
                width: px(245),
                padding: UiRect::all(px(16)),
                ..column()
            },
            BackgroundColor(Color::srgba(0.045, 0.075, 0.085, 0.96)),
            Panel,
            Outfitting,
        ))
        .with_children(|p| {
            p.spawn(label("GREYWROUGHT", 25.0));
            p.spawn(label("OUTFIT YOUR WAYFARER", 13.0));
            p.spawn(label("Equipment", 18.0));
            p.spawn((column(), Roster));
            p.spawn(label("Body", 18.0));
            p.spawn((column(), BodyRoster));
        });
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                right: px(22),
                top: px(24),
                width: px(285),
                padding: UiRect::all(px(16)),
                ..column()
            },
            BackgroundColor(Color::srgba(0.045, 0.075, 0.085, 0.96)),
            Panel,
            Outfitting,
        ))
        .with_children(|p| {
            p.spawn(label("SELECTED EQUIPMENT", 14.0));
            p.spawn((label("", 16.0), Detail));
            for (control, caption) in [
                (Control::Equip, "Equip on selected body part"),
                (Control::Key("UnequipComponent"), "Remove equipment"),
                (Control::Wiring, "Connect power..."),
                (Control::Key("DisconnectComponent"), "Disconnect power"),
                (Control::Key("RepairComponent"), "Repair selected gear"),
            ] {
                p.spawn(button(control)).with_children(|b| {
                    b.spawn(label(caption, 14.0));
                });
            }
            p.spawn((column(), WireRoster));
            p.spawn(label("EXPEDITION ORDERS", 14.0));
            for i in 0..2 {
                p.spawn(button(Control::Doctrine(i))).with_children(|b| {
                    b.spawn(label("", 14.0));
                });
            }
            p.spawn(button(Control::Key("RestCreature")))
                .with_children(|b| {
                    b.spawn(label("Rest the wayfarer", 15.0));
                });
            p.spawn(button(Control::Key("LaunchExpedition")))
                .with_children(|b| {
                    b.spawn(label("DEPLOY   [Enter]", 20.0));
                });
        });
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: px(290),
                right: px(330),
                top: px(24),
                padding: UiRect::all(px(14)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.045, 0.075, 0.085, 0.90)),
            Panel,
        ))
        .with_children(|p| {
            p.spawn((label("", 19.0), Readout));
        });
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: px(290),
                right: px(330),
                bottom: px(65),
                padding: UiRect::all(px(14)),
                ..column()
            },
            BackgroundColor(Color::srgba(0.045, 0.075, 0.085, 0.94)),
            Panel,
        ))
        .with_children(|p| {
            p.spawn((label("", 17.0), Report));
            p.spawn(button(Control::Key("WithdrawExpedition")))
                .with_children(|b| {
                    b.spawn(label("Return to workshop   [Backspace]", 15.0));
                });
        });
    commands.spawn((
        label("F5 Save   |   F6 Developer tuning", 14.0),
        Node {
            position_type: PositionType::Absolute,
            left: px(290),
            bottom: px(24),
            ..default()
        },
        Panel,
    ));
}

pub(super) fn layout(
    mode: Res<Mode>,
    windows: Query<&Window, With<PrimaryWindow>>,
    mut scale: ResMut<UiScale>,
) {
    if !mode.workshop {
        return;
    }
    if let Ok(window) = windows.single() {
        // Preserve space for the creature between panels in narrow tiled windows.
        scale.0 = (window.width() / 1100.0)
            .min(window.height() / 940.0)
            .min(1.0);
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
    for (key, binding) in [
        (KeyCode::Enter, "LaunchExpedition"),
        (KeyCode::Backspace, "WithdrawExpedition"),
        (KeyCode::KeyR, "RepairComponent"),
        (KeyCode::KeyX, "DisconnectComponent"),
    ] {
        if keys.just_pressed(key) {
            actions.push(Control::Key(binding));
        }
    }
    let mut inputs = Vec::new();
    for action in actions {
        let input = match action {
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
            Control::Key(binding) => Some(native::key(binding)),
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
        *visibility = if display.editing || (expedition && outfit.is_some()) {
            Visibility::Hidden
        } else {
            Visibility::Inherited
        };
    }
    let r = &view.readings;
    let chosen = view.components.iter().find(|c| c.selected);
    for (mut content, readout, detail, report) in &mut text {
        if readout.is_some() {
            **content = format!(
                "{}  |  {}\nCondition {:.0}%   Heat {:.0}   Reserve {:.0}\nSalvage {:.0}/{:.0}   Supplies {:.0}\nEquipment mass {:.0}   Available power {:.0}{}",
                view.creature_name,
                view.phase,
                view.creature_condition,
                r["heat"],
                r["reserve"],
                r["cargo"],
                r["objective"],
                r["stock"],
                r["total-mass"],
                r["available-power"],
                if expedition {
                    format!(
                        "\nAshfield {:.1}/{:.1}   Sentinel {:.0}/{:.0}",
                        r["position"],
                        r["encounter-position"],
                        r["threat-health"],
                        r["threat-maximum"]
                    )
                } else {
                    String::new()
                }
            );
        } else if detail.is_some() {
            **content = chosen.map(|c| {
                let attachment = view.body_parts.iter().find(|p| Some(&p.fit) == c.attached_to.as_ref()).map(|p| p.label.as_str()).unwrap_or("Not equipped");
                let upstream = view.components.iter().find(|p| Some(&p.pick) == c.upstream.as_ref()).map(|p| p.label.as_str()).unwrap_or("None");
                format!("{}\n{}\nGear {:.0}/{:.0}   Weight {:.0}\n{}\nPower connection: {}\nSupply {:.0}   Draw {:.0}\nThrust {:.0}   Firepower {:.0}\nCooling {:.0}   Protection {:.0}\n\nBody selected: {}", c.label, attachment, c.readings["health"], c.readings["max-health"], c.readings["mass"], if c.powered { "Powered" } else { "No power" }, if c.linked { upstream } else { "Disconnected" }, c.readings["generation"], c.readings["draw"], c.readings["thrust"], c.readings["firepower"], c.readings["cooling"], c.readings["protection"], selection.body.and_then(|i| view.body_parts.get(i)).map(|p| p.label.as_str()).unwrap_or("Choose on the left"))
            }).unwrap_or_default();
        } else if report.is_some() {
            **content = if expedition {
                format!("{}\n{}", view.report, display.status)
            } else {
                format!("{}\n\n{}\n{}", view.report, view.fit_report, display.status)
            };
        }
    }
    for (control, children, interaction, mut background, mut node) in &mut buttons {
        node.display = match control {
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
        let (caption, selected) = match control {
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
        background.0 = if *interaction == Interaction::Hovered {
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
        commands.spawn((
            Scenery::Sentinel,
            Mesh3d(meshes.add(Capsule3d::new(0.65, 1.5))),
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
