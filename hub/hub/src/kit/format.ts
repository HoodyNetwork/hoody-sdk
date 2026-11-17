// Numbers and dates through Intl in the UI locale (en for now). Money is never formatted here:
// core/commerce owns money rules and its own formatting.
import { LOCALE } from './strings';

const numberFmt = new Intl.NumberFormat(LOCALE);
const compactFmt = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const relFmt = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const pctSmall = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const pctLarge = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

export function formatNumber(n: number): string {
  return numberFmt.format(n);
}

export function formatCompact(n: number): string {
  return compactFmt.format(n);
}

/** A percentage, without the % (the caller's string adds it): one decimal under 10, whole numbers from 10, "<0.1"
 * for a reading above 0 that would round to 0, 0 for a negative one, "—" when it is not a finite number. */
export function formatPercent(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const x = Math.max(0, v);
  if (x > 0 && x < 0.05) return `<${pctSmall.format(0.1)}`;
  return x < 10 ? pctSmall.format(x) : pctLarge.format(x);
}

/**
 * The storage unit policy: how many of one unit make the next (bytes → KB → MB → GB → TB → PB) for every storage
 * size the Hub shows, from GB or from bytes. Binary for now; a decimal choice is this one number (1000). No page
 * steps or converts sizes itself: it uses formatStorage, formatBytes and bytesToGb.
 */
const STORAGE_STEP = 1024;
const STORAGE_UNITS = ['GB', 'TB', 'PB'] as const;
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** The storage formatters for one step (the exported ones use STORAGE_STEP; tests read the other policy through this). */
export function storageFormatters(step: number, locale: string = LOCALE) {
  /** Bytes as GB under this policy (for a page that reads sizes in bytes and shows them with formatStorage). */
  const bytesToGb = (bytes: number): number => bytes / step ** 3;
  const formatBytes = (bytes: number): string => {
    let v = bytes;
    let i = 0;
    while (v >= step && i < BYTE_UNITS.length - 1) {
      v /= step;
      i++;
    }
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 }).format(v)} ${BYTE_UNITS[i]}`;
  };
  /**
   * A disk or memory size given in GB, in steps of the policy: under one step in GB (at most one decimal), then TB
   * and PB (at most two decimals). Trailing zeros drop ("1 TB", "1.5 TB", never "1.0 TB"); a size that rounds up to a
   * whole step reads in the next unit. Numbers follow the locale (the UI's unless one is given). Not a finite size of
   * 0 or more: "—".
   */
  const formatStorage = (gb: number, opts: { locale?: string } = {}): string => {
    if (!Number.isFinite(gb) || gb < 0) return '—';
    const loc = opts.locale ?? locale;
    let v = gb;
    let i = 0;
    for (;;) {
      const digits = i === 0 ? 1 : 2;
      const rounded = Math.round(v * 10 ** digits) / 10 ** digits;
      if (rounded >= step && i < STORAGE_UNITS.length - 1) {
        v /= step;
        i++;
        continue;
      }
      return `${new Intl.NumberFormat(loc, { maximumFractionDigits: digits }).format(rounded)} ${STORAGE_UNITS[i]}`;
    }
  };
  return { bytesToGb, formatBytes, formatStorage };
}

export const { bytesToGb, formatBytes, formatStorage } = storageFormatters(STORAGE_STEP);

function toDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d);
}

export function formatDate(d: Date | string | number): string {
  return dateFmt.format(toDate(d));
}

export function formatDateTime(d: Date | string | number): string {
  return dateTimeFmt.format(toDate(d));
}

/** "3 minutes ago", "in 2 days", "yesterday". */
export function formatRelative(d: Date | string | number, now: number = Date.now()): string {
  const diff = (toDate(d).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return relFmt.format(Math.round(diff), 'second');
  if (abs < 2700) return relFmt.format(Math.round(diff / 60), 'minute');
  if (abs < 79200) return relFmt.format(Math.round(diff / 3600), 'hour');
  if (abs < 2592000) return relFmt.format(Math.round(diff / 86400), 'day');
  if (abs < 31536000) return relFmt.format(Math.round(diff / 2592000), 'month');
  return relFmt.format(Math.round(diff / 31536000), 'year');
}

/** The flag of an ISO 3166 alpha-2 country code; '' for anything else. Web: the emoji ("SG" → 🇸🇬); terminal: the
 *  upper-case code ("SG"), see countryFlag.ts / countryFlag.term.ts. */
export { countryFlag } from './countryFlag';
