// Small shared pieces of the billing page: flat sections, money text, bands, a segmented choice, a flag.
export { say } from './Bits.pure';
export type { T } from './Bits.pure';
import { Band as KitBand, type BandTone, countryFlag, cx, type Tone } from '@kit';
import type { ReactNode } from 'react';
import { cents } from '../logic';
import s from './parts.module.css';

export function Money({ cents: c, className }: { cents: number | null | undefined; className?: string }) {
  return <span className={cx(s.money, className)}>{c === null || c === undefined ? '—' : cents(c)}</span>;
}

export interface SectionProps {
  id: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  titleRef?: (el: HTMLElement | null) => void;
  children: ReactNode;
}

/** A section of the main column, in the settings pages' section look (Account, AI models): the heading in the heading
 * grey and size, a description under it, a hairline below. The id is the in-page anchor and the title takes focus when
 * asked (the #plans hand-off). */
export function Section({ id, title, description, actions, titleRef, children }: SectionProps) {
  return (
    <section id={id} data-section={id} className={s.section} aria-labelledby={`billing-${id}-title`}>
      <header className={s.sectionHead}>
        <span className={s.sectionTitleRow}>
          <h2 id={`billing-${id}-title`} className={s.sectionTitle} ref={titleRef} tabIndex={-1}>
            {title}
          </h2>
          {actions && <span className={s.sectionActions}>{actions}</span>}
        </span>
        {description && <p className={s.sectionDesc}>{description}</p>}
      </header>
      {children}
    </section>
  );
}

export interface BandProps {
  tone: Tone;
  children: ReactNode;
  actions?: ReactNode;
  dataAttr?: string;
  /** The kit's Outcome kind this band shows, for the shot scan and tests. */
  outcome?: 'pending' | 'failed';
  /** The failed request behind the band (the kit Band offers its details); none when it explains no request. */
  error?: unknown;
}

/** A page band: the kit Band (it sets its own role); the wrapper only carries the markers the shot scan and tests read. */
export function Band({ tone, children, actions, dataAttr, outcome, error }: BandProps) {
  const kit: BandTone = tone === 'warn' ? 'warn' : tone === 'danger' ? 'danger' : 'neutral';
  return (
    <div data-band={dataAttr} data-outcome={outcome}>
      <KitBand tone={kit} icon={tone === 'ok' ? 'check-circle' : undefined} actions={actions} error={error}>
        {children}
      </KitBand>
    </div>
  );
}

/** A country flag (regional indicator letters); nothing for an unknown code. The country code rides the title and the accessible name. */
export function Flag({ code }: { code: string | null | undefined }) {
  const glyph = countryFlag(code);
  if (!glyph) return null;
  const up = String(code).toUpperCase();
  return (
    <span className={s.flag} role="img" aria-label={up} title={up}>
      {glyph}
    </span>
  );
}
