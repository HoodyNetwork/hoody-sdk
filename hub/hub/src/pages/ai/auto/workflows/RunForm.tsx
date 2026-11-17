// Run…: the drawer that starts a run of one workflow (runApi.ts says what is sent and why a lost
// answer is never sent again). It asks for the workflow's declared inputs and an optional message, says that the run
// opens a new chat and spends, and shows what the start did: started (with its chat), refused (a spending limit named
// as one), or unknown, with Check again listing the runs that may be it.
// A start's store outlives the drawer (one per account, computer, realm and workflow, by identity, for the page's life):
// closing and reopening the drawer on an unknown start shows it again, so reopening never sends a second start. A
// drawer whose page has moved to another computer, account or realm sends and reads nothing and says so.
import { Band, Button, Drawer, formatDateTime, Link, Outcome, RadioGroup, Row, Stack, TextButton, TextField, useStrings } from '@kit';
import { capture, useCore, type Ctx } from '@core';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { scopeOf } from './createAttempts';
import type { Workflow } from './logic';
import { createRunStore, runBodyOf, workflowRunApi, type RunApi, type RunStore, type RunView } from './runApi';
import type { ChatHref } from './Runs';
import strings from './Run.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

const stores = new Map<string, RunStore>();
/** Makes the calls of one start (each call is given its context). */
export type MakeRunApi = (name: string, realm: string) => RunApi;

/** The start store of `workflow` in `scope` (createAttempts.ts scopeOf: account, project, computer and the run's realm),
 *  made once, so it follows the computer's identity, never its name, and does not depend on the realm the page shows.
 *  `makeApi`: tests. */
export function runStoreFor(scope: string, realm: string, workflow: string, makeApi: MakeRunApi = workflowRunApi): RunStore {
  const key = `${scope}|${workflow}`;
  let s = stores.get(key);
  if (!s) { s = createRunStore({ api: makeApi(workflow, realm), workflow, realm }); stores.set(key, s); }
  return s;
}
/** Tests: forgets every store. */
export function resetRunStores(): void { stores.clear(); }

/** A store for a drawer opened where no computer is shown: it never sends (the drawer offers nothing then). */
const NONE = createRunStore({ api: { start: async () => ({ ok: false, err: { kind: 'not_sent', code: '', status: 0 } }), list: async () => ({ ok: false }) }, workflow: '', realm: '' });

export interface RunFormProps {
  workflow: Workflow;
  /** The realm the workflow was listed in ('global' or a 24-hex id). */
  realm: string;
  computer: string;
  chatHref?: ChatHref;
  onClose(): void;
  /** Tests: the calls. */
  makeApi?: MakeRunApi;
}

export function RunForm({ workflow: w, realm, computer, chatHref, onClose, makeApi }: RunFormProps) {
  const t = useStrings(strings);
  // The computer, account and realm the drawer opened on: its start belongs to them.
  // The drawer's place when it opened: the start's scope and the realm the page showed (they differ when the page names a
  // realm). Calls go only while the page is still there.
  const [opened] = useState(() => { const c = capture(); return { scope: scopeOf(c, realm), page: c.realm }; });
  const scope = opened.scope;
  useCore();
  // The page shows another computer, account or realm now: nothing is sent or read, and the outcome is not shown here.
  const here = (): Ctx | null => { const c = capture(); return scope !== null && c.realm === opened.page && scopeOf(c, realm) === scope ? c : null; };
  const moved = here() === null;
  const store = useMemo(() => (scope === null ? NONE : runStoreFor(scope, realm, w.name, makeApi)), [scope, realm, w.name, makeApi]);
  const v = useSyncExternalStore(store.subscribe, store.view, store.view);
  const [values, setValues] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState('');
  const [tried, setTried] = useState(false);
  // Something was typed (Close then asks first while nothing was sent).
  const [typed, setTyped] = useState(false);
  const built = runBodyOf(w.params, values, prompt);
  const problem = 'problem' in built ? built.problem : null;
  const busy = v.phase === 'running';
  const held = moved || v.phase === 'running' || v.phase === 'unsure';
  const start = () => {
    setTried(true);
    if ('body' in built) void store.start(built.body, here());
  };
  // A refusal started nothing, so Start run stays; a started or unknown start has none (Run again clears a started one).
  const primary = moved || v.phase === 'done' || v.phase === 'unsure' ? undefined : (
    <Button variant="primary" busy={busy} isDisabled={held} onPress={() => { if (v.phase === 'refused') store.clear(); start(); }}>
      {t('run.start')}
    </Button>
  );
  const idle = v.phase === 'idle';
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('run.title', { name: w.name })}
      subtitle={t('run.subtitle', { computer })}
      size="md"
      resizeKey="ai-workflow-run"
      overlayId="ai-workflow-run"
      busy={busy}
      dirty={idle && typed}
      outcome={moved ? undefined : <RunOutcome t={t} v={v} name={w.name} computer={computer} store={store} here={here} />}
      primary={primary}
    >
      <Stack gap={4}>
        {moved ? <Band tone="warn" size="table" /* noDetails: nothing was sent; the words say what changed */>{v.phase === 'idle' ? t('run.movedIdle') : t('run.moved', { computer })}</Band> : null}
        {moved ? null : <RunNext t={t} v={v} realm={realm} chatHref={chatHref} store={store} />}
        {w.params.map((p) => (
          <TextField
            key={p.name}
            label={p.name}
            value={Object.hasOwn(values, p.name) ? values[p.name] ?? '' : ''}
            onChange={(x) => { setTyped(true); setValues((o) => ({ ...o, [p.name]: x })); }}
            isDisabled={held}
            isRequired={p.required}
            placeholder={p.default ?? undefined}
            isInvalid={tried && problem === p.name}
          />
        ))}
        {tried && problem !== null && <Band tone="danger" size="table" /* noDetails: the form's own check, nothing was sent */>{t('run.problem', { name: problem })}</Band>}
        <TextField label={t('run.prompt')} description={t('run.promptHelp')} value={prompt} onChange={(x) => { setTyped(true); setPrompt(x); }} isDisabled={held} multiline rows={3} />
      </Stack>
    </Drawer>
  );
}

