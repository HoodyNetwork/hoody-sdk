// wait-text.ts: a shot's `waitForText` must be on the terminal frame. The web shot waits for
// that text before it is taken; the terminal gate draws the same path and state, so a frame that lacks the text shows
// something else under the shot's name. Judged at the largest golden size (120x40; at 80x24 the text may sit below
// the fold of a page that scrolls), whitespace collapsed on both sides.
// An ACTING shot (click, keys, act) is judged on the frame BEFORE its replayed steps, as the web runner does
// (scripts/shots.spec.ts: it waits for the text, then clicks): the text names the screen the action starts from
// (account's "Save name" is the button the shot presses; the screen after it no longer has it). Judging the frame
// after the action failed 14 correct account frames. The frame after the action is held by `shot-action-noop`
// instead: an acting shot whose steps change nothing shows the page before the action under the action's name.
// The gate WAITS for the text at every size before it takes the frame (awaitText; an acting shot: before its steps),
// as the web shot does: a page is idle for a moment between two reads, and a frame taken there is the loading screen
// under the shot's name (ai shot-instructions at 80x24, about 1 first draw in 30 on a loaded host). A text
// that never comes fails the shot at that size (`shot-wait-text`) and its frame is not stored or compared, unless the
// miss is listed debt. Below 120x40 the text may sit under the fold, so there the semantics tree counts too
// (waitShown); the tree holds what a scroll clips.
// Debt: `waitTextDebt` in the page's allowance.json, rows { case, text, owner, reason }.
// A NEW miss fails (`shot-wait-text`); a listed row that no longer misses fails too
// (`wait-text-debt-stale`) until `check.ts --page <id> --update` drops it; --update never adds a row.

export interface WaitDebt { case: string; text: string; owner: string; reason: string }
export interface WaitHit { case: string; text: string; file: string; /** The size it missed at (default WAIT_SIZE). */ size?: string }
export interface WaitProblem { file: string; rule: string; message: string; fix: string }

/** The size a wait text is judged at. */
export const WAIT_SIZE: readonly [number, number] = [120, 40];

const flat = (s: string): string => s.replace(/\s+/g, ' ').trim();
/** A wait text is read without regard to case: the kit draws some labels in capitals (a Verdict's "WHAT YOU GET")
 *  that the web capitalises in CSS, so the web's own text still reads "What you get". For wait texts only; a secret
 *  needle is never compared this way (secrets.ts hitOf). */
const fold = (s: string): string => flat(s).toLowerCase();
const VBAR = /[│┃║╎╏┆┇┊┋▏▕]/;
/** Columns where a vertical border runs at least two rows down (the shell's nav edge, a card's sides). */
function cutsOf(rows: readonly string[][]): number[] {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const cuts: number[] = [];
  for (let x = 0; x < width; x++) {
    for (let y = 0; y + 1 < rows.length; y++) if (VBAR.test(rows[y]![x] ?? '') && VBAR.test(rows[y + 1]![x] ?? '')) { cuts.push(x); break; }
  }
  return cuts;
}
/**
 * Whether `frame` shows `text` (whitespace runs, line ends included, count as one space; case is not compared). Text that wraps inside a
 * region (the page beside the nav column, a card) is read in that region: the frame row by row, and also every strip
 * between two border columns (cutsOf), so the nav's words never fall between the two halves of a wrapped line.
 */
export function frameShows(frame: string, text: string): boolean {
  const want = fold(text);
  if (fold(frame).includes(want)) return true;
  const rows = frame.split('\n').map((l) => Array.from(l));
  const cuts = cutsOf(rows);
  const edges = [-1, ...cuts, Math.max(0, ...rows.map((r) => r.length))];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const strip = rows.map((r) => r.slice(edges[i]! + 1, edges[j]!).join('')).join('\n');
      if (fold(strip).includes(want)) return true;
    }
  }
  return false;
}

