// The pure rules of ModelPicker: one row per model, grouped by provider, groups in the order a person picks
// from, and each group's one readiness word. No React, no words: the component turns the result into rows.
//
// Order: the provider holding the current model, then Hoody AI, then ready providers A-Z, then providers whose
// readiness can't be told, then providers that need setup A-Z, then Claude Code, then ensembles last. Inside a group: the
// recommended model first, then by name.

export type ModelReady = 'ready' | 'needs_key' | 'unknown';

/** One model as the picker shows it (core's providers.list rows fit this shape). */
export interface ModelChoice {
  spec: string;
  label: string;
  providerId: string;
  providerLabel: string;
  ready: ModelReady;
  /** claude_code: a Claude Code model (core agent choices); its rows form one group of their own. */
  source: 'provider' | 'fusion' | 'claude_code';
  recommended?: boolean;
}

export interface ModelGroup {
  /** The provider id, 'fusion' for the ensembles, or 'claude-code' for Claude Code. */
  id: string;
  label: string;
  /** ready: some model answers; needs_key: none can until set up; unknown: can't tell. */
  ready: ModelReady;
  fusion: boolean;
  claude: boolean;
  models: ModelChoice[];
}

const HOODY = 'hoody-ai';
const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });

/** The group's word: ready when any model is ready, needs_key when every model needs setup, else unknown. */
function groupReady(models: readonly ModelChoice[]): ModelReady {
  if (models.some((m) => m.ready === 'ready')) return 'ready';
  return models.length > 0 && models.every((m) => m.ready === 'needs_key') ? 'needs_key' : 'unknown';
}

const RANK: Record<ModelReady, number> = { ready: 0, unknown: 1, needs_key: 2 };

/** One row per spec (the first wins), grouped and ordered as above. */
export function groupModels(models: readonly ModelChoice[], current: string): ModelGroup[] {
  const seen = new Set<string>();
  const at = new Map<string, ModelGroup>();
  for (const m of models) {
    if (!m.spec || seen.has(m.spec)) continue;
    seen.add(m.spec);
    const fusion = m.source === 'fusion';
    const claude = m.source === 'claude_code';
    const id = fusion ? 'fusion' : claude ? 'claude-code' : m.providerId;
    let g = at.get(id);
    if (!g) {
      g = { id, label: m.providerLabel, ready: 'unknown', fusion, claude, models: [] };
      at.set(id, g);
    }
    g.models.push(m);
  }
  const groups = [...at.values()];
  for (const g of groups) {
    g.ready = groupReady(g.models);
    // Claude Code keeps the agent's order (its default model first).
    if (g.claude) continue;
    g.models.sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended) || byName(a.label, b.label));
  }
  const holder = groups.find((g) => g.models.some((m) => m.spec === current))?.id;
  const key = (g: ModelGroup): number => (g.id === holder ? -2 : g.fusion ? 9 : g.claude ? 8 : g.id === HOODY ? -1 : RANK[g.ready]);
  return groups.sort((a, b) => key(a) - key(b) || byName(a.label, b.label));
}