/** What a start did, in the drawer's outcome slot. */
function RunOutcome({ t, v, name, computer, store, here }: { t: T; v: RunView; name: string; computer: string; store: RunStore; here: () => Ctx | null }) {
  if (v.phase === 'idle') return null;
  if (v.phase === 'running') return <Outcome outcome="pending" title={t('run.out.sending', { name })} /* noDetails: still out, nothing came back */ />;
  if (v.phase === 'done') return <Outcome outcome="done" title={v.picked ? t('run.out.picked') : t('run.out.started', { name })} />;
  if (v.phase === 'refused') {
    const title = v.notSent ? t('run.out.notSent')
      : v.spendCap ? t('run.out.spendCap')
      : v.code === 'workflow_not_found' ? t('run.out.notFound', { name, computer })
      : v.code === 'turn_in_flight' ? t('run.out.busy')
      : t('run.out.refused');
    return <Outcome outcome="failed" title={title} /* noDetails: only the agent's code is kept; the words say what it means */ />;
  }
  const seen = v.observed === 'unchecked' || v.observed === 'checking' ? t('run.seen.unchecked')
    : v.observed === 'failed' ? t('run.seen.failed')
    : v.skipped > 0 ? t('run.seen.skipped', { name })
    : v.candidates.length === 0 ? t('run.seen.none', { name }) : t('run.seen.some', { name });
  return (
    <Outcome
      variant="block"
      outcome="pending"
      title={v.why === 'unread' ? t('run.out.unread', { name, computer }) : v.why === 'error' ? t('run.out.error', { name, computer }) : t('run.out.unknown', { name, computer })}
      detail={seen}
      onCheck={() => void store.check(here())}
      checking={v.observed === 'checking'}
      /* noDetails: the answer was lost, so nothing came back to show */
    />
  );
}

/** What can be done next: a started run's chat and Run again; an unknown start's look-alikes and Stop tracking. */
function RunNext({ t, v, realm, chatHref, store }: { t: T; v: RunView; realm: string; chatHref?: ChatHref; store: RunStore }) {
  const [pick, setPick] = useState<string | null>(null);
  if (v.phase === 'done') {
    return (
      <Row gap={2}>
        {chatHref && <Link href={chatHref(v.sessionId, realm)}>{t('run.open')}</Link>}
        <TextButton onPress={() => store.clear()}>{t('run.again')}</TextButton>
      </Row>
    );
  }
  if (v.phase !== 'unsure') return null;
  const options = v.observed === 'read' ? v.candidates.map((r) => ({ value: r.id, label: formatDateTime(r.startedAt), description: r.id })) : [];
  return (
    <Stack gap={2}>
      {options.length > 0 && (
        <>
          <RadioGroup<string> label={t('run.mineLabel')} value={pick ?? ''} onChange={setPick} options={options} />
          <Row><Button variant="secondary" isDisabled={pick === null} onPress={() => pick && store.pick(pick)}>{t('run.mine')}</Button></Row>
        </>
      )}
      <Row><TextButton onPress={() => store.forget()}>{t('run.forget')}</TextButton></Row>
    </Stack>
  );
}
