// MarkdownViewer's limits and the words it compares against, shared by the web viewer and its terminal sibling.

/** Past this many UTF-8 bytes a document shows as text only, with a line saying it is too long to render. */
export const VIEWER_RENDER_MAX = 256 * 1024;
/** Download refuses a file past this size (core save's cap): a document the viewer holds, not a stream. */
export const VIEWER_SAVE_MAX = 16 * 1024 * 1024;

export type ViewerView = 'rendered' | 'raw';
export const viewerBytes = (t: string): number => new TextEncoder().encode(t).length;

// What scrubSecrets leaves of a text it hid whole. Copy and Download then hold only this, so the viewer says so.
export const VIEWER_WITHHELD = '[hidden]';
