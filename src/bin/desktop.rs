//! Native presentation and bounded input transport. World decisions stay in Clause.
use bevy::{input::mouse::MouseWheel, prelude::*, window::PrimaryWindow};
use clause_runtime::{ExecutableInputSourceV1, ExecutableValueV1, WasmSessionHandleV1};
use greywrought_clause::native::{self, NativeSession, Snapshot};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Mutex, mpsc},
    thread,
    time::{Duration, Instant},
};
#[path = "desktop/forest.rs"]
mod forest;
#[path = "desktop/inspection.rs"]
mod inspection;
#[path = "desktop/measurement.rs"]
mod measurement;
use measurement::{Smoke, smoke};
#[path = "desktop/workshop.rs"]
mod workshop;
#[derive(Resource, Clone, Copy)]
struct Mode {
    forest: bool,
    workshop: bool,
}

type PhysicalInput = (ExecutableInputSourceV1, Option<ExecutableValueV1>);
enum Request {
    Input(WasmSessionHandleV1, Vec<PhysicalInput>),
    Edit(WasmSessionHandleV1, usize, String, Instant),
    Inspect(WasmSessionHandleV1, inspection::InspectionQuery),
    Save,
    Quit,
}
#[derive(Default)]
struct Mailbox {
    snapshot: Option<Snapshot>,
    status: String,
    inspection: Option<native::Inspection>,
    handlers: Vec<native::InspectionHandler>,
    edits: Vec<String>,
    edit_labels: Vec<String>,
    edit_receipt: Option<(WasmSessionHandleV1, Instant)>,
}
#[derive(Resource)]
struct Bridge {
    sender: mpsc::SyncSender<Request>,
    mailbox: Arc<Mutex<Mailbox>>,
}
#[derive(Resource, Default)]
struct Displayed {
    snapshot: Option<Snapshot>,
    status: String,
    inspecting: bool,
    inspection: Option<native::Inspection>,
    inspection_handlers: Vec<native::InspectionHandler>,
    inspection_handler: usize,
    inspection_offset: usize,
    edit_catalog: Vec<String>,
    edit_labels: Vec<String>,
    edit_index: usize,
    editing: bool,
    editor_handled_frame: bool,
    control_left: bool,
    control_right: bool,
    expression: String,
    edit_receipt: Option<(WasmSessionHandleV1, Instant)>,
}
#[derive(Resource)]
struct CameraRig {
    center: Vec3,
    distance: f32,
}
#[derive(Component)]
struct MainCamera;
#[derive(Component)]
struct Hud;
#[derive(Component)]
struct Actor {
    id: String,
}
#[derive(Component)]
struct Figure;
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
#[derive(Resource, Default)]
struct Presented {
    entities: BTreeMap<String, Entity>,
}

