// Public hrefs of the Files page, its Mount on your device entry, its Storage tab and its folder read (the AI composer's "@"
// picker) (the computer page shows the same
// tab): the only file other pages may import from this folder. One exception, fixture data only:
// the computers page's fixtures take storageRules from ./storage for that tab's fixture answers.
// A computer is addressed by its handle (name.last4), never by its full id. The hrefs live in ./hrefs (pure, kit-graph safe).
export { links } from './hrefs';

export { MountButton } from './Mount';
export { StorageTab } from './storage';
/** A computer's shared folders, for the computer page's Storage tab, shown there only while sharesUiOn(). */
export { SharesSection } from './shares/SharesSection';
export { sharesUiOn } from './shares/flag';
/** The Storage tab's words, for the computer page's tests of that tab. */
export { default as storageStrings } from './storage/strings.en.json';
export type { StorageComputer } from './storage/StorageTab';
/** One folder of one computer, read while enabled: the AI composer's "@" picker reads the chat's folder with it. */
export { useFolder } from './data';
/** The folder read's own path guard: the picker asks it before a read of its own. */
export { blockedPath } from './logic';
export type { FilesComputer } from './data';
export type { Entry as FolderEntry } from './logic';

// ── The AI composer's "From a computer…" source: the realm's computers and one file's bytes, both read-only ──────────
/** The shown realm's computers as the folder read takes them. */
export { useFilesComputers } from './data';
/** One file's bytes on one computer, and the most one read answers (kit-graph safe: ./readBytes). */
export { FILE_READ_MAX, readFileBytes } from './readBytes';

// ── The kit FileChooser on the Files reads: any page's "choose a file on a computer" ─────────────────────────────────
/** The chooser's host (computers of the shown realm, one folder at a time, preview, search) and its path helpers. */
export { useFileChooserHost, chooserAbs, chooserDir, type FileChooserHost } from './chooser';
/** A folder listed now, never from the cache: what proves a chosen path is still a file before its bytes are read. */
export { freshListing } from './data';
export { parentOf } from './logic';
