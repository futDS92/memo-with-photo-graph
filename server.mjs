import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = __dirname;
const dataDir = join(rootDir, "data");
const statePath = join(dataDir, "state.json");
const port = Number(process.env.PORT || 4180);

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
    { id: "rel-1", fromWordId: "word-orchard", toWordId: "word-tree", type: "hyponym", label: "contains" },
    { id: "rel-2", fromWordId: "word-grove", toWordId: "word-tree", type: "hyponym", label: "made of" },
    { id: "rel-3", fromWordId: "word-orchard", toWordId: "word-farm", type: "part_of", label: "can belong to" },
    { id: "rel-4", fromWordId: "word-orchard", toWordId: "word-bloom", type: "related", label: "seasonal image" },
    { id: "rel-5", fromWordId: "word-grove", toWordId: "word-bloom", type: "related", label: "forest feeling" },
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

async function getState() {
  const existing = await readJsonFile(statePath, null);
  if (
    existing &&
    Array.isArray(existing.words) &&
    Array.isArray(existing.relations) &&
      existing.schemaVersion === 2 && (existing.words.length || existing.relations.length)
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
  await writeFile(statePath, payload, "utf8");
}

function isValidState(state) {
  if (!state || !Array.isArray(state.words) || !Array.isArray(state.relations)) return false;
  const ids = new Set();
  for (const word of state.words) {
    if (!word || typeof word.id !== "string" || typeof word.term !== "string" || typeof word.definition !== "string" || !Array.isArray(word.tags)) return false;
    if (ids.has(word.id)) return false;
    ids.add(word.id);
  }
  const relationIds = new Set();
  return state.relations.every((relation) => relation && typeof relation.id === "string" && !relationIds.has(relation.id) && typeof relation.fromWordId === "string" && typeof relation.toWordId === "string" && ids.has(relation.fromWordId) && ids.has(relation.toWordId) && relationIds.add(relation.id));
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/state" && req.method === "GET") {
      const state = await getState();
      sendJson(res, 200, state);
      return;
    }

    if (url.pathname === "/api/state" && (req.method === "PUT" || req.method === "POST")) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let payload;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        sendJson(res, 400, { error: "Request body must be valid JSON" });
        return;
      }
      if (!isValidState(payload)) {
        sendJson(res, 400, { error: "Invalid state payload" });
        return;
      }
      await writeState(payload);
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
