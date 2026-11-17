// Your realms: a compact switcher for an account with two or more realms. Each row switches the shell's realm
// (its own switch, so its rules apply); "Showing" marks the realm the shell reports as shown, never the one just
// pressed. A count that is not known is left out (never 0). The top-bar realm menu stays the full control. A row is
// named by the words it shows (no aria-label over them), so its name starts with its visible text.
import { Icon, Widget, useShellData, useStrings } from '@kit';
import { useRealms } from '@core';
import strings from '../strings.en.json';
import s from './home.module.css';
import { RealmSwatch } from './RealmSwatch';

export function RealmsCard({ title }: { title: string }) {
  const t = useStrings(strings);
  const realms = useRealms();
  const setRealm = useShellData().setRealm;
  const rows = realms.rows ?? [];
  if (!setRealm || rows.length < 2) return null;
  const all = { id: 'all', label: t('realms.all'), tint: '' as const, computers: null as number | null };
  const named = rows.map((r) => ({ id: r.id, label: 'text' in r.name ? r.name.text : r.id.slice(0, 8), tint: r.tint, computers: r.computers }));
  return (
    <Widget size="s" level="rows" title={title} description={t('realms.body')}>
      <ul className={s.realms}>
        {[all, ...named].map((r) => {
          const showing = realms.selected === r.id;
          return (
            <li key={r.id} className={r.id === 'all' ? s.realmAll : undefined}>
              <button
                type="button"
                className={s.realmRow}
                aria-current={showing ? 'true' : undefined}
                onClick={() => (showing ? undefined : setRealm(r.id))}
                data-realm={r.id}
              >
                {r.id === 'all' ? <Icon name="realm" size="sm" /> : <RealmSwatch tint={r.tint} />}
                <span className={s.realmName}>{r.label}</span>
                {typeof r.computers === 'number' && <span className={s.realmCount}>{t('realms.count', { count: r.computers })}</span>}
                {showing && <span className={s.realmShowing}>{t('realms.showing')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Widget>
  );
}
