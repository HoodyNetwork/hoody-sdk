// The one measuring descriptor of a StatusPill. Display.module.css .pill and .dot draw the pill;
// this measures it from its words, never the DOM (the Logs list sizes its Result track with it). Change the two
// together: pillMetrics.test.ts reads the CSS and fails when they differ.
import type { TextMetrics } from './DataTableLayout';

/** A StatusPill's type and box, as Display.module.css draws them: --fw-medium 500
 *  Geist Mono at --fs-tag 10.5 px, --tracking-tag 0.04em, capitals (--case-caps), --hx-tag-pad 7 px sides and a --bw
 *  1 px edge, border-box; with a dot, the 6 px .dot and its --gap-dot 6 px gap. Scripts without case (ar, th, ja, ko,
 *  zh) drop the capitals and the tracking: measuring them with both only over-sizes their track a little. */
export const STATUS_PILL = {
  family: '"Geist Mono", ui-monospace, monospace',
  size: 10.5,
  weight: 500,
  trackingEm: 0.04,
  caps: true,
  padX: 7,
  border: 1,
  dot: 6,
  gap: 6,
} as const;

/** What a StatusPill's words take, its box included (textWidth reads it). */
export function statusPillMetrics(dot = false): TextMetrics {
  const p = STATUS_PILL;
  return {
    font: `${p.weight} ${p.size}px ${p.family}`,
    glyph: 0.6 * p.size,
    tracking: p.trackingEm * p.size,
    caps: p.caps,
    pad: 2 * p.padX + 2 * p.border + (dot ? p.dot + p.gap : 0),
  };
}
