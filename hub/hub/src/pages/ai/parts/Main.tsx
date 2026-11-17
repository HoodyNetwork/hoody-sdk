// The AI layout's main region for the chat routes: /ai and /ai/new are New chat (pages/ai/new). ChatHead names
// a chat that cannot be read here: its title, computer · realm and folder (the open chat itself is
// parts/Conversation.tsx). Read-only.
import { Link, useContainerNarrow, useStrings } from '@kit';
import { links } from '../links';
import { NewChat } from '../new/NewChat';
import { keyOf } from './chats.logic';
import { PANE_MIN_PAGE, useAiChats, useRealmName } from './Pane';
import { whereLine } from './Pane.pure';
import strings from './Pane.strings.en.json';
import s from './Pane.module.css';

/** /ai (desktop) and /ai/new: New chat. */
export function ChatsHome() {
  return <NewChat />;
}

export interface ChatHeadProps {
  sid: string;
  /** The link's computer handle and realm (the chat's own reference, not the top bar's). */
  computer: string;
  realm: string;
}

export function ChatHead({ sid, computer, realm }: ChatHeadProps) {
  const t = useStrings(strings);
  const c = useAiChats();
  const realmName = useRealmName();
  const narrow = useContainerNarrow(PANE_MIN_PAGE);
  // Only the list of the same computer can name the chat; another computer's chat shows its reference alone.
  const here = !!c && c.handle !== '' && c.handle === computer;
  const row = here ? c.chats.rows?.find((r) => r.key === keyOf(realm, sid)) : undefined;
  const name = here ? c.computerName : computer;
  return (
    <header className={s.chatHead}>
      {narrow && (
        <Link href={links.tab} variant="nav">
          {t('main.back')}
        </Link>
      )}
      <h2>{row?.title || t('row.untitled')}</h2>
      <span className={s.chatMeta}>
        {whereLine(t, name, realmName(realm))}
        {row?.cwd ? ` · ${row.cwd}` : ''}
      </span>
    </header>
  );
}
