// One program frame: the iframe, its load state, and the window it may receive
// parent keys from.
//
// Contract, in plain words:
//   - Attributes are fixed: allow = clipboard-read, clipboard-write, fullscreen, microphone, autoplay; sandbox = the
//     stage's tokens + allow-pointer-lock; title names the program and computer. src is the tile's built address,
//     with no token, except an agent tile's: SignedFrame hands it the address with its short-lived boot token
//     (hdy_token), the agent's own sign-in.
//   - A foreign frame gets only fullscreen and autoplay (FRAME_ALLOW_FOREIGN: no clipboard read or write, no microphone) and is
//     never registered for parent keys: a web address the person typed, and a port or script of their computer.
//     Whatever listens on a port is a page, not a Hoody program: a page an agent started, or one
//     it fetched, may be hostile, and nothing on a port sends parent keys.
//   - onState reports 'loading' at mount, 'loaded' on the load event, and 'slow' when no load event came in 20 s.
//     A Board kept loaded (useKeepPage) stops this effect while hidden and runs it again when shown: a frame that
//     already loaded its src, before or while hidden, reports 'loaded' at once, never 'loading' or a false 'slow'.
//     What the frame last finished loading is noted on the frame itself, not by an effect: a load
//     listener notes its src, and a change of its src (even while hidden) forgets it until that src loads. So a new
//     src that loads behind another page counts too, and one still loading reads 'loading' on return.
//   - register(win, origin) hands the Board the frame's window and its address's origin, the only pair a
//     hoody-parent-key message is accepted from. It is withdrawn on unmount, and while a kept Board is hidden.
//   - Only the active tile's frame is in the tab order (tabIndex 0); the others are -1.
//   - A page frame (a web address, an HTTP port or a script: a document, not a Hoody program) gets the ground a browser
//     tab gives a page: light color-scheme over the system Canvas. A document that sets no colours (a JSON or text
//     answer the browser renders) has a transparent canvas and default black text, so over the dark program ground it
//     would be dark on dark. Program frames keep the program ground.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import s from './board.module.css';

export const FRAME_ALLOW = 'clipboard-read; clipboard-write; fullscreen; microphone; autoplay';
export const FRAME_ALLOW_FOREIGN = 'fullscreen; autoplay';
export const FRAME_SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock';
export const SLOW_MS = 20_000;

export type FrameState = 'loading' | 'loaded' | 'slow';

export interface FrameProps {
  src: string;
  title: string;
  inTabOrder: boolean;
  onState: (s: FrameState) => void;
  register: (win: Window | null, origin: string) => void;
  /** A web address, port or script tile: the narrower allow list and no parent-key registration. */
  foreign?: boolean;
  /** A document rather than a Hoody program (web, port, script tile): the browser-tab ground. */
  page?: boolean;
}

export interface FrameHandle {
  focus(): void;
  /** The element focus inside counts as inside the tile: the iframe, or a conversation tile's native body. */
  element(): HTMLElement | null;
}

const originOf = (u: string): string => {
  try { return new URL(u).origin; } catch { return ''; }
};

export const Frame = forwardRef<FrameHandle, FrameProps>(function Frame({ src, title, inTabOrder, onState, register, foreign = false, page = false }, ref) {
  const el = useRef<HTMLIFrameElement>(null);
  const cb = useRef({ onState, register });
  cb.current = { onState, register };
  useImperativeHandle(ref, () => ({ focus: () => el.current?.focus(), element: () => el.current }), []);
  // The src this frame node last finished loading (null: none, or its src changed since): watched on the node, so a
  // hide (effects stopped) misses nothing. Set up once per node.
  const seen = useRef<{ node: HTMLIFrameElement | null; loaded: string | null } | null>(null);

  useEffect(() => {
    const node = el.current;
    if (!seen.current || seen.current.node !== node) {
      const r: { node: HTMLIFrameElement | null; loaded: string | null } = { node, loaded: null };
      if (node) {
        node.addEventListener('load', () => { r.loaded = node.getAttribute('src'); });
        // Observed before its next load: setting src starts a new load, so what loaded before no longer counts.
        new MutationObserver(() => { r.loaded = null; }).observe(node, { attributes: true, attributeFilter: ['src'] });
      }
      seen.current = r;
    }
    const back = seen.current.loaded === src;
    if (!back) cb.current.onState('loading');
    const timer = back ? undefined : setTimeout(() => cb.current.onState('slow'), SLOW_MS);
    const origin = foreign ? '' : originOf(src);
    const win = () => (foreign ? null : node?.contentWindow ?? null);
    cb.current.register(win(), origin);
    if (back) cb.current.onState('loaded');
    const loaded = () => {
      clearTimeout(timer);
      // A navigation inside the frame keeps the same window; the origin stays the address's own.
      cb.current.register(win(), origin);
      cb.current.onState('loaded');
    };
    node?.addEventListener('load', loaded);
    return () => {
      clearTimeout(timer);
      node?.removeEventListener('load', loaded);
      cb.current.register(null, '');
    };
  }, [src, foreign]);

  // Only the active tile's frame is a tab stop: tabIndex on the iframe is that rule, not a widget.
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
  return <iframe ref={el} className={page ? `${s.frame} ${s.framePage}` : s.frame} src={src} title={title} allow={foreign ? FRAME_ALLOW_FOREIGN : FRAME_ALLOW} sandbox={FRAME_SANDBOX} tabIndex={inTabOrder ? 0 : -1} referrerPolicy="origin" />;
});
