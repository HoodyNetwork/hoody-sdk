// Step 3 of the idea way, "Fill it in": the idea's own fields. Their labels never say
// "address" (the script's address was chosen in step 2), and the key the idea makes is named. Skipped by the flow when
// the idea has no fields.
import { AnatomySection, TextField, useStrings } from '@kit';
import type { Template } from '../logic';
import strings from '../strings.en.json';

/** The fields are the idea's own list, built into the page and never read: the step is ready by construction. */
const READY = { kind: 'ready' } as const;

export interface StepFillProps {
  idea: Template;
  values: Record<string, string>;
  onValue: (name: string, v: string) => void;
  /** Continue was pressed with a field empty. */
  missing: boolean;
  onSubmit: () => void;
}

/** The idea's fields still empty (trimmed). */
export const emptyFields = (idea: Template, values: Record<string, string>): string[] => idea.plain.filter((v) => !(values[v] ?? '').trim());

export function StepFill(p: StepFillProps) {
  const t = useStrings(strings);
  const empty = emptyFields(p.idea, p.values);
  return (
    <AnatomySection id="new-fill" title={t('flow.fill.title')} description={t('flow.fill.lead')} note={t('flow.fill.key')} state={READY}>
      {p.idea.plain.map((v) => (
        <TextField
          key={v}
          label={t(`var.${v}` as never)}
          value={p.values[v] ?? ''}
          onChange={(x) => p.onValue(v, x)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); p.onSubmit(); } }}
          errorMessage={p.missing && empty.includes(v) ? t('flow.fill.empty') : undefined}
        />
      ))}
    </AnatomySection>
  );
}
