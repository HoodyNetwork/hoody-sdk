// Shortcuts: a few of the shell's own keys (platform-aware, only for pages this load serves), the page's C, and
// the full sheet one press away. The rows come from the shell's table, so they never promise a key that does nothing.
import { Button, Kbd, Tile, Widget, openShortcutsSheet, useShortcuts, useStrings } from '@kit';
import strings from '../strings.en.json';
import { CUSTOMIZE_KEY } from '../logic';
import s from './home.module.css';
import { pickShortcuts } from './shortcutsPick';

export { pickShortcuts } from './shortcutsPick';

export function ShortcutsCard({ title }: { title: string }) {
  const t = useStrings(strings);
  const rows = pickShortcuts(useShortcuts());
  return (
    <Widget size="s" level="fill" title={title}>
      {/* The keys and All shortcuts are one grid of equal tiles (the dl's rows join the grid). */}
      <div className={s.keyCard}>
        <div className={s.keyGrid}>
          <dl className={s.keyRows}>
            {rows.map((r) => (
              <Tile key={r.keys.join(' ')}>
                <dt className={s.keyKeys}>
                  {r.keys.flatMap((combo) => combo.split(' ')).map((k, i) => (
                    <Kbd key={`${i}-${k}`}>{k}</Kbd>
                  ))}
                </dt>
                <dd className={s.keyLabel}>{r.label}</dd>
              </Tile>
            ))}
            <Tile>
              <dt className={s.keyKeys}>
                <Kbd>{CUSTOMIZE_KEY}</Kbd>
              </dt>
              <dd className={s.keyLabel}>{t('customize.key')}</dd>
            </Tile>
          </dl>
          <Tile plain layout="center">
            <Button variant="secondary" icon="command" onPress={() => openShortcutsSheet()}>
              {t('keys.all')}
            </Button>
          </Tile>
        </div>
      </div>
    </Widget>
  );
}
