// Terminal SettingRow: inside a SettingGroup it is the group's row; outside one it is the same row unframed (a reveal
// row outside a group is a one-row group, as on the web). One row shape (the web's legacy two-column row and the group row draw the same here: label + help | value |
// actions, stacked when narrow). `wide` has nothing to widen in a terminal row and `htmlFor` names no native input.
import type * as Web from './SettingRow';
import { GroupRow, SettingGroup, useSettingGroup } from './SettingGroup';

export type { SettingRowProps } from './SettingRow';

export const SettingRow: typeof Web.SettingRow = (props) => {
  const group = useSettingGroup();
  const { wide: _wide, className: _className, ...row } = props;
  // A legacy row (no group, no reveal) is unframed, as on the web; a reveal row needs a group around its editor.
  if (group || !props.reveal) return <GroupRow {...row} />;
  return <SettingGroup><GroupRow {...row} /></SettingGroup>;
};
