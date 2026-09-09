//! Enemy bodies and intent readouts follow the accepted combat projection.
use super::{Displayed, ForestCamera, point};
use bevy::prelude::*;
use greywrought::game::{ForestThreatView, ThreatPhase};
use std::collections::BTreeMap;

#[derive(Component)]
pub(crate) struct EnemyVisual {
    id: String,
    model: &'static str,
}
#[derive(Component)]
pub(crate) struct IntentCard(String);
#[derive(Component)]
pub(crate) struct IntentText(String);
#[derive(Component)]
pub(crate) struct IntentProgress(String);
#[derive(Component)]
pub(crate) struct IntentRing {
    id: String,
    reach: bool,
}
#[derive(Component)]
pub(crate) struct NestBody(String);
#[derive(Component)]
pub(crate) struct EnemyOrnament(String);

struct ModelClips {
    graph: Handle<AnimationGraph>,
    idle: AnimationNodeIndex,
    preparation: AnimationNodeIndex,
    action: AnimationNodeIndex,
    death: AnimationNodeIndex,
    action_duration: f32,
}
#[derive(Component)]
pub(crate) struct EnemyPlayback {
    phase: ThreatPhase,
    sequence: u64,
}
#[derive(Default)]
pub(crate) struct AnimationAssets {
    models: BTreeMap<&'static str, Handle<Gltf>>,
    clips: BTreeMap<&'static str, ModelClips>,
}

fn model(id: &str) -> (&'static str, f32) {
    match id {
        "scout" => ("external/quaternius/rts-company/Elf.gltf", 0.58),
        "warder" => ("external/quaternius/rts-company/Wizard.gltf", 0.73),
        "patrol" => ("external/quaternius/forest-enemies/Wolf.gltf", 0.52),
        "ritual-guardian" => (
            "external/quaternius/rts-company/Knight_Golden_Female.gltf",
            0.87,
        ),
        _ => ("", 1.),
    }
}
fn color(phase: ThreatPhase) -> Color {
    match phase {
        ThreatPhase::Preparation => Color::srgb(1., 0.72, 0.2),
        ThreatPhase::Action => Color::srgb(1., 0.26, 0.16),
        ThreatPhase::Recovery => Color::srgb(0.4, 0.78, 0.87),
        ThreatPhase::Cleared => Color::srgb(0.52, 0.58, 0.45),
        ThreatPhase::Dormant => Color::srgb(0.57, 0.62, 0.69),
    }
}
fn action_name(id: &str) -> &'static str {
    match id {
        "scout" => "ALARM",
        "nest" => "SWARM",
        "warder" => "THORNS",
        "patrol" => "CHARGE",
        "ritual-guardian" => "FROST",
        _ => "ATTACK",
    }
}
fn readout(threat: &ForestThreatView) -> String {
    if threat.phase == ThreatPhase::Cleared {
        return format!("{} • Cleared", threat.name);
    }
    let state = match threat.phase {
        ThreatPhase::Dormant => "Dormant".to_owned(),
        ThreatPhase::Preparation => format!("Preparing {:.0}%", threat.phase_progress * 100.),
        ThreatPhase::Action if threat.intent_damage == 0. && threat.last_action_hit => {
            "Alarm sounded".to_owned()
        }
        ThreatPhase::Action if threat.intent_damage == 0. => "No footsteps heard".to_owned(),
        ThreatPhase::Action if threat.last_action_hit => "Attack landed".to_owned(),
        ThreatPhase::Action => "Attack missed".to_owned(),
        ThreatPhase::Recovery => "Recovering".to_owned(),
        ThreatPhase::Cleared => unreachable!(),
    };
    let power = if threat.intent_damage > 0. {
        format!(" • {:.0} base damage", threat.intent_damage)
    } else {
        " • Raises alarm".to_owned()
    };
    format!(
        "{}  {:.0}/{:.0}\n{}{} • {:.0}m reach\nNow: {}\nNext: {}\n{}",
        threat.name,
        threat.health.max(0.),
        threat.maximum_health,
        action_name(&threat.id),
        power,
        threat.intent_reach,
        threat.current_intent,
        threat.upcoming_intent,
        state,
    )
}

