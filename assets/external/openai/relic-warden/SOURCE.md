# Relic Warden

`relic-warden.glb` is the self-contained OpenAI-authored game model for
Greywrought's Relic Warden: fitted metal shells, a recessed power aperture,
articulated hands, a relic sword and shield, and split linen. All visible
geometry was newly authored as individually specified control surfaces,
resolved with Blender subdivision and solidify. Materials use vertex colors.

The runtime model contains 55,432 triangles, 43 bones and the `Idle`, `Run`,
`SwordSlash`, `HitRecieve_1` and `Death` clips. Loop Idle and Run; play the
others once. The published model route is
`assets/openai/actors/RelicWarden.glb`.

The skeleton and animation tracks derive from **Mike** in Quaternius's
**Animated Mech Pack — March 2021**, released under CC0 1.0 Universal.
No donor surface geometry is used.

Original source attribution:

> LowPoly Models by @Quaternius
> Consider supporting me on Patreon, even $1 helps me a lot!
> https://www.patreon.com/quaternius
>
> License: CC0 1.0 Universal (CC0 1.0)
> Public Domain Dedication
> https://creativecommons.org/publicdomain/zero/1.0/

Only the runtime GLB and these source notes are retained in Git. Local Blender
sources, measurements and inspection outputs belong under ignored
`build/warden/`. The optional authoring tools are
`bun scripts/art/open-warden.ts` and
`WARDEN_RIG_SOURCE=/path/to/Mike.gltf bun scripts/art/author-warden.ts`.
The original rig pack is an external authoring input; playing and building the
game require neither it nor Blender. Validate with `bun run test:art`.
