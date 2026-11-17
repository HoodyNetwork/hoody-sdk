// New chat: /ai on desktop and /ai/new at every size. "What should we do?", the composer with its agent, model and
// Options chips, four ways to start, and where the chat will run.
//
// - The chat will run on the top bar's computer, in its realm: one realm (a chat runs in one), never All realms. Under All
//   realms it runs where the AI page's per-realm reads go for this computer (realmOf): Global for a computer in no realm,
//   its realm for one in one; a computer in several realms asks for one at the top. Once a chat starts it lives on its
//   own reference (computer handle, realm, session), never on the top bar.
// - The composer is the kit's (kit/agent/Composer). Its chips: the agent (opens the agent picker, AgentPicker.tsx), the
//   model (opens the model chooser) and Options (Options.tsx: folder, approvals, runs with).
// - The agent: until the person picks one, a new chat works on this computer, on the agent the computer reports as its
//   configured default (General as shipped). Just chat is one press away (the strip, the picker). A pick is the
//   person's own and is remembered.
// - Agent, approvals and runs with are remembered per account (hub_ai_new_v1); the folder and the model are not. The
//   first run has Hoody models with Default approvals; the realm's default backend (GET /acp/default) preselects Runs
//   with until the person picks one.
// - A link may name the agent (`/ai/new?agent=<name>`, an agent page's "New chat with this agent"): New chat starts on it
//   until the person picks another agent. A name this computer does not offer, or text that is no agent name, falls back
//   to the usual agent with a note saying the linked one was not found. The link never changes what is remembered.
// - Starting a chat: Send hands the first message and the choices to the kit's starter (useStarter), which runs the one
//   start path Ask has (create keyed and journaled, then the first message), behind its door; nothing here sends by
//   itself. The screen goes to the chat only once the start is `opened` (the agent proved the session). Waiting and
//   starting say so and keep Send off; an unknown start says it may have been made, with Check again (a read, never a
//   second start) and Stop tracking; never "started" or "not sent" without proof. Leaving the screen never cancels a start.
// - Approvals, said before Send: under Default the page says what the start itself does (the starter's `auto`): where a new chat
//   starts with Allow everything switched on, the Options chip and the Approvals row say so, by the name the chat's own approvals
//   chip shows; they say the chat asks only where it will. The page changes nothing a start does.
// - The model chip opens the kit's ModelBrowser alone (choose a ready model), never the ModelChooser: its setup step
//   saves keys and starts sign-ins. Setting a provider up goes to Models & keys.
import { MAX_TEXT } from '@ask/io';
import { agent, providers, usePrefUpdate, useCurrentComputer } from '@core';
import {
  Band, Button, Composer, ComputerRequired, ContextLine, Drawer, ErrorState, followPageLink, Icon, Link, LinkButton, ModelBrowser, PageHeader, TextButton, composerCount,
  composerPlain, SrOnly, useGo, usePathname, useModelCatalogue, usePageLink, useSearchParam, useShellData, useStarter, useStrings, type ComposerNote, type OtherWayOrAi, type StartAt,
} from '@kit';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { links as computerLinks } from '../../computers/links';
import { useAgents } from '../agents/data';
import { useCatalogue } from '../agents/toolsData';
import { chatLink, links } from '../links';
import { useComputer } from '../data';
import { realmOf } from '../logic';
import { useAiChats, useRealmName, type AiChats } from '../parts/Pane';
import paneStrings from '../parts/Pane.strings.en.json';
import { AgentPicker } from './AgentPicker';
import { useArrivalFocus } from './arrivalFocus';
import { useClaude, useFolders } from './data';
import { useSlashCommands, type SlashCommand } from '../parts/slashCommands';
import { useMentionFiles } from '../parts/mentionFiles';
import { Block, GroupBox } from '../parts/raw';
import {
  FIRST, approvalsStart, defaultAgent, defaultModel, folderName, linkedAgent, modelName, noModelFor, parseRemembered, reconcileAgent, rememberedOf, runsWithNow, startOptsOf, type AgentPick,
  type Approvals, type Choices, type Remembered, type RunsWith,
} from './logic';
import { FolderDialog, OptionsDrawer } from './Options';
import approvalModes from '@kit/agent/ApprovalMode.strings.en.json';
import scheduleAsk from '@kit/scheduleAsk.strings.en.json';
import strings from './NewChat.strings.en.json';
import s from './NewChat.module.css';

