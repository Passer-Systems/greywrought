#![forbid(unsafe_code)]

pub mod conquest;
pub mod ongoing_effect;

use clause_workbench::{
    ResidentSourceAdmissionV1, ResidentSourceWorkbenchErrorV1, ResidentSourceWorkbenchV1,
};

pub const WORLD_SOURCE: &[u8] = include_bytes!("world/ember-reconnection.clause");
pub const EMBODIED_SOURCE: &[u8] = include_bytes!("world/embodied-encounter.clause");
pub const RESISTED_STRIKE_SOURCE: &[u8] =
    include_bytes!("../acceptance/disconnect/resisted-strike.clause");
pub const MOONWELL_PULSE_SOURCE: &[u8] = include_bytes!("world/moonwell-pulse.clause");

pub fn run_one_admission(
    source: &[u8],
) -> Result<ResidentSourceAdmissionV1, ResidentSourceWorkbenchErrorV1> {
    let mut workbench = ResidentSourceWorkbenchV1::open(source)?;
    workbench.run_to_candidate()?;
    workbench.admit()
}
