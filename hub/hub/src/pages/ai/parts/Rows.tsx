// A setting row (label, hint, value, actions) and the small chips the page repeats.
import { SettingRow as KitSettingRow } from '@kit';
import type { ReactNode } from 'react';
import s from './parts.module.css';

/** The kit's setting row (label and help on the start side) with this page's value cluster as its control. */
export function SettingRow({ label, hint, children, note }: { label: string; hint?: ReactNode; children?: ReactNode; note?: ReactNode }) {
  return (
    <KitSettingRow label={label} help={hint} wide>
      <div className={s.settingValue}>{children}</div>
      {note && <div className={s.settingNote}>{note}</div>}
    </KitSettingRow>
  );
}

