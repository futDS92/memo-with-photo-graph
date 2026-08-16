import type { AppState } from "../types";
import { seedState } from "../data/seed";
import { storageKeys } from "../types";

const API_STATE_URL = import.meta.env.VITE_API_STATE_URL || "/api/state";

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

export async function hydrateStateFromServer(): Promise<AppState | null> {
  try {
    const response = await fetch(API_STATE_URL, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as AppState;
    if (!Array.isArray(data.words) || !Array.isArray(data.relations)) return null;
    return {
      words: data.words,
      relations: data.relations,
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
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
