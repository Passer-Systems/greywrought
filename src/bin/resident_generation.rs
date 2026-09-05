use std::error::Error;
use std::io::{BufRead, Write};
use std::path::Path;
use std::process::ExitCode;
use std::time::Instant;

use clause_runtime::{
    decode_executable_occurrence_v1, decode_wasm_process_request_v1,
    encode_wasm_process_request_v1,
};
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
    if write_generation(&mut output, &workbench, started, false).is_err() {
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
        let command = line.trim();
        match command {
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
                        write_generation(&mut output, &workbench, started, false)
                            .map_err(|error| error.to_string())
                    });
                if let Err(error) = result
                    && write_error(&mut output, &error).is_err()
                {
                    return ExitCode::FAILURE;
                }
            }
            "quit" => return ExitCode::SUCCESS,
            _ if command.starts_with("edit\t") => {
                let started = Instant::now();
                let result = edit_scalar_effect(&mut workbench, source_path, command).and_then(|changed| {
                    write_generation(&mut output, &workbench, started, changed)
                        .map_err(|error| error.to_string())
                });
                if let Err(error) = result
                    && write_error(&mut output, &error).is_err()
                {
                    return ExitCode::FAILURE;
                }
            }
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
    edited: bool,
) -> Result<(), Box<dyn Error>> {
    let mut request = decode_wasm_process_request_v1(&workbench.generation().cwr1)?;
    request.authority.occurrence_evidence_bytes = EMBODIED_SESSION_CONTEXT.to_vec();
    request.authority.budget_units = EMBODIED_SESSION_BUDGET_UNITS;
    let cwr1 = encode_wasm_process_request_v1(&request)?;
    writeln!(
        output,
        "generation\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
        workbench.generation().handle.generation,
        started.elapsed().as_micros(),
        hex(&cwr1),
        if edited { hex(workbench.last_source_edit().ok_or("edited generation omitted CET1")?) } else { String::new() },
        scalar_catalog(workbench)?,
        handler_entry(workbench, b"party-attack")?,
        handler_entry(workbench, b"party-heal")?,
    )?;
    output.flush()?;
    Ok(())
}

fn edit_scalar_effect(
    workbench: &mut ResidentSourceWorkbenchV1,
    source_path: &Path,
    command: &str,
) -> Result<bool, String> {
    let mut fields = command.split('\t');
    if fields.next() != Some("edit") {
        return Err("invalid source edit command".into());
    }
    let generation = fields
        .next()
        .ok_or("source edit omitted generation")?
        .parse::<u32>()
        .map_err(|_| "source edit generation is invalid")?;
    let index = fields
        .next()
        .ok_or("source edit omitted catalog index")?
        .parse::<usize>()
        .map_err(|_| "source edit catalog index is invalid")?;
    let expression = unhex(fields.next().ok_or("source edit omitted expression")?)?;
    if fields.next().is_some() {
        return Err("source edit command has trailing fields".into());
    }
    let captured = workbench.generation().handle;
    if generation != captured.generation {
        return Err("stale structured source operation".into());
    }
    let selected = workbench
        .scalar_effects()
        .map_err(|error| error.to_string())?
        .get(index)
        .cloned()
        .ok_or("source edit catalog index is absent")?;
    let next = workbench
        .edit_scalar_effect(captured, &selected, &expression)
        .map_err(|error| format!("structured edit: {error}"))?;
    let changed = next.handle != captured;
    if changed {
        persist_exact_source(source_path, next.handle.generation, workbench.exact_source())?;
    }
    Ok(changed)
}

fn persist_exact_source(source_path: &Path, generation: u32, exact_source: &[u8]) -> Result<(), String> {
    let file_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("source path has no UTF-8 file name")?;
    let temporary = source_path.with_file_name(format!(
        ".{file_name}.greywrought-edit-{}-{generation}",
        std::process::id(),
    ));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| format!("source persistence create failed: {error}"))?;
    if let Err(error) = file.write_all(exact_source).and_then(|_| file.sync_all()) {
        let _ = std::fs::remove_file(&temporary);
        return Err(format!("source persistence write failed: {error}"));
    }
    std::fs::rename(&temporary, source_path)
        .map_err(|error| format!("source persistence install failed: {error}"))?;
    Ok(())
}

fn scalar_catalog(workbench: &ResidentSourceWorkbenchV1) -> Result<String, Box<dyn Error>> {
    Ok(workbench
        .scalar_effects()?
        .iter()
        .enumerate()
        .map(|(index, effect)| {
            format!(
                "{index},{},{},{},{},{},{}",
                effect.handler.get(),
                effect.effect.get(),
                effect.expression_origin.start,
                effect.expression_origin.end,
                hex(effect.artifact.as_bytes()),
                hex(&effect.expression),
            )
        })
        .collect::<Vec<_>>()
        .join(";"))
}

fn handler_entry(
    workbench: &ResidentSourceWorkbenchV1,
    designation: &[u8],
) -> Result<u16, Box<dyn Error>> {
    Ok(decode_executable_occurrence_v1(&workbench.handler_occurrence(designation, &[])?)?.entry)
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

fn unhex(value: &str) -> Result<Vec<u8>, String> {
    if !value.len().is_multiple_of(2) {
        return Err("hex source edit expression has odd length".into());
    }
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let digit = |byte: u8| match byte {
                b'0'..=b'9' => Ok(byte - b'0'),
                b'a'..=b'f' => Ok(byte - b'a' + 10),
                _ => Err("hex source edit expression is invalid".to_string()),
            };
            Ok((digit(pair[0])? << 4) | digit(pair[1])?)
        })
        .collect()
}
