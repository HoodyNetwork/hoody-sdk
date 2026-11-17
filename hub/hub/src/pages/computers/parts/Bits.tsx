// Small display pieces of the computers page: server label with flag, realm chips and the no-realm note, the state pill,
// the access padlock with its explanation, a native select, and a code block.
import { DOCS_PERMISSIONS, STATE_TONE } from './Bits.pure';
export { DOCS_PERMISSIONS, STATE_TONE } from './Bits.pure';
import { Flag } from './Flag';
import { RealmDot } from './RealmDot';
export { Flag } from './Flag';
export { RealmDot } from './RealmDot';
import { Button, ComputerMark, IconButton, Tag, TextButton, Tooltip, Popover, StatusPill, useStrings, openOutside } from '@kit';
import type { ReactNode } from 'react';
import { access, bucket, serverLabel } from '../logic';
import strings from '../strings.en.json';
import type { Computer, Realm } from '../types';
import s from './parts.module.css';

/** Server name with its flag and place: `🇸🇬 n12 · Singapore`. */
export function ServerLabel({ computer, place = true }: { computer: Computer; place?: boolean }) {
  const sv = serverLabel(computer);
  if (!sv.name) return null;
  return (
    <span className={s.serverLabel}>
      <Flag cc={sv.cc} />
      <span>
        {sv.name}
        {place && sv.place ? <span className={s.faint}> · {sv.place}</span> : null}
      </span>
    </span>
  );
}

/** A realm's dot and name as one press (RealmChips with `open`, RealmsLine with Manage): it opens the computer's Realms
 *  drawer. The name is shown as written (`literal`); the kit button keeps its own touch size. `mono`: the name is a short id. */
export function RealmButton({ color, label, mono, aria, onPress }: { color: string | undefined; label: string; mono?: boolean; aria: string; onPress: () => void }) {
  return (
    <TextButton literal aria-label={aria} onPress={onPress}>
      <span className={s.realmItem}>
        <RealmDot color={color} />
        <span className={mono ? s.realmItemId : s.realmItemName}>{label}</span>
      </span>
    </TextButton>
  );
}

/** `open` (a computer's head, when the session may change its realms): each realm is a button that opens that
 *  computer's Realms drawer, the one its menu's Realms item opens. Without it the realms are plain labels. */
export function RealmChips({ ids, realms, max = 2, open }: { ids: readonly string[]; realms: readonly Realm[] | undefined; max?: number; open?: { name: string; onPress: () => void } }) {
  const t = useStrings(strings);
  if (!ids.length) return <span className={s.faint}>{t('realm.none')}</span>;
  const shown = ids.slice(0, max);
  return (
    <span className={s.realmChips}>
      {shown.map((id) => {
        const r = realms?.find((x) => x.id === id);
        const label = r?.name ?? t('realm.unnamed');
        if (open) return <RealmButton key={id} color={r?.color} label={label} aria={t('realm.open', { realm: label, name: open.name })} onPress={open.onPress} />;
        return (
          <Tag key={id} className={s.realmTag}>
            <RealmDot color={r?.color} />
            <span className={s.realmName} title={r?.name ?? t('realm.unnamed')}>{r?.name ?? t('realm.unnamed')}</span>
          </Tag>
        );
      })}
      {ids.length > shown.length ? <MoreRealms names={ids.slice(max).map((id) => realms?.find((x) => x.id === id)?.name ?? t('realm.unnamed'))} /> : null}
    </span>
  );
}

/** The "+N" after the realm chips names the other realms ("2 more realms: Acme client, Lab"): in the kit tooltip on
 *  hover or keyboard focus, and in a popover on a press (tap, click, Enter), as kit/data/IpInfo does. Its accessible
 *  name starts with the shown "+2" and says the same words ("+2 more realms: Acme client, Lab"). */
function MoreRealms({ names }: { names: readonly string[] }) {
  const t = useStrings(strings);
  const vars = { count: names.length, names: names.join(', ') };
  const words = t('realm.moreTip', vars);
  return (
    <Tooltip content={words}>
      <Popover label={words} placement="bottom start" width="sm" trigger={<TextButton aria-label={t('realm.moreName', vars)}>{t('realm.moreShort', { count: names.length })}</TextButton>}>
        {/* React passes the popover's clicks up to the row it was opened from; data-row-actions is the kit row's own
            "not a row click" mark, so pressing the text never opens the computer. */}
        <div className={s.popBody} data-row-actions="">
          <p>{words}</p>
        </div>
      </Popover>
    </Tooltip>
  );
}

/** What being in no realm means for a computer (verified against the API: a realm host lists and reads only that
 *  realm's computers, and a realm-limited key must use a realm
 *  host). A warning button opens the note, so it is reachable by keyboard and touch, and read as a dialog. */
