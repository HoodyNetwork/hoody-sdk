// The kit "At a glance": a page's first section,
// a few facts read from the reads the page already makes. The kit owns the title and the words for a fact that is not
// read yet ("Reading…"), not read whole ("Can't tell", never a guess) or read only in part ("At least …"), so no page
// keeps its own copy. A fact with a limit takes `meter`: its words, then the Meter (the Backups and Network glances).
import type { ReactNode } from 'react';
import { Facts, type Fact } from '../../data/Display';
import { InfoTip } from '../../overlays/InfoTip';
import { Meter } from '../../widgets/Widgets';
import { useStrings } from '../../strings';
import { AnatomySection } from './Section';
import type { SectionActions } from './types';
import strings from './strings.en.json';
import s from './anatomy.module.css';

/** 'reading': nothing read yet; 'unknown': not read whole, so the fact cannot be told. */
export type GlanceRead = 'reading' | 'unknown';

/** A Fact without `wide`: a glance holds short facts, all in its one named list. */
export interface GlanceFact extends Omit<Fact, 'wide'> {
  /** Never: every glance fact stays in the one named list (dropped at run time too, for an untyped caller). */
  wide?: never;
  /** Stands in for the value, which is then not shown. */
  read?: GlanceRead;
  /** The value is a floor (a list not read whole): "At least <value>". A text value only. */
  atLeast?: boolean;
  /** A limit's use, in percent, after the words (only once read): `label` names it whole ("3 of 10 backups kept"). */
  meter?: { value: number; label: string };
  /** One sentence explaining the fact: the value's words become an InfoTip (at most 200 characters). Not shown while the
   *  fact is unread, so it can never tell what the value would. */
  tip?: string;
}

export interface GlanceProps {
  /** The section's anchor, as AnatomySection's. */
  id: string;
  items: readonly GlanceFact[];
  /** As Facts: 2 (the default) or 3 on a wide container, one below 560 px. */
  columns?: 2 | 3;
  /** Sets every fact (the read the whole glance comes from), over each fact's own. */
  read?: GlanceRead;
  actions?: SectionActions;
  /** Notice roots only (Band, OutcomeBanner, Outcome). */
  notices?: ReactNode;
}

export function Glance({ id, items, columns = 2, read, actions, notices }: GlanceProps) {
  const t = useStrings(strings);
  const title = t('glance.title');
  const facts: Fact[] = items.map(({ read: own, atLeast, meter, tip, ...f }) => {
    const r = read ?? own;
    // A fact not read shows only the kit's words: no tip, meter, id, link, address or copy that could tell the value.
    if (r) return { label: f.label, value: r === 'reading' ? t('glance.reading') : t('glance.cantTell') };
    let words: ReactNode = f.value;
    if (atLeast && (typeof words === 'string' || typeof words === 'number')) words = t('glance.atLeast', { value: String(words) });
    if (tip) words = <InfoTip text={tip} subject={f.label}>{words}</InfoTip>;
    // The meter sits beside the words, never inside the tip's button, so it keeps its own role and value.
    const value = meter ? (
      <span className={s.glanceMeter}>
        {words}
        <Meter value={meter.value} label={meter.label} />
      </span>
    ) : (
      words
    );
    return { ...f, wide: false, value };
  });
  return (
    <AnatomySection id={id} title={title} state={{ kind: 'ready' }} actions={actions} notices={notices}>
      <Facts items={facts} columns={columns} label={title} />
    </AnatomySection>
  );
}