fn main() -> native::Result<()> {
    let mut root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".local/share")
        });
    let mut save = data.join("greywrought/world.save");
    let mut smoke_seconds = None;
    let mut workshop = false;
    let mut forest = true;
    let mut explicit_save = false;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--root" => root = args.next().ok_or("--root needs a path")?.into(),
            "--save" => {
                save = args.next().ok_or("--save needs a path")?.into();
                explicit_save = true;
            }
            "--workshop" => {
                workshop = true;
                forest = false;
            }
            "--company" => {
                workshop = false;
                forest = false;
            }
            "--forest" => {
                workshop = false;
                forest = true;
            }
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
    if forest && !explicit_save {
        save = data.join("greywrought/spatial.save");
    }
    if workshop && !explicit_save {
        save = data.join("greywrought/workshop.save");
    }
    let (sender, receiver) = mpsc::sync_channel(32);
    let mailbox = Arc::new(Mutex::new(Mailbox {
        status: if forest {
            "Opening Hearthstead..."
        } else if workshop {
            "Opening the workshop..."
        } else {
            "Gathering the company..."
        }
        .into(),
        ..default()
    }));
    let worker_mailbox = mailbox.clone();
    let worker_root = root.clone();
    let worker = thread::Builder::new()
        .name("greywrought-world".into())
        .spawn(move || {
            let result = run_world(
                worker_root,
                save,
                receiver,
                worker_mailbox.clone(),
                workshop,
                forest,
                smoke_seconds.is_some(),
            );
            if let Err(error) = &result {
                eprintln!("native session failed: {error}");
                worker_mailbox.lock().unwrap().status =
                    "The journey stopped. See the game log before continuing.".into();
            }
            result.map_err(|error| error.to_string())
        })?;
    App::new()
        .insert_resource(Mode { workshop, forest })
        .insert_resource(Bridge {
            sender: sender.clone(),
            mailbox,
        })
        .insert_resource(Displayed::default())
        .insert_resource(Presented::default())
        .insert_resource(CameraRig {
            center: Vec3::new(0.0, 0.0, 5.0),
            distance: 27.0,
        })
        .insert_resource(Smoke::new(smoke_seconds))
        .insert_resource(ClearColor(Color::srgb(0.045, 0.064, 0.055)))
        .insert_resource(GlobalAmbientLight {
            brightness: 500.0,
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
                    ..default()
                }),
        )
        .add_systems(Startup, (setup, inspection::setup))
        .add_systems(
            Update,
            (
                receive,
                camera,
                inspection::controls,
                controls,
                workshop::controls,
                forest::controls,
                workshop::layout,
                present,
                workshop::present,
                workshop::scene,
                forest::present,
                forest::navigate,
                workshop::enemy_label,
                workshop::equipment,
                workshop::combat_feedback,
                animate,
                hud,
                inspection::present,
                smoke,
            )
                .chain(),
        )
        .run();
    let _ = sender.send(Request::Quit);
    worker
        .join()
        .map_err(|_| "world thread panicked")?
        .map_err(|error| error.into())
}

