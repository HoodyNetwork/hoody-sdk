// The kit ProjectPicker and ProgramPicker in the gallery (/_kit?tab=pieces), and a picker as a form field
// (PickerField: visible label, help, error). kit3.tsx mounts it, beside the computer picker.
import { useMemo, useState } from 'react';
import { TextButton } from '../controls/Link';
import { Row } from '../layouts/Stack';
import { Panel } from '../layouts/Layouts';
import { PickerField } from '../pickers/PickerField';
import { ProgramPicker, type ProgramChoice } from '../pickers/ProgramPicker';
import { ProjectPicker, type ProjectChoice } from '../pickers/ProjectPicker';
import { useStrings } from '../strings';
import strings from './projectProgramPicker.strings.en.json';

// Made-up samples (gallery only): names are sample data, the words come from the strings file.
type T = ReturnType<typeof useStrings<typeof strings>>;
const projectsOf = (t: T): ProjectChoice[] => [
  { id: 'home', name: 'Home base', color: 'var(--hx-r-teal)', facts: t('computers', { count: 3 }) },
  { id: 'acme', name: 'Acme storefront', color: 'var(--hx-r-orange)', facts: t('computers', { count: 2 }) },
  { id: 'lab', name: 'Experiments', color: 'var(--hx-r-purple)', facts: t('computers', { count: 1 }) },
  { id: 'old', name: 'Archive', disabledReason: t('notInRealm') },
];
const programsOf = (t: T): ProgramChoice[] => [
  { id: 'web', name: 'web', group: t('groupYours'), running: true, state: t('running') },
  { id: 'api', name: 'api', group: t('groupYours'), running: false, state: t('stopped') },
  { id: 'sshd', name: 'sshd', group: t('groupSystem'), running: true, state: t('running') },
];

export function ProjectProgramPickerPieces() {
  const t = useStrings(strings);
  const PROJECTS = useMemo(() => projectsOf(t), [t]);
  const PROGRAMS = useMemo(() => programsOf(t), [t]);
  const [project, setProject] = useState<string | undefined>('home');
  const [program, setProgram] = useState<string | undefined>('web');
  const [field, setField] = useState<string | undefined>(undefined);
  return (
    <Panel title={t('title')}>
      <Row gap={4} wrap align="start">
        <ProjectPicker label={t('project')} projects={PROJECTS} value={project} onChange={setProject} />
        <ProgramPicker label={t('program')} programs={PROGRAMS} value={program} onChange={setProgram} />
        <PickerField label={t('field')} description={t('fieldHelp')} errorMessage={field ? undefined : t('fieldError')}>
          <ProjectPicker label={t('field')} projects={PROJECTS} value={field} onChange={setField} renderCreate={() => <TextButton>{t('newProject')}</TextButton>} />
        </PickerField>
      </Row>
    </Panel>
  );
}
