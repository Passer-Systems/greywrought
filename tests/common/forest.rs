use greywrought_clause::native::{self, NativeSession};

pub fn walk(session: &mut NativeSession, destination: [f64; 2]) -> native::Result<usize> {
    for tick in 0..1200 {
        let view = session
            .snapshot(0, String::new())?
            .forest
            .ok_or("no forest")?;
        let delta = [
            destination[0] - view.position[0],
            destination[1] - view.position[1],
        ];
        let distance = (delta[0] * delta[0] + delta[1] * delta[1]).sqrt();
        if distance <= 0.08 {
            for (source, value) in [native::scalar("MoveX", 0.), native::scalar("MoveZ", 0.)] {
                session.input(session.workbench.generation().handle, source, value)?;
            }
            session.tick()?;
            return Ok(tick);
        }
        for (source, value) in [
            native::scalar("MoveX", delta[0] / distance),
            native::scalar("MoveZ", delta[1] / distance),
        ] {
            session.input(session.workbench.generation().handle, source, value)?;
        }
        session.tick()?;
    }
    Err(format!("could not walk to {destination:?}").into())
}
