use std::error::Error;
use std::io::{BufRead, Write};
use std::path::Path;
use std::process::ExitCode;
use std::time::Instant;

use clause_runtime::{decode_wasm_process_request_v1, encode_wasm_process_request_v1};
use clause_workbench::ResidentSourceWorkbenchV1;

const EMBODIED_SESSION_BUDGET_UNITS: u64 = 1_000_000;
const EMBODIED_SESSION_CONTEXT: &[u8] =
    b"greywrought/embodied-encounter-v1;player=player-1;tick=fixed-16ms;random=f64:0.95";

fn main() -> ExitCode {
    let mut arguments = std::env::args_os().skip(1);
    let Some(source_path) = arguments.next() else {
        eprintln!("usage: resident_generation SOURCE.clause");
        return ExitCode::FAILURE;
    };
    if arguments.next().is_some() {
        eprintln!("usage: resident_generation SOURCE.clause");
        return ExitCode::FAILURE;
    }
    serve(Path::new(&source_path))
}

fn serve(source_path: &Path) -> ExitCode {
    let source = match std::fs::read(source_path) {
        Ok(source) => source,
        Err(error) => {
            eprintln!("resident source read failed: {error}");
            return ExitCode::FAILURE;
        }
    };
    let started = Instant::now();
    let mut workbench = match ResidentSourceWorkbenchV1::open(&source) {
        Ok(workbench) => workbench,
        Err(error) => {
            eprintln!("resident generation failed to open: {error}");
            return ExitCode::FAILURE;
        }
    };
    let mut output = std::io::stdout().lock();
    if write_generation(&mut output, &workbench, started).is_err() {
        return ExitCode::FAILURE;
    }

    for line in std::io::stdin().lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                eprintln!("resident command read failed: {error}");
                return ExitCode::FAILURE;
            }
        };
        match line.trim() {
            "reload" => {
                let started = Instant::now();
                let result = std::fs::read(source_path)
                    .map_err(|error| format!("source read failed: {error}"))
                    .and_then(|source| {
                        workbench
                            .hot_reload(&source)
                            .map_err(|error| error.to_string())
                    })
                    .and_then(|_| {
                        write_generation(&mut output, &workbench, started)
                            .map_err(|error| error.to_string())
                    });
                if let Err(error) = result
                    && write_error(&mut output, &error).is_err()
                {
                    return ExitCode::FAILURE;
                }
            }
            "quit" => return ExitCode::SUCCESS,
            command => {
                let error = format!("unknown resident command: {command}");
                if write_error(&mut output, &error).is_err() {
                    return ExitCode::FAILURE;
                }
            }
        }
    }
    ExitCode::SUCCESS
}

fn write_generation(
    output: &mut impl Write,
    workbench: &ResidentSourceWorkbenchV1,
    started: Instant,
) -> Result<(), Box<dyn Error>> {
    let mut request = decode_wasm_process_request_v1(&workbench.generation().cwr1)?;
    request.authority.occurrence_evidence_bytes = EMBODIED_SESSION_CONTEXT.to_vec();
    request.authority.budget_units = EMBODIED_SESSION_BUDGET_UNITS;
    let cwr1 = encode_wasm_process_request_v1(&request)?;
    writeln!(
        output,
        "generation\t{}\t{}\t{}",
        workbench.generation().handle.generation,
        started.elapsed().as_micros(),
        hex(&cwr1),
    )?;
    output.flush()?;
    Ok(())
}

fn write_error(output: &mut impl Write, error: &str) -> std::io::Result<()> {
    writeln!(output, "error\t{}", hex(error.as_bytes()))?;
    output.flush()
}

fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(char::from(DIGITS[usize::from(byte >> 4)]));
        output.push(char::from(DIGITS[usize::from(byte & 0x0f)]));
    }
    output
}
