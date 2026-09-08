//! Forest art, projected readouts and physical controls. Route outcomes remain in Clause.
use super::*;

#[derive(Component)]
pub(super) struct ForestCamera;
#[derive(Component)]
pub(super) struct Wayfarer;
#[derive(Component)]
pub(super) struct Threat(String);
#[derive(Component)]
pub(super) struct TrailLabel(usize);
#[derive(Component)]
pub(super) struct Readout;
#[derive(Component)]
pub(super) struct ThreatReadout(usize);
#[derive(Component)]
pub(super) struct OutfitReadout;
#[derive(Component)]
pub(super) struct EquipmentControls;
#[derive(Component)]
pub(super) struct OutfitPanel;
#[derive(Component, Clone)]
pub(super) enum Control {
    Key(&'static str),
    Target(usize),
    Outfit,
    Gear(usize),
    Fit(usize),
    Wire(usize),
}
#[derive(Resource, Default)]
pub(super) struct Outfit {
    open: bool,
}

const PLACES: [(&str, [f32; 3]); 5] = [
    ("Hearthstead / Extraction", [-16., 0., 5.]),
    ("Lookout", [-8., 0., -1.]),
    ("Thicket", [0., 0., -5.]),
    ("Thorn passage", [6., 0., 3.]),
    ("Deep grove / Ritual", [14., 0., -3.]),
];
fn point(depth: f64) -> Vec3 {
    let depth = (depth as f32).clamp(0., 4.);
    let index = depth.floor() as usize;
    let a = Vec3::from_array(PLACES[index].1);
    let b = Vec3::from_array(PLACES[(index + 1).min(4)].1);
    a.lerp(b, depth - index as f32)
}
fn label(text: impl Into<String>, size: f32) -> (Text, TextFont, TextColor) {
    (
        Text::new(text),
        TextFont {
            font_size: FontSize::Px(size),
            ..default()
        },
        TextColor(Color::srgb(0.93, 0.91, 0.79)),
    )
}
fn button(control: Control) -> impl Bundle {
    (
        Button,
        control,
        Node {
            padding: UiRect::axes(px(9), px(7)),
            ..default()
        },
        BackgroundColor(Color::srgb(0.13, 0.20, 0.17)),
    )
}

pub(super) fn setup(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<StandardMaterial>,
    assets: &AssetServer,
) {
    commands.insert_resource(Outfit::default());
    commands.spawn((
        Camera3d::default(),
        ForestCamera,
        Transform::from_xyz(0., 32., 35.).looking_at(Vec3::new(0., 0., 0.), Vec3::Y),
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: 16000.,
            ..default()
        },
        Transform::from_xyz(-15., 25., 12.).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(95., 65.))),
        MeshMaterial3d(materials.add(Color::srgb(0.12, 0.18, 0.12))),
        Transform::from_xyz(0., -0.12, 0.),
    ));
    let path = materials.add(Color::srgb(0.32, 0.28, 0.19));
    for pair in PLACES.windows(2) {
        let a = Vec3::from_array(pair[0].1);
        let b = Vec3::from_array(pair[1].1);
        let delta = b - a;
        commands.spawn((
            Mesh3d(meshes.add(Cuboid::new(2.3, 0.06, delta.length()))),
            MeshMaterial3d(path.clone()),
            Transform::from_translation((a + b) * 0.5)
                .with_rotation(Quat::from_rotation_y(delta.x.atan2(delta.z))),
        ));
    }
    for (i, (_, p)) in PLACES.iter().enumerate() {
        commands.spawn((
            Mesh3d(meshes.add(Cylinder::new(2.5, 0.08))),
            MeshMaterial3d(path.clone()),
            Transform::from_translation(Vec3::from_array(*p)),
        ));
        commands.spawn((
            label("", 14.),
            Node {
                position_type: PositionType::Absolute,
                padding: UiRect::all(px(4)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.04, 0.06, 0.04, 0.85)),
            TrailLabel(i),
        ));
    }
    for (x, z, scale) in [
        (-23., -4., 1.4),
        (-18., -8., 1.1),
        (-13., -7., 1.4),
        (-10., -11., 1.3),
        (-3., -12., 1.8),
        (5., -12., 1.6),
        (12., -11., 1.2),
        (20., -9., 1.9),
        (23., 1., 1.7),
        (-22., 10., 1.4),
        (-11., 12., 1.3),
        (-4., 7., 1.2),
        (5., 11., 1.3),
        (15., 9., 1.4),
        (21., 10., 1.6),
    ] {
        commands.spawn((
            WorldAssetRoot(
                assets.load(
                    GltfAssetLabel::Scene(0)
                        .from_asset("external/quaternius/stylized-nature-field/glTF/Pine_2.gltf"),
                ),
            ),
            Transform::from_xyz(x, 0., z).with_scale(Vec3::splat(scale)),
        ));
    }
    // Hearthstead's shelter, trail lantern and the frost-core grove are art only.
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(3., 2., 2.5))),
        MeshMaterial3d(materials.add(Color::srgb(0.38, 0.26, 0.15))),
        Transform::from_xyz(-19., 1., 3.),
    ));
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(4., 0.5, 3.5))),
        MeshMaterial3d(materials.add(Color::srgb(0.20, 0.12, 0.09))),
        Transform::from_xyz(-19., 2.3, 3.).with_rotation(Quat::from_rotation_z(0.15)),
    ));
    for (x, z) in [(13., -5.), (15., -5.), (16., -3.)] {
        commands.spawn((
            Mesh3d(meshes.add(Cuboid::new(0.7, 1.4, 0.7))),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: Color::srgb(0.28, 0.75, 0.84),
                emissive: LinearRgba::new(0.1, 0.4, 0.5, 1.),
                ..default()
            })),
            Transform::from_xyz(x, 0.7, z).with_rotation(Quat::from_rotation_z(0.2)),
        ));
    }
    commands
        .spawn((
            Wayfarer,
            Actor {
                id: "wayfarer".into(),
            },
            Motion {
                moving: false,
                alive: true,
            },
            Transform::from_translation(point(0.)),
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
                Transform::from_scale(Vec3::splat(1.35)),
            ));
        });
    commands.spawn((
        label("Opening Hearthstead...", 17.),
        Node {
            position_type: PositionType::Absolute,
            left: px(16),
            top: px(12),
            right: px(16),
            padding: UiRect::all(px(12)),
            ..default()
        },
        BackgroundColor(Color::srgba(0.03, 0.055, 0.04, 0.94)),
        Readout,
    ));
    commands.spawn((
        label("", 15.),
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
        .spawn((Node {
            position_type: PositionType::Absolute,
            right: px(16),
            top: px(115),
            width: px(300),
            flex_direction: FlexDirection::Column,
            row_gap: px(7),
            ..default()
        },))
        .with_children(|p| {
            for i in 0..5 {
                p.spawn(button(Control::Target(i))).with_children(|p| {
                    p.spawn((label("", 14.), ThreatReadout(i)));
                });
            }
        });
    commands
        .spawn((Node {
            position_type: PositionType::Absolute,
            left: px(16),
            bottom: px(48),
            right: px(16),
            flex_wrap: FlexWrap::Wrap,
            column_gap: px(6),
            row_gap: px(6),
            ..default()
        },))
        .with_children(|p| {
            for (control, text) in [
                (Control::Key("LaunchExpedition"), "Enter: depart"),
                (Control::Key("AdvanceForest"), "D: advance"),
                (Control::Key("RetreatForest"), "A: retreat"),
                (Control::Key("StrikeThreat"), "Space: strike"),
                (Control::Key("Brace"), "B: brace"),
                (Control::Key("GatherResource"), "G: gather"),
                (Control::Key("CallRitual"), "R: offer 6 cores"),
                (Control::Key("ExtractExpedition"), "X: extract"),
                (Control::Outfit, "O: equipment"),
            ] {
                p.spawn(button(control)).with_children(|p| {
                    p.spawn(label(text, 14.));
                });
            }
        });
    commands.spawn((label("Follow the trail; each advance travels to its next clearing. Click a threat card to target it.  |  F5 save  F6 tuning  F7 inspect",14.),Node {position_type:PositionType::Absolute,left:px(16),bottom:px(16),..default()}));
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: px(16),
                top: px(115),
                width: px(650),
                bottom: px(140),
                padding: UiRect::all(px(14)),
                flex_direction: FlexDirection::Column,
                row_gap: px(7),
                overflow: Overflow::scroll_y(),
                ..default()
            },
            ScrollPosition::default(),
            BackgroundColor(Color::srgb(0.035, 0.065, 0.05)),
            GlobalZIndex(20),
            Visibility::Hidden,
            OutfitPanel,
        ))
        .with_children(|p| {
            p.spawn((label("", 14.), OutfitReadout));
            p.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    row_gap: px(6),
                    ..default()
                },
                EquipmentControls,
            ));
            for (binding, text) in [
                ("UnequipComponent", "Remove selected gear"),
                ("DisconnectComponent", "Disconnect selected gear"),
                ("RepairComponent", "Repair selected gear"),
                ("RestCreature", "Rest at Hearthstead"),
            ] {
                p.spawn(button(Control::Key(binding))).with_children(|p| {
                    p.spawn(label(text, 14.));
                });
            }
        });
}

