// The Desktop tab's memory of each desktop, for the page's life in this tab, keyed by computer (its id and creation
// time: a computer recreated under the same id starts empty) and desktop number: what it shows (parts/Desktop.tsx
// Phase, never a frame for a stopped or unknown desktop), when that was set, and the environment chosen for its next
// start; plus which desktop each computer's tab shows. Leaving the tab or the computer and coming back shows the same
// state, so a remount never starts a stopped desktop again by itself, and a Stop still running finishes into this
// memory, not into a gone component. A reload starts empty: Desktop.tsx then reads core's held and sending changes
// (a lost answer, or another tab's Stop still out, survives a reload there) and keeps what it found here. It ends with
// what core drops (an account change, a sign-out: keepsChanges), so one account's memory never shows to another, and a
// computer's part ends when it is seen not running (forgetComputer). A write carries the epoch read when its press
// began (slotEpoch): a Stop that answers after either ending writes nothing.
import { keepsChanges, onBump } from '@core';
import { useSyncExternalStore } from 'react';

export interface Slot<P> {
  readonly phase?: P;
  /** When `phase` was set (tick()): only a session read started after it may change what it claims. */
  readonly gen?: number;
  /** The desktop's session (incarnation) when the claim was made, null when not known: another one listed later
   *  means the desktop was opened again. */
  readonly inc?: string | null;
  readonly chosen?: string;
}

const slots = new Map<string, Slot<unknown>>();
const selected = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
let frames = 0;
let ticks = 0;
let era = 0;
const epochs = new Map<string, number>();

/** The memory's key of a computer: its id and creation time. */
export const computerKey = (c: { id: string; created_at?: string }): string => `${c.id}\u0000${c.created_at ?? ''}`;
const keyOf = (computer: string, n: number): string => `${computer}\u0001${n}`;
const changed = (): void => {
  version++;
  for (const l of [...listeners]) l();
};

export function readSlot<P>(computer: string, n: number): Slot<P> {
  return (slots.get(keyOf(computer, n)) ?? {}) as Slot<P>;
}

/** The memory's epoch for a computer: it moves when the memory ends (a bump) or the computer's part ends. */
export const slotEpoch = (computer: string): string => `${era}:${epochs.get(computer) ?? 0}`;

/** Writes into a desktop's memory; with `epoch`, only while the memory has not ended since it was read. */
export function patchSlot<P>(computer: string, n: number, patch: Slot<P>, epoch?: string): void {
  if (epoch !== undefined && epoch !== slotEpoch(computer)) return;
  const k = keyOf(computer, n);
  slots.set(k, { ...slots.get(k), ...patch });
  changed();
}

/** The desktops of a computer this memory holds a phase for (each stays in the tab's switcher). */
export function rememberedDesktops(computer: string): number[] {
  const out: number[] = [];
  const pre = computer + '\u0001';
  for (const [k, s] of slots) if (k.startsWith(pre) && s.phase !== undefined) out.push(Number(k.slice(pre.length)));
  return out;
}

export const readSelected = (computer: string): number | undefined => selected.get(computer);
export function setSelected(computer: string, n: number): void {
  selected.set(computer, n);
  changed();
}

/** A new frame generation (a reload or a start mounts a new frame), unique for the page's life. */
export const nextFrame = (): number => ++frames;

/** The memory's clock: a claim's generation, and a session read's start, compared with each other. */
export const tick = (): number => ++ticks;

/** The computer was seen not running (stopped, restarting): every claim about its desktops ends. */
export function forgetComputer(computer: string): void {
  const pre = computer + '\u0001';
  let any = false;
  for (const k of [...slots.keys()]) if (k.startsWith(pre)) any = slots.delete(k) || any;
  epochs.set(computer, (epochs.get(computer) ?? 0) + 1);
  if (any) changed();
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = (): number => version;

/** Re-renders on every change of any desktop's memory. */
export const useSlotsVersion = (): number => useSyncExternalStore(subscribe, snapshot, snapshot);

onBump((reason) => {
  if (keepsChanges(reason)) return;
  era++;
  slots.clear();
  selected.clear();
  changed();
});

/** Tests only: a fresh page. */
export function resetDesktopSlotsForTests(): void {
  era++;
  slots.clear();
  selected.clear();
  changed();
}
