// EnvRows in the terminal: the legend, the help, one row per variable (name field, masked value through SecretInput,
// Remove), the caller's error line, then Add. The Form lock (useFieldLock) also holds Add and Remove. A value is never
// written anywhere but its own masked input.
import type * as Web from './EnvRows';
import { Box, Text } from '../../term/prim';
import { Button, IconButton } from '../controls/Button';
import { SecretInput } from './Secret';
import { TextField } from './fields';
import { useFieldLock } from './lock';

export type { EnvRow, EnvRowsProps } from './EnvRows';

export const EnvRows: typeof Web.EnvRows = ({ rows, onEdit, onRemove, onAdd, helpBelow, labels, isDisabled, ...words }) => {
  const legend = words.label ?? words.legend;
  const help = words.description ?? words.help;
  const error = words.errorMessage ?? words.error;
  const locked = useFieldLock(isDisabled);
  const held = isDisabled ? { isDisabled: true } : {};
  return (
    <Box dir="column" shrink={0} gap={0}>
      <Text bold>{legend}</Text>
      {!helpBelow && <Text colour="muted">{help}</Text>}
      {rows.map((r, i) => (
        <Box key={r.id} dir="row" gap={1} align="start">
          <Box grow={1} basis={0} minWidth={12}>
            <TextField aria-label={labels.key(i + 1)} value={r.key} onChange={(v) => onEdit(r.id, { key: v })} placeholder={labels.keyHint} mono {...held} />
          </Box>
          <Text colour="faint">=</Text>
          <Box grow={2} basis={0} minWidth={12}>
            <SecretInput aria-label={labels.value(i + 1)} value={r.value} onChange={(v) => onEdit(r.id, { value: v })} placeholder={labels.valueHint} {...held} />
          </Box>
          <IconButton icon="trash" size="sm" variant="ghost" label={labels.remove(i + 1)} isDisabled={locked} onPress={() => !locked && onRemove(r.id)} />
        </Box>
      ))}
      {helpBelow && <Text colour="muted">{help}</Text>}
      {error ? <Text colour="danger">✗ {error}</Text> : null}
      <Box dir="row">
        <Button size="sm" isDisabled={locked} onPress={() => !locked && onAdd()}>{labels.add}</Button>
      </Box>
    </Box>
  );
};
