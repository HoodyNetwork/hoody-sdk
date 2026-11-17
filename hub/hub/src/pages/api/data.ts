// The API page's one read: the catalog chunk (catalog.ts loadCatalog), loaded once per page life. No request to the
// API: the catalog ships with the Hub.
import { useCallback, useEffect, useState } from 'react';
import { loadCatalog, type Catalog } from './catalog';

export interface CatalogRead {
  /** undefined while it loads, or after it failed. */
  readonly catalog: Catalog | undefined;
  readonly failed: unknown;
  readonly retry: () => void;
}

export function useCatalog(load: () => Promise<Catalog> = loadCatalog): CatalogRead {
  const [state, setState] = useState<{ catalog?: Catalog; failed?: unknown }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    load().then(
      (catalog) => live && setState({ catalog }),
      (failed: unknown) => live && setState({ failed: failed ?? new Error('catalog') }),
    );
    return () => { live = false; };
  }, [load, attempt]);
  const retry = useCallback(() => { setState({}); setAttempt((n) => n + 1); }, []);
  return { catalog: state.catalog, failed: state.failed, retry };
}
