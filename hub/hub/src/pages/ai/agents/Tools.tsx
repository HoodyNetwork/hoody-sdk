// One agent's tools as an editor, on the agent's
// page (AgentsView): the host gives the agent's name (and, for Reset to shipped, a way to the agent's file).
//   - Ticks are batched. Save sends one setAgentTools with the whole list, then the list is read again; toggleAgentTool is
//     never called. Strict with nothing ticked saves `tools: none` (Save: no tools); not strict with nothing ticked removes
//     the line, which means every tool, so it asks first (Save: every tool).
//   - Before a save the agents list is read again (an answer that arrived after the press, never the cache): a failed read,
//     a gone agent, or tools that changed since the ticks were based on them send nothing. From the press to the end, the ticks
//     and Save are locked, so a second press cannot start a second save.
//   - The editor belongs to one computer, realm and agent (keyed by them): its ticks, notes and a save's answer never carry to
//     another. An answered save says Saved with what the agent now has only after the list is read again.
//   - A lost answer MAY have saved: nothing is sent again, the ticks lock, Check again reads the list, and only a list that
//     shows what was sent says Saved. Stop waiting (after a warning) unlocks them.
//   - The section's line says how far the agent's tools reach (and, with no list, that it gets every tool or Hoody's default
//     tools); the Overview above already counts them. A Hoody-owned agent shows the same groups with every box disabled.
//   - A tool shows its English name (toolNames.strings.en.json: the agent's alias, which GET /tools does not send), never its
//     description: an info button beside it opens its id, whether it only reads, and the agent's own description.
//   - The groups are the agent's own categories (toolGroups.ts), then More tools (catalogue tools the Hub's copy does not
//     know) and Not tools here. Each is a kit Disclosure titled with its label, on/total and changed counts, and a line on
//     what is in it and how many only read; a category starts closed (Not tools here starts open). Its All on / All off act
//     on every name of the group (Not tools here: All off only; a name there can't be added back). While a search is typed
//     or the filter is not All, every group with a matching tool is open (the person may close one; any change of the words
//     or the filter, back to earlier ones too, opens every match again); ending both gives back the folds as they were.
//   - The search matches a tool's name, id and description. The filter (All, On, Off, Changed, each with its count over the
//     search's matches): Changed shows only the ticks that differ from what the agent holds. A changed line is marked
//     Changed; a name of Not tools here is marked Unknown; a line found by its id or description says so.
//   - While ticks are unsaved, the search row's note says what the save leaves; and while they are unsaved (or a save is
//     going) a kit FormFooter, in the host's sticky footer when it gives one, offers Discard and a button that says what the
//     save writes.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { portal as createPortal } from '../parts/portal';
import {
  ActionBar, Band, Button, Checkbox, ConfirmDialog, Disclosure, EmptyState, ErrorState, Facts, FormFooter, IconButton, LeaveGuard, Outcome, Popover, SearchField,
  SegmentedControl, Skeleton, SubSection, Tag, TextButton, Why, useStrings, type ActionSpec,
} from '@kit';
import { hostEnv, refusal } from '@core';
import { useAgents } from './data';
import type { AgentRow } from './logic';
import {
  GROUP_IDS, changedChat, changesOf, countsOf, groupsOf, identityOf, othersOf, reachOf, rowShows, sameTools, saveCountOf, saveOf, tickedOf, wouldChange,
  type CatalogTool, type Filter, type GroupId, type ToolGroup, type ToolLine, type ToolsIdentity,
} from './tools';
import { useCatalogue, useFreshRow, useToolsAt, useToolsSave, type ToolsAt } from './toolsData';
import { toolsLong } from './words';
import { pageFaq } from '../faq';
import aiStrings from '../strings.en.json';
import agentStrings from './strings.en.json';
import strings from './Tools.strings.en.json';
import nameStrings from './toolNames.strings.en.json';
import s from './Tools.module.css';

