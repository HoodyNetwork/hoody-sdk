// The parts pages contribute to the top bar through their manifest's `topBar` (for example the Free badge),
// drawn before the account menu on every page. Each is lazy and boxed on its own: a part that renders nothing takes no
// space, and one whose load fails or that throws draws nothing and leaves the bar whole. Hidden on the phone with the
// account menu.
import { useCore } from '@core';
import { type ComponentType, Component, type ErrorInfo, type ReactNode, Suspense } from 'react';
import { useTopBarParts } from './contributions';
import s from './TopBar.module.css';

interface BoundaryProps {
  /** The part's component: a replacement (its page's loader changed) gets a try of its own. */
  part: ComponentType;
  children: ReactNode;
}
interface BoundaryState {
  failed: boolean;
  part: ComponentType;
}

// A failure lasts while the part stays. A load that failed is not retried by an account or realm switch (the remount
// below): React keeps a lazy component's rejection, so only a new loader (a new lazy component) loads again.
class PartBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false, part: this.props.part };
  static getDerivedStateFromProps(p: BoundaryProps, st: BoundaryState): Partial<BoundaryState> | null {
    return p.part !== st.part ? { failed: false, part: p.part } : null;
  }
  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }
  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {}
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export function TopBarParts() {
  const parts = useTopBarParts();
  const core = useCore();
  if (parts.length === 0) return null;
  // Like the page under <ContextOutlet>, a part starts again on an account or realm switch: what it showed or had
  // open belonged to the context left, and one that threw gets another try.
  const ctx = `${core.account}|${core.realm}`;
  return (
    <span className={s.parts} data-hub-topbar-parts="">
      {parts.map(({ pageId, id, Component: Part }) => (
        // Each part in its own box-less span (display: contents: no box, no gap, the same Tab order), named by its
        // contribution (pageId:id). The name is a styling hook only (TopBar.module.css: Skills / SDK is dark; the
        // Free badge sits on the accent's soft plate); nothing reads it to decide anything.
        <span key={`${pageId}:${id}:${ctx}`} className={s.part} data-hub-topbar-part={`${pageId}:${id}`}>
          <PartBoundary part={Part}>
            <Suspense fallback={null}>
              <Part />
            </Suspense>
          </PartBoundary>
        </span>
      ))}
    </span>
  );
}
