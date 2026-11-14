/**
 * Platform store — the reactive dataset backing the workspace.
 * Persisted to localStorage under a versioned key; a schema bump re-seeds.
 * In production this same contract is served by the API (Workers + D1).
 */
import { create } from 'zustand';
import type { DataSet } from './types';
import { buildSeed } from './seed';

export const DB_KEY = 'techpros.db.v3';
export const SESSION_KEY = 'techpros.session.v1';

function load(): DataSet {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DataSet;
      if (parsed && Array.isArray(parsed.tenants) && Array.isArray(parsed.tickets)) return parsed;
    }
  } catch {
    // corrupt storage → reseed cleanly
  }
  return buildSeed();
}

interface DataStore {
  data: DataSet;
  /** Replace the whole dataset (used by import/reset). */
  replaceAll: (next: DataSet) => void;
  /** Reserved for store-driven sessions. */
}

export const useData = create<DataStore>(() => ({ data: load(), replaceAll: () => undefined }));

let persistTimer: ReturnType<typeof setTimeout> | undefined;

/** Apply a mutation to the dataset, persist, and notify subscribers. */
export function mutate(fn: (draft: DataSet) => void): void {
  useData.setState(state => {
    const next = structuredClone(state.data);
    fn(next);
    return { data: next };
  });
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 250);
}

export function persist(): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(useData.getState().data));
  } catch {
    // storage full or unavailable — the in-memory copy remains authoritative for the session
  }
}

export function resetWorkspaceData(): void {
  localStorage.removeItem(DB_KEY);
  useData.setState({ data: buildSeed() });
  persist();
}

export const getData = (): DataSet => useData.getState().data;
