// PlanCard: one plan offered for sale, in a grid of equal-height cards. A group named by the plan (its name a kit
// Heading one level below the section around it) holding a chip, the price in the display price type (`--t-price`,
// which pages may not set), a lead line, label | value rows that read across a row of cards, a regions row, spec lines
// with the rest folded, a footnote, a note, and the action pinned at the bottom. It holds no commerce logic.
// A `wide` card takes a whole row of its PlanGrid, its rows side by side in the columns of the cards above it.
import { Children, useId, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { Disclosure } from '../controls/Disclosure';
import { SR_ONLY } from '../controls/SrOnly';
import { Icon } from '../icons';
import { Heading, useHeadingLevel } from '../layouts/anatomy/Heading';
import { CutFrame } from '../layouts/CutFrame';
import { ErrorState, Skeleton } from '../states/States';
import { useStrings } from '../strings';
import strings from './PlanCard.strings.en.json';
import s from './PlanCard.module.css';

/** One label | value row of a plan (Memory | 6 GB). */
export interface PlanCardRow {
  /** A stable key for the row (the fact's id). */
  id: string;
  label: ReactNode;
  value: ReactNode;
  /** This row is the card's price line (From | $70 a month): its label small before its value in the price type,
   *  in the price's place instead of among the rows. For a card with no `price` of its own; one row at most. */
  price?: boolean;
}

/** One region a plan can run in, drawn as a small outlined tag. */
export interface PlanCardRegion {
  /** A stable key for the region. */
  id: string;
  /** A flag glyph shown before the name; decoration only (the name says the region). */
  flag?: string;
  name: string;
  /** No room left there: the tag is greyed and its spoken text ends in "full". */
  full?: boolean;
}

/** The regions row: a label ("8 regions", "Region"), then the region tags, or a note alone ("No region selection"). */
export interface PlanCardRegions {
  label: ReactNode;
  items?: readonly PlanCardRegion[];
  note?: ReactNode;
}

export interface PlanCardProps {
  /** The plan's name; also the card's accessible name. */
  name: string;
  /** A short chip beside the name (the catalogue's type label). */
  chip?: ReactNode;
  /** One line under the name, above the price: what the offer is. */
  subTitle?: ReactNode;
  /** The price, already formatted ("$12"), and its period ("/month"). */
  price?: { amount: ReactNode; per?: ReactNode };
  /** One line under the price. */
  lead?: ReactNode;
  /** The plan's facts as label | value rows, one description list, values at the inline end. */
  rows?: readonly PlanCardRow[];
  /** Where the plan runs, under the rows and visible without a press. A row's value that needs an explanation takes an
   *  InfoTip (keyboard and touch reachable). */
  regions?: PlanCardRegions;
  /** The spec lines shown on the card, each with a check mark. */
  specs?: readonly ReactNode[];
  /** Further spec lines, folded under "Show all {count} details" (count = every line). */
  more?: readonly ReactNode[];
  /** Under the specs: a retention note (a kit Band the page passes). */
  footnote?: ReactNode;
  /** Marks beside the name ("Yours", "Next step up"). */
  marks?: ReactNode;
  /** The card's one action, pinned at the bottom. Not shown while loading or in the error state (the error offers Try again). */
  action?: ReactNode;
  /** A line above the action (text). With state="error" it is the error's body under the kit's error title. */
  note?: ReactNode;
  /** With state="error": the kit's ErrorState (size sm) offers Try again and
   *  calls this. Without it the error shows no retry control. Pages never pass an ErrorState themselves. */
  onRetry?: () => void;
  /** With state="error" and onRetry: the retry is running. */
  retrying?: boolean;
  /** accent: the one card the page points at (a line in the plan frame colour, `--hx-plan-frame`, no tint); current: a
   *  plan the person has (the selected fill). */
  tone?: 'default' | 'accent' | 'current';
  /** The plan fills of a pricing grid, each with the plan edge (`--hx-plan-edge`): calm (the entry plans), plan (the
   *  middle one), lift (the top one). Without it the card keeps the kit card body and the panel line. */
  fill?: 'calm' | 'plan' | 'lift';
  /** A whole row of a PlanGrid (the grid's last child, with the grid's `wide`): the label | value rows sit side by
   *  side, one column of them under each column of cards, and read as one list where the grid is one column. */
  wide?: boolean;
  /** loading: skeleton lines in the price, lead and spec places, at the card's ready height. */
  state?: 'ready' | 'loading' | 'error';
  className?: string;
}

/** One plan offered for sale: name, price, facts, specs and its one action, in a grid of equal-height cards. */
export function PlanCard({
  name,
  chip,
  subTitle,
  price,
  lead,
  rows = [],
  regions,
  specs = [],
  more = [],
  footnote,
  marks,
  action,
  note,
  onRetry,
  retrying,
  tone = 'default',
  fill,
  wide,
  state = 'ready',
  className,
}: PlanCardProps) {
  const t = useStrings(strings);
  const regionsId = useId();
  // The name is a Heading one below its context; the fold's heading is one below the name (clamped to h6).
  const foldLevel = Math.min(6, useHeadingLevel() + 2) as 2 | 3 | 4 | 5 | 6;
  const loading = state === 'loading';
  const error = state === 'error';
  // A row marked as the price is the price line of a card with no price of its own, never a row of the list.
  const priceRow = price ? undefined : rows.find((r) => r.price);
  const listed = rows.filter((r) => !r.price);
  const hasBody = !!(lead || listed.length || regions || specs.length || more.length || footnote || note || action);
  const line = (spec: ReactNode, i: number) => (
    <li key={i} className={s.spec}>
      <Icon name="check" size="sm" className={s.check} />
      <span dir="auto">{spec}</span>
    </li>
  );
  return (
    <CutFrame
      role="group"
      aria-label={name}
      aria-busy={loading || undefined}
      data-kit="plan-card"
      data-tone={tone}
      // The plan the person has is announced as theirs, not only drawn differently.
      aria-current={tone === 'current' ? 'true' : undefined}
      data-fill={fill}
      data-state={state}
      data-wide={wide || undefined}
      className={[s.card, wide && s.wide, className].filter(Boolean).join(' ')}
      innerClassName={s.inner}
    >
      <div className={s.head} data-plan-part="head">
        <div className={s.name} dir="auto">
          <Heading>{name}</Heading>
        </div>
        {chip && <span className={s.chip}>{chip}</span>}
      </div>
      {/* Its own line under the name on every card, one pill high when empty, so the prices of a row line up. */}
      <span className={s.marks} data-plan-part="marks">
        {subTitle && (
          <span className={s.subTitle} dir="auto">
            {subTitle}
          </span>
        )}
        {marks}
      </span>
      {loading ? (
        <div className={s.skeleton}>
          <Skeleton variant="text" rows={5} immediate />
        </div>
      ) : error ? (
        <ErrorState size="sm" body={note} onRetry={onRetry} retrying={retrying} className={s.error} />
      ) : (
        <>
          {price && (
            <p className={s.price} dir="auto" data-plan-part="price-line">
              <span className={s.amount} data-plan-part="price">
                {price.amount}
              </span>
              {price.per && <span className={s.per}>{price.per}</span>}
            </p>
          )}
          {priceRow && (
            <p className={s.price} dir="auto" data-plan-part="price-line" data-plan-row={priceRow.id}>
              <span className={s.per}>{priceRow.label}</span>
              <span className={s.amount} data-plan-part="price">
                {priceRow.value}
              </span>
            </p>
          )}
          {hasBody && (
            <div className={s.body} data-plan-part="body">
              {lead && (
                <p className={s.lead} dir="auto">
                  {lead}
                </p>
              )}
              {listed.length > 0 && (
                <dl className={s.rows}>
                  {listed.map((r) => (
                    <div key={r.id} className={s.row} data-plan-row={r.id}>
                      <dt className={s.rowLabel} dir="auto">
                        {r.label}
                      </dt>
                      <dd className={s.rowValue} dir="auto">
                        {r.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {regions && (
                <div className={s.regions} data-plan-part="regions">
                  <span id={regionsId} className={s.regionsLabel} dir="auto">
                    {regions.label}
                  </span>
                  {regions.items && regions.items.length > 0 && (
                    <ul className={s.regionTags} aria-labelledby={regionsId}>
                      {regions.items.map((r) => (
                        <li key={r.id} className={s.region} data-full={r.full || undefined} dir="auto">
                          {r.flag && <span aria-hidden="true">{r.flag}</span>}
                          <span>{r.name}</span>
                          {r.full && <span className={SR_ONLY}>{t('planCard.fullSuffix')}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {regions.note && (
                    <span className={s.regionsNote} dir="auto">
                      {regions.note}
                    </span>
                  )}
                </div>
              )}
              {specs.length > 0 && <ul className={s.specs}>{specs.map(line)}</ul>}
              {more.length > 0 && (
                <Disclosure
                  title={t('planCard.more', {
                    count: specs.length + more.length,
                  })}
                  level={foldLevel}
                  className={s.more}
                >
                  <ul className={s.specs}>{more.map(line)}</ul>
                </Disclosure>
              )}
              {footnote && (
                <div className={s.footnote} dir="auto">
                  {footnote}
                </div>
              )}
              {note && (
                <div className={s.note} dir="auto" data-plan-part="note">
                  {note}
                </div>
              )}
              {action && (
                <div className={s.action} data-plan-part="action">
                  {action}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </CutFrame>
  );
}

export interface PlanGridProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style'> {
  /** The PlanCards (and at most a loading, error or empty state in a card's place). */
  children: ReactNode;
  /** The last child is a `wide` PlanCard: it takes a whole row under the others, and the others spread over no more
   *  columns than there are of them, so the wide card ends where their row ends. */
  wide?: boolean;
  /** Fixed columns: 3 on thirds (two under 600 px of content, a last odd card on the whole row), 2 on halves; one
   *  column under 480 px. Without it: equal columns at least 260 px wide, as many as fit. */
  columns?: 2 | 3;
}

/**
 * The grid PlanCards sit in. Each card spans four rows of it and hands them to its parts (head, marks, price, body), so
 * every part lines up across the cards of one row: a card with two marks or a two-line name moves its neighbours' prices
 * with its own. Columns: equal ones at least 260 px wide (one column on a phone), or a fixed 2 or 3 (`columns`).
 * With `wide` the last card takes a row of its own under the others.
 */
export function PlanGrid({ children, columns, wide, className, ...rest }: PlanGridProps) {
  // The cards beside the wide one: the most columns the grid draws (a custom property, read by the grid's columns).
  const cards = wide ? Math.max(1, Children.toArray(children).length - 1) : 0;
  return (
    <div
      {...rest}
      data-kit="plan-grid"
      data-cols={columns === 3 ? 'three' : columns === 2 ? 'two' : undefined}
      data-wide={wide || undefined}
      className={className ? `${s.grid} ${className}` : s.grid}
      style={wide ? ({ ['--plan-cards' as string]: cards } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
