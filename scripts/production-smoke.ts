export {};
const url = Bun.env.GREYWROUGHT_GAME_URL ?? "https://play.greywrought.com/";
const release = await fetch(new URL("release.json", url));
if (!release.ok) throw new Error(`Release identity unavailable: ${release.status}`);
const identity = await release.json() as { name: string; version: string; variant: string; commit: string };
if (identity.name !== "greywrought" || identity.variant !== "threejs" || !identity.commit) throw new Error("Unexpected deployed game");
console.log(`Greywrought ${identity.version} (${identity.commit}) at ${url}`);
const smoke = Bun.spawn([process.execPath, "acceptance/browser/playability.ts"], { env: { ...Bun.env, GREYWROUGHT_GAME_URL: url }, stdout: "inherit", stderr: "inherit" });
if (await smoke.exited !== 0) throw new Error("Deployed browser journey failed");
