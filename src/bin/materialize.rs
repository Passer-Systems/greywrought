use std::error::Error;
use std::fmt::Write;
use std::fs;
use std::path::Path;

use greywrought_clause::conquest::materialize_conquest_program_v1;

fn main() -> Result<(), Box<dyn Error>> {
    let program = materialize_conquest_program_v1()?;
    let output = Path::new("build/conquest");
    fs::create_dir_all(output)?;
    fs::write(
        output.join("conquest-v1.cwr1.hex"),
        lowercase_hex(&program.exact_cwr1),
    )?;
    fs::write(
        output.join("world-shift.coi1.hex"),
        lowercase_hex(&program.world_shift),
    )?;
    fs::write(
        output.join("reconcile.coi1.hex"),
        lowercase_hex(&program.reconcile),
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
