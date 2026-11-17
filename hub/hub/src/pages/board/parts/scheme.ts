// The Hub's light or dark look, as the shell sets it on <html data-hx-theme> (kit/tokens.css). The Board reads it to
// give terminal and agent tiles the matching Hoody palette by default; a change re-renders the reader.
import { useSyncExternalStore } from 'react';

export type HubScheme = 'light' | 'dark';

const read = (): HubScheme => (typeof document !== 'undefined' && document.documentElement.getAttribute('data-hx-theme') === 'dark' ? 'dark' : 'light');

function subscribe(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => undefined;
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hx-theme'] });
  return () => mo.disconnect();
}

export function useHubScheme(): HubScheme {
  return useSyncExternalStore(subscribe, read, () => 'light');
}