export function NoRealmNote({ name }: { name: string }) {
  const t = useStrings(strings);
  return (
    <Popover label={t('realm.noneWhy')} placement="bottom start" trigger={<IconButton icon="warn" size="sm" variant="ghost" label={t('realm.noneWhy')} />}>
      <div className={s.popBody}>
        <p>{t('realm.noneBody', { name })}</p>
      </div>
    </Popover>
  );
}

/** The computer's own colour, the kit's square mark beside its name (round is its state); nothing when it has no valid
 * colour (the mark normalises it). */
export function ComputerDot({ computer }: { computer: Pick<Computer, 'color'> }) {
  return <ComputerMark color={computer.color} />;
}

export function StatePill({ status }: { status: string | undefined }) {
  const t = useStrings(strings);
  const b = bucket(status);
  return (
    <StatusPill tone={STATE_TONE[b] ?? 'neutral'} dot>
      {t(`state.${b}`)}
    </StatusPill>
  );
}

/** The padlock: closed when permissions are set. It describes the setting, never safety: a scope of 'set' only says
 *  rules exist, never who they let in, so it reads "Has access rules", never Private or Locked.
 *  `onView` opens the access drawer (absent when this session may not see it). `worded` draws the trigger as a small
 *  secondary Button with the short word (the Computers card footer); the popover and actions are the same. Its name holds
 *  that shown word (WCAG 2.5.3 label in name): the long name when the word is the long state or has no letters ("—", where
 *  axe compares nothing), else the word then the state's own sentence ("Shared. Anyone with the address of cedar can open
 *  its programs."), so the name still says what the state means. */
export function AccessLock({ computer, onView, worded, className }: { computer: Computer; onView?: () => void; worded?: boolean; className?: string }) {
  const t = useStrings(strings);
  const a = access(computer);
  const label = t(`access.${a.state}`);
  const icon = a.state === 'set' ? 'lock' : a.state === 'unchecked' ? 'warn' : 'eye';
  const name = t('access.aria', { name: computer.name, state: label });
  const short = t(`access.short.${a.state}`);
  const about = a.state === 'set' ? t(`access.set.${a.scope}.body`, { name: computer.name }) : t(`access.${a.state}.body`, { name: computer.name });
  const wordedName = short === label || !/\p{L}/u.test(short) ? name : t('access.ariaWorded', { name: computer.name, short, about });
  return (
    <Popover
      label={t('access.title')}
      placement="bottom end"
      trigger={
        worded ? (
          <Button size="sm" variant="secondary" iconEnd={icon} {...(className ? { className } : {})} aria-label={wordedName}>
            {t(`access.short.${a.state}`)}
          </Button>
        ) : (
          <IconButton icon={icon} size="sm" variant="ghost" label={name} />
        )
      }
    >
      <div className={s.popBody}>
        <strong>{label}</strong>
        <p>{a.state === 'set' ? t(`access.set.${a.scope}.body`, { name: computer.name }) : t(`access.${a.state}.body`, { name: computer.name })}</p>
        <p className={s.help}>{t('access.how')}</p>
        {onView ? (
          <Button size="sm" onPress={onView}>
            {t('access.view')}
          </Button>
        ) : null}
        <Button size="sm" {...(onView ? { variant: 'ghost' as const } : {})} iconEnd="external" onPress={() => openOutside(DOCS_PERMISSIONS)}>
          {t('access.learn')}
        </Button>
      </div>
    </Popover>
  );
}

/** The computer's colour as a press target: the kit tooltip names what the colour does on hover or
 *  keyboard focus, and pressing (click, tap, Enter) opens the colour dialog. The accessible name says the colour, so
 *  the swatch is never the only cue. Shown only where the colour may be changed. */
export function ColourButton({ c, colour, onPress, children }: { c: Computer; colour: string; onPress: () => void; children: ReactNode }) {
  const t = useStrings(strings);
  return (
    <Tooltip content={t('colour.tip')}>
      <TextButton className={s.colourButton} aria-label={t('colour.change', { name: c.name, colour })} onPress={onPress}>
        {children}
      </TextButton>
    </Tooltip>
  );
}

/** "Not in this realm" on a project: the same sentence in the kit tooltip on hover or keyboard
 *  focus, and in a popover on a press (tap, click, Enter), as MoreRealms. The accessible name starts with the shown
 *  words. */
export function OutsideTag() {
  const t = useStrings(strings);
  const tip = t('proj.outsideTip');
  return (
    <Tooltip content={tip}>
      <Popover label={t('proj.outside')} placement="bottom start" width="sm" trigger={<TextButton className={s.tagButton} aria-label={t('proj.outsideName', { tip })}><Tag>{t('proj.outside')}</Tag></TextButton>}>
        {/* data-row-actions: the kit row's "not a row click" mark, so pressing in the popover never opens the row. */}
        <div className={s.popBody} data-row-actions="">
          <p>{tip}</p>
        </div>
      </Popover>
    </Tooltip>
  );
}
