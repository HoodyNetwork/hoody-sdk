// The trimmed embed catalogue, loaded once on first use (lazy chunk). null until it arrives; a failed load is tried
// again on the next mount (loadCatalog forgets a failure).
import { useEffect, useState } from 'react';
import { loadCatalog, type Catalog } from '../embed/catalog';

let loaded: Catalog | null = null;

export function useCatalog(): Catalog | null {
  const [cat, setCat] = useState<Catalog | null>(loaded);
  useEffect(() => {
    if (cat) return;
    let live = true;
    loadCatalog().then((c) => { loaded = c; if (live) setCat(c); }, () => undefined);
    return () => { live = false; };
  }, [cat]);
  return cat;
}