fn run_world(
    root: PathBuf,
    save: PathBuf,
    receiver: mpsc::Receiver<Request>,
    mailbox: Arc<Mutex<Mailbox>>,
    workshop: bool,
    forest: bool,
    measure: bool,
) -> native::Result<()> {
    std::fs::create_dir_all(save.parent().ok_or("save needs parent directory")?)?;
    let lease = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(save.with_extension("lock"))?;
    lease
        .try_lock()
        .map_err(|_| "this saved company is already open in another window")?;
    let source = std::fs::read(root.join(if forest {
        "src/world/forest-expedition.clause"
    } else if workshop {
        "src/world/workshop-expedition.clause"
    } else {
        "src/world/embodied-encounter.clause"
    }))?;
    let mut session = NativeSession::load(&save, &source)?;
    let opened = session.snapshot(0, String::new())?;
    if opened.workshop.is_some() != workshop || opened.forest.is_some() != forest {
        return Err(
            "save belongs to a different game mode; choose its mode or a different --save path"
                .into(),
        );
    }
    let mut status = if forest {
        "Hearthstead ready"
    } else if workshop {
        "Workshop ready"
    } else {
        "Company ready"
    }
    .to_string();
    refresh_edit_catalog(&session, &mailbox)?;
    if measure {
        for (index, expression) in session.edit_catalog()?.expressions.iter().enumerate() {
            eprintln!("native measurement catalog {index}: {expression}");
        }
    }
    let mut catalog_generation = session.workbench.generation().handle;
    let publish = |session: &NativeSession, elapsed, status: &str| -> native::Result<()> {
        let snapshot = session.snapshot(elapsed, status.to_string())?;
        let mut out = mailbox.lock().unwrap();
        out.snapshot = Some(snapshot);
        out.status = status.to_string();
        Ok(())
    };
    publish(&session, 0, &status)?;
    let mut deadline = Instant::now();
    let mut pending_inputs = false;
    let mut timings = measurement::WorldTimings::new(measure);
    loop {
        let request = if deadline > Instant::now() {
            match receiver.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                Ok(request) => Some(request),
                Err(mpsc::RecvTimeoutError::Timeout) => None,
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    session.save(&save)?;
                    return Ok(());
                }
            }
        } else {
            receiver.try_recv().ok()
        };
        if let Some(request) = request {
            if pending_inputs && !matches!(request, Request::Input(..)) {
                thread::sleep(deadline.saturating_duration_since(Instant::now()));
                session.tick()?;
                pending_inputs = false;
                deadline += Duration::from_millis(16);
            }
            match request {
                Request::Quit => {
                    timings.report();
                    session.save(&save)?;
                    eprintln!("native save complete: {}", save.display());
                    return Ok(());
                }
                Request::Inspect(captured, query) => {
                    let result = match query {
                        inspection::InspectionQuery::State => session.inspect_state(captured),
                        inspection::InspectionQuery::Action(name) => {
                            session.inspect_action(captured, name)
                        }
                        inspection::InspectionQuery::Handler(handler) => {
                            session.inspect_handler(captured, handler)
                        }
                        inspection::InspectionQuery::ForestGathering => {
                            session.inspect_forest_gathering(captured, 2)
                        }
                        inspection::InspectionQuery::Survival(target) => {
                            session.inspect_survival(captured, target)
                        }
                    };
                    let report = result.unwrap_or_else(|error| native::Inspection {
                        generation: captured,
                        title: "Inspection unavailable".into(),
                        lines: vec![error.to_string()],
                    });
                    eprintln!(
                        "native inspection: {}; {} lines; {:?}",
                        report.title,
                        report.lines.len(),
                        report.generation
                    );
                    mailbox.lock().unwrap().inspection = Some(report);
                }
                Request::Save => {
                    session.save(&save)?;
                    status = "Journey saved".into();
                }
                Request::Input(captured, inputs) => {
                    if captured == session.workbench.generation().handle {
                        for (source, value) in inputs {
                            session.input(captured, source, value)?;
                            pending_inputs = true;
                        }
                    } else {
                        status = "The company changed; give that order again.".into();
                    }
                }
                Request::Edit(captured, index, expression, started) => {
                    eprintln!(
                        "native edit request: generation {captured:?}; catalog index {index}; replacement {expression:?}"
                    );
                    let checked_started = Instant::now();
                    match session.edit(captured, index, expression.as_bytes()) {
                        Ok(()) => {
                            if measure {
                                eprintln!(
                                    "native edit phases: queue_ms={:.3}; checked_and_reclaim_ms={:.3}",
                                    checked_started.duration_since(started).as_secs_f64() * 1000.,
                                    checked_started.elapsed().as_secs_f64() * 1000.
                                );
                            }
                            status = "Tuning applied".into();
                            mailbox.lock().unwrap().edit_receipt =
                                Some((session.workbench.generation().handle, started));
                            eprintln!(
                                "native checked edit: {} ms; generation {:?}",
                                started.elapsed().as_millis(),
                                session.workbench.generation().handle
                            );
                        }
                        Err(error) => {
                            eprintln!("native edit rejected: {error}");
                            status = "That tuning could not be applied.".into();
                        }
                    }
                }
            }
            if session.workbench.generation().handle != catalog_generation {
                let catalog_started = Instant::now();
                refresh_edit_catalog(&session, &mailbox)?;
                if measure {
                    eprintln!(
                        "native edit catalog_ms={:.3}",
                        catalog_started.elapsed().as_secs_f64() * 1000.
                    );
                }
                catalog_generation = session.workbench.generation().handle;
            }
        }
        if Instant::now() >= deadline {
            let started = Instant::now();
            session.tick()?;
            pending_inputs = false;
            let tick_time = started.elapsed();
            let publish_started = Instant::now();
            publish(&session, tick_time.as_millis(), &status)?;
            timings.tick(session.ticks, tick_time, publish_started.elapsed());
            // Every required fixed tick remains pending when evaluation is slow.
            deadline += Duration::from_millis(16);
        }
    }
}