/** How long the gate waits for a shot's wait text after the page first settled (ms). */
export const WAIT_MS = 3000;
/** Whether the page shows a wait text: on the frame; `tree` (semText of the page, sizes below WAIT_SIZE) counts too. */
export const waitShown = (frame: string, tree: string | null, text: string): boolean => frameShows(frame, text) || (tree !== null && fold(tree).includes(fold(text)));
/** Waits until `shown()` (checked after each further settle), at most `ms`. False: the text never came. */
export async function awaitText(s: { settle(): Promise<unknown> }, shown: () => boolean, o: { ms?: number; stepMs?: number } = {}): Promise<boolean> {
  if (shown()) return true;
  const until = performance.now() + (o.ms ?? WAIT_MS);
  while (performance.now() < until) {
    await new Promise<void>((r) => setTimeout(r, o.stepMs ?? 50));
    await s.settle();
    if (shown()) return true;
  }
  return false;
}
/** Whether a miss is listed debt (its frame is still stored). */
export const debtListed = (debt: readonly unknown[], c: string, text: string): boolean => debt.some((r) => wellFormed(r) && key(r.case, r.text) === key(c, text));

/** Whether a shot's steps act: a click, typed text or a key. A hover or a waitFor alone changes nothing by itself. */
export const stepsAct = (steps: readonly object[]): boolean => steps.some((x) => 'click' in x || 'fill' in x || 'press' in x);
/**
 * shot-action-noop: an acting shot whose replayed steps left the page as it was (the same drawn text and the same
 * semantics tree: a focus or selection that moved counts as a change). `before` and `after` are frame + tree text.
 * A shot that expects no change (a press the page must ignore) says so: `noChange: true`.
 */
export const actionNoop = (c: { steps?: readonly object[]; noChange?: boolean }, before: string | null, after: string): boolean =>
  !!c.steps?.length && stepsAct(c.steps) && !c.noChange && before !== null && before === after;

const key = (c: string, t: string): string => `${c}\u0000${flat(t)}`;
const wellFormed = (r: unknown): r is WaitDebt => !!r && typeof r === 'object' && ['case', 'text', 'owner', 'reason'].every((k) => typeof (r as Record<string, unknown>)[k] === 'string' && ((r as Record<string, string>)[k] ?? '').trim() !== '');

/**
 * Problems of one page run. `hits`: the misses of this run; `judged`: every case whose wait text was judged (drawn at
 * WAIT_SIZE); `debt`: the stored rows. `complete`: the run drew every case (a crash leaves the debt alone).
 * `kept`: the rows to store after an --update (stored rows still missing; never a new one).
 */
export function waitTextProblems(page: string, file: string, hits: readonly WaitHit[], judged: ReadonlySet<string>, debt: readonly unknown[], o: { complete: boolean; update: boolean }): { problems: WaitProblem[]; kept: WaitDebt[] } {
  const problems: WaitProblem[] = [];
  const rows = debt.filter(wellFormed);
  if (rows.length !== debt.length) problems.push({ file, rule: 'wait-text-debt-malformed', message: `page "${page}" waitTextDebt rows must be { case, text, owner, reason }, each non-empty (${debt.length - rows.length} are not)`, fix: 'Correct the rows (scripts/term/wait-text.ts).' });
  const listed = new Map(rows.map((r) => [key(r.case, r.text), r]));
  const missed = new Set(hits.map((h) => key(h.case, h.text)));
  for (const h of hits) {
    if (listed.has(key(h.case, h.text))) continue;
    problems.push({ file: h.file, rule: 'shot-wait-text', message: `"${page}" shot "${h.case}" at ${h.size ?? WAIT_SIZE.join('x')}: the frame does not show its waitForText "${h.text}"`, fix: 'The shot names a state the terminal does not draw: make the terminal sibling show that text (the same words as the web), or correct the shot\'s waitForText if the web changed. Never list a new miss as debt.' });
  }
  const kept: WaitDebt[] = [];
  for (const r of rows) {
    const k = key(r.case, r.text);
    if (missed.has(k)) { kept.push(r); continue; }
    // Not missed: fixed (judged and shown), or its case is gone. Only a complete run says so.
    if (!o.complete) { kept.push(r); continue; }
    if (!o.update) problems.push({ file, rule: 'wait-text-debt-stale', message: `page "${page}": listed wait-text debt no longer misses: shot "${r.case}" "${r.text}" (${judged.has(r.case) ? 'the frame shows it now' : 'no such shot any more'}; owner ${r.owner})`, fix: `\`bun scripts/term/check.ts --page ${page} --update\` drops the row (the list only shrinks).` });
  }
  return { problems, kept };
}
