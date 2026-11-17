// New chat's Options: Folder, Approvals and Runs with, each row saying what its choice really does, in a panel the
// composer's Options chip opens. A change applies at once (approvals and runs with are remembered by the page); nothing
// here sends. And "Work in a folder": the folder picker, then the folder's page.
import { Band, Button, Dialog, Drawer, Link, PathField, SegmentedControl, Select, SettingGroup, SettingRow, StatusLine, TextButton, Why, useStrings, type Option } from '@kit';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pageFaq } from '../faq';
import aiStrings from '../strings.en.json';
import { folderLink } from '../links';
import { NO_PATH_READS, usePathReads } from '../parts/mentionFiles';
import type { ClaudeRead, FoldersRead } from './data';
import approvalModes from '@kit/agent/ApprovalMode.strings.en.json';
import { claudeView, folderChoices, folderOk, typedFolder, type Approvals, type ApprovalsStart, type Choices, type RunsWith } from './logic';
import strings from './NewChat.strings.en.json';
import s from './NewChat.module.css';

// Not a folder: every folder offered is an absolute path.
const ANOTHER = 'another';

export interface OptionsDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  computer: string;
  choices: Pick<Choices, 'folder' | 'approvals' | 'runsWith'>;
  /** What a chat started now does about approvals (logic approvalsStart): the Approvals row says that, never more. */
  approvalsStart: ApprovalsStart;
  folders: FoldersRead;
  claude: ClaudeRead;
  /** Claude Code may be read here (one realm, a running computer): Check again is offered only then. */
  claudeReadable: boolean;
  onFolder: (path: string | null) => void;
  onApprovals: (a: Approvals) => void;
  onRunsWith: (r: RunsWith) => void;
  /** Models & keys → Claude Code. */
  setUpClaude: string;
}

export function OptionsDrawer(p: OptionsDrawerProps) {
  const t = useStrings(strings);
  const { byId } = pageFaq(useStrings(aiStrings));
  const tm = useStrings(approvalModes);
  const { computer, choices } = p;
  // The row says what this start does: under Default that is the chat's Allow everything when the start switches it on (the name
  // the chat's own approvals chip shows), and asking only when the chat will ask.
  const approvalsLine = p.approvalsStart === 'strict' ? t('approvals.strictShort')
    : p.approvalsStart === 'everything' ? t('approvals.defaultOn', { mode: tm('am.state.everything') })
      : p.approvalsStart === 'asks' ? t('approvals.defaultLine') : t('approvals.defaultUnknown', { computer });
  const cv = claudeView(p.claude.claude, p.claude.failed);
  // Claude Code is offered only when it is proven ready; its row says what stands in the way.
  const runs = (
    <SegmentedControl<RunsWith>
      label={t('runs.legend')}
      value={choices.runsWith}
      onChange={p.onRunsWith}
      items={[{ id: 'hoody', label: t('runs.hoody') }, { id: 'claude', label: t('runs.claude'), isDisabled: cv !== 'ready' }]}
    />
  );
  const runsLine = t(choices.runsWith === 'claude' ? 'runs.claudeLine' : 'runs.hoodyLine', { computer });
  const claudeLine = cv === 'checking' ? t('runs.claudeChecking', { computer }) : cv === 'notReady' ? t('runs.claudeNotReady', { computer }) : '';
  return (
    <Drawer
      resizeKey="ai-new-chat-options"
      overlayId="ai.new.options"
      isOpen={p.isOpen}
      onOpenChange={p.onOpenChange}
      title={t('options.title')}
      subtitle={t('options.subtitle', { computer })}
      size="md"
      primary={<Button variant="primary" onPress={() => p.onOpenChange(false)}>{t('options.done')}</Button>}
      cancel={false}
    >
      <SettingGroup variant="field" label={t('options.group')}>
        <SettingRow label={t('folder.legend')} help={t('folder.fixed')}>
          <FolderField computer={computer} folders={p.folders} value={choices.folder} onChange={p.onFolder} bare />
        </SettingRow>
        <SettingRow label={t('approvals.legend')} help={approvalsLine}>
          {(ids) => (
            <SegmentedControl<Approvals>
              label={t('approvals.legend')}
              value={choices.approvals}
              onChange={p.onApprovals}
              items={[{ id: 'default', label: t('approvals.default') }, { id: 'strict', label: t('approvals.strict') }]}
              {...(ids.helpId ? { 'aria-describedby': ids.helpId } : {})}
            />
          )}
        </SettingRow>
        <SettingRow
          label={t('runs.legend')}
          help={claudeLine ? `${runsLine} ${claudeLine}` : runsLine}
          {...(cv === 'notReady' ? { actions: <Link href={p.setUpClaude}>{t('runs.claudeSetup')}</Link> } : {})}
        >
          {cv === 'unknown' ? (
            <Band tone="warn" attach={runs} /* noDetails: a check that did not answer; Check again asks again */ {...(p.claudeReadable ? { actions: <TextButton onPress={p.claude.retry}>{t('runs.claudeRetry')}</TextButton> } : {})}>
              {t('runs.claudeUnknown', { computer })}
            </Band>
          ) : runs}
        </SettingRow>
      </SettingGroup>
      {/* Strict is one sentence on its row; what never asks is the Why, and the whole list is the tab's question. */}
      <Why question={t('approvals.why.q')} faq={{ item: byId.strictApprovals, label: t('approvals.why.more') }}>
        {t('approvals.why.a')}
      </Why>
    </Drawer>
  );
}