fn refresh_edit_catalog(session: &NativeSession, mailbox: &Mutex<Mailbox>) -> native::Result<()> {
    let catalog = session.edit_catalog()?;
    let mut mailbox = mailbox.lock().unwrap();
    mailbox.handlers = catalog.handlers;
    mailbox.edits = catalog.expressions;
    mailbox.edit_labels = catalog.labels;
    Ok(())
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    assets: Res<AssetServer>,
    mode: Res<Mode>,
) {
    if mode.forest {
        forest::setup(&mut commands, &mut meshes, &mut materials, &assets);
        return;
    }
    if mode.workshop {
        workshop::setup(&mut commands);
        return;
    }
    commands.spawn((
        Camera3d::default(),
        MainCamera,
        Transform::from_xyz(0.0, 24.0, 24.0).looking_at(Vec3::new(0.0, 0.0, 5.0), Vec3::Y),
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: 14000.0,
            shadow_maps_enabled: true,
            ..default()
        },
        Transform::from_xyz(-12.0, 24.0, 8.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(90.0, 90.0))),
        MeshMaterial3d(materials.add(Color::srgb(0.13, 0.19, 0.12))),
    ));
    for (x, z, size) in [
        (-13.0, -4.0, 1.5),
        (14.0, 8.0, 1.8),
        (-15.0, 18.0, 1.7),
        (14.0, 25.0, 2.0),
        (-11.0, 29.0, 1.4),
    ] {
        commands.spawn((
            WorldAssetRoot(
                assets.load(
                    GltfAssetLabel::Scene(0)
                        .from_asset("external/quaternius/stylized-nature-field/glTF/Pine_2.gltf"),
                ),
            ),
            Transform::from_xyz(x, 0.0, z).with_scale(Vec3::splat(size)),
        ));
    }
    commands.spawn((
        Text::new("Gathering the company..."),
        TextFont {
            font_size: FontSize::Px(14.0),
            ..default()
        },
        TextColor(Color::srgb(0.91, 0.89, 0.75)),
        Node {
            position_type: PositionType::Absolute,
            left: px(16),
            right: px(16),
            top: px(18),
            ..default()
        },
        Hud,
    ));
}

fn receive(bridge: Res<Bridge>, mut display: ResMut<Displayed>) {
    let mut mailbox = bridge.mailbox.lock().unwrap();
    if let Some(snapshot) = mailbox.snapshot.take() {
        display.snapshot = Some(snapshot);
    }
    if mailbox
        .edit_receipt
        .as_ref()
        .is_some_and(|(generation, _)| {
            display
                .snapshot
                .as_ref()
                .is_some_and(|snapshot| snapshot.generation == *generation)
        })
    {
        display.edit_receipt = mailbox.edit_receipt.take();
    }
    if let Some(report) = mailbox.inspection.take() {
        if display
            .snapshot
            .as_ref()
            .is_some_and(|s| s.generation == report.generation)
        {
            display.inspection = Some(report);
            display.inspection_offset = 0;
        }
    }
    if display.inspection.as_ref().is_some_and(|report| {
        display
            .snapshot
            .as_ref()
            .is_some_and(|s| s.generation != report.generation)
    }) {
        display.inspection = None;
    }
    display.inspection_handlers.clone_from(&mailbox.handlers);
    display.status.clone_from(&mailbox.status);
    display.edit_catalog.clone_from(&mailbox.edits);
    display.edit_labels.clone_from(&mailbox.edit_labels);
}

