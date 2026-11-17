// Tests only: the apps page's manifest with the Apps section as its view, the way Programs mounts it (header and
// the current computer), so the section's tests run through the real router, core and fixtures of 'apps'.
import { type PageManifest, useStrings } from '@kit';
import page from '../page';
import strings from '../strings.en.json';
import { AppsSection } from './AppsSection';

function Harness() {
  const t = useStrings(strings);
  return <AppsSection header={{ title: t('title') }} />;
}

export const harness: PageManifest = { ...page, layout: 'list-detail', load: () => Promise.resolve({ default: Harness }) };
