// The toolbar's computer control: the kit ComputerPicker over the shell's computers.
// Shown while there is another computer to pick (more than one listed) or while the shell does not know its list yet:
// an unknown list is never read as "no other computer" (C9). Loading: the picker's trigger says so and is disabled.
// Could not be read: the trigger says so and its panel offers the shell's Try again. Listed computers win over a read
// running again. A known list of one or none: nothing.
import { ComputerPicker, type ComputerChoice, type ShellData } from '@kit';
import { computerChoices } from '../pickers';

export interface ComputerPickProps {
  shell: ShellData;
  currentId: string;
  onPick: (id: string) => void;
  t: (k: 'f.computer' | 'pick.running' | 'pick.stopped') => string;
}

export function ComputerPick({ shell, currentId, onPick, t }: ComputerPickProps) {
  if (!shell.setComputer) return null;
  const rows = shell.computers;
  const read = rows.length ? undefined : shell.computersRead;
  if (rows.length <= 1 && !read) return null;
  const realm = shell.realmId === 'all' ? null : shell.realms.find((r) => r.id === shell.realmId) ?? null;
  const computers: ComputerChoice[] | undefined = rows.length ? computerChoices(rows, currentId, realm, t) : undefined;
  return (
    <ComputerPicker
      label={t('f.computer')}
      computers={computers}
      value={currentId}
      onChange={onPick}
      status={read === 'unknown' ? { error: true, onRetry: shell.retryComputers } : undefined}
    />
  );
}
