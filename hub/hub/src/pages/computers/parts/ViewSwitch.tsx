// The Computers | Servers | Projects switch: three routes of one page, drawn as the kit's view tabs under the header's
// subtitle (the layouts' `views`), like every other tabbed page.
import { type PageViews, useStrings } from '@kit';
import strings from '../strings.en.json';

export type View = 'computers' | 'servers' | 'projects';

export function useViewSwitch(view: View, onChange: (v: View) => void): PageViews<View> {
  const t = useStrings(strings);
  return {
    label: t('views.label'),
    items: [
      { id: 'computers', label: t('views.computers') },
      { id: 'servers', label: t('views.servers') },
      { id: 'projects', label: t('views.projects') },
    ],
    value: view,
    onChange,
  };
}
