// The body a data state allows, shared by every holder of a SectionState: the strict Section
// and SubSection, the ListDetailPage list pane and the DetailPage body. One renderer, so a
// pane says "empty", "nothing matches" or "pick a realm" in exactly the words and shape a Section does.
import type { ReactNode } from 'react';
import { Button } from '../../controls/Button';
import { Band } from '../../states/Band';
import { EmptyState, ErrorState, Skeleton } from '../../states/States';
import { useStrings } from '../../strings';
import kitStrings from '../../strings.en.json';
import { ActionControl } from './ActionBar';
import type { AnyAction, EmptySpec, SectionState } from './types';
import strings from './strings.en.json';

/** The empty state's action: the section's primary moves here unless the spec names another or none. */
const emptyAction = (spec: EmptySpec, primary: AnyAction | undefined): AnyAction | undefined =>
  spec.action === 'none' ? undefined : spec.action === undefined || spec.action === 'primary' ? primary : spec.action;

export interface StateBodyProps {
  state: SectionState | undefined;
  empty: EmptySpec | undefined;
  primary: AnyAction | undefined;
  children: ReactNode;
}

/** The body a state allows: the kit's own renderer, or the page's leaves. */
export function StateBody({ state, empty, primary, children }: StateBodyProps) {
  const t = useStrings(kitStrings);
  const ts = useStrings(strings);
  if (!state || state.kind === 'ready') return <>{children}</>;
  switch (state.kind) {
    case 'loading':
      return <Skeleton rows={state.rows ?? 3} variant={state.variant ?? 'rows'} />;
    case 'empty': {
      if (!empty) throw new Error('state "empty" needs an `empty` spec');
      const action = emptyAction(empty, primary);
      return (
        <EmptyState
          size="sm"
          icon={empty.icon}
          title={empty.title}
          body={empty.body}
          action={action && <ActionControl action={action} variant="primary" />}
          secondary={empty.learn && <ActionControl action={empty.learn} variant="secondary" />}
        />
      );
    }
    case 'noMatch':
      return <EmptyState size="sm" icon="search" title={ts('noMatch')} action={<Button onPress={state.onClear}>{t('action.clear')}</Button>} />;
    case 'partial':
      return (
        <>
          <Band tone="warn" size="table" actions={<Button size="sm" busy={state.busy} onPress={state.onRecheck}>{t('outcome.pending.check')}</Button>}>
            {ts('partial')}
          </Band>
          {state.shown > 0 && children}
        </>
      );
    case 'stale':
      return (
        <>
          <Band tone="warn" size="table" error={state.error} actions={<Button size="sm" busy={state.busy} onPress={state.onRetry}>{t('action.retry')}</Button>}>
            {ts('stale')}
          </Band>
          {state.shown > 0 && children}
        </>
      );
    case 'unknown':
      return (
        <Band tone="warn" size="table" actions={<Button size="sm" busy={state.busy} onPress={state.onRecheck}>{t('outcome.pending.check')}</Button>}>
          {state.text}
        </Band>
      );
    case 'failed':
      return <ErrorState size="sm" error={state.error} onRetry={state.onRetry} retrying={state.busy} />;
    case 'notHere':
      return (
        <EmptyState
          size="sm"
          icon={state.icon}
          title={state.title}
          body={state.body}
          action={state.action && <ActionControl action={state.action} variant="primary" />}
          secondary={state.learn && <ActionControl action={state.learn} variant="secondary" />}
        />
      );
  }
}
