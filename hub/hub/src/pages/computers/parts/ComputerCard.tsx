// One computer in the Computers cards view: a head (colour, name, state), a body (realms, location, size,
// usage) and a footer (access, the one start button its state offers, the row menu), inside the kit CutFrame (a 1 px
// frame with a slanted bottom-right corner). Look only: the data, the actions and their labels are the table row's.
// The kit row around it (DataTable cardRender) keeps focus, keys, selection and the row menu, and hands this card its
// checkbox and menu cells.
import { Button, ComputerMark, ReasonButton, CutFrame, formatStorage, Meter, Popover, StatusPill, Tag, TextButton, Tooltip, UpgradeLink, useStrings, type Tone } from '@kit';
import type { ReactNode } from 'react';
import { links as billingLinks } from '../../billing/links';
import { allowedOps, allows, bucket, projectName, serverLabel, sizeParts, usageReadings, type Caps } from '../logic';
import strings from '../strings.en.json';
import type { Computer, Project, Realm, Server, Usage } from '../types';
import { AccessLock, Flag, RealmDot } from './Bits';
import type { ComputerAction } from './menu';
import type { OpState } from './ops';
import { cardUpgrade } from './upgrade';
import s from './ComputerCard.module.css';

const TAG: Record<string, 'run' | 'fail' | 'info' | 'warn' | 'plain'> = { running: 'run', failed: 'fail', starting: 'info', attention: 'warn' };

export interface ComputerCardProps {
  computer: Computer;
  projects: Project[] | undefined;
  realms: Realm[] | undefined;
  caps: Caps;
  current: boolean;
  op: OpState | undefined;
  /** The Show usage switch: undefined while it is off (no usage block then); a computer without a reading shows dashes. */
  usage: Usage | null | undefined;
  showUsage: boolean;
  /** The computer's server in the servers list (its near/full upgrade); undefined while unknown, and then none. */
  server?: Server;
  /** The access popover's "View access rules": opens the access drawer; absent when this session may not see the rules. */
  onAccess?: () => void;
  onAction: (c: Computer, a: ComputerAction) => void;
  /** The kit row's own pieces: its selection checkbox and its row menu (Row actions). */
  check: ReactNode;
  menu: ReactNode;
}

/** A size in GB as the shared formatStorage reads it ("1.5 TB"), split into the tile's number and unit. */
function storageParts(gb: number | null): { value: string; unit: string } {
  if (gb === null) return { value: '', unit: '' };
  const text = formatStorage(gb);
  const at = text.lastIndexOf(' ');
  return at < 0 ? { value: text, unit: '' } : { value: text.slice(0, at), unit: text.slice(at + 1) };
}

/** The card's state tag is the kit StatusPill (a mono caps tag): each card tone is one kit tone. */
const CARD_TONE: Record<'run' | 'fail' | 'info' | 'warn' | 'plain', Tone> = { run: 'ok', fail: 'danger', info: 'info', warn: 'warn', plain: 'neutral' };

