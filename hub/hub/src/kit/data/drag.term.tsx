// Drag and drop has no terminal form: a terminal has no drag events and no files dropped on it. Every drop on the web
// has a menu or button twin on the page (drag.tsx's rule), so the terminal offers those only: useTableDrag gives the
// table nothing to spread and no hint, and DropArea is only its children. Types and the pure helpers stay the same,
// so pages compile and run unchanged.
import type * as Web from './drag';

/** macOS (the terminal's own platform; there is no browser to ask). */
const APPLE = (globalThis as { process?: { platform?: string } }).process?.platform === 'darwin';

export type { DragInfo, DropData, RowDrag, RowTarget, DropTarget, FrameDropProps, RowDragProps, TableDrag } from './drag';

/** The copy key of the platform the terminal runs on (macOS: Option). */
export const copyKeyName: typeof Web.copyKeyName = (apple = APPLE) => (apple ? 'Option' : 'Ctrl');

export const isCopyDrag: typeof Web.isCopyDrag = (e, apple = APPLE) => (apple ? e.altKey : e.ctrlKey);

/** No stray file can be dropped on a terminal: nothing to refuse. */
export const useRefuseStrayFiles: typeof Web.useRefuseStrayFiles = () => undefined;

const NONE: Web.TableDrag = Object.freeze({ frameProps: Object.freeze({}), rowProps: () => ({}), hint: null });

/** Inert: no frame props, no row props, no hint. */
export const useTableDrag: typeof Web.useTableDrag = () => NONE;

/** Inert: its children alone, with no drop and no hint. */
export const DropArea: typeof Web.DropArea = ({ children }) => <>{children}</>;
