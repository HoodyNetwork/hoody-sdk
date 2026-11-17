// The chrome around one contributed card: the kit Widget frame (title with count, then View all at the header's end in
// link blue), its own loading and error states. The card's content is the page's own component. No ⋯ menu:
// Hide is in Customize, and the error state has Try again.
import { ErrorState, Skeleton, Widget, WidgetTitle, useStrings } from '@kit';
import { Suspense } from 'react';
import strings from '../strings.en.json';
import type { Contribution } from './contributions';
import { ErrorBoundary } from './ErrorBoundary';

interface Props {
  item: Contribution;
}

export function WidgetFrame({ item }: Props) {
  const t = useStrings(strings);
  const { Component } = item;
  return (
    <Widget
      size={item.size}
      title={<WidgetTitle count={item.count}>{item.title}</WidgetTitle>}
      viewAll={{ href: item.href, label: item.viewLabel, end: true }}
    >
      <ErrorBoundary fallback={(reset) => <ErrorState size="compact" title={t('widget.error', { title: item.title })} onRetry={reset} />}>
        <Suspense fallback={<Skeleton variant="widget" />}>
          <Component />
        </Suspense>
      </ErrorBoundary>
    </Widget>
  );
}