interface FolderFieldProps {
  computer: string;
  folders: FoldersRead;
  /** '' = the home folder; null = a typed path that is not valid yet. */
  value: string | null;
  /** Called with '' (home) or a valid absolute path, and with null whenever the typed path shown is empty or invalid
   *  (so nothing older stays chosen behind it). */
  onChange: (path: string | null) => void;
  description?: string;
  /** No '' home choice (a folder's page and a TODO need a path): the agent's home is offered by its path when it is known. */
  noHome?: boolean;
  /** The page's refusal of the choice (a required folder still empty): on the path while one is typed, else on the list. */
  errorMessage?: string;
  isDisabled?: boolean;
  /** A typed path is chosen only on Enter or on leaving the box (a pick from its list or Browse chooses at once), never per
   *  keystroke: for a host whose choice opens something (a settings chat for that folder). */
  commitTyped?: boolean;
  /** The host shows the field's name itself (a setting row): the list is named for assistive technology only. */
  bare?: boolean;
}

/** The folder choice: the home folder, the folders chats ran in, or another folder, typed or browsed (PathField):
 *  relative to the agent's home folder (listed as it is typed, with the "@" picker's reads and fence), or an absolute path as
 *  typed (never listed). Browse shows the whole computer from "/" (opening on the home folder) and writes the folder chosen
 *  as its absolute path: the value is always an absolute folder (typedFolder), wherever it is. Also New TODO's (AI > TODOs). */
export function FolderField({ computer, folders, value, onChange, description, noHome = false, errorMessage, isDisabled, commitTyped = false, bare = false }: FolderFieldProps) {
  const t = useStrings(strings);
  // Where a path is needed, the home folder is offered by its own path, and only when the agent reports it (an unknown home is
  // never ''); it is listed once, ahead of the folders chats ran in.
  const home = noHome ? folders.home : null;
  const known = folderChoices(folders.folders).filter((f) => f !== home);
  // The typed path's root: the home folder the agent reports (unknown: only an absolute path names a folder).
  const root = folders.home;
  const reads = usePathReads(folders.target && root ? { target: folders.target, folder: root } : null) ?? NO_PATH_READS;
  // Browse's reads: the same reads and fence, from the computer's top folder; the home folder is where it opens.
  const whole = usePathReads(folders.target && root ? { target: folders.target, folder: '/' } : null);
  const [typing, setTyping] = useState(() => value === null || (value !== '' && value !== home && !known.includes(value)));
  // A folder already chosen shows as its absolute path (as typed): it keeps naming that folder whatever the root does.
  const [typed, setTyped] = useState(typing ? (value ?? '') : '');
  // What was last chosen, so a blur after a pick (or an unchanged Enter) sends nothing again.
  const sent = useRef<string | null | undefined>(undefined);
  const latest = useRef({ typed, root, onChange });
  useLayoutEffect(() => { latest.current = { typed, root, onChange }; });
  const send = useCallback((path: string | null) => {
    sent.current = path;
    onChange(path);
  }, [onChange]);
  // commitTyped: the text the last choice was made from. A root change re-reads only that text: an edit not yet committed is
  // chosen on its own Enter or blur, against the root then.
  const said = useRef(typed);
  // commitTyped: the deferred Enter/blur commit not yet run. A pick from the Select drops it; leaving the field (the place
  // switched to Realm, the field unmounted) runs it at once, so a path typed and left is never lost.
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);
  const dropPending = () => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  };
  // The same text names another folder once the root changes (the home folder arrives, or another computer's): the choice
  // follows what the field shows.
  const rootSeen = useRef(root);
  useEffect(() => {
    if (rootSeen.current === root) return;
    rootSeen.current = root;
    if (typing && (!commitTyped || typed === said.current)) send(typedFolder(typed, root));
  }, [root, typing, typed, send, commitTyped]);
  // commitTyped: the text typed so far is chosen on Enter or blur (the field's onCommit), once per change (a blur after a pick
  // sends nothing again). Run after the list has had the event: an Enter or a blur that picked a row has chosen it already,
  // so the text is that pick.
  const commit = () => {
    const run = () => {
      pending.current = null;
      const { typed: text, root: at, onChange: tell } = latest.current;
      said.current = text;
      const path = typedFolder(text, at);
      if (sent.current === path) return;
      sent.current = path;
      tell(path);
    };
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { timer: setTimeout(run, 0), run };
  };
  // Leaving the typed path (the folder field unmounted: the place switched to Realm) runs a commit still waiting, at once.
  useEffect(() => {
    if (!commitTyped || !typing) return;
    return () => {
      const left = pending.current;
      if (!left) return;
      clearTimeout(left.timer);
      left.run();
    };
  }, [commitTyped, typing]);
  const options: Option[] = [
    ...(noHome ? (home ? [{ value: home, label: t('folder.homeAt', { path: home }) }] : []) : [{ value: '', label: t('folder.home') }]),
    ...known.map((f) => ({ value: f, label: f })),
    // A chosen folder the read no longer lists (the computer stopped, a read failed) is still shown as what would be used.
    ...(!typing && value && value !== home && !known.includes(value) && folderOk(value) ? [{ value, label: value }] : []),
    { value: ANOTHER, label: t('folder.another') },
  ];
  const bad = typing && typed !== '' && typedFolder(typed, root) === null;
  return (
    <div className={s.folder}>
      <Select
        {...(bare ? { 'aria-label': t('folder.legend') } : { label: t('folder.legend') })}
        options={options}
        value={typing ? ANOTHER : value === null || (noHome && value === '') ? undefined : value}
        onChange={(v) => {
          dropPending();
          if (v === ANOTHER) {
            setTyping(true);
            said.current = typed;
            send(typedFolder(typed, root));
            return;
          }
          setTyping(false);
          send(v);
        }}
        {...(description ? { description } : {})}
        {...(!typing && errorMessage ? { errorMessage } : {})}
        {...(isDisabled ? { isDisabled } : {})}
      />
      {typing && (
        <PathField
          label={t('folder.path')}
          mode="folder"
          rootLabel={root}
          read={reads}
          {...(whole ? { browseComputer: whole } : {})}
          computerName={computer}
          value={typed}
          {...(commitTyped ? { onCommit: commit } : {})}
          description={root ? t('folder.pathHelpHome', { home: root }) : t('folder.pathHelp', { computer })}
          {...(bad ? { errorMessage: root ? t('folder.pathBadHome', { home: root }) : t('folder.pathBad') } : errorMessage ? { errorMessage } : {})}
          {...(isDisabled ? { isDisabled } : {})}
          onChange={(v, how) => {
            // Browse's "Use this folder" at the root is the home folder: written as its own path, so the box shows what is chosen
            // (an emptied box chooses nothing).
            const text = v === '' && how === 'browsed' && root ? root : v;
            setTyped(text);
            if (!commitTyped || how !== 'typed') {
              dropPending();
              said.current = text;
              send(typedFolder(text, root));
            }
          }}
        />
      )}
      <StatusLine>{folders.state === 'loading' ? t('folder.loading') : null}</StatusLine>
      {folders.state === 'failed' && (
        <Band tone="warn" size="table" /* noDetails: a list the person can read again or skip by typing a path */ {...(folders.retry ? { actions: <TextButton onPress={folders.retry}>{t('folder.retry')}</TextButton> } : {})}>
          {t('folder.failed')}
        </Band>
      )}
    </div>
  );
}