export interface AgentToolsProps {
  /** The agent's name (its file's stem). */
  name: string;
  /** The computer's name, as the top bar shows it (for the New chat line of a changed `chat`). */
  computer: string;
  /** Opens the agent's file, where Reset to shipped is. Without it the changed-chat note offers no link. */
  onShowSource?: () => void;
  /** A host that changes the agent without navigating (LeaveGuard sees only path changes), or that owns the route guard
   *  (`hostGuard`), calls `leaveRef.current(go, stay)` first: `go` runs at once when no unsaved ticks are held, else after
   *  the person confirms the leave dialog; Stay keeps them and calls `stay` (a host's held navigation is let go there). */
  leaveRef?: { current: ((go: () => void, stay?: () => void) => void) | null };
  /** The host owns the route's leave guard (one question for everything on its page): no LeaveGuard here; the host asks
   *  through `leaveRef`. */
  hostGuard?: boolean;
  /** Told whenever the editor starts or stops holding unsaved ticks (what its leave checks ask about); false when it closes. */
  onHeldChange?: (held: boolean) => void;
  /** The host already warns that the agents list couldn't be read again (its own band over the page): no second band here. */
  staleShown?: boolean;
  /** The host's sticky footer (its DetailPage `footer`), where the save bar goes; without it the bar shows in place. */
  footerEl?: HTMLElement | null;
  /** Told whenever the save bar starts or stops showing (the host gives it a footer only then); false when it closes. */
  onBarChange?: (shown: boolean) => void;
}

/** What the person is editing: the row the ticks were based on, the ticks, and (after a send) what was sent. */
interface Draft { base: AgentRow; ticked: ReadonlySet<string>; sent: ToolsIdentity | null }
type Note = 'readFirst' | 'changed' | 'goneAtSave' | 'saved' | 'savedUnread' | 'savedOther' | null;

/** The folds closed until the person opens one: every group but Not tools here (a name there needs a look). */
const FOLDED: ReadonlySet<GroupId> = new Set(GROUP_IDS.filter((id) => id !== 'other'));
const FILTERS: readonly Filter[] = ['all', 'on', 'off', 'changed', 'acts'];
/** The save bar names at most this many tools per side; the rest are counted. */
const NAMED = 5;

export function AgentTools(p: AgentToolsProps) {
  const t = useStrings(strings);
  const at = useToolsAt();
  if (at === null) return <p className={s.note}>{t('noRealm')}</p>;
  // One editor per computer, realm and agent: another of them starts a new one (no draft, note or answer carries over).
  return <Editor key={`${at.target.container.id}\u0000${at.realm}\u0000${p.name}`} {...p} at={at} />;
}

