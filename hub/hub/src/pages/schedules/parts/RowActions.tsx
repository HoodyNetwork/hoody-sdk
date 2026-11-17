// The actions of one schedule, declared once: the table's hover Run now and ⋯ menu, and the
// inspector's header (Edit, Run now, ⋯) read the same list.
import { Button, type MenuEntry, type RowActionEntry } from '@kit';
import type { ReactNode } from 'react';
import type { SchedRow } from '../logic';
import type { T } from './words';

export interface Handlers {
  onRun: () => void;
  onPause: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onScripts?: () => void;
  /** Absent where this load hides Bots: no Open chat (it would do nothing). */
  onChat?: () => void;
}

// A disabled menu item says why (kit Menu.model): here it is always an earlier change to this row still waiting.
const why = (t: T, held: boolean): { disabledReason?: string } => (held ? { disabledReason: t('op.heldReason') } : {});

/** Every action the schedule offers, in menu order. */
export function rowEntries(t: T, row: SchedRow, held: boolean, h: Handlers): RowActionEntry[] {
  return [
    ...(row.can.run ? [{ id: 'run', label: t('action.runNow'), icon: 'play' as const, hover: true, key: 'r', isDisabled: held, ...why(t, held), onAction: h.onRun }] : []),
    ...(row.can.edit ? [{ id: 'edit', label: t('action.edit'), icon: 'pen' as const, key: 'e', isDisabled: held, ...why(t, held), opens: true, onAction: h.onEdit }] : []),
    ...(row.can.pause ? [{ id: 'pause', label: row.paused ? t('action.turnOn') : t('action.turnOff'), icon: (row.paused ? 'play' : 'pause') as 'play', key: 'p', isDisabled: held, ...why(t, held), onAction: h.onPause }] : []),
    ...(row.can.change && h.onScripts ? [{ id: 'scripts', label: t('action.scripts'), icon: 'external' as const, onAction: h.onScripts }] : []),
    ...(row.can.open && h.onChat ? [{ id: 'chat', label: t('action.chat'), icon: 'agent' as const, onAction: h.onChat }] : []),
    ...(row.can.del ? (['-', { id: 'delete', label: t('action.delete'), icon: 'trash' as const, tone: 'danger' as const, isDisabled: held, ...why(t, held), opens: true, onAction: h.onDelete }] as RowActionEntry[]) : []),
  ];
}

/** The inspector header: Edit and Run now as secondary buttons (the page's one accent is New schedule), the rest in ⋯. */
export function headerParts(t: T, row: SchedRow, held: boolean, h: Omit<Handlers, 'onPause'>): { actions: ReactNode; menu: MenuEntry[] } {
  const menu: MenuEntry[] = [
    ...(row.can.change && h.onScripts ? [{ id: 'scripts', label: t('action.scripts'), icon: 'external' as const, onAction: h.onScripts }] : []),
    ...(row.can.open && h.onChat ? [{ id: 'chat', label: t('action.chat'), icon: 'agent' as const, onAction: h.onChat }] : []),
    ...(row.can.del ? (['-', { id: 'delete', label: t('action.delete'), icon: 'trash' as const, tone: 'danger' as const, isDisabled: held, ...why(t, held), opens: true, onAction: h.onDelete }] as MenuEntry[]) : []),
  ];
  const actions = (
    <>
      {row.can.edit && (
        <Button variant="secondary" isDisabled={held} onPress={h.onEdit}>
          {t('action.edit')}
        </Button>
      )}
      {row.can.run && (
        <Button variant="secondary" isDisabled={held} onPress={h.onRun}>
          {t('action.runNow')}
        </Button>
      )}
    </>
  );
  return { actions, menu };
}
