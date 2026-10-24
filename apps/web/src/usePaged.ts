import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from './api';

export function usePaged<T extends { id: string }>(fetchPage: (offset: number, signal: AbortSignal) => Promise<Page<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const next = useRef(0), failedOffset = useRef(0), controller = useRef<AbortController | null>(null);
  const load = useCallback(async (offset: number) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError(''); failedOffset.current = offset;
    try {
      const page = await fetchPage(offset, request.signal);
      if (request.signal.aborted) return;
      setItems(previous => Array.from(new Map((offset === 0 ? page.items : [...previous, ...page.items]).map(item => [item.id, item])).values()));
      next.current = page.nextOffset; setHasMore(page.hasMore);
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : 'No pudimos cargar la información.');
    } finally { if (!request.signal.aborted) setLoading(false); }
  }, [fetchPage]);
  useEffect(() => {
    setItems([]); setHasMore(false); next.current = 0; void load(0);
    return () => controller.current?.abort();
  }, [load]);
  return { items, loading, error, hasMore, refresh: () => load(0), more: () => load(next.current), retry: () => load(failedOffset.current) };
}
