//! Camera clearance against the bounds of rendered meshes, independent of world rules.
use bevy::{
    camera::primitives::Aabb,
    math::bounding::{Aabb3d, AabbCast3d},
    prelude::*,
};

pub(super) fn world_bounds(bounds: &Aabb, transform: &GlobalTransform) -> Aabb3d {
    let affine = transform.affine();
    Aabb3d::new(
        affine.transform_point3a(bounds.center),
        affine.matrix3.abs() * bounds.half_extents,
    )
}

pub(super) fn clearance(projection: &Projection) -> f32 {
    match projection {
        Projection::Perspective(p) => {
            let half_height = p.near * (p.fov * 0.5).tan();
            (p.near * p.near + half_height * half_height * (1. + p.aspect_ratio * p.aspect_ratio))
                .sqrt()
                + 0.05
        }
        _ => 0.25,
    }
}

pub(super) fn distance(
    focus: Vec3,
    direction: Dir3,
    desired: f32,
    radius: f32,
    geometry: impl Iterator<Item = Aabb3d>,
) -> f32 {
    let cast = AabbCast3d::new(
        Aabb3d::new(Vec3::ZERO, Vec3::splat(radius)),
        focus,
        direction,
        desired,
    );
    geometry
        .filter(|bounds| {
            let min = Vec3::from(bounds.min) - Vec3::splat(radius);
            let max = Vec3::from(bounds.max) + Vec3::splat(radius);
            // An obstructed focus has no clear starting position. Let the orbit leave
            // that initial overlap instead of pinning the camera inside the mesh.
            !(focus.cmpge(min).all() && focus.cmple(max).all())
        })
        .filter_map(|bounds| cast.aabb_collision_at(bounds))
        .fold(desired, f32::min)
        .max(0.001)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orbit_escapes_initial_clearance_overlap_and_still_stops_at_a_wall() {
        let focus = Vec3::new(-2.232, 1.6, 12.016);
        let direction = Dir3::new(Vec3::new(0., 0.38_f32.sin(), -0.38_f32.cos())).unwrap();
        let crystal = Aabb3d::new(Vec3::new(-2., 0.75, 12.), Vec3::new(0.5, 0.75, 0.5));
        let radius = clearance(&Projection::Perspective(PerspectiveProjection {
            aspect_ratio: 1440. / 900.,
            ..default()
        }));
        assert_eq!(
            distance(focus, direction, 8., radius, [crystal].into_iter()),
            8.
        );
        let wall = Aabb3d::new(Vec3::new(-2., 3., 7.), Vec3::new(2., 3., 0.5));
        let wall_only = distance(focus, direction, 8., radius, [wall].into_iter());
        assert!(wall_only > 1. && wall_only < 8.);
        assert_eq!(
            distance(focus, direction, 8., radius, [crystal, wall].into_iter()),
            wall_only
        );
        let outside = Vec3::new(-2., 1., 9.);
        assert!(distance(outside, Dir3::Z, 8., radius, [crystal].into_iter()) < 3.);
    }

    #[test]
    fn orbit_clears_building_ground_and_scaled_mesh_bounds() {
        let focus = Vec3::new(0., 1.6, 0.);
        let wall = Aabb3d::new(Vec3::new(0., 1.5, -5.), Vec3::new(2., 1.5, 0.5));
        let hit = distance(focus, Dir3::NEG_Z, 8., 0.2, [wall].into_iter());
        assert!((hit - 4.3).abs() < 0.00001);
        assert_eq!(distance(focus, Dir3::X, 8., 0.2, [wall].into_iter()), 8.);
        assert_eq!(
            distance(focus, Dir3::NEG_Z, 3., 0.2, [wall].into_iter()),
            3.
        );
        let ground = Aabb3d::new(Vec3::ZERO, Vec3::new(50., 0., 50.));
        assert!(
            (distance(focus, Dir3::NEG_Y, 8., 0.2, [ground].into_iter()) - 1.4).abs() < 0.00001
        );
        let transformed = world_bounds(
            &Aabb::from_min_max(Vec3::splat(-1.), Vec3::splat(1.)),
            &GlobalTransform::from(
                Transform::from_xyz(0., 1.5, -5.).with_scale(Vec3::new(2., 1.5, 0.5)),
            ),
        );
        assert_eq!(transformed, wall);
    }
}