fn camera(
    keys: Res<ButtonInput<KeyCode>>,
    mut wheel: MessageReader<MouseWheel>,
    time: Res<Time>,
    mut rig: ResMut<CameraRig>,
    mut camera: Query<&mut Transform, With<MainCamera>>,
    display: Res<Displayed>,
) {
    if display.editing || display.inspecting {
        wheel.clear();
        return;
    }
    let step = time.delta_secs() * 14.0;
    if keys.pressed(KeyCode::ArrowLeft) || keys.pressed(KeyCode::KeyA) {
        rig.center.x -= step;
    }
    if keys.pressed(KeyCode::ArrowRight) || keys.pressed(KeyCode::KeyD) {
        rig.center.x += step;
    }
    if keys.pressed(KeyCode::ArrowUp) || keys.pressed(KeyCode::KeyW) {
        rig.center.z -= step;
    }
    if keys.pressed(KeyCode::ArrowDown) || keys.pressed(KeyCode::KeyS) {
        rig.center.z += step;
    }
    for event in wheel.read() {
        rig.distance = (rig.distance - event.y * 1.5).clamp(9.0, 60.0);
    }
    for mut transform in &mut camera {
        *transform = Transform::from_translation(
            rig.center + Vec3::new(0.0, rig.distance * 0.8, rig.distance * 0.65),
        )
        .looking_at(rig.center, Vec3::Y);
    }
}

fn submit(bridge: &Bridge, request: Request) {
    if let Err(error) = bridge.sender.try_send(request) {
        bridge.mailbox.lock().unwrap().status = match error {
            mpsc::TrySendError::Full(_) => "Orders are still pending. Try again in a moment.",
            mpsc::TrySendError::Disconnected(_) => "The journey has stopped. See the game log.",
        }
        .into();
    }
}

