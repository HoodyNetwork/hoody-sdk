// Terminal: nothing to do here. The terminal SettingsPage brings the section an arrival anchor names into view itself
// (kit/layouts/Layouts.term.tsx), so this page's helper is a no-op that reads no DOM global.
import type * as Web from './landSection';

export const landOnSection: typeof Web.landOnSection = () => {};
