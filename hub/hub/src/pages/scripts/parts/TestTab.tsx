// The Test tab: two panes at wide widths, the request on the start side and the answer on the other. Saved tests stay
// with the script on its computer; a request can be saved as one, and a saved one run again or removed.
import { hostEnv } from '@core';
import { Button, CodeBlock, ConfirmDialog, EmptyState, Facts, ItemList, NotifyHint, Panel, Select, Stack, Spinner, StatusPill, TextField, cx, formatBytes, notifyAlert, showToast, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { dismissRun, useRunTest, useTests, useTestsDelete, useTestsPut } from '../data';
import { links } from '../links';
import { folderOf, looksJson, methodSuggest, newOpId, probeRoute } from '../logic';
import { scrubDisplay } from '../secrets';
import strings from '../strings.en.json';
import type { CompScripts, ScriptItem, TestCase } from '../types';
import { ChangeBanner, InlineOutcome } from './Bits';
import { forScript, ofPath, readBackOf, useChange } from './ops';
import { sentOf, useOpCheck } from './opcheck';
import s from './parts.module.css';

const rand = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

/**
 * `focusSend`: the detail's pending Try it ask (0 = none); each new value moves focus to Send once the tab shows, then
 * `onSendFocused` consumes it (Send disabled included), so a remount of the tab does not ask again.
 */
type RunAnswer = { status: number; ms: number; body: string; headers?: ReadonlyArray<readonly [string, string]>; size?: number };
/** The answer as it may be shown and kept: its body and every header name and value scrubbed of the request's typed
 *  secrets (a name is a label in the Headers facts, so a secret echoed into it is hidden too). Core hands names over
 *  lower-cased (kit-io), so a name is also scrubbed of each secret's lower-case copy. */
function scrubAnswer(d: RunAnswer, known: readonly string[]): RunAnswer {
  const names = [...known, ...known.map((x) => x.toLowerCase())];
  return { ...d, body: scrubDisplay(d.body, known, 4000), ...(d.headers ? { headers: d.headers.map(([k, v]) => [scrubDisplay(k, names, 4000), scrubDisplay(v, known, 4000)] as const) } : {}) };
}

/** Whether a request sent a value the person typed: a POST with a body, or an address with a query string.
 *  Its answer may repeat that value anywhere, so the answer's content type, headers and body stay out of the page until
 *  the person shows them. A fragment (#…) is never sent, so it does not count. */
const sentTypedValue = (m: 'GET' | 'POST', r: string, b: string): boolean => (m === 'POST' && b !== '') || r.includes('?');

export function TestTab({ item, comp, focusSend = 0, onSendFocused }: { item: ScriptItem; comp: CompScripts; focusSend?: number; onSendFocused?: () => void }) {
  const t = useStrings(strings);
  const grid = useRef<HTMLDivElement>(null);
  const consumed = useRef(onSendFocused);
  consumed.current = onSendFocused;
  useEffect(() => {
    if (!focusSend) return;
    const toSend = () => {
      grid.current?.querySelector<HTMLElement>('[data-send]')?.focus();
      consumed.current?.();
    };
    // Frames are a web page's. A terminal has none (asking for one took the page down): its layout is done when this
    // effect runs.
    if (hostEnv().browserPage !== true) {
      toSend();
      return undefined;
    }
    const id = requestAnimationFrame(toSend);
    return () => cancelAnimationFrame(id);
  }, [focusSend]);
  const tests = useTests(item.id, !!comp.caps?.tests);
  const exec = folderOf(item.path);
  const run = useRunTest(comp.id, exec);
  const put = useTestsPut();
  const del = useTestsDelete();
  const opSaved = useOpCheck();
  const place = `${comp.id}\u0000${item.path}`;
  const send = useChange(place);
  // The saved-tests banner shows this script's tests-put holds on this computer, an earlier visit's included; its Dismiss names the shown ones.
  const putH = forScript(put, ofPath(item.path, comp.id));
  // Removing the last saved case removes the saved set (tests/delete); every other save is a put. Both are this script's saved tests.
  const delH = forScript(del, ofPath(item.path, comp.id));
  const saving = useChange(place, putH, delH);
  const [method, setMethod] = useState<'GET' | 'POST'>(() => methodSuggest(''));
  const [route, setRoute] = useState(() => probeRoute(item.path) ?? item.route);
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [answer, setAnswer] = useState<{ status: number; ms: number; body: string; headers?: ReadonlyArray<readonly [string, string]>; size?: number; at: string; unknown?: boolean; withheld: boolean } | null>(null);
  // The body shows only on the person's Show body; each new answer starts hidden. For a withheld answer
  // (sentTypedValue) the same toggle, named Show answer, also holds back its content type and headers.
  const [bodyShown, setBodyShown] = useState(false);
  const [askAgain, setAskAgain] = useState(false);
  // Remove asks first, bound to the one saved test it names: closes if that test leaves the saved set before the press.
  const [removeId, setRemoveId] = useState<string | null>(null);
  const removeAsk = removeId === null ? undefined : tests.data?.cases.find((x) => x.id === removeId);
  useEffect(() => { if (removeId !== null && !removeAsk) setRemoveId(null); }, [removeId, removeAsk]);
  // b is null for a held POST found after a remount: its body was never kept (it may hold a secret), so it cannot be replayed.
  const last = useRef<{ m: 'GET' | 'POST'; r: string; b: string | null } | null>(null);
  // Back on the tab: a request that may have gone through is still held in core (whatever method it was). The form shows it.
  const held = run.held;
  useEffect(() => {
    if (!held || send.locked) return;
    const m = held.method === 'POST' ? 'POST' : 'GET';
    setMethod(m);
    setRoute(held.route);
    last.current = { m, r: held.route, b: m === 'GET' ? '' : null };
    send.hold();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held?.method, held?.route, held?.compId]);
  const canSave = !!comp.caps?.tests && comp.instances !== null && !item.managed;

  const go = async (m = method, r = route, b = body) => {
    setAnswer(null);
    setBodyShown(false);
    last.current = { m, r, b };
    const res = await send.run(() => run.mutateAsync({ compId: comp.id, exec, method: m, route: r, ...(m === 'POST' ? { body: b } : {}) }));
    // The script answered: a browser alert for a person who has looked away (notifyAlert does nothing otherwise). Once per
    // send, and its words are fixed: never the script's name, request or answer. A click opens this tab of this script in
    // its own exec folder (links.script adds ?exec= past folder 1), so the answer shown here stays mounted. The tag is that
    // address (it carries the folder; the item id does not), so two folders' scripts of one name never replace each other's alert.
    if (res?.outcome === 'done') {
      const at = links.script(item.compHandle, item.path);
      void notifyAlert('script', { title: t('test.alertTitle'), body: t('test.alertBody'), tag: at ?? item.id, to: (at ? `${at}&tab=test` : links.list) as `/${string}` });
    }
    // Scrubbed once, here, against the request that produced it (not the form, which may change while it shows): only
    // the scrubbed text is kept.
    // Withheld is decided from that same request, never from the form.
    if ((res?.outcome === 'done' || res?.outcome === 'pending') && res.data) setAnswer({ ...scrubAnswer(res.data, m === 'POST' && b ? [b] : []), at: new Date().toISOString(), withheld: sentTypedValue(m, r, b), ...(res.outcome === 'pending' ? { unknown: true } : {}) });
  };

  // The unlock after "may have gone through": a test send has no read that proves whether it ran, so the way out is this choice.
  // Send again asks first, for any method (the earlier request may already have been applied), then closes the hold and sends the
  // request again; a held POST found after a remount has no body left to send, so it only closes the hold.
  const sendAgain = () => {
    const q = last.current;
    setAskAgain(false);
    if (!q) return;
    // Dismiss: core keeps no read that proves a request ran, so the person closes the hold knowingly.
    dismissRun({ compId: comp.id, exec, method: q.m, route: q.r });
    send.settle();
    if (q.b !== null) void go(q.m, q.r, q.b);
  };
  const onSendAgain = () => setAskAgain(true);
  // A held POST found after a remount (b null) only stops tracking: its labels say so, never Send again.
  const again =
    last.current?.b === null
      ? ({ button: 'test.stopTrack', title: 'test.stopTrackTitle', body: 'test.stopTrackBody', confirm: 'test.stopTrackConfirm' } as const)
      : ({ button: 'test.sendAgain', title: 'test.sendAgainTitle', body: 'test.sendAgainBody', confirm: 'test.sendAgainConfirm' } as const);

  const writeCases = async (cases: TestCase[], doneText: string) => {
    const opId = newOpId(rand);
    const rev = tests.data?.revision ?? null;
    const last = cases.length === 0 && rev !== null;
    const vars = { compId: comp.id, path: item.path, ifRevision: rev as string, opId };
    // The cases may hold a secret: the lock variables kept for the Check never do.
    const r = await saving.run(() => (last ? del.mutateAsync(vars) : put.mutateAsync({ ...vars, ifRevision: rev, cases })));
    opSaved.remember(sentOf(last ? del : put, { compId: comp.id, path: item.path, opId, vars: { compId: comp.id, path: item.path } }, r), place);
    if (r?.outcome === 'done') {
      void tests.refetch();
      showToast({ title: doneText, tone: 'ok' });
    }
    return r;
  };

  const saveAsTest = async () => {
    if (!name.trim() || !tests.data) return;
    const c: TestCase = { id: `t${Date.now().toString(36)}`, name: name.trim(), method, route, ...(method === 'POST' && body ? { body: { type: 'text', value: body } } : {}) };
    const r = await writeCases([...tests.data.cases, c], t('test.savedToast'));
    if (r?.outcome === 'done') setName('');
  };

  // The answer as shown (already scrubbed when stored), coloured as JSON when it is JSON, plain otherwise (the text never changes).
  const shownBody = answer && bodyShown ? answer.body : '';
  // A withheld answer's content type and headers draw only with its body; any other answer shows them at once.
  const factsShown = !!answer && (!answer.withheld || bodyShown);

  return (
    <Stack gap={4}>
      <div className={s.testGrid} ref={grid}>
        <Panel title={t('test.request')} description={t('test.body')}>
          <Stack gap={3}>
            <div className={s.testRow}>
              <Select
                label={t('test.method')}
                options={[
                  { value: 'GET', label: 'GET' },
                  { value: 'POST', label: 'POST' },
                ]}
                value={method}
                onChange={(v) => setMethod(v as 'GET' | 'POST')}
              />
              <TextField label={t('test.address')} value={route} onChange={setRoute} mono className={s.grow} />
            </div>
            {method === 'POST' ? <TextField label={t('test.requestBody')} value={body} onChange={setBody} multiline rows={6} mono /> : null}
            <div className={s.actions}>
              <Button variant="primary" icon="play" busy={send.busy} isDisabled={send.locked} onPress={() => void go()} data-send="">
                {t('test.send')}
              </Button>
              <InlineOutcome out={send.out} what="tests" onDismiss={send.settle} />
              {send.out?.kind === 'pending' ? <Button size="sm" icon="reload" onPress={onSendAgain}>{t(again.button)}</Button> : null}
            </div>
            <ConfirmDialog
              overlayId="script-test-remove"
              isOpen={!!removeAsk}
              onOpenChange={(o) => { if (!o) setRemoveId(null); }}
              title={t('test.removeTitle', { name: removeAsk?.name ?? '' })}
              body={t('test.removeBody')}
              tone="danger"
              confirmLabel={t('test.remove')}
              // A change to the saved tests that began while the confirm is open leaves it open with Remove off, saying why.
              {...(saving.locked ? { confirmDisabled: true, confirmDisabledReason: t('test.removeWait') } : {})}
              onConfirm={() => {
                const c = removeAsk;
                if (c && saving.locked) return;
                setRemoveId(null);
                if (!c) return;
                void writeCases(tests.data?.cases.filter((x) => x.id !== c.id) ?? [], t('test.removedToast'));
              }}
            />
            <ConfirmDialog
              isOpen={askAgain}
              onOpenChange={setAskAgain}
              title={t(again.title)}
              body={t(again.body)}
              confirmLabel={t(again.confirm)}
              onConfirm={sendAgain}
            />
            {canSave ? (
              <div className={s.testRow}>
                <TextField label={t('test.saveName')} value={name} onChange={setName} className={s.grow} />
                <Button isDisabled={!name.trim() || saving.locked || !tests.data} busy={saving.busy} onPress={() => void saveAsTest()}>
                  {t('test.saveAs')}
                </Button>
              </div>
            ) : null}
          </Stack>
        </Panel>
        <Panel title={t('test.answer')}>
          {send.busy ? (
            <>
              <Spinner label={t('outcome.busy')} />
              <NotifyHint kind="script" />
            </>
          ) : answer ? (
            <div className={s.answer} role="status">{/* the live answer of the send */}
              <StatusPill tone={answer.unknown ? 'warn' : answer.status < 400 ? 'ok' : 'danger'} dot>
                {answer.unknown ? t('test.unknown') : answer.status < 400 ? t('test.ok') : t('test.failed')} · {answer.status}
              </StatusPill>
              <span className={s.faint}>{t('test.took', { ms: answer.ms })}</span>
              {answer.headers && answer.size !== undefined ? (
                <>
                  <Facts
                    className={s.answerWide}
                    items={[
                      ...(factsShown ? [{ label: t('test.contentType'), value: answer.headers.find(([k]) => k === 'content-type')?.[1] ?? t('test.noType'), mono: true }] : []),
                      { label: t('test.size'), value: formatBytes(answer.size) },
                    ]}
                  />
                  {factsShown ? (
                    <>
                      <span className={cx(s.faintBlock, s.answerWide)} aria-hidden>{t('test.headers')}</span>
                      {answer.headers.length > 0 ? (
                        <Facts className={s.answerWide} label={t('test.headers')} columns={1} items={answer.headers.map(([k, v]) => ({ label: k, value: v, mono: true }))} />
                      ) : (
                        <span className={cx(s.faint, s.answerWide)}>{t('test.noHeaders')}</span>
                      )}
                    </>
                  ) : null}
                </>
              ) : null}
              {answer.withheld && !bodyShown ? <span className={cx(s.faint, s.answerWide)}>{t('test.withheldNote')}</span> : null}
              <span className={s.answerWide}>
                <Button size="sm" variant="ghost" aria-expanded={bodyShown} onPress={() => setBodyShown((v) => !v)}>
                  {answer.withheld ? (bodyShown ? t('test.hideAnswer') : t('test.showAnswer')) : bodyShown ? t('test.hideBody') : t('test.showBody')}
                </Button>
              </span>
              {bodyShown ? <CodeBlock className={s.answerCode} label={t('test.answer')} code={shownBody} lang={looksJson(shownBody) ? 'json' : 'plain'} wrap // reason: a response body that is not JSON shows as the server sent it
              /> : null}
            </div>
          ) : (
            <EmptyState size="sm" icon="play" title={t('test.noAnswer')} body={t('test.noAnswerBody')} />
          )}
        </Panel>
      </div>
      {/* Padded like every card: the rows and their actions keep the panel's inline edges. */}
      <Panel title={t('test.saved')}>
        <ChangeBanner out={saving.out} what="tests" onDismiss={saving.settle} onCheck={() => opSaved.checkWith(place, saving.settle, () => readBackOf(saving.settle, putH, delH), () => { void tests.refetch(); })} onForce={saving.force} />
        {!comp.caps?.tests ? (
          <EmptyState size="sm" icon="info" title={t('test.oldKit')} body={t('test.oldKitBody')} />
        ) : tests.data && tests.data.cases.length > 0 ? (
          <ItemList
            label={t('test.saved')}
            items={tests.data.cases.map((c) => {
              const runIt = {
                id: 'run',
                label: t('test.run'),
                icon: 'play' as const,
                ...(send.locked ? { disabledReason: t('test.runWait') } : {}),
                onPress: () => {
                  // A held send stays bound to its own request (Send again resends it): nothing replaces it until it settles.
                  if (send.locked) return;
                  const m = c.method === 'POST' ? 'POST' : 'GET';
                  setMethod(m);
                  setRoute(c.route);
                  void go(m, c.route, typeof c.body?.value === 'string' ? c.body.value : '');
                },
              };
              // Remove waits, with its reason, while another change to the saved tests is still open.
              const removeIt = { id: 'remove', label: t('test.remove'), ...(saving.locked ? { disabledReason: t('test.removeWait') } : {}), onPress: () => setRemoveId(c.id) };
              return { id: c.id, title: c.name, meta: [`${c.method} ${c.route}`] as const, actions: { inline: canSave ? ([runIt, removeIt] as const) : ([runIt] as const) } };
            })}
          />
        ) : (
          <EmptyState size="sm" title={t('test.noSaved')} body={t('test.noSavedBody')} />
        )}
      </Panel>
    </Stack>
  );
}