fn controls(
    bridge: Res<Bridge>,
    mut display: ResMut<Displayed>,
    keys: Res<ButtonInput<KeyCode>>,
    buttons: Res<ButtonInput<MouseButton>>,
    windows: Query<&Window, With<PrimaryWindow>>,
    camera: Query<(&Camera, &GlobalTransform), With<MainCamera>>,
    mut typing: MessageReader<bevy::input::keyboard::KeyboardInput>,
) {
    if display.inspecting {
        typing.clear();
        display.editor_handled_frame = true;
        return;
    }
    let mut editor_handled = display.editing;
    for event in typing.read() {
        // Modifier transitions and text can share one frame; preserve their order.
        match event.key_code {
            KeyCode::ControlLeft => display.control_left = event.state.is_pressed(),
            KeyCode::ControlRight => display.control_right = event.state.is_pressed(),
            _ => {}
        }
        if !event.state.is_pressed() {
            continue;
        }
        if event.key_code == KeyCode::F6 && !event.repeat {
            editor_handled = true;
            display.editing = !display.editing;
            display.expression = display
                .edit_catalog
                .get(display.edit_index)
                .cloned()
                .unwrap_or_default();
            continue;
        }
        if !display.editing {
            continue;
        }
        editor_handled = true;
        let control = display.control_left || display.control_right;
        if control && event.key_code == KeyCode::KeyA {
            display.expression.clear();
            continue;
        }
        if event.key_code == KeyCode::Escape {
            display.editing = false;
            continue;
        }
        if event.key_code == KeyCode::PageDown && !display.edit_catalog.is_empty() {
            display.edit_index = (display.edit_index + 1) % display.edit_catalog.len();
            display.expression = display.edit_catalog[display.edit_index].clone();
            continue;
        }
        if event.key_code == KeyCode::PageUp && !display.edit_catalog.is_empty() {
            display.edit_index = display
                .edit_index
                .checked_sub(1)
                .unwrap_or(display.edit_catalog.len() - 1);
            display.expression = display.edit_catalog[display.edit_index].clone();
            continue;
        }
        if control {
            continue;
        }
        if event.key_code == KeyCode::Backspace {
            display.expression.pop();
        } else if let Some(text) = &event.text {
            for c in text.chars().filter(|c| !c.is_control()) {
                if display.expression.len() < 2048 {
                    display.expression.push(c);
                }
            }
        }
        if event.key_code == KeyCode::Enter && !event.repeat {
            if let Some(snapshot) = &display.snapshot {
                submit(
                    &bridge,
                    Request::Edit(
                        snapshot.generation,
                        display.edit_index,
                        display.expression.clone(),
                        Instant::now(),
                    ),
                );
            }
            display.editing = false;
        }
    }
    display.editor_handled_frame = editor_handled;
    if editor_handled {
        return;
    }
    if keys.just_pressed(KeyCode::F5) {
        submit(&bridge, Request::Save);
    }
    let Some(snapshot) = &display.snapshot else {
        return;
    };
    let generation = snapshot.generation;
    if snapshot.workshop.is_some() || snapshot.forest.is_some() {
        return;
    }
    let mut inputs = Vec::new();
    for (physical, binding) in [
        (KeyCode::Enter, "BeginEncounter"),
        (KeyCode::Space, "Attack"),
        (KeyCode::KeyH, "Heal"),
        (KeyCode::KeyJ, "Ward"),
        (KeyCode::KeyI, "Ignite"),
        (KeyCode::KeyX, "Stop"),
        (KeyCode::Tab, "SelectAll"),
    ] {
        if keys.just_pressed(physical) {
            inputs.push(native::key(binding));
        }
    }
    for (index, physical) in [KeyCode::Digit1, KeyCode::Digit2, KeyCode::Digit3]
        .into_iter()
        .enumerate()
    {
        if keys.just_pressed(physical) {
            if let Some((_, _, reference)) = snapshot.scenarios.get(index) {
                inputs.push(native::reference("Scenario", reference.clone()));
            }
        }
    }
    if buttons.just_pressed(MouseButton::Left) || buttons.just_pressed(MouseButton::Right) {
        if let (Ok(window), Ok((camera, transform))) = (windows.single(), camera.single()) {
            if let Some(cursor) = window.cursor_position() {
                if let Ok(ray) = camera.viewport_to_world(transform, cursor) {
                    if let Some(distance) =
                        ray.intersect_plane(Vec3::ZERO, InfinitePlane3d::new(Vec3::Y))
                    {
                        let point = ray.get_point(distance);
                        let picked = snapshot
                            .actors
                            .iter()
                            .filter(|actor| actor.alive)
                            .filter_map(|actor| {
                                let position = Vec3::from_array(actor.position) + Vec3::Y;
                                let screen = camera.world_to_viewport(transform, position).ok()?;
                                let distance = screen.distance(cursor);
                                (distance < 42.0).then_some((distance, actor))
                            })
                            .min_by(|a, b| a.0.total_cmp(&b.0))
                            .map(|(_, actor)| actor);
                        if buttons.just_pressed(MouseButton::Left) {
                            if let Some(actor) = picked {
                                let channel = if keys.pressed(KeyCode::ShiftLeft)
                                    || keys.pressed(KeyCode::ShiftRight)
                                {
                                    "TogglePick"
                                } else {
                                    "Pick"
                                };
                                if let Some(reference) = actor.references.get(channel) {
                                    if channel == "Pick" {
                                        inputs.push(native::key("ClearSelection"));
                                    }
                                    inputs.push(native::reference(channel, reference.clone()));
                                } else if let Some(reference) = actor.references.get("Target") {
                                    inputs.push(native::reference("Target", reference.clone()));
                                }
                            } else {
                                inputs.push(native::key("ClearSelection"));
                            }
                        } else if let Some(reference) =
                            picked.and_then(|actor| actor.references.get("Target"))
                        {
                            inputs.push(native::reference("Target", reference.clone()));
                        } else {
                            inputs.extend([
                                native::scalar("PointerWorldX", point.x as f64),
                                native::scalar("PointerWorldZ", point.z as f64),
                                native::key("IssueMove"),
                            ]);
                        }
                    }
                }
            }
        }
    }
    if !inputs.is_empty() {
        submit(&bridge, Request::Input(generation, inputs));
    }
}

