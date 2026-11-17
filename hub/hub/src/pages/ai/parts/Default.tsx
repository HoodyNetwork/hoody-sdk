// "Default model": the AI helper's model and the Bots' model, each a setting row with Change. Change opens
// the shared model chooser (a drawer: it works the same on a phone) then an impact dialog; the save is read back
// before it is called saved, and a lost answer reads "may have gone through" with Check again (a read, never a resend).
//
// Model picker (AI Default):
//   - The chooser reads the catalogue through the page's own bundle reader while Change or its impact dialog is open
//     (useModelCatalogue: setup attempts, settling and scope fences live there), so Confirm judges against the same
//     evidence the chooser showed, at its newest.
//   - The Bots row lists ensembles (purpose bot); the helper row does not (purpose default). Hoody Decide is never
//     offered (it is the checker's, not a model to run).
//   - A needs-setup pick sets up inline, in the chooser. "Set up on the AI page" and the Other ways stay on this page
//     (the Connect drawer, the Claude Code section): there is no trip to take.
//   - Confirm judges (providers.judge) before it sends, against the newest evidence of today's scope: the chooser's
//     own reads or the page bundle, whichever answered last (the two refresh on their own timers). The chooser shows
//     that same evidence, so a model Confirm refused is never offered as ready again (setup attempts stay the hook's). A model that turned
//     unknown since the pick reopens the chooser to be chosen again (consent is per pick); one that now needs setup
//     reopens it too; gone, refused, or another computer or realm says so on the row. Nothing is sent unless the
//     judgement passes. A save of an unknown-readiness pick keeps that caveat in its outcome.
//   - Names and tags come from `m.named`, which holds the ensembles a Bots default may name.
//
// A save whose outcome is unknown is held by core (../modelHold.ts), keyed by the computer,
// the realm and the agent, never kept in this component: leaving Settings and coming back (or the agent's own page, which holds
// the same way) shows it again with Check again, and the row's Change stays off until a read-back shows the model or the
// person stops tracking it after the banner's warning. Its readiness caveat is kept with the hold.
import { Band, Button, ConfirmDialog, Drawer, EmptyState, ErrorState, ModelPickPanel, Row, SettingGroup, SettingRow, Skeleton, Tag, useModelCatalogue, useSearchParam, useStrings } from '@kit';
import { hostEnv, providers, type HandoffDest } from '@core';
import { evidenceOfAi } from './model';
import { useEffect, useMemo, useRef, useState } from 'react';
import { chooserApi } from '../data';
import { DECIDE, FREE, impactOf, modelLabel, names, tagOf } from '../logic';
import { checkHeld, sendHeld, stopHeld, useHeldModel, type HeldModel, type ModelAt } from '../modelHold';
import { shownComputer } from '../shownGate';
import strings from '../strings.en.json';
import { useAi } from './ctx';
import { failedUi, type Ui } from './outcome';
import { CodeLeaf, Point, Points } from './raw';
import s from './parts.module.css';

type Part = 'helper' | 'bots';
type Choice = providers.Choice;
/** Why the chooser reopened after Confirm judged the pick (the drawer says it above the chooser). */
type Again = { model: string; why: 'unknown' | 'setup' };
/** One row's outcome: saved (its words carry the readiness caveat when readiness was unknown), refused or not sent, or the
 *  note of a Check again that did not find the held model yet (`still`). An unknown outcome itself is core's hold. */
type RowUi = { spec: string; out: Ui; still?: string; unknown?: boolean };

/**
 * The newest accepted evidence of today's scope: the chooser's own (`mine`) or the page bundle's, whichever answered
 * last. A tie keeps the chooser's. Evidence of another scope never counts; with none of today's, the chooser's stands
 * (judge then says unread or scope). The page bundle reads no Claude Code part: the chooser's stays with it. Only an
 * answered page read counts: a failed one holds no newer facts about any model.
 */
