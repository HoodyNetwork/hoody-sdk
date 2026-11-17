// The rules and state of ScheduleField (web and terminal): the kinds, the fields a preset holds, the expression a kind
// makes, and the hook that reads the value and takes the edits. No DOM and no styles: ScheduleField.tsx draws the web
// field, ScheduleField.term.tsx the terminal one.
import { type Ref, useEffect, useState } from 'react';
import { nextRuns, recognise, toExpr, type Preset } from '../cron';
import { useStrings } from '../strings';
import { type Option, normalizeTime } from './more.pure';
import strings from './ScheduleField.strings.en.json';

export type Kind = 'off' | Exclude<Preset['k'], 'reboot'>;
const KINDS: readonly Kind[] = ['off', 'every', 'hourly', 'daily', 'weekdays', 'weekly', 'monthly', 'custom'];
export const DAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const pad = (n: number): string => String(n).padStart(2, '0');
/** The expression as the preview reads it: trimmed, single spaces. */
const folded = (v: string): string => v.trim().replace(/\s+/g, ' ');
/** A run time in UTC, "YYYY-MM-DD HH:MM". */
const utcText = (at: number): string => new Date(at).toISOString().slice(0, 16).replace('T', ' ');

export interface Fields {
  every: number;
  minute: number;
  hour: number;
  days: number[];
  dom: number;
}

function fieldsOf(p: Preset): Fields {
  const f: Fields = { every: 15, minute: 0, hour: 8, days: [1], dom: 1 };
  if (p.k === 'every') f.every = p.n;
  if (p.k === 'hourly') f.minute = p.m;
  if (p.k === 'daily' || p.k === 'weekdays' || p.k === 'weekly' || p.k === 'monthly') {
    f.hour = p.h;
    f.minute = p.m;
  }
  if (p.k === 'weekly') f.days = p.days;
  if (p.k === 'monthly') f.dom = p.d;
  return f;
}

/** The expression of a kind with these fields, or null when a field is out of range (no day chosen). */
function exprOf(kind: Exclude<Kind, 'off' | 'custom'>, f: Fields): string | null {
  switch (kind) {
    case 'every':
      return toExpr('exec', { k: 'every', n: f.every });
    case 'hourly':
      return toExpr('exec', { k: 'hourly', m: f.minute });
    case 'daily':
      return toExpr('exec', { k: 'daily', h: f.hour, m: f.minute });
    case 'weekdays':
      return toExpr('exec', { k: 'weekdays', h: f.hour, m: f.minute });
    case 'weekly':
      return toExpr('exec', { k: 'weekly', h: f.hour, m: f.minute, days: f.days });
    case 'monthly':
      return toExpr('exec', { k: 'monthly', d: f.dom, h: f.hour, m: f.minute });
  }
}

export interface ScheduleFieldProps {
  /** The field's name: the whole group's and the kind select's (unless `aria-labelledby` names the group). */
  label: string;
  /** The id of a visible name for the whole group (a SettingRow's name). */
  'aria-labelledby'?: string;
  /** The id of text about the whole group (a SettingRow's help). */
  'aria-describedby'?: string;
  /** The expression as the draft holds it, or null for never. */
  value: string | null;
  onChange: (v: string | null) => void;
  isDisabled?: boolean;
  /** The checked value's error: on the expression box for a custom schedule, else on the kind select. */
  errorMessage?: string;
  /** Now, for the preview (a prop, so tests fix it). */
  now?: number;
  /** The kind select's trigger, so a page can move focus to it. */
  kindRef?: Ref<HTMLButtonElement>;
  /** Whether what the fields show is what the value holds: false while the time box holds text that is not a time (the
   *  value still holds the last good one), so the caller must not review or save it. */
  onValid?: (ok: boolean) => void;
}

/** What the field shows and the edits it takes, from its props. */
export function useScheduleField({ value, onChange, now = Date.now(), onValid }: Pick<ScheduleFieldProps, 'value' | 'onChange' | 'now' | 'onValid'>) {
  const t = useStrings(strings);
  // Read exactly as saved: a preset only when the value is that very text, so a saved expression is never rewritten
  // ("0  8 * * *" stays custom). Spaces are folded only for the preview.
  const expr = value === null ? '' : folded(value);
  const read = recognise('exec', value ?? '');
  // Custom stays custom once picked, even while its text happens to spell a preset; a preset read from the value otherwise.
  const [custom, setCustom] = useState(false);
  // Custom picked from Never shows its empty box even though an empty expression leaves no draft (value null).
  const kind: Kind = custom ? 'custom' : value === null ? 'off' : read.k === 'custom' || read.k === 'reboot' ? 'custom' : read.k;
  const fields = fieldsOf(read);
  const shownTime = `${pad(fields.hour)}:${pad(fields.minute)}`;
  const [timeText, setTimeText] = useState(shownTime);
  // The value changed from outside this field (another kind, a reset draft): the time box follows it. A time being typed
  // changes the value only once it reads as a time, and then it already matches.
  const [seen, setSeen] = useState(expr);
  if (seen !== expr) {
    setSeen(expr);
    if (normalizeTime(timeText) !== shownTime) setTimeText(shownTime);
  }
  const timeBad = !TIME.test(normalizeTime(timeText));
  const set = (k: Exclude<Kind, 'off' | 'custom'>, patch: Partial<Fields>) => {
    const e = exprOf(k, { ...fields, ...patch });
    if (e !== null) onChange(e);
  };
  const pick = (k: Kind) => {
    setCustom(k === 'custom');
    if (k === 'off') onChange(null);
    else if (k === 'custom') onChange(value ?? '');
    else set(k, {});
  };
  const onTime = (v: string) => {
    setTimeText(v);
    const m = TIME.exec(normalizeTime(v));
    if (m && kind !== 'off' && kind !== 'custom' && kind !== 'every' && kind !== 'hourly') set(kind, { hour: Number(m[1]), minute: Number(m[2]) });
  };
  const needsTime = kind === 'daily' || kind === 'weekdays' || kind === 'weekly' || kind === 'monthly';
  const valid = !(needsTime && timeBad);
  useEffect(() => {
    onValid?.(valid);
  }, [valid, onValid]);
  // Gone (another field kind, a fresh draft): nothing of it blocks the review any more.
  useEffect(() => () => onValid?.(true), [onValid]);
  const options: Option<Kind>[] = KINDS.map((k) => ({ value: k, label: t(`k.${k}`) }));
  const pv = expr ? nextRuns(expr, now, 0, 3) : null;
  const preview = pv === null ? null : pv.ok ? (pv.never ? t('never') : t('next', { runs: pv.runs.map(utcText).join(' · ') })) : pv.field === null ? t('noCalc') : t('fieldErr', { field: t(`f.${pv.field}`), min: pv.min, max: pv.max });

  return { t, kind, fields, timeText, timeBad, needsTime, options, preview, set, pick, onTime };
}
