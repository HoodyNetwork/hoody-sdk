// The one copy seam: text to the terminal's clipboard through the host (OSC 52, sent by the engine, which knows whether
// the terminal takes it). Never read: the terminal Hub has no paste-from-clipboard path besides bracketed paste.
// Text passes safeCopyText (controls and invisible format characters removed, at most MAX_COPY_BYTES); refused text
// copies nothing. FocusRoot mounts the host (counted, so nested roots share it).
// There is NO global copy: a component takes its copy from useClipboard(), bound to the
// renderer it rendered under, which answers false once that mount ended. Code with no component (a module function)
// takes one with captureCopy() at the press, bound the same way to the mount live then. Until a host is mounted the copy
// answers false: the caller shows "Copy failed".
import { useCallback, useEffect, useMemo } from 'react';
import { DENY_ALL, useSecretScreen, type SecretScreenAsk } from '../app/secret-screen-ctx';
import { useRenderer } from './otui';
import { safeCopyText } from './safe';

interface Host { copyToClipboardOSC52(text: string): boolean }
// One seam, however many FocusRoots mount a host (every overlay layer has its own root): hosts are counted per
// renderer and the most recently mounted live one is used.
const hosts = new Map<Host, number>();
// Each host's secret-screen asking (app/secret-screen-ctx), for captureCopy. Every root of one renderer sits under its
// mount's one provider (layers are portals), so they all set the same asking.
const asks = new Map<Host, SecretScreenAsk>();
// Nothing copied is ever kept anywhere: tests spy on the renderer (prim/testing.ts copiesOf).

/** A copy: true when the terminal was asked. */
export type CopyFn = (text: string) => boolean;

/** Mounted once (FocusRoot does it): makes the renderer the copy host. */
export function ClipboardHost(): null {
  const r = useRenderer() as unknown as Host;
  const ask = useSecretScreen();
  useEffect(() => {
    hosts.set(r, (hosts.get(r) ?? 0) + 1);
    asks.set(r, ask);
    return () => {
      const n = (hosts.get(r) ?? 1) - 1;
      if (n > 0) hosts.set(r, n); else { hosts.delete(r); asks.delete(r); }
    };
  }, [r, ask]);
  return null;
}

/** The copy through `r`, only while it is still a mounted host. */
function copyThrough(r: Host, text: string): boolean {
  const t = safeCopyText(text);
  if (t === null || !hosts.has(r)) return false;
  try { return r.copyToClipboardOSC52(t) !== false; } catch { return false; }
}

/**
 * `copy` for a component, bound to the renderer it was rendered under: it copies through that
 * renderer only while it is still a mounted host, so a late continuation of an ended mount (a promise that resolves after
 * quit) answers false instead of copying through the next mount's terminal.
 */
export function useClipboard(): { copy: CopyFn } {
  const r = useRenderer() as unknown as Host;
  const bound = useCallback((text: string): boolean => copyThrough(r, text), [r]);
  return useMemo(() => ({ copy: bound }), [bound]);
}

/** What captureCopy hands a module function: the mount that was live when it was taken. */
export interface CapturedCopy {
  /** The copy, bound to that mount as useClipboard's is: false, nothing copied, once the mount ended. */
  readonly copy: CopyFn;
  /** That mount's secret-screen asking: ask it at the write, never keep its answer. */
  readonly screen: SecretScreenAsk;
}

/**
 * The copy for code with no component (kit copyWhenRead), taken synchronously inside the press it answers, before any
 * await: the newest mounted host, which is the mount the press came from (a process runs one mount at a time, app/run.ts;
 * a press cannot name its renderer to a module function). A text that arrives after that mount ended copies nothing,
 * never through whichever terminal is current by then. Null when no host is mounted.
 */
export function captureCopy(): CapturedCopy | null {
  let r: Host | undefined;
  for (const h of hosts.keys()) r = h;
  if (r === undefined) return null;
  const host = r;
  return { copy: (text) => copyThrough(host, text), screen: asks.get(host) ?? DENY_ALL };
}
