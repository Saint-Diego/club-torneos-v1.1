import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/format';

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  setData: (value: T) => void;
  reload: () => Promise<void>;
}

export function useFetch<T>(path: string | null): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent: boolean) => {
      if (path === null) return;
      if (!silent) setLoading(true);
      try {
        setData(await api.get<T>(path));
        setError(null);
      } catch (caught) {
        setError(errorMessage(caught));
      } finally {
        setLoading(false);
      }
    },
    [path],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const reload = useCallback(() => load(true), [load]);

  return { data, loading, error, setData, reload };
}
