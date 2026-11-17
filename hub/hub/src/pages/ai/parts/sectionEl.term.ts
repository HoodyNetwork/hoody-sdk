// sectionEl in the terminal: no DOM element names a section. The SettingsPage follows `?section=` itself (it scrolls the
// section into view and lights its frame), and scrollSettingsSection is a no-op here, so the lookup answers null without
// reading `document` or `CSS`.
import type * as Web from './sectionEl';

export const sectionEl: typeof Web.sectionEl = () => null;
