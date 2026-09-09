# Greywrought native game

Rust owns Greywrought gameplay, state, persistence and Bevy presentation. The
operator explicitly authorized the migration to ordinary Rust/Bevy on September
8, 2026. This replaces the former Clause source-authority requirement for this
project. Do not introduce another language/compiler/runtime into its delivery.

Keep the forest expedition, equipment, controls and character progress usable.
Preserve the installed build and original saves until the replacement passes a
private native play/save/reopen journey. The migration exports existing saves
with the old pinned tool outside the replacement's live tree; the shipped game
must have no Clause dependency or compatibility runtime.

Keep the existing Nix development shell as a project-local native build boundary;
it needs no compiler generation or NixOS activation. All Cargo/build output
belongs under this worktree's ignored build/. Use Bun for existing script tasks.

Use ordinary typed Rust state and commands. Bevy may render and animate accepted
gameplay state; its cues must agree with actual intent, range, damage and timing.
Preserve deterministic fixed-step simulation, normalized movement, mouse-button
priority, jumping, potion transactions, extraction and death consequences.

The player milestone includes a legible town/forest map and animated, readable
current/upcoming enemy intentions. Player-facing copy uses game language.

Keep 100-actor rendering and real-time simulation measurements as a scaling
check. Retiring the Clause expression editor also retires its source-edit test;
do not report the old Clause benchmark as passed by changing its workload.
Preserve relevant gameplay assertions when migrating tests. Remove retired
compiler experiments and their consumers completely from the live tree; Git
history and the previous installed release retain recovery.
