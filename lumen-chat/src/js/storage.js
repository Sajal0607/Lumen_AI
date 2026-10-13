// Persists conversations in localStorage so they survive a refresh.
import { sanitizeStoredState } from './conversations.js';

const STORAGE_KEY = 'lumen-chat:state:v1';
const PREFS_KEY = 'lumen-chat:prefs:v1';

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return sanitizeStoredState(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeStoredState(null);
  }
}

/** Returns true on success, false if storage is full or unavailable. */
export function saveState(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ conversations: state.conversations, activeId: state.activeId }));
    return true;
  } catch {
    return false;
  }
}

export function loadPrefs(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage?.getItem(PREFS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs, storage = globalThis.localStorage) {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are optional; ignore storage failures.
  }
}
