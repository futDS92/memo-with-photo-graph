import type { AppState } from "../types";
import { seedState } from "../data/seed";
import { storageKeys } from "../types";

const API_STATE_URL = import.meta.env.VITE_API_STATE_URL || "/api/state";
const DB_NAME = "photo-graph";
const DB_VERSION = 1;
const STATE_STORE = "state";
const PENDING_SYNC_KEY = "memo-with-photo-graph.pending-sync";
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
      return {
        projects: parsed.projects,
        words: parsed.words,
        relations: parsed.relations,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        schemaVersion: 2,
      };
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
  try {
    const indexedState = await readIndexedState();
    if (isValidState(indexedState)) {
      if (!localState || indexedState.updatedAt >= localState.updatedAt) return indexedState;
    }
  } catch {
    // fall back to the synchronous cache
  }
  return localState || loadLocalState();
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
    const response = await fetch(API_STATE_URL, { cache: "no-store", credentials: "include" });
    if (!response.ok) return null;
    const data = (await response.json()) as AppState;
    if (!isValidState(data)) return localState || null;
    const remoteState = {
      projects: data.projects,
      words: data.words,
      relations: data.relations,
      updatedAt: data.updatedAt || new Date().toISOString(),
      schemaVersion: 2,
    };
    if (localState && localState.updatedAt > remoteState.updatedAt) return localState;
    return remoteState;
  } catch {
    return null;
  }
}

export async function syncStateToServer(state: AppState): Promise<void> {
  try {
    const response = await fetch(API_STATE_URL, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        projects: state.projects,
        words: state.words,
        relations: state.relations,
        updatedAt: state.updatedAt,
      }),
    });
    if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
    clearPendingSync();
  } catch (error) {
    savePendingSync(state);
    throw error;
  }
}
