import type { AppState, RankingResponse } from "../types";
import { seedState } from "../data/seed";
import { storageKeys } from "../types";

const API_STATE_URL = import.meta.env.VITE_API_STATE_URL || "/api/state";
const DB_NAME = "photo-graph";
const DB_VERSION = 1;
const STATE_STORE = "state";
const PENDING_SYNC_KEY = "memo-with-photo-graph.pending-sync";
const DEVICE_ID_KEY = "graphflash.device-id";

function getDeviceId() {
  try {
    const saved = localStorage.getItem(DEVICE_ID_KEY);
    if (saved) return saved;
    const created =
      globalThis.crypto?.randomUUID?.() ||
      `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return "ephemeral-device";
  }
}

function deviceHeaders(headers?: HeadersInit) {
  return { ...(headers || {}), "x-graphflash-device": getDeviceId() };
}
function cloneSeedState(): AppState {
  return {
    ...seedState,
    words: seedState.words.map((word) => ({
      ...word,
      tags: [...word.tags],
      choices: word.choices ? [...word.choices] : undefined,
    })),
    relations: seedState.relations.map((relation) => ({ ...relation })),
  };
}

function isValidState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppState>;
  if (
    candidate.schemaVersion !== 2 ||
    !Array.isArray(candidate.words) ||
    !Array.isArray(candidate.relations)
  )
    return false;
  const ids = new Set<string>();
  for (const word of candidate.words) {
    if (
      !word ||
      typeof word.id !== "string" ||
      typeof word.term !== "string" ||
      typeof word.definition !== "string" ||
      !Array.isArray(word.tags) ||
      ids.has(word.id)
    )
      return false;
    ids.add(word.id);
  }
  return candidate.relations.every(
    (relation) =>
      relation &&
      typeof relation.id === "string" &&
      typeof relation.fromWordId === "string" &&
      typeof relation.toWordId === "string" &&
      ids.has(relation.fromWordId) &&
      ids.has(relation.toWordId),
  );
}

function normalizeState(candidate: AppState): AppState {
  return {
    projects: candidate.projects,
    words: candidate.words,
    relations: candidate.relations,
    reviewLog: Array.isArray(candidate.reviewLog) ? candidate.reviewLog : [],
    updatedAt: candidate.updatedAt || new Date().toISOString(),
    schemaVersion: 2,
  };
}

function openStateDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STATE_STORE)) {
        request.result.createObjectStore(STATE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIndexedState(): Promise<AppState | null> {
  if (!("indexedDB" in window)) return null;
  const db = await openStateDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STATE_STORE, "readonly").objectStore(STATE_STORE).get("current");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function writeIndexedState(state: AppState) {
  if (!("indexedDB" in window)) return;
  const db = await openStateDb();
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STATE_STORE, "readwrite")
      .objectStore(STATE_STORE)
      .put(state, "current");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function loadLocalState(): AppState {
  try {
    const raw = localStorage.getItem(storageKeys.state);
    if (!raw) return cloneSeedState();
    const parsed = JSON.parse(raw);
    if (isValidState(parsed)) {
      return normalizeState(parsed);
    }
  } catch {
    // fall through to seed
  }
  return cloneSeedState();
}

export function saveLocalState(state: AppState) {
  try {
    localStorage.setItem(storageKeys.state, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
  void writeIndexedState(state).catch(() => undefined);
}

function savePendingSync(state: AppState) {
  try {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(state));
  } catch {
    /* local persistence is best effort */
  }
}

function clearPendingSync() {
  try {
    localStorage.removeItem(PENDING_SYNC_KEY);
  } catch {
    /* ignore storage errors */
  }
}

function loadPendingSync(): AppState | null {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isValidState(parsed) ? normalizeState(parsed) : null;
  } catch {
    return null;
  }
}

export async function loadLocalStateAsync(): Promise<AppState> {
  let parsedLocal: unknown = null;
  try {
    const rawLocal = localStorage.getItem(storageKeys.state);
    parsedLocal = rawLocal ? JSON.parse(rawLocal) : null;
  } catch {
    parsedLocal = null;
  }
  const hasValidLocal = isValidState(parsedLocal);
  const localState = hasValidLocal ? loadLocalState() : null;
  const pendingState = loadPendingSync();
  const newestLocal = [localState, pendingState]
    .filter((item): item is AppState => Boolean(item))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
  try {
    const indexedState = await readIndexedState();
    if (isValidState(indexedState)) {
      if (!newestLocal || indexedState.updatedAt >= newestLocal.updatedAt)
        return normalizeState(indexedState);
    }
  } catch {
    // fall back to the synchronous cache
  }
  return newestLocal || loadLocalState();
}

export function loadPersistedView(): string {
  try {
    return localStorage.getItem(storageKeys.view) || "library";
  } catch {
    return "library";
  }
}

export function savePersistedView(view: string) {
  try {
    localStorage.setItem(storageKeys.view, view);
  } catch {
    // ignore storage errors
  }
}

export function loadPersistedWordId(defaultWordId: string): string {
  try {
    return localStorage.getItem(storageKeys.selectedWordId) || defaultWordId;
  } catch {
    return defaultWordId;
  }
}

export function savePersistedWordId(wordId: string) {
  try {
    localStorage.setItem(storageKeys.selectedWordId, wordId);
  } catch {
    // ignore storage errors
  }
}

export function loadPersistedTag(): string {
  try {
    return localStorage.getItem(storageKeys.activeTag) || "all";
  } catch {
    return "all";
  }
}

export function savePersistedTag(tag: string) {
  try {
    localStorage.setItem(storageKeys.activeTag, tag);
  } catch {
    // ignore storage errors
  }
}

export async function hydrateStateFromServer(localState?: AppState): Promise<AppState | null> {
  try {
    const response = await fetch(API_STATE_URL, {
      cache: "no-store",
      credentials: "include",
      headers: deviceHeaders(),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as AppState;
    if (!isValidState(data)) return localState || null;
    const remoteState = normalizeState(data);
    if (localState && localState.updatedAt > remoteState.updatedAt) return localState;
    return remoteState;
  } catch {
    return null;
  }
}

function mergeStates(local: AppState, remote: AppState): AppState {
  const words = new Map(remote.words.map((word) => [word.id, word]));
  local.words.forEach((word) => words.set(word.id, word));
  const projects = new Map((remote.projects || []).map((project) => [project.id, project]));
  (local.projects || []).forEach((project) => projects.set(project.id, project));
  const relations = new Map(remote.relations.map((relation) => [relation.id, relation]));
  local.relations.forEach((relation) => relations.set(relation.id, relation));
  const reviewLog = new Map((remote.reviewLog || []).map((event) => [event.id, event]));
  (local.reviewLog || []).forEach((event) => reviewLog.set(event.id, event));
  return {
    projects: [...projects.values()],
    words: [...words.values()],
    relations: [...relations.values()],
    reviewLog: [...reviewLog.values()].slice(-500),
    updatedAt: new Date().toISOString(),
    schemaVersion: 2,
  };
}

async function putState(state: AppState): Promise<void> {
  const response = await fetch(API_STATE_URL, {
    method: "PUT",
    headers: deviceHeaders({ "content-type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(state),
  });
  if (response.status === 409) {
    const body = (await response.json()) as { state?: AppState };
    if (body.state && isValidState(body.state)) {
      await putState(mergeStates(state, normalizeState(body.state)));
      return;
    }
  }
  if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
}

export async function syncStateToServer(state: AppState): Promise<void> {
  try {
    await putState(state);
    clearPendingSync();
  } catch (error) {
    savePendingSync(state);
    throw error;
  }
}

export async function loadRanking(period: "week" | "month" | "all" = "week"): Promise<RankingResponse> {
  const response = await fetch(`${API_STATE_URL.replace(/\/api\/state$/, "")}/api/ranking?period=${period}`, {
    cache: "no-store",
    credentials: "include",
    headers: deviceHeaders(),
  });
  if (!response.ok) throw new Error(`Ranking failed: ${response.status}`);
  return (await response.json()) as RankingResponse;
}

export async function saveRankingProfile(
  nickname: string,
  optedIn: boolean,
  period: "week" | "month" | "all" = "week",
): Promise<RankingResponse> {
  const response = await fetch(`${API_STATE_URL.replace(/\/api\/state$/, "")}/api/ranking`, {
    method: "POST",
    headers: deviceHeaders({ "content-type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ nickname, optedIn, period }),
  });
  if (!response.ok) throw new Error(`Ranking profile failed: ${response.status}`);
  return (await response.json()) as RankingResponse;
}

export async function authenticateWithGoogle(
  credential: string,
): Promise<{ user: { email: string }; migratedAnonymous: boolean }> {
  const response = await fetch(`${API_STATE_URL.replace(/\/api\/state$/, "")}/api/auth/google`, {
    method: "POST",
    headers: deviceHeaders({ "content-type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ credential }),
  });
  if (!response.ok) throw new Error(`Google authentication failed: ${response.status}`);
  return (await response.json()) as { email: string };
}

export async function clearLocalState(): Promise<void> {
  try {
    localStorage.removeItem(storageKeys.state);
    localStorage.removeItem(PENDING_SYNC_KEY);
  } catch {
    // Continue with IndexedDB cleanup when localStorage is unavailable.
  }
  if (!("indexedDB" in window)) return;
  const db = await openStateDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STATE_STORE, "readwrite").objectStore(STATE_STORE).delete("current");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function logoutFromAccount(): Promise<void> {
  const response = await fetch(`${API_STATE_URL.replace(/\/api\/state$/, "")}/api/auth/logout`, {
    method: "POST",
    headers: deviceHeaders(),
    credentials: "include",
  });
  if (!response.ok) throw new Error(`Logout failed: ${response.status}`);
  await clearLocalState();
}
