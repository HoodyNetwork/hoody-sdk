// The engine's headless renderer, for *.term.test.tsx (tests name the engine through here, like everything else).
import './otui'; // sets the host text filter (prim/safe.ts) before anything draws
import { testRender as engineTestRender } from '@opentui/react/test-utils';
import { createElement, type ReactNode } from 'react';
import { RENDERER_FLAGS } from '../app/run';
import { ALLOW_ALL, SecretScreenCtx } from '../app/secret-screen-ctx';

/** The engine's test renderer with the flags every Hub renderer is made with (app/run.ts RENDERER_FLAGS): without them
 *  an error opened the engine's debug console over the page ("Console (Focused)" in goldens and shots), a click handed
 *  the engine's focus to a scroll box, and Ctrl-C belonged to the engine. A caller's own option wins (a test may ask
 *  for something else on purpose). A headless frame reaches no terminal, so secret fields may show and copy here
 *  (app/secret-screen-ctx.ts); `bare` mounts with no provider, as a mount that forgot it (secrets stay hidden). */
export function testRender(node: ReactNode, options: Parameters<typeof engineTestRender>[1], o: { bare?: boolean } = {}): ReturnType<typeof engineTestRender> {
  return engineTestRender(o.bare ? node : createElement(SecretScreenCtx.Provider, { value: ALLOW_ALL }, node), { ...RENDERER_FLAGS, ...options });
}
export type TestTerm = Awaited<ReturnType<typeof testRender>> & {
  /** Lets state updates land and draws them; returns the frame as text. A key still in the input parser counts as
   *  work under way (see inputHeld): after pressEscape(), settle() alone is enough, with no sleep before it. */
  settle(): Promise<string>;
};

/** True while the renderer's input parser holds bytes: a lone ESC waits there for the parser's timeout (20 ms) to
 *  become the Escape key. The same reading as the page renderer's settle (scripts/term/render.ts `busy`). */
export function inputHeld(renderer: unknown): boolean {
  return !!(renderer as { stdinParser?: { pending?: { length: number } } | null }).stdinParser?.pending?.length;
}

/** Draws `node` headless. Updates made by keys, timers and queries are drawn by settle(), not by act(). */
export async function drawTest(node: ReactNode, size: { width: number; height: number }, o: { bare?: boolean } = {}): Promise<TestTerm> {
  const t = await testRender(node, size, o) as TestTerm;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  t.settle = async () => {
    let last = '';
    for (let same = 0, i = 0; same < 3 && i < 100; i++) {
      await t.renderOnce();
      const f = t.captureCharFrame();
      // A still frame counts only while no key waits in the parser: three still frames took about as long as the lone-ESC
      // timeout, so settle() returned just as Escape arrived and the caller read the frame from before it.
      same = f === last && !inputHeld(t.renderer) ? same + 1 : 0;
      last = f;
      await new Promise((r) => setTimeout(r, 5));
    }
    return last;
  };
  await t.settle();
  return t;
}

/**
 * What a test renderer was asked to copy (OSC 52), newest last: wraps the renderer's own method, so nothing outside a
 * test ever keeps copied text. Call before the copy happens.
 */
export function copiesOf(renderer: unknown): string[] {
  const r = renderer as { copyToClipboardOSC52(text: string): boolean };
  const sent: string[] = [];
  const real = r.copyToClipboardOSC52.bind(r);
  r.copyToClipboardOSC52 = (text: string) => { sent.push(text); return real(text); };
  return sent;
}
