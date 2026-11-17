// A set of "doors" (ways in): the kit's side tabs on the left (one select on a phone), the selected
// door's commands as one block of captioned steps on the right. Arrow keys, Home and End move
// between doors (SideTabs). Commands come from the verbatim door table with facts filled in; a fact that is
// not known yet shows as a placeholder inside the real command.
import { CodeBlock, Link, PageLinkTo, Select, SideTabs, useStrings, type CodeBlockProps, type CodeLine } from '@kit';
import { currentPlatformHosts } from '@kit';
import { links as keys } from '../../keys/links';
import { links as bots } from '../../bots/links';
import { links as computers } from '../../computers/links';
import strings from '../strings.en.json';
import { docsUrl, doorById, maskAddress, resolveDoor, type DoorId, type GuideFacts } from '../logic';
import s from './guide.module.css';

interface Props {
  doors: readonly DoorId[];
  selected: DoorId;
  onSelect: (id: DoorId) => void;
  facts: GuideFacts | undefined;
  label: string;
}

export function DoorPanel({ doors, selected, onSelect, facts, label }: Props) {
  const t = useStrings(strings);
  const door = doorById(selected);

  const c = facts?.computer;
  const ids = c ? [c.id, c.project] : [];
  const resolved = resolveDoor(door, facts);
  const commands = resolved.filter((l) => l.kind === 'command');
  const needs = new Set(commands.flatMap((l) => l.needs));
  // Long ids are drawn masked; Copy gives the whole command (kit CodeLine.copy).
  const lines: CodeLine[] = commands.map((l) => ({
    caption: l.cap ? t(`cap.${l.cap}`) : undefined,
    code: l.parts.map((p) => (typeof p === 'string' ? maskAddress(p, ids) : { placeholder: t(`ph.${p.placeholder}`) })),
    copy: l.text || undefined,
    lang: l.lang,
  }));
  const hasPath = resolved.some((l) => l.kind === 'path');
  const docs = door.docs && facts ? docsUrl(facts.docsBase, door.docs.path) : '';
  // The installer or SDK host of the platform the Hub runs on (hoody.com while there are no facts yet).
  const host = door.host ? (facts?.hosts ?? currentPlatformHosts())[door.host] : '';

  const hasFooter = Boolean(door.host || (docs && door.docs) || door.key || needs.size > 0);
  const footer = !hasFooter ? undefined : (
    <span className={s.footerLinks}>
      {door.host && <Link href={`https://${host}`} variant="nav">{host}</Link>}
      {docs && door.docs && <Link href={docs} variant="nav">{t(door.docs.label)}</Link>}
      {door.key && <PageLinkTo href={keys.list}>{t('link.keys')}</PageLinkTo>}
      {needs.has('computer') && <PageLinkTo href={computers.list}>{t('door.pickComputer')}</PageLinkTo>}
      {needs.has('bot') && <PageLinkTo href={bots.list}>{t('door.pickBot')}</PageLinkTo>}
    </span>
  );

  return (
    <div className={s.doors}>
      <div className={s.doorSelect}>
        <Select
          label={t('door.select')}
          options={doors.map((id) => ({ value: id, label: t(`door.${id}`) }))}
          value={selected}
          onChange={onSelect}
        />
      </div>
      <SideTabs
        className={s.doorList}
        label={label}
        items={doors.map((id) => ({ id, label: t(`door.${id}`) }))}
        value={selected}
        onChange={onSelect}
      />
      <div className={s.panel} role="region" aria-label={t(`door.${selected}`)}>
        {noteKey(selected) && <p className={s.note}>{t(noteKey(selected) as 'door.ai.note')}</p>}
        {lines.length > 0 && (
          <CodeBlock // reason: the AI, MCP, bot and browser doors show addresses and prompts; http and models hold addresses, their commands name their own lang
            label={t(`door.${selected}`)} lines={lines} lang={LANG[selected]} placeholderReason={t(needs.has('computer') ? 'door.reasonComputer' : 'door.reasonBot')} footer={footer} />
        )}
        {hasPath && <p className={s.pathLine}>{t('door.chat.path')}</p>}
      </div>
    </div>
  );
}

/** Colour by door. A line of another language names its own (logic.ts DOORS): the SDK door's npm line, the commands in
 * the http and models doors. Addresses and prompts have no language, so they stay plain. */
const LANG: Record<DoorId, CodeBlockProps['lang']> = {
  coding: 'shell', cli: 'shell', ssh: 'shell',
  sdk: 'ts',
  ai: 'plain', http: 'plain', mcp: 'plain', models: 'plain', boturl: 'plain', chat: 'plain', browser: 'plain',
};

const NOTES: Partial<Record<DoorId, string>> = {
  ai: 'door.ai.note',
  coding: 'door.coding.note',
  sdk: 'door.sdk.note',
  http: 'door.http.note',
  mcp: 'door.mcp.note',
  models: 'door.models.note',
  chat: 'door.chat.note',
  ssh: 'door.ssh.note',
};

function noteKey(id: DoorId): string | undefined {
  return NOTES[id];
}
