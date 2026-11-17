// The Bots side of the kit model chooser: the rows a settled catalogue
// failure still offers, the chooser's computer and rules for a Bot's computer, and the save words. The chooser owns the
// reads (useModelCatalogue on the Bot's own computer) and the views; the drawers own their final action, which judges
// the held choice against the newest evidence (providers.judge) before anything is sent.
import { fixtureModeActive, handoff, providers, type ComputerRow, type Handoff, type Target } from '@core';
import { useModelCatalogue, usePathname, useSearch, useSearchParam, type DecidedView, type FallbackRow, type GateChoice, type GateView, type ModelCatalogue } from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { computerTarget, type Computer, type Gate, type ModelRow } from './data';
import { messageText, scrubSecrets, type GateState } from './logic';

type Choice = providers.Choice;

/** The page's words for a model with no other public name: Hoody Free's, and the neutral "A model". */
export interface ModelNames {
  free: string;
  any: string;
}

/**
 * What a settled catalogue failure still offers: the page's own rows, the held value
 * (when it is a model), and Hoody Free. Each is usable only with consent; nothing here is ever called ready. Each label
 * is its public name (core providers' rule for Hoody AI names), as everywhere else. One pass over the
 * page's models (a computer may list thousands): the first row for a spec names it.
 */
export function fallbackOf(models: readonly ModelRow[], value: string, names: ModelNames): { rows: FallbackRow[]; specs: string[] } {
  const labels = labelsOf(models);
  const rows: FallbackRow[] = [];
  const seen = new Set<string>();
  const add = (spec: string) => {
    if (spec === '' || seen.has(spec)) return;
    seen.add(spec);
    rows.push({ spec, label: nameFrom(spec, labels.get(spec), names) });
  };
  add(providers.FREE);
  for (const m of models) add(m.spec);
  add(value);
  return { rows, specs: rows.map((r) => r.spec) };
}

/** Each spec's page label, the first row's. */
function labelsOf(models: readonly ModelRow[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const m of models) if (!labels.has(m.spec)) labels.set(m.spec, m.label);
  return labels;
}

/** A spec's public name from its page label: else Hoody Free's, else the spec; a Hoody AI model with no name to show reads "A model". */
function nameFrom(spec: string, label: string | undefined, names: ModelNames): string {
  if (spec === providers.FREE) return providers.publicName(label || names.free, spec) || names.free;
  return (label && providers.publicName(label, spec)) || providers.modelNameOf(spec, null, names.any);
}

/**
 * The computer's agent target: the address the computers read registered. The fixture world's computers skip that read,
 * so there a computer's own server row stands in (the fixture rules answer the agent reads by route).
 */
function botTarget(computerId: string, computers: readonly Computer[]): Target {
  const t = computerTarget(computerId);
  // __HUB_FIXTURES__ first: a build folds the test to true and drops the fixture lookup below.
  if (!__HUB_FIXTURES__ || t.container.server_name || !fixtureModeActive()) return t;
  const server = computers.find((c) => c.id === computerId)?.server;
  return server ? { project: { id: 'p-fixture' }, container: { id: computerId, server_name: server } } : t;
}

/**
 * The chooser's computer: its name for the words, its row (with the address the computers read registered) for its
 * reads and the trip. null until that address is known: the chooser reads (its catalogue and its version read) from the
 * row, and a read sent before the address would stay failed after it arrives.
 */
export function chooserComputer(computerId: string | undefined, computers: readonly Computer[]): { id: string; name: string; row: ComputerRow } | null {
  if (!computerId) return null;
  const t = botTarget(computerId, computers);
  if (!t.container.server_name) return null;
  const row: ComputerRow = { id: computerId, ...(t.project.id ? { project_id: t.project.id } : {}), server_name: t.container.server_name };
  return { id: computerId, name: nameOf(computerId, computers), row };
}

const nameOf = (computerId: string, computers: readonly Computer[]): string => computers.find((c) => c.id === computerId)?.name ?? computerId;

export interface BotChooser {
  catalogue: ModelCatalogue;
  computer: { id: string; name: string; row: ComputerRow } | null;
  /** The computer's name for the words around the chooser ('' with no computer), known before its address is. */
  name: string;
  rules: providers.JudgeRules;
  fallback: FallbackRow[];
  /** The final action's judgement: the held choice for `spec` ('' = the Agent's default) against the newest evidence. */
  judge: (choice: Choice | null, spec: string) => providers.Verdict;
}