export function ComputerCard(p: ComputerCardProps) {
  const t = useStrings(strings);
  const c = p.computer;
  const b = bucket(c.status);
  const proj = projectName(p.projects, c.project_id);
  const tag = ((): { tone: 'run' | 'fail' | 'info' | 'warn' | 'plain'; word: string } => {
    if (p.op?.kind === 'busy') return { tone: 'info', word: t(`op.busy.${p.op.op}`) };
    if (p.op?.kind === 'pending') return { tone: 'warn', word: t('op.pill.pending') };
    if (p.op?.kind === 'failed' || p.op?.kind === 'not_sent') return { tone: 'fail', word: t('op.pill.failed') };
    return { tone: TAG[b] ?? 'plain', word: t(`state.${b}`) };
  })();
  const bad = b === 'failed';
  const held = p.op?.kind === 'busy' || p.op?.kind === 'pending';
  // The one start button the state offers, as the table's Actions column: Restart when failed, Start or Resume when
  // stopped or paused; nothing while a press is held.
  const startOp = held ? undefined : allowedOps(c, p.caps).find((o) => o === 'start' || o === 'resume' || (bad && o === 'restart'));
  // realm_ids absent: the list did not say which realms (unknown, never "No realm"); [] is a known none (C9).
  const known = Array.isArray(c.realm_ids);
  const ids = c.realm_ids ?? [];
  const realmOf = (id: string) => p.realms?.find((r) => r.id === id);
  const first = ids[0] === undefined ? undefined : realmOf(ids[0]);
  const where = serverLabel(c);
  const sz = sizeParts(c);
  const ram = storageParts(sz.ramGb);
  // Only near or full, from the card's own CPU and memory bars, on a server that can grow.
  const meters = p.showUsage && p.usage ? usageReadings(p.usage).flatMap((r) => (r.id === 'cpu' || r.id === 'mem' ? [r.v] : [])) : [];
  const up = cardUpgrade(p.server, meters);
  return (
    <CutFrame as="article" className={s.card} innerClassName={s.inner} data-bad={bad ? '' : undefined} aria-label={c.name}>
        <div className={s.head} data-part="head">
          {p.check}
          <ComputerMark color={c.color} />
          <h3 className={s.name} title={c.name}>
            {c.name}
          </h3>
          <span className={s.state} data-tone={tag.tone}>
            <StatusPill tone={CARD_TONE[tag.tone]} dot>
              {tag.word}
            </StatusPill>
          </span>
        </div>
        {proj || p.current ? (
          <div className={s.sub}>
            {proj ? <span>{proj}</span> : null}
            {p.current ? <span title={t('current.tip')}>{t('current.chip')}</span> : null}
          </div>
        ) : null}
        <div className={s.body}>
          <div className={s.realms}>
            {!known ? (
              <span className={s.none}>{t('card.realmUnknown')}</span>
            ) : first || ids.length ? (
              <>
                <Tag className={s.chip}>
                  <RealmDot color={first?.color} />
                  <span title={first?.name ?? t('realm.unnamed')}>{first?.name ?? t('realm.unnamed')}</span>
                </Tag>
                {ids.length > 1 ? <CardMoreRealms names={ids.slice(1).map((id) => realmOf(id)?.name ?? t('realm.unnamed'))} all={ids.map((id) => ({ id, realm: realmOf(id) }))} /> : null}
              </>
            ) : (
              <span className={s.none}>{t('realm.none')}</span>
            )}
          </div>
          {where.name ? (
            <div className={s.where} title={t('card.server', { name: where.name })}>
              <span className={s.label}>{t('card.location')}</span>
              <Flag cc={where.cc} />
              <span>{where.place || where.name}</span>
            </div>
          ) : null}
          {sz.cores !== null || sz.ramGb !== null ? (
            <div className={s.specs}>
              {sz.cores !== null ? (
                <div className={s.spec}>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <rect x="5" y="5" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="8" y="8" width="4" height="4" fill="currentColor" />
                    <path d="M8 1v3M12 1v3M8 16v3M12 16v3M1 8h3M1 12h3M16 8h3M16 12h3" stroke="currentColor" strokeWidth="1.6" fill="none" />
                  </svg>
                  <div>
                    <b>{sz.cores}</b>
                    <span>{t('card.cores', { count: sz.cores })}</span>
                  </div>
                </div>
              ) : null}
              {sz.ramGb !== null ? (
                <div className={s.spec}>
                  <svg width="24" height="20" viewBox="0 0 24 20" aria-hidden="true">
                    <rect x="0" y="4" width="24" height="10" fill="currentColor" />
                    <path d="M3 7h3v4H3zM8 7h3v4H8zM13 7h3v4h-3zM18 7h3v4h-3z" className={s.cut} />
                    <path d="M2 14h2v3H2zM6 14h2v3H6zM10 14h2v3h-2zM14 14h2v3h-2zM18 14h2v3h-2z" fill="currentColor" />
                  </svg>
                  <div>
                    <b>{ram.value}</b>
                    <span>{t('card.ram', { unit: ram.unit })}</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {p.showUsage ? (
            <div className={s.usage} data-card-usage="">
              {(p.usage ? usageReadings(p.usage).flatMap((r) => (r.id === 'cpu' || r.id === 'mem' ? [{ ...r, id: r.id }] : [])) : (['cpu', 'mem'] as const).map((id) => ({ id, v: null, text: null }))).map((r) => (
                <div key={r.id} className={s.bar}>
                  <span>{t(`card.use.${r.id}`)}</span>
                  {r.v === null || r.text === null ? <span className={s.barEmpty} /> : <Meter className={s.meter} value={r.v} label={t(`usage.${r.id}`, { pct: r.text })} />}
                  <em>{r.text === null ? '—' : t('card.use.pct', { pct: r.text })}</em>
                </div>
              ))}
              {up.available === 'none' ? null : <UpgradeLink available={up.available} prominence={up.prominence} href={billingLinks.plans} label={t('ov.upgrade')} />}
            </div>
          ) : null}
        </div>
        <div className={s.foot} data-part="foot">
          <AccessLock computer={c} worded className={s.access} {...(p.onAccess ? { onView: p.onAccess } : {})} />
          <div className={s.acts}>
            {startOp ? (
              <Button size="sm" variant="secondary" iconEnd={startOp === 'restart' ? 'reload' : 'play'} className={s.wide} onPress={() => p.onAction(c, startOp)}>
                {t(`menu.${startOp}`)}
              </Button>
            ) : bad && !held && c.server_expired !== true && !allows(p.caps, 'restart') ? (
              // A failed computer this sign-in may not restart: Restart shows off, with why, as the table's Actions cell.
              <ReasonButton size="sm" reason={t('row.restart.noRight')}>{t('menu.restart')}</ReasonButton>
            ) : b === 'starting' && !held ? (
              <span className={s.note}>{t('state.starting.note')}</span>
            ) : null}
            {p.menu}
          </div>
        </div>
    </CutFrame>
  );
}

/** The yellow "+N" after the first realm, as the list's (Bits MoreRealms): the other realms' names in
 *  the kit tooltip on hover or keyboard focus, and a popover named with the same words on a press, which lists every
 *  realm of the computer with its colour. Its accessible name starts with the shown "+N". */
function CardMoreRealms({ names, all }: { names: readonly string[]; all: readonly { id: string; realm: Realm | undefined }[] }) {
  const t = useStrings(strings);
  const vars = { count: names.length, names: names.join(', ') };
  const words = t('realm.moreTip', vars);
  return (
    <Tooltip content={words}>
      <Popover
        label={words}
        placement="bottom start"
        width="sm"
        trigger={
          <TextButton className={s.more} aria-label={t('realm.moreName', vars)}>
            {t('realm.moreShort', { count: names.length })}
          </TextButton>
        }
      >
        {/* data-row-actions: the kit row's "not a row press" mark, so a press here never opens the computer. */}
        <div className={s.pop} data-row-actions="">
          <p className={s.popTitle}>{words}</p>
          <ul>
            {all.map(({ id, realm }) => (
              <li key={id}>
                <RealmDot color={realm?.color} />
                {realm?.name ?? t('realm.unnamed')}
              </li>
            ))}
          </ul>
        </div>
      </Popover>
    </Tooltip>
  );
}