function Editor({ name, computer, onShowSource, leaveRef, onHeldChange, staleShown, hostGuard, footerEl, onBarChange, at }: AgentToolsProps & { at: ToolsAt }) {
  const t = useStrings(strings);
  const ta = useStrings(agentStrings);
  const tn = useStrings(nameStrings);
  const { byId } = pageFaq(useStrings(aiStrings));
  // In the editor's realm, as its save (under All realms the context's is 'all', which GET /agents refuses unsent).
  const read = useAgents(true, at.realm);
  const cat = useCatalogue(true);
  const run = useToolsSave(at, name);
  const fresh = useFreshRow(name, at.target.container.id, at.realm);
  const catalogue: CatalogTool[] | undefined = cat.data ?? undefined;

  const [draft, setDraft] = useState<Draft | null>(null);
  // An agent that left the list while ticks are unsaved keeps its editor on the row they were based on: the ticks stay until the
  // person leaves, and a save reads the list first, so it sends nothing for an agent that is gone.
  const row = read.rows?.find((r) => r.name === name) ?? draft?.base;
  const [note, setNote] = useState<Note>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // The folds closed now (every category until the person opens it), and the groups the person closed under the words and
  // filter chosen now (a change of either opens every match again).
  const [closed, setClosed] = useState<ReadonlySet<GroupId>>(FOLDED);
  const [shut, setShut] = useState<ReadonlySet<GroupId>>(() => new Set());
  // A tick under a narrowing filter can take its own line (and its group) away: focus goes back to the search row.
  const barRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (hostEnv().browserPage !== true) return;
    const doc = barRef.current?.ownerDocument;
    const a = doc?.activeElement;
    if (a && a !== doc?.body && a.isConnected) return;
    (barRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"], input:checked') ?? barRef.current?.querySelector<HTMLElement>('input'))?.focus();
  });
  const [asked, setAsked] = useState<'every' | 'stop' | null>(null);
  const [leave, setLeave] = useState<{ go: () => void; stay: () => void } | null>(null);
  // From the press to the end of a save: set synchronously, so a second press in the same tick starts nothing.
  const [sending, setSending] = useState(false);
  const sendingNow = useRef(false);
  const alive = useRef(true);
  // Set on mount too: StrictMode runs the cleanup once and mounts again, and a closed guard would lock Save for good.
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // The host's leave check asks exactly when the LeaveGuard would (written on each render, below).
  const asking = useRef(false);
  useEffect(() => {
    if (!leaveRef) return;
    leaveRef.current = (go, stay) => (asking.current ? setLeave({ go, stay: stay ?? (() => {}) }) : go());
    return () => { leaveRef.current = null; };
  }, [leaveRef]);
  // The host hears what the leave checks would do after each render (asking is final for it by then), and false on close.
  const heldCb = useRef(onHeldChange);
  heldCb.current = onHeldChange;
  const reported = useRef<boolean | null>(null);
  useEffect(() => {
    if (reported.current === asking.current) return;
    reported.current = asking.current;
    heldCb.current?.(asking.current);
  });
  useEffect(() => () => heldCb.current?.(false), []);
  // The same for the save bar: the host hears whether it shows after each render (`bar` is written on each render, below).
  const barCb = useRef(onBarChange);
  barCb.current = onBarChange;
  const bar = useRef(false);
  const barTold = useRef<boolean | null>(null);
  useEffect(() => {
    if (barTold.current === bar.current) return;
    barTold.current = bar.current;
    barCb.current?.(bar.current);
  });
  useEffect(() => () => barCb.current?.(false), []);

  const held = run.outcome?.kind === 'pending';
  // A save whose answer was lost is proved by the list showing what it sent (core frees the hold on that same read): the
  // ticks then follow the list again.
  useEffect(() => {
    const sent = draft?.sent;
    if (sent && !sending && !held && !run.busy && row && sent.computer === at.target.container.id && sent.realm === at.realm && sent.name === name && rowShows(sent, row)) {
      setDraft(null);
      setNote('saved');
    }
  }, [draft, sending, held, run.busy, row, at, name]);

  // While a failed or unfinished read leaves nothing to compare with, any draft counts as unsaved ticks: they are still here,
  // and leaving would drop them. Both leave checks (the route's LeaveGuard, the host's leaveRef) stay up in those states.
  const draftHeld = draft !== null && !held;
  asking.current = draftHeld;
  const leaveUi = (active: boolean) => (
    <>
      <LeaveGuard active={active && !hostGuard} onBlock={(go, stay) => setLeave({ go, stay })} />
      <ConfirmDialog
        overlayId="ai-agent-tools-leave"
        isOpen={leave !== null}
        onOpenChange={(o) => { if (!o) { leave?.stay(); setLeave(null); } }}
        title={t('leave.title')}
        body={t('leave.body', { name })}
        confirmLabel={t('leave.confirm')}
        onConfirm={() => { const l = leave; setLeave(null); l?.go(); }}
      />
    </>
  );

  // A failed read with no list to show is an error; a failed re-read keeps the last list on screen with a warning (the ticks
  // are not lost, and every save reads the list again first).
  // No save bar until the editor shows its groups: a state below (failed read, loading, gone) tells the host to drop its footer
  // (a failed catalogue refresh after an edit would otherwise leave an empty sticky footer).
  bar.current = false;
  if (read.failed && read.rows === undefined) {
    return <>{leaveUi(draftHeld)}<ErrorState title={ta('state.failed')} error={read.error} onRetry={read.retry} retrying={read.retrying} /></>;
  }
  if (cat.error || cat.data === null) {
    return <>{leaveUi(draftHeld)}<ErrorState title={t('catalogueFailed')} error={cat.error} onRetry={() => void cat.refetch()} retrying={cat.isFetching} /></>;
  }
  if (read.rows === undefined || catalogue === undefined) {
    return (
      <div aria-busy="true" aria-label={t('loading')}>
        {leaveUi(draftHeld)}
        <Skeleton rows={6} />
      </div>
    );
  }
  if (!row) {
    // Gone: there is nothing to save the ticks to, so nothing to ask about.
    asking.current = false;
    return <EmptyState size="sm" icon="hoody-ai-agent" title={t('gone', { name })} />;
  }

  const base = draft?.base ?? row;
  const ticked = draft?.ticked ?? new Set(tickedOf(row, catalogue));
  const save = saveOf(base.strict, ticked, catalogue);
  // Dirty as what the save would write, not as ticks: strict on Hoody's default tools → none is a change with nothing ticked.
  const dirty = draft !== null && wouldChange(base, save, catalogue);
  const owned = row.productOwned;
  const locked = owned || held || run.busy || sending;
  // The agent holds something else now than the ticks were based on (another tab, the file's editor).
  const moved = draft !== null && draft.sent === null && !sameTools(row, draft.base);
  const guardActive = dirty && !held;
  asking.current = guardActive;
  const saved = new Set(tickedOf(base, catalogue));
  const others = othersOf(base, catalogue);
  // A tool's English name (the agent's alias, kept in toolNames.strings.en.json), else its id.
  const labelOf = (tool: string): string => {
    const key = `name.${tool}`;
    return key in nameStrings ? tn(key as keyof typeof nameStrings) : tool;
  };
  const counts = countsOf(groupsOf(catalogue, others, ticked, saved, query, 'all', labelOf));
  const groups = groupsOf(catalogue, others, ticked, saved, query, filter, labelOf);
  const changes = changesOf(ticked, saved);
  // A search or a filter other than All narrows the lines: every group with a match is open then.
  const searching = query.trim() !== '' || filter !== 'all';
  const expanded = (id: GroupId) => (searching ? !shut.has(id) : !closed.has(id));
  const fold = (id: GroupId, open: boolean) => {
    const flip = (set: ReadonlySet<GroupId>, on: boolean) => {
      const next = new Set(set);
      if (on) next.add(id); else next.delete(id);
      return next;
    };
    if (searching) setShut((x) => flip(x, !open));
    else setClosed((x) => flip(x, !open));
  };

  const tickAll = (tools: readonly string[], on: boolean) => {
    // Nothing to change (All off on a group already off): no draft, so a strict agent on Hoody's default tools never gets a
    // save that writes no tools from a press that changed no tick.
    if (locked || tools.every((tool) => ticked.has(tool) === on)) return;
    const next = new Set(ticked);
    for (const tool of tools) if (on) next.add(tool); else next.delete(tool);
    setNote(null);
    if (filter !== 'all') refocus.current = true;
    setDraft({ base, ticked: next, sent: null });
  };
  const tick = (tool: string, on: boolean) => tickAll([tool], on);
  const undo = () => { setDraft(null); setNote(null); };
  // A group's All on / All off (Not tools here: All off only, its names can't be added back here). Pressed when every tool is
  // already so, or while the ticks are locked, it changes nothing (tickAll).
  const allActions = (g: ToolGroup): readonly [ActionSpec] | readonly [ActionSpec, ActionSpec] => {
    const group = t(`group.${g.id}`);
    const off: ActionSpec = { id: `off-${g.id}`, label: t('group.allOff'), name: t('group.allOff.aria', { group }), onPress: () => tickAll(g.names, false) };
    if (g.id === 'other') return [off];
    return [{ id: `on-${g.id}`, label: t('group.allOn'), name: t('group.allOn.aria', { group }), onPress: () => tickAll(g.names, true) }, off];
  };

  const send = async () => {
    if (sendingNow.current) return;
    sendingNow.current = true;
    setSending(true);
    try {
      setNote(null);
      const now = await fresh();
      // The editor closed (another computer, realm or agent) while the list was read: send nothing.
      if (!alive.current) return;
      if (now === undefined) { setNote('readFirst'); return; }
      if (now === null) { setNote('goneAtSave'); return; }
      if (!sameTools(now, base)) { setNote('changed'); return; }
      const identity = identityOf({ computer: at.target.container.id, realm: at.realm }, name, base.strict, save, catalogue);
      setDraft({ base, ticked, sent: identity });
      const r = await run.run({ target: at.target, realm: at.realm, name, save, identity });
      if (!alive.current) return;
      if (r.outcome === 'done') {
        // Answered: what the agent now has is shown only from the list read again after it.
        const after = await fresh();
        if (!alive.current) return;
        setDraft(null);
        setNote(after === undefined ? 'savedUnread' : after !== null && rowShows(identity, after) ? 'saved' : 'savedOther');
      } else if (r.outcome !== 'pending') setDraft({ base, ticked, sent: null });
    } finally {
      sendingNow.current = false;
      if (alive.current) setSending(false);
    }
  };
  const press = () => (save.confirm ? setAsked('every') : void send());
  const stopWaiting = async () => {
    await run.dismiss();
    setAsked(null);
    setDraft((d) => (d ? { ...d, sent: null } : d));
  };

  const failed = run.outcome && run.outcome.kind !== 'pending' && run.outcome.kind !== 'done' ? run.outcome : undefined;
  const reachKey = `reach.${reachOf(row, catalogue)}` as const;
  const afterCount = saveCountOf(save, catalogue);
  const named = (tools: readonly string[]) => {
    const names = tools.map(labelOf).sort((x, y) => x.localeCompare(y));
    return names.length > NAMED ? t('summary.more', { names: names.slice(0, NAMED).join(', '), count: names.length - NAMED }) : names.join(', ');
  };
  const changeCount = changes.on.length + changes.off.length;
  const counted = t('summary', { count: changeCount });
  const summary = changeCount === 0
    ? t('summary.same')
    : changes.on.length && changes.off.length
      ? t('summary.onOff', { changes: counted, on: named(changes.on), off: named(changes.off) })
      : changes.on.length
        ? t('summary.onOnly', { changes: counted, on: named(changes.on) })
        : t('summary.offOnly', { changes: counted, off: named(changes.off) });
  // The save bar: while ticks are unsaved or a save is going (a held or failed save says so below, with its own actions).
  const barShown = !owned && !held && (dirty || sending || run.busy);
  bar.current = barShown;
  // The section's line: how far the tools reach, and with no list on an agent that is not Hoody's, what that means.
  const reach = t(reachKey, { computer });
  const lead = !owned && base.tools === null ? t('lead', { reach, note: t(base.strict ? 'base.default' : 'base.every') }) : reach;
  // A group's title (label, on/total, changed) and its line (what is in it, how many only read; Not tools here has its note).
  const groupTitle = (g: ToolGroup) => {
    const count = t('group.count', { on: g.on, total: g.total });
    return g.changed > 0
      ? t('group.titleChanged', { group: t(`group.${g.id}`), count, changed: t('group.changed', { count: g.changed }) })
      : t('group.title', { group: t(`group.${g.id}`), count });
  };
  const groupLine = (g: ToolGroup): string | undefined => {
    if (g.id === 'other') return undefined;
    const readOnly = g.readOnly === 0 ? t('group.readOnly.none') : g.readOnly === g.total ? t('group.readOnly.all') : t('group.readOnly', { count: g.readOnly });
    return t('group.desc', { scope: t(`scope.${g.id}`), readOnly });
  };

  // The save bar goes to the host's sticky footer when it gives one, else in place.
  const place = (node: ReactNode) => (footerEl ? createPortal(node, footerEl) : node);

  // Under "Can change things": one press turns off every tool the filter shows, across the groups (the safe way to
  // make an agent read only), through the same unsaved ticks, so the line above says what the save leaves.
  const actsShown = filter === 'acts' ? groups.filter((g) => g.id !== 'other').flatMap((g) => g.lines) : [];
  const actsOn = actsShown.filter((l) => l.on).length;
  // One band at a time: the agent's tools moved under the ticks (act on it first), else it differs from the shipped agent.
  const chatBand = changedChat(row);

  return (
    <>
    <SubSection
      id={`agent-tools-${name}`}
      title={t('title')}
      description={lead}
      // The agents list read again failed: the last list read stays shown, with the kit's stale band and Try again.
      state={read.failed && !staleShown ? { kind: 'stale', shown: 1, error: read.error, onRetry: read.retry, busy: read.retrying } : { kind: 'ready' }}
    >
      {/* The overview above already says the tool list's mode (Tool list: strict or a base) and that a Hoody-owned
          agent is read-only, so this editor does not repeat them; what strict means is one closed Why, ending with the
          agents question. An owned agent's tools are Hoody's: nothing here to explain. */}
      {!owned && (
        <Why question={t('why.q')} faq={{ item: byId.agents, label: t('why.more') }}>
          {base.strict ? t('why.strict') : t('why.base')} {t('strict.where')}
        </Why>
      )}
      {(moved || chatBand) && (
        <Band
          // noDetails: nothing failed; either the agent's tools changed since the ticks were based on them, or it differs
          // from the shipped agent.
          tone={moved ? 'warn' : 'neutral'}
          size="table"
          actions={moved
            ? <TextButton onPress={() => { setDraft(null); setNote(null); }}>{t('load')}</TextButton>
            : onShowSource ? <TextButton onPress={onShowSource}>{t('chat.reset')}</TextButton> : undefined}
        >
          {moved ? t('changedBand') : `${t('chat.changed')} ${t('chat.line', { line: reach })}`}
        </Band>
      )}
      <div ref={barRef} className={s.bar}>
        <SearchField
          size="toolbar"
          label={t('search')}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(q) => {
            // The field calls this only when the words change, and every change is a new search: the groups closed under
            // the old words open again, also when the words go back to earlier ones, and a cleared search forgets them.
            setShut(new Set());
            setQuery(q);
          }}
        />
        <SegmentedControl<Filter>
          label={t('show')}
          // Five choices: where their labels do not fit whole (a phone), the kit draws a Select of them instead.
          fullWidth
          value={filter}
          onChange={(f) => {
            // A new filter is a new narrowing, as new words are: every group with a match opens again.
            setShut(new Set());
            setFilter(f);
          }}
          items={FILTERS.map((f) => ({ id: f, label: t(`show.${f}`), count: counts[f] }))}
        />
      </div>
      {/* While ticks are unsaved: how many tools the save leaves and what changes. */}
      {dirty && <p className={s.note}>{t('after', { count: t('after.count', { count: afterCount }), summary })}</p>}
      {!owned && actsShown.length > 0 && (
        <ActionBar
          size="sm"
          label={t('acts.bar')}
          secondary={[{
            id: 'acts-off',
            label: t('acts.allOff', { count: actsOn }),
            name: t('acts.allOff.aria', { count: actsOn }),
            onPress: () => tickAll(actsShown.map((l) => l.name), false),
            // Nothing shown is on: the press would change nothing, so it says why instead (soft-disabled, still focusable).
            ...(actsOn === 0 ? { disabledReason: t('acts.noneOn') } : {}),
          }]}
        />
      )}
      {groups.every((g) => g.lines.length === 0) && <p className={s.note}>{t('noMatch')}</p>}
      <div className={s.groups}>
        {groups.filter((g) => g.lines.length > 0).map((g) => (
          <Disclosure
            key={g.id}
            level={4}
            title={groupTitle(g)}
            description={groupLine(g)}
            isExpanded={expanded(g.id)}
            onExpandedChange={(open) => fold(g.id, open)}
          >
            <div className={s.group}>
              {g.id === 'other' && <p className={s.note}>{t('group.otherNote')}</p>}
              {!owned && (
                <ActionBar
                  size="sm"
                  label={t('group.all', { group: t(`group.${g.id}`) })}
                  secondary={allActions(g)}
                />
              )}
              <ul className={s.lines}>
                {g.lines.map((l) => (
                  <li key={l.name}>
                    <Checkbox
                      label={l.label}
                      isSelected={l.on}
                      // An other name can only be dropped, never ticked again from here.
                      isDisabled={locked || (g.id === 'other' && !l.on)}
                      onChange={(on) => tick(l.name, on)}
                      className={s.check}
                    />
                    {l.changed && <Tag tone="accent">{t('tag.changed')}</Tag>}
                    {g.id === 'other' && <Tag tone="warn">{t('tag.unknown')}</Tag>}
                    {/* Found by what the name does not show: the id (when the name is not the id; the id itself is in the details), or the description. */}
                    {l.hit === 'id' && l.label !== l.name && <Tag>{t('tag.inId')}</Tag>}
                    {l.hit === 'description' && <Tag>{t('tag.inDescription')}</Tag>}
                    {g.id !== 'other' && <About line={l} />}
                  </li>
                ))}
              </ul>
            </div>
          </Disclosure>
        ))}
      </div>
      {note === 'readFirst' && (
        <Outcome
          // noDetails: nothing was sent; the failed read's rejection is on the warning band above.
          outcome={{ kind: 'not_sent' }}
          detail={t('readFirst')}
        />
      )}
      {note === 'changed' && (
        <Outcome
          // noDetails: nothing was sent; the tools changed since the ticks were based on them.
          outcome={{ kind: 'not_sent' }}
          detail={t('changed')}
        />
      )}
      {note === 'goneAtSave' && (
        <Outcome
          // noDetails: nothing was sent; the agent is gone.
          outcome={{ kind: 'not_sent' }}
          detail={t('goneAtSave')}
        />
      )}
      {note === 'savedUnread' && (
        <Outcome
          // noDetails: the save was answered; only the read after it failed (its rejection is on the warning band).
          outcome={{ kind: 'done' }}
          doneText={t('savedUnread', { name })}
        />
      )}
      {note === 'savedOther' && (
        <Outcome
          // noDetails: the save was answered; the agent reports other tools now (changed again elsewhere).
          outcome={{ kind: 'done' }}
          doneText={t('savedOther', { name, words: toolsLong(ta, row) })}
        />
      )}
      {note === 'saved' && (
        <Outcome
          // noDetails: a done save has no rejection.
          outcome={{ kind: 'done' }}
          doneText={t('saved', { name, words: toolsLong(ta, row) })}
        />
      )}
      {held && (
        <>
          <Outcome
            // noDetails: a save whose answer never came has no rejection; Check again reads the agents list.
            outcome={run.outcome}
            onCheck={run.check}
            detail={run.elsewhere ? t('heldElsewhere', { name }) : t('held', { name })}
          />
          {!run.elsewhere && <Button size="sm" variant="ghost" onPress={() => setAsked('stop')}>{t('stop')}</Button>}
        </>
      )}
      {failed && <Outcome outcome={failed} detail={t('refused')} error={refusal(failed)} />}
    </SubSection>
      {barShown && place(
        <FormFooter
          // noDetails: the bar never shows a save's outcome (a held or failed save says so below the groups, with its rejection).
          dirty={dirty}
          busy={sending || run.busy}
          onDiscard={undo}
          onSubmit={press}
          submitDisabled={moved || locked}
          submitLabel={save.kind === 'none' ? t('save.none') : save.kind === 'every' ? t('save.every') : t('save.list')}
          // No outcome here: a save's own outcome shows below the groups (held: Check again and Stop tracking; failed: why),
          // and the bar is gone by then, so nothing goes to a toast either.
          toastOnLeave={false}
        />,
      )}
      <ConfirmDialog
        overlayId="ai-agent-tools-every"
        isOpen={asked === 'every'}
        onOpenChange={(o) => { if (!o) setAsked(null); }}
        title={t('every.title', { name })}
        body={t('every.body', { name })}
        confirmLabel={t('every.confirm')}
        onConfirm={() => { setAsked(null); void send(); }}
      />
      <ConfirmDialog
        overlayId="ai-agent-tools-stop"
        isOpen={asked === 'stop'}
        onOpenChange={(o) => { if (!o) setAsked(null); }}
        tone="danger"
        title={t('stop.title')}
        body={t('stop.body')}
        confirmLabel={t('stop.confirm')}
        onConfirm={() => void stopWaiting()}
      />
      {leaveUi(guardActive)}
    </>
  );
}

/** A tool's details on demand: its id (copyable), whether it only reads, and the agent's own description, in a popover
 *  opened by the info button at the end of its line (the line itself shows only the name). */
function About({ line }: { line: ToolLine }) {
  const t = useStrings(strings);
  const access = t(line.readOnly ? 'detail.readOnly' : 'detail.acts');
  const label = t('detail.open', { tool: line.label });
  return (
    <Popover
      trigger={<IconButton icon="info" size="sm" variant="ghost" label={label} tooltip={t('detail.tip', { id: line.name, access })} />}
      label={label}
      title={line.label}
      width="lg"
      placement="bottom end"
    >
      <Facts
        layout="spec"
        columns={1}
        label={label}
        items={[
          { label: t('detail.id'), value: line.name, mono: true, copy: line.name },
          { label: t('detail.access'), value: access },
          ...(line.description ? [{ label: t('detail.does'), value: line.description, wide: true }] : []),
        ]}
      />
    </Popover>
  );
}