fn spawn_enemy(
    commands: &mut Commands,
    threat: &ForestThreatView,
    assets: &AssetServer,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<StandardMaterial>,
) {
    let (path, scale) = model(&threat.id);
    let root = commands
        .spawn((
            EnemyVisual {
                id: threat.id.clone(),
                model: path,
            },
            Transform::from_translation(point(threat.position)),
            Visibility::default(),
        ))
        .id();
    if !path.is_empty() {
        commands.spawn((
            WorldAssetRoot(assets.load(GltfAssetLabel::Scene(0).from_asset(path))),
            Transform::from_scale(Vec3::splat(scale)),
            ChildOf(root),
        ));
    }
    if threat.id == "nest" {
        let body = commands
            .spawn((
                NestBody(threat.id.clone()),
                Transform::default(),
                Visibility::default(),
                ChildOf(root),
            ))
            .id();
        for (x, z, rotation) in [(-0.6, 0., 0.), (0.6, 0.2, 2.), (0., -0.5, 4.)] {
            commands.spawn((
                WorldAssetRoot(assets.load(GltfAssetLabel::Scene(0).from_asset(
                    "external/quaternius/stylized-nature-field/glTF/Bush_Common.gltf",
                ))),
                Transform::from_xyz(x, 0., z)
                    .with_scale(Vec3::splat(0.65))
                    .with_rotation(Quat::from_rotation_y(rotation)),
                ChildOf(body),
            ));
        }
        let wood = materials.add(Color::srgb(0.23, 0.13, 0.055));
        let thorn = meshes.add(Cone::new(0.18, 1.7));
        for i in 0..9 {
            let angle = i as f32 * std::f32::consts::TAU / 9.;
            commands.spawn((
                Mesh3d(thorn.clone()),
                MeshMaterial3d(wood.clone()),
                Transform::from_xyz(angle.cos() * 0.9, 0.55, angle.sin() * 0.9)
                    .with_rotation(Quat::from_rotation_y(-angle) * Quat::from_rotation_z(-0.55)),
                ChildOf(body),
            ));
        }
    }
    // Branches and ice belong to the creatures' silhouettes, not collision bounds.
    if threat.id == "warder" || threat.id == "ritual-guardian" {
        let ice = threat.id == "ritual-guardian";
        let material = materials.add(StandardMaterial {
            base_color: if ice {
                Color::srgb(0.49, 0.86, 1.)
            } else {
                Color::srgb(0.23, 0.29, 0.08)
            },
            emissive: if ice {
                LinearRgba::new(0.15, 0.45, 0.65, 1.)
            } else {
                LinearRgba::BLACK
            },
            ..default()
        });
        let mesh = meshes.add(Cone::new(0.16, if ice { 0.95 } else { 1.5 }));
        for side in [-1., 1.] {
            commands.spawn((
                EnemyOrnament(threat.id.clone()),
                Mesh3d(mesh.clone()),
                MeshMaterial3d(material.clone()),
                Transform::from_xyz(side * 0.58, if ice { 1.9 } else { 1.55 }, -0.15)
                    .with_rotation(Quat::from_rotation_z(-side * 0.65)),
                ChildOf(root),
            ));
        }
    }
    for reach in [false, true] {
        let radius = if reach {
            threat.intent_reach as f32
        } else {
            0.9
        };
        commands.spawn((
            IntentRing {
                id: threat.id.clone(),
                reach,
            },
            Mesh3d(meshes.add(Annulus::new((radius - 0.06).max(0.), radius))),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: color(threat.phase),
                unlit: true,
                ..default()
            })),
            Transform::from_translation(point(threat.position) + Vec3::Y * 0.035)
                .with_rotation(Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2)),
            Visibility::default(),
        ));
    }
    commands
        .spawn((
            IntentCard(threat.id.clone()),
            Node {
                position_type: PositionType::Absolute,
                width: px(248),
                padding: UiRect::all(px(7)),
                flex_direction: FlexDirection::Column,
                row_gap: px(5),
                ..default()
            },
            BackgroundColor(Color::srgba(0.055, 0.065, 0.045, 0.94)),
            GlobalZIndex(3),
        ))
        .with_children(|parent| {
            parent.spawn((
                IntentText(threat.id.clone()),
                Text::new(""),
                TextFont {
                    font: FontSource::Handle(assets.load("ui/fonts/LiberationSerif-Regular.ttf")),
                    font_size: FontSize::Px(15.),
                    ..default()
                },
                TextColor(Color::srgb(1., 0.94, 0.78)),
            ));
            parent
                .spawn((
                    Node {
                        width: percent(100),
                        height: px(4),
                        ..default()
                    },
                    BackgroundColor(Color::srgb(0.2, 0.22, 0.19)),
                ))
                .with_children(|parent| {
                    parent.spawn((
                        IntentProgress(threat.id.clone()),
                        Node {
                            height: percent(100),
                            width: percent(0),
                            ..default()
                        },
                        BackgroundColor(color(threat.phase)),
                    ));
                });
        });
}

