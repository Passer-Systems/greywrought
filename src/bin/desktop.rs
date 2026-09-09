//! Native window, player input and fixed-step presentation.
use bevy::{
    input::mouse::MouseWheel,
    prelude::*,
    window::{PrimaryWindow, WindowCloseRequested},
};
use greywrought::{
    game::{Command, Game, Snapshot},
    persistence,
};
use std::{
    collections::BTreeMap,
    fs::File,
    path::PathBuf,
    time::{Duration, Instant},
};
#[path = "desktop/forest.rs"]
mod forest;
#[path = "desktop/measurement.rs"]
mod measurement;
use measurement::{Smoke, smoke};

#[derive(Resource, Default)]
struct InputQueue {
    commands: Vec<Command>,
    save: bool,
    new_journey: bool,
}
#[derive(Resource)]
struct Journey {
    game: Option<Game>,
    save: PathBuf,
    _lease: Option<File>,
    stopped: bool,
}
#[derive(Resource, Default)]
struct Displayed {
    snapshot: Option<Snapshot>,
    status: String,
    alert: bool,
}
#[derive(Component)]
struct Hud;
#[derive(Component)]
struct LostPanel;
#[derive(Component)]
struct NewJourney;
#[derive(Component)]
struct Actor {
    id: String,
}
#[derive(Component)]
struct Motion {
    moving: bool,
    alive: bool,
}
#[derive(Component)]
struct Clips {
    idle: AnimationNodeIndex,
    run: AnimationNodeIndex,
}