fn present(
    mut commands: Commands,
    mut display: ResMut<Displayed>,
    mut presented: ResMut<Presented>,
    assets: Res<AssetServer>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut actors: Query<(&Actor, &mut Transform, &mut Visibility, &mut Motion)>,
    mut gizmos: Gizmos,
    smoke: Res<Smoke>,
) {
    let Some(snapshot) = &display.snapshot else {
        return;
    };
    if snapshot.workshop.is_some() || snapshot.forest.is_some() {
        return;
    }
    for (id, position, radius) in &snapshot.obstacles {
        let key = format!("obstacle/{id}");
        if !presented.entities.contains_key(&key) {
            let entity = commands
                .spawn((
                    WorldAssetRoot(assets.load(GltfAssetLabel::Scene(0).from_asset(
                        "external/quaternius/stylized-nature-field/glTF/Rock_Medium_1.gltf",
                    ))),
                    Transform::from_translation(Vec3::from_array(*position))
                        .with_scale(Vec3::splat(*radius)),
                ))
                .id();
            presented.entities.insert(key, entity);
        }
    }
    for actor in &snapshot.actors {
        if !presented.entities.contains_key(&actor.id) {
            let entity = commands
                .spawn((
                    Actor {
                        id: actor.id.clone(),
                    },
                    Motion {
                        moving: actor.moving,
                        alive: actor.alive,
                    },
                    Transform::from_translation(Vec3::from_array(actor.position)),
                    Visibility::default(),
                ))
                .id();
            let model = match actor.kind.as_str() {
                "Warrior" => Some("Knight_Golden_Female"),
                "Artificer" => Some("Worker_Female"),
                "Rogue" => Some("Ninja_Female"),
                "Priest" => Some("Wizard"),
                "Ranger" => Some("Elf"),
                _ => None,
            };
            commands.entity(entity).with_children(|parent| {
                if let Some(model) = model {
                    parent.spawn((
                        WorldAssetRoot(assets.load(
                            GltfAssetLabel::Scene(0).from_asset(format!(
                                "external/quaternius/rts-company/{model}.gltf"
                            )),
                        )),
                        Transform::from_scale(Vec3::splat(1.0)),
                        Figure,
                    ));
                } else {
                    let color = if actor.kind == "Moonwell" {
                        Color::srgb(0.25, 0.8, 0.85)
                    } else {
                        Color::srgb(0.9, 0.25, 0.08)
                    };
                    parent.spawn((
                        Mesh3d(meshes.add(Capsule3d::new(0.5, 1.3))),
                        MeshMaterial3d(materials.add(StandardMaterial {
                            base_color: color,
                            emissive: color.to_linear() * 0.5,
                            ..default()
                        })),
                        Transform::from_xyz(0.0, 1.0, 0.0),
                    ));
                }
            });
            presented.entities.insert(actor.id.clone(), entity);
        }
        let position = Vec3::from_array(actor.position);
        if actor.selected && actor.alive {
            gizmos.circle(
                Isometry3d::new(
                    position + Vec3::Y * 0.08,
                    Quat::from_rotation_x(std::f32::consts::FRAC_PI_2),
                ),
                0.8,
                Color::srgb(0.4, 1.0, 0.25),
            );
        }
        if actor
            .references
            .get("Target")
            .is_some_and(|r| Some(r) == snapshot.selected_target.as_ref())
        {
            gizmos.circle(
                Isometry3d::new(
                    position + Vec3::Y * 0.1,
                    Quat::from_rotation_x(std::f32::consts::FRAC_PI_2),
                ),
                1.0,
                Color::srgb(1.0, 0.6, 0.1),
            );
        }
        if actor.alive && actor.maximum_vitality > 0.0 {
            gizmos.line(
                position + Vec3::new(-0.6, 2.8, 0.0),
                position
                    + Vec3::new(
                        -0.6 + 1.2 * (actor.vitality / actor.maximum_vitality) as f32,
                        2.8,
                        0.0,
                    ),
                Color::srgb(0.3, 0.95, 0.4),
            );
        }
    }
    for (actor, mut transform, mut visible, mut motion) in &mut actors {
        if let Some(view) = snapshot.actors.iter().find(|view| view.id == actor.id) {
            let position = Vec3::from_array(view.position);
            let displacement = position - transform.translation;
            if displacement.length_squared() > 0.00001 {
                transform.rotation = Quat::from_rotation_y(displacement.x.atan2(displacement.z));
            }
            transform.translation = position;
            *visible = if view.alive {
                Visibility::Inherited
            } else {
                Visibility::Hidden
            };
            motion.moving = view.moving;
            motion.alive = view.alive;
        } else {
            *visible = Visibility::Hidden;
        }
    }
    if let Some((generation, started)) = display.edit_receipt.take() {
        measurement::edited_frame(&mut commands, &smoke, generation, started);
        eprintln!(
            "native edited projection submitted to scene: {} ms; generation {:?}",
            started.elapsed().as_millis(),
            generation
        );
    }
}

