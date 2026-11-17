// The inspector of one open app (the detail-pane archetype): the header holds the name, its state and the one primary;
// the body is the verdict (what is true now), the row's notes, the facts that are known with the web address, the
// command, the Board row (Put on Board, or why not and Open in a new tab), the access code, and last the one danger
// group: Stop (a running app) and taking the row off the list, each said once with what it leaves alone.
import { AddressField, Button, CodeBlock, LinkButton, DetailBody, DetailHeader, Facts, OutcomeBanner, SecretField, SettingGroup, SettingRow, Stack, StatusPill, Verdict, formatDateTime, useStrings, type Fact, type Translate } from '@kit';
import { marked, type OpenApp, type LaunchView } from '../logic';
import type { Words } from '../launch/openWith/facts';
import owStrings from '../launch/openWith/strings.en.json';
import { rowWords } from '../launch/openWith/useOpenWith';
import type { BoardOffer } from './board';
import strings from '../strings.en.json';
import s from './parts.module.css';
import { ACTION_KEY, TONE, type T, opensWord, shortState } from './words';

const LINKS: ReadonlySet<string> = new Set(['open', 'terminal', 'screen', 'address']);

export interface InspectorProps {
  app: OpenApp;
  v: LaunchView;
  /** The access code of this launch, held in memory only. */
  accessCode: string | undefined;
  busy: 'stop' | 'check' | 'restart' | 'open' | undefined;
  /** The row's note (a second Open held, a restart that started nothing), shown here too: on a phone the detail
   *  covers the list, where the row shows it. */
  note?: string | undefined;
  /** The address of a link action (Open, Terminal, Screen), built by core. */
  href: string | undefined;
  /** Put on Board (parts/board.ts): the Board's link for this launch's place, or the place it refuses (say why and
   *  offer it in a new tab), or none. */
  board?: BoardOffer;
  onPrimary: () => void;
  onCheck: () => void;
  onRestart: () => void;
  /** The Open may still be going through: the remove action reads Dismiss and asks first. */
  held?: boolean;
  onForget: () => void;
  /** Stop, where the row's menu offers it (a running app the page may stop): it asks first, as the menu's does. */
  onStop?: (() => void) | undefined;
  /** A terminal the app left open: taking the row off the list closes that terminal first. */
  leftover?: boolean;
  /** The kit wiped the shown access code (idle, tab hidden): the page drops its copy too. */
  onCodeGone?: () => void;
}

/** The C9 banner of an unknown row, by what is unknown: an Open that may have gone through,
 *  a Stop that may have, or any other unconfirmed state. A row being read back (checking) shows none: its
 *  sentence says so, and nothing was asked of the computer that could have gone through. */
function bannerOf(a: Pick<OpenApp, 'state' | 'code'>): 'launch' | 'stop' | 'act' | null {
  if (a.state !== 'unknown' || a.code === 'checking') return null;
  return a.code === 'start_unconfirmed' ? 'launch' : a.code === 'stop_unconfirmed' ? 'stop' : 'act';
}

export function facts(t: T, a: OpenApp): Fact[] {
  return [
    // The web address with Copy, Open and its QR code (kit AddressField), first: it is what people come for.
    ...(a.urls.web ? [{ label: t('insp.address'), value: <AddressField url={a.urls.web} label={t('insp.address')} resetKey={a.key} /> }] : []),
    { label: t('insp.opensIn'), value: opensWord(t, a.opensIn) },
    // Only what is known: an app with no terminal, an unnamed source or no settings shows no row for it.
    ...(a.terminal === null ? [] : [{ label: t('insp.where'), value: t('det.whereV', { n: a.terminal }) }]),
    { label: t('insp.started'), value: formatDateTime(new Date(a.startedAt).toISOString()) },
    ...(a.source && a.source !== t('src.other') ? [{ label: t('insp.source'), value: a.source }] : []),
    ...(a.settings.length ? [{ label: t('insp.settings'), value: a.settings.join(', '), mono: true }] : []),
    // The launch's tag, masked like every id (kit IdChip: last 4 with Copy); "Nothing yet" until the computer admits it.
    a.handle ? { label: t('insp.handle'), id: a.handle } : { label: t('insp.handle'), value: t('insp.none') },
  ];
}

