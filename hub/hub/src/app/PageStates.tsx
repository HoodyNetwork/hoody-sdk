// The page-level states the router draws in a page's place: not found, a page that failed to load, and a sensitive page
// refused inside a frame (app/pageRouter.tsx).
import { Button, EmptyState, ErrorState, Link, PageFrame, PageHeader, useGo, useStrings } from '@kit';
import kitStrings from '@kit/strings.en.json';

export function NotFound() {
  const t = useStrings(kitStrings);
  const go = useGo();
  return (
    <EmptyState
      icon="warn"
      title={t('page.notFound.title')}
      body={t('page.notFound.body')}
      action={
        <Button variant="primary" onPress={() => go('/')}>
          {t('page.notFound.home')}
        </Button>
      }
    />
  );
}

export function PageError() {
  const t = useStrings(kitStrings);
  return <ErrorState body={t('page.loadError')} onRetry={() => window.location.reload()} />;
}

/** A sensitive page in a framed Hub (the framed lock, app/pageRouter.tsx): nothing of the page loaded; it opens in its own
 *  tab. The page's own title stays the page's h1 (the shell's route focus lands there). */
export function FramedRefused({ title }: { title: string }) {
  const t = useStrings(kitStrings);
  return (
    <PageFrame capped>
      <PageHeader title={title} />
      <EmptyState icon="lock" title={t('page.framed.title')} body={t('page.framed.body')} action={<Link href={window.location.href}>{t('page.framed.open')}</Link>} />
    </PageFrame>
  );
}
