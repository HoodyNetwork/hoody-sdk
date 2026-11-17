// The project a copied computer goes into (Copy, New computer from a snapshot). The API makes the copy in the shown
// realm and refuses a project that realm does not hold (403 INSUFFICIENT_PERMISSIONS), so the destination is a
// project of the realm's own current list: never the source's project when the list lacks it, and never a guess while
// the list is unread or being read again (a kept answer may be stale). A source project outside the realm waits for a
// pick. In All realms no realm rule applies: the source's own project stays the destination even when the projects
// read (one page) does not list it, and stays offered (as its own option) after another project is picked.
export { realmProject, realmRefused } from './ProjectPick.pure';
export type { ProjectState, RealmProject } from './ProjectPick.pure';
import type { RealmProject } from './ProjectPick.pure';
import { Band, ErrorState, PickerField, ProjectPicker, TextButton, useStrings, type ProjectChoice } from '@kit';
import { computerColor } from '../logic';
import strings from '../strings.en.json';
import s from './parts.module.css';

/** The project field and its states: the picker (always when a pick is owed), no project, unread with Retry, loading.
 *  With onNewProject, "no project" and the picker's last stop offer making one (inRealm: "New project in this realm",
 *  else "New project"; each label its own Hub string). */
export function ProjectPick({ pick, onChange, onRetry, error, outsideText, noneText, sameText, onNewProject, inRealm }: {
  pick: RealmProject;
  onChange: (id: string) => void;
  onRetry?: () => void;
  error?: unknown;
  /** Shown while a pick is owed because the source's own project is not in the shown realm; any other owed pick (a
   *  picked project that dropped off the list) gets the neutral projpick.owed. */
  outsideText: string;
  noneText: string;
  /** The label of the source's own project when the read does not list it (All realms). */
  sameText: string;
  onNewProject?: () => void;
  /** The shown realm is one realm (not All realms): the offer names it. */
  inRealm?: boolean;
}) {
  const t = useStrings(strings);
  const { listed, dest, state, own, outside } = pick;
  const newProject = !onNewProject ? undefined : inRealm ? <TextButton onPress={onNewProject}>{t('create.newProject')}</TextButton> : <TextButton onPress={onNewProject}>{t('proj.new')}</TextButton>;
  // The kit picker shows only the rows given: the source's own project (All realms, unlisted) is one more row.
  const choices: ProjectChoice[] = [...listed.map((p) => ({ id: p.id, name: p.name, color: computerColor(p) ?? undefined })), ...(own ? [{ id: own, name: sameText }] : [])];
  return (
    <>
      {choices.length > 1 || state === 'pick' ? (
        <PickerField label={t('field.project')} errorMessage={state !== 'pick' ? undefined : outside ? outsideText : t('projpick.owed')}>
          <ProjectPicker label={t('field.project')} projects={choices} value={dest || undefined} onChange={onChange} renderCreate={newProject ? () => newProject : undefined} />
        </PickerField>
      ) : null}
      {state === 'none' ? (
        <Band tone="warn" actions={newProject} /* noDetails: an empty projects list is what the realm holds, not a rejection; no error to show */>{noneText}</Band>
      ) : state === 'unread' ? (
        <ErrorState size="compact" error={error} title={t('create.projectsFail')} onRetry={onRetry} />
      ) : state === 'loading' ? (
        <p className={s.help} role="status" /* one-line hint while the projects list loads: nothing to retry or check yet */>{t('create.projectsLoading')}</p>
      ) : null}
    </>
  );
}

/** The note under the form after a realm's refusal (realmRefused): which rules it may be. The footer keeps the refusal
 *  itself, with its Details. */
export function RealmRefusedNote({ text }: { text: string }) {
  return <Band tone="warn" /* noDetails: the footer right below shows this refusal with its Details */>{text}</Band>;
}
