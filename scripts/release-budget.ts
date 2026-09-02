import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const releaseRoot = "dist";
const maximumReleaseBytes = 32 * 1024 * 1024;
const maximumSingleFileBytes = 12 * 1024 * 1024;

interface ReleaseFile {
  readonly path: string;
  readonly bytes: number;
}

async function collect(directory: string): Promise<ReleaseFile[]> {
  const files: ReleaseFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (entry.isFile()) {
      files.push({ path: relative(releaseRoot, path), bytes: (await stat(path)).size });
    }
  }
  return files;
}

const files = (await collect(releaseRoot)).sort((left, right) => right.bytes - left.bytes);
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const oversized = files.filter((file) => file.bytes > maximumSingleFileBytes);
if (totalBytes > maximumReleaseBytes) {
  throw new Error(
    `release is ${totalBytes} bytes; budget is ${maximumReleaseBytes} bytes`,
  );
}
if (oversized.length > 0) {
  throw new Error(
    `release files exceed ${maximumSingleFileBytes} bytes: ${oversized.map((file) => file.path).join(", ")}`,
  );
}

const manifest = {
  schemaVersion: 1,
  totalBytes,
  maximumReleaseBytes,
  maximumSingleFileBytes,
  fileCount: files.length,
  files: [...files].sort((left, right) => left.path.localeCompare(right.path)),
};
await Bun.write(join(releaseRoot, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Release budget passed: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB / ` +
    `${(maximumReleaseBytes / 1024 / 1024).toFixed(0)} MiB across ${files.length} files.`,
);
for (const file of files.slice(0, 8)) {
  console.log(`${(file.bytes / 1024 / 1024).toFixed(2)} MiB\t${file.path}`);
}
