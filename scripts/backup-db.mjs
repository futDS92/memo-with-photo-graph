import { mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "data", "study-deck.sqlite");
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const target = join(root, "data", "backups", `study-deck-${stamp}.sqlite`);
await mkdir(dirname(target), { recursive: true });
const database = new DatabaseSync(source, { readOnly: true });
database.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
database.close();
console.log(`Database backup created: ${target}`);