/**
 * One chooser's reads and rules for a Bot's computer; `value` is the held spec (it joins the fallback rows), `names` the
 * page's words for Hoody Free and for a model with no other public name (never the provider word alone, never the raw id).
 */
export function useBotChooser(computerId: string | undefined, computers: readonly Computer[], models: readonly ModelRow[], value: string, names: ModelNames): BotChooser {
  const computer = chooserComputer(computerId, computers);
  const where = computer ? `${computer.row.project_id ?? ''}|${computer.id}|${computer.row.server_name ?? ''}` : '';
  // No read until the computers read registered the computer's address (chooserComputer is null until then): the
  // chooser's visit is its scope (account, realm, computer id), so a read sent before the address would stay failed.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `where` is the target's identity
  const target = useMemo(() => (computerId && computer ? botTarget(computerId, computers) : null), [where]);
  const catalogue = useModelCatalogue(target);
  const { free, any } = names;
  const fb = useMemo(() => fallbackOf(models, value, { free, any }), [models, value, free, any]);
  const specsKey = fb.specs.join('\n');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the rules change only when the fallback specs do
  const rules = useMemo(() => providers.rulesFor('bot', { inherit: true, fallback: fb.specs }), [specsKey]);
  const judge = (choice: Choice | null, spec: string): providers.Verdict =>
    providers.judge(spec === '' ? { kind: 'inherit' } : choice, spec, catalogue.evidence, catalogue.scope, rules);
  return { catalogue, computer, name: computerId ? nameOf(computerId, computers) : '', rules, fallback: fb.rows, judge };
}

/** The held choice as the drawer keeps it: '' for the Agent's default, else the spec. */
export const specOf = (c: Choice): string => (c.kind === 'inherit' ? '' : c.spec);

/**
 * A model's public name for the words around the chooser: the page's label, else Hoody Free's public name, else the
 * spec, each through providers.publicName (a Hoody AI name shows only in Hoody's own form; any other
 * provider's name is kept whole). A Hoody AI model with no name to show reads "A model", never the raw spec.
 */
export function labelOf(spec: string, models: readonly ModelRow[], names: ModelNames): string {
  return nameFrom(spec, models.find((m) => m.spec === spec)?.label, names);
}

type Why = Extract<providers.Verdict, { ok: false }>['why'];
type WhyKey = 'model.why.unread' | 'model.why.consent' | 'model.why.setup' | 'model.why.gone' | 'model.why.ineligible';
const WHY: Record<Why, WhyKey> = {
  unread: 'model.why.unread',
  scope: 'model.why.consent',
  needs_consent: 'model.why.consent',
  needs_setup: 'model.why.setup',
  gone: 'model.why.gone',
  ineligible: 'model.why.ineligible',
};

/** Why a final action did not go, in the Bots words. */
export function whyText(t: (k: WhyKey | 'model.anyName' | 'model.anyNameMid' | 'model.anyNameStart', v?: Record<string, string>) => string, why: Why, model: string, computer: string): string {
  const key = WHY[why];
  const name = model !== t('model.anyName') ? model : t(key === 'model.why.consent' ? 'model.anyNameMid' : 'model.anyNameStart');
  return t(key, { model: name, computer });
}

