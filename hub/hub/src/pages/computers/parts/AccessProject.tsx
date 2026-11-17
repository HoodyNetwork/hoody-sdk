// The project part of a computer's access (Permissions tab, parts/Access.tsx): where the rules come from
// when the computer's project has access rules, and "Use only the project's rules", which removes the computer's own
// document so the project's rules decide alone. This part only shows and asks: the press, the confirm, the DELETE and
// its hold live in Access.tsx, so a hold outlives this part when the rules stop reading as Advanced.
import { AnatomySection, Band, useStrings } from '@kit';
import { useState } from 'react';
import type { Project } from '../types';
import type { AccessRules, OwnState } from './access.logic';
import { RulesSummary } from './AccessDrawer';
import strings from './AccessDrawer.strings.en.json';
import { ProjectPerms } from './ProjectPerms';

export function AccessProject({ doc, project, own, offer, note, busy, isDisabled, onUse }: {
  /** The project's own document as the person was shown it (read in this opening, set: projectFact). */
  doc: AccessRules;
  /** The project row when known (its name, and the Permissions drawer); null: the project is not read here. */
  project: Project | null;
  /** The computer's own document state read in this opening; undefined: not read, failed or older. */
  own: OwnState | undefined;
  /** "Use only the project's rules" is offered: the computer keeps a document of its own and may be changed here. */
  offer: boolean;
  /** What the last press found instead of a confirm. */
  note: 'readFailed' | 'parentChanged' | null;
  busy: boolean;
  isDisabled: boolean;
  onUse: () => void;
}) {
  const t = useStrings(strings);
  const [perms, setPerms] = useState(false);
  const ownKey = own === 'missing' ? 'acc.proj.own.missing' : own === 'default' || own === 'applied' ? 'acc.proj.own.present' : 'acc.proj.own.unknown';
  return (
    <>
      <AnatomySection
        id="acc-project"
        title={t('acc.proj.title')}
        description={project ? t('acc.proj.body', { project: project.name }) : t('acc.proj.bodyNoName')}
        // Whether the computer keeps rules of its own beside the project's.
        note={t(ownKey)}
        {...(project ? { actions: { secondary: [{ id: 'open-permissions', label: t('acc.proj.open'), opens: 'dialog' as const, onPress: () => setPerms(true) }] } } : {})}
      />
      {offer ? (
        <AnatomySection
          id="acc-project-use"
          title={t('acc.proj.use.title')}
          description={t('acc.proj.use.body')}
          // While a read or a change is out the offer does nothing: busy for its own read, else with the reason.
          actions={{ secondary: [{ id: 'use-project', label: t('acc.proj.use.go'), opens: 'dialog' as const, busy, onPress: () => { if (!isDisabled) onUse(); }, ...(isDisabled && !busy ? { disabledReason: t('acc.change.busy') } : {}) }] }}
          notices={note ? <Band size="table" /* noDetails: what the press found (the rules were read again), not a rejection */>{t(`acc.proj.${note === 'parentChanged' ? 'parentChanged' : 'use.readFailed'}`)}</Band> : null}
        >
          {/* Read straight from the project's document (no AI), as the person was shown it. */}
          <RulesSummary rules={doc} project="no" subject="project" />
        </AnatomySection>
      ) : null}
      {project ? <ProjectPerms project={perms ? project : null} tab="rules" onClose={() => setPerms(false)} /> : null}
    </>
  );
}
