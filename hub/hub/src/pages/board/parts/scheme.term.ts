// Terminal sibling of scheme.ts: a terminal has no <html data-hx-theme> to read or watch, and draws no Board frame
// whose palette would follow it. The look is the web reader's own no-document answer (its server snapshot), fixed.
export type HubScheme = 'light' | 'dark';

export function useHubScheme(): HubScheme {
  return 'light';
}
