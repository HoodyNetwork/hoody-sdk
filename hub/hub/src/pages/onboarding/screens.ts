// The page's one screen, read by the manifest and the view (a view never imports page.ts).
import type { PageScreen } from '@kit';

export const SCREENS = [{ id: 'tour', path: '' }] as const satisfies readonly PageScreen[];
