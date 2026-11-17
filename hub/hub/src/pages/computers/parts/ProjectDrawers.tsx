// Make, rename and delete a project. Only an empty project can be deleted: the API refuses one that still holds
// computers, and the dialog reads the API's own count first (again just before sending) so it can say why.
// Each change is sent once and shows its C9 outcome; one whose answer was lost is read back, never sent again.
// Delete also names the people the project is shared with: they lose what its membership gave them.
import { useCan, useCore } from '@core';
import { Button, ColorPicker, ConfirmDialog, Drawer, FormFooter, normalizeHexColor, randomPresetColor, Stack, TextField, useStrings } from '@kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { countProjectComputers, PROJECT_READ_MS, projectGone, readRosterAll, useCreateProject, useMembers, useRemoveProject, useUpdateProject } from '../data';
import strings from '../strings.en.json';
import type { Project } from '../types';
import { Held } from './Held';
import { myLevel, peopleOf, rosterWhole } from './projectPerms.logic';
import { refusal, useRunner } from './runner';
import s from './parts.module.css';

const MAX_NAME = 100;
const TAKEN = 'DUPLICATE_ALIAS';
const NOT_EMPTY = 'PROJECT_HAS_COMPUTERS';
/** Names the delete dialog spells out before "and N more". */
const NAMES_SHOWN = 5;

/** `project` null: a new project; a project: rename it (and change its colour). */
export function ProjectDrawer({ isOpen, project, projects, onClose, onDone }: { isOpen: boolean; project: Project | null; projects: Project[] | undefined; onClose: () => void; onDone: () => void }) {
  const t = useStrings(strings);
  const id = project?.id ?? '';
  const create = useRunner(useCreateProject(), { lock: 'project.create', change: 'projectCreate', vars: (i) => ({ name: String(i.name ?? ''), color: '' }) });
  const update = useRunner(useUpdateProject(), {
    lock: 'project.update',
    change: 'projectUpdate',
    pick: useCallback((i: Record<string, unknown>) => i.project === id, [id]),
    vars: (i) => ({ id: String(i.project ?? ''), name: String(i.name ?? ''), color: String(i.color ?? '') }),
  });
  const run = project ? update : create;
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [taken, setTaken] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setName(project?.name ?? '');
    setColor(normalizeHexColor(project?.color ?? '') ?? randomPresetColor());
    setTaken(false);
    run.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, id]);
  const clean = name.trim();
  const hex = normalizeHexColor(color);
  const dupe = taken || (clean !== '' && (projects ?? []).some((p) => p.id !== id && p.name === clean));
  const tooLong = clean.length > MAX_NAME;
  const unchanged = project !== null && clean === project.name && hex === normalizeHexColor(project.color ?? '');
  const valid = clean !== '' && !tooLong && !dupe && hex !== null && !unchanged;
  const held = run.held;
  const nameRefused = run.outcome?.kind === 'failed' && run.outcome.code === TAKEN;
  // Make project / Save is off while the name is empty or the colour is no hex code: the footer says which (a taken or
  // too long name shows at the Name field).
  const need = held || run.busy ? undefined : clean === '' ? t('projd.needName') : hex === null ? t('projd.needColor') : undefined;
  /** Save / Create, from the footer button and from Enter in the Name field: the same send, under the same refusals. */
  const submit = () => {
    if (!valid || held || run.busy || !hex) return;
    const sent = project ? update.run({ id: project.id, name: clean, color: hex }) : create.run({ name: clean, color: hex });
    void sent.then((r) => {
      if (r.outcome === 'done') {
        onDone();
        onClose();
      } else if (r.outcome === 'failed' && r.code === TAKEN) setTaken(true);
    });
  };
  return (
    <Drawer overlayId="computers-project" resizeKey="computers-project"
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={project ? t('projd.editTitle', { name: project.name }) : t('projd.newTitle')}
      subtitle={t('projd.lede')}
      size="sm"
      dirty={!held && (project ? !unchanged : clean !== '')}
      footer={
        <FormFooter
          dirty={valid && !held}
          submitDisabled={held !== null}
          busy={run.busy}
          // A name taken on the server is said in the page's words, and only until the name is edited (the field says it too).
          outcome={held || (nameRefused && !taken) ? undefined : run.outcome}
          error={refusal(run.outcome)}
          failedDetail={nameRefused ? t('projd.nameTaken') : undefined}
          reason={need}
          onCheck={async () => { await run.check(); onDone(); }}
          submitLabel={project ? t('projd.save') : t('projd.create')}
          onSubmit={submit}
        />
      }
    >
      {held ? (
        <Held
          kind={project ? 'projectUpdate' : 'projectCreate'}
          name={String(held.name ?? '')}
          elsewhere={run.elsewhere}
          onCheck={async () => { await run.check(); onDone(); }}
          onDismiss={run.dismiss}
        />
      ) : (
        <Stack gap={3}>
          <TextField
            label={t('projd.name')}
            value={name}
            onChange={(v) => {
              setName(v);
              setTaken(false);
            }}
            // Enter saves, as the footer button does (the footer sits outside the fields, so no form submits for it).
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
            description={t('projd.nameHelp')}
            errorMessage={dupe ? t('projd.nameTaken') : tooLong ? t('projd.nameLong') : undefined}
            focusOnError
          />
          {/* A new project's realm note rides the last field's description: a drawer holds no loose text. */}
          <ColorPicker label={t('projd.color')} value={color} onChange={setColor} description={project ? t('projd.colorHelp') : [t('projd.colorHelp'), t('projd.realmNote')].join(' ')} />
        </Stack>
      )}
    </Drawer>
  );
}

