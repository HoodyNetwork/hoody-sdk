// A folder's page, /ai/f/<key>?computer=<handle>&realm=<global|id>. Everything it shows is
// the link's folder on the link's computer in the link's realm, never the top bar's. Title = the folder's
// name; the line names its path and computer; the repository tag shows once the status read says it is one. Tabs:
// Chats (the pane's chat list, pinned to this folder, fed by this computer's and realm's own reads), Repository,
// Memory, Automations. A link that is not complete (key.ts, folder.ts) reads nothing and says so.
// Head actions: Sync with Pull and Push (Commit.tsx; shown once the status read says it is a repository), and the
// band of the folder's last write under the head. The route is mounted by the /ai routes.
import { computerHandle } from '@core';
import { EmptyState, ErrorState, LinkButton, PageHeader, Skeleton, Tabs, usePathname, useSearchParam, useStrings } from '@kit';
import { useMemo } from 'react';
import { ChatList } from '../parts/ChatList';
import { useChats, type ChatsAt } from '../parts/data';
import { useRealmName } from '../parts/Pane';
import { folderAtOf, folderLinkOf, keyOfPath, useFolderComputer, type AccountComputer, type FolderLink } from './folder';
import { folderName } from './key';
import { SyncActions, useFolderWrites, WriteBand } from './Commit';
import Repository, { RepoTag } from './Repository';
import { useRepoStatus, type FolderAt } from './data';
import s from './FolderPage.module.css';
import strings from './strings.en.json';

type TabId = 'chats' | 'repository' | 'memory' | 'automations';
const TABS: readonly TabId[] = ['chats', 'repository', 'memory', 'automations'];
/** The AI tab: where an incomplete link sends the person. */
export const AI_HREF = '/ai';

export default function FolderPage() {
  const pathname = usePathname();
  const [computer] = useSearchParam('computer');
  const [realm] = useSearchParam('realm');
  const link = useMemo(() => folderLinkOf(keyOfPath(pathname), computer, realm), [pathname, computer, realm]);
  return link ? <Found link={link} /> : <Incomplete />;
}

function Incomplete() {
  const t = useStrings(strings);
  return (
    <section className={s.page} aria-label={t('folder.region')}>
      <EmptyState
        icon="files"
        title={t('folder.incomplete.title')}
        body={t('folder.incomplete.body')}
        action={<LinkButton size="sm" variant="primary" href={AI_HREF}>{t('folder.openAi')}</LinkButton>}
      />
    </section>
  );
}

function Found({ link }: { link: FolderLink }) {
  const t = useStrings(strings);
  const { state, retry, retrying } = useFolderComputer(link);
  const name = folderName(link.path);
  // One folder per mount: a link to another folder (computer, realm, path) starts afresh, its writes and confirms included.
  if (state.kind === 'found') return <Folder key={`${state.computer.id}\u0000${link.realm}\u0000${link.path}`} link={link} computer={state.computer} />;
  let body;
  if (state.kind === 'pending') body = <Skeleton variant="table" rows={3} columns={2} />;
  else if (state.kind === 'error') body = <ErrorState title={t('folder.computers.failed')} error={state.error} onRetry={retry} retrying={retrying} />;
  else {
    body = (
      <EmptyState
        icon="files"
        title={t(state.kind === 'unchecked' ? 'folder.unchecked.title' : state.kind === 'twin' ? 'folder.twin.title' : 'folder.missing.title')}
        body={t(state.kind === 'unchecked' ? 'folder.unchecked.body' : state.kind === 'twin' ? 'folder.twin.body' : 'folder.missing.body', { handle: link.handle })}
        action={<LinkButton size="sm" variant="secondary" href={AI_HREF}>{t('folder.openAi')}</LinkButton>}
      />
    );
  }
  return (
    <section className={s.page} aria-label={t('folder.label', { name })}>
      <PageHeader title={name} subtitle={<bdi dir="ltr">{link.path}</bdi>} />
      {body}
    </section>
  );
}

function Folder({ link, computer }: { link: FolderLink; computer: AccountComputer }) {
  const t = useStrings(strings);
  const at = useMemo<FolderAt>(() => folderAtOf(link, computer), [link, computer]);
  const status = useRepoStatus(at);
  const [tab] = useSearchParam('tab');
  const open: TabId = TABS.includes(tab as TabId) ? (tab as TabId) : 'chats';
  const realmName = useRealmName();
  const name = folderName(link.path);
  const flow = useFolderWrites(at);
  const isRepo = status.data?.kind === 'repo';
  return (
    <section className={s.page} aria-label={t('folder.label', { name })}>
      <PageHeader
        title={name}
        meta={<RepoTag status={status.data} />}
        subtitle={t('folder.line', { path: link.path, computer: computer.name })}
        actions={isRepo ? <SyncActions flow={flow} /> : undefined}
        tabsFollow={!flow.shown}
      />
      <div className={s.body}>
        <WriteBand flow={flow} at={at} />
        <Tabs<TabId>
          label={t('folder.tabs')}
          param="tab"
          items={TABS.map((id) => ({ id, label: t(`folder.tab.${id}` as const) }))}
        >
          {open === 'chats' ? <Chats at={at} computer={computer} />
            : open === 'repository' ? <Repository at={at} names={{ computer: computer.name, realm: realmName(at.realm) }} writes={flow} />
            : open === 'memory' ? <Pointer kind="memory" />
            : <Pointer kind="automations" />}
        </Tabs>
      </div>
    </section>
  );
}

/** The folder's chats: the pane's chat list with the folder pinned, read on this folder's computer and realm. */
function Chats({ at, computer }: { at: FolderAt; computer: AccountComputer }) {
  const chatsAt = useMemo<ChatsAt>(() => ({ target: at.target, realm: at.realm }), [at]);
  const chats = useChats(chatsAt);
  return <ChatList at={chatsAt} chats={chats} handle={computerHandle(computer)} computerName={computer.name} folder={at.cwd} />;
}

function Pointer({ kind }: { kind: 'memory' | 'automations' }) {
  const t = useStrings(strings);
  return <EmptyState size="sm" icon={kind === 'memory' ? 'database' : 'clock'} title={t(`folder.${kind}.title`)} body={t(`folder.${kind}.body`)} />;
}
