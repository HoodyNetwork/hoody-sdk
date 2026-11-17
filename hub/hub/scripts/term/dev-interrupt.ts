// dev-interrupt.ts: when dev.ts ends the run on Ctrl+C by itself. Ctrl+C belongs to the Hub (it asks first when
// something is unsaved; a second one leaves), so dev.ts hands every one to it. A Hub that no longer answers must still
// be stoppable: `need` Ctrl+C within `windowMs` end the run whatever the Hub does.
export function hardInterrupt(windowMs = 1500, need = 3, now: () => number = Date.now): () => boolean {
  const at: number[] = [];
  return () => {
    const t = now();
    at.push(t);
    while (at.length && t - at[0]! > windowMs) at.shift();
    return at.length >= need;
  };
}
