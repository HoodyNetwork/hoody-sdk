// Chat apps, Settings: the draft rules and the refusal words (split out of ChatSettings.tsx so the terminal build shares
// them; ChatSettings.tsx re-exports the public names). key, has and Key are for ChatSettings.tsx.
import { useStrings, type OutcomeLike, type StringKey } from '@kit';
import strings from '../strings.en.json';

export type Key = StringKey<typeof strings>;
// A key built from a setting's name or a note's code: only keys present in the table are looked up.
export const key = (k: string): Key => k as Key;
export const has = (k: string): boolean => k in strings;

/**
 * A draft: the changes chosen so far ({name: value | null}), the settings whose typed value is refused, the text typed into each
 * text field and which refused fields already show their error. The text and the error live here, not in the form, so they
 * outlive it: a section switch never leaves a refusal the person cannot see.
 */
export interface SettingsDraft {
  edits: Readonly<Record<string, unknown>>;
  bad: readonly string[];
  raw: Readonly<Record<string, string>>;
  shown: readonly string[];
}
export const emptyDraft: SettingsDraft = { edits: {}, bad: [], raw: {}, shown: [] };
/** Something to save or to discard: a chosen change, or a typed value still refused. */
export const draftDirty = (d: SettingsDraft): boolean => Object.keys(d.edits).length > 0 || d.bad.length > 0;
/** Something Save can send: the accepted changes only. */
export const draftSendable = (d: SettingsDraft): boolean => Object.keys(d.edits).length > 0;
/** What stays after a save: the refused fields, with their text and error, for the person to fix or discard. */
export const draftAfterSave = (d: SettingsDraft): SettingsDraft => ({
  edits: {},
  bad: d.bad,
  raw: Object.fromEntries(Object.entries(d.raw).filter(([n]) => d.bad.includes(n))),
  shown: d.shown.filter((n) => d.bad.includes(n)),
});

/** The agent's refusal of a setting as a line the person can act on: which setting and why. Undefined when it names none we know. */
export function useRefusal() {
  const t = useStrings(strings);
  return (details: Readonly<Record<string, unknown>> | undefined): string | undefined => {
    const reason = typeof details?.reason === 'string' ? details.reason : '';
    const field = typeof details?.field === 'string' ? details.field : '';
    if (!has(`set.reason.${reason}`)) return undefined;
    const why = t(key(`set.reason.${reason}`));
    return has(`set.n.${field}`) ? `${t(key(`set.n.${field}`))}: ${why}` : why;
  };
}

/** A change's outcome for a dialog, with the agent's refusal spelled out when it gave one. */
export function withRefusal(o: OutcomeLike | undefined, line: string | undefined): OutcomeLike | undefined {
  return o && o.kind === 'failed' && line ? { ...o, message: line } : o;
}
