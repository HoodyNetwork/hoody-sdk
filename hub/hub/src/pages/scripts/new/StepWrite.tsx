// Step 3 of the write-it-myself way, "Write the code": the editor is the step.
// The next step checks the exact bytes.
import { AnatomySection, Band, CodeEditor, useStrings } from '@kit';
import type { ReactNode } from 'react';
import strings from '../strings.en.json';
import s from '../parts/parts.module.css';
import { wroteSomething } from './StepWrite.pure';
export { STARTER, wroteSomething } from './StepWrite.pure';

export interface StepWriteProps {
  code: string;
  onCode: (v: string) => void;
  /** Continue was pressed on the starter. */
  missing: boolean;
  /** The Script settings disclosure. */
  settings?: ReactNode;
}

export function StepWrite(p: StepWriteProps) {
  const t = useStrings(strings);
  return (
    <AnatomySection id="new-write" title={t('flow.write.title')} description={t('flow.write.lead')}>
      <CodeEditor label={t('new.code')} value={p.code} onChange={p.onCode} rows={18} lang="ts" className={s.editor} />
      {p.missing && !wroteSomething(p.code) ? <Band tone="danger" size="table" /* noDetails: the page's own check, Continue needs code of its own; nothing was sent */>{t('flow.write.missing')}</Band> : null}
      {p.settings}
    </AnatomySection>
  );
}
