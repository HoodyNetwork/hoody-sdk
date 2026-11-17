// DetailsPanel: one conversation's Details. A column of its own, shown by SplitLayout where the rule says
// (pushed at m and wider, a sheet below 840), never over the conversation. Tabs Activity, Edits, Session and Usage; the
// last tab is remembered per viewer. This panel draws Activity (what waits, where it runs, the safety note) and Edits (the
// edit tools' files); Session and Usage are passed in by the host: a tab with no content is not
// drawn, so nothing here is a stub.
import { useState, type ReactNode } from 'react';
import { IconButton } from '../controls/Button';
import { Link, TextButton } from '../controls/Link';
import { Tabs } from '../controls/Tabs';
import { Facts } from '../data/Display';
import { HeadingBelow } from '../layouts/anatomy/Heading';
import { SubSection } from '../layouts/anatomy/Section';
import { useStrings } from '../strings';
import { CodeBlock } from '../data/Ids';
import { clean, kitLang, scrubSecrets } from './code';
import { needsWhat } from './NeedsBar';
import type { ConvSnapshot, EditView, GateEntry } from './source';
import needsStrings from './NeedsBar.strings.en.json';
import strings from './DetailsPanel.strings.en.json';
import s from './DetailsPanel.module.css';
import { hostEnv } from '@core';

export type DetailsTab = 'activity' | 'edits' | 'session' | 'usage';
const TABS: readonly DetailsTab[] = ['activity', 'edits', 'session', 'usage'];
const KEY = 'hub.v3.ai.details.tab';

/** The last tab the person used, kept on this device (best effort; refused storage only means it is not remembered). */
function readTab(): DetailsTab {
  try {
    const v = hostEnv().local?.getItem(KEY) ?? null;
    return TABS.find((x) => x === v) ?? 'activity';
  } catch { return 'activity'; }
}
function writeTab(v: DetailsTab): void {
  try { hostEnv().local?.setItem(KEY, v); } catch { /* not remembered */ }
}

export interface DetailsPanelProps {
  snapshot: ConvSnapshot;
  onClose: () => void;
  /** More under Running now (shell jobs, loops, helpers, your recent actions), passed in by the host. */
  activityExtra?: ReactNode;
  /** The Session and Usage tabs' content. Absent: the tab is not drawn. */
  session?: ReactNode;
  usage?: ReactNode;
  /** Controlled tab; absent: remembered on this device. */
  tab?: DetailsTab;
  onTab?: (t: DetailsTab) => void;
  /** Brings that gate's card in the conversation to the person (Activity's Show). Absent: no Show. */
  onShowGate?: (g: GateEntry) => void;
}

const has = (x: ReactNode): boolean => x !== undefined && x !== null && x !== false;

/** What is known to be going on, from the facts alone; "nothing" only when the chat is known idle and reachable. */
function quiet(f: ConvSnapshot['facts']): 'unreachable' | 'loading' | 'closed' | 'working' | 'nothing' {
  if (f.reach !== 'ok') return 'unreachable';
  if (f.state === 'loading') return 'loading';
  if (f.state === 'closed' || f.state === 'gone') return 'closed';
  if (f.state === 'running' || f.turn || f.queued || f.children || f.shells) return 'working';
  return 'nothing';
}

/** "Where it runs": a session's computer, realm, folder, agent and model, keys hidden first, as
 *  the gate text is, then cleaned and bounded. */
const metaText = (x: string, max: number): string => clean(scrubSecrets(x), max).text;

function Activity({ snapshot, extra, onShowGate }: { snapshot: ConvSnapshot; extra?: ReactNode; onShowGate?: (g: GateEntry) => void }) {
  const t = useStrings(strings);
  const n = useStrings(needsStrings);
  const m = snapshot.meta;
  const waiting = snapshot.gates.filter((g) => g.decision === null);
  const sending = snapshot.gates.filter((g) => g.decision === 'sending');
  const unsure = snapshot.gates.filter((g) => g.decision === 'unknown');
  // Each gate in one row, in this order: what waits for the person, what is on its way, what is not settled.
  const rows = [...waiting, ...sending, ...unsure];
  const line = (g: GateEntry): string => {
    const what = needsWhat(g, n);
    if (g.decision === 'sending') return t('det.sending', { what });
    if (g.decision === 'unknown') return t(g.gone ? 'det.lost' : 'det.unsure', { what });
    return t('det.waiting', { what });
  };
  const askedBy = (g: GateEntry): string => {
    if (!g.helper) return '';
    const name = clean(scrubSecrets(g.helperName ?? ''), 80).text.trim(); // keys hidden, as the card's AskedBy hides them
    return name ? t('det.helper', { name }) : t('det.helperAnon');
  };
  return (
    <>
      {/* Kit sections with their headers (a named region, its heading one level below the panel's). */}
      <SubSection title={t('det.running')}>
        {rows.length === 0 && !has(extra) && <p className={s.muted}>{t(`det.state.${quiet(snapshot.facts)}` as 'det.state.nothing')}</p>}
        {rows.length > 1 && <p className={s.muted}>{t('det.count', { n: rows.length })}</p>}
        {rows.length > 0 && (
          <ul className={s.list}>
            {rows.map((g) => (
              <li key={g.key} className={s.p}>
                <span translate="no">{line(g)}</span>
                {askedBy(g) && <> <span className={s.muted}>{askedBy(g)}</span></>}
                {g.decision === null && <> <span className={s.muted}>{t('det.kept')}</span></>}
                {onShowGate && <> <TextButton onPress={() => onShowGate(g)}>{t('det.show')}</TextButton></>}
              </li>
            ))}
          </ul>
        )}
        {extra}
      </SubSection>
      {m && (
        <SubSection title={t('det.where')}>
          <Facts
            columns={1}
            items={[
              { label: t('det.computer'), value: metaText(m.computer, 80) },
              { label: t('det.realm'), value: metaText(m.realm, 80) },
              ...(m.folder ? [{ label: t('det.folder'), value: metaText(m.folder, 200), mono: true }] : []),
              ...(m.agent ? [{ label: t('det.agent'), value: m.agentHref ? <Link href={m.agentHref}>{metaText(m.agent, 80)}</Link> : metaText(m.agent, 80) }] : []),
              ...(m.model ? [{ label: t('det.model'), value: metaText(m.model, 80) }] : []),
            ]}
          />
          <p className={s.muted}>{t('det.safety', { computer: metaText(m.computer, 80) })}</p>
        </SubSection>
      )}
    </>
  );
}

