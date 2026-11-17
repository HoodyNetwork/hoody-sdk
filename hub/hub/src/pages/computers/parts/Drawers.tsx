// Drawers for the smaller edit flows: SSH key, realms (and picking a computer from another realm), copy a computer,
// make an alias.
// Each keeps its form only while open (nothing is kept after close) and shows the C9 outcome in
// its footer; a change whose answer was lost is read back, never sent again.
import { Band, Button, CodeLine, ComputerMark, ConfirmDialog, Drawer, Form, FormFooter, Verdict, Why, IconButton, Notice, PickerPanel, ProjectPicker, PropagatingNote, InlineActions, Select, Row, SettingRow, Stack, SuggestionActions, TextField, useGo, useRenameRealms, useServedPageLink, useStrings, useWipeOn } from '@kit';
import { useCan, useRealms } from '@core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pressBefore, pressRealm, readRealmIds, useAccountComputers, useAliases, useComputers, useCopy, useCreateAlias, useHostRealm, useRemoveAlias, useRuntime, useSetRealms, useSetSshKey, useShownRealm, type CopyVars } from '../data';
import { holdWatch, sameSet, type ShownHold } from './holdWatch';
import { aliasProblem, bucket, computerColor, hasSshKey, maskUrl, offered, sshHost, suggestAliasName, validName } from '../logic';
import { pageFaq } from '../faq';
import { serverOptions } from '../create-logic';
import { checkSshKey, secretLike } from '../ssh-logic';
import strings from '../strings.en.json';
import type { Computer, Project, Realm, Server } from '../types';
import { portUrl } from '../urls';
import { RealmDot } from './Bits';
import { SshKeyHelp } from './SshKeyHelp';
import { Held } from './Held';
import { KIT_PORTS } from './Firewall.logic';
import { aliasSender } from './aliasHold';
import { ProjectPick, RealmRefusedNote, realmProject, realmRefused } from './ProjectPick';
import { refusal, useRunner } from './runner';
import s from './parts.module.css';

interface DrawerProps {
  c: Computer | null;
  onClose: () => void;
  onDone: () => void;
}

const IN_USE = 'SSH_PUBLIC_KEY_IN_USE';

export function SshDrawer({ c, onClose, onDone }: DrawerProps) {
  const t = useStrings(strings);
  const set = useRunner(useSetSshKey(), { lock: 'computer.ssh_key', change: 'sshKey', pick: (i) => i.computer === c?.id, vars: (i) => ({ id: String(i.computer ?? ''), key: null as string | null }) });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [removing, setRemoving] = useState(false);
  // Counts the private keys (and pieces of one) the field refused since the drawer opened on this computer. Each
  // refusal gives the field a new editor, so the refused text goes with its undo; after the first one the field is
  // strict (secretLike).
  const [refusals, setRefusals] = useState(0);
  // A route change, page hide, the lock or the session ending drops what was typed: a private key pasted by mistake
  // is never left in the box.
  useWipeOn(() => {
    setText('');
    setError(undefined);
    setRemoving(false);
  }, c?.id);
  useEffect(() => {
    setText('');
    setError(undefined);
    setRemoving(false);
    setRefusals(0);
    set.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id]);
  const has = c ? hasSshKey(c) : false;

  async function save(key: string | null) {
    if (!c) return;
    if (key !== null) {
      const r = checkSshKey(key);
      if (!r.ok) {
        // A refused text may be a private key pasted by mistake: it does not stay in the box.
        setText('');
        if (r.code === 'private') setRefusals((n) => n + 1);
        setError(t(`ssh.error.${r.code}`));
        return;
      }
    }
    setError(undefined);
    const r = await set.run({ id: c.id, key: key === null ? null : key.trim() });
    if (r.outcome === 'done') {
      onDone();
      onClose();
    } else if (r.outcome === 'failed' && r.code === IN_USE) {
      // The API keeps a key on one computer only: say so at the field, with what to do, not only in the footer.
      setError(t('sshd.inUse'));
    }
  }
  const inUse = set.outcome?.kind === 'failed' && set.outcome.code === IN_USE;

  return (
    <Drawer overlayId="computers-ssh" resizeKey="computers-ssh"
      isOpen={c !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t('sshd.title', { name: c?.name ?? '' })}
      subtitle={t('sshd.lede')}
      size="sm"
      dirty={text.trim() !== '' && !set.held}
      footer={
        <FormFooter
          dirty={(removing || text.trim() !== '') && !set.held}
          submitDisabled={set.held !== null}
          busy={set.busy}
          outcome={set.held || inUse ? undefined : set.outcome}
          error={refusal(set.outcome)}
          onCheck={async () => { const ok = await set.check(); onDone(); if (ok) onClose(); }}
          submitLabel={removing ? t('sshd.removeGo') : has ? t('sshd.replace') : t('sshd.save')}
          onSubmit={() => void save(removing ? null : text)}
        />
      }
    >
      {set.held ? (
        <Held kind="ssh" name={c?.name ?? ''} elsewhere={set.elsewhere} onCheck={async () => { const ok = await set.check(); onDone(); if (ok) onClose(); }} onDismiss={set.dismiss} />
      ) : (
      <div className={s.stack}>
        <Notice>{has ? t('ssh.key.on') : t('sshd.none', { name: c?.name ?? '' })}</Notice>
        <TextField
          key={refusals}
          label={t('sshd.field')}
          multiline
          rows={5}
          mono
          value={text}
          onChange={(v) => {
            // A private key pasted by mistake is refused at once: it never stays on screen until Save. So is a piece
            // of one with no armour words and, once a private key was refused here, anything that does not start as
            // a public key line.
            if (secretLike(v, refusals > 0)) {
              setText('');
              setError(t('ssh.error.private'));
              setRefusals((n) => n + 1);
              return;
            }
            setText(v);
          }}
          description={t('sshd.fieldHelp')}
          errorMessage={error}
          focusOnError
          isDisabled={removing}
          autoComplete="off"
          spellCheck="false"
          {...{ 'data-secret': 'masked' }}
        />
        {removing ? null : <SshKeyHelp {...(c && sshHost(c) ? { host: sshHost(c) } : {})} computer={c?.name} onKey={(k) => { setText(k); setError(undefined); return true; }} />}
        {has ? (
          <Button size="sm" variant={removing ? 'secondary' : 'ghost'} onPress={() => setRemoving((v) => !v)}>
            {removing ? t('sshd.keep') : t('sshd.remove')}
          </Button>
        ) : null}
        {removing ? <Notice>{t('sshd.removeBody', { name: c?.name ?? '' })}</Notice> : null}
      </div>
      )}
    </Drawer>
  );
}

