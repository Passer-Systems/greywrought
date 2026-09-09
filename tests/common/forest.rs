use greywrought::game::{Command, Game};

pub fn walk(game: &mut Game, destination: [f64; 2]) -> greywrought::Result<usize> {
    for tick in 0..1200 {
        let delta = [
            destination[0] - game.position[0],
            destination[1] - game.position[1],
        ];
        let distance = delta[0].hypot(delta[1]);
        if distance <= 0.08 {
            game.command(Command::Move { x: 0.0, z: 0.0 })?;
            game.tick()?;
            return Ok(tick);
        }
        game.command(Command::Move {
            x: delta[0] / distance,
            z: delta[1] / distance,
        })?;
        game.tick()?;
    }
    Err(format!("could not walk to {destination:?}").into())
}