/** One file's row: what happened, the path, its size line; an edit's change (its replaced and new text, from the tool's own input)
 *  opens under it, as text, a key in it hidden (scrubSecrets before clean: cleaning can glue a key to the word before it). A write's content is never kept, so it has
 *  no change to show. */
function EditRow({ e }: { e: EditView }) {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  const lang = kitLang('', e.path);
  return (
    <li className={s.edit} data-edit-row>
      <div className={s.row}>
        <span className={s.verb}>{t(`det.verb.${e.verb}` as 'det.verb.edited')}</span>
        <span className={s.path} translate="no">{clean(scrubSecrets(e.path), 300).text}</span>
        {e.meta && <span className={s.meta}>{clean(e.meta, 40).text}</span>}
      </div>
      {(e.unsure || e.computer) && (
        <p className={s.muted}>
          {e.unsure && t('det.editUnsure')}
          {e.unsure && e.computer && ' '}
          {e.computer && t('det.editOn', { computer: clean(e.computer, 80).text })}
        </p>
      )}
      {(e.diff || e.open) && (
        <div className={s.editActions}>
          {e.diff && <TextButton onPress={() => setOpen((x) => !x)} aria-expanded={open}>{t(open ? 'det.editHide' : 'det.editShow')}</TextButton>}
          {e.open && <Link href={e.open} variant="nav">{t('det.editFiles')}</Link>}
        </div>
      )}
      {open && e.diff && (
        <div className={s.diff} data-edit-diff>
          <CodeBlock
            code={clean(scrubSecrets(e.diff.old), 0, { code: true }).text}
            label={t(e.diff.all ? 'det.editOldAll' : 'det.editOld')}
            lang={lang} // reason: an edit of a file with no known language shows as text
            wrap
          />
          <CodeBlock
            code={clean(scrubSecrets(e.diff.new), 0, { code: true }).text}
            label={t('det.editNew')}
            lang={lang} // reason: an edit of a file with no known language shows as text
            wrap
          />
          {e.cut && <p className={s.muted}>{t('det.editCut')}</p>}
        </div>
      )}
    </li>
  );
}

function Edits({ edits, more = 0 }: { edits: readonly EditView[]; more?: number }) {
  const t = useStrings(strings);
  return (
    <section className={s.section}>
      <p className={s.muted}>{t('det.editsNote')}</p>
      {edits.length === 0 ? <p className={s.p}>{t('det.editsNone')}</p> : (
        <ul className={s.list}>
          {edits.map((e) => <EditRow key={e.id} e={e} />)}
        </ul>
      )}
      {more > 0 && <p className={s.muted}>{t('det.editsMore', { n: more })}</p>}
    </section>
  );
}

export function DetailsPanel({ snapshot, onClose, activityExtra, session, usage, tab, onTab, onShowGate }: DetailsPanelProps) {
  const t = useStrings(strings);
  const [own, setOwn] = useState<DetailsTab>(readTab);
  const shown: { id: DetailsTab; content: ReactNode }[] = [
    { id: 'activity', content: <Activity snapshot={snapshot} extra={activityExtra} onShowGate={onShowGate} /> },
    { id: 'edits', content: <Edits edits={snapshot.edits ?? []} more={snapshot.editsMore} /> },
    ...(has(session) ? [{ id: 'session' as const, content: session }] : []),
    ...(has(usage) ? [{ id: 'usage' as const, content: usage }] : []),
  ];
  const wanted = tab ?? own;
  const open = shown.some((x) => x.id === wanted) ? wanted : 'activity';
  const pick = (v: DetailsTab) => { setOwn(v); writeTab(v); onTab?.(v); };
  return (
    <div className={s.root} data-details-panel>
      <div className={s.head}>
        <h2 className={s.title}>{t('det.title')}</h2>
        <IconButton icon="x" label={t('det.close')} onPress={onClose} />
      </div>
      <Tabs
        label={t('det.tabs')}
        className={s.tabs}
        panelClassName={s.panel}
        value={open}
        onChange={pick}
        items={shown.map((x) => ({ id: x.id, label: t(`det.tab.${x.id}` as 'det.tab.activity') }))}
      >
        {/* Under the panel's h2: a tab's kit section headings are h3. */}
        <div className={s.body}><HeadingBelow level={2}>{shown.find((x) => x.id === open)?.content}</HeadingBelow></div>
      </Tabs>
    </div>
  );
}
