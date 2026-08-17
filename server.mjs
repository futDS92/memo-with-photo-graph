import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = __dirname;
const dataDir = join(rootDir, "data");
const statePath = join(dataDir, "state.json");
const tempStatePath = join(dataDir, "state.json.tmp");
const databasePath = join(dataDir, "study-deck.sqlite");
const port = Number(process.env.PORT || 4180);
let writeQueue = Promise.resolve();
let legacyState;

mkdirSync(dataDir, { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, is_anonymous INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS user_states (user_id TEXT PRIMARY KEY, words_json TEXT NOT NULL, relations_json TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
`);

const seedState = {
  words: [
    {
      id: "word-orchard",
      term: "orchard",
      pos: "noun",
      definition: "과수원, 특히 사과나 배 같은 과일나무가 자라는 장소",
      example: "We walked through the orchard in spring.",
      memo: "fruit / trees / garden 이미지를 같이 기억",
      tags: ["nature", "food", "place"],
      photo: createSeedPhoto("orchard", "#425f56", "#c7a06f"),
    },
    {
      id: "word-grove",
      term: "grove",
      pos: "noun",
      definition: "작은 나무숲, 나무가 일정하게 모여 있는 곳",
      example: "A grove of olive trees stood behind the house.",
      memo: "orchard보다 더 자연적이고 작은 숲 느낌",
      tags: ["nature", "landscape"],
      photo: createSeedPhoto("grove", "#2e5b4e", "#8bb49a"),
    },
    {
      id: "word-tree",
      term: "tree",
      pos: "noun",
      definition: "나무, 줄기와 가지를 가진 식물",
      example: "The tree casts a long shadow.",
      memo: "상위 개념: orchard와 grove 모두 tree와 연결",
      tags: ["nature", "base"],
      photo: createSeedPhoto("tree", "#45574d", "#b48d5e"),
    },
    {
      id: "word-farm",
      term: "farm",
      pos: "noun",
      definition: "농장, 농작물이나 가축을 기르는 곳",
      example: "The farm grows apples and pears.",
      memo: "orchard가 farm의 하위 공간으로 느껴질 때 연결",
      tags: ["food", "place"],
      photo: createSeedPhoto("farm", "#5b6f53", "#d1a975"),
    },
    {
      id: "word-bloom",
      term: "bloom",
      pos: "verb",
      definition: "꽃이 피다, 번성하다",
      example: "The trees bloom in April.",
      memo: "사진과 연결하면 계절 기억이 잘 붙음",
      tags: ["verb", "season"],
      photo: createSeedPhoto("bloom", "#734f5c", "#d7a58a"),
    },
  ],
  relations: [
    {
      id: "rel-1",
      fromWordId: "word-orchard",
      toWordId: "word-tree",
      type: "hyponym",
      label: "contains",
    },
    {
      id: "rel-2",
      fromWordId: "word-grove",
      toWordId: "word-tree",
      type: "hyponym",
      label: "made of",
    },
    {
      id: "rel-3",
      fromWordId: "word-orchard",
      toWordId: "word-farm",
      type: "part_of",
      label: "can belong to",
    },
    {
      id: "rel-4",
      fromWordId: "word-orchard",
      toWordId: "word-bloom",
      type: "related",
      label: "seasonal image",
    },
    {
      id: "rel-5",
      fromWordId: "word-grove",
      toWordId: "word-bloom",
      type: "related",
      label: "forest feeling",
    },
  ],
  schemaVersion: 2,
};

await mkdir(dataDir, { recursive: true });

function createSeedPhoto(label, colorA, colorB) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${colorA}" />
          <stop offset="100%" stop-color="${colorB}" />
        </linearGradient>
        <linearGradient id="w" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity=".18"/>
          <stop offset="100%" stop-color="#000000" stop-opacity=".08"/>
        </linearGradient>
      </defs>
      <rect width="480" height="320" fill="url(#g)" />
      <rect width="480" height="320" fill="url(#w)" />
      <circle cx="132" cy="110" r="74" fill="#ffffff" fill-opacity=".14"/>
      <circle cx="332" cy="178" r="98" fill="#ffffff" fill-opacity=".08"/>
      <text x="36" y="274" fill="#ffffff" fill-opacity=".88" font-family="Inter, Arial, sans-serif" font-size="46" font-weight="800">${escapeXml(label)}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function readJsonFile(path, fallback) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => key)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]),
  );
}

function setSessionCookie(res, token, maxAge = 60 * 60 * 24 * 30) {
  const secure = process.env.COOKIE_SECURE === "true";
  const sameSite = secure ? "None" : "Lax";
  res.setHeader(
    "set-cookie",
    `study_session=${encodeURIComponent(token)}; HttpOnly; SameSite=${sameSite};${secure ? " Secure;" : ""} Path=/; Max-Age=${maxAge}`,
  );
}

function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  database
    .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .run(token, userId, expiresAt);
  return token;
}

function createAnonymousUser() {
  const id = `user-${randomBytes(12).toString("hex")}`;
  database
    .prepare(
      "INSERT INTO users (id, email, password_hash, is_anonymous, created_at) VALUES (?, NULL, NULL, 1, ?)",
    )
    .run(id, new Date().toISOString());
  return id;
}

function getUserFromRequest(req, res, createAnonymous = true) {
  const token = parseCookies(req).study_session;
  if (token) {
    const row = database
      .prepare(
        "SELECT users.id, users.email, users.is_anonymous FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires_at > ?",
      )
      .get(token, new Date().toISOString());
    if (row) return row;
  }
  if (!createAnonymous) return null;
  const userId = createAnonymousUser();
  const newToken = createSession(userId);
  setSessionCookie(res, newToken);
  return { id: userId, email: null, is_anonymous: 1 };
}

async function getUserState(userId) {
  const row = database
    .prepare("SELECT words_json, relations_json, updated_at FROM user_states WHERE user_id = ?")
    .get(userId);
  if (row)
    return {
      words: JSON.parse(row.words_json),
      relations: JSON.parse(row.relations_json),
      updatedAt: row.updated_at,
      schemaVersion: 2,
    };
  if (legacyState === undefined) legacyState = await readJsonFile(statePath, null);
  if (
    legacyState?.schemaVersion === 2 &&
    Array.isArray(legacyState.words) &&
    Array.isArray(legacyState.relations)
  )
    return legacyState;
  return seedState;
}

function writeUserState(userId, state) {
  const updatedAt = new Date().toISOString();
  database
    .prepare(
      "INSERT INTO user_states (user_id, words_json, relations_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET words_json = excluded.words_json, relations_json = excluded.relations_json, updated_at = excluded.updated_at",
    )
    .run(userId, JSON.stringify(state.words), JSON.stringify(state.relations), updatedAt);
  return { ...state, updatedAt, schemaVersion: 2 };
}

async function getState() {
  const existing = await readJsonFile(statePath, null);
  if (
    existing &&
    Array.isArray(existing.words) &&
    Array.isArray(existing.relations) &&
    existing.schemaVersion === 2 &&
    (existing.words.length || existing.relations.length)
  ) {
    return existing;
  }
  await writeState(seedState);
  return seedState;
}

async function writeState(state) {
  const payload = JSON.stringify(
    {
      words: Array.isArray(state.words) ? state.words : [],
      relations: Array.isArray(state.relations) ? state.relations : [],
      updatedAt: new Date().toISOString(),
      schemaVersion: 2,
    },
    null,
    2,
  );
  await writeFile(tempStatePath, payload, "utf8");
  await rename(tempStatePath, statePath);
}

function isValidState(state) {
  if (!state || !Array.isArray(state.words) || !Array.isArray(state.relations)) return false;
  const ids = new Set();
  for (const word of state.words) {
    if (
      !word ||
      typeof word.id !== "string" ||
      typeof word.term !== "string" ||
      typeof word.definition !== "string" ||
      !Array.isArray(word.tags)
    )
      return false;
    if (ids.has(word.id)) return false;
    ids.add(word.id);
  }
  const relationIds = new Set();
  return state.relations.every(
    (relation) =>
      relation &&
      typeof relation.id === "string" &&
      !relationIds.has(relation.id) &&
      typeof relation.fromWordId === "string" &&
      typeof relation.toWordId === "string" &&
      ids.has(relation.fromWordId) &&
      ids.has(relation.toWordId) &&
      relationIds.add(relation.id),
  );
}

function sendJson(res, statusCode, body, origin = "") {
  const allowedOrigin = process.env.CLIENT_ORIGIN || origin;
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(allowedOrigin ? { "access-control-allow-origin": allowedOrigin } : {}),
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      const allowedOrigin = process.env.CLIENT_ORIGIN || req.headers.origin;
      res.writeHead(
        204,
        allowedOrigin
          ? {
              "access-control-allow-origin": allowedOrigin,
              "access-control-allow-credentials": "true",
              "access-control-allow-headers": "content-type",
              "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
            }
          : undefined,
      );
      res.end();
      return;
    }

    if (url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/state" && req.method === "GET") {
      const user = getUserFromRequest(req, res, true);
      const state = await getUserState(user.id);
      sendJson(res, 200, state);
      return;
    }

    if (url.pathname === "/api/state" && (req.method === "PUT" || req.method === "POST")) {
      let payload;
      try {
        payload = await readRequestJson(req);
      } catch {
        sendJson(res, 400, { error: "Request body must be valid JSON" });
        return;
      }
      if (!isValidState(payload)) {
        sendJson(res, 400, { error: "Invalid state payload" });
        return;
      }
      const user = getUserFromRequest(req, res, true);
      const current = await getUserState(user.id);
      if (payload.updatedAt && current.updatedAt > payload.updatedAt) {
        sendJson(res, 409, { error: "A newer state already exists", state: current });
        return;
      }
      writeQueue = writeQueue.catch(() => undefined).then(() => writeUserState(user.id, payload));
      await writeQueue;
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: "API only. Run the ait-client workspace for the app." });
  } catch (error) {
    sendJson(res, 500, { error: String(error?.message || error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`memo with photo graph running at http://localhost:${port}`);
});
