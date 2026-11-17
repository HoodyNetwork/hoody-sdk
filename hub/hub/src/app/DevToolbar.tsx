// Dev toolbar (fixtures mode only): switch the current page's fixture state and the fake
// latency, flip the theme. Never part of a production build (main.tsx gates it on
// __HUB_FIXTURES__). Its words are developer-facing, kept in app/strings.en.json.
import { useEffect, useState } from 'react';
import type { PageManifest } from '@kit/page';
import { useStrings } from '@kit/strings';
import { fixtureStore, loadFixtures, useFixtureState, type Latency } from './fixtures';
import strings from './strings.en.json';
import s from './DevToolbar.module.css';

const LATENCIES: readonly Latency[] = ['instant', 'normal', 'slow', 'late'];

function currentPage(pages: readonly PageManifest[]): PageManifest | undefined {
  const path = window.location.hash.replace(/^#/, '').split('?')[0] ?? '';
  return pages.find((p) => path === p.path || path.startsWith(`${p.path}/`));
}

export function DevToolbar({ pages }: { pages: readonly PageManifest[] }) {
  const t = useStrings(strings);
  const fx = useFixtureState();
  const [page, setPage] = useState(() => currentPage(pages));
  const [states, setStates] = useState<string[]>([]);
  const [def, setDef] = useState<string>('');
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const onHash = () => setPage(currentPage(pages));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [pages]);

  useEffect(() => {
    let live = true;
    if (!page) {
      setStates([]);
      return;
    }
    void loadFixtures(page.id).then((f) => {
      if (!live) return;
      setStates(f ? Object.keys(f.states) : []);
      setDef(f ? f.default : '');
    });
    return () => {
      live = false;
    };
  }, [page]);

  const theme = document.documentElement.getAttribute('data-hx-theme') === 'dark' ? 'dark' : 'light';

  if (!open) {
    return (
      <button type="button" className={s.fab} onClick={() => setOpen(true)} aria-label={t('dev.open')}>
        <span className={s.fabGlyph}>{t('dev.short')}</span>
      </button>
    );
  }

  return (
    <div className={s.bar} role="region" aria-label={t('dev.label')}>
      <span className={s.title}>{page ? t('dev.page', { id: page.id }) : t('dev.noPage')}</span>
      {states.length > 0 && (
        <div className={s.group} role="group" aria-label={t('dev.state')}>
          {states.map((st) => (
            <button
              key={st}
              type="button"
              className={s.btn}
              aria-pressed={(fx.state ?? def) === st}
              onClick={() => fixtureStore.set({ state: st })}
            >
              {st}
            </button>
          ))}
        </div>
      )}
      <div className={s.group} role="group" aria-label={t('dev.latency')}>
        {LATENCIES.map((l) => (
          <button key={l} type="button" className={s.btn} aria-pressed={fx.latency === l} onClick={() => fixtureStore.set({ latency: l })}>
            {l}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={s.btn}
        onClick={() => document.documentElement.setAttribute('data-hx-theme', theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? t('dev.light') : t('dev.dark')}
      </button>
      <button type="button" className={s.btn} onClick={() => setOpen(false)} aria-label={t('dev.close')}>
        {t('dev.hide')}
      </button>
    </div>
  );
}
