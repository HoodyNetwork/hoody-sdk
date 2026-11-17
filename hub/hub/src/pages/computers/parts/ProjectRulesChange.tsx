// Change a project's access rules:
// No project rules, Only my IP, Only these IPs or Private, offered over a document that is one of them (projectMode) to the owner
// and to a Full control member. Save… reads the rules again and, for the owner, the project's computers with whether
// each keeps rules of its own; any read failing: no confirm. Rules that read differently from what was shown are
// shown again and need a second press (as the computer drawer's "Use only the project's rules"). The confirm always
// opens with the chosen mode's line, then the owner's counts "of the computers shown" or, for a member, that the Hub
// can't list them, then the lines every confirm carries; never a promise for a computer with rules of its own.
//
// The write goes with If-Match, the version read at the press: 412 means changed elsewhere, nothing changed here. A
// lost answer is held by core (lock project.rules, base host, every realm view) and only a fresh read of the rules
// frees it (projectWriteVerdict, in core); Check again never sends again. For a held write the tab shows only core's
// state, by hold token: the band while a token is held, and one neutral line once the token it showed is gone (core
// does not say how it ended, so neither does the tab). An answer this tab got (saved, 412, a refusal) belongs to the
// attempt that got it and goes as soon as a hold is shown or the token changes. The tracking stays while the rules
// can't be read or read as set elsewhere; only the choices and Save need a document of the three.
// Only my IP is the address read at the press: a failed, paused or non-IPv4 read asks nothing.
// Only these IPs is a typed list (the kit's IPv4 list field, with Add my IP): it opens on the ranges the document
// holds, so none is lost unless the person deletes it; an entry the Hub can't take is named and Save stays off. Its
// confirm names every address, the ones no longer allowed, and the caller's own address when the list leaves it out
// (read at the press; a read that fails says it can't tell and still asks: the list may be for another place).
import { heldChanges } from '@core';
import { Band, Button, ConfirmDialog, ErrorState, RadioGroup, SettingGroup, SettingRow, Stack, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { readProjectComputers, rulesVarsOf, useClearProjectRules, useMyIp, useProjectRules, useSetProjectRules } from '../data';
import strings from '../strings.en.json';
import type { Project } from '../types';
import { type AccessRules, coversIp, ipsText, modeOf, parseIps, sameRanges, V4 } from './access.logic';
import accStrings from './AccessDrawer.strings.en.json';
import { IpsList, MyIp } from './AccessDrawer';
import { type ConfirmLine, counts, type IpsConfirm, projectBodyFor, projectMode, type ProjectWant, rulesConfirmLines } from './projectPerms.logic';
import { refusal, type RefusalFacts, type RunnerResult, useRunner, useShownRealm } from './runner';

type Kind = ProjectWant['kind'];
const PRECONDITION = 412;
/** The ranges a document lets in when it is one of the two address choices; none otherwise. */
function rangesOf(doc: AccessRules | undefined): string[] {
  const m = doc ? modeOf(doc, 'no') : null;
  return m?.kind === 'ips' ? m.entries.map((e) => e.range) : m?.kind === 'myIp' ? [`${m.ip}/32`] : [];
}
/** The same document: version and content (what the person was shown is what they confirm). */
const sameDoc = (a: AccessRules, b: AccessRules) => JSON.stringify(a) === JSON.stringify(b);

export function ProjectRulesChange({ project, doc, editable, owner }: {
  project: Project;
  /** The project's document as the tab shows it now; undefined while it can't be read. */
  doc: AccessRules | undefined;
  /** The choices and Save are offered: a document of the three (projectMode) and a caller who may change it. The
   *  tracking of a send shows either way. */
  editable: boolean;
  /** The caller owns the project: only the owner can list its computers, so only the owner's confirm counts them. */
  owner: boolean;
}) {
  const t = useStrings(strings);
  const tt = useStrings(accStrings);
  const rules = useProjectRules(project, true);
  const mode = doc ? projectMode(doc) : null;
  const shownMode = doc ? modeOf(doc, 'no') : null;
  const current: Kind | null = editable && (mode === 'none' || mode === 'myIp' || mode === 'ips' || mode === 'private') ? mode : null;
  const [choice, setChoice] = useState<Kind | null>(current);
  // The person's own pick stays through re-reads (a press that found the rules changed asks for a second press of the
  // same pick); until they pick, or once their send is through, the choice follows the document.
  const [picked, setPicked] = useState(false);
  // pick: stable per project (core's runner re-reads its holds when it changes).
  const [pickSet] = useState(() => (i: Record<string, unknown>) => i.project === project.id && i.want !== 'none');
  const [pickClear] = useState(() => (i: Record<string, unknown>) => i.project === project.id && i.want === 'none');
  const set = useRunner(useSetProjectRules(), { lock: 'project.rules', change: 'projectRulesSet', pick: pickSet, vars: rulesVarsOf });
  const clear = useRunner(useClearProjectRules(), { lock: 'project.rules', change: 'projectRulesClear', pick: pickClear, vars: rulesVarsOf });
  const realm = useShownRealm();
  const held = set.held ?? clear.held;
  const heldRunner = set.held ? set : clear.held ? clear : null;
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<'error' | 'listFailed' | 'changed' | 'ipChanged' | null>(null);
  const [asking, setAsking] = useState<{ want: ProjectWant; from: number; body: Record<string, unknown> | null; lines: ConfirmLine[] } | null>(null);
  // Stop tracking asks about the hold shown at its press (its runner and send token): a different hold meanwhile
  // closes the ask, and the ask frees only that one.
  const [dismissing, setDismissing] = useState<{ kind: 'set' | 'clear'; hold: string } | null>(null);
  // This tab's own answer, for the attempt (send) that got it: shown only while it is still the latest attempt and no
  // hold has been shown since.
  const attempt = useRef(0);
  const [local, setLocal] = useState<{ id: number; kind: 'saved' | 'stale' | 'notSaved'; error?: ReturnType<typeof refusal> } | null>(null);
  // The hold token this tab last showed, and whether it went (core freed it: proved, or dismissed in another tab).
  const [ended, setEnded] = useState(false);
  // A press's reads and a send belong to the moment they started: a newer press, send or Dismiss makes them write nothing.
  const step = useRef(0);
  useEffect(() => () => { step.current++; }, []);
  useEffect(() => {
    if (!picked && !held && !reading) setChoice(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the document's own choice only
  }, [current, picked]);
  const me = useMyIp(editable && choice === 'myIp');
  // Only these IPs: the list as typed, or (null) the ranges the document holds now, so opening the choice never
  // drops an address already let in.
  const [typed, setTyped] = useState<string | null>(null);
  const held0 = rangesOf(doc);
  const listText = typed ?? ipsText(held0);
  const typedList = parseIps(listText);
  const listOk = typedList.errors.length === 0 && !typedList.tooMany && typedList.ranges.length > 0;
  // The address in use now: only a read that answered and is not failing or waiting (a failed refresh keeps the
  // earlier answer cached; that address may be one the person no longer uses).
  const ipFailed = me.isError || me.fetchStatus === 'paused';
  const ip = !ipFailed && me.data?.version === 4 ? me.data.ip : null;
  // Only my IP over a stored address that is not the one in use now is a change (the person moved).
  // Only these IPs is a change when the list is not exactly the ranges the document lets in now.
  const same = choice === 'ips' ? sameRanges(typedList.ranges, held0) : choice === current && (choice !== 'myIp' || (shownMode?.kind === 'myIp' && (shownMode.ip === ip || ip === null)));
  const want: ProjectWant | null = !choice || same ? null
    : choice === 'ips' ? (listOk ? { kind: 'ips', ranges: typedList.ranges } : null)
    : choice === 'myIp' ? (ip ? { kind: 'myIp', ip } : null) : { kind: choice };
  const writable = editable && !!doc && !!want && (want.kind === 'none' || projectBodyFor(doc, want, project.id) !== null);
  const busy = set.busy || clear.busy || reading;
  // Core's hold, by token. A token shown, or a new one, retires this tab's own answer, closes an open confirm and voids
  // a press still reading (nothing this tab prepared before the hold may send under it). The token going retires the
  // answer too, and, unless this tab's own Stop tracking freed it, leaves the neutral line.
  const token = held ? (heldRunner?.hold ?? 'untokened') : null;
  const shownToken = useRef<string | null>(null);
  const dropped = useRef<string | null>(null);
  useEffect(() => {
    const was = shownToken.current;
    shownToken.current = token;
    if (token !== null) {
      if (token !== was) { attempt.current++; step.current++; setLocal(null); setEnded(false); setAsking(null); setReading(false); }
    } else if (was !== null) {
      attempt.current++;
      setLocal(null);
      setEnded(dropped.current !== was);
    }
  }, [token]);
  const mine = held ? null : local && local.id === attempt.current ? local : null;
  const stale = mine?.kind === 'stale';
  const notSaved = mine?.kind === 'notSaved';
  const shown = !held && ended ? 'settled' : mine?.kind === 'saved' ? 'saved' : null;
  // The Stop tracking ask is about the hold it was pressed for: once that is not the hold shown, it is closed.
  const askHold = heldRunner && !heldRunner.elsewhere ? heldRunner.hold : undefined;
  const dismissFor = dismissing && askHold === dismissing.hold && (dismissing.kind === 'set' ? set.held : clear.held) ? dismissing : null;
  useEffect(() => {
    if (dismissing && !dismissFor) setDismissing(null);
  }, [dismissing, dismissFor]);

  async function press() {
    if (!want || !doc) return;
    const at = ++step.current;
    const shownDoc = doc;
    setNote(null);
    attempt.current++;
    setLocal(null);
    setEnded(false);
    setReading(true);
    try {
      // Only my IP: the address is read again now, and the body and the confirm are that read's.
      const [r, list, addr] = await Promise.all([
        rules.refetch(),
        owner ? readProjectComputers(project.id) : Promise.resolve(null),
        want.kind === 'myIp' || want.kind === 'ips' ? me.refetch() : Promise.resolve(null),
      ]);
      if (at !== step.current) return;
      let asked: ProjectWant = want;
      if (want.kind === 'myIp') {
        // A failed or non-IPv4 read shows as such (MyIp, or the read error) and asks nothing.
        if (!addr || addr.isError || addr.data?.version !== 4) return;
        if (addr.data.ip !== want.ip) return setNote('ipChanged');
        asked = { kind: 'myIp', ip: addr.data.ip };
      }
      const fresh = r.isError ? undefined : r.data?.[project.id];
      if (!fresh) return setNote('error');
      if (owner && list === null) return setNote('listFailed');
      if (!sameDoc(fresh, shownDoc)) return setNote('changed');
      const body = asked.kind === 'none' ? null : projectBodyFor(fresh, asked, project.id);
      if (asked.kind !== 'none' && !body) return;
      // Only these IPs: what the fresh document lets in that the list leaves out, and the caller's own address as this
      // press read it (a failed or paused read is no address, also over an earlier answer).
      let ips: IpsConfirm | undefined;
      // Only my IP over other addresses: the confirm names the ones that go.
      if (asked.kind === 'myIp') {
        const only = `${asked.ip}/32`;
        ips = { removed: rangesOf(fresh).filter((x) => x !== only), me: { ip: asked.ip, inside: true } };
      }
      if (asked.kind === 'ips') {
        const ranges = asked.ranges;
        const d = addr && !addr.isError && addr.fetchStatus !== 'paused' ? addr.data : null;
        ips = {
          removed: rangesOf(fresh).filter((x) => !ranges.includes(x)),
          me: d?.version === 4 && V4.test(d.ip) ? { ip: d.ip, inside: coversIp(ranges, d.ip) } : d?.version === 6 ? 'v6' : 'unknown',
        };
      }
      setAsking({ want: asked, from: fresh.version, body, lines: rulesConfirmLines(asked, list ? counts(list) : null, ips) });
    } finally {
      if (at === step.current) setReading(false);
    }
  }

  async function send(a: { want: ProjectWant; from: number; body: Record<string, unknown> | null }) {
    setAsking(null);
    // No attempt starts while a hold is shown (the confirm closes when one is adopted; this guards a press racing it).
    if (shownToken.current !== null) return;
    const at = ++step.current;
    const id = ++attempt.current;
    setLocal(null);
    setEnded(false);
    const v = { pid: project.id, want: a.want, from: a.from, ...(a.body ? { body: a.body } : {}) };
    const res = (a.want.kind === 'none' ? await clear.run(v) : await set.run(v)) as RunnerResult & RefusalFacts;
    // A newer attempt, a hold shown meanwhile, or the drawer gone: this answer is no longer the tab's to show.
    if (at !== step.current || id !== attempt.current) return;
    if (res.outcome === 'done') {
      setLocal({ id, kind: 'saved' });
      setPicked(false);
      // The list follows the document again (the rules read after this shows what was saved).
      setTyped(null);
      void rules.refetch();
      return;
    }
    // Unknown: core holds it (the band, from the next render) or already freed it on a read that proved it.
    if (res.outcome === 'pending') {
      if (!heldChanges('project.rules', { realm }).some((h) => pickSet(h.identity as Record<string, unknown>) || pickClear(h.identity as Record<string, unknown>))) setEnded(true);
      return;
    }
    if (res.outcome !== 'failed' && res.outcome !== 'not_sent') return;
    const facts: RefusalFacts = {
      ...(typeof res.status === 'number' ? { status: res.status } : {}),
      ...(typeof res.retryAfter === 'number' ? { retryAfter: res.retryAfter } : {}),
      ...(typeof res.traceId === 'string' ? { traceId: res.traceId } : {}),
      ...(typeof res.route === 'string' ? { route: res.route } : {}),
    };
    const error = refusal({ kind: res.outcome, ...(res.code ? { code: res.code } : {}), facts });
    const isStale = res.outcome === 'failed' && (res.status === PRECONDITION || res.code === 'PRECONDITION_FAILED');
    setLocal({ id, kind: isStale ? 'stale' : 'notSaved', error });
  }

  // Nothing to offer and nothing to track: no empty block in the tab.
  if (!editable && !held && !stale && !notSaved && !shown) return null;
  const line = (l: ConfirmLine) => t(l.key as never, { ...l.vars, ...(l.effect ? { effect: t(l.effect.key as never, l.effect.vars) } : {}) } as never);
  return (
    <Stack gap={3}>
      {editable ? (<>
      {/* One setting row: its label names the choices (the radio group carries no label of its own), Save… at its end.
          Only my IP's address and its warnings sit under that choice while it is picked. */}
      <SettingGroup variant="field">
        <SettingRow
          label={t('pp.rules.choice')}
          actions={<Button size="sm" variant="secondary" isDisabled={!writable || held !== null || busy} onPress={() => void press()}>{t('pp.rules.save')}</Button>}
        >
          {(ids) => (
            <RadioGroup<Kind>
              aria-labelledby={ids.nameId}
              value={choice ?? undefined}
              onChange={(v) => { setChoice(v); setPicked(true); attempt.current++; setLocal(null); setEnded(false); setNote(null); }}
              isDisabled={held !== null || busy}
              options={[
                { value: 'none', label: t('pp.rules.c.none'), description: t('pp.rules.c.noneHelp') },
                {
                  value: 'myIp',
                  label: t('pp.rules.c.myIp'),
                  description: t('pp.rules.c.myIpHelp'),
                  reveal: ipFailed && me.data ? <ErrorState size="compact" error={me.error} title={tt('acc.ipError')} onRetry={() => void me.refetch()} /> : <MyIp q={me} />,
                },
                {
                  value: 'ips',
                  label: t('pp.rules.c.ips'),
                  description: t('pp.rules.c.ipsHelp'),
                  reveal: (
                    <IpsList
                      value={listText}
                      isDisabled={held !== null || busy}
                      onChange={(up) => { setTyped((cur) => up(cur ?? ipsText(held0))); setPicked(true); attempt.current++; setLocal(null); setEnded(false); setNote(null); }}
                    />
                  ),
                },
                { value: 'private', label: t('pp.rules.c.private'), description: t('pp.rules.c.privateHelp') },
              ]}
            />
          )}
        </SettingRow>
      </SettingGroup>
      {note ? <Band tone="warn" size="table" /* noDetails: why nothing was asked, not a rejection */>{t(`pp.rules.${note}`)}</Band> : null}
      </>) : null}
      {held && heldRunner ? (
        <Band
          tone="warn"
          size="table"
          /* noDetails: an unknown outcome has no rejection to show; Check again reads the rules back */
          actions={heldRunner.elsewhere ? undefined : (
            <>
              <Button size="sm" onPress={() => void heldRunner.check()}>{tt('acc.held.check')}</Button>
              <Button size="sm" variant="ghost" onPress={() => { if (heldRunner.hold) setDismissing({ kind: heldRunner === set ? 'set' : 'clear', hold: heldRunner.hold }); }}>{tt('acc.held.dismiss')}</Button>
            </>
          )}
        >
          {t('pp.rules.held')}
        </Band>
      ) : null}
      {stale ? (
        <Band tone="warn" size="table" error={mine?.error} actions={<Button size="sm" onPress={() => { attempt.current++; setLocal(null); void rules.refetch(); }}>{tt('acc.stale.reload')}</Button>}>
          {t('pp.rules.stale')}
        </Band>
      ) : null}
      {notSaved ? <Band tone="danger" size="table" error={mine?.error}>{t('pp.rules.notSaved')}</Band> : null}
      {shown ? <Band tone="neutral" size="table" /* noDetails: the API's answer to this tab's send, or core no longer holding a write; not a rejection */>{t(`pp.rules.${shown}`)}</Band> : null}
      <ConfirmDialog overlayId="computers-project-rules-confirm"
        isOpen={asking !== null && editable && !held}
        onOpenChange={(o) => !o && setAsking(null)}
        title={t('pp.rules.confirm.title', { name: project.name })}
        body={asking ? (
          <Stack gap={3}>
            {asking.lines.map((l) => <p key={l.key}>{line(l)}</p>)}
          </Stack>
        ) : ''}
        confirmLabel={t('pp.rules.go')}
        onConfirm={() => { if (asking) void send(asking); }}
      />
      <ConfirmDialog overlayId="computers-project-rules-change-confirm-dialog"
        isOpen={dismissFor !== null}
        onOpenChange={(o) => !o && setDismissing(null)}
        title={tt('acc.held.dismissTitle')}
        body={tt('acc.held.dismissBody')}
        confirmLabel={tt('acc.held.dismissGo')}
        onConfirm={() => {
          const d = dismissFor;
          setDismissing(null);
          // This render's runner frees the hold it shows (core's dismiss names it); it is the one asked about.
          const r = d ? (d.kind === 'set' ? set : clear) : null;
          if (!d || !r || r.hold !== d.hold) return;
          // The person's own decision: its going leaves no line.
          dropped.current = d.hold;
          step.current++;
          void r.dismiss();
        }}
      />
    </Stack>
  );
}