/** The Verdict's sentence of a row's view (logic.ts view()): its key read through literal keys, a key family or one key,
 *  so the anatomy check measures the plate's own text. Says what t(key) says. */
export function viewSentence(t: T, key: string, name: string): string {
  if (key.startsWith('st.')) return t(`st.${key.slice(3)}` as 'st.ready', { name });
  if (key.startsWith('fail.')) return t(`fail.${key.slice(5)}` as 'fail.generic', { name });
  if (key === 'find.none') return t('find.none', { name });
  if (key === 'find.sourcesDown') return t('find.sourcesDown', { name });
  if (key === 'find.warming') return t('find.warming', { name });
  return t('fail.generic', { name });
}

/** A Files launch's sentence from its words, through the w.* key family: what rowSentence says. */
export function wordsSentence(owT: Translate<typeof owStrings>, w: Words): string {
  return owT(`w.${w.key.slice(2)}` as 'w.ready', w.vars);
}

/** The action the detail header draws as its accent button, or null: an unknown row's Check lives in its banner. */
export function headActionOf(a: Pick<OpenApp, 'state' | 'code'>, v: LaunchView): NonNullable<LaunchView['primary']> | null {
  const primary = v.primary;
  return primary && primary !== 'wait' && !(bannerOf(a) && primary === 'check') ? primary : null;
}

/** True while the detail header shows an accent button: an action that is a link draws only with its address. */
export function headHasAccent(a: Pick<OpenApp, 'state' | 'code'>, v: LaunchView, href: string | undefined): boolean {
  const act = headActionOf(a, v);
  return act !== null && (!LINKS.has(act) || href !== undefined);
}

