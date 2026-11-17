// The page's screens: one list, read by the manifest (page.ts) and the view (a view never imports page.ts).
// `:name` is a VM's name; the view checks it is one before it asks the computer anything.
import type { PageScreen } from '@kit';

export const SCREENS = [
  { id: 'list', path: '' },
  { id: 'item', path: ':name' },
] as const satisfies readonly PageScreen[];
