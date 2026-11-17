// The chat app's owner as shown in sentences. Its own module (no CSS) so the terminal's Setup step (ChatSetup.tsx)
// reads it without reaching ChatFlow.tsx, which is web-only (pane.module.css).
import type { Channel } from '../data';

export const ownerName = (c: Channel): string => {
  const o = c.principals.find((p) => p.owner);
  return o ? o.name || o.platformUser : '';
};
