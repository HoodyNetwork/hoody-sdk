// The pure part of SettingGroup (when a group stacks, a row's `data-*` attributes): shared by the web group and its
// terminal sibling.

/** The label track's least width before the group stacks. */
export const SETTING_LABEL_FLOOR = 200;

/** Whether a group of this content width leaves its label track under the floor (exported for tests). */
export function labelTrackShort(m: { content: number; padStart: number; padEnd: number; value: number; action: number; gap: number }): boolean {
  return m.content - m.padStart - m.padEnd - m.value - m.action - 2 * m.gap < SETTING_LABEL_FLOOR;
}

/** Whether a field group's crowding actions go under their fields: the label track is short with every row's cluster
 *  (`action`) and fits with only the clusters that cannot move (`kept`: switch and no-value rows). */
export function actionsGoUnder(m: { content: number; padStart: number; padEnd: number; value: number; gap: number; action: number; kept: number }): boolean {
  return labelTrackShort(m) && !labelTrackShort({ ...m, action: m.kept });
}

/** Whether a stacked field row's actions would leave its field under the floor (exported for tests). */
export function fieldTrackShort(m: { content: number; padStart: number; padEnd: number; action: number; gap: number }): boolean {
  return m.action > 0 && m.content - m.padStart - m.padEnd - m.action - m.gap < SETTING_LABEL_FLOOR;
}

/** The `data-*` attributes among a row's props, for its row element. */
export function dataAttrs(props: object): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(props)) if (k.startsWith('data-')) out[k] = v as string | undefined;
  return out;
}

/** The width under which a field group stacks whatever its label has (SettingGroup.module.css). */
export const FIELD_STACK_BELOW = 640;

/** Whether a field group of this width stacks on the 640 px line, judged on the width before a fold's inset (exported for tests). */
export function fieldLineShort(m: { width: number; fold: number }): boolean {
  return m.width + m.fold < FIELD_STACK_BELOW;
}
