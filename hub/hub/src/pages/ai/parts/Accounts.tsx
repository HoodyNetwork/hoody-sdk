// Accounts: one row per provider this computer can use. The row's menu holds what its kind can do; Test
// shows its result in the row's status cell for 8 seconds; Disconnect and Replace key open their overlays.
import { Button, createColumnHelper, DataTable, EmptyState, ErrorState, ProviderMark, StatusPill, useDataView, useStrings, type MenuEntry } from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { testKey } from '../flows-key';
import { actionsFor, connectsKey, tk, usedBy, type Account } from '../logic';
import { errorText } from '../words';
import strings from '../strings.en.json';
import { useAi } from './ctx';
import s from './parts.module.css';

const col = createColumnHelper<Account>();
const SHOW_MS = 8000;

type Test = { kind: 'valid' | 'invalid' | 'inconclusive' | 'none' | 'testing'; text?: string };

export function AccountsSection({ onEdit, onDisconnect, onReplace }: { onEdit: (a: Account) => void; onDisconnect: (a: Account) => void; onReplace: (a: Account) => void }) {
  const t = useStrings(strings);
  const { m, api, reload, connect } = useAi();
  const [tests, setTests] = useState<Record<string, Test>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const live = timers.current;
    return () => Object.values(live).forEach(clearTimeout);
  }, []);

  // An account that is gone (signed out elsewhere) leaves no test result behind.
  useEffect(() => {
    const ids = new Set((m.accounts ?? []).map((a) => a.id));
    setTests((x) => (Object.keys(x).every((k) => ids.has(k)) ? x : Object.fromEntries(Object.entries(x).filter(([k]) => ids.has(k)))));
  }, [m.accounts]);

  const run = async (a: Account) => {
    setTests((x) => ({ ...x, [a.id]: { kind: 'testing' } }));
    const r = await testKey(api, a.id);
    if (r.stale) return;
    const next: Test = r.check ? { kind: r.check } : { kind: 'none', text: r.err ? errorText(r.err, { provider: a.label }).text : undefined };
    setTests((x) => ({ ...x, [a.id]: next }));
    clearTimeout(timers.current[a.id]);
    timers.current[a.id] = setTimeout(() => setTests((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== a.id))), SHOW_MS);
  };

  const columns = useMemo(
    () => [
      col.accessor('label', {
        id: 'provider',
        header: t('acc.provider'),
        cell: (c) => (
          <span className={s.provider}>
            <ProviderMark id={c.row.original.id} name={c.getValue()} />
            <span className={s.truncate}>{c.getValue()}</span>
          </span>
        ),
      }),
      // minWidth (kit: the column's floor; spare room goes to the flexible columns, so the floor is all this column is
      // sure to get): the longest label, page.accExternal "Key set outside Hoody", with the cell's 24px padding is 158px
      // in the page spec's browser and 170px in DejaVu Sans, the system-ui fallback when no Geist is installed (the Hub
      // ships no font file), so 172.
      col.display({ id: 'how', header: t('acc.how'), meta: { minWidth: 172 }, cell: (c) => tk(connectsKey(c.row.original)) }),
      col.display({
        id: 'status',
        header: t('acc.status'),
        cell: (c) => {
          const a = c.row.original;
          const test = tests[a.id];
          if (test) {
            if (test.kind === 'testing') return <StatusPill tone="info">{t('acc.testing')}</StatusPill>;
            if (test.kind === 'valid') return <StatusPill tone="ok" dot>{t('acc.testValid')}</StatusPill>;
            if (test.kind === 'invalid') return <StatusPill tone="danger" dot>{t('acc.testInvalid')}</StatusPill>;
            if (test.kind === 'inconclusive') return <StatusPill tone="warn" dot>{t('acc.testInconclusive')}</StatusPill>;
            // A provider's own sentence: plain warn text, never a (capitalised) status pill.
            return test.text ? <span className={s.warnText}>{test.text}</span> : <StatusPill tone="warn" dot>{t('acc.testNone')}</StatusPill>;
          }
          return a.ready ? <StatusPill tone="ok" dot>{t('acc.ready')}</StatusPill> : <StatusPill tone="warn" icon="warn">{t('acc.noKey')}</StatusPill>;
        },
      }),
      col.display({
        id: 'used',
        header: t('acc.used'),
        // Its header (76px) and words need less than the kit's 120: "Not known" is 89px with the padding in the page
        // spec's browser and 93.5px in DejaVu Sans, "9999 Bots" 90px in DejaVu, so 96. That leaves room for the wider how
        // column: the four columns and the 44px ⋯ need 552px, so none is dropped in the 562px the table has at 900 wide.
        // Only a five-digit count would be cut, far past any Bot count.
        meta: { minWidth: 96 },
        cell: (c) => {
          const n = usedBy(c.row.original, m.defaults, m.bots);
          return m.bots ? t('acc.usedBots', { count: n }) : t('acc.usedUnknown');
        },
      }),
    ],
    [t, tests, m.defaults, m.bots],
  );

  const menu = (a: Account): MenuEntry[] =>
    actionsFor(a).map((x) => ({
      id: x,
      label: t(`acc.act.${x}` as never),
      icon: x === 'edit' ? 'pen' : x === 'replace' ? 'key' : x === 'test' ? 'check-circle' : 'trash',
      tone: x === 'disconnect' ? 'danger' : 'default',
      onAction: () => (x === 'edit' ? onEdit(a) : x === 'replace' ? onReplace(a) : x === 'test' ? void run(a) : onDisconnect(a)),
    }));

  const load = m.loads.accounts;
  const rows = m.accounts ?? undefined;
  const lonely = rows && rows.every((a) => a.id === 'hoody-ai');
  const view = useDataView({ rows, columns, getRowId: (x: Account) => x.id, search: ['provider'], param: 'acc', isLoading: load === 'loading', error: load === 'error' ? load : undefined });
  if (load === 'error') return <ErrorState size="compact" title={t('acc.loadFailed')} onRetry={reload} />;
  return (
    <div className={s.stack}>
      <DataTable
        label={t('acc.title')}
        columns={columns}
        view={view}
        onRefresh={reload}
        actions={menu}
        noViewMenu
        presentation="auto"
        empty={<EmptyState size="sm" icon="key" title={t('acc.emptyTitle')} body={t('acc.emptyBody')} action={<Button variant="secondary" onPress={() => connect()}>{t('connect.open')}</Button>} />}
        countLabel={(n) => t('acc.count', { count: n })}
      />
      {lonely && (
        <p className={`${s.muted} ${s.small}`}>
          {t('acc.lonely')}
        </p>
      )}
    </div>
  );
}
