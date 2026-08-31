use std::error::Error;

use greywrought_clause::conquest::run_native_conquest_v1;

fn main() -> Result<(), Box<dyn Error>> {
    let story = run_native_conquest_v1()?;
    let explanation = &story.admitted.explanation;
    println!("base={:?}", story.parent);
    println!("program={:?}", explanation.pins.program_revision);
    println!("package={:?}", explanation.pins.package);
    println!("authority={:?}", explanation.pins.root_policy);
    println!("branch-activation={:?}", explanation.ancestry.activation);
    println!("branch-steps={:?}", explanation.branch_steps);
    println!("branch-observations={:?}", explanation.branch_observations);
    println!("candidate={:?}", explanation.branch_candidate);
    println!("judgment={:?}", explanation.judgment);
    println!("admission={:?}", explanation.admission);
    println!("successor={:?}", explanation.successor);
    Ok(())
}
