/** Verify the installed Blender's background CPU fallback, without opening UI.
 * Run from a project root with Bun; evidence stays under build/ by default.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const folder = resolve(process.argv[2] ?? "build/blender-preflight");
await mkdir(folder, { recursive: true });
const attempt = `${Date.now()}-${process.pid}`;
const configPath = `${folder}/probe-input.json`;
const scriptPath = `${folder}/probe-native.py`;
await Bun.write(configPath, JSON.stringify({ folder, attempt }));
await Bun.write(scriptPath, String.raw`
import bpy, json, os, sys
with open(sys.argv[sys.argv.index('--') + 1]) as stream:
    config = json.load(stream)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.use_denoising = False
scene.cycles.samples = 8
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.render.resolution_x = 128
scene.render.resolution_y = 128
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(config['folder'], 'blender-cpu.png')
bpy.ops.render.render(write_still=True)
report = {
    'attempt': config['attempt'],
    'blenderVersion': bpy.app.version_string,
    'engine': scene.render.engine,
    'device': scene.cycles.device,
    'denoising': scene.cycles.use_denoising,
    'image': scene.render.filepath,
    'scope': 'Background CPU render only; interactive UI and GPU untested.'
}
with open(os.path.join(config['folder'], 'report.json'), 'w') as stream:
    json.dump(report, stream, indent=2)
print('BLENDER_CPU_PROBE_COMPLETE', flush=True)
`);

const child = Bun.spawn([
  Bun.env.BLENDER_BIN ?? "blender", "--background", "--factory-startup",
  "--python-exit-code", "1", "--python", scriptPath, "--", configPath,
], { stdout: "pipe", stderr: "pipe" });
let timedOut = false;
const timer = setTimeout(() => { timedOut = true; child.kill(); }, 60_000);
try {
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  await Bun.write(`${folder}/blender.log`, stdout);
  await Bun.write(`${folder}/blender-errors.log`, stderr);
  if (timedOut) throw new Error(`CPU probe exceeded 60 seconds. Inspect ${folder}/blender.log`);
  if (code !== 0 || !stdout.includes("BLENDER_CPU_PROBE_COMPLETE")) {
    throw new Error(`Blender CPU probe failed (exit ${code}). Inspect ${folder}/blender-errors.log and blender.log`);
  }
  const report = await Bun.file(`${folder}/report.json`).json() as {
    attempt: string; blenderVersion: string; engine: string; device: string; image: string;
  };
  if (report.attempt !== attempt || report.engine !== "CYCLES" || report.device !== "CPU"
      || !(await Bun.file(report.image).exists()) || Bun.file(report.image).size === 0) {
    throw new Error("Blender did not produce current CPU-render evidence");
  }
  console.log(`Blender ${report.blenderVersion}: background CPU render passed.`);
  console.log(`Evidence: ${folder}/report.json and ${report.image}`);
  console.log("Interactive UI and GPU capabilities were not tested.");
} finally {
  clearTimeout(timer);
}
