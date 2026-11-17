// The shell's one box for a page's lazy reader hook (a manifest navCount or searchHide): the shell loads the reader on
// its own, never the page, once per page and kind, and boxes it so it fails open. While the reader loads (Suspense),
// if its load fails or it throws (the boundary), the box draws nothing and the probe inside reports nothing; the
// probe's own cleanup takes back what it reported. navCount.tsx and search/hide.tsx both use it, so their fail-open
// rules cannot drift apart.
import { Component, type ErrorInfo, type ReactNode, Suspense } from 'react';
import type { PageManifest } from '@kit/page';

/** A loader cache for one kind of reader: one load per page. A load that failed stays failed until the Hub reloads. */
export function lazyReaders<R>(): (page: PageManifest, load: () => Promise<{ default: R }>) => Promise<R> {
  const readers = new WeakMap<PageManifest, Promise<R>>();
  return (page, load) => {
    let p = readers.get(page);
    if (!p) {
      p = load().then((m) => m.default);
      readers.set(page, p);
    }
    return p;
  };
}

class NullBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {}
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** Draws its probe once the reader has loaded; nothing while it loads, and nothing for good once it failed or threw. */
export function ReaderBox({ children }: { children: ReactNode }) {
  return (
    <NullBoundary>
      <Suspense fallback={null}>{children}</Suspense>
    </NullBoundary>
  );
}
