# Greywrought

A browser action RPG built with **Three.js, ordinary TypeScript, and Bun**.

Play at **https://play.greywrought.com/**.

Create a character, fight through the Ashen Breach, recover a Cephorium cache,
and return alive. Three successful expeditions establish permanent access to
the Ashen Verge. Warrior, Mage, and Hunter have distinct abilities and resources.
Profiles, controls, and campaign progress are saved in the browser.

## Develop

Install Bun 1.3.13, then:

```sh
git clone https://github.com/Passer-Systems/greywrought.git
cd greywrought
bun install --frozen-lockfile
bun run dev
```

Open http://127.0.0.1:4173/. Edit TypeScript or styles and the development server
updates the browser. No separate language compiler or native toolchain is needed.

Gameplay lives in `greywrought:src/game/`. The existing Three.js presentation,
input, audio, and browser persistence live in `greywrought:src/host/`.
Assets and their attribution live in `greywrought:assets/`.

## Controls

W/S move forward and backward; A/D strafe. Space jumps. Hold both mouse buttons
to move forward, including while S is held. Left-drag looks around, right-drag
turns with the camera, and the wheel zooms.

Tab selects a target. 1–5 use class abilities; R uses the class utility.
E raises the shield, Shift sprints, Q dashes, and F interacts or loots.
Shift+R restarts an expedition. Escape opens controls and accessibility settings.

## Versions and archives

`main` is the supported Greywrought game. Releases use `vMAJOR.MINOR.PATCH`
tags; deployed directories use `greywrought-VERSION-COMMIT`. The browser pivot
is version **0.3.0**. A deployment's `release.json` identifies its source version.

Previous experiments are preserved by Git tags:

| Tag | Preserved work |
| --- | --- |
| `archive/bevy-20260909` | Unshipped Bevy experiment after removing its rules engine |
| `archive/bevy-clause-20260909` | Previously published native experiment |
| `archive/threejs-clause-20260909` | Original browser action RPG before this migration |
| `archive/rts-20260909` | Previous DigitalOcean browser deployment |

These are historical checkpoints. New game development continues on `main`.
An archive can be inspected with `git show TAG` or a separate Git worktree.

## Check and build

```sh
bun run typecheck
bun test
bun run build
```

The static build can be hosted without a game server. The public site is served
by Caddy on DigitalOcean. Source edits and local tests do not alter the public
deployment; a verified release is copied to a versioned directory before the
server's current-release pointer changes.