pub(crate) fn sync(
    mut commands: Commands,
    display: Res<Displayed>,
    assets: Res<AssetServer>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut bodies: Query<(&EnemyVisual, &mut Transform, &mut Visibility), Without<NestBody>>,
    mut nests: Query<(&NestBody, &mut Transform), Without<EnemyVisual>>,
    mut rings: Query<
        (
            &IntentRing,
            &MeshMaterial3d<StandardMaterial>,
            &mut Visibility,
        ),
        Without<EnemyVisual>,
    >,
    mut ornaments: Query<
        (&EnemyOrnament, &mut Visibility),
        (Without<EnemyVisual>, Without<IntentRing>),
    >,
    mut cards: Query<(&IntentCard, &mut Node)>,
    mut texts: Query<(&IntentText, &mut Text, &mut TextColor)>,
    mut progress: Query<(&IntentProgress, &mut Node, &mut BackgroundColor), Without<IntentCard>>,
    camera: Query<(&Camera, &GlobalTransform), With<ForestCamera>>,
    mut initialized: Local<bool>,
) {
    let Some(snapshot) = &display.snapshot else {
        return;
    };
    let view = &snapshot.forest;
    if !*initialized {
        for threat in &view.threats {
            spawn_enemy(&mut commands, threat, &assets, &mut meshes, &mut materials);
        }
        *initialized = true;
    }
    for (body, mut transform, mut visibility) in &mut bodies {
        let Some(threat) = view.threats.iter().find(|t| t.id == body.id) else {
            continue;
        };
        transform.translation = point(threat.position);
        *visibility = if threat.active {
            Visibility::Inherited
        } else {
            Visibility::Hidden
        };
        if threat.health > 0. {
            let toward = point(if threat.phase == ThreatPhase::Action {
                threat.last_action_target
            } else {
                view.position
            }) - transform.translation;
            if toward.length_squared() > 0.01 && threat.id != "nest" {
                transform.rotation = Quat::from_rotation_y(toward.x.atan2(toward.z));
            }
        }
    }
    for (nest, mut transform) in &mut nests {
        let Some(threat) = view.threats.iter().find(|t| t.id == nest.0) else {
            continue;
        };
        let pulse = match threat.phase {
            ThreatPhase::Preparation => 1. + 0.06 * (threat.phase_progress as f32 * 12.).sin(),
            ThreatPhase::Action => 1. + 0.18 * (1. - threat.phase_progress as f32),
            ThreatPhase::Cleared => 0.45,
            _ => 1.,
        };
        transform.scale = Vec3::new(1., pulse, 1.);
    }
    for (ring, material, mut visibility) in &mut rings {
        let Some(threat) = view.threats.iter().find(|t| t.id == ring.id) else {
            continue;
        };
        *visibility = if threat.active && threat.health > 0. && (!ring.reach || threat.selected) {
            Visibility::Inherited
        } else {
            Visibility::Hidden
        };
        if let Some(mut material) = materials.get_mut(&material.0) {
            material.base_color = color(threat.phase);
        }
    }
    for (ornament, mut visibility) in &mut ornaments {
        if let Some(threat) = view.threats.iter().find(|t| t.id == ornament.0) {
            *visibility = if threat.health > 0. {
                Visibility::Inherited
            } else {
                Visibility::Hidden
            };
        }
    }
    if let Ok((camera, camera_transform)) = camera.single() {
        for (card, mut node) in &mut cards {
            let Some(threat) = view.threats.iter().find(|t| t.id == card.0) else {
                continue;
            };
            let distance = (point(view.position) - point(threat.position)).length();
            let anchor = point(threat.position)
                + Vec3::Y
                    * if threat.id == "nest" || threat.id == "patrol" {
                        2.2
                    } else {
                        3.3
                    };
            if (threat.active || threat.selected)
                && (distance < 24. || threat.selected)
                && let Ok(screen) = camera.world_to_viewport(camera_transform, anchor)
            {
                node.display = Display::Flex;
                node.left = px(screen.x - 124.);
                node.top = px(screen.y - 135.);
            } else {
                node.display = Display::None;
            }
        }
    }
    for (label, mut text, mut text_color) in &mut texts {
        if let Some(threat) = view.threats.iter().find(|t| t.id == label.0) {
            **text = readout(threat);
            text_color.0 = color(threat.phase);
        }
    }
    for (bar, mut node, mut background) in &mut progress {
        if let Some(threat) = view.threats.iter().find(|t| t.id == bar.0) {
            node.width = percent((threat.phase_progress.clamp(0., 1.) * 100.) as f32);
            background.0 = color(threat.phase);
        }
    }
}

