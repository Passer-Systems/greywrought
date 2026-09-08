//! Bevy UI for developer inspection; the world thread owns all queries.
use super::*;
use clause_package::FormationLocalId;
use clause_runtime::ExecutableReferentV1;

pub(super) enum InspectionQuery {
    State,
    Action(&'static [u8]),
    Handler(FormationLocalId),
    Survival(ExecutableReferentV1),
    ForestGathering,
}

#[derive(Component)]
pub(super) struct Panel;

pub(super) fn setup(mut commands: Commands) {
    commands.spawn((
        Text::new(""),
        TextFont {
            font_size: FontSize::Px(15.0),
            ..default()
        },
        TextColor(Color::srgb(0.92, 0.93, 0.87)),
        BackgroundColor(Color::srgba(0.025, 0.035, 0.035, 0.98)),
        Node {
            position_type: PositionType::Absolute,
            left: px(12),
            right: px(12),
            top: px(12),
            bottom: px(12),
            padding: UiRect::all(px(16)),
            overflow: Overflow::clip(),
            ..default()
        },
        GlobalZIndex(100),
        Visibility::Hidden,
        Panel,
    ));
}

pub(super) fn controls(
    keys: Res<ButtonInput<KeyCode>>,
    bridge: Res<Bridge>,
    mut display: ResMut<Displayed>,
) {
    if display.editing {
        return;
    }
    if keys.just_pressed(KeyCode::F7) {
        display.inspecting = !display.inspecting;
        if display.inspecting {
            if let Some(snapshot) = &display.snapshot {
                submit(
                    &bridge,
                    Request::Inspect(snapshot.generation, InspectionQuery::State),
                );
            }
        }
    }
    if !display.inspecting {
        return;
    }
    if keys.just_pressed(KeyCode::Escape) {
        display.inspecting = false;
        return;
    }
    if keys.just_pressed(KeyCode::F5) {
        submit(&bridge, Request::Save);
    }
    if keys.just_pressed(KeyCode::ArrowDown) {
        display.inspection_offset += 1;
    }
    if keys.just_pressed(KeyCode::PageDown) {
        display.inspection_offset += 24;
    }
    if keys.just_pressed(KeyCode::ArrowUp) {
        display.inspection_offset = display.inspection_offset.saturating_sub(1);
    }
    if keys.just_pressed(KeyCode::PageUp) {
        display.inspection_offset = display.inspection_offset.saturating_sub(24);
    }
    let count = display.inspection_handlers.len();
    if count > 0 {
        if keys.just_pressed(KeyCode::ArrowRight) {
            display.inspection_handler = (display.inspection_handler + 1) % count;
        }
        if keys.just_pressed(KeyCode::ArrowLeft) {
            display.inspection_handler = (display.inspection_handler + count - 1) % count;
        }
    }
    let Some(snapshot) = &display.snapshot else {
        return;
    };
    let generation = snapshot.generation;
    let query = if keys.just_pressed(KeyCode::Digit1) {
        Some(InspectionQuery::State)
    } else if keys.just_pressed(KeyCode::Digit2) {
        Some(InspectionQuery::Action(if snapshot.forest.is_some() {
            b"strike-threat"
        } else {
            b"party-attack"
        }))
    } else if keys.just_pressed(KeyCode::Digit4) {
        Some(InspectionQuery::Action(if snapshot.forest.is_some() {
            b"gather-resource"
        } else {
            b"party-heal"
        }))
    } else if keys.just_pressed(KeyCode::Enter) {
        display
            .inspection_handlers
            .get(display.inspection_handler)
            .map(|h| InspectionQuery::Handler(h.identity))
    } else if keys.just_pressed(KeyCode::Digit3) && snapshot.forest.is_some() {
        Some(InspectionQuery::ForestGathering)
    } else if keys.just_pressed(KeyCode::Digit3) {
        snapshot
            .selected_target
            .clone()
            .map(InspectionQuery::Survival)
    } else {
        None
    };
    if let Some(query) = query {
        display.inspection = None;
        submit(&bridge, Request::Inspect(generation, query));
    } else if keys.just_pressed(KeyCode::Digit3) {
        display.inspection = Some(native::Inspection {
            generation,
            title: "What if?".into(),
            lines: vec!["Choose a target in the world before asking about the last strike.".into()],
        });
    }
}

pub(super) fn present(
    mut display: ResMut<Displayed>,
    mut panel: Query<(&mut Text, &mut Visibility), With<Panel>>,
) {
    let Ok((mut text, mut visibility)) = panel.single_mut() else {
        return;
    };
    *visibility = if display.inspecting {
        Visibility::Visible
    } else {
        Visibility::Hidden
    };
    if !display.inspecting {
        return;
    }
    let count = display.inspection_handlers.len();
    let handler = display
        .inspection_handlers
        .get(display.inspection_handler)
        .map(|h| h.label.as_str())
        .unwrap_or("No offered handler");
    let shortcuts = if display
        .snapshot
        .as_ref()
        .is_some_and(|s| s.forest.is_some())
    {
        "1: state  |  2: last strike  |  3: gathering without warder  |  4: last gathering  |  Enter: chosen action"
    } else {
        "1: state  |  2: last strike  |  3: could target survive?  |  4: last heal  |  Enter: explain chosen action"
    };
    let heading = format!(
        "DEVELOPER INSPECTION\n{shortcuts}\nLeft / Right: choose action  |  Up / Down / Page Up / Down: scroll  |  F5: save  |  F7 / Esc: close\nAction {} / {count}: {handler}\n",
        display.inspection_handler + 1
    );
    if let Some(report) = &display.inspection {
        let max = report.lines.len().saturating_sub(1);
        let offset = display.inspection_offset.min(max);
        let body = report
            .lines
            .iter()
            .skip(offset)
            .take(30)
            .map(|line| line.chars().take(150).collect::<String>())
            .collect::<Vec<_>>()
            .join("\n");
        **text = format!(
            "{heading}\n{}  |  lines {}..{} / {}\n{body}",
            report.title,
            offset + 1,
            (offset + 30).min(report.lines.len()),
            report.lines.len()
        );
        display.inspection_offset = offset;
    } else {
        **text =
            format!("{heading}\nWaiting for inspection. Press 1 or 2 to refresh after an edit.");
    }
}
