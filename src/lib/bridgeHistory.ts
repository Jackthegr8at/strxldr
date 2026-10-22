import type { BridgeAction } from './types.ts';
export const FETCH_LIMIT = 300;
export const PAGE_SIZE = 30;
export function actionIdentity(action: BridgeAction): string {
  return action.global_sequence != null ? `sequence:${action.global_sequence}` : JSON.stringify([action.trx_id, action.timestamp || action['@timestamp'], action.act.name, action.act.data.from, action.act.data.to, action.act.data.quantity, action.act.data.memo]);
}
export function mergePages(pages: Map<number, BridgeAction[]>): BridgeAction[] {
  const seen = new Set<string>();
  return [...pages.entries()].sort(([a], [b]) => a - b).flatMap(([, rows]) => rows).filter(action => {
    const id = actionIdentity(action);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
export function filterActions(actions: BridgeAction[], username: string | null, search = ''): BridgeAction[] {
  const query = search.toLowerCase();
  return actions.filter(a => !a.act.data.memo.includes('Cross-chain wrap fee') && (!username || a.act.data.from === username || a.act.data.to === username) && (!query || a.act.data.from.toLowerCase().includes(query) || a.act.data.to.toLowerCase().includes(query)));
}
export const isExhausted = (rows: BridgeAction[]) => rows.length < FETCH_LIMIT;
export const pageCount = (count: number) => Math.max(1, Math.ceil(count / PAGE_SIZE));
