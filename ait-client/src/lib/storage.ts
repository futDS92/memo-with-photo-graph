import type { AppState } from "../types";
import { seedState } from "../data/seed";
import { storageKeys } from "../types";

const API_STATE_URL = import.meta.env.VITE_API_STATE_URL || "/api/state";
const DB_NAME = "photo-graph";
const DB_VERSION = 1;
const STATE_STORE = "state";

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
    const request = db.transaction(STATE_STORE, "readwrite").objectStore(STATE_STORE).put(state, "current");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function loadLocalState(): AppState {
  try {
    const raw = localStorage.getItem(storageKeys.state);
    if (!raw) return structuredClone(seedState);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.words) && Array.isArray(parsed?.relations)) {
      return {
        words: parsed.words,
        relations: parsed.relations,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // fall through to seed
  }
  return structuredClone(seedState);
}

export function saveLocalState(state: AppState) {
  try {
    localStorage.setItem(storageKeys.state, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
  void writeIndexedState(state).catch(() => undefined);
}

export async function loadLocalStateAsync(): Promise<AppState> {
  try {
    const indexedState = await readIndexedState();
    if (indexedState && Array.isArray(indexedState.words) && Array.isArray(indexedState.relations)) {
      return indexedState;
    }
  } catch {
    // fall back to the synchronous cache
  }
  return loadLocalState();
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
    const response = await fetch(API_STATE_URL, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as AppState;
    if (!Array.isArray(data.words) || !Array.isArray(data.relations)) return null;
    const remoteState = {
      words: data.words,
      relations: data.relations,
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
    if (localState && localState.updatedAt > remoteState.updatedAt) return localState;
    return remoteState;
  } catch {
    return null;
  }
}

export async function syncStateToServer(state: AppState): Promise<void> {
  await fetch(API_STATE_URL, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      words: state.words,
      relations: state.relations,
      updatedAt: state.updatedAt,
    }),
  });
}
