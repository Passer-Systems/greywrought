use std::error::Error;
use std::path::Path;

use greywrought_clause::ongoing_effect::run_native_ongoing_effect_conquest_v1;

fn main() -> Result<(), Box<dyn Error>> {
    let story = run_native_ongoing_effect_conquest_v1(Path::new(
        "build/ongoing-effect/native-receipt.bin",
    ))?;
    println!("activation={:?}", story.activation);
    println!("continuation={:?}", story.suspension.continuation);
    println!("intent={:?}", story.intent.id);
    println!("authorization={:?}", story.authorization.id);
    println!("attempt={:?}", story.attempt.id);
    println!("receipt={:?}", story.receipt.id);
    println!("observation={:?}", story.observation.id);
    println!("effect-judgment={:?}", story.judgment.id);
    println!("admitted-successor={:?}", story.admitted_successor);
    Ok(())
}
