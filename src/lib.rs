#![forbid(unsafe_code)]

pub mod conquest;

use clause_workbench::{
    ResidentSourceAdmissionV1, ResidentSourceWorkbenchErrorV1, ResidentSourceWorkbenchV1,
};

pub const WORLD_SOURCE: &[u8] = include_bytes!("world/ember-reconnection.clause");
pub const REDUCED_GRANT_SOURCE: &[u8] =
    include_bytes!("../acceptance/disconnect/reduced-grant.clause");

pub fn run_one_admission(
    source: &[u8],
) -> Result<ResidentSourceAdmissionV1, ResidentSourceWorkbenchErrorV1> {
    let mut workbench = ResidentSourceWorkbenchV1::open(source)?;
    workbench.run_to_candidate()?;
    workbench.admit()
}