fn main() -> greywrought::Result<()> {
    let mut root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".local/share")
        });
    let mut save = data.join("greywrought/spatial-rust.json");
    let mut smoke_seconds = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--root" => root = args.next().ok_or("--root needs a path")?.into(),
            "--save" => save = args.next().ok_or("--save needs a path")?.into(),
            "--forest" => {}
            "--smoke-seconds" => {
                smoke_seconds = Some(
                    args.next()
                        .ok_or("--smoke-seconds needs a duration")?
                        .parse()?,
                )
            }
            _ => return Err(format!("unknown argument: {arg}").into()),
        }
    }
    let (game, lease, display) = match open_journey(&save) {
        Ok((game, lease)) => {
            let snapshot = game.snapshot();
            let status = snapshot.status.clone();
            (
                Some(game),
                Some(lease),
                Displayed {
                    snapshot: Some(snapshot),
                    status,
                    alert: false,
                },
            )
        }
        Err(error) => {
            eprintln!("cannot open saved journey {}: {error}", save.display());
            (None, None, Displayed { snapshot: None, alert: true, status: "Your journey could not be opened. Close this window and check the game log; your save has been kept.".into() })
        }
    };
    let mut virtual_time = Time::<Virtual>::default();
    virtual_time.set_max_delta(Duration::MAX);
    let mut app = App::new();
    app.insert_resource(Journey {
        game,
        save,
        _lease: lease,
        stopped: false,
    })
    .insert_resource(display)
    .insert_resource(InputQueue::default())
    .insert_resource(virtual_time)
    .insert_resource(Time::<Fixed>::from_duration(Duration::from_millis(16)))
    .insert_resource(Smoke::new(smoke_seconds))
    .insert_resource(measurement::WorldTimings::new(smoke_seconds.is_some()))
    .insert_resource(ClearColor(Color::srgb(0.045, 0.064, 0.055)))
    .insert_resource(GlobalAmbientLight {
        brightness: 500.,
        ..default()
    })
    .add_plugins(
        DefaultPlugins
            .set(AssetPlugin {
                file_path: root.join("assets").to_string_lossy().into_owned(),
                ..default()
            })
            .set(WindowPlugin {
                primary_window: Some(Window {
                    title: "Greywrought".into(),
                    name: Some("Greywrought".into()),
                    resolution: (1440, 900).into(),
                    ..default()
                }),
                close_when_requested: false,
                ..default()
            }),
    )
    .add_systems(Startup, setup)
    .add_systems(FixedUpdate, advance)
    .add_systems(
        Update,
        (
            controls,
            forest::controls,
            forest::present,
            forest::combat::sync,
            forest::combat::animate,
            forest::hud::present,
            forest::map::present,
            forest::navigate,
            animate,
            hud,
            close_window,
            smoke,
        )
            .chain(),
    );
    app.run();
    Ok(())
}
fn open_journey(save: &std::path::Path) -> greywrought::Result<(Game, File)> {
    if let Some(parent) = save.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)?;
    }
    let lease = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(save.with_extension("lock"))?;
    lease
        .try_lock()
        .map_err(|_| "this saved journey is already open in another window")?;
    Ok((persistence::load(save)?, lease))
}
fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    assets: Res<AssetServer>,
) {
    forest::setup(&mut commands, &mut meshes, &mut materials, &assets);
    eprintln!("native game ready");
    commands.spawn((
        Node { position_type: PositionType::Absolute, left: percent(50), top: percent(28), margin: UiRect::left(px(-240)), width: px(480), padding: UiRect::all(px(24)), flex_direction: FlexDirection::Column, row_gap: px(20), ..default() },
        BackgroundColor(Color::srgb(0.86, 0.78, 0.60)), GlobalZIndex(80), Visibility::Hidden, LostPanel,
        Interaction::None, forest::hud::Surface,
    )).with_children(|p| {
        p.spawn(forest::label("This journey has ended. Your fallen wayfarer and their final possessions will be kept when you begin again.", 22.));
        p.spawn((Button, NewJourney, Node { padding: UiRect::all(px(12)), ..default() }, BackgroundColor(Color::srgb(0.67, 0.56, 0.36))))
            .with_children(|p| { p.spawn(forest::label("Begin a new journey · N", 22.)); });
    });
    commands.spawn((
        Text::new(""),
        TextFont {
            font_size: FontSize::Px(18.),
            ..default()
        },
        TextColor(Color::WHITE),
        Node {
            position_type: PositionType::Absolute,
            left: px(20),
            right: px(20),
            top: percent(42),
            padding: UiRect::all(px(20)),
            ..default()
        },
        BackgroundColor(Color::srgba(0.04, 0.06, 0.04, 0.95)),
        GlobalZIndex(100),
        Visibility::Hidden,
        Hud,
    ));
}
fn advance(
    mut journey: ResMut<Journey>,
    mut input: ResMut<InputQueue>,
    mut display: ResMut<Displayed>,
    mut timings: ResMut<measurement::WorldTimings>,
) {
    if journey.stopped || journey.game.is_none() {
        input.commands.clear();
        return;
    }
    if std::mem::take(&mut input.new_journey) {
        let previous = journey.game.as_ref().expect("checked above");
        if previous.phase == "Lost" {
            match persistence::start_new_journey(previous, &journey.save) {
                Ok((fresh, archive)) => {
                    eprintln!("ended journey preserved: {}", archive.display());
                    display.snapshot = Some(fresh.snapshot());
                    display.status =
                        "A new journey begins. Your previous wayfarer has been kept.".into();
                    display.alert = false;
                    journey.game = Some(fresh);
                    input.commands.clear();
                }
                Err(error) => {
                    eprintln!("cannot begin new journey: {error}");
                    display.status = "A new journey could not be saved. Your previous wayfarer is still here; check the game log, then press N to try again.".into();
                    display.alert = true;
                }
            }
        }
    }
    let started = Instant::now();
    let game = journey.game.as_mut().expect("checked above");
    for command in input.commands.drain(..) {
        if let Err(error) = game.command(command) {
            eprintln!("journey command failed: {error}");
            display.status =
                "That action could not be completed. Try again or check the game log.".into();
        }
    }
    if let Err(error) = game.tick() {
        eprintln!("journey tick failed: {error}");
        journey.stopped = true;
        display.status =
            "The journey stopped. Your last save is safe; close the window and check the game log."
                .into();
        return;
    }
    let runtime = started.elapsed();
    let publish = Instant::now();
    let snapshot = game.snapshot();
    if display
        .snapshot
        .as_ref()
        .is_none_or(|old| old.status != snapshot.status)
    {
        display.status.clone_from(&snapshot.status);
    }
    let tick = snapshot.ticks;
    display.snapshot = Some(snapshot);
    timings.tick(tick, runtime, publish.elapsed());
    if std::mem::take(&mut input.save) {
        save_journey(&journey, &mut display);
    }
}
fn save_journey(journey: &Journey, display: &mut Displayed) -> bool {
    let Some(game) = &journey.game else {
        return true;
    };
    if journey.stopped {
        return true;
    }
    match persistence::save(game, &journey.save) {
        Ok(()) => {
            display.status = "Journey saved".into();
            display.alert = false;
            true
        }
        Err(error) => {
            eprintln!("cannot save journey {}: {error}", journey.save.display());
            display.alert = true;
            display.status = "Your journey could not be saved. Keep this window open, check the game log, then try F5 again.".into();
            false
        }
    }
}
fn controls(
    keys: Res<ButtonInput<KeyCode>>,
    mut input: ResMut<InputQueue>,
    display: Res<Displayed>,
    buttons: Query<&Interaction, (With<NewJourney>, Changed<Interaction>)>,
) {
    if display
        .snapshot
        .as_ref()
        .is_some_and(|s| s.forest.equipment.phase == "Lost")
        && (keys.just_pressed(KeyCode::KeyN) || buttons.iter().any(|i| *i == Interaction::Pressed))
    {
        input.new_journey = true;
    }
    if keys.just_pressed(KeyCode::F5) {
        input.save = true;
    }
}
fn close_window(
    mut requests: MessageReader<WindowCloseRequested>,
    journey: Res<Journey>,
    mut display: ResMut<Displayed>,
    mut exit: MessageWriter<AppExit>,
    timings: Res<measurement::WorldTimings>,
) {
    if requests.read().next().is_some() && save_journey(&journey, &mut display) {
        timings.report();
        exit.write(AppExit::Success);
    }
}
fn hud(
    display: Res<Displayed>,
    journey: Res<Journey>,
    mut text: Query<(&mut Text, &mut Visibility), With<Hud>>,
    mut lost: Query<&mut Visibility, (With<LostPanel>, Without<Hud>)>,
) {
    for mut visible in &mut lost {
        *visible = if display
            .snapshot
            .as_ref()
            .is_some_and(|s| s.forest.equipment.phase == "Lost")
            && !journey.stopped
        {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
    for (mut text, mut visible) in &mut text {
        **text = display.status.clone();
        *visible = if display.snapshot.is_none() || journey.stopped || display.alert {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
}

fn animate(
    mut commands: Commands,
    mut players: Query<(Entity, &mut AnimationPlayer, Option<&Clips>)>,
    parents: Query<&ChildOf>,
    actors: Query<(&Actor, &Motion)>,
    assets: Res<AssetServer>,
    gltfs: Res<Assets<Gltf>>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
    mut retained: Local<BTreeMap<String, Handle<Gltf>>>,
) {
    for (entity, mut player, clips) in &mut players {
        let mut root = entity;
        let mut owner = None;
        for _ in 0..32 {
            if let Ok(actor) = actors.get(root) {
                owner = Some(actor);
                break;
            }
            let Ok(parent) = parents.get(root) else {
                break;
            };
            root = parent.parent();
        }
        let Some((actor, motion)) = owner else {
            continue;
        };
        if let Some(clips) = clips {
            let target = if motion.moving { clips.run } else { clips.idle };
            if !player.is_playing_animation(target) {
                player.stop_all();
                player.play(target).repeat();
            }
            continue;
        }
        if actor.id != "wayfarer" {
            continue;
        }
        let model = "Worker_Female";
        let handle = retained.entry(model.to_string()).or_insert_with(|| {
            assets.load(format!("external/quaternius/rts-company/{model}.gltf"))
        });
        let Some(gltf) = gltfs.get(&*handle) else {
            continue;
        };
        let (Some(idle), Some(run)) = (
            gltf.named_animations.get("Idle"),
            gltf.named_animations.get("Run"),
        ) else {
            continue;
        };
        let mut graph = AnimationGraph::new();
        let idle = graph.add_clip(idle.clone(), 1.0, graph.root);
        let run = graph.add_clip(run.clone(), 1.0, graph.root);
        let graph = graphs.add(graph);
        player.play(idle).repeat();
        commands
            .entity(entity)
            .insert((AnimationGraphHandle(graph), Clips { idle, run }));
    }
}