type Count = { state: 'checking' } | { state: 'known'; n: number } | { state: 'unknown' };

export function DeleteProject({ project, onClose, onDone }: { project: Project | null; onClose: () => void; onDone: () => void }) {
  const t = useStrings(strings);
  const id = project?.id ?? '';
  const remove = useRunner(useRemoveProject(), {
    lock: 'project.remove',
    change: 'projectRemove',
    pick: useCallback((i: Record<string, unknown>) => i.project === id, [id]),
    vars: (i) => ({ id: String(i.project ?? '') }),
  });
  const [count, setCount] = useState<Count>({ state: 'checking' });
  const [sending, setSending] = useState(false);
  // Who loses access: the project's people, the same read as the Permissions column. A key session reads
  // none; a read that failed or is paused offline adds nothing and blocks nothing (the API removes them either way).
  const roster = useMembers(project ?? undefined, useCan('account') && project !== null);
  const people = roster.data && !roster.isError && roster.fetchStatus !== 'paused' ? peopleOf(roster.data) : [];
  // A Full control member gets this same counted dialog: a member reads the project's computers
  // too (the API's own rule). What changes for them: a refusal says to ask the owner, a
  // count that can't be read adds that line, and their own level is read again when they press Delete. The level is
  // the list as it reads now, on every render: a known level below Full control offers no Delete; the
  // owner, or a level not known, keeps the dialog as it was. The API's own refusal is the real boundary.
  const uid = useCore().account;
  const rosterNow = roster.data && !roster.isError && roster.fetchStatus !== 'paused' ? roster.data : null;
  const level = project ? myLevel(project, rosterNow, uid) : 'unknown';
  const member = level === 'delete';
  const demoted = level === 'read' || level === 'edit';
  // What the press-time read found, shown only until the list is read again: a newer read decides again. Stamped
  // with the list's read when the finding arrives, so a read made while the press read was out never hides it.
  const readAt = rosterNow ? roster.dataUpdatedAt : 0;
  const readAtNow = useRef(readAt);
  readAtNow.current = readAt;
  const [levelNote, setLevelNote] = useState<{ note: 'pp.del.memberMoved' | 'pp.del.memberUnread'; at: number } | null>(null);
  const note = levelNote && levelNote.at === readAt ? levelNote.note : '';
  const [checking, setChecking] = useState(false);
  // The one gate before DELETE reads this: the level as the list reads at that moment, never the press's.
  const levelNow = useRef(level);
  levelNow.current = level;
  // The hold token of a lost delete whose Check again found the project still there, in this opening: the warned
  // Dismiss is offered only while the band shows that same send. Before any read it would free the hold with
  // nothing known; after a read showing the project, a second DELETE can only delete this same project (the API
  // refuses it while it holds computers). A later send, or a later read that did not answer, needs its own read.
  const [stillThere, setStillThere] = useState<string | null>(null);
  // The API refused: the project still holds computers. 'listed' when a count after the refusal shows them (or
  // cannot tell); 'hidden' when it shows none: moved or deleted since, or ones this account cannot list. The zero
  // proves neither, so the text says both and sends the person back through a fresh count.
  const [refused, setRefused] = useState<'' | 'listed' | 'hidden'>('');
  // Only the latest count of this opening counts: a late answer of an earlier one (another project, an earlier
  // opening, a count overtaken by a newer one) changes nothing and reads as unknown to its caller.
  const latest = useRef(0);
  const recount = useCallback(async (): Promise<Count> => {
    const mine = ++latest.current;
    if (!id) return { state: 'unknown' };
    setCount({ state: 'checking' });
    const n = await countProjectComputers(id);
    if (mine !== latest.current) return { state: 'unknown' };
    const c: Count = n === null ? { state: 'unknown' } : { state: 'known', n };
    setCount(c);
    return c;
  }, [id]);
  // Which opening of the dialog this is: a check started in an earlier one may still end its own hold, but never
  // closes the dialog now open (for another project, or this one opened again).
  const opening = useRef(0);
  // Leaving the view ends every count of this opening: a count that answers after that sends nothing.
  useEffect(() => () => { latest.current++; opening.current++; }, []);
  useEffect(() => {
    opening.current++;
    if (!project) {
      latest.current++;
      return;
    }
    remove.reset();
    setRefused('');
    setStillThere(null);
    setLevelNote(null);
    void recount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // Check again on a lost answer: reads the project itself on the base host; only its 404 frees the hold (and
  // closes the dialog). A project still there, or a read that did not answer, keeps it held: nothing is resent.
  const check = async () => {
    const mine = opening.current;
    const hold = remove.hold ?? null;
    let seen: boolean | null = null;
    if (await remove.prove(async () => (seen = await projectGone(id)) === true)) {
      onDone();
      if (mine === opening.current) onClose();
    } else if (mine === opening.current) setStillThere(seen === false ? hold : null);
  };
  const thereNow = stillThere !== null && stillThere === remove.hold;
  const name = project?.name ?? '';
  const empty = count.state === 'known' && count.n === 0;
  const names = people.slice(0, NAMES_SHOWN).map((m) => m.name || t('pp.people.unnamed')).join(', ');
  const losers =
    people.length > 0 && roster.data
      ? t(rosterWhole(roster.data) ? 'pp.del.people' : 'pp.del.peopleAtLeast', {
          count: people.length,
          names: people.length > NAMES_SHOWN ? t('pp.del.peopleMore', { names, count: people.length - NAMES_SHOWN }) : names,
        })
      : null;
  const state = remove.held ? (
    <span className={s.stack}>
      <Held kind="projectRemove" name={name} elsewhere={remove.elsewhere} onCheck={check} onDismiss={thereNow ? remove.dismiss : undefined} />
      {thereNow && !remove.elsewhere && <span>{t('held.projectThere', { name })}</span>}
    </span>
  ) : demoted ? (
    t('pp.del.memberMoved')
  ) : member && note ? (
    t(note)
  ) : member && refused ? (
    t('pp.del.memberHas')
  ) : refused ? (
    t(refused === 'hidden' ? 'projx.hidden' : 'projx.refused', { name })
  ) : count.state === 'checking' ? (
    t('projx.checking', { name })
  ) : count.state === 'unknown' ? (
    <span className={s.stack}>
      <span>{t('projx.unknown', { name })}</span>
      {member ? <span>{t('pp.del.memberAsk')}</span> : null}
      <span>
        <Button size="sm" variant="secondary" onPress={() => void recount()}>{t('held.check')}</Button>
      </span>
    </span>
  ) : count.n > 0 ? (
    t('projx.has', { name, count: count.n })
  ) : (
    t('projx.body', { name })
  );
  const body =
    losers && !remove.held ? (
      <span className={s.stack}>
        <span>{state}</span>
        <span>{losers}</span>
      </span>
    ) : (
      state
    );
  return (
    <ConfirmDialog overlayId="computers-project-delete"
      isOpen={project !== null}
      onOpenChange={(o) => !o && onClose()}
      tone="danger"
      title={t('projx.title', { name })}
      body={body}
      confirmLabel={t('projx.go')}
      confirmDisabled={!!remove.held || !empty || refused !== '' || sending || checking || demoted || note === 'pp.del.memberMoved'}
      busy={remove.busy || sending || checking}
      outcome={remove.held || (remove.outcome?.kind === 'failed' && remove.outcome.code === NOT_EMPTY) ? undefined : remove.outcome}
      onCheck={check}
      onConfirm={() => {
        if (member) {
          // The member's own level, read again now through core (every page), bounded like a count: only Full
          // control goes on. No answer in time, or a failed read, sends nothing and leaves the dialog to try again.
          if (!project || remove.held || !empty || refused || sending || checking || note === 'pp.del.memberMoved') return;
          setChecking(true);
          setLevelNote(null);
          const op = opening.current;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const late = new Promise<{ kind: 'failed' }>((done) => (timer = setTimeout(() => done({ kind: 'failed' }), PROJECT_READ_MS)));
          void Promise.race([readRosterAll(project.id, project.owner), late])
            .then((r) => {
              if (op !== opening.current) return; // closed or opened again since: this press is over
              if (r.kind === 'failed') setLevelNote({ note: 'pp.del.memberUnread', at: readAtNow.current });
              else if (myLevel(project, r.roster, uid) !== 'delete') setLevelNote({ note: 'pp.del.memberMoved', at: readAtNow.current });
              else send();
            })
            .finally(() => {
              clearTimeout(timer);
              setChecking(false);
            });
          return;
        }
        send();
      }}
    />
  );
  function send() {
        if (!project || remove.held || !empty || refused || sending) return;
        // Counted again just before sending: a computer made since the dialog opened stops the delete.
        setSending(true);
        const counted = recount();
        // recount took its turn synchronously: anything after it (a newer count, closing, leaving the view) wins.
        const mine = latest.current;
        void counted
          .then((c) => (c.state === 'known' && c.n === 0 && mine === latest.current && mayStill() ? remove.run({ id: project.id }) : null))
          .then((r) => {
            if (r?.outcome === 'done') {
              onDone();
              onClose();
            } else if (r?.outcome === 'failed' && r.code === NOT_EMPTY) {
              // Never sent again on its own: the person moves or deletes the computers, then opens Delete again.
              setRefused('listed');
              void recount().then((c) => {
                if (c.state === 'known' && c.n === 0) setRefused('hidden');
              });
            }
          })
          .finally(() => setSending(false));
  }
  /** The gate right before DELETE: the list as it reads now shows the owner, Full control or no known level.
   *  A level that has dropped meanwhile sends nothing; the dialog already says so. */
  function mayStill() {
    const l = levelNow.current;
    return l === 'owner' || l === 'delete' || l === 'unknown';
  }
}
