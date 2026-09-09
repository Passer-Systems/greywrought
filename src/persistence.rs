//! Standalone saved journeys. The caller holds the save-directory lock.
use crate::{Result, game::Game};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

pub const SAVE_FILE_NAME: &str = "spatial-rust.json";
const SAVE_VERSION: u32 = 1;
static NEXT_PENDING: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SavedGame {
    version: u32,
    game: Game,
}

/// Open a saved journey, or start a new one when the path does not exist.
/// Unreadable, malformed, and unsupported saves return an error without modification.
pub fn load(path: &Path) -> Result<Game> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Game::new()),
        Err(error) => return Err(error.into()),
    };
    let saved: SavedGame = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Could not read saved journey at {}: {error}", path.display()))?;
    if saved.version != SAVE_VERSION {
        return Err(format!(
            "This saved journey needs a different game version (save version {}).",
            saved.version
        ).into());
    }
    Ok(saved.game)
}

struct PendingSave(PathBuf);

impl Drop for PendingSave {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

/// Atomically replace a saved journey after writing and syncing its complete contents.
/// Errors leave the prior save intact unless the final directory sync fails after rename.
pub fn save(game: &Game, path: &Path) -> Result<()> {
    let bytes = encode(game)?;
    let parent = parent_directory(path);
    fs::create_dir_all(parent)?;
    let name = path.file_name().ok_or("Saved journey path has no file name")?;
    let (pending, mut file) = loop {
        let mut pending_name = name.to_os_string();
        pending_name.push(format!(
            ".pending-{}-{}", std::process::id(), NEXT_PENDING.fetch_add(1, Ordering::Relaxed)
        ));
        let pending_path = parent.join(pending_name);
        match OpenOptions::new().write(true).create_new(true).open(&pending_path) {
            Ok(file) => break (PendingSave(pending_path), file),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    };
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    fs::rename(&pending.0, path)?;
    File::open(parent)?.sync_all()?;
    Ok(())
}

fn encode(game: &Game) -> Result<Vec<u8>> {
    #[derive(Serialize)]
    struct SavedGameRef<'a> {
        version: u32,
        game: &'a Game,
    }
    let bytes = serde_json::to_vec_pretty(&SavedGameRef { version: SAVE_VERSION, game })?;
    // JSON cannot represent non-finite numbers; reject them before replacing any save.
    let _: SavedGame = serde_json::from_slice(&bytes)?;
    Ok(bytes)
}

fn parent_directory(path: &Path) -> &Path {
    path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."))
}

/// Preserve the ended character, then save a fresh journey after an explicit player request.
/// The caller must hold the same lock used for normal saving. A failed replacement may
/// leave a complete archive; the previous character remains available there.
pub fn start_new_journey(previous: &Game, path: &Path) -> Result<(Game, PathBuf)> {
    if previous.phase != "Lost" {
        return Err("This journey has not ended.".into());
    }
    let bytes = encode(previous)?;
    let parent = parent_directory(path);
    fs::create_dir_all(parent)?;
    let name = path.file_name().ok_or("Saved journey path has no file name")?;
    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
    let (archive, mut file) = loop {
        let mut archive_name = name.to_os_string();
        archive_name.push(format!(
            ".ended-{timestamp}-{}.json", NEXT_PENDING.fetch_add(1, Ordering::Relaxed)
        ));
        let archive_path = parent.join(archive_name);
        match OpenOptions::new().write(true).create_new(true).open(&archive_path) {
            Ok(file) => break (archive_path, file),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    };
    if let Err(error) = file.write_all(&bytes).and_then(|()| file.sync_all()) {
        drop(file);
        let _ = fs::remove_file(&archive);
        return Err(error.into());
    }
    drop(file);
    File::open(parent)?.sync_all()?;
    let fresh = Game::new();
    save(&fresh, path)?;
    Ok((fresh, archive))
}
