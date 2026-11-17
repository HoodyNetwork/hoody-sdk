// A "library" for src/term/test/idle.term.test.ts: a file outside hub/src that sets a timer (as React's scheduler or
// TanStack Query do on the Hub's behalf).
export const set = [];
/** @param {() => void} f @param {number} ms */
export function libTimer(f, ms) {
  // Not `return setTimeout(...)`: a strict-mode tail call drops this frame from the stack (JSC proper tail calls).
  const id = setTimeout(f, ms);
  set.push(id);
  return id;
}