/** The current place as a local href (path and params), to find a trip by its origin. */
function hrefOf(path: string, search: Readonly<Record<string, unknown>>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) if (v !== undefined) q.append(k, String(v));
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * The trip back from the AI page for `computer`, for one opening of a drawer (`computer` set; `owner`
 * names what the drawer is open for, the Bot for Settings). Found by the `handoff` param (the AI page's Go back), or by
 * the place itself (browser Back lands on the origin's entry, which has no param): it counts only when it is stored,
 * unexpired, for this account, realm and computer, and carries this drawer's kind of draft. The param leaves the address
 * at once (replace), and the trip is removed from storage when taken, so Back or a reload never restores it twice. It
 * belongs to that opening only: closing the drawer, or opening it for another computer or Bot, drops it.
 */
export function useReturnTrip(computer: string | undefined, kind: 'newBot' | 'settings', owner = ''): Handoff | null {
  const [id, setId] = useSearchParam('handoff');
  const href = hrefOf(usePathname(), useSearch());
  const opening = computer ? `${owner}|${computer}` : '';
  const [held, setHeld] = useState<{ opening: string; trip: Handoff } | null>(null);
  // The opening that has had its look by place: once per opening, so a later visit to the same place within it finds nothing new.
  const looked = useRef('');
  useEffect(() => {
    // A trip belongs to the opening that took it: another opening (closed, another computer or Bot) drops it for good.
    setHeld((h) => (h && h.opening === opening ? h : null));
    if (!computer) {
      looked.current = '';
      return;
    }
    const take = (h: Handoff | null) => {
      if (h?.draft?.kind !== kind) return;
      handoff.removeHandoff(computer);
      setHeld({ opening, trip: h });
    };
    if (id) {
      looked.current = opening;
      take(handoff.receiveHandoff(computer, id));
      setId(undefined, { replace: true });
      return;
    }
    if (looked.current === opening) return;
    looked.current = opening;
    take(handoff.handoffAtOrigin(computer, href));
  }, [opening, id]); // eslint-disable-line react-hooks/exhaustive-deps -- once per opening and param
  return held && held.opening === opening ? held.trip : null;
}

// The Bots side of the kit GateCard: a Bot's gate as the card's view, and what the card shows for this
// page's own send. The gate route decides one call (remember: false), so the card never offers a session choice. A send
// whose answer is unknown ("may have gone through", C9) is the card's Unknown: Check again only reads, nothing is sent again.

// What a reader cannot see: invisible format characters (zero-width, soft hyphen, word joiner, bidi marks), blank fillers
// and variation selectors (the kit's md.ts set, as the Bot channel renderer drops them).
const UNSEEN = /[\p{Cf}\p{Variation_Selector}\u034f\u115f\u1160\u3164\uffa0\u2800]/gu;
const UNSEEN_RUN = /[\p{Cf}\p{Variation_Selector}\u034f\u115f\u1160\u3164\uffa0\u2800]{2,}/gu;

/** The card's view of a Bot's gate. The delegate's summary is untrusted: it is scrubbed and bounded as every Bot text is
 *  (messageText). The kit card scrubs every value it draws or copies before its own code clean (code.ts gateInput, and the
 *  question's Prose), so a key split by an invisible character stays hidden on the warning lines and tagged rows too. What
 *  a reader cannot see is dropped first, after a scrub (the scrub reads past those characters, so a key they split is
 *  already hidden): so they never use up the bound before the text that matters (a warning after 4000 zero-width spaces),
 *  and a warning line or tagged row they lead is still one (the kit's code clean keeps blank fillers). A run of them is
 *  first cut to one character: the scrub hides any run past its length limit whole, with the word glued to it (a warning
 *  mark after 40000 zero-width spaces), while one kept character still parts a key from the word before it for the scrub
 *  (dropping them all before it would glue the two and hide nothing). The Bot names no tool or risk. */
export function gateViewOf(g: Gate): GateView {
  const text = messageText(typeof g.summary === 'string' ? scrubSecrets(g.summary.replace(UNSEEN_RUN, '\u200b')).replace(UNSEEN, '') : g.summary);
  return g.type === 'question' ? { kind: 'question', risk: '', question: text, options: [] } : { kind: 'confirm', risk: '', detail: text, offerSession: false };
}

/** What this page sent for the open gate. */
export type GateSent = GateChoice | 'answer';
export type GateShow = { k: 'open'; sending: boolean; failed: boolean } | { k: 'unknown' } | { k: 'decided'; kind: DecidedView['kind'] };

const SENT_KIND = { once: 'once', session: 'session', deny: 'deny', answer: 'answered' } as const;

/**
 * The card's state from the change's own state (logic.ts gateStateOf): on its way, unknown (C9), decided (by this send, or
 * elsewhere), or open again (a definite refusal says so). `ours`: the daemon names this send's request as the one that
 * decided the gate, so "already decided" is this page's own decision.
 */
export function gateShowOf(state: GateState, sent: GateSent | null, ours: boolean): GateShow {
  if (state === 'pending') return { k: 'unknown' };
  if (state === 'decided' || (state === 'elsewhere' && ours)) return { k: 'decided', kind: sent ? SENT_KIND[sent] : 'elsewhere' };
  if (state === 'elsewhere') return { k: 'decided', kind: 'elsewhere' };
  return { k: 'open', sending: state === 'running', failed: state === 'failed' };
}
