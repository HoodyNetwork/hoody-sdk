// Cards or List: one remembered choice shared by every list of a group (Computers, Servers and
// Projects share 'machines'), kept on this device under the table-preference prefix, so sign-out clears it with the
// rest. Table vs list stays automatic inside "List" (the table's width decides). A page may offer other choices
// (Files: List / Icons) by naming them: `allowed` for the remembered value, `items` for the switch.
// The choice itself (the remembered value, the toolbar fit, the default items) is in Presentation.pure.ts, shared with
// the terminal's switch (Presentation.term.tsx); this file draws the web switch.
import { useContext } from 'react';
import { SegmentedControl } from '../controls/SegmentedControl';
import { useContainerNarrow } from '../media';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { NARROW_TOOLBAR_BELOW } from './DataTableLayout';
import { PresentationFitContext, useCardsOrList, type Presentation, type PresentationItem } from './Presentation.pure';
import s from './Presentation.module.css';

export { usePresentation, PresentationFitContext, useCardsOrList } from './Presentation.pure';
export type { Presentation, PresentationItem, PresentationFit } from './Presentation.pure';

/** The Cards / List switch (or the page's own `items`). In a DataTable, pass `presentChoice` and the table draws it
 *  inside its own fit (words, icons, or the view menu). Placed anywhere else, `toolbarEnd` included, it gets no toolbar
 *  fit: it shows icons alone while the page region is narrow, and never moves into a menu. */
export function PresentationSwitch({ value, onChange, items }: { value: Presentation; onChange: (p: Presentation) => void; items?: readonly PresentationItem[] }) {
  const t = useStrings(kitStrings);
  const fit = useContext(PresentationFitContext);
  const cardsOrList = useCardsOrList();
  const narrowPage = useContainerNarrow(NARROW_TOOLBAR_BELOW);
  const iconsOnly = fit === null ? narrowPage : fit === 'icons';
  return (
    <SegmentedControl<Presentation>
      className={iconsOnly ? s.iconOnly : undefined}
      label={t('table.present')}
      variant="folder"
      value={value}
      onChange={onChange}
      items={items ?? cardsOrList}
    />
  );
}
