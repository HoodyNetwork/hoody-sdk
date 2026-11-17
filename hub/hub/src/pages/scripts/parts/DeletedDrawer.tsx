// Recently deleted: scripts the computer still keeps, with the day each is removed for good. Restore puts the
// script back as a new file; it is off while the address is taken now.
import { useEffect, useRef } from 'react';
import { Button, ComputerLink, Drawer, EmptyState, formatDateTime, showToast, useStrings } from '@kit';
import { useRestore } from '../data';
import { addressText, newOpId, restoreBlock } from '../logic';
import strings from '../strings.en.json';
import type { CompScripts } from '../types';
import { ChangeBanner } from './Bits';
import { forScript, readBackOf, useChange } from './ops';
import { sentOf, useOpCheck } from './opcheck';
import s from './parts.module.css';

const rand = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

export function DeletedDrawer({ isOpen, comps, onClose, onRestored }: { isOpen: boolean; comps: CompScripts[]; onClose: () => void; onRestored: () => unknown }) {
  const t = useStrings(strings);
  const restore = useRestore();
  // Check again of a restore: the computer's own answer for its op first, then a fresh read of the deleted list.
  const op = useOpCheck();
  const rows = comps.flatMap((c) => (c.deleted ?? []).map((d) => ({ c, d })));
  // The drawer shows these deleted scripts (each on its computer): only a restore hold of one of them, sent on that computer, shows here.
  // The banner and the holds it shows belong to the computers listed (the change's scope): a drawer shown another computer drops them,
  // so its warned close frees only what its own banner shows, and a hold still held shows again when its computer returns.
  const listed = new Set(rows.map((r) => `${r.c.id}\u0000${r.d.path}`));
  const mine = forScript(restore, (row) => !!row.identity && typeof row.identity === 'object' && !!row.target && listed.has(`${row.target.container.id}\u0000${String((row.identity as { path?: unknown }).path)}`));
  const scope = comps.map((c) => c.id).join('\u0000');
  const change = useChange(scope, mine);
  const list = useRef<HTMLUListElement>(null);
  const empty = useRef<HTMLDivElement>(null);
  const after = useRef<number | null>(null);
  // A restored row leaves the list; keep the keyboard place: next row, else previous, else the empty state.
  useEffect(() => {
    const at = after.current;
    if (at === null || change.locked) return;
    after.current = null;
    const live = [...(list.current?.querySelectorAll<HTMLButtonElement>('li button:not([disabled])') ?? [])];
    (live[at] ?? live[live.length - 1] ?? empty.current)?.focus();
  }, [rows.length, change.locked]);
  const taken = (c: CompScripts, path: string) => c.rows.some((r) => r.path === path);

  return (
    <Drawer resizeKey="scripts-deleted-drawer" isOpen={isOpen} onOpenChange={(o) => !o && onClose()} title={t('deleted.title')} subtitle={t('deleted.body')} size="md">
      <ChangeBanner out={change.out} what="restore" onDismiss={change.settle} onCheck={() => op.checkWith(scope, change.settle, () => readBackOf(change.settle, mine), () => { onRestored(); showToast({ title: t('code.restored'), tone: 'ok' }); })} onForce={change.force} />
      {rows.length === 0 ? (
        <div ref={empty} tabIndex={-1}>
          <EmptyState size="sm" icon="trash" title={t('deleted.empty')} />
        </div>
      ) : (
        <ul ref={list} className={s.versionList}>
          {rows.map(({ c, d }, i) => (
            <li key={`${c.id}${d.path}`}>
              <span>
                <span className={s.mono}>{addressText(d.path)}</span> <span className={s.faint}><ComputerLink handle={c.handle} name={c.name} /> · {t('deleted.until', { when: formatDateTime(d.retainedUntil) })}</span>
              </span>
              <Button
                size="sm"
                isDisabled={taken(c, d.path) || change.locked || restoreBlock(c, d.path) !== null}
                onPress={() => {
                  after.current = [...(list.current?.querySelectorAll('li') ?? [])].slice(0, i).filter((li) => li.querySelector('button:not([disabled])')).length;
                  const opId = newOpId(rand);
                  void change.run(() => restore.mutateAsync({ compId: c.id, path: d.path, version: d.version, ifRevision: null, opId })).then((r) => {
                    op.remember(sentOf(restore, { compId: c.id, path: d.path, opId, vars: { compId: c.id, path: d.path } }, r), scope);
                    if (r?.outcome === 'done') {
                      onRestored();
                      showToast({ title: t('code.restored'), tone: 'ok' });
                    } else after.current = null;
                  });
                }}
              >
                {taken(c, d.path) ? t('deleted.exists') : t('versions.restore')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
