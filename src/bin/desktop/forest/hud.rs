//! Parchment frames and a local journal of observed expedition changes.
use super::*;
use greywrought::game::Command;
use std::collections::VecDeque;

const INK: Color = Color::srgb(0.22, 0.17, 0.12);
#[derive(Component)]
pub(crate) struct Surface;
#[derive(Component)]
pub(crate) struct Copy(Field);
#[derive(Clone, Copy)]
enum Field {
    Player,
    Vitality,
    Presence,
    Target,
    TargetHealth,
    Intent,
    Objectives,
    Packs,
    Footer,
    Journal,
    Help,
    Shop,
}
#[derive(Component)]
pub(crate) struct Meter(bool);
#[derive(Component)]
pub(crate) struct HelpPanel;
#[derive(Component)]
pub(crate) struct ShopPanel;
#[derive(Resource, Default)]
pub(crate) struct State {
    pub help: bool,
    pub combat: bool,
    pub zoom: bool,
    entries: VecDeque<(bool, String)>,
    report: String,
    status: String,
    shop_status: String,
    threat: String,
    health: BTreeMap<String, f64>,
}
fn text(assets: &AssetServer, value: impl Into<String>, size: f32) -> impl Bundle {
    (
        Text::new(value),
        TextFont {
            font: FontSource::Handle(assets.load("ui/fonts/LiberationSerif-Regular.ttf")),
            font_size: FontSize::Px(size),
            ..default()
        },
        TextColor(INK),
    )
}
fn paper(assets: &AssetServer, node: Node) -> impl Bundle {
    (
        node,
        ImageNode {
            image: assets.load("ui/parchment.png"),
            image_mode: NodeImageMode::Stretch,
            visual_box: bevy::ui::VisualBox::BorderBox,
            ..default()
        },
        Interaction::None,
        Surface,
        GlobalZIndex(5),
    )
}
fn icon(assets: &AssetServer, path: &'static str, size: f32) -> impl Bundle {
    (
        ImageNode::new(assets.load(path)),
        Node {
            width: px(size),
            height: px(size),
            flex_shrink: 0.,
            ..default()
        },
    )
}
fn slot(
    p: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    control: Control,
    path: &'static str,
    caption: &str,
    small: bool,
) {
    p.spawn((
        Button,
        control,
        Node {
            width: px(if small { 66. } else { 78. }),
            height: px(if small { 55. } else { 78. }),
            align_items: AlignItems::Center,
            justify_content: JustifyContent::Center,
            flex_direction: FlexDirection::Column,
            border: UiRect::all(px(1)),
            ..default()
        },
        BorderColor::all(INK),
        BackgroundColor(Color::srgba(0.58, 0.43, 0.23, 0.13)),
    ))
    .with_children(|p| {
        p.spawn(icon(assets, path, if small { 33. } else { 49. }));
        p.spawn(text(assets, caption, 13.));
    });
}
fn meter(p: &mut ChildSpawnerCommands, assets: &AssetServer, target: bool) {
    p.spawn((
        Node {
            width: percent(100),
            height: px(22),
            border: UiRect::all(px(1)),
            ..default()
        },
        BorderColor::all(INK),
        BackgroundColor(Color::srgb(0.64, 0.56, 0.42)),
    ))
    .with_children(|p| {
        p.spawn((
            Node {
                position_type: PositionType::Absolute,
                width: percent(100),
                height: percent(100),
                ..default()
            },
            BackgroundColor(if target {
                Color::srgb(0.72, 0.36, 0.29)
            } else {
                Color::srgb(0.48, 0.65, 0.36)
            }),
            Meter(target),
        ));
        p.spawn((
            text(assets, "", 15.),
            Node {
                margin: UiRect::left(px(5)),
                ..default()
            },
            Copy(if target {
                Field::TargetHealth
            } else {
                Field::Vitality
            }),
        ));
    });
}
pub(super) fn setup(commands: &mut Commands, assets: &AssetServer) {
    commands.insert_resource(State::default());
    commands
        .spawn(paper(
            assets,
            Node {
                position_type: PositionType::Absolute,
                left: px(12),
                top: px(12),
                width: px(302),
                height: px(108),
                padding: UiRect::all(px(12)),
                column_gap: px(8),
                ..default()
            },
        ))
        .with_children(|p| {
            p.spawn(icon(assets, "ui/icons/menu/character-profile.png", 66.));
            p.spawn(Node {
                flex_grow: 1.,
                flex_direction: FlexDirection::Column,
                row_gap: px(4),
                ..default()
            })
            .with_children(|p| {
                p.spawn((text(assets, "Wayfarer", 22.), Copy(Field::Player)));
                meter(p, assets, false);
                p.spawn((text(assets, "", 14.), Copy(Field::Presence)));
            });
        });
    commands
        .spawn(paper(
            assets,
            Node {
                position_type: PositionType::Absolute,
                left: percent(50),
                margin: UiRect::left(px(-166)),
                top: px(14),
                width: px(332),
                height: px(94),
                padding: UiRect::all(px(12)),
                column_gap: px(8),
                ..default()
            },
        ))
        .with_children(|p| {
            p.spawn(Node {
                flex_grow: 1.,
                flex_direction: FlexDirection::Column,
                row_gap: px(5),
                ..default()
            })
            .with_children(|p| {
                p.spawn((text(assets, "Select a threat", 21.), Copy(Field::Target)));
                meter(p, assets, true);
            });
            p.spawn(icon(assets, "ui/icons/items/shield-emblem.png", 54.));
        });
    super::map::setup(commands, assets);
    commands
        .spawn(paper(
            assets,
            Node {
                position_type: PositionType::Absolute,
                right: px(12),
                top: px(338),
                width: px(264),
                padding: UiRect::all(px(13)),
                flex_direction: FlexDirection::Column,
                row_gap: px(5),
                ..default()
            },
        ))
        .with_children(|p| {
            p.spawn((
                text(assets, "The Frostwood Expedition", 19.),
                Node {
                    padding: UiRect::bottom(px(4)),
                    border: UiRect::bottom(px(1)),
                    ..default()
                },
                BorderColor::all(INK),
            ));
            p.spawn((text(assets, "", 14.), Copy(Field::Objectives)));
            p.spawn(text(assets, "Along the trail", 17.));
            for i in 0..5 {
                p.spawn((
                    Button,
                    Control::Target(i),
                    Node {
                        padding: UiRect::axes(px(3), px(3)),
                        ..default()
                    },
                    BackgroundColor(Color::srgba(0.55, 0.42, 0.23, 0.08)),
                ))
                .with_children(|p| {
                    p.spawn((text(assets, "", 14.), ThreatReadout(i)));
                });
            }
        });
    commands
        .spawn(paper(
            assets,
            Node {
                position_type: PositionType::Absolute,
                left: px(0),
                bottom: px(24),
                width: percent(27),
                min_width: px(300),
                max_width: px(365),
                height: px(164),
                padding: UiRect::all(px(12)),
                flex_direction: FlexDirection::Column,
                row_gap: px(7),
                overflow: Overflow::clip(),
                ..default()
            },
        ))
        .with_children(|p| {
            p.spawn(Node {
                column_gap: px(15),
                border: UiRect::bottom(px(1)),
                padding: UiRect::bottom(px(5)),
                ..default()
            })
            .insert(BorderColor::all(INK))
            .with_children(|p| {
                for (control, caption) in [
                    (Control::Journal(false), "Expedition"),
                    (Control::Journal(true), "Combat log"),
                ] {
                    p.spawn((Button, control)).with_children(|p| {
                        p.spawn(text(assets, caption, 18.));
                    });
                }
            });
            p.spawn((
                text(assets, "Your journey begins.", 14.),
                Copy(Field::Journal),
            ));
        });
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: percent(50),
                margin: UiRect::left(px(-174)),
                bottom: px(28),
                width: px(348),
                flex_direction: FlexDirection::Column,
                row_gap: px(5),
                ..default()
            },
            GlobalZIndex(5),
        ))
        .with_children(|p| {
            p.spawn(paper(
                assets,
                Node {
                    width: percent(100),
                    min_height: px(35),
                    padding: UiRect::axes(px(10), px(6)),
                    ..default()
                },
            ))
            .with_children(|p| {
                p.spawn((
                    text(assets, "Read the trail; choose your next move.", 14.),
                    Copy(Field::Intent),
                ));
            });
            p.spawn(paper(
                assets,
                Node {
                    padding: UiRect::all(px(9)),
                    column_gap: px(6),
                    ..default()
                },
            ))
            .with_children(|p| {
                for (binding, path, caption) in [
                    (
                        Command::Strike,
                        "ui/icons/spells/sword-strike.png",
                        "1 · Strike",
                    ),
                    (
                        Command::Brace,
                        "ui/icons/spells/defensive-shield.png",
                        "B · Brace",
                    ),
                    (
                        Command::Gather,
                        "ui/icons/spells/nature-leaf.png",
                        "G · Gather",
                    ),
                    (
                        Command::Ritual,
                        "ui/icons/spells/holy-light.png",
                        "R · Ritual",
                    ),
                ] {
                    slot(p, assets, Control::Action(binding), path, caption, false);
                }
            });
            p.spawn(paper(
                assets,
                Node {
                    padding: UiRect::all(px(7)),
                    justify_content: JustifyContent::Center,
                    column_gap: px(9),
                    ..default()
                },
            ))
            .with_children(|p| {
                slot(
                    p,
                    assets,
                    Control::Action(Command::Rest),
                    "ui/icons/spells/healing-cross.png",
                    "Rest",
                    true,
                );
                slot(
                    p,
                    assets,
                    Control::Outfit,
                    "ui/icons/items/leather-satchel.png",
                    "O · Outfit",
                    true,
                );
                slot(
                    p,
                    assets,
                    Control::Save,
                    "ui/icons/items/sealed-parchment.png",
                    "F5 · Save",
                    true,
                );
                slot(
                    p,
                    assets,
                    Control::Help,
                    "ui/icons/menu/help.png",
                    "Guide",
                    true,
                );
            });
        });
    commands
        .spawn(paper(
            assets,
            Node {
                position_type: PositionType::Absolute,
                right: px(0),
                bottom: px(24),
                width: px(252),
                padding: UiRect::all(px(11)),
                flex_direction: FlexDirection::Column,
                row_gap: px(7),
                ..default()
            },
        ))
        .with_children(|p| {
            p.spawn((text(assets, "", 15.), Copy(Field::Packs)));
            p.spawn(Node {
                column_gap: px(7),
                ..default()
            })
            .with_children(|p| {
                slot(
                    p,
                    assets,
                    Control::Outfit,
                    "ui/icons/items/leather-satchel.png",
                    "Inventory",
                    true,
                );
                slot(
                    p,
                    assets,
                    Control::Outfit,
                    "ui/icons/menu/character-profile.png",
                    "Equipment",
                    true,
                );
                slot(
                    p,
                    assets,
                    Control::Help,
                    "ui/icons/menu/menu-list.png",
                    "Controls",
                    true,
                );
            });
        });
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: px(0),
                right: px(0),
                bottom: px(0),
                height: px(24),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                ..default()
            },
            BackgroundColor(Color::srgb(0.79, 0.69, 0.49)),
            GlobalZIndex(5),
            Interaction::None,
            Surface,
        ))
        .with_children(|p| {
            p.spawn((text(assets, "", 14.), Copy(Field::Footer)));
        });
    commands
        .spawn((
            paper(
                assets,
                Node {
                    position_type: PositionType::Absolute,
                    left: percent(50),
                    margin: UiRect::left(px(-210)),
                    top: percent(28),
                    width: px(420),
                    padding: UiRect::all(px(24)),
                    flex_direction: FlexDirection::Column,
                    row_gap: px(16),
                    ..default()
                },
            ),
            ShopPanel,
            Visibility::Hidden,
        ))
        .insert(GlobalZIndex(24))
        .with_children(|p| {
            p.spawn(text(assets, "Mara’s Apothecary", 26.));
            p.spawn((text(assets, "", 18.), Copy(Field::Shop)));
            p.spawn(button(Control::Action(Command::BuyPotion)))
                .with_children(|p| {
                    p.spawn(text(assets, "Buy health potion", 19.));
                });
            p.spawn(button(Control::Action(Command::CloseShop)))
                .with_children(|p| {
                    p.spawn(text(assets, "Back to the road · Esc", 17.));
                });
        });
    commands.spawn((paper(assets,Node{position_type:PositionType::Absolute,left:percent(50),margin:UiRect::left(px(-235)),top:percent(28),width:px(470),padding:UiRect::all(px(24)),flex_direction:FlexDirection::Column,row_gap:px(12),..default()}),HelpPanel,Visibility::Hidden)).insert(GlobalZIndex(25)).with_children(|p|{
        p.spawn((text(assets,"A Wayfarer’s Guide",26.),Copy(Field::Help)));
        p.spawn(text(assets,"Walk through the north gate into Frostwood. Gather frost cores, overcome the trail’s threats and reach Hearthstead alive to secure your finds.\n\nW / S  Forward / back     A / D  Strafe\nDrag  Look around     Right-drag  Steer\nBoth mouse buttons  Walk forward\nWheel  Move the view closer or farther\nTab / click  Choose a threat     1  Strike\nSpace  Jump     F  Talk to Mara     H  Drink potion\nB  Brace     G  Gather     R  Offer a ritual\nO  Equipment     F5  Save",17.));
        p.spawn((Button,Control::Help,Node{padding:UiRect::all(px(8)),..default()},BackgroundColor(Color::srgba(0.6,0.45,0.25,0.2)))).with_children(|p|{p.spawn(text(assets,"Back to the trail · Esc",18.));});
    });
}
fn remember(state: &mut State, combat: bool, message: String, seconds: u64) {
    state.entries.push_back((
        combat,
        format!("{:02}:{:02}  {}", seconds / 60, seconds % 60, message),
    ));
    while state.entries.len() > 30 {
        state.entries.pop_front();
    }
}
pub(crate) fn present(
    display: Res<Displayed>,
    time: Res<Time>,
    mut state: Option<ResMut<State>>,
    mut texts: Query<(&Copy, &mut Text)>,
    mut meters: Query<(&Meter, &mut Node)>,
    mut help: Query<&mut Visibility, (With<HelpPanel>, Without<ShopPanel>)>,
    mut shop: Query<&mut Visibility, (With<ShopPanel>, Without<HelpPanel>)>,
    mut buttons: Query<(&Interaction, &mut BackgroundColor), With<Button>>,
) {
    let Some(mut state) = state.take() else {
        return;
    };
    let Some(view) = display.snapshot.as_ref().map(|s| &s.forest) else {
        return;
    };
    for mut visible in &mut shop {
        *visible = if view.shop_open {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
    let seconds = time.elapsed_secs() as u64;
    if state.shop_status != view.shop_status {
        state.shop_status = view.shop_status.clone();
        remember(&mut state, false, view.shop_status.clone(), seconds);
    }
    if state.report != view.equipment.report {
        state.report = view.equipment.report.clone();
        remember(&mut state, false, view.equipment.report.clone(), seconds);
    }
    if state.status != display.status {
        state.status = display.status.clone();
        if !display.status.is_empty() {
            remember(&mut state, false, display.status.clone(), seconds);
        }
    }
    for threat in &view.threats {
        if let Some(previous) = state.health.insert(threat.id.clone(), threat.health) {
            if threat.health < previous {
                remember(
                    &mut state,
                    true,
                    format!(
                        "{} loses {:.0} vitality ({:.0} remaining).",
                        threat.name,
                        previous - threat.health,
                        threat.health
                    ),
                    seconds,
                );
            }
        }
    }
    let selected = view.threats.iter().find(|t| t.selected);
    let current = selected
        .map(|t| format!("{}: {}", t.name, t.current_intent))
        .unwrap_or_default();
    if state.threat != current {
        state.threat = current.clone();
        if !current.is_empty() {
            remember(&mut state, true, current, seconds);
        }
    }
    let maximum = view
        .equipment
        .body_parts
        .iter()
        .find(|p| p.id == "torso")
        .map(|p| p.maximum_health)
        .unwrap_or(view.vitality);
    for (field, mut value) in &mut texts {
        **value = match field.0 {
            Field::Player => view.equipment.creature_name.clone(),
            Field::Vitality => format!("Vitality  {:.0} / {:.0}", view.vitality, maximum),
            Field::Presence => format!(
                "Presence {:.1}  ·  {}",
                view.presence,
                if view.connected {
                    "Connected"
                } else {
                    "Connection paused"
                }
            ),
            Field::Target => selected
                .map(|t| t.name.clone())
                .unwrap_or("Choose a trail threat".into()),
            Field::TargetHealth => selected
                .map(|t| format!("Vitality  {:.0} / {:.0}", t.health, t.maximum_health))
                .unwrap_or("Click a name on the trail".into()),
            Field::Intent => selected
                .map(|t| format!("Now: {}  ·  Next: {}", t.current_intent, t.upcoming_intent))
                .unwrap_or("Read the trail; choose your next move.".into()),
            Field::Objectives => format!(
                "Gather frost cores\n   {:.0} carried · {:.0} in the grove\nReturn alive to Hearthstead\n   {:.0} supplies secured\nSeek the frost relic\n   {:.0} carried · {:.0} secured",
                view.cargo,
                view.resource_remaining,
                view.stock,
                view.carried_relics,
                view.banked_relics
            ),
            Field::Packs => format!(
                "Your pack · {:.0} cores · {:.0} relics · {:.0} potions [H]",
                view.cargo, view.carried_relics, view.potions
            ),
            Field::Footer => format!(
                "GREYWROUGHT    ·    {}    ·    {:.0} supplies secured    ·    Walk home to bank your finds",
                view.location_name(),
                view.stock
            ),
            Field::Journal => {
                let entries = state
                    .entries
                    .iter()
                    .filter(|(combat, _)| !state.combat || *combat)
                    .rev()
                    .take(4)
                    .map(|(_, s)| s.as_str())
                    .collect::<Vec<_>>();
                if entries.is_empty() {
                    "No combat recorded this journey.".into()
                } else {
                    entries.into_iter().rev().collect::<Vec<_>>().join("\n")
                }
            }
            Field::Shop => format!(
                "Health potion\nRestores {:.0} health · {:.0} supplies\n\nSupplies: {:.0}    Potions: {:.0}\n\n{}",
                view.potion_healing, view.potion_price, view.stock, view.potions, view.shop_status
            ),
            Field::Help => "A Wayfarer’s Guide".into(),
        };
    }
    for (meter, mut node) in &mut meters {
        let (value, max) = if meter.0 {
            selected
                .map(|t| (t.health, t.maximum_health))
                .unwrap_or((0., 1.))
        } else {
            (view.vitality, maximum)
        };
        node.width = percent(if max > 0. {
            (value / max * 100.).clamp(0., 100.) as f32
        } else {
            0.
        });
    }
    for mut visible in &mut help {
        *visible = if state.help {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
    for (interaction, mut color) in &mut buttons {
        *color = BackgroundColor(match interaction {
            Interaction::Pressed => Color::srgba(0.42, 0.30, 0.13, 0.42),
            Interaction::Hovered => Color::srgba(0.76, 0.58, 0.27, 0.36),
            Interaction::None => Color::srgba(0.58, 0.43, 0.23, 0.13),
        });
    }
}
