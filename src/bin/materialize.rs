use std::error::Error;
use std::fmt::Write;
use std::fs;
use std::path::Path;

use clause_runtime::{decode_wasm_process_request_v1, encode_wasm_process_request_v1};
use clause_workbench::ResidentSourceWorkbenchV1;
use greywrought_clause::EMBODIED_SOURCE;
use greywrought_clause::conquest::materialize_conquest_program_v1;
use greywrought_clause::ongoing_effect::materialize_ongoing_effect_program_v1;

const EMBODIED_SESSION_BUDGET_UNITS: u64 = 1_000_000;
const EMBODIED_SESSION_CONTEXT: &[u8] =
    b"greywrought/embodied-encounter-v1;player=player-1;tick=fixed-16ms;random=f64:0.95";

fn main() -> Result<(), Box<dyn Error>> {
    let program = materialize_conquest_program_v1()?;
    let output = Path::new("build/conquest");
    fs::create_dir_all(output)?;
    fs::write(
        output.join("conquest-v1.cwr1.hex"),
        lowercase_hex(&program.exact_cwr1),
    )?;
    let effect = materialize_ongoing_effect_program_v1()?;
    let effect_output = Path::new("build/ongoing-effect");
    fs::create_dir_all(effect_output)?;
    fs::write(
        effect_output.join("ongoing-effect-v1.cwr1.hex"),
        lowercase_hex(&effect.exact_cwr1),
    )?;
    let source = ResidentSourceWorkbenchV1::open(EMBODIED_SOURCE)?;
    let mut embodied = decode_wasm_process_request_v1(&source.generation().cwr1)?;
    embodied.authority.occurrence_evidence_bytes = EMBODIED_SESSION_CONTEXT.to_vec();
    embodied.authority.budget_units = EMBODIED_SESSION_BUDGET_UNITS;
    let embodied_output = Path::new("build/embodied");
    fs::create_dir_all(embodied_output)?;
    fs::write(
        embodied_output.join("embodied-encounter-v1.cwr1.hex"),
        lowercase_hex(&encode_wasm_process_request_v1(&embodied)?),
    )?;
    Ok(())
}

fn lowercase_hex(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len() * 2 + 1);
    for byte in bytes {
        write!(&mut encoded, "{byte:02x}").expect("writing to a String is infallible");
    }
    encoded.push('\n');
    encoded
}
