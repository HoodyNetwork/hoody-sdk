// OldFile.tsx: what a one-file Hub below its Hoody's `hub_file_min` shows (build.ts): the file is out of date, the two
// build numbers as facts, and one link to download the current file from the same Hoody (`<origin>/auth/hoody-hub.html`,
// which the API answers as an attachment; nothing is fetched by this page).
//   - OldFile: the card body, used by the sign-in card in place of every sign-in way.
//   - mountOldFile: a Hub opened from a saved session (appStart.ts), shown INSTEAD of the Hub: the Hub is never loaded
//     (no shortcuts, overlays or passcode lock of its own exist), the session stays stored and nothing is purged or
//     sent from here. #root is still hidden and inert so nothing drawn into it can be used.
import { createRoot } from 'react-dom/client';
import { Facts, LinkButton } from '@kit';
import { useStrings } from '@kit/strings';
import { HUB_FILE_NAME } from '@core/origin';
import { adoptInjectedStyles } from '../app/csp-styles';
import { HUB_FILE_BUILD } from './build';
import { Card } from './Card';
import s from './FirstRun.module.css';
import strings from './strings.en.json';

/** The current file on the same Hoody as this page's, or null when no origin is known. */
const downloadUrl = (origin: string | null): string | null => (origin && /^https?:\/\/[^/]+$/.test(origin) ? `${origin}/auth/${HUB_FILE_NAME}` : null);

/** Hoody wants a newer file: what is true, the two build numbers, and the download. */
export function OldFile({ floor, origin, kept = false }: { floor: number; origin: string | null; kept?: boolean }) {
  const t = useStrings(strings);
  const url = downloadUrl(origin);
  return (
    <>
      <p className={s.text}>{t('old.body')}</p>
      {kept && <p className={s.text}>{t('old.kept')}</p>}
      <Facts
        columns={1}
        layout="spec"
        label={t('old.facts')}
        items={[
          { label: t('old.thisFile'), value: t('old.build', { n: HUB_FILE_BUILD }) },
          { label: t('old.needs'), value: t('old.buildOrLater', { n: floor }) },
        ]}
      />
      {url && (
        <LinkButton href={url} target="_blank" rel="noopener noreferrer" variant="primary">
          {t('old.download')}
        </LinkButton>
      )}
    </>
  );
}

function OldFileScreen({ floor, origin }: { floor: number; origin: string }) {
  const t = useStrings(strings);
  return (
    <Card title={t('old.title')} choice={null}>
      <OldFile floor={floor} origin={origin} kept />
    </Card>
  );
}

/** Shows the old-file screen in its own element; #root (left empty by appStart.ts) hidden and inert. `origin` is the
 *  stored session's Hoody. */
export function mountOldFile(floor: number, origin: string): void {
  adoptInjectedStyles();
  const hub = document.getElementById('root');
  if (hub) {
    hub.hidden = true;
    hub.inert = true;
  }
  const el = document.createElement('div');
  el.id = 'hub-old-file';
  document.body.append(el);
  createRoot(el).render(<OldFileScreen floor={floor} origin={origin} />);
}