fn animate(
    mut commands: Commands,
    mut players: Query<(Entity, &mut AnimationPlayer, Option<&Clips>)>,
    parents: Query<&ChildOf>,
    actors: Query<(&Actor, &Motion)>,
    display: Res<Displayed>,
    assets: Res<AssetServer>,
    gltfs: Res<Assets<Gltf>>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
    mut retained: Local<BTreeMap<String, Handle<Gltf>>>,
) {
    let Some(snapshot) = &display.snapshot else {
        return;
    };
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
        let model = if (snapshot.workshop.is_some() || snapshot.forest.is_some())
            && actor.id == "wayfarer"
        {
            "Worker_Female"
        } else {
            let Some(view) = snapshot.actors.iter().find(|view| view.id == actor.id) else {
                continue;
            };
            match view.kind.as_str() {
                "Warrior" => "Knight_Golden_Female",
                "Artificer" => "Worker_Female",
                "Rogue" => "Ninja_Female",
                "Priest" => "Wizard",
                "Ranger" => "Elf",
                _ => continue,
            }
        };
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

fn hud(display: Res<Displayed>, mut text: Query<&mut Text, With<Hud>>) {
    let Ok(mut text) = text.single_mut() else {
        return;
    };
    if display.editing {
        **text = format!(
            "DEVELOPER TUNING  |  expression {} / {}\n{}\nPage Up / Down: choose  |  Ctrl+A: clear  |  Backspace: edit  |  Enter: apply  |  Esc: close\n{}",
            display.edit_index + 1,
            display.edit_catalog.len(),
            display
                .edit_labels
                .get(display.edit_index)
                .map(String::as_str)
                .unwrap_or(""),
            display.expression
        );
        return;
    }
    let Some(snapshot) = &display.snapshot else {
        **text = display.status.clone();
        return;
    };
    if snapshot.workshop.is_some() || snapshot.forest.is_some() {
        **text = String::new();
        return;
    }
    let company = snapshot
        .actors
        .iter()
        .filter(|a| a.selected)
        .map(|a| format!("{}  {:.0}/{:.0}", a.name, a.vitality, a.maximum_vitality))
        .collect::<Vec<_>>()
        .join("   |   ");
    let scenarios = snapshot
        .scenarios
        .iter()
        .enumerate()
        .map(|(i, (_, name, _))| format!("{} {}", i + 1, name))
        .collect::<Vec<_>>()
        .join("   |   ");
    **text = format!(
        "GREYWROUGHT\n{}\n{}\n\n{}\n{}\n\nClick: select  |  Shift-click: add  |  Tab: company  |  Right-click: move / target\nEnter: begin  |  Space: attack  |  H: heal  |  J: ward  |  I: ignite  |  X: stop\nWASD / arrows: camera  |  Wheel: zoom  |  F5: save  |  F6: tuning  |  F7: inspect\n{}",
        scenarios,
        snapshot.message,
        company,
        display.status,
        if snapshot.tick_millis > 100 {
            "The company is still acting; orders may take a moment."
        } else {
            ""
        }
    );
}
