// The toast queue's class in the terminal: react-stately's ToastQueue (react-stately 3.x, useToastState.mjs) line for
// line, because react-stately is a web-only package in the terminal build. Same order (newest first), same timers
// (paused and resumed with what was left), same onClose. Only the class lives here: the store (Toast.store.ts) and its
// one queue instance are shared with the web.
import type * as Web from './Toast.queue';

export type { ToastQueue } from './Toast.queue';

interface Queued<T> { content: T; key: string; timeout?: number; onClose?: () => void; timer?: Timer }

class Timer {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private startTime = 0;
  private remaining: number;
  constructor(private readonly callback: () => void, delay: number) { this.remaining = delay; }
  reset(delay: number): void { this.remaining = delay; this.resume(); }
  pause(): void {
    if (this.timerId == null) return;
    clearTimeout(this.timerId);
    this.timerId = null;
    this.remaining -= Date.now() - this.startTime;
  }
  resume(): void {
    if (this.remaining <= 0) return;
    this.startTime = Date.now();
    this.timerId = setTimeout(() => {
      this.timerId = null;
      this.remaining = 0;
      this.callback();
    }, this.remaining);
  }
}

class TermToastQueue<T> {
  private queue: Queued<T>[] = [];
  private subscriptions = new Set<() => void>();
  private readonly maxVisibleToasts: number;
  visibleToasts: Queued<T>[] = [];
  constructor(options?: { maxVisibleToasts?: number }) { this.maxVisibleToasts = options?.maxVisibleToasts ?? Infinity; }
  subscribe(fn: () => void): () => void {
    this.subscriptions.add(fn);
    return () => this.subscriptions.delete(fn);
  }
  add(content: T, options: { timeout?: number; onClose?: () => void } = {}): string {
    const key = '_' + Math.random().toString(36).slice(2);
    const toast: Queued<T> = { ...options, content, key, timer: options.timeout ? new Timer(() => this.close(key), options.timeout) : undefined };
    this.queue.unshift(toast);
    this.update();
    return key;
  }
  close(key: string): void {
    const i = this.queue.findIndex((t) => t.key === key);
    if (i >= 0) {
      this.queue[i]!.onClose?.();
      this.queue.splice(i, 1);
    }
    this.update();
  }
  private update(): void {
    this.visibleToasts = this.queue.slice(0, this.maxVisibleToasts);
    for (const fn of this.subscriptions) fn();
  }
  pauseAll(): void { for (const t of this.visibleToasts) t.timer?.pause(); }
  resumeAll(): void { for (const t of this.visibleToasts) t.timer?.resume(); }
  clear(): void { this.queue = []; this.update(); }
}

// React Aria's class has private members, so no other class is assignable to its type: the cast is the bridge.
export const createToastQueue: typeof Web.createToastQueue = (options) => new TermToastQueue(options) as never;
