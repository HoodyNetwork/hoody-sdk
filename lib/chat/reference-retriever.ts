/**
 * reference-retriever — lexical keyword match against the compacted CLI
 * reference, for injection into the system prompt.
 *
 * Strategy (NOT semantic retrieval — documented as lexical heuristic):
 *   1. Tokenize the user message: lowercase, split on non-word, drop
 *      stopwords, drop ≤1-char tokens.
 *   2. For every (group, command) pair, compute a score:
 *        + 3 if a user token matches the group name or any group alias exactly.
 *        + 2 per substring match of the command path against a user token.
 *        + 1 per keyword match in the command summary.
 *   3. Sort commands by score desc, pack into the token budget.
 *   4. ALWAYS prefix with the full group one-line index regardless of
 *      score, so the model never misses an entire group just because
 *      scoring surfaced the wrong keyword.
 *
 * Token estimation is a chars/4 heuristic — documented worst-case 1.8× inflation
 * for CJK/emoji-heavy messages. We rely on the provider's max_tokens cap and
 * the 60s stream timeout to bound cost, not on precise token accounting.
 */

import type { CliReference, RefCommand, RefGroup } from './ai-cli-reference.generated.js';

export interface RetrievalOptions {
  userMessage: string;
  reference: CliReference;
  /** Total budget for the retrieval block in tokens. Index costs a floor. */
  budgetTokens: number;
}

export interface RetrievalResult {
  /** Rendered markdown block to append to the system prompt. */
  text: string;
  /** Rough token count (chars/4). */
  approxTokens: number;
  /** Commands that made it into the packed detail section. */
  selectedCommands: RefCommand[];
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'does', 'for', 'from',
  'have', 'has', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or',
  'show', 'so', 'that', 'the', 'this', 'to', 'use', 'was', 'we', 'what',
  'when', 'where', 'which', 'who', 'why', 'will', 'with', 'you', 'your',
]);

const TOP20_FALLBACK: string[] = [
  'containers list',
  'containers create',
  'containers start',
  'containers stop',
  'containers delete',
  'auth login',
  'auth logout',
  'auth tokens list',
  'projects list',
  'projects create',
  'terminal exec',
  'terminal connect',
  'files list',
  'files upload',
  'files download',
  'agent workspace list',
  'agent branch create',
  'tunnel expose',
  'servers list',
  'vault set',
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Score a single command against the tokenized user message.
 */
function scoreCommand(tokens: string[], group: RefGroup, cmd: RefCommand): number {
  if (tokens.length === 0) return 0;
  let score = 0;
  const aliasSet = new Set([group.name.toLowerCase(), ...group.aliases.map(a => a.toLowerCase())]);
  const pathLower = cmd.path.toLowerCase();
  const summaryLower = cmd.summary.toLowerCase();
  for (const tok of tokens) {
    if (aliasSet.has(tok)) score += 3;
    if (pathLower.includes(tok)) score += 2;
    if (summaryLower.includes(tok)) score += 1;
  }
  return score;
}

/**
 * Render the always-included group one-line index. The count is derived
 * from `reference.groups.length` so it stays accurate as the generated
 * reference evolves — never hardcode it.
 */
function renderGroupIndex(reference: CliReference): string {
  const lines = reference.groups.map(g => {
    const aliases = g.aliases.length > 0 ? ` [alias: ${g.aliases.join(', ')}]` : '';
    return `- \`hoody ${g.name}\`${aliases} — ${g.description}`;
  });
  return [
    `### CLI group index (${reference.groups.length} groups, one line each)`,
    '',
    ...lines,
  ].join('\n');
}

/**
 * Render a packed command block.
 */
function renderCommand(cmd: RefCommand): string {
  const flags = cmd.flags.length > 0 ? ` ${cmd.flags.join(' ')}` : '';
  return `- \`${cmd.path}\`${flags} — ${cmd.summary}`;
}

/**
 * Main entry point.
 */
export function retrieveReference(opts: RetrievalOptions): RetrievalResult {
  const { userMessage, reference, budgetTokens } = opts;
  const tokens = tokenize(userMessage);

  // Always-included group index.
  const indexText = renderGroupIndex(reference);
  const indexTokens = approxTokens(indexText);

  // Score all (group, command) pairs.
  const scored: Array<{ group: RefGroup; cmd: RefCommand; score: number }> = [];
  for (const group of reference.groups) {
    for (const cmd of group.commands) {
      const score = scoreCommand(tokens, group, cmd);
      if (score > 0) scored.push({ group, cmd, score });
    }
  }

  // Sort descending by score, then by shorter-path first (stable-ish).
  scored.sort((a, b) => b.score - a.score || a.cmd.path.length - b.cmd.path.length);

  // Zero-signal query → use top-20 fallback so the model sees concrete commands.
  let selected: RefCommand[];
  if (scored.length === 0) {
    selected = collectFallbackCommands(reference);
  } else {
    // Pack within budget.
    const available = Math.max(0, budgetTokens - indexTokens - 50 /* reserve for headers */);
    selected = [];
    let used = 0;
    for (const { cmd } of scored) {
      const line = renderCommand(cmd);
      const t = approxTokens(line);
      if (used + t > available) break;
      selected.push(cmd);
      used += t;
    }
  }

  const detailSection =
    selected.length > 0
      ? [
          '',
          '### Most relevant commands for this question',
          '',
          ...selected.map(renderCommand),
        ].join('\n')
      : '';

  const text = indexText + detailSection;
  return {
    text,
    approxTokens: approxTokens(text),
    selectedCommands: selected,
  };
}

function collectFallbackCommands(reference: CliReference): RefCommand[] {
  const byPath = new Map<string, RefCommand>();
  for (const g of reference.groups) {
    for (const c of g.commands) byPath.set(c.path, c);
  }
  const out: RefCommand[] = [];
  for (const p of TOP20_FALLBACK) {
    const c = byPath.get(`hoody ${p}`);
    if (c) out.push(c);
  }
  return out;
}