/** add: a realm ticked from the start (the import flow's own realm); nothing is sent until Save. */
export function RealmsDrawer({ c, realms, add, onClose, onDone }: DrawerProps & { realms: Realm[] | undefined; add?: string }) {
  const t = useStrings(strings);
  const set = useRunner(useSetRealms(), { lock: 'computer.realms', change: 'setRealms', pick: (i) => i.computer === c?.id, vars: (i) => ({ id: String(i.computer ?? ''), realmIds: Array.isArray(i.realms) ? (i.realms as string[]) : [] }) });
  const [picked, setPicked] = useState<string[]>([]);
  const now = useShownRealm();
  // The shell's Rename realms dialog (null where renaming isn't offered: hide the action). Names come from core's realm
  // list, which the shell reloads after a rename, so the rows below follow.
  const rename = useRenameRealms();
  // New realm…, beside Rename: the realms page's own gate, as the shell's realm menu: this load serves the
  // page, the session holds 'account', and no token pins it to one realm.
  const go = useGo();
  const realmsPage = useServedPageLink('realms');
  const account = useCan('account');
  const { pinned } = useRealms();
  const newRealm = realmsPage !== null && account && pinned === null ? realmsPage : null;
  // The realms a read after a held change found, in place of the row's (which may be older): the form's baseline.
  const [base, setBase] = useState<string[] | null>(null);
  // A shown hold whose end is not settled yet (held now, or ended and not yet judged or released): the form stays
  // locked meanwhile, so nothing proved can be sent again before the drawer knows (the hold itself no longer
  // blocks once core freed it). Judgments and releases act only while their hold is still the one `ending` holds
  // (same computer and token): a newer hold, a close, reopen or other computer drops them. `gen` also drops a read's
  // answer after a close, reopen, other computer or unmount. An import-context (add) change keeps the lock: it
  // changes the picks, not which hold is unresolved.
  const [ending, setEnding] = useState<ShownHold | null>(null);
  const endingNow = useRef<ShownHold | null>(null);
  const markEnding = (e: ShownHold | null) => { endingNow.current = e; setEnding(e); };
  const isEnding = (h: ShownHold) => endingNow.current !== null && endingNow.current.computer === h.computer && endingNow.current.hold === h.hold;
  const gen = useRef({ n: 0 });
  useEffect(() => {
    markEnding(null);
    const g = gen.current;
    g.n++;
    return () => { g.n++; };
  }, [c?.id]);
  useEffect(() => {
    const own = c?.realm_ids ?? [];
    setPicked(add && !own.includes(add) ? [...own, add] : own);
    setBase(null);
    set.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id, add]);
  // A held change ends here only on proof (holdWatch says which ends need it). The drawer reads the computer fresh:
  // exactly the set that was sent (as sets, both ways) is proof, and the drawer closes (its old form could send that
  // set again). Any other set (dismissed elsewhere, or changed since) becomes the form's baseline, so nothing old is
  // dirty. A read that does not answer, or answers no list of realm ids, closes the drawer with no claim: nothing is
  // left that could send.
  const cbs = useRef({ onDone, onClose, add });
  useEffect(() => { cbs.current = { onDone, onClose, add }; });
  const [watch] = useState(() => holdWatch({
    release: (was: ShownHold) => { if (isEnding(was)) markEnding(null); },
    judge: (was: ShownHold) => {
      if (!isEnding(was)) return;
      const g = gen.current.n;
      void readRealmIds(was.computer).then((now) => {
        if (gen.current.n !== g || !isEnding(was)) return;
        const { onDone: done, onClose: close, add: extra } = cbs.current;
        if (now === null) { close(); return; }
        if (sameSet(now, was.realms)) { done(); close(); return; }
        setBase(now);
        setPicked(extra && !now.includes(extra) ? [...now, extra] : now);
        markEnding(null);
      });
    },
  }));
  useEffect(() => () => watch.drop(), [watch]);
  const held = set.held;
  const heldRealms = held && Array.isArray(held.realms) ? (held.realms as unknown[]).filter((r): r is string => typeof r === 'string') : [];
  const heldComputer = held ? String(held.computer ?? '') : '';
  const heldKey = held ? JSON.stringify([heldComputer, set.hold ?? null, heldRealms]) : '';
  // Observed after commit, never during render: a render React drops must not move the watch.
  useEffect(() => {
    const shown: ShownHold | null = held ? { computer: heldComputer, realms: heldRealms, hold: set.hold } : null;
    if (shown && shown.computer === c?.id) markEnding(shown);
    watch.seen(shown, c?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldKey, c?.id]);
  const dismissHeld = () => watch.dismiss(() => set.dismiss());
  const settling = set.held !== null || ending !== null;
  const before = base ?? c?.realm_ids ?? [];
  const dirty = picked.length !== before.length || picked.some((r) => !before.includes(r));
  return (
    <Drawer overlayId="computers-realms" resizeKey="computers-realms"
      isOpen={c !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t('realmsd.title', { name: c?.name ?? '' })}
      subtitle={t('realmsd.lede')}
      size="sm"
      dirty={dirty && picked.length > 0 && !settling}
      footer={
        <FormFooter
          dirty={dirty && picked.length > 0 && !settling}
          submitDisabled={settling}
          busy={set.busy}
          outcome={set.held ? undefined : set.outcome}
          error={refusal(set.outcome)}
          onCheck={async () => { await set.check(); onDone(); }}
          submitLabel={t('realmsd.save')}
          onSubmit={() => {
            if (!c) return;
            void set.run({ id: c.id, realmIds: picked }).then((r) => {
              if (r.outcome === 'done') {
                onDone();
                onClose();
              }
            });
          }}
        />
      }
    >
      {set.held ? (
        <Held kind="realms" name={c?.name ?? ''} elsewhere={set.elsewhere} onCheck={async () => { await set.check(); onDone(); }} onDismiss={dismissHeld} />
      ) : (
      <div className={s.stack}>
        {/* The kit's picker: its live line says how many realms the computer will show in, or asks for one. No
            minPicked: unticking the last realm is allowed and Save waits (dirty needs a pick), as before. */}
        <PickerPanel
          label={t('col.realms')}
          mode="multi"
          items={realms?.map((r) => ({
            id: r.id,
            label: r.name,
            facts: [typeof r.computers === 'number' ? t('realmsd.count', { count: r.computers }) : null, r.id === now ? t('realmsd.now') : null].filter(Boolean).join(' · ') || undefined,
            lead: <RealmDot color={r.color} />,
          }))}
          value={picked}
          onChange={setPicked}
          searchLabel={t('realmsd.search')}
          emptyText={t('realmsd.none')}
          summary={(n) => (n === 0 ? t('realmsd.atLeastOne') : t('realmsd.summary', { count: n, name: c?.name ?? '' }))}
          isDisabled={set.busy || settling}
        />
        {picked.length > 0 ? <Notice>{t('realmsd.note')}</Notice> : null}
        {/* The realm-wide actions under the list: the kit's inline group, so they stay beside each other at every width. */}
        <InlineActions
          label={t('realmsd.actions')}
          actions={[
            ...(rename ? [{ id: 'rename', label: t('realmsd.rename'), onPress: () => rename() }] : []),
            ...(newRealm ? [{ id: 'new-realm', label: t('realmsd.newRealm'), onPress: () => go(newRealm.href) }] : []),
          ]}
        />
      </div>
      )}
    </Drawer>
  );
}

/** An empty realm takes one of the account's computers. This lists the account's computers (base host: every realm
 *  and none, one page) that the realm shown now does not hold; Next hands the pick to the Realms drawer with this
 *  realm ticked, so the only change is that drawer's own (one send; an unknown outcome held there). A computer in no
 *  realm is in no realm's list (the API: an empty realm_ids on a computer means no realm, never every realm), so it
 *  is offered too and says so. Nothing is kept after close. */
/** The rows an empty realm may take: those whose realms are known (a list of ids, empty = in no realm) and do not
 *  hold `here`. A row whose realm_ids is missing or not a list of strings is never offered: the Realms drawer starts
 *  from the row's realms and sends the whole set, so an unknown set read as "none" could drop realms it has. */
export function importableRows(rows: readonly Computer[], here: string): Computer[] {
  return rows.filter((c) => {
    const ids: unknown = c.realm_ids;
    return Array.isArray(ids) && ids.every((r) => typeof r === 'string') && !ids.includes(here);
  });
}

export function ImportDrawer({ isOpen, realms, onClose, onPick }: { isOpen: boolean; realms: Realm[] | undefined; onClose: () => void; onPick: (c: Computer) => void }) {
  const t = useStrings(strings);
  const here = useShownRealm();
  const q = useAccountComputers(isOpen);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    setPicked([]);
    // A fresh list each time it opens: a computer moved in since must not be offered from a kept answer.
    void q.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  const rows = useMemo(() => (q.data && !q.isError ? importableRows(q.data.rows, here) : undefined), [q.data, q.isError, here]);
  const nameOf = (id: string) => realms?.find((r) => r.id === id)?.name;
  const choice = rows?.find((c) => c.id === picked[0]);
  return (
    <Drawer overlayId="computers-import" resizeKey="computers-import"
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('importd.title')}
      subtitle={t('importd.lede')}
      size="sm"
      cancel
      primary={
        <Button variant="primary" isDisabled={!choice || q.isFetching} onPress={() => choice && onPick(choice)}>
          {t('importd.next')}
        </Button>
      }
    >
      <div className={s.stack}>
        <PickerPanel
          label={t('importd.pick')}
          mode="single"
          items={q.isFetching && !q.isError ? undefined : rows?.map((c) => {
            const named = (c.realm_ids ?? []).map(nameOf).filter((n): n is string => !!n);
            return { id: c.id, label: c.name, lead: <ComputerMark color={c.color} />, facts: (c.realm_ids ?? []).length === 0 ? t('importd.inNone') : named.length > 0 ? t('importd.in', { realms: named.join(', ') }) : undefined };
          })}
          value={picked}
          onChange={setPicked}
          searchLabel={t('importd.search')}
          emptyText={t('importd.none')}
          status={q.isError ? { error: q.error, onRetry: () => void q.refetch() } : undefined}
        />
        {q.data && !q.isError && !q.data.complete ? <Notice>{t('importd.more')}</Notice> : null}
      </div>
    </Drawer>
  );
}