function newestEvidence(mine: providers.Evidence | null, page: providers.Evidence | null, now: providers.Scope | null): providers.Evidence | null {
  const here = (e: providers.Evidence | null): e is providers.Evidence => !!e && e.catalogue.state !== 'loading' && providers.sameScope(e.scope, now);
  if (!here(page) || page.catalogue.state !== 'ok') return mine;
  if (here(mine) && mine.at >= page.at) return mine;
  return { ...page, claude: here(mine) ? mine.claude : null };
}

/** The chooser's rules for one row: its purpose, the current spec usable after a settled catalogue failure, and never
 *  Hoody Decide. Confirm judges with the same object. */
function rulesOf(part: Part, current: string): providers.JudgeRules {
  const r = providers.rulesFor(part === 'bots' ? 'bot' : 'default', { fallback: current ? [current] : [] });
  return { ...r, eligible: (spec, ev) => spec !== DECIDE && r.eligible(spec, ev) };
}

export function DefaultSection() {
  const t = useStrings(strings);
  const { m, api, reload, connect, goto } = useAi();
  const [pick, setPick] = useState<Part | null>(null);
  const [again, setAgain] = useState<Again | null>(null);
  const [pickParam, setPickParam] = useSearchParam('pick');
  // ⌘K "Change the default model" lands here with ?pick=helper.
  useEffect(() => {
    if (pickParam !== 'helper' && pickParam !== 'bots') return;
    setPick(pickParam);
    setPickParam(undefined, { replace: true });
  }, [pickParam, setPickParam]);
  const [change, setChange] = useState<{ part: Part; spec: string; choice: Choice | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ui, setUi] = useState<Partial<Record<Part, RowUi>>>({});
  const [dlg, setDlg] = useState<Ui | undefined>();
  // The held change whose Stop tracking warning is open (the page's own words).
  const [stopAsk, setStopAsk] = useState<HeldModel | null>(null);
  const lastPart = useRef<Part>('helper');
  // "Use Hoody Free" on the summary lands here with ?pick=free: the same impact confirm as picking it by hand.
  useEffect(() => {
    if (pickParam !== 'free' || !m.models.some((x) => x.spec === FREE)) return;
    setDlg(undefined);
    lastPart.current = 'helper';
    setChange({ part: 'helper', spec: FREE, choice: null });
    setPickParam(undefined, { replace: true });
  }, [pickParam, setPickParam, m.models, setDlg]);
  const d = m.defaults;
  const load = m.loads.defaults;
  // Each row's held change (core's, any mount's): the helper's agent and the Bots' own.
  const holdAt = useMemo((): ModelAt | null => (m.computer && m.target && m.realm ? { project: m.target.project.id, computer: m.computer.id, realm: m.realm } : null), [m.computer, m.target, m.realm]);
  const helperHeld = useHeldModel(holdAt, d?.helper.agent ?? '');
  const botsHeld = useHeldModel(holdAt, 'bot');
  // Check again reads only from the computer this render shows (`on`), the one whose holds it draws.
  const on = shownComputer();
  // While a save runs, its row shows the dialog busy, not held.
  const heldOf = (p: Part): HeldModel | null => (busy && change?.part === p ? null : p === 'helper' ? helperHeld : botsHeld);
  // Read only while Change or its impact dialog is open: a closed chooser asks nothing.
  const open = pick !== null || change !== null;
  const own = useModelCatalogue(open ? m.target : null, { reads: (tg, ctx) => ({ catalogue: m.readerFor(tg, ctx) }) });
  const pageEv = useMemo(() => evidenceOfAi(m), [m]);
  const cat = useMemo(() => ({ ...own, evidence: newestEvidence(own.evidence, pageEv, own.scope) }), [own, pageEv]);
  const part = pick ?? change?.part ?? null;
  const current = part && d ? (part === 'helper' ? d.helper.effective : d.bots.effective) : '';
  const rules = useMemo(() => (part ? rulesOf(part, current) : null), [part, current]);
  const chooserComputer = useMemo(() => {
    if (!m.computer || !m.target) return null;
    const c = m.target.container;
    return { id: m.computer.id, name: m.computer.name, row: { id: c.id, project_id: m.target.project.id, ...(c.server_name !== undefined ? { server_name: c.server_name } : {}) } };
  }, [m.computer, m.target]);

  if (load === 'loading') return <Skeleton variant="rows" rows={2} />;
  if (!m.realm) return <EmptyState size="sm" icon="realm" title={t('def.chooseRealm')} body={t('def.chooseRealmBody')} />;
  if (load === 'error' || !d || !m.cat) return <ErrorState size="compact" title={t('def.loadFailed')} onRetry={reload} />;
  const rows: Array<{ part: Part; label: string; hint: string; spec: string; follows: boolean }> = [
    { part: 'helper', label: t('def.helper'), hint: t('def.helperHint'), spec: d.helper.effective, follows: false },
    { part: 'bots', label: t('def.bots'), hint: d.bots.model ? t('def.botsOwn') : t('def.botsFollow'), spec: d.bots.effective, follows: !d.bots.model },
  ];
  const agentOf = (p: Part) => (p === 'helper' ? d.helper.agent : 'bot');

  const save = async () => {
    if (!change || !d || !rules) return;
    // The final action judges the pick against the newest evidence of today's scope.
    const ev = cat.evidence;
    const v = providers.judge(change.choice, change.spec, ev, cat.scope, rules);
    if (!v.ok) {
      const model = modelLabel(m.named, change.spec);
      if (v.why === 'unread') return setDlg({ kind: 'failed', message: t('def.unread') });
      setChange(null);
      setDlg(undefined);
      if (v.why === 'needs_consent' || v.why === 'needs_setup') {
        // Back to the chooser for this row: a new pick (consent is per pick; setup is inline there). It shows the
        // evidence Confirm judged; when the page's read decided, the chooser's own reads catch up too.
        if (ev !== own.evidence) cat.retry();
        setAgain({ model, why: v.why === 'needs_consent' ? 'unknown' : 'setup' });
        setPick(change.part);
        return;
      }
      setUi((u) => ({ ...u, [change.part]: { spec: change.spec, out: { kind: 'failed', message: t(v.why === 'scope' ? 'def.scope' : 'def.cannot', { model }) } } }));
      return;
    }
    const unknown = v.readiness === 'unknown';
    if (!holdAt) return;
    setBusy(true);
    // The page's api sends to the computer shown at the call: sendHeld sends nothing if that moved during the lock wait,
    // and its read-back goes to that computer or nowhere.
    const r = await sendHeld(api, holdAt, agentOf(change.part), change.spec, unknown, { defaultAgent: d.helper.agent }, { followsShown: true, on });
    setBusy(false);
    if (r.state === 'stale') return;
    if (r.state === 'saved') {
      setChange(null);
      setDlg(undefined);
      setUi((u) => ({ ...u, [change.part]: { spec: change.spec, out: { kind: 'done', message: savedText(change.spec, unknown) }, unknown } }));
      reload();
      return;
    }
    // The outcome belongs to the setting row (C9): the dialog closes, the row says what happened. A refusal is
    // the row's; an answer that may have applied is core's hold, which the row reads (its readiness kept with it).
    const out: Ui | null = r.state === 'failed'
      ? failedUi(r.err, { provider: m.named.find((x) => x.spec === change.spec)?.providerLabel })
      : r.state === 'not_held' ? { kind: 'not_sent', message: t('def.notHeld') } : null;
    setChange(null);
    setDlg(undefined);
    setUi((u) => ({ ...u, [change.part]: out && out.kind !== 'pending' ? { spec: change.spec, out } : undefined }));
  };

  const savedText = (spec: string, unknown: boolean) =>
    unknown ? t('def.savedUnknown', { computer: m.computer?.name ?? t('name.computer') }) : t('def.saved', { model: modelLabel(m.named, spec) });

  // Check again reads the held change's model back (a read, never a resend); core lets the hold go once the list shows it.
  const check = async (part: Part): Promise<boolean> => {
    const h = heldOf(part);
    if (!h || !holdAt) return false;
    const r = await checkHeld(api, holdAt, agentOf(part), h, { on });
    if (r.state === 'saved') {
      setChange(null);
      setDlg(undefined);
      setUi((u) => ({ ...u, [part]: { spec: h.model, out: { kind: 'done', message: savedText(h.model, h.unknown) }, unknown: h.unknown } }));
      reload();
      return true;
    }
    if (r.state === 'not_confirmed') setUi((u) => ({ ...u, [part]: { spec: h.model, out: { kind: 'pending' }, still: h.id } }));
    return false;
  };

  const impact = change ? impactOf(change.part, d, m.bots) : null;
  const target = change ? m.named.find((x) => x.spec === change.spec) : undefined;
  return (
    <div>
      <SettingGroup>
        {rows.map((r) => {
          const model = m.named.find((x) => x.spec === r.spec);
          const held = heldOf(r.part);
          // A held change shows over any earlier note of the row; a pending note without a hold is gone (settled elsewhere).
          const note = ui[r.part];
          const mine = held ? null : note && note.out.kind !== 'pending' ? note : null;
          return (
            <SettingRow
              key={r.part}
              label={r.label}
              // A model saved with unknown readiness keeps its caveat in the row while the row shows that model (the done
              // outcome itself only flashes).
              help={
                mine && mine.unknown && mine.out.kind === 'done' && mine.spec === r.spec ? (
                  <>
                    {r.hint} {t('def.runsUnknown', { computer: m.computer?.name ?? t('name.computer') })}
                  </>
                ) : (
                  r.hint
                )
              }
              // The row's last change: held (may have gone through: Check again, and Stop tracking once no request of it may
              // still be out, after the page's own warning; the change may still go through later, even over a model chosen
              // next), else its own answer.
              outcome={held ? { kind: 'pending' } : mine?.out}
              // noDetails: an unknown answer has no rejection to show; the hold keeps only the model sent.
              detail={held ? (note?.still === held.id ? t('def.stillNot') : t('err.notConfirmed')) : mine?.out.message}
              onCheck={held ? () => check(r.part) : undefined}
              onStop={held && !held.inFlight ? () => setStopAsk(held) : undefined}
              actions={
                <Button size="sm" variant="secondary" data-def-change={r.part} isDisabled={held !== null} onPress={() => setPick(r.part)}>
                  {t('def.change')}
                </Button>
              }
            >
              <Row gap={2} wrap>
                {/* The model's name is a data leaf (as the agent overview's spec), never explanation text. */}
                <CodeLeaf className={s.truncate}>{modelLabel(m.named, r.spec)}</CodeLeaf>
                {model && <Tag tone={model.ready === 'needs_key' ? 'warn' : 'neutral'}>{tagOf(model) || t('tag.unknown')}</Tag>}
              </Row>
            </SettingRow>
          );
        })}
      </SettingGroup>
      <Drawer resizeKey="ai-default-model"
        isOpen={pick !== null}
        onOpenChange={(o) => {
          if (o) return;
          setPick(null);
          setAgain(null);
        }}
        title={t('pick.title')}
        subtitle={pick === 'bots' ? t('pick.forBots') : t('pick.forHelper')}
        // md: the chooser's list and its inline provider setup get the width the Connect drawer has.
        size="md"
      >
        {pick && rules && (
          <div className={s.stack}>
            {again && (
              <Band
                tone="warn"
                // noDetails: Confirm's own judgement of newer evidence, not a rejection; nothing was sent.
              >
                {t(again.why === 'unknown' ? 'def.askAgain' : 'def.setupNow', { model: again.model })}
              </Band>
            )}
            <ModelPickPanel
              id={`def-${pick}`}
              label={t('pick.title')}
              catalogue={cat}
              computer={chooserComputer}
              // The one model picker in live mode: a pick goes straight to the impact dialog (its Save sends), as before.
              value={{ spec: current, thinking: '' }}
              draft={{ spec: current, thinking: '' }}
              onDraft={() => undefined}
              mode="live"
              rules={rules}
              purpose={pick === 'bots' ? 'bot' : 'default'}
              offer={{ endpoint: true, claude: false }}
              api={chooserApi(api)}
              away={(dest: HandoffDest, provider?: string) => {
                setPick(null);
                setAgain(null);
                if (dest === 'claude') goto('claude');
                else if (dest === 'endpoint') connect(undefined, { endpoint: true });
                else connect(provider);
              }}
              onCommit={(_d, c) => {
                // Nothing is saved here: the pick opens the impact dialog, whose Save sends it (held, C9).
                if (!c || c.kind !== 'model') return { kind: 'done' };
                const p = pick;
                setPick(null);
                setAgain(null);
                setDlg(undefined);
                lastPart.current = p;
                setChange({ part: p, spec: c.spec, choice: c });
                return { kind: 'done' };
              }}
            />
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        isOpen={change !== null}
        onOpenChange={(o) => {
          if (o || busy) return;
          const part = change?.part ?? lastPart.current;
          setChange(null);
          // The picker's own focus return can land after the dialog's: put focus on the row's Change button last. A web page
          // only: the terminal has no document to query (its dialogs return the focus themselves).
          if (hostEnv().browserPage !== true) return;
          for (const ms of [0, 150, 400]) window.setTimeout(() => document.querySelector<HTMLElement>(`[data-def-change="${part}"]`)?.focus(), ms);
        }}
        title={t('impact.title', { model: change ? modelLabel(m.named, change.spec) : '' })}
        confirmLabel={t('impact.save')}
        onConfirm={() => void save()}
        // The picker that opened this confirm closes with it: Escape returns to the row's Change button.
        returnFocus={() => (hostEnv().browserPage === true ? document.querySelector<HTMLElement>(`[data-def-change="${change?.part ?? lastPart.current}"]`) : null)}
        busy={busy}
        typed
        outcome={dlg}
        onCheck={change && heldOf(change.part) ? () => check(change.part) : undefined}
        body={
          // One list of effects, as the disconnect dialog's.
          impact && change ? (
            <Points className={s.list}>
              <Point>{change.part === 'helper' ? t('impact.helper') : t('impact.bots')}</Point>
              {impact.known && impact.follow && impact.follow.length > 0 && change.part === 'bots' && <Point>{t('impact.follow', { names: names(impact.follow) })}</Point>}
              {impact.known && impact.own.length > 0 && <Point>{t('impact.own', { names: names(impact.own) })}</Point>}
              {!impact.known && <Point>{t('impact.unknown')}</Point>}
              {impact.agents.length > 0 && <Point>{t('impact.agents', { names: names(impact.agents) })}</Point>}
              {target && target.pay === 'own_key' && <Point>{t('impact.yourKey', { provider: target.providerLabel })}</Point>}
            </Points>
          ) : null
        }
      />
      <ConfirmDialog
        overlayId="ai-default-model-stop"
        isOpen={stopAsk !== null}
        onOpenChange={(o) => {
          if (!o) setStopAsk(null);
        }}
        tone="danger"
        title={t('def.stop.title')}
        body={t('def.stop.body')}
        confirmLabel={t('def.stop.confirm')}
        onConfirm={() => {
          const h = stopAsk;
          setStopAsk(null);
          if (h) void stopHeld(h);
        }}
      />
    </div>
  );
}