export function Inspector({ app: a, v, accessCode, busy, note, href, board, onPrimary, onCheck, onRestart, held, onForget, onStop, leftover, onCodeGone }: InspectorProps) {
  const t = useStrings(strings);
  const banner = bannerOf(a);
  // A Files launch says what its tile and hold card say; a Stop that may have gone through keeps its own words.
  const owT = useStrings(owStrings);
  const ow = marked(a) ? wordsSentence(owT, rowWords(a)) : null;
  const headerAction = headActionOf(a, v);
  // A place the Board refuses opens in a new tab instead: its own link here, unless the header's link already opens
  // that same place (a running app's Open display). A header link to another place (Open terminal on a started screen
  // app) or none (Check, nothing) leaves it here. With no address for the place, the note promises no new tab.
  const refused = board && 'refused' in board ? board.refused : null;
  const refusedUrl = refused ? (refused.kind === 'display' ? a.urls.screen : refused.kind === 'terminal' ? a.urls.terminal : undefined) : undefined;
  const headerOpensIt = refusedUrl !== undefined && headerAction !== null && LINKS.has(headerAction) && href === refusedUrl;
  const tabHref = headerOpensIt ? undefined : refusedUrl;
  const noTileWords = refused && refused.kind === 'terminal' && a.opensIn !== 'terminal' ? 'launcher.noTileTerminal' : 'launcher.noTile';
  const stopRow = onStop !== undefined && headerAction !== 'stop';
  const running = a.state === 'running' || a.state === 'ready' || a.state === 'started';
  return (
    <>
      <DetailHeader
        title={a.name}
        status={
          <StatusPill tone={TONE[v.tone]} dot>
            {shortState(t, v.key)}
          </StatusPill>
        }
        actions={
          <>
          {/* An unknown row's Check lives in its banner; the header does not repeat it. */}
          {headerAction ? (
            LINKS.has(headerAction) ? (
              href ? (
                <LinkButton variant="primary" href={href} iconEnd="external">
                  {t(ACTION_KEY[headerAction] as 'act.open')}
                </LinkButton>
              ) : null
            ) : (
              <Button variant="primary" busy={busy !== undefined} onPress={onPrimary}>
                {t(ACTION_KEY[headerAction] as 'act.open')}
              </Button>
            )
          ) : null}
          </>
        }
      />
      <DetailBody>
        <Stack gap={5}>
          {/* The banner says it all for an unknown row: no verdict repeating it. */}
          {banner ? null : (
            <Verdict label={t('insp.now')}>{ow ?? viewSentence(t, v.key, a.name)}</Verdict>
          )}
          {note ? (
            <p className={s.rowNote} role="status" /* reason: a one-line hint (held Open, restart note), no outcome or retry of its own */>
              {note}
            </p>
          ) : null}
          {banner ? <OutcomeBanner kind="pending" title={ow && banner !== 'stop' ? ow : t(`outcome.${banner}.title`, { name: a.name })} body={t(`outcome.${banner}.body`)} onCheck={onCheck} checking={busy === 'check'} /> : null}
          <Facts items={facts(t, a)} columns={2} />
          {a.command ? <CodeBlock label={t('insp.command')} code={a.command} lang="shell" prompt /> : null}
          {/* The Board, one row: its link for this app's place, or why the Board can't show it and the new-tab link. */}
          {refused || (board && 'to' in board) ? (
            <SettingGroup label={t('insp.board')}>
              <SettingRow
                label={t('insp.board')}
                help={refused ? (refusedUrl ? t(noTileWords, { name: a.name }) : t(noTileWords === 'launcher.noTile' ? 'board.noTileBare' : 'board.noTileTerminalBare', { name: a.name })) : t('insp.boardHelp')}
                actions={
                  tabHref ? (
                    <LinkButton variant="secondary" href={tabHref} iconEnd="external">
                      {t('launcher.openTab')}
                    </LinkButton>
                  ) : board && 'to' in board ? (
                    <LinkButton variant="secondary" icon="board" href={board.to}>
                      {t('act.board')}
                    </LinkButton>
                  ) : undefined
                }
              />
            </SettingGroup>
          ) : null}
          {accessCode ? (
            <SecretField label={t('insp.code')} value={accessCode} description={t('code.gone')} onWipe={onCodeGone} />
          ) : a.asksCode ? (
            <SettingGroup label={t('insp.code')}>
              <SettingRow
                label={t('insp.code')}
                help={t('insp.codeGone')}
                actions={
                  <Button variant="secondary" busy={busy === 'restart'} onPress={onRestart}>
                    {t('act.restart')}
                  </Button>
                }
              />
            </SettingGroup>
          ) : null}
          {/* The danger group, last, each action once. Stop where the row's menu offers it (the header's own Stop is not
              repeated). Taking the row off the list says what it leaves alone; a row whose Open may still be going
              through reads Stop tracking and says what that risks; the page asks before it acts. */}
          <SettingGroup tone="danger" {...(stopRow ? { title: t('insp.end') } : { label: t('insp.end') })}>
            {stopRow ? (
              <SettingRow
                label={t('insp.stopRow', { name: a.name })}
                help={t('stop.body')}
                actions={
                  <Button tone="danger" icon="stop" onPress={onStop}>
                    {t('act.stop')}
                  </Button>
                }
              />
            ) : null}
            <SettingRow
              label={held ? t('insp.heldRow') : t('act.forget')}
              help={held ? t('dismiss.body') : leftover ? t('insp.forgetLeft') : running ? t('insp.forgetRunning', { name: a.name }) : t('insp.forgetStopped')}
              actions={
                <Button tone="danger" icon="trash" onPress={onForget}>
                  {held ? t('act.dismiss') : t('act.remove')}
                </Button>
              }
            />
          </SettingGroup>
        </Stack>
      </DetailBody>
    </>
  );
}