pub(crate) fn animate(
    mut commands: Commands,
    display: Res<Displayed>,
    mut players: Query<(Entity, &mut AnimationPlayer, Option<&mut EnemyPlayback>)>,
    parents: Query<&ChildOf>,
    enemies: Query<&EnemyVisual>,
    assets: Res<AssetServer>,
    gltfs: Res<Assets<Gltf>>,
    animations: Res<Assets<AnimationClip>>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
    mut retained: Local<AnimationAssets>,
) {
    let Some(snapshot) = &display.snapshot else {
        return;
    };
    for (entity, mut player, playback) in &mut players {
        let mut root = entity;
        let mut owner = None;
        for _ in 0..32 {
            if let Ok(enemy) = enemies.get(root) {
                owner = Some(enemy);
                break;
            }
            let Ok(parent) = parents.get(root) else {
                break;
            };
            root = parent.parent();
        }
        let Some(owner) = owner else {
            continue;
        };
        let Some(threat) = snapshot.forest.threats.iter().find(|t| t.id == owner.id) else {
            continue;
        };
        if !retained.clips.contains_key(owner.model) {
            let handle = retained
                .models
                .entry(owner.model)
                .or_insert_with(|| assets.load(owner.model));
            let Some(gltf) = gltfs.get(&*handle) else {
                continue;
            };
            let wolf = owner.id == "patrol";
            let action = if wolf {
                "Attack"
            } else if owner.id == "scout" {
                "Victory"
            } else {
                "Punch"
            };
            let preparation = if wolf { "Idle_2_HeadLow" } else { "Idle" };
            let (Some(idle), Some(preparation), Some(action), Some(death)) = (
                gltf.named_animations.get("Idle"),
                gltf.named_animations.get(preparation),
                gltf.named_animations.get(action),
                gltf.named_animations.get("Death"),
            ) else {
                continue;
            };
            let Some(action_clip) = animations.get(action) else {
                continue;
            };
            let action_duration = action_clip.duration();
            let mut graph = AnimationGraph::new();
            let idle = graph.add_clip(idle.clone(), 1., graph.root);
            let preparation = graph.add_clip(preparation.clone(), 1., graph.root);
            let action = graph.add_clip(action.clone(), 1., graph.root);
            let death = graph.add_clip(death.clone(), 1., graph.root);
            retained.clips.insert(
                owner.model,
                ModelClips {
                    graph: graphs.add(graph),
                    idle,
                    preparation,
                    action,
                    death,
                    action_duration,
                },
            );
        }
        let clips = &retained.clips[owner.model];
        let target = match threat.phase {
            ThreatPhase::Preparation => clips.preparation,
            ThreatPhase::Action => clips.action,
            ThreatPhase::Cleared => clips.death,
            _ => clips.idle,
        };
        let changed = playback.as_ref().is_none_or(|state| {
            state.phase != threat.phase || state.sequence != threat.action_sequence
        });
        if changed {
            player.stop_all();
            let playing = player.start(target);
            if matches!(
                threat.phase,
                ThreatPhase::Dormant | ThreatPhase::Preparation | ThreatPhase::Recovery
            ) {
                playing.repeat();
            }
        }
        if threat.phase == ThreatPhase::Action {
            // Action begins only after the core resolves its result. Seeking keeps
            // cosmetic motion aligned even when a render frame skips simulation ticks.
            player
                .play(target)
                .pause()
                .set_seek_time(threat.phase_progress.clamp(0., 1.) as f32 * clips.action_duration);
        }
        if let Some(mut state) = playback {
            state.phase = threat.phase;
            state.sequence = threat.action_sequence;
        } else {
            commands.entity(entity).insert((
                AnimationGraphHandle(clips.graph.clone()),
                EnemyPlayback {
                    phase: threat.phase,
                    sequence: threat.action_sequence,
                },
            ));
        }
    }
}
