import { useCallback, useEffect, useState } from "react";

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
}

export function useAsync<T>(fn: () => Promise<T>): AsyncState<T> & { refresh: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: undefined,
    loading: true,
    error: undefined,
  });

  const refresh = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: undefined }));
    fn()
      .then((data) => setState({ data, loading: false, error: undefined }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        setState({ data: undefined, loading: false, error: new Error(message) });
      });
  }, [fn]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
