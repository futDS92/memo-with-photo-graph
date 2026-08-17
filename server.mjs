import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { OAuth2Client } from "google-auth-library";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = __dirname;
const dataDir = join(rootDir, "data");
const statePath = join(dataDir, "state.json");
const tempStatePath = join(dataDir, "state.json.tmp");
const databasePath = join(dataDir, "study-deck.sqlite");
const port = Number(process.env.PORT || 4180);
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;
const maxBodyBytes = 8 * 1024 * 1024;
const requestBuckets = new Map();
let writeQueue = Promise.resolve();
let legacyState;

mkdirSync(dataDir, { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, google_sub TEXT UNIQUE, password_hash TEXT, is_anonymous INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login_at TEXT);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS user_states (user_id TEXT PRIMARY KEY, projects_json TEXT NOT NULL DEFAULT '[]', words_json TEXT NOT NULL, relations_json TEXT NOT NULL, review_log_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS ranking_profiles (user_id TEXT PRIMARY KEY, nickname TEXT NOT NULL, opted_in INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS login_audit_logs (id TEXT PRIMARY KEY, user_id TEXT, provider TEXT NOT NULL, success INTEGER NOT NULL, reason TEXT, device_hash TEXT, user_agent TEXT, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
`);
database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
try {
  database.exec("ALTER TABLE user_states ADD COLUMN projects_json TEXT NOT NULL DEFAULT '[]'");
} catch {
  /* Existing database already has the column. */
}
try {
  database.exec("ALTER TABLE user_states ADD COLUMN review_log_json TEXT NOT NULL DEFAULT '[]'");
} catch {
  /* Existing database already has the column. */
}
try {
  database.exec("ALTER TABLE sessions ADD COLUMN device_id TEXT NOT NULL DEFAULT ''");
} catch {
  /* Existing database already has the column. */
}
try {
  database.exec("ALTER TABLE users ADD COLUMN google_sub TEXT");
} catch {
  /* Existing database already has the column. */
}
try {
  database.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
} catch {
  /* Existing database already has the column. */
}

const seedState = {
  projects: [
    {
      id: "project-data-analysis",
      name: "데이터 분석 기사",
      description: "시험 대비 플래시카드와 지식 그래프",
      color: "#3182F6",
    },
  ],
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

function requestDeviceId(req) {
  const value = req.headers["x-graphflash-device"];
  return typeof value === "string" && value.length >= 8 && value.length <= 160 ? value : "";
}

function createSession(userId, deviceId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  database
    .prepare("INSERT INTO sessions (token, user_id, device_id, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, deviceId, expiresAt);
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

function recordLoginAudit({ userId = null, provider, success, reason = "", deviceId, userAgent }) {
  const deviceHash = deviceId
    ? createHash("sha256").update(deviceId).digest("hex").slice(0, 24)
    : null;
  database
    .prepare("INSERT INTO login_audit_logs (id, user_id, provider, success, reason, device_hash, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      `audit-${randomBytes(12).toString("hex")}`,
      userId,
      provider,
      success ? 1 : 0,
      reason.slice(0, 120),
      deviceHash,
      String(userAgent || "").slice(0, 300),
      new Date().toISOString(),
    );
}

async function authenticateGoogle(req, res, credential) {
  const deviceId = requestDeviceId(req);
  const userAgent = req.headers["user-agent"];
  if (!googleClient) {
    recordLoginAudit({ provider: "google", success: false, reason: "not_configured", deviceId, userAgent });
    sendJson(res, 503, { error: "Google authentication is not configured" });
    return;
  }
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId });
  } catch {
    recordLoginAudit({ provider: "google", success: false, reason: "invalid_token", deviceId, userAgent });
    sendJson(res, 401, { error: "Google account verification failed" });
    return;
  }
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    recordLoginAudit({ provider: "google", success: false, reason: "unverified_account", deviceId, userAgent });
    sendJson(res, 401, { error: "Google account verification failed" });
    return;
  }
  const existingSession = getUserFromRequest(req, res, false);
  let user = database.prepare("SELECT id, email, is_anonymous FROM users WHERE google_sub = ?").get(payload.sub);
  let migratedAnonymous = false;
  if (!user && existingSession?.is_anonymous) {
    database
      .prepare("UPDATE users SET email = ?, google_sub = ?, is_anonymous = 0 WHERE id = ?")
      .run(payload.email, payload.sub, existingSession.id);
    user = { id: existingSession.id, email: payload.email, is_anonymous: 0 };
    migratedAnonymous = true;
  }
  if (!user) {
    const userId = `user-${randomBytes(12).toString("hex")}`;
    database
      .prepare("INSERT INTO users (id, email, google_sub, password_hash, is_anonymous, created_at) VALUES (?, ?, ?, NULL, 0, ?)")
      .run(userId, payload.email, payload.sub, new Date().toISOString());
    user = { id: userId, email: payload.email, is_anonymous: 0 };
  }
  database.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(new Date().toISOString(), user.id);
  recordLoginAudit({ userId: user.id, provider: "google", success: true, deviceId, userAgent });
  const token = createSession(user.id, deviceId);
  setSessionCookie(res, token);
  sendJson(res, 200, { user: { id: user.id, email: user.email, isAnonymous: false }, migratedAnonymous });
}

function getUserFromRequest(req, res, createAnonymous = true) {
  const token = parseCookies(req).study_session;
  const deviceId = requestDeviceId(req);
  if (token) {
    const row = database
      .prepare(
        "SELECT users.id, users.email, users.is_anonymous, sessions.device_id FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires_at > ? AND (sessions.device_id = ? OR sessions.device_id = '')",
      )
      .get(token, new Date().toISOString(), deviceId);
    if (row) {
      if (!row.device_id && deviceId)
        database.prepare("UPDATE sessions SET device_id = ? WHERE token = ?").run(deviceId, token);
      return row;
    }
  }
  if (!createAnonymous) return null;
  const userId = createAnonymousUser();
  const newToken = createSession(userId, deviceId);
  setSessionCookie(res, newToken);
  return { id: userId, email: null, is_anonymous: 1 };
}

async function getUserState(userId) {
  const row = database
    .prepare(
      "SELECT projects_json, words_json, relations_json, review_log_json, updated_at FROM user_states WHERE user_id = ?",
    )
    .get(userId);
  if (row)
    return {
      projects: JSON.parse(row.projects_json || "[]"),
      words: JSON.parse(row.words_json),
      relations: JSON.parse(row.relations_json),
      reviewLog: JSON.parse(row.review_log_json || "[]"),
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
      "INSERT INTO user_states (user_id, projects_json, words_json, relations_json, review_log_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET projects_json = excluded.projects_json, words_json = excluded.words_json, relations_json = excluded.relations_json, review_log_json = excluded.review_log_json, updated_at = excluded.updated_at",
    )
    .run(
      userId,
      JSON.stringify(state.projects || []),
      JSON.stringify(state.words),
      JSON.stringify(state.relations),
      JSON.stringify(Array.isArray(state.reviewLog) ? state.reviewLog.slice(-500) : []),
      updatedAt,
    );
  return { ...state, updatedAt, schemaVersion: 2 };
}

function periodStart(period = "week") {
  if (period === "all") return null;
  const date = new Date();
  if (period === "month") {
    date.setUTCDate(1);
    date.setUTCHours(0, 0, 0, 0);
    return date.toISOString();
  }
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function rankingStats(state, period = "week") {
  const start = periodStart(period);
  const reviews = (state.reviewLog || []).filter((event) => !start || event.date >= start.slice(0, 10));
  const correct = reviews.filter((event) => event.correct).length;
  const mapLinks = Array.isArray(state.relations) ? state.relations.length : 0;
  const studyDates = new Set((state.reviewLog || []).map((event) => event.date));
  let streak = 0;
  const cursor = new Date();
  while (studyDates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return {
    reviewCount: reviews.length,
    accuracy: reviews.length ? Math.round((correct / reviews.length) * 100) : 0,
    streak,
    cardCount: Array.isArray(state.words) ? state.words.length : 0,
    mapLinks,
    score: reviews.length * 10 + correct * 5 + mapLinks * 2 + streak * 20,
  };
}

async function getRanking(userId, period = "week") {
  const profiles = database
    .prepare("SELECT user_id, nickname FROM ranking_profiles WHERE opted_in = 1 ORDER BY updated_at DESC")
    .all();
  const entries = [];
  for (const profile of profiles) {
    const state = await getUserState(profile.user_id);
    entries.push({ userId: profile.user_id, nickname: profile.nickname, ...rankingStats(state, period) });
  }
  entries.sort((a, b) => b.score - a.score || b.accuracy - a.accuracy || a.nickname.localeCompare(b.nickname));
  const ranked = entries.map((entry, index) => ({
    rank: index + 1,
    nickname: entry.nickname,
    score: entry.score,
    reviewCount: entry.reviewCount,
    accuracy: entry.accuracy,
    streak: entry.streak,
    cardCount: entry.cardCount,
    mapLinks: entry.mapLinks,
    isMe: entry.userId === userId,
  }));
  return { period, periodStart: periodStart(period)?.slice(0, 10) || null, entries: ranked.slice(0, 50), me: ranked.find((entry) => entry.isMe) || null };
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
  if (
    !state ||
    !Array.isArray(state.words) ||
    !Array.isArray(state.relations) ||
    state.words.length > 10000 ||
    state.relations.length > 30000 ||
    (Array.isArray(state.projects) && state.projects.length > 100)
  )
    return false;
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
    if (
      word.term.length > 500 ||
      word.definition.length > 12000 ||
      (word.memo && word.memo.length > 12000) ||
      (word.photo && word.photo.length > 1_500_000) ||
      word.tags.length > 50
    )
      return false;
    if (ids.has(word.id)) return false;
    ids.add(word.id);
  }
  const relationIds = new Set();
  if (Array.isArray(state.reviewLog) && state.reviewLog.length > 10000) return false;
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

function clearSessionCookie(res) {
  const secure = process.env.COOKIE_SECURE === "true";
  res.setHeader(
    "set-cookie",
    `study_session=; HttpOnly; SameSite=${secure ? "None" : "Lax"};${secure ? " Secure;" : ""} Path=/; Max-Age=0`,
  );
}

function sendJson(res, statusCode, body, origin = "") {
  const allowedOrigin = process.env.CLIENT_ORIGIN || origin;
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    ...(allowedOrigin ? { "access-control-allow-origin": allowedOrigin } : {}),
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type, x-graphflash-device",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

async function readRequestJson(req) {
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > maxBodyBytes) throw new Error("PAYLOAD_TOO_LARGE");
  const chunks = [];
  let total = 0;
  for await (const chunk of req) chunks.push(chunk);
  total = chunks.reduce((size, chunk) => size + chunk.length, 0);
  if (total > maxBodyBytes) throw new Error("PAYLOAD_TOO_LARGE");
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function isAllowedOrigin(req) {
  const configured = process.env.CLIENT_ORIGIN;
  const origin = req.headers.origin;
  return !configured || !origin || origin === configured;
}

function isRateLimited(req) {
  const address = req.socket.remoteAddress || "unknown";
  const key = `${address}:${req.url?.split("?")[0] || "/"}`;
  const now = Date.now();
  if (requestBuckets.size > 10_000) {
    for (const [bucketKey, bucket] of requestBuckets) {
      if (now - bucket.startedAt > 120_000) requestBuckets.delete(bucketKey);
    }
    if (requestBuckets.size > 10_000) requestBuckets.clear();
  }
  const bucket = requestBuckets.get(key) || { startedAt: now, count: 0 };
  if (now - bucket.startedAt > 60_000) {
    bucket.startedAt = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  requestBuckets.set(key, bucket);
  return bucket.count > (req.url?.startsWith("/api/auth/") ? 12 : 180);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (isRateLimited(req)) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    if (!isAllowedOrigin(req)) {
      sendJson(res, 403, { error: "Origin is not allowed" });
      return;
    }

    if (req.method === "OPTIONS") {
      const allowedOrigin = process.env.CLIENT_ORIGIN || req.headers.origin;
      res.writeHead(
        204,
        allowedOrigin
          ? {
              "access-control-allow-origin": allowedOrigin,
              "access-control-allow-credentials": "true",
              "access-control-allow-headers": "content-type, x-graphflash-device",
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

    if (url.pathname === "/api/me" && req.method === "GET") {
      const user = getUserFromRequest(req, res, true);
      sendJson(res, 200, {
        user: {
          id: user.id,
          email: user.email,
          isAnonymous: Boolean(user.is_anonymous),
        },
      });
      return;
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      const token = parseCookies(req).study_session;
      if (token) database.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      clearSessionCookie(res);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/ranking" && req.method === "GET") {
      const user = getUserFromRequest(req, res, true);
      const period = ["week", "month", "all"].includes(url.searchParams.get("period") || "")
        ? url.searchParams.get("period")
        : "week";
      sendJson(res, 200, await getRanking(user.id, period));
      return;
    }

    if (url.pathname === "/api/ranking" && req.method === "POST") {
      let payload;
      try {
        payload = await readRequestJson(req);
      } catch {
        sendJson(res, 413, { error: "Request body is too large or invalid" });
        return;
      }
      const nickname = String(payload.nickname || "").trim().slice(0, 20);
      if (nickname.length < 2 || typeof payload.optedIn !== "boolean") {
        sendJson(res, 400, { error: "A nickname and participation choice are required" });
        return;
      }
      const user = getUserFromRequest(req, res, true);
      database
        .prepare("INSERT INTO ranking_profiles (user_id, nickname, opted_in, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET nickname = excluded.nickname, opted_in = excluded.opted_in, updated_at = excluded.updated_at")
        .run(user.id, nickname, payload.optedIn ? 1 : 0, new Date().toISOString());
      sendJson(res, 200, await getRanking(user.id, payload.period || "week"));
      return;
    }

    if (url.pathname === "/api/auth/google" && req.method === "POST") {
      let payload;
      try {
        payload = await readRequestJson(req);
      } catch {
        sendJson(res, 413, { error: "Request body is too large or invalid" });
        return;
      }
      if (typeof payload.credential !== "string" || !payload.credential) {
        sendJson(res, 400, { error: "Google credential is required" });
        return;
      }
      await authenticateGoogle(req, res, payload.credential);
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
        sendJson(res, 413, { error: "Request body is too large or invalid" });
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
