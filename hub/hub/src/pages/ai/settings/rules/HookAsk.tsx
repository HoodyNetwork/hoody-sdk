// Hooks → Add hook…: two ways in one small step. "Write it yourself" is the hook editor (HookEdit), unchanged. "Write it with
// the Agent" starts an ordinary chat on the shipped hooks editor agent, on the computer and realm shown, in the chosen folder
// when the hook is saved there, with the person's words in its first message, and opens that chat: the same start New workflow
// with AI makes (auto/workflows/NewAsk.tsx), through the kit's starter. Nothing here writes a hook. The agent writes it with its
// own hook tool, which asks the person in the chat before saving; the chat starts with Strict approvals (every tool call waits
// for the person, so no other tool it holds saves one silently) and Approve automatically off, and
// the hook then shows in this list like any other. What is sent is exactly the text shown under "Exact instructions sent with
// it". The agent's hook tool writes a realm's hooks or a folder's shared hooks: a folder's hooks just for you are written in the
// hook editor. The start is C9, as New chat's: it is sent once, a lost answer is unknown and never failed, Check again only
// reads, and only `opened` leaves this page.
import {
  ASK_MAX_TEXT, Band, CodeBlock, composerCount, Dialog, FormSection, Link, PickCard, Row, RowNote, Select, Stack, TextButton, TextField,
  useGo, useStarter, useStrings, type StartAt,
} from '@kit';
import { useEffect, useMemo, useState } from 'react';
import { chatLink, links } from '../../links';
import type { SettingsAt } from './data';
import strings from './HookAsk.strings.en.json';

/** The shipped agent that writes hooks. The Hub sends only its name: a person's edited copy of it is what runs. */
export const HOOKS_AGENT = 'hooks-editor';

/** Where the agent may save a hook: the realm's hooks for every folder, or the chosen folder's shared hooks. */
export type AskScope = 'user' | 'project';

/** The chat's first message, shown in the chat as the person's own. It names the place in words; the chat runs in the folder
 *  for a folder's hook, so "this folder" is the chat's own. */
export function hookMessage(text: string, scope: AskScope): string {
  const where = scope === 'project'
    ? 'to the shared hooks of this folder'
    : 'to my hooks for every folder in this realm';
  return `Add one new hook ${where}. Keep every other hook as it is. What it should do: ${text.trim()}`;
}

/** Room left for the person's words: the whole first message has to fit in a chat's first message. */
export const roomFor = (text: string, scope: AskScope): number => ASK_MAX_TEXT - composerCount(hookMessage(text, scope));

/** The places the agent's hook tool can save to, of those `scopes` that may change now: a realm's hooks (user), and a folder's
 *  shared hooks (project) when the place is a folder. A folder's hooks just for you (local) are never among them. */
export function agentScopes(scopes: readonly string[], folder: boolean): AskScope[] {
  return (folder ? (['project', 'user'] as const) : (['user'] as const)).filter((s) => scopes.includes(s));
}

export function HookHowDialog({ agentOff, localByHand, onAgent, onSelf, onClose }: { agentOff: boolean; localByHand: boolean; onAgent: () => void; onSelf: () => void; onClose: () => void }) {
  const t = useStrings(strings);
  return (
    <Dialog isOpen overlayId="ai-hook-how" onOpenChange={(o) => { if (!o) onClose(); }} title={t('how.title')} size="md">
      <Stack gap={2}>
        <PickCard title={t('how.agent')} line={t('how.agent.line')} onPress={onAgent} {...(agentOff ? { isDisabled: true, disabledReason: t('how.agent.noScope') } : {})} />
        <PickCard title={t('how.self')} line={t('how.self.line')} onPress={onSelf} />
        {localByHand && !agentOff && <RowNote>{t('ask.localNote')}</RowNote>}
      </Stack>
    </Dialog>
  );
}

type Note = 'none' | 'untracked' | 'unlinked' | 'refused';

export interface HookAskDialogProps {
  /** The place the Hooks list shows (its realm, and its folder when it is one). */
  at: SettingsAt;
  /** The shown computer's name, for words. */
  computer: string;
  /** The places of `at` whose hooks may change now (the list's own rule); the agent can write `user` and `project` only. */
  scopes: readonly string[];
  onClose: () => void;
}