/** The preference key (core/registry.ts and shared.js AUTH_STORAGE_REGISTRY): agent, approvals, runs with. */
export const PREF_KEY = 'hub_ai_new_v1';
/** The most a first message may be, in code points: the chat engine's own limit, which refuses a longer start. */
const MAX = MAX_TEXT;
const RE24 = /^[0-9a-f]{24}$/;

export function NewChat() {
  const tp = useStrings(paneStrings);
  const t = useStrings(strings);
  const c = useAiChats();
  // One arrival per path of this view: the composer's focus is tried once per path, whatever remounts below.
  const arrival = useRef<string | null>(null);
  if (!c) {
    return (
      <div className={s.page}>
        <PageHeader title={t('title')} size="lg" />
        {/* The shell's no-computer state: these words for the pick, its own once the account has no computer at all. */}
        <ComputerRequired inline state="none" title={tp('noComputer.title')} body={tp('noComputer.body')} />
      </div>
    );
  }
  return <NewChatOn c={c} arrival={arrival} />;
}

const NO_BUILTINS: readonly SlashCommand[] = [];

function NewChatOn({ c, arrival }: { c: AiChats; arrival: MutableRefObject<string | null> }) {
  const t = useStrings(strings);
  const sa = useStrings(scheduleAsk);
  const tm = useStrings(approvalModes);
  const go = useGo();
  const shell = useShellData();
  const realmName = useRealmName();
  const computersLink = usePageLink('computers');
  const target = useCurrentComputer();
  // Under All realms the computer's realms decide (realmOf): a computer in no realm cannot be picked in any realm at the top,
  // so its chats run in Global. Until its realms are read nothing is decided and the realm question is not shown.
  const comp = useComputer();
  const all = c.at.realm === 'all';
  const mine = comp.data && comp.data.id === c.at.target.container.id ? comp.data : null;
  const realm = all ? (mine ? realmOf(mine.realmIds, null) : null) ?? 'all' : c.at.realm;
  const realmPending = all && !mine && !comp.isError;
  const one = realm === 'global' || RE24.test(realm);
  const computer = c.computerName;
  const row = shell.computers.find((x) => x.id === c.at.target.container.id);
  const stopped = row?.running === false;
  // The agent on this computer may be read: one realm and a running computer. Every read and every retry checks it.
  const readable = one && !stopped;

  // A pick made while the saved choices still open is stored once they are open (usePrefUpdate), never lost.
  const { value: saved, update: save } = usePrefUpdate<Remembered>(PREF_KEY, parseRemembered);
  // This page's own pick wins over the saved one: it applies here at once, also when this browser cannot store it.
  const [picked, setPicked] = useState<Remembered | null>(null);
  const stored = picked ?? saved;
  const claude = useClaude(readable ? realm : '');
  // Until the person picks one, the realm's default backend preselects Runs with (only a stored pick is theirs).
  const wanted: RunsWith = stored === FIRST && claude.preferClaude ? 'claude' : stored.runsWith;
  const runsWith = runsWithNow(wanted, claude.claude);
  const [folder, setFolder] = useState<string | null>('');
  const [models, setModels] = useState<Record<RunsWith, string>>({ hoody: defaultModel('hoody'), claude: defaultModel('claude') });
  // In the chat's realm (above), as every read here: under All realms the context's realm is 'all', which GET /agents refuses unsent.
  const agents = useAgents(readable, realm);
  const cat = useCatalogue(readable);
  const folders = useFolders(readable ? target : null, readable ? realm : '');
  // The "/" menu: the skills the picked folder sees; a new chat has no built-in to offer yet (nothing to compact).
  const slash = useSlashCommands(readable && target ? { target, realm, cwd: folder } : null, NO_BUILTINS);
  // The "@" picker: files under the picked folder (none while the folder is the default, not yet named).
  const mention = useMentionFiles(readable && target && folder ? { target, folder } : null);
  // The person's own pick; a remembered agent the computer no longer offers (gone, or product-owned now) is no pick.
  const own = stored.agent === null ? null : reconcileAgent(stored.agent, agents.rows);
  // With no pick of their own a new chat works on this computer: the computer's configured default agent.
  const usual = own ?? defaultAgent(agents.rows);
  // The agent a link names wins over the usual one while it is offered here (the router may hand a number: read as text).
  const [agentParam, setAgentParam] = useSearchParam('agent');
  const linkRaw = agentParam === undefined || agentParam === '' ? null : String(agentParam);
  const linked = linkRaw === null ? null : linkedAgent(linkRaw, agents.rows);
  const agentPick = linked?.pick ?? usual;
  const dropped = linked === null && own === null && stored.agent?.kind === 'other' ? stored.agent.name : null;
  const choices: Choices = { agent: agentPick, folder, approvals: stored.approvals, runsWith, model: models[runsWith] };
  // What is remembered is the person's own pick (`own`; none stays none), never a link's agent or the computer's default.
  const remember = (next: Partial<Pick<Remembered, 'agent' | 'approvals' | 'runsWith'>>) => {
    const v = rememberedOf({ agent: own, approvals: choices.approvals, runsWith: wanted, ...next });
    setPicked(v);
    save(() => v);
  };

  const catalogueFailed = cat.isError || cat.data === null;
  const retryReads = readable
    ? () => {
        agents.retry();
        void cat.refetch();
      }
    : undefined;
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [filesNote, setFilesNote] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const arrived = useArrivalFocus(arrival, usePathname(), inputRef);
  // The person stopped tracking an unknown start: nothing more is said about it here (the chat list shows it if it was made).
  const [untracked, setUntracked] = useState(false);
  // The draft a start was refused for (sent nothing): its note stays until the draft changes or Send is pressed again.
  const [refusedFor, setRefusedFor] = useState<string | null>(null);
  const [unlinked, setUnlinked] = useState(false);

  // The start goes to the top bar's computer in the chat's realm (above), only while the agent there may be asked (one realm, running).
  const cid = c.at.target.container.id, pid = c.at.target.project.id, server = c.at.target.container.server_name;
  const startAt = useMemo<StartAt | null>(() => (readable && c.handle ? { computer: { project: pid, id: cid, name: computer, server }, realm } : null), [readable, c.handle, pid, cid, computer, server, realm]);
  const { starter, state: start } = useStarter(startAt);
  const phase = start.phase;

  // The model chip's catalogue: read while the chooser is open, and once for the chip's name and the no-model state.
  const wantSpecs = useMemo(() => [models.hoody].filter(Boolean), [models.hoody]);
  // Its Claude Code part (GET /acp/agents, the computer's agent) is asked in the chat's realm, as every read here: the
  // catalogue's own read goes in the context's realm, 'all' under All realms, which that route refuses unsent.
  const mc = useModelCatalogue(readable ? target : null, {
    wanted: wantSpecs,
    claude: runsWith === 'claude',
    reads: (tg, ctx) => ({ catalogue: providers.providersApi(tg, { ctx }), acp: () => providers.call(agent.agentRoutes.acp, { target: tg, ctx, realm }) }),
  });
  const rules = useMemo(() => rulesOf(runsWith), [runsWith]);
  // Setting a provider up happens on Models & keys (Claude Code's own section for Claude Code), never here.
  const setUpAway = (dest: string) => {
    setModelOpen(false);
    go(dest);
  };

  // "Do it every day": the agent sets timers and loops itself, so the ask starts here, in this composer: the schedule prompt
  // (the shared table Schedules' agent step reads too) goes in the box after anything typed, once, the caret at its end. It
  // never leaves the page. Just chat has no tools, so it could set nothing: the ask then goes to the General agent, as Work
  // on this computer picks it; another pick stays. A link's Just chat (`?agent=chat`) is left the same way: the pick drops
  // the link's agent, or the link would keep showing it.
  const askDaily = () => {
    if (agentPick.kind === 'chat') pickAgent({ kind: 'general' }, 'none');
    const next = withPrompt(draft, sa('prompt'));
    setDraft(next);
    setCaretToEnd((n) => n + 1);
  };
  // After the render that put the prompt in the box: the input holds it, so the focus and the caret go to its end. An effect,
  // not requestAnimationFrame (a browser global: the terminal Hub has none).
  const [caretToEnd, setCaretToEnd] = useState(0);
  useEffect(() => {
    if (caretToEnd === 0) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [caretToEnd]);

  // A pick of the person's own takes over from a link's agent: the link's `?agent=` goes (and its note with it).
  const pickAgent = (a: AgentPick, focus: 'composer' | 'none' = 'composer') => {
    remember({ agent: a });
    if (linkRaw !== null) setAgentParam(undefined, { replace: true });
    if (focus === 'composer') inputRef.current?.focus();
  };
  // The start's outcome the screen acts on: `opened` goes to the chat (the only phase that may) and is the only one that clears
  // the box. Every other phase keeps the text: an unknown start holds Send while it is shown, Stop tracking
  // gives the person their words back, and a refused one keeps them for Send it now. It acts only while the phase this render
  // showed is still the starter's current one: a phase that moved on before the effect ran does nothing here (the next render
  // shows the new one).
  useEffect(() => {
    if (!starter) return;
    if (phase.k === 'opened') {
      const href = chatLink(phase.ref);
      if (!starter.settle(phase)) return;
      setDraft('');
      if (href) go(href);
      else setUnlinked(true);
    }
  }, [starter, phase, go]);

  const opts = startOptsOf(choices);
  const busy = phase.k === 'waiting' || phase.k === 'starting' || phase.k === 'unknown';
  const plain = composerPlain(draft);
  const noModel = noModelFor(runsWith, mc.evidence);
  // Nothing starts on a guess: a named agent waits for the agents read (reconcileAgent), and so does the computer's
  // default while the person has picked none (a read that failed leaves General, which the chip shows).
  const byDefault = own === null && !linked?.pick;
  const agentKnown = byDefault ? agents.rows !== undefined || agents.failed : choices.agent.kind !== 'other' || agents.rows !== undefined;
  const why = !starter ? t('send.unavailable')
    : !start.door.ok ? start.door.why || t('send.unavailable')
      : busy ? t('send.busy')
        : !opts ? t('send.pickFolder')
          : !agentKnown ? t('send.agentLoading')
            : noModel ? t('band.noModel') : '';
  const canSend = why === '' && plain.trim() !== '' && composerCount(plain) <= MAX;
  const send = () => {
    if (!starter || !opts || !canSend) return;
    setUntracked(false);
    setUnlinked(false);
    // A start the starter refuses sent nothing; the page says so.
    setRefusedFor(starter.start(plain, opts) ? null : plain);
  };
  const startNotes: ComposerNote[] = [];
  if (phase.k === 'waiting') startNotes.push({ key: 'start', text: t('start.waiting', { computer }), status: true });
  if (phase.k === 'starting') startNotes.push({ key: 'start', text: t('start.starting', { computer }), status: true });
  if (phase.k === 'notSent') {
    startNotes.push({ key: 'start', text: phase.why ? t('start.notSentWhy', { why: phase.why }) : t('start.notSent'), warn: true, status: true, sends: { label: t('start.again'), onPress: send, isDisabled: !canSend } });
  }
  if (phase.k === 'unknown') {
    startNotes.push({
      key: 'start',
      text: phase.taken ? `${t('start.unknown', { computer })} ${t('start.unknownNoText')}` : t('start.unknown', { computer }),
      warn: true,
      status: true,
      end: (
        <>
          <TextButton onPress={() => starter?.check()}>{t('start.check')}</TextButton>
          <TextButton onPress={() => { if (starter?.settle(phase)) setUntracked(true); }}>{t('start.untrack')}</TextButton>
        </>
      ),
    });
  }
  if (phase.k === 'none' && refusedFor !== null && refusedFor === plain) startNotes.push({ key: 'start', text: t('start.notSent'), warn: true, status: true });
  if (phase.k === 'none' && untracked) startNotes.push({ key: 'start', text: t('start.untracked'), status: true });
  if (phase.k === 'none' && unlinked) startNotes.push({ key: 'start', text: t('start.unlinked'), status: true });
  const where = realmName(realm);
  const realmColor = shell.realms.find((x) => x.id === realm)?.color;
  const firstUse = c.chats.rows !== undefined && c.chats.rows.length === 0 && c.chats.total === 0;
  const modelChip = runsWith === 'claude' && choices.model === '' ? t('model.claudeDefault') : modelName(mc.evidence, choices.model, t('model.anyName'));
  const agentChip = choices.agent.kind === 'chat' ? t('agent.chat') : choices.agent.kind === 'general' ? t('agent.general') : choices.agent.name;
  // What this start does about approvals, said before Send: the starter reads it from the place the chat starts in.
  const approvalsNow = approvalsStart(choices.approvals, start.auto);
  // The Options chip's summary: Strict, Claude Code and the folder, each only when it is not the default; and Allow everything
  // (the chat's own name for it) when a Default chat starts with it on, so the page never reads as asking when it will not.
  const summary = [
    ...(choices.approvals === 'strict' ? [t('summary.strict')] : []),
    ...(approvalsNow === 'everything' ? [tm('am.state.everything')] : []),
    ...(runsWith === 'claude' ? [t('summary.claude')] : []),
    ...(folder ? [folderName(folder)] : []),
  ].join(' · ');

  return (
    <div className={s.page}>
      <PageHeader
        title={t('title')}
        subtitle={t(firstUse ? 'leadFirst' : 'lead', { computer })}
        size="lg"
        context={
          <ContextLine
            realm={{ name: where, color: realmColor }}
            computer={{ name: computer, tone: row?.running ? 'ok' : 'neutral', state: row?.running === undefined ? undefined : t(stopped ? 'where.stopped' : 'where.running') }}
          />
        }
        meta={
          <div aria-live="polite">
            <SrOnly>{arrived ? t('title') : null}</SrOnly>
          </div>
        }
      />
      <Bands
        c={c}
        one={one}
        realmPending={realmPending}
        stopped={stopped}
        noModel={noModel}
        agentsFailed={readable && agents.failed}
        agentsError={agents.error}
        onRetry={retryReads}
        openComputer={computersLink && c.handle ? () => (computersLink.kind === 'hub' ? go(computerLinks.item(c.handle)) : followPageLink(computersLink, go)) : null}
        chatDropped={stored.chatDropped === true}
        onJustChat={() => pickAgent({ kind: 'chat' })}
        onChatDroppedOk={() => remember({})}
      />
      {/* The composer and the ways to start sit as one object, the strip directly under the box (NewChat.module.css .start). */}
      <div className={s.start}>
        <div className={s.composer}>
          <Composer
            plate
            flush
            draft={draft}
            setDraft={setDraft}
            inputRef={inputRef}
            placeholder={t('placeholder')}
            max={MAX}
            canSend={canSend}
            onSend={send}
            sendWhy={why}
            sendQuiet={why !== ''}
            notes={[
              ...startNotes,
              ...(filesNote ? [{ key: 'files', text: t('files.notReady'), status: true }] : []),
              ...(dropped ? [{ key: 'dropped', text: t('agent.notOffered', { name: dropped, computer }), status: true }] : []),
              ...(linked?.note ? [{ key: 'linked', text: linked.note.kind === 'missing' ? t('agent.linkMissing', { name: linked.note.name, computer }) : t('agent.linkBad'), status: true }] : []),
            ]}
            attachments={[]}
            onAddFiles={(f) => setFilesNote(f.length > 0)}
            onRemoveAttachment={() => {}}
            flash={false}
            onTyping={() => {}}
            slash={slash}
            mention={mention}
            tools={
              <span className={s.chips}>
                <Button variant="ghost" size="sm" icon="hoody-ai-agent" literal shrink isDisabled={!readable} onPress={() => setAgentOpen(true)} aria-label={t('agent.chip', { name: agentChip })}>
                  {choices.agent.kind === 'general' ? t('agent.generalShort') : agentChip}
                </Button>
                <Button variant="ghost" size="sm" icon="hoody-ai" literal shrink isDisabled={!one || stopped} onPress={() => setModelOpen(true)} aria-label={t('model.chip', { name: modelChip })}>
                  {modelChip}
                </Button>
                <Button variant="ghost" size="sm" icon={approvalsNow === 'everything' ? 'warn' : 'sliders'} literal shrink onPress={() => setOptionsOpen(true)} aria-label={summary ? t('options.chipSummary', { summary }) : t('options.chip')}>
                  {t('options.chip')}
                </Button>
              </span>
            }
          />
        </div>
        <ul className={s.suggestions} aria-label={t('sug.label')}>
          <li>
            <button type="button" className={s.sug} onClick={() => pickAgent({ kind: 'general' })}>
              <Icon name="terminal" size="sm" />
              <span className={s.sugText}>
                <strong>{t('sug.general')}</strong>
                <span>{t('sug.generalLine', { computer })}</span>
              </span>
            </button>
          </li>
          <li>
            <button type="button" className={s.sug} onClick={() => pickAgent({ kind: 'chat' })}>
              <Icon name="sparkle" size="sm" />
              <span className={s.sugText}>
                <strong>{t('sug.chat')}</strong>
                <span>{t('sug.chatLine')}</span>
              </span>
            </button>
          </li>
          <li>
            <button type="button" className={s.sug} disabled={!one || !c.handle} onClick={() => setFolderOpen(true)}>
              <Icon name="files" size="sm" />
              <span className={s.sugText}>
                <strong>{t('sug.folder')}</strong>
                <span>{t('sug.folderLine')}</span>
              </span>
            </button>
          </li>
          <li>
            <Block className={s.sug}>
              <Icon name="schedules" size="sm" />
              <span className={s.sugText}>
                <strong>{t('sug.daily')}</strong>
                <span>{t('sug.dailyLine', { computer, example: sa('prompt') + sa('ex.backups') })}</span>
                <span className={s.sugLinks}>
                  <TextButton onPress={askDaily}>{t('sug.dailyAsk')}</TextButton>
                  <Link variant="nav" href={links.newTodo}>{t('sug.todos')}</Link>
                </span>
              </span>
            </Block>
          </li>
        </ul>
      </div>
      <AgentPicker
        isOpen={agentOpen}
        onOpenChange={setAgentOpen}
        computer={computer}
        agents={agents}
        catalogue={cat.data}
        catalogueFailed={catalogueFailed}
        retryReads={retryReads}
        current={agentPick}
        // The picker closes on a pick and focus goes back to the agent chip, which now names the picked agent.
        onPick={(a) => {
          pickAgent(a, 'none');
          setAgentOpen(false);
        }}
      />
      <OptionsDrawer
        isOpen={optionsOpen}
        onOpenChange={setOptionsOpen}
        computer={computer}
        choices={choices}
        approvalsStart={approvalsNow}
        folders={folders}
        claude={claude}
        claudeReadable={readable}
        onFolder={setFolder}
        onApprovals={(a: Approvals) => remember({ approvals: a })}
        onRunsWith={(r: RunsWith) => remember({ runsWith: r })}
        setUpClaude={links.section('claude')}
      />
      <Drawer resizeKey="ai-new-chat-model" overlayId="ai.new.model" isOpen={modelOpen} onOpenChange={setModelOpen} title={t('model.title')} subtitle={t('model.subtitle', { computer })} size="md">
        {modelOpen && (
          <GroupBox label={t('model.label')}>
            <ModelBrowser
              id="ai-new-model"
              evidence={mc.evidence}
              noComputer={!target || !readable}
              computerName={computer}
              value={choices.model}
              rules={rules}
              purpose={runsWith === 'claude' ? 'agent' : 'default'}
              {...(runsWith === 'hoody' ? { defaultSpec: providers.FREE } : {})}
              offer={{ endpoint: false, claude: runsWith === 'claude' }}
              onChoose={(ch) => {
                setModels((m) => ({ ...m, [runsWith]: ch.kind === 'model' ? ch.spec : '' }));
                setModelOpen(false);
              }}
              onSetup={(req) => setUpAway(links.connect(req.provider))}
              onOtherWay={(way: OtherWayOrAi) => setUpAway(way === 'claude' ? links.section('claude') : links.connect())}
              onRetry={() => mc.pressRetry()}
              retrying={mc.retrying}
              backgroundFailed={mc.failedAt != null}
            />
          </GroupBox>
        )}
      </Drawer>
      <FolderDialog
        isOpen={folderOpen}
        onOpenChange={setFolderOpen}
        computer={computer}
        handle={c.handle}
        realm={realm}
        realmName={where}
        folders={folders}
        onOpen={(href) => {
          setFolderOpen(false);
          go(href);
        }}
      />
    </div>
  );
}

/** The schedule prompt as the box's last paragraph, once: an empty box becomes it; a last paragraph that is just the prompt's word
 *  gets the prompt back whole (its space, so typing follows it); any other words stay and it follows them on a new paragraph,
 *  even when they end in the same word ("…on the Schedule"). */
function withPrompt(draft: string, prompt: string): string {
  const kept = draft.replace(/\s+$/, '');
  const last = kept.split(/\n[ \t]*\n/).pop() ?? '';
  if (last.trim() === '' || last.trim() === prompt.trim()) return kept.slice(0, kept.length - last.length) + prompt;
  return `${kept}\n\n${prompt}`;
}

/** The chooser's rules: Hoody models are any non-Claude model (the free Hoody model is the fallback); Claude Code is
 *  its own models, or its default (inherit). */
function rulesOf(r: RunsWith): providers.JudgeRules {
  if (r === 'hoody') return providers.rulesFor('default');
  const base = providers.rulesFor('agent', { inherit: true });
  return { ...base, eligible: (spec, ev) => agent.claudeModelOf(spec) !== null && base.eligible(spec, ev), fallback: new Set() };
}

interface BandsProps {
  c: AiChats;
  one: boolean;
  /** All realms, the computer's realms not read yet: no realm question until they say one is needed. */
  realmPending: boolean;
  stopped: boolean;
  noModel: boolean;
  /** The agents read failed, or answered with something that is not an agent list (then `agentsError` is null). */
  agentsFailed: boolean;
  agentsError: unknown;
  /** Absent when this computer and realm may not be read. */
  onRetry: (() => void) | undefined;
  /** The computer's own screen on Computers; null when this load does not serve it. */
  openComputer: (() => void) | null;
  /** A Just chat kept from before picks were marked was not kept as a pick: said once, until the person answers. */
  chatDropped: boolean;
  onJustChat: () => void;
  onChatDroppedOk: () => void;
}

function Bands({ c, one, realmPending, stopped, noModel, agentsFailed, agentsError, onRetry, openComputer, chatDropped, onJustChat, onChatDroppedOk }: BandsProps) {
  const t = useStrings(strings);
  const computer = c.computerName;
  if (!one) return realmPending ? null : <Band tone="neutral">{t('band.pickRealm')}</Band>;
  if (stopped) {
    return (
      <Band
        tone="warn"
        /* noDetails: the computer's state (from the shell's computer list), not a failed request */
        actions={openComputer ? <Button size="sm" variant="secondary" literal onPress={openComputer}>{t('band.openComputer', { computer })}</Button> : undefined}
      >
        {t('band.stopped', { computer })}
      </Band>
    );
  }
  if (agentsFailed) {
    return (
      <ErrorState
        title={t('band.agentsFailed', { computer })}
        error={agentsError ?? undefined}
        /* noDetails: a malformed agent list is no rejection (no error to pass); band.agentsMalformed says what went wrong */
        {...(agentsError ? {} : { body: t('band.agentsMalformed', { computer }) })}
        {...(onRetry ? { onRetry } : {})}
      />
    );
  }
  if (noModel) {
    return (
      // A warn band, not a page-size empty state: the composer stays below it and the pane head keeps the one primary.
      <Band
        tone="warn"
        actions={<LinkButton href={links.list} size="sm" variant="secondary">{t('band.setUp')}</LinkButton>}
        /* noDetails: nothing failed: no model is ready yet, and the action sets one up */
      >
        {t('band.noModel')}{' · '}{t('band.noModelBody', { computer })}
      </Band>
    );
  }
  if (chatDropped) {
    return (
      <Band
        tone="neutral"
        actions={
          <>
            <Button size="sm" variant="secondary" onPress={onJustChat}>{t('band.chatDroppedPick')}</Button>
            <Button size="sm" variant="secondary" onPress={onChatDroppedOk}>{t('band.chatDroppedOk')}</Button>
          </>
        }
      >
        {t('band.chatDropped')}
      </Band>
    );
  }
  return null;
}

