import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const generatedDir = join(root, "ait-client", "src", "generated");
const publicDir = join(root, "ait-client", "public");
const statePath = join(publicDir, ".ait-version-state.json");
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date()).replaceAll("-", ".");

let previous = null;
try {
  previous = JSON.parse(await readFile(statePath, "utf8"));
} catch {
  // First build on this machine.
}
const build = previous?.date === date ? Number(previous.build || 0) + 1 : 1;
const version = `${date}.${build}`;
const generated = `export const AIT_VERSION = ${JSON.stringify(version)} as const;\n`;

await mkdir(generatedDir, { recursive: true });
await writeFile(join(generatedDir, "build-version.ts"), generated, "utf8");
await writeFile(join(publicDir, "build-version.json"), JSON.stringify({ version, date, build }, null, 2) + "\n", "utf8");
await writeFile(statePath, JSON.stringify({ date, build }, null, 2) + "\n", "utf8");
console.log(`AIT version ${version}`);
