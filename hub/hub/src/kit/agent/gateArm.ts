// gateArm: the terminal approval card's input guard. When a card appears, the keys and clicks already on their way (a
// key typed a moment before into the composer, Enter held down, a click aimed at what was there before) must not answer
// it. For GATE_ARM.ms after the card first draws, its decision controls ignore every press; the card says so in words.
// Pure and engine-free; `now` is a seam so tests drive time.
export const GATE_ARM = {
  /** How long a new card ignores presses. */
  ms: 600,
  now: (): number => Date.now(),
};

/** Whether a card that appeared at `since` takes a press now. */
export const gateArmed = (since: number): boolean => GATE_ARM.now() - since >= GATE_ARM.ms;

/** Tests: set the window (and optionally the clock); returns a function that puts both back. */
export function withGateArm(ms: number, now?: () => number): () => void {
  const was = { ms: GATE_ARM.ms, now: GATE_ARM.now };
  GATE_ARM.ms = ms;
  if (now) GATE_ARM.now = now;
  return () => { GATE_ARM.ms = was.ms; GATE_ARM.now = was.now; };
}