/** onNewProject: leave for New project (the page brings this Copy back after it); asked first when the name was edited. */
export interface CopyFormOpts {
  projects: Project[] | undefined;
  projectsError?: unknown;
  projectsBusy?: boolean;
  onProjectsRetry?: () => void;
  servers: Server[] | undefined;
  onClose: () => void;
  onDone: () => void;
  /** Opens New project. Leaving drops the typed name (and, with `alsoLost`, edits the host form holds), so it asks first. */
  onNewProject?: () => void;
  alsoLost?: boolean;
  /** The question's body when the host is not Copy's own drawer (what is dropped, and what opens again). */
  newProjectAskBody?: string;
  onCancel?: () => void;
}

/** Copy `c`: its runner (one copy at a time, held per source computer), fields, footer and New project question.
 *  Copy's own drawer and Get a computer's "A copy of one of yours" both draw it, so a copy is made one way. With no
 *  computer it is inert: nothing to send, and the footer's Make copy stays off. */
export function useCopyForm(c: Computer | null, o: CopyFormOpts) {
  const t = useStrings(strings);
  const shownRealm = useShownRealm();
  // The realm the copy lands in, as a create's (data.ts useHostRealm): a token session's pinned realm, else the realm
  // shown; undefined is the base host ('all' in the held change).
  const hostRealm = useHostRealm();
  // The page's list (the same read the table shows), for `before` at the press.
  const listed = useComputers().data;
  // Typed by the copy's own variables: inferred from `vars` alone it would take only the four sent keys, and the press
  // passes `before` and `realm` too (CopyVars, never sent).
  const copy = useRunner<CopyVars>(useCopy(), {
    lock: 'computer.copy',
    change: 'copy',
    pick: (i) => c !== null && i.computer === c.id,
    vars: (i) => ({ id: String(i.computer ?? ''), name: String(i.name ?? ''), project: String(i.project ?? ''), server: '' }),
  });
  const [name, setName] = useState('');
  const [suggested, setSuggested] = useState('');
  const [newAsk, setNewAsk] = useState(false);
  const [project, setProject] = useState('');
  const [server, setServer] = useState('');
  const room = useMemo(() => offered(o.servers), [o.servers]);
  // The rows read as in Get a computer (flag, name, place, room): the same helper draws both lists.
  const serverRows = useMemo(() => serverOptions(room, { t: t as unknown as (k: string, v?: Record<string, string | number>) => string, computers: undefined, inRealm: shownRealm !== 'all', market: false }), [room, t, shownRealm]);
  useEffect(() => {
    if (!c) return;
    const sug = `${c.name}-copy`.slice(0, 100);
    setSuggested(validName(sug) ? sug : '');
    setName(validName(sug) ? sug : '');
    setProject(c.project_id);
    setServer(room.find((x) => x.id === c.server_id)?.id ?? room[0]?.id ?? '');
    copy.reset();
    // Once per source computer: a list read again behind the form never takes back what the person typed or picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id]);
  // The server is picked again only when the one shown is no longer offered (or none was offered yet).
  useEffect(() => {
    if (!c || room.some((x) => x.id === server)) return;
    setServer(room.find((x) => x.id === c.server_id)?.id ?? room[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id, room, server]);
  // The copy is made in this realm, which refuses a project it does not hold (ProjectPick).
  const pick = realmProject(o.projects, o.projectsError, o.projectsBusy, project, shownRealm, c?.project_id ?? '');
  const { dest, state: projectState } = pick;
  // A server that left the list is never sent, also in the moment before the pick above lands.
  const valid = c !== null && validName(name) && projectState === 'ok' && room.some((x) => x.id === server);
  const inRealm = realmRefused(copy.outcome, shownRealm);
  // Only a typed name is lost by leaving (the rest comes back from the computer when this Copy opens again). Not
  // offered while the copy is being sent or held: its answer closes this drawer, and with it the New project opened.
  const canLeave = !copy.busy && !copy.held;
  // A held copy's name was sent: it is no unsaved edit (Copy's own drawer is not dirty while held either).
  const edited = c !== null && name !== suggested && !copy.held;
  const toNewProject = o.onNewProject && canLeave ? () => (edited || o.alsoLost ? setNewAsk(true) : o.onNewProject?.()) : undefined;
  const submit = () => {
    if (!c || !valid || copy.held) return;
    // Every computer the list shows now: a read-back proves the copy only by a row not among them (data.ts
    // listMadeNew), so a copy to a taken name, refused, is never read as made, nor is one whose name a listed computer
    // takes later. With no list read yet, or a list that may not be the whole list (a full page: data.ts pressBefore),
    // there is none, and no read proves it. The realm it lands in goes with them (pressRealm: 'all' when the page
    // names no realm API domain, as core then sends it to the base host, where the copy takes its source's realms).
    const before = pressBefore(listed);
    void copy.run({ id: c.id, name, project: dest, server, realm: pressRealm(hostRealm), ...(before ? { before } : {}) }).then((r) => {
      if (r.outcome === 'done') {
        o.onDone();
        o.onClose();
      }
    });
  };
  const footer = (
    <FormFooter
      // Get a computer's Cancel closes it; Copy's own drawer keeps the kit's Cancel. Spread first, so error= stays last word.
      {...(o.onCancel ? { onCancel: o.onCancel } : {})}
      dirty={valid && !copy.held}
      submitDisabled={c === null || copy.held !== null || projectState !== 'ok'}
      busy={copy.busy}
      outcome={copy.held ? undefined : copy.outcome}
      error={refusal(copy.outcome)}
      onCheck={async () => { const ok = await copy.check(); o.onDone(); if (ok) o.onClose(); }}
      submitLabel={t('copyd.go')}
      onSubmit={submit}
    />
  );
  const held = copy.held ? (
    <Held kind="copy" name={String(copy.held.name ?? '')} elsewhere={copy.elsewhere} onCheck={async () => { const ok = await copy.check(); o.onDone(); if (ok) o.onClose(); }} onDismiss={copy.dismiss} />
  ) : null;
  // Everything the copy sent is locked while it is in flight (the kit Form locks its fields while busy): a change
  // would show but never be sent. Enter sends the same guarded copy as the footer.
  const body = c ? (
    <Form busy={copy.busy} onSubmit={submit}>
      <TextField label={t('field.name')} value={name} onChange={setName} description={t('field.nameRule')} errorMessage={name && !validName(name) ? t('field.nameRule') : undefined} />
      <Select label={t('field.server')} value={server || undefined} onChange={setServer} options={serverRows} description={room.length ? undefined : t('field.noRoom')} />
      <ProjectPick pick={pick} onChange={setProject} onRetry={o.onProjectsRetry} error={o.projectsError} outsideText={t('copyd.projectOutside')} noneText={t('copyd.noProject')} sameText={t('copyd.sameProject', { name: c.name })} onNewProject={toNewProject} inRealm={shownRealm !== 'all'} />
      {inRealm ? <RealmRefusedNote text={t('copyd.realmRefused')} /> : null}
      <Notice>{t('copyd.note')}</Notice>
    </Form>
  ) : null;
  // The same fields as rows of a SettingGroup (Get a computer draws its copy mode with them; Copy's own drawer keeps
  // `body`). The caller's group names each row, so the fields carry the name without a second visible label; the
  // caller locks them while the copy is sent (the kit Form around its group) and sends with `submit`. The project is
  // always shown when it is settled, also when the list holds one; every other state is ProjectPick's own.
  const projectChoices = [...pick.listed.map((p) => ({ id: p.id, name: p.name, color: computerColor(p) ?? undefined })), ...(pick.own && c ? [{ id: pick.own, name: t('copyd.sameProject', { name: c.name }) }] : [])];
  const rows = c ? (
    <>
      <SettingRow label={t('field.name')} help={t('field.nameRule')}>
        {(ids) => <TextField aria-label={t('field.name')} aria-describedby={ids.helpId} value={name} onChange={setName} errorMessage={name && !validName(name) ? t('field.nameRule') : undefined} />}
      </SettingRow>
      <SettingRow label={t('field.server')}>
        <Select aria-label={t('field.server')} value={server || undefined} onChange={setServer} options={serverRows} description={room.length ? undefined : t('field.noRoom')} />
      </SettingRow>
      <SettingRow label={t('field.project')} align="start">
        <Stack gap={2}>
          {projectState === 'ok' && c ? (
            <>
              <ProjectPicker label={t('field.project')} projects={projectChoices} value={dest || undefined} onChange={setProject} />
              {toNewProject ? (
                <Row>
                  <Button size="sm" variant="ghost" icon="plus" onPress={toNewProject}>{t(shownRealm !== 'all' ? 'create.newProject' : 'proj.new')}</Button>
                </Row>
              ) : null}
            </>
          ) : c ? (
            // A pick owed, no project, a list unread or loading: ProjectPick's own states and words.
            <ProjectPick pick={pick} onChange={setProject} onRetry={o.onProjectsRetry} error={o.projectsError} outsideText={t('copyd.projectOutside')} noneText={t('copyd.noProject')} sameText={t('copyd.sameProject', { name: c.name })} onNewProject={toNewProject} inRealm={shownRealm !== 'all'} />
          ) : null}
          {inRealm ? <RealmRefusedNote text={t('copyd.realmRefused')} /> : null}
        </Stack>
      </SettingRow>
    </>
  ) : null;
  const dialogs = (
    <ConfirmDialog overlayId="computers-new-project-ask"
      isOpen={newAsk}
      onOpenChange={(open) => !open && setNewAsk(false)}
      title={t('create.newProjectAskTitle')}
      body={o.newProjectAskBody ?? t('copyd.newProjectAskBody', { name: c?.name ?? '' })}
      confirmLabel={t('create.newProjectAskGo')}
      onConfirm={() => {
        setNewAsk(false);
        if (canLeave) o.onNewProject?.();
      }}
    />
  );
  return { held, body, rows, submit, server, project: dest, footer, dialogs, busy: copy.busy, isHeld: copy.held !== null, edited, dirty: name.trim() !== '' && !copy.held };
}

export function CopyDrawer({ c, projects, projectsError, projectsBusy, onProjectsRetry, servers, onClose, onDone, onNewProject }: DrawerProps & { projects: Project[] | undefined; projectsError?: unknown; projectsBusy?: boolean; onProjectsRetry?: () => void; servers: Server[] | undefined; onNewProject?: () => void }) {
  const t = useStrings(strings);
  const form = useCopyForm(c, { projects, projectsError, projectsBusy, onProjectsRetry, servers, onClose, onDone, ...(onNewProject ? { onNewProject } : {}) });
  return (
    <>
    <Drawer overlayId="computers-copy" resizeKey="computers-copy"
      isOpen={c !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t('copyd.title', { name: c?.name ?? '' })}
      subtitle={t('copyd.lede', { name: c?.name ?? '' })}
      size="sm"
      dirty={form.dirty}
      footer={form.footer}
    >
      {form.held ?? <div className={s.stack}>{form.body}</div>}
    </Drawer>
    {form.dialogs}
    </>
  );
}

/** A typed port as the API takes it: digits only, 1 to 65535 (the rule links.alias's reader keeps); null for anything else. */
const typedPort = (v: string): number | null => {
  const n = /^[0-9]{1,5}$/.test(v) ? Number(v) : 0;
  return n >= 1 && n <= 65535 ? n : null;
};
/** The most listening ports offered under the Port field (the kit's SuggestionActions holds at most eight). */
const PORT_SUGGESTIONS = 8;

/**
 * Create an alias for a web port. With `port` it is that port's drawer (a port row, a link from another page). With no
 * port (the Aliases section's own button, links.alias without a port) the person types one: any port from 1 to 65535,
 * with nothing running on it. The computer's listening web ports are offered under the field as shortcuts that fill
 * it; they never decide whether the alias can be made.
 */
export function AliasDrawer({ c, port: preset, onClose, onDone }: DrawerProps & { port: number | null }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const ask = preset === null;
  const [typed, setTyped] = useState('');
  const port = preset ?? typedPort(typed);
  // The held create this drawer shows: its own port's; with no port given, any port alias of this computer that may
  // have gone through (a script alias's identity has no port), so reopening the drawer cannot hide it behind an empty form.
  const create = useRunner(useCreateAlias(), { lock: 'proxy.alias', change: 'aliasCreate', pick: (i) => i.computer === c?.id && (ask ? typeof i.port === 'number' : i.port === preset), vars: (i) => ({ id: String(i.computer ?? ''), port: Number(i.port), name: String(i.name ?? '') }) });
  // A suggested name fills the field; only a name the person typed counts as a change to discard.
  const [suggested, setSuggested] = useState('');
  const [name, setName] = useState('');
  useEffect(() => {
    const first = suggestAliasName();
    setSuggested(first);
    setName(first);
    setTyped('');
    create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id, preset]);
  // A port Hoody uses gets no alias, from any way in (Ports, a tunnel's menu, a link, a typed port): a Hoody kit program's, or one of
  // Hoody's own (the terminal, a desktop, a hoody-* program: the listeners' system ports), refused when the computer's listeners say
  // so. Nothing is sent while a read is out, a refresh of a held answer included (a Hoody port must not slip through before it
  // answers); a read that failed refuses nothing (the hub is not where aliases are enforced).
  // The listeners are read only while the computer runs (as the Ports tab does): a computer that is not running has none, so
  // there is nothing to wait for and nothing to refuse. A port nothing listens on is never Hoody's by this rule.
  const running = c !== null && bucket(c.status) === 'running';
  const runtime = useRuntime(c?.id, running);
  const listenersRead = !running || ((runtime.data !== undefined || runtime.isError) && !runtime.isFetching);
  // A typed port is also checked against the fixed list of the ports the Hoody kits are reached on (Firewall.logic KIT_PORTS, the
  // API's defaults), whatever the computer's state: a stopped computer has no listeners to say so.
  const kitPort = ask && port !== null && KIT_PORTS.includes(port);
  const hoodyPort = kitPort || (running && port !== null && (!!runtime.data?.yours.some((l) => l.port === port && l.kit) || !!runtime.data?.system.includes(port)));
  const problem = aliasProblem(name);
  const valid = problem === null && port !== null && !hoodyPort && listenersRead;
  const typedSomething = (name.trim() !== '' && name !== suggested) || (ask && typed !== '');
  // Make alias is off while a box is empty or the computer's listeners are still read: the footer says which (a bad value
  // shows at its own field; a held or sent create says its own outcome).
  const need = create.held || create.busy ? undefined : ask && typed === '' ? t('aliasd.needPort') : name === '' ? t('aliasd.needName') : port !== null && !hoodyPort && problem === null && !listenersRead ? t('aliasd.reading', { name: c?.name ?? '' }) : undefined;
  // Shortcuts only: the person's own web ports that listen now. Never a Hoody kit port (it would be refused).
  const listening = ask && running ? (runtime.data?.yours ?? []).filter((l) => l.kind === 'web' && !l.kit).slice(0, PORT_SUGGESTIONS) : [];
  function another() {
    let next = suggestAliasName();
    for (let i = 0; i < 3 && next === name; i++) next = suggestAliasName();
    setSuggested(next);
    setName(next);
  }
  return (
    <Drawer overlayId="computers-alias" resizeKey="computers-alias"
      isOpen={c !== null}
      onOpenChange={(o) => !o && onClose()}
      title={ask ? t('alias.make') : t('aliasd.title', { port: preset ?? 0 })}
      /* With no port given, the lede says the port can be any, with nothing running on it yet; the Port field has no help
         line of its own (its rule shows as its error). */
      subtitle={ask ? t('aliasd.ledeAny') : t('aliasd.lede')}
      size="sm"
      dirty={typedSomething && !create.held}
      footer={
        <FormFooter
          dirty={typedSomething && !create.held}
          requireDirty={false}
          submitDisabled={create.held !== null || !valid}
          busy={create.busy}
          outcome={create.held ? undefined : create.outcome}
          error={refusal(create.outcome)}
          reason={need}
          onCheck={async () => { const ok = await create.check(); onDone(); if (ok) onClose(); }}
          submitLabel={t('aliasd.go')}
          onSubmit={() => {
            if (!c || port === null || !valid || hoodyPort) return;
            void create.run({ id: c.id, port, name }).then((r) => {
              if (r.outcome === 'done') {
                onDone();
                onClose();
              }
            });
          }}
        />
      }
    >
      {create.held ? (
        <Held kind="aliasCreate" name={String(create.held.name ?? '')} elsewhere={create.elsewhere} onCheck={async () => { const ok = await create.check(); onDone(); if (ok) onClose(); }} onDismiss={create.dismiss} />
      ) : hoodyPort && !ask ? (
        <Notice>{t('aliasd.kit', { port: port ?? 0 })}</Notice>
      ) : (
      <div className={s.stack}>
        {ask ? (
          <>
            {/* Any port: a typed Hoody port is refused here, in the field, so the person can type another. */}
            <TextField
              label={t('aliasd.port')}
              value={typed}
              onChange={(v) => setTyped(v.trim())}
              inputMode="numeric"
              errorMessage={hoodyPort ? t('aliasd.kit', { port: port ?? 0 }) : typed !== '' && port === null ? t('aliasd.portRule') : undefined}
            />
            <SuggestionActions label={t('aliasd.listening')} actions={listening.map((l) => ({ id: `port-${l.port}`, label: String(l.port), literal: true, onPress: () => setTyped(String(l.port)) }))} />
          </>
        ) : null}
        {/* The port's address today, and the one rule the alias keeps. */}
        {/* The address in the plate's slot as a code value (masked ids, copies whole), not in the sentence's display type. */}
        {port !== null ? (
        <Verdict
          label={t('aliasd.verdict')}
          next={t('aliasd.reminder')}
          {...(c && port !== null ? { slot: <CodeLine value={maskUrl(portUrl(c, port).replace(/^https:\/\//, ''))} copy={portUrl(c, port)} copyLabel={t('aliasd.copy')} /> } : {})}
        >
          {t('aliasd.current')}
        </Verdict>
        ) : null}
        <TextField
          label={t('aliasd.name')}
          value={name}
          onChange={(v) => setName(v.toLowerCase())}
          description={t('aliasd.rule')}
          errorMessage={name && problem ? t(problem === 'reserved' ? 'aliasd.reserved' : 'aliasd.rule') : undefined}
          suffix={<IconButton icon="reload" size="sm" variant="ghost" label={t('aliasd.suggest')} onPress={another} />}
        />
        <Why question={t('aliasd.guessWhy')} faq={{ item: byId.ownDomain, label: t('aliasd.domainMore') }}>
          {t('aliasd.guess')}
        </Why>
        <PropagatingNote variant="created" />
      </div>
      )}
    </Drawer>
  );
}

export function RemoveAlias({ c, alias, onClose, onDone }: DrawerProps & { alias: string | null }) {
  const t = useStrings(strings);
  const remove = useRunner(useRemoveAlias(), { lock: 'proxy.alias', change: 'aliasRemove', guess: aliasSender, pick: (i) => i.alias === alias, vars: (i) => ({ id: '', alias: String(i.alias ?? '') }) });
  // The drawer stays mounted between openings: each opening starts clean, never with an earlier removal's outcome.
  useEffect(() => {
    if (alias !== null) remove.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alias]);
  // The alias's name, never its id (the row action passes the id). Once the list no longer holds it (a removal checked
  // back, a read reloading) the name it showed stays; with no name ever read the title is a plain "Remove".
  const listedName = useAliases(c?.id).data?.find((a) => a.id === alias)?.name;
  const known = useRef<{ id: string; name: string } | null>(null);
  if (alias !== null && listedName !== undefined) known.current = { id: alias, name: listedName };
  const aliasName = listedName ?? (known.current && known.current.id === alias ? known.current.name : undefined);
  return (
    <Drawer overlayId="computers-alias-remove" resizeKey="computers-alias-remove"
      isOpen={c !== null && alias !== null}
      onOpenChange={(o) => !o && onClose()}
      title={aliasName !== undefined ? t('aliasr.title', { name: aliasName }) : t('alias.remove')}
      size="sm"
      footer={
        <FormFooter
          dirty={!remove.held}
          submitDisabled={remove.held !== null}
          busy={remove.busy}
          outcome={remove.held ? undefined : remove.outcome}
          error={refusal(remove.outcome)}
          onCheck={async () => { const ok = await remove.check(); onDone(); if (ok) onClose(); }}
          tone="danger"
          submitLabel={t('alias.remove')}
          onSubmit={() => {
            if (!c || alias === null) return;
            void remove.run({ id: c.id, alias }).then((r) => {
              if (r.outcome === 'done') {
                onDone();
                onClose();
              }
            });
          }}
        />
      }
    >
      {remove.held ? (
        <Held
          kind="aliasRemove"
          name={aliasName ?? ''}
          elsewhere={remove.elsewhere}
          onCheck={async () => { const ok = await remove.check(); onDone(); if (ok) onClose(); }}
          onDismiss={remove.dismiss}
        />
      ) : (
        // The one warning: what stops, and the DNS record to delete first when a domain points at this alias.
        <Band tone="warn" /* noDetails: says what removing does; nothing was sent */>
          {t('aliasr.body')} {t('aliasr.cname')}
        </Band>
      )}
    </Drawer>
  );
}
