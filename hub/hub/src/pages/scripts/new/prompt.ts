// The New script prompt: the person's description first, verbatim, then the
// Hub's block after a blank line. The block is what a reload rebuilds the draft's settings from, so it must read back exactly:
//
//   <description>
//
//   [Hoody New script v1]
//   Length: <the description's length in UTF-16 units>
//   Address: /monday-at-9
//   Runs: on the schedule 0 8 * * 1 (UTC)        ← or "Runs: only when its address is called"
//   Exec folder: 3                               ← only when not 1
//   Fix:                                         ← only for "Ask the assistant to fix it"; everything after it is the repair
//
// The marker is the first line equal to MARKER that follows a blank line. A description line that would read as the marker
// (MARKER after any run of spaces) gets one more leading space before sending, and one is taken off when reading back, so the
// description round-trips exactly and the first marker is always the Hub's. Length proves the cut: a description that does not
// have that length is not the one sent. Only the stored attempt's own user prompt is parsed (never an assistant echo); anything
// that is not exactly this shape is malformed, and the flow asks the person to confirm the settings instead (the raw block is
// never shown).
import { EXEC_DEFAULT, EXEC_MAX } from '@core';
import { addressOk, extract, type ExtractError } from '../logic';
import { detectLiterals, mask, unmask, type Masked } from '../secrets';

export const MARKER = '[Hoody New script v1]';
const MARKERISH = /^ *\[Hoody New script v1\]$/;
const SCHEDULE = /^[0-9*,/-]+(?: [0-9*,/A-Za-z-]+){4}$/;
const ON_CALL = 'only when its address is called';

export interface PromptBlock {
  address: string;
  /** Five-field cron, UTC; null = only when its address is called. */
  schedule: string | null;
  exec: number;
  /** "Ask the assistant to fix it": the problems and the current code (already masked by the caller). Never parsed back. */
  fix?: { problems: readonly string[]; code: string };
}

const escapeLine = (l: string): string => (MARKERISH.test(l) ? ` ${l}` : l);
const unescapeLine = (l: string): string => (/^ +\[Hoody New script v1\]$/.test(l) ? l.slice(1) : l);

export type BuildPrompt = { ok: true; text: string } | { ok: false; why: 'address' | 'schedule' | 'exec' };

export function buildPrompt(description: string, block: PromptBlock): BuildPrompt {
  if (!addressOk(block.address)) return { ok: false, why: 'address' };
  if (block.schedule !== null && !SCHEDULE.test(block.schedule)) return { ok: false, why: 'schedule' };
  if (!Number.isInteger(block.exec) || block.exec < EXEC_DEFAULT || block.exec > EXEC_MAX) return { ok: false, why: 'exec' };
  const desc = description.replace(/\r\n?/g, '\n').split('\n').map(escapeLine).join('\n');
  const lines = [
    MARKER,
    `Length: ${desc.length}`,
    `Address: ${block.address}`,
    `Runs: ${block.schedule === null ? ON_CALL : `on the schedule ${block.schedule} (UTC)`}`,
    ...(block.exec !== EXEC_DEFAULT ? [`Exec folder: ${block.exec}`] : []),
  ];
  if (block.fix) lines.push('Fix:', ...block.fix.problems.map((p) => `- ${p.replace(/\r?\n/g, ' ')}`), 'Current code:', '```ts', block.fix.code, '```');
  return { ok: true, text: `${desc}\n\n${lines.join('\n')}` };
}

export type Parsed =
  | { ok: true; description: string; block: Omit<PromptBlock, 'fix'>; fix: boolean }
  /** Not the Hub's shape. `description` is kept only when the cut itself was proven (the block after it is what failed). */
  | { ok: false; description: string | null };

