import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { fetchHistoryActions, getXprEndpoint } from '../lib/api';
import { bridgeHistoryKey } from '../lib/queryKeys';
import { FETCH_LIMIT, PAGE_SIZE, filterActions, isExhausted, mergePages, pageCount } from '../lib/bridgeHistory';
import type { ActionResponse, BridgeAction } from '../lib/types';
export { FETCH_LIMIT, PAGE_SIZE };
export const HEAD_REFRESH_MS = 120000;
export function useBridgeHistory(username: string | null, search = '') {
  const identity = `${username ?? ''}\n${search}`;
  const [state, setState] = useState({
    identity,
    page: 1,
    pending: false,
    error: null as unknown,
    continuation: false,
    revision: 0
  });
  const session = useRef({
    identity,
    pages: new Map<number, BridgeAction[]>(),
    cursor: 300,
    ended: false,
    controller: null as AbortController | null,
    failed: null as number | null,
    target: 1
  });
  if (session.current.identity.split('\n')[0] !== (username ?? '')) {
    session.current.controller?.abort();
    session.current = {
      identity,
      pages: new Map(),
      cursor: 300,
      ended: false,
      controller: null,
      failed: null,
      target: 1
    };
  }
  const current = session.current;
  const viewIdentity = useRef(identity);
  viewIdentity.current = identity;
  const publish = (patch: Partial<typeof state> = {}) => {
    if (session.current === current && viewIdentity.current === identity) setState(prev => ({
      ...prev,
      ...(prev.identity === identity ? {} : {
        page: 1,
        error: null,
        pending: false,
        continuation: false
      }),
      ...patch,
      identity,
      revision: prev.revision + 1
    }));
  };
  const head = useSWR<ActionResponse>(bridgeHistoryKey(getXprEndpoint(), 'bridge.strx', 0, FETCH_LIMIT), () => fetchHistoryActions({
    limit: FETCH_LIMIT,
    'act.name': 'transfer',
    skip: 0
  }, 'bridge.strx'), {
    refreshInterval: HEAD_REFRESH_MS,
    keepPreviousData: false
  });
  useEffect(() => {
    if (head.data) {
      const previousHead = current.pages.get(0) ?? [];
      current.pages.set(0, mergePages(new Map([[0, head.data.actions], [1, previousHead]])));
      if (current.pages.size === 1) current.ended = isExhausted(head.data.actions);
      publish();
    }
  }, [head.data, identity]);
  useEffect(() => {
    current.controller?.abort();
    current.controller = null;
    current.failed = null;
    publish({
      page: 1,
      pending: false,
      error: null,
      continuation: false
    });
    return () => {
      current.controller?.abort();
    };
  }, [identity]);
  const matching = useMemo(() => filterActions(mergePages(current.pages), username, search), [state.revision, identity, head.data]);
  const page = state.identity === identity ? Math.min(state.page, pageCount(matching.length)) : 1;
  const scan = async (retry = false) => {
    if (current.controller || !current.pages.has(0)) return;
    const controller = new AbortController();
    current.controller = controller;
    const target = retry ? current.target : matching.length === 0 ? 1 : page + 1;
    current.target = target;
    publish({
      pending: true,
      error: null,
      continuation: false
    });
    let emptyPages = 0;
    try {
      while (!controller.signal.aborted && !current.ended && filterActions(mergePages(current.pages), username, search).length < target * PAGE_SIZE) {
        const offset = current.failed ?? current.cursor;
        current.failed = offset;
        const result = await fetchHistoryActions({
          limit: FETCH_LIMIT,
          'act.name': 'transfer',
          skip: offset
        }, 'bridge.strx', {
          signal: controller.signal
        });
        if (controller.signal.aborted || session.current !== current) return;
        current.pages.set(offset, result.actions);
        current.failed = null;
        current.cursor = offset + FETCH_LIMIT;
        current.ended = isExhausted(result.actions);
        emptyPages = filterActions(result.actions, username, search).length === 0 ? emptyPages + 1 : 0;
        publish();
        if (emptyPages >= 5 && !current.ended) {
          publish({
            continuation: true
          });
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      publish({
        page: Math.min(target, pageCount(filterActions(mergePages(current.pages), username, search).length))
      });
    } catch (error) {
      if (!controller.signal.aborted) publish({
        error
      });
    } finally {
      if (current.controller === controller) {
        current.controller = null;
        publish({
          pending: false
        });
      }
    }
  };
  return {
    actions: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    page,
    pageCount: pageCount(matching.length),
    isPending: state.identity === identity && state.pending || head.isLoading,
    error: state.identity === identity && state.error || head.error,
    hasOlder: !current.ended,
    continueSearching: state.identity === identity && state.continuation,
    next: () => {
      if (page < pageCount(matching.length) && (current.ended || matching.length >= (page + 1) * PAGE_SIZE)) publish({
        page: page + 1
      });else void scan();
    },
    previous: () => publish({
      page: Math.max(1, page - 1)
    }),
    first: () => publish({
      page: 1
    }),
    lastLoaded: () => publish({
      page: pageCount(matching.length)
    }),
    retry: () => {
      if (current.failed !== null) void scan(true);else void head.mutate();
    }
  };
}
