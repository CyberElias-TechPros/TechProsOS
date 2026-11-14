/** Lookup helpers shared by workspace pages — resolve IDs to display names. */
import type { DataSet, ID } from '../../platform/types';

export const userName = (d: DataSet, id?: ID): string => (id ? d.users.find(u => u.id === id)?.name ?? '—' : '—');
export const branchName = (d: DataSet, id?: ID): string => (id ? d.branches.find(b => b.id === id)?.name ?? '—' : '—');
export const assetLabel = (d: DataSet, id?: ID): string => {
  const a = id ? d.assets.find(x => x.id === id) : undefined;
  return a ? `${a.tag} · ${a.name}` : '—';
};