pub(super) fn controls(
    bridge: Res<Bridge>,
    display: Res<Displayed>,
    keys: Res<ButtonInput<KeyCode>>,
    interactions: Query<(&Interaction, &Control), Changed<Interaction>>,
    outfit: Option<ResMut<Outfit>>,
    mut wheel: MessageReader<MouseWheel>,
    mut panels: Query<&mut ScrollPosition, With<OutfitPanel>>,
) {
    if display.editing || display.inspecting || display.editor_handled_frame {
        return;
    }
    let Some(snapshot) = &display.snapshot else {
        return;
    };
    let Some(view) = &snapshot.forest else {
        return;
    };
    let Some(mut outfit) = outfit else {
        return;
    };
    if outfit.open {
        for event in wheel.read() {
            for mut scroll in &mut panels {
                scroll.y = (scroll.y - event.y * 32.).max(0.);
            }
        }
    }
    let mut actions = interactions
        .iter()
        .filter(|(i, _)| **i == Interaction::Pressed)
        .map(|(_, c)| c.clone())
        .collect::<Vec<_>>();
    for (key, binding) in [
        (KeyCode::Enter, "LaunchExpedition"),
        (KeyCode::KeyD, "AdvanceForest"),
        (KeyCode::KeyA, "RetreatForest"),
        (KeyCode::Space, "StrikeThreat"),
        (KeyCode::KeyB, "Brace"),
        (KeyCode::KeyG, "GatherResource"),
        (KeyCode::KeyR, "CallRitual"),
        (KeyCode::KeyX, "ExtractExpedition"),
    ] {
        if keys.just_pressed(key) {
            actions.push(Control::Key(binding));
        }
    }
    if keys.just_pressed(KeyCode::KeyO) {
        actions.push(Control::Outfit);
    }
    if keys.just_pressed(KeyCode::Escape) {
        outfit.open = false;
    }
    for (i, key) in [
        KeyCode::Digit1,
        KeyCode::Digit2,
        KeyCode::Digit3,
        KeyCode::Digit4,
        KeyCode::Digit5,
    ]
    .into_iter()
    .enumerate()
    {
        if keys.just_pressed(key) {
            actions.push(Control::Target(i));
        }
    }
    let mut inputs = Vec::new();
    for action in actions {
        let input = match action {
            Control::Outfit => {
                outfit.open = !outfit.open;
                None
            }
            Control::Key(binding) => Some(native::key(binding)),
            Control::Target(i) => view
                .threats
                .get(i)
                .map(|t| native::reference("TargetThreat", t.target.clone())),
            Control::Gear(i) => view
                .equipment
                .components
                .get(i)
                .map(|c| native::reference("PickComponent", c.pick.clone())),
            Control::Fit(i) => view
                .equipment
                .body_parts
                .get(i)
                .map(|c| native::reference("FitComponent", c.fit.clone())),
            Control::Wire(i) => view
                .equipment
                .components
                .get(i)
                .and_then(|c| c.wire.clone())
                .map(|r| native::reference("WireComponent", r)),
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
    time: Res<Time>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut readouts: ParamSet<(
        Query<&mut Text, With<Readout>>,
        Query<(&mut Text, &ThreatReadout)>,
        Query<&mut Text, With<OutfitReadout>>,
    )>,
    mut player: Query<(&mut Transform, &mut Motion), With<Wayfarer>>,
    mut threats: Query<
        (&Threat, &mut Transform, &mut Visibility),
        (Without<Wayfarer>, Without<ForestCamera>),
    >,
    camera: Query<(&Camera, &GlobalTransform), With<ForestCamera>>,
    mut trail_labels: Query<
        (&TrailLabel, &mut Node, &mut Text),
        (
            Without<Readout>,
            Without<ThreatReadout>,
            Without<OutfitReadout>,
        ),
    >,
    mut panels: Query<&mut Visibility, (With<OutfitPanel>, Without<Threat>)>,
    outfit: Option<Res<Outfit>>,
    mut initialized: Local<bool>,
    equipment_controls: Query<Entity, With<EquipmentControls>>,
) {
    let Some(view) = display.snapshot.as_ref().and_then(|s| s.forest.as_ref()) else {
        return;
    };
    if !*initialized {
        for threat in &view.threats {
            let color = match threat.id.as_str() {
                "scout" => Color::srgb(0.65, 0.43, 0.13),
                "nest" => Color::srgb(0.25, 0.33, 0.08),
                "warder" => Color::srgb(0.26, 0.18, 0.08),
                "patrol" => Color::srgb(0.42, 0.15, 0.09),
                _ => Color::srgb(0.35, 0.7, 0.84),
            };
            let mesh = if threat.id == "nest" {
                meshes.add(Sphere::new(1.3))
            } else {
                meshes.add(Capsule3d::new(0.65, 1.5))
            };
            commands.spawn((
                Threat(threat.id.clone()),
                Mesh3d(mesh),
                MeshMaterial3d(materials.add(color)),
                Transform::default(),
                Visibility::default(),
            ));
        }
        for entity in &equipment_controls {
            commands.entity(entity).with_children(|p| {
                for (i, component) in view.equipment.components.iter().enumerate() {
                    p.spawn((Node {
                        column_gap: px(8),
                        ..default()
                    },))
                        .with_children(|p| {
                            p.spawn(button(Control::Gear(i))).with_children(|p| {
                                p.spawn(label(format!("Choose {}", component.label), 14.));
                            });
                            if component.wire.is_some() {
                                p.spawn(button(Control::Wire(i))).with_children(|p| {
                                    p.spawn(label(format!("Power from {}", component.label), 14.));
                                });
                            }
                        });
                }
                for (i, part) in view.equipment.body_parts.iter().enumerate() {
                    p.spawn(button(Control::Fit(i))).with_children(|p| {
                        p.spawn(label(format!("Fit selected gear on {}", part.label), 14.));
                    });
                }
            });
        }
        *initialized = true;
    }
    for (mut transform, mut motion) in &mut player {
        let destination = point(view.position) + Vec3::new(0., 0.1, 0.8);
        let displacement = destination - transform.translation;
        motion.moving = displacement.length() > 0.05;
        motion.alive = view.vitality > 0.;
        if !motion.alive {
            transform.rotation = Quat::from_rotation_z(1.5);
        } else if motion.moving {
            transform.rotation = Quat::from_rotation_y(displacement.x.atan2(displacement.z));
        }
        transform.translation = transform
            .translation
            .lerp(destination, (time.delta_secs() * 10.).min(1.));
    }
    for (id, mut transform, mut visible) in &mut threats {
        if let Some(threat) = view.threats.iter().find(|t| t.id == id.0) {
            transform.translation = point(threat.position)
                + Vec3::new(
                    if threat.id == "ritual-guardian" {
                        2.5
                    } else {
                        -1.5
                    },
                    1.2,
                    -1.5,
                );
            transform.scale = Vec3::splat(if threat.selected { 1.2 } else { 1.0 });
            *visible = if threat.active {
                Visibility::Inherited
            } else {
                Visibility::Hidden
            };
            transform.rotation = if threat.health <= 0. {
                Quat::from_rotation_z(1.5)
            } else {
                Quat::IDENTITY
            };
        }
    }
    if let Ok((camera, transform)) = camera.single() {
        for (label, mut node, mut text) in &mut trail_labels {
            if let Ok(screen) = camera.world_to_viewport(
                transform,
                Vec3::from_array(PLACES[label.0].1) + Vec3::new(0., 0., 2.3),
            ) {
                node.left = px(screen.x - 65.);
                node.top = px(screen.y);
                **text = PLACES[label.0].0.to_string();
            }
        }
    }
    if let Ok(mut text) = readouts.p0().single_mut() {
        **text = format!(
            "HEARTHSTEAD / FROSTWOOD  |  {}  |  Vitality {:.0}  |  Presence {:.1}\nCarried cores {:.0}  |  Banked supplies {:.0}  |  Relics carried {:.0} / banked {:.0}  |  Grove cores {:.0}\n{}{}",
            view.equipment.phase,
            view.vitality,
            view.presence,
            view.cargo,
            view.stock,
            view.carried_relics,
            view.banked_relics,
            view.resource_remaining,
            view.equipment.report,
            if view.connected {
                ""
            } else {
                "  Connection paused"
            }
        );
    }
    for (mut text, index) in &mut readouts.p1() {
        if let Some(t) = view.threats.get(index.0) {
            **text = format!(
                "{}  {}{}  {:.0}/{:.0}\nNow: {}\nNext: {}\n{}",
                index.0 + 1,
                if t.selected { "[Target] " } else { "" },
                t.name,
                t.health,
                t.maximum_health,
                t.current_intent,
                t.upcoming_intent,
                t.benefit
            );
        }
    }
    for mut visible in &mut panels {
        *visible =
            if outfit.as_ref().is_some_and(|s| s.open) && !display.inspecting && !display.editing {
                Visibility::Visible
            } else {
                Visibility::Hidden
            };
    }
    if let Ok(mut text) = readouts.p2().single_mut() {
        **text = format!(
            "EQUIPMENT  |  O / Esc closes  |  Scroll to see all controls\n{}\n{}\n{}",
            view.equipment.fit_report,
            view.equipment
                .components
                .iter()
                .enumerate()
                .map(|(i, c)| format!(
                    "{} {}{}: {} / {}",
                    i + 1,
                    if c.selected { "[chosen] " } else { "" },
                    c.label,
                    if c.mounted { "mounted" } else { "unmounted" },
                    if c.powered { "powered" } else { "unpowered" }
                ))
                .collect::<Vec<_>>()
                .join("\n"),
            view.equipment
                .body_parts
                .iter()
                .enumerate()
                .map(|(i, p)| format!(
                    "Body {}: {} ({:.0}/{:.0})",
                    i + 1,
                    p.label,
                    p.health,
                    p.maximum_health
                ))
                .collect::<Vec<_>>()
                .join("\n")
        );
    }
    if let Some((generation, started)) = display.edit_receipt.take() {
        eprintln!(
            "native edited forest projection submitted to scene: {} ms; generation {:?}",
            started.elapsed().as_millis(),
            generation
        );
    }
}
