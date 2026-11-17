/**
 * WCAG 2.5.3 Label in Name: a control whose visible words are not its purpose (a picker showing "atlas", a switcher
 * showing the realm) is named by those words first, then by what it is for: "atlas, Computer". The purpose is read,
 * never drawn: `labelId` names a visible label (a field's), else the control names itself with `label` through its
 * own id. The shown words must stay in the text tools read, with spaces between parts (a flex box draws none).
 */
export interface LabelInName {
  /** The element holding the words the control shows. */
  shownId: string;
  /** The control's own id (set it on the control). */
  selfId: string;
  /** What the control is for ("Computer"), read after the shown words. */
  label: string;
  /** A visible label that says what it is for (a PickerField's): read in place of `label`. */
  labelId?: string;
}

/** The naming props for a control: spread on it, with `id={selfId}`. */
export function labelInNameProps({ shownId, selfId, label, labelId }: LabelInName): { 'aria-label': string | undefined; 'aria-labelledby': string } {
  return { 'aria-label': labelId ? undefined : label, 'aria-labelledby': `${shownId} ${labelId ?? selfId}` };
}
