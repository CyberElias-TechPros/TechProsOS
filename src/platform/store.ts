/** Explicit adapters: fictional browser demo OR server-authoritative live data.
 * Live business data and sessions are never persisted to localStorage.
 */
import { create } from 'zustand';
import type { DataSet } from './types';
import { buildSeed } from './seed';
import { emptyData } from './operations';

export const DB_KEY = 'techpros.db.v4';
export type AppMode = 'demo' | 'live' | 'unconfigured';
const testing = import.meta.env.MODE === 'test';
function loadDemo(): DataSet {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DataSet;
      if (parsed && Object.keys(emptyData()).every(k => k === 'counters' ? !!parsed.counters : Array.isArray((parsed as unknown as Record<string, unknown>)[k]))) return parsed;
    }
  } catch (error) { console.warn('Demo storage could not be read; starting a fresh fictional workspace.', error instanceof Error ? error.name : 'StorageError'); }
  return buildSeed();
}
interface DataStore {
  data: DataSet; mode: AppMode; storageError: string | null; revision: number; serverTime: string | null;
  replaceAll: (next: DataSet) => void;
}
export const useData = create<DataStore>(set => ({
  data: testing ? buildSeed() : emptyData(), mode: testing ? 'demo' : 'unconfigured', storageError: null, revision: 0, serverTime: null,
  replaceAll: data => set(s => s.mode === 'demo' ? { data } : {}),
}));
let persistTimer: ReturnType<typeof setTimeout> | undefined;
export function mutate(fn: (draft: DataSet) => void): void {
  if (useData.getState().mode !== 'demo') throw new Error('Live mutations must use the authenticated API');
  useData.setState(state => { const next = structuredClone(state.data); fn(next); return { data: next }; });
  clearTimeout(persistTimer); persistTimer = setTimeout(persist, 150);
}
export function persist(): boolean {
  if (useData.getState().mode !== 'demo') return false;
  try { localStorage.setItem(DB_KEY, JSON.stringify(useData.getState().data)); useData.setState({ storageError: null }); return true; }
  catch { useData.setState({ storageError: 'Browser storage is unavailable or full. Demo changes are temporary; export your work before leaving.' }); return false; }
}
export function enterDemo(): void {
  clearTimeout(persistTimer); useData.setState({ data: loadDemo(), mode: 'demo', storageError: null }); persist();
}
export function enterLive(data: DataSet, revision = 0, serverTime: string | null = null): void {
  clearTimeout(persistTimer); useData.setState({ data, mode: 'live', storageError: null, revision, serverTime });
}
export function clearClientData(): void {
  clearTimeout(persistTimer); useData.setState({ data: emptyData(), mode: 'unconfigured', storageError: null, revision: 0, serverTime: null });
}
export function resetWorkspaceData(): void {
  if (useData.getState().mode === 'live') throw new Error('Live workspaces cannot be reset from the browser');
  useData.setState({ data: buildSeed(), mode: 'demo' }); persist();
}
export const getData = (): DataSet => useData.getState().data;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persist);
  window.addEventListener('storage', event => {
    if (event.key === DB_KEY && useData.getState().mode === 'demo') useData.setState({ data: loadDemo() });
  });
}