export function parsePrompt(userPrompt: unknown): Parsed {
  if (typeof userPrompt !== 'string') return { ok: false, description: null };
  const lines = userPrompt.replace(/\r\n?/g, '\n').split('\n');
  let at = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i] === MARKER && lines[i - 1] === '') { at = i; break; }
  if (at < 1) return { ok: false, description: null };
  const sent = lines.slice(0, at - 1).join('\n');
  const rest = lines.slice(at + 1);
  const fields = new Map<string, string>();
  let fix = false;
  for (const l of rest) {
    if (l === 'Fix:') { fix = true; break; }
    const m = /^(Length|Address|Runs|Exec folder): (.+)$/.exec(l);
    if (!m || fields.has(m[1]!)) return { ok: false, description: null };
    fields.set(m[1]!, m[2]!);
  }
  const len = fields.get('Length');
  if (len === undefined || !/^\d{1,7}$/.test(len) || Number(len) !== sent.length) return { ok: false, description: null };
  const description = sent.split('\n').map(unescapeLine).join('\n');
  const address = fields.get('Address');
  const runs = fields.get('Runs');
  const execText = fields.get('Exec folder');
  if (address === undefined || !addressOk(address) || runs === undefined) return { ok: false, description };
  let schedule: string | null;
  if (runs === ON_CALL) schedule = null;
  else {
    const s = /^on the schedule (.+) \(UTC\)$/.exec(runs);
    if (!s || !SCHEDULE.test(s[1]!)) return { ok: false, description };
    schedule = s[1]!;
  }
  let exec = EXEC_DEFAULT;
  if (execText !== undefined) {
    if (!/^\d{1,4}$/.test(execText)) return { ok: false, description };
    exec = Number(execText);
    // Written only for a folder other than 1, and only a real one: 0, 1 or past EXEC_MAX is not the Hub's block.
    if (exec <= EXEC_DEFAULT || exec > EXEC_MAX) return { ok: false, description };
  }
  return { ok: true, description, block: { address, schedule, exec }, fix };
}

// ── "Ask the assistant to fix it": the AiDrawer's masking, bound to the attempt ──────────────────────────────────────────

export type SecretMap = Masked['map'];

/**
 * The repair block of a fix attempt: the current code AND the problems with every literal secret masked (secrets.ts mask, as
 * AiDrawer does), masked together so one secret has one placeholder wherever it is quoted (a diagnostic may quote a literal
 * of the code), and the map that puts them back. The map is held in memory for that attempt only (BuildApi start's `values`);
 * it is never stored. 'placeholder': the text already holds a placeholder-like text, so a mask could not be told apart from it.
 */
const PART = '\n\u0000\n';
export function repairOf(code: string, problems: readonly string[]): { fix: NonNullable<PromptBlock['fix']>; map: SecretMap } | { error: 'placeholder' } {
  const parts = [code, ...problems];
  if (parts.some((p) => p.includes('\u0000'))) return { error: 'placeholder' };
  const whole = parts.join(PART);
  const m = mask(whole, detectLiterals(whole));
  if ('error' in m) return { error: 'placeholder' };
  const back = m.text.split(PART);
  if (back.length !== parts.length) return { error: 'placeholder' };
  return { fix: { problems: back.slice(1), code: back[0]! }, map: m.map };
}

export type Repaired = { ok: true; code: string; summary: string; warn: 'vanished' | 'duplicated' | null } | { ok: false; why: 'map_lost' | 'unknown_placeholder' | ExtractError };

/**
 * A fix attempt's answer put back together. Without the attempt's own map (another tab's attempt, one from before a reload)
 * it is never applied ('map_lost'); a placeholder the map does not know stays unresolved, so nothing is applied either: an
 * unresolved placeholder never reaches Check or Make it live. A plain build (no fix) passes `map` null and `fix` false.
 */
export function answerCode(reply: string, o: { fix: boolean; map: SecretMap | null | undefined }): Repaired {
  if (o.fix && !o.map) return { ok: false, why: 'map_lost' };
  const S = o.map ? o.map.map((e) => e.value) : undefined;
  const x = extract(reply, true, S);
  if ('error' in x) return { ok: false, why: x.error };
  const u = unmask(x.code, o.map ?? []);
  if (u.unknown.length > 0) return { ok: false, why: 'unknown_placeholder' };
  return { ok: true, code: u.text, summary: x.summary, warn: u.vanished.length ? 'vanished' : u.duplicated.length ? 'duplicated' : null };
}
