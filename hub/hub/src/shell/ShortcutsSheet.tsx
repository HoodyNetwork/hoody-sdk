// The `?` sheet: the keys the current page declared (usePageShortcuts) first, in its groups with
// same-label keys on one row (← or h), then every global key.
import { Kbd } from '@kit/controls/Kbd';
import { Drawer } from '@kit/overlays/Overlays';
import { useStrings } from '@kit/strings';
import { usePageShortcutGroups } from './pageShortcuts';
import { useShortcuts } from './shortcuts';
import strings from './strings.en.json';
import s from './ShortcutsSheet.module.css';

export function ShortcutsSheet({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useStrings(strings);
  const page = usePageShortcutGroups().map((g, i) => ({
    id: `page-${i}`,
    title: g.title === undefined ? t('keys.group.page') : t('keys.group.pageNamed', { group: g.title }),
    rows: g.rows.map((r) => ({ label: r.label, alts: r.alts })),
  }));
  // A global row is one way to press it (g h is one sequence).
  const global = useShortcuts().map((g) => ({ id: g.id, title: g.title, rows: g.rows.map((r) => ({ label: r.label, alts: [r.keys] })) }));
  const groups = [...page, ...global];
  return (
    <Drawer resizeKey="shell-shortcuts" isOpen={isOpen} onOpenChange={onOpenChange} title={t('keys.title')} size="sm">
      <div className={s.groups}>
        {groups.map((g) => (
          <section key={g.id} className={s.group}>
            <h3 className={s.groupTitle}>{g.title}</h3>
            <dl className={s.list}>
              {g.rows.map(({ alts, label }) => (
                <div key={label} className={s.row}>
                  <dt className={s.label}>{label}</dt>
                  <dd className={s.keys}>
                    {alts.map((keys, i) => (
                      <span key={keys.join(' ')} className={s.alt}>
                        {i > 0 && <span className={s.or}>{t('keys.or')}</span>}
                        {keys.map((k) => (
                          <Kbd key={k}>{k}</Kbd>
                        ))}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Drawer>
  );
}
