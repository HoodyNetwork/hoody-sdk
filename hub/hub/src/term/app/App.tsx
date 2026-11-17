// The terminal app: providers, the keymap's capture phase, the focus root, the overlay host, the router and the shell
// around the pages. Key order (shell/keymap.ts): the overlay gate (an open layer has every key) → KeyCapture (shell
// chords, before the focused control) → the focused control → the page's and the shell's single keys (KeyBubble).
import '../env/router-globals';
import { applyTermWords } from './termWords';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createTermHistory } from './history';
import { RouterProvider } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { PageManifest } from '@kit/page';
import { FocusRoot, ScreenRoot } from '../prim';
import { OverlayHost, useLayerCount } from '../prim/Overlay';
import { createShellKeymap, type ShellKeymap } from '../shell/keymap';
import { KeyCapture, TermShell } from '../shell/TermShell';
import { WindowTitle } from '../shell/windowTitle';
import { buildTermRouter } from './router';

export interface TermAppOptions {
  pages: readonly PageManifest[];
  queryClient: QueryClient;
  /** Where the app opens, as a Hub path with its search ("/schedules?sel=a"). */
  path: string;
  /** Leave the Hub: q, Ctrl-C, the quit prompt's Leave. The runner closes the renderer. */
  onQuit: () => void;
  /** Ctrl-Z, where the runner can suspend the process. */
  onSuspend?: () => void;
  /** Without the shell: the page alone (component and golden tests). */
  bare?: boolean;
  /** Load the nav pages' views in the background after the first page (the web's preloadOnIdle). Default off. */
  preload?: boolean;
  /** The keymap (tests pass one with a fake clock); default a new one. */
  keymap?: ShellKeymap;
}

/**
 * The shell and page's own focus scope, inside the layer host: while any layer that takes the keys is open (a dialog,
 * a menu, the palette, the entered toast stack) it is inactive, so only the layer's focus is live and drawn (one focused
 * thing on screen). A tip (InfoTip glance, Tooltip, a soft-disabled reason) takes no key and leaves the scope active: it
 * is shown BY the focus, so taking the focus away would hide it and loop (an InfoTip on the AI page did).
 */
function PageRoot({ children }: { children?: ReactNode }) {
  return <FocusRoot active={useLayerCount({ trapping: true }) === 0}>{children}</FocusRoot>;
}

export function createTermApp(o: TermAppOptions): { element: ReactNode; router: ReturnType<typeof buildTermRouter>; keymap: ShellKeymap } {
  // The terminal's own wording in the shared string tables (termWords.ts), before any page draws.
  applyTermWords();
  const keymap = o.keymap ?? createShellKeymap();
  const router = buildTermRouter(o.pages, {
    queryClient: o.queryClient,
    history: createTermHistory(o.path),
    preload: o.preload === true,
    // The window title's one writer (shell/windowTitle.tsx) sits beside the shell, inside the router.
    frame: o.bare ? undefined : (pages, routed) => <><WindowTitle pages={pages} /><TermShell pages={pages} keymap={keymap} onQuit={o.onQuit} {...(o.onSuspend ? { onSuspend: o.onSuspend } : {})}>{routed}</TermShell></>,
  });
  const element = (
    <QueryClientProvider client={o.queryClient}>
      <ScreenRoot>
      {!o.bare && <KeyCapture keymap={keymap} />}
      <FocusRoot>
        <OverlayHost>
          <PageRoot>
            <RouterProvider router={router} />
          </PageRoot>
        </OverlayHost>
      </FocusRoot>
      </ScreenRoot>
    </QueryClientProvider>
  );
  return { element, router, keymap };
}
