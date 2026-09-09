//! North is increasing world Z; every map feature shares the same projection.
use super::*;

const SIZE: f32 = 244.;
const INK: Color = Color::srgb(0.12, 0.17, 0.14);
const PAPER: Color = Color::srgb(0.91, 0.87, 0.73);
const BLUE: Color = Color::srgb(0.02, 0.29, 0.53);

#[derive(Component)]
pub(crate) struct Canvas;
#[derive(Component)]
pub(crate) struct Caption;
#[derive(Component)]
pub(crate) struct Terrain {
    center: [f64; 2],
    size: [f32; 2],
}
#[derive(Component)]
pub(crate) enum Mark {
    Place(usize),
    Threat(usize),
    Player,
}

fn text(assets: &AssetServer, value: impl Into<String>, size: f32, color: Color) -> impl Bundle {
    (
        Text::new(value),
        TextFont {
            font: FontSource::Handle(assets.load("ui/fonts/LiberationSerif-Regular.ttf")),
            font_size: FontSize::Px(size),
            ..default()
        },
        TextColor(color),
    )
}

pub(super) fn setup(commands: &mut Commands, assets: &AssetServer) {
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                right: px(12),
                top: px(12),
                width: px(264),
                padding: UiRect::all(px(9)),
                flex_direction: FlexDirection::Column,
                row_gap: px(5),
                border: UiRect::all(px(1)),
                ..default()
            },
            BackgroundColor(PAPER),
            BorderColor::all(INK),
            GlobalZIndex(6),
            Interaction::None,
            hud::Surface,
        ))
        .with_children(|p| {
            p.spawn((text(assets, "Frostwood · N ↑", 18., INK), Caption));
            p.spawn((
                Node {
                    width: px(SIZE),
                    height: px(SIZE),
                    overflow: Overflow::clip(),
                    flex_shrink: 0.,
                    ..default()
                },
                BackgroundColor(Color::srgb(0.73, 0.79, 0.65)),
                Canvas,
            ))
            .with_children(|p| {
                // Match the world road, town wall and four houses in forest::setup.
                for (center, size, color) in [
                    ([0., -10.], [70., 20.], PAPER),
                    ([0., 15.], [5., 60.], Color::srgb(0.77, 0.65, 0.44)),
                    ([-8., 0.], [10., 0.7], INK),
                    ([8., 0.], [10., 0.7], INK),
                    ([-8., -9.], [4., 4.], Color::srgb(0.45, 0.38, 0.29)),
                    ([8., -9.], [4., 4.], Color::srgb(0.45, 0.38, 0.29)),
                    ([-8., -3.], [4., 4.], Color::srgb(0.45, 0.38, 0.29)),
                    ([8., -3.], [4., 4.], Color::srgb(0.45, 0.38, 0.29)),
                    ([0., 15.], [0.45, 60.], BLUE),
                ] {
                    p.spawn((
                        Node {
                            position_type: PositionType::Absolute,
                            ..default()
                        },
                        BackgroundColor(color),
                        Terrain { center, size },
                    ));
                }
                // Southbound arrows identify the road back through the gate.
                for z in [5., 22., 32.] {
                    p.spawn((
                        text(assets, "↓", 19., BLUE),
                        Node {
                            position_type: PositionType::Absolute,
                            ..default()
                        },
                        Terrain {
                            center: [0., z],
                            size: [0., 0.],
                        },
                    ));
                }
            });
            p.spawn(Node {
                justify_content: JustifyContent::SpaceBetween,
                align_items: AlignItems::Center,
                ..default()
            })
            .with_children(|p| {
                p.spawn(text(assets, "▲ You   1 Threat   ↓ Home", 14., INK));
                p.spawn((
                    Button,
                    Control::MapZoom,
                    Node {
                        padding: UiRect::axes(px(5), px(2)),
                        border: UiRect::all(px(1)),
                        ..default()
                    },
                    BorderColor::all(INK),
                    BackgroundColor(PAPER),
                ))
                .with_children(|p| {
                    p.spawn(text(assets, "Zoom", 14., INK));
                });
            });
        });
}

fn project(position: [f64; 2], center: [f64; 2], scale: f32) -> Vec2 {
    Vec2::new(
        SIZE / 2. + (position[0] - center[0]) as f32 * scale,
        SIZE / 2. - (position[1] - center[1]) as f32 * scale,
    )
}

