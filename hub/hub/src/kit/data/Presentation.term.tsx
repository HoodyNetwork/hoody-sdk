// PresentationSwitch in the terminal: the same Cards / List choice (or the page's own items) as a SegmentedControl,
// with the shared choice from Presentation.pure.ts. In a DataTable the table draws the choice itself (`presentChoice`,
// DataTable.term.tsx); placed anywhere else it asks for icons alone while the page region is narrow, as the web.
import { useContext } from 'react';
import type * as Web from './Presentation';
import { SegmentedControl } from '../controls/SegmentedControl';
import { useContainerNarrow } from '../media';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { NARROW_TOOLBAR_BELOW } from './DataTableLayout';
import { PresentationFitContext, useCardsOrList, type Presentation } from './Presentation.pure';

export { usePresentation, PresentationFitContext, useCardsOrList } from './Presentation.pure';
export type { Presentation, PresentationItem, PresentationFit } from './Presentation.pure';

export const PresentationSwitch: typeof Web.PresentationSwitch = ({ value, onChange, items }) => {
  const t = useStrings(kitStrings);
  const fit = useContext(PresentationFitContext);
  const cardsOrList = useCardsOrList();
  const narrowPage = useContainerNarrow(NARROW_TOOLBAR_BELOW);
  const iconsOnly = fit === null ? narrowPage : fit === 'icons';
  return (
    <SegmentedControl<Presentation>
      iconOnly={iconsOnly}
      label={t('table.present')}
      variant="folder"
      value={value}
      onChange={onChange}
      items={items ?? cardsOrList}
    />
  );
};