export interface FolderDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  computer: string;
  /** The computer's handle; '' while unknown (no link is made). */
  handle: string;
  realm: string;
  realmName: string;
  folders: FoldersRead;
  onOpen: (href: string) => void;
}

/** "Work in a folder": pick a folder, then open its page (a folder page link, or nothing when the folder cannot be one). */
export function FolderDialog(p: FolderDialogProps) {
  const t = useStrings(strings);
  // '' = nothing picked yet; null = a typed path that is not valid. A pick belongs to the computer and realm it was made on: a
  // switch while the dialog is open starts it over (a path of one computer never opens on another).
  const at = `${p.handle}\n${p.realm}`;
  const [pick, setPick] = useState<{ at: string; path: string | null }>({ at, path: '' });
  // Every switch clears the pick (switching back never brings it back).
  if (pick.at !== at) setPick({ at, path: '' });
  const path = pick.at === at ? pick.path : '';
  const setPath = (x: string | null) => setPick({ at, path: x });
  const href = path && folderOk(path) && p.handle ? folderLink({ computer: p.handle, realm: p.realm, path }) : '';
  // "No folders yet" only on a read that answered with none.
  const none = p.folders.state === 'ok' && folderChoices(p.folders.folders).length === 0;
  return (
    <Dialog
      overlayId="ai.new.folder"
      isOpen={p.isOpen}
      onOpenChange={(o) => {
        if (!o) setPath('');
        p.onOpenChange(o);
      }}
      title={t('pickFolder.title')}
      body={t('pickFolder.subtitle', { computer: p.computer, realm: p.realmName })}
      size="lg"
      primaryLabel={t('pickFolder.open')}
      primaryDisabled={!href}
      onPrimary={() => {
        if (href) p.onOpen(href);
      }}
      cancelLabel={t('pickFolder.cancel')}
      initialFocus="field"
    >
      <FolderField key={at} computer={p.computer} folders={p.folders} value={path} onChange={setPath} noHome {...(none ? { description: t('pickFolder.none') } : {})} />
    </Dialog>
  );
}