pub(crate) fn present(
    mut commands: Commands,
    assets: Res<AssetServer>,
    display: Res<Displayed>,
    state: Option<Res<hud::State>>,
    orbit: Option<Res<Orbit>>,
    canvas: Query<Entity, With<Canvas>>,
    mut initialized: Local<bool>,
    mut terrain: Query<(&Terrain, &mut Node), Without<Mark>>,
    mut marks: Query<
        (
            &Mark,
            &mut Node,
            &mut Visibility,
            &mut UiTransform,
            &mut BorderColor,
        ),
        Without<Terrain>,
    >,
    mut caption: Query<&mut Text, With<Caption>>,
) {
    let Some(view) = display.snapshot.as_ref().map(|s| &s.forest) else {
        return;
    };
    let Ok(canvas) = canvas.single() else {
        return;
    };
    let zoom = state.as_ref().is_some_and(|s| s.zoom);
    let scale = if zoom { 6. } else { 3.4 };
    let center = if zoom {
        view.position
    } else {
        [view.position[0], view.position[1].clamp(15., 19.)]
    };
    for mut caption in &mut caption {
        **caption = format!(
            "{} · N ↑ · {}",
            view.location_name(),
            if zoom { "Near" } else { "All" }
        );
    }
    if !*initialized {
        commands.entity(canvas).with_children(|p| {
            if let Some((_, _, center)) = view.places.iter().find(|(id, _, _)| id == "ritual-site")
            {
                p.spawn((
                    Node {
                        position_type: PositionType::Absolute,
                        ..default()
                    },
                    BackgroundColor(Color::srgb(0.85, 0.84, 0.66)),
                    Terrain {
                        center: *center,
                        size: [10., 8.],
                    },
                    ZIndex(-1),
                ));
            }
            for (i, (id, _, _)) in view.places.iter().enumerate() {
                let (symbol, label, color, left) = match id.as_str() {
                    "hearthstead" => ("H", "Hearthstead", INK, true),
                    "forest-gate" => ("Π", "Gate / home", INK, false),
                    "frost-cores" => ("◆", "Frost cores", BLUE, true),
                    "ritual-site" => ("◇", "Deep grove", Color::srgb(0.35, 0.17, 0.45), true),
                    "mara" => ("+", "Mara", Color::srgb(0.18, 0.35, 0.19), false),
                    _ => continue,
                };
                p.spawn((
                    Node {
                        position_type: PositionType::Absolute,
                        width: px(18),
                        height: px(18),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        border: UiRect::all(px(1)),
                        ..default()
                    },
                    BackgroundColor(PAPER),
                    BorderColor::all(color),
                    Mark::Place(i),
                    ZIndex(2),
                ))
                .with_children(|p| {
                    p.spawn(text(&assets, symbol, 16., color));
                    p.spawn((
                        text(&assets, label, 14., INK),
                        Node {
                            position_type: PositionType::Absolute,
                            left: if left { Val::Auto } else { px(21) },
                            right: if left { px(21) } else { Val::Auto },
                            top: px(if id == "hearthstead" { 9. } else { -2. }),
                            width: px(86),
                            padding: UiRect::axes(px(2), px(1)),
                            ..default()
                        },
                        BackgroundColor(PAPER),
                    ));
                });
            }
            for (i, _) in view.threats.iter().enumerate() {
                p.spawn((
                    Button,
                    Control::Target(i),
                    Mark::Threat(i),
                    ZIndex(3),
                    Node {
                        position_type: PositionType::Absolute,
                        width: px(19),
                        height: px(19),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        border: UiRect::all(px(2)),
                        ..default()
                    },
                    BorderColor::all(Color::srgb(0.58, 0.09, 0.06)),
                ))
                .with_children(|p| {
                    p.spawn((
                        text(&assets, format!("{}", i + 1), 15., Color::WHITE),
                        BackgroundColor(Color::srgb(0.58, 0.09, 0.06)),
                    ));
                });
            }
            p.spawn((
                Mark::Player,
                ZIndex(5),
                Node {
                    position_type: PositionType::Absolute,
                    width: px(24),
                    height: px(24),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    border: UiRect::all(px(1)),
                    ..default()
                },
                BackgroundColor(Color::srgb(0.98, 0.96, 0.82)),
                BorderColor::all(BLUE),
            ))
            .with_children(|p| {
                p.spawn(text(&assets, "▲", 24., BLUE));
            });
        });
        *initialized = true;
    }
    for (feature, mut node) in &mut terrain {
        let point = project(feature.center, center, scale);
        if feature.size[0] == 0. {
            node.left = px(point.x - 7.);
            node.top = px(point.y - 11.);
        } else {
            node.width = px(feature.size[0] * scale);
            node.height = px(feature.size[1] * scale);
            node.left = px(point.x - feature.size[0] * scale / 2.);
            node.top = px(point.y - feature.size[1] * scale / 2.);
        }
    }
    for (mark, mut node, mut visible, mut transform, mut border) in &mut marks {
        let (position, radius, active) = match mark {
            Mark::Place(i) => (view.places[*i].2, 9., true),
            Mark::Threat(i) => {
                let t = &view.threats[*i];
                *border = BorderColor::all(if t.selected {
                    Color::srgb(1., 0.8, 0.1)
                } else {
                    INK
                });
                (t.position, 9.5, t.active && t.health > 0.)
            }
            Mark::Player => {
                transform.rotation = Rot2::radians(orbit.as_ref().map_or(0., |r| r.heading));
                (view.position, 12., true)
            }
        };
        let point = project(position, center, scale);
        node.left = px(point.x - radius);
        node.top = px(point.y - radius);
        *visible = if active
            && point.x >= radius
            && point.x <= SIZE - radius
            && point.y >= radius
            && point.y <= SIZE - radius
        {
            Visibility::Inherited
        } else {
            Visibility::Hidden
        };
    }
}