export function HookAskDialog({ at, computer, scopes, onClose }: HookAskDialogProps) {
  const t = useStrings(strings);
  const go = useGo();
  const folder = at.cwd;
  const offered = agentScopes(scopes, folder !== undefined);
  const [scope, setScope] = useState<AskScope | null>(offered[0] ?? null);
  const project = at.target.project.id;
  const id = at.target.container.id;
  const server = at.target.container.server_name;
  const startAt = useMemo<StartAt>(() => ({ computer: { project, id, name: computer, server }, realm: at.realm }), [project, id, computer, server, at.realm]);
  const { starter, state } = useStarter(startAt, 'hooks');
  const phase = state.phase;
  const [text, setText] = useState('');
  const [note, setNote] = useState<Note>('none');
  // `opened` is the only phase that leaves: settled first, so a phase that moved on does nothing. Every `opened` the starter
  // shows here counts, a start taken up again after a reload included (it carries no kind; Check again may prove it here).
  useEffect(() => {
    if (!starter || phase.k !== 'opened') return;
    const href = chatLink(phase.ref);
    if (!starter.settle(phase)) return;
    if (href) { onClose(); go(href); } else setNote('unlinked');
  }, [starter, phase, go, onClose]);
  const busy = phase.k === 'waiting' || phase.k === 'starting' || phase.k === 'unknown';
  const message = scope ? hookMessage(text, scope) : '';
  const why = !starter ? t('start.unavailable', { computer })
    : !state.door.ok ? state.door.why || t('start.unavailable', { computer })
      : busy ? t('start.busy')
        : scope === null ? t('ask.noPlace')
          : text.trim() === '' ? t('ask.empty')
            : roomFor(text, scope) < 0 ? t('ask.long', { over: String(-roomFor(text, scope)) }) : '';
  const press = () => {
    if (!starter || why !== '' || scope === null) return;
    setNote('none');
    // The folder's shared hooks are the chat's folder's: it runs there. A realm's hooks are written wherever it runs.
    // Strict approvals: every tool call of this chat waits for the person, so no path the agent holds (its hook tool, or a
    // shell or file write) saves a hook without asking; Approve automatically stays Off for it as well (askFirst).
    const ok = starter.start(hookMessage(text, scope), { agent: HOOKS_AGENT, strict: true, askFirst: true, ...(scope === 'project' && folder !== undefined ? { cwd: folder } : {}) });
    if (!ok) setNote('refused');
  };
  const stop = () => { if (starter?.settle(phase)) setNote('untracked'); };
  return (
    <Dialog
      isOpen
      overlayId="ai-hook-ask"
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t('ask.title')}
      size="lg"
      primaryLabel={t('ask.start')}
      primaryDisabled={why !== ''}
      {...(why !== '' ? { primaryDisabledReason: why } : {})}
      onPrimary={press}
    >
      <>
        <FormSection label={t('ask.secAsk')}>
        <TextField label={t('ask.text')} value={text} onChange={setText} multiline rows={4} isDisabled={busy} description={t('ask.body', { computer })} />
        {offered.length > 0 && (
          <Select<AskScope>
            label={t('ask.savedIn')}
            options={offered.map((s) => ({ value: s, label: t(s === 'project' ? 'ask.savedIn.project' : 'ask.savedIn.user') }))}
            value={scope ?? offered[0]!}
            onChange={setScope}
            isDisabled={busy}
          />
        )}
        {folder !== undefined && scopes.includes('local') && <RowNote>{t('ask.localNote')}</RowNote>}
        </FormSection>
        <FormSection title={t('ask.exact')} description={t('ask.exactLine')}>
          <CodeBlock code={message} wrap lang="plain" // reason: the chat's first message in words, read whole before Start, not code
          />
          <Row gap={1} wrap>
            <RowNote>{t('ask.agent', { agent: HOOKS_AGENT })}</RowNote>
            <Link href={links.agent(HOOKS_AGENT)}>{t('ask.agentEdit')}</Link>
          </Row>
        </FormSection>
        {(phase.k !== 'none' && phase.k !== 'opened') || note !== 'none' ? (
          <FormSection kind="summary" label={t('ask.secStart')}>
            <Phase phase={phase} note={note} computer={computer} why={why} onPress={press} onCheck={() => starter?.check()} onStop={stop} />
          </FormSection>
        ) : null}
      </>
    </Dialog>
  );
}

/** What the start's phase says, in New chat's meanings. */
function Phase({ phase, note, computer, why, onPress, onCheck, onStop }: {
  phase: ReturnType<typeof useStarter>['state']['phase']; note: Note; computer: string; why: string; onPress: () => void; onCheck: () => void; onStop: () => void;
}) {
  const t = useStrings(strings);
  if (phase.k === 'waiting') return <Band tone="neutral" size="table" /* noDetails: nothing has left yet */>{t('start.waiting', { computer })}</Band>;
  if (phase.k === 'starting') return <Band tone="neutral" size="table" /* noDetails: on its way, nothing came back */>{t('start.starting', { computer })}</Band>;
  if (phase.k === 'notSent') {
    return (
      <Band tone="warn" size="table" /* noDetails: the agent's words are the sentence */ actions={<TextButton isDisabled={why !== ''} onPress={onPress}>{t('start.again')}</TextButton>}>
        {phase.why ? t('start.notSentWhy', { why: phase.why }) : t('start.notSent')}
      </Band>
    );
  }
  if (phase.k === 'unknown') {
    return (
      <Band
        tone="warn"
        size="table"
        // noDetails: the answer was lost, so nothing came back to show; Check again reads, it never sends
        actions={<>
          <TextButton onPress={onCheck}>{t('check')}</TextButton>
          <TextButton onPress={onStop}>{t('stop')}</TextButton>
        </>}
      >
        {phase.taken ? `${t('start.unknown', { computer })} ${t('start.unknownNoText')}` : t('start.unknown', { computer })}
      </Band>
    );
  }
  if (note === 'refused') return <Band tone="warn" size="table" /* noDetails: the starter refused before anything left */>{t('start.notSent')}</Band>;
  if (note === 'untracked') return <Band tone="neutral" size="table" /* noDetails: the person stopped tracking; nothing came back */>{t('start.untracked')}</Band>;
  if (note === 'unlinked') return <Band tone="neutral" size="table" /* noDetails: the chat exists; it has no address this page can open */>{t('start.unlinked')}</Band>;
  return null;
}
