// What this page sent for the open gate, held by the Bot pane. The card is drawn at the end of the
// thread on the Activity tab and above the tabs on the others, so a tab change remounts it: the decision it sent lives
// above it, and a remount never offers a second send (C9).
import { useState } from 'react';
import type { GateSent } from '../model-adapters';

/**
 * The decision sent for one Bot's one gate (`gateKey`: id and generation; '' for none). It ends with its gate: another Bot,
 * or a read of this Bot (`read`) that shows another gate or none, drops it, so a later gate that reuses the id (a reset Bot
 * session counts from 1 again) starts unsent. A Bot not read yet (loading) keeps it.
 */
export function useGateSent(botKey: string, gateKey: string, read: boolean): [GateSent | null, (v: GateSent) => void] {
  const key = gateKey ? `${botKey}\n${gateKey}` : '';
  const [sent, setSent] = useState<{ key: string; v: GateSent | null }>({ key: '', v: null });
  if (sent.key !== '' && sent.key !== key && (read || !sent.key.startsWith(`${botKey}\n`))) setSent({ key: '', v: null });
  return [key !== '' && sent.key === key ? sent.v : null, (v) => setSent({ key, v })];
}
