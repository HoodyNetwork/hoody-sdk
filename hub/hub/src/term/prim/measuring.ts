// measuring.ts: layout measurements reported by the engine but not yet drawn. A box's onSize (useBoxSize) sets React
// state from the engine's layout; until React commits it, the frame on screen was drawn with the OLD size (Computers
// detail at 120x40: three frames at size null, then the pane's 93 columns). Settling (app/idle.ts idleState) waits
// for zero, so a golden, scenario or test never records that transient. No imports: idle.ts loads before React.
// Never a hang: a debt is paid by the owner's next commit of any kind or its unmount, and one older than
// MEASURE_DEBT_MAX_MS (a component that never commits again: a suspended tree) stops counting.
export const MEASURE_DEBT_MAX_MS = 2000;

let now = (): number => performance.now();
const debts = new Map<number, number>();
let seq = 0;

/** Measurements reported and not yet committed, younger than MEASURE_DEBT_MAX_MS (every settle waits for 0). */
export function measurementsPending(): number {
  const t = now();
  for (const [id, at] of debts) if (t - at > MEASURE_DEBT_MAX_MS) debts.delete(id);
  return debts.size;
}
/** One component now owes a commit of a reported size; returns the debt's id. */
export function oweMeasurement(): number { const id = ++seq; debts.set(id, now()); return id; }
/** That commit happened, or the component unmounted. */
export function paidMeasurement(id: number): void { debts.delete(id); }

/** Tests only: the clock debts are aged on. */
export const __measuringSeams = { setClock(f: (() => number) | null): void { now = f ?? (() => performance.now()); } };
