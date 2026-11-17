// Get a computer. Top to bottom: a plate saying what you get (and the one thing missing, when something is), the
// computer itself (start from a new one or a copy of one of yours, name, colour), where it runs (server, project,
// realm), and "More options" for everything else. Every choice is a row of a titled group. A copy is Copy's own form
// (useCopyForm), drawn here with its Make copy. The system is fixed (Debian 13, shown, never sent). A field is sent
// only when changed from the API's default. Environment values are secrets: they are never logged or stored, a refusal
// never shows the server's text, and the form is dropped when the drawer closes. One create at a time; a create whose
// answer was lost is "may have gone through".
import { isRealmLimit, realmLabel, sendProved, suggestName, useRealms as useCoreRealms } from '@core';
import { FormStateProvider } from '@kit/forms/lock';
import { useWipeOn } from '@kit/forms/Secret';
import { Band, Button, ColorPicker, ComputerPicker, ConfirmDialog, Disclosure, Drawer, ErrorState, FormFooter, IconButton, PickerField, PickerPanel, ProjectPicker, RadioGroup, randomPresetColor, Row, Select, SettingGroup, SettingRow, SettingSwitch, showToast, Stack, Tag, TextField, UpgradeLink, Why, useCanUpgrade, useComputerChoice, useStrings, type OutcomeLike, Form, PRESET_COLORS, Widget } from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { links as billingLinks } from '../../billing/links';
import { DEFAULT_FORM, NEW_SERVER, type CreateForm, changed, check, keyNotInstalled, serverOptions } from '../create-logic';
import { checkSshKey, secretLike } from '../ssh-logic';
import { pressBefore, pressRealm, useCreate, useHostRealm } from '../data';
import { afterProof, markPress } from '../firstPick';
import { pageFaq } from '../faq';
import { computerColor, offered, serverLabel } from '../logic';
import strings from '../strings.en.json';
import type { Computer, Project, Realm, Server } from '../types';
import { RealmDot } from './Bits';
import { Summary, type Missing } from './create/Summary';
import { useCopyForm } from './Drawers';
import { EnvEditor } from './EnvEditor';
import { Held } from './Held';
import { NewProject } from './NewProject';
import { SshKeyHelp } from './SshKeyHelp';
import { createUpgrade } from './upgrade';
import { useOut } from './useOut';
import { refusal, useRunner } from './runner';

/** The swatches offered: the palette's first eight, which fit one line beside the hex field. Any other colour is typed. */
const COLORS = PRESET_COLORS.slice(0, 8);
/** The key text a wipe leaves: only one public key line stays. */
const keepSsh = (ssh: string): string => (checkSshKey(ssh).ok ? ssh : '');
const CODES = ['COMPUTER_NAME_IN_USE', 'SSH_PUBLIC_KEY_IN_USE', 'SERVER_COMPUTER_LIMIT', 'PROJECT_COMPUTER_LIMIT', 'ENV_BLOCK_TOO_LARGE', 'ENV_UNREPRESENTABLE'] as const;
// The account's Realm limit refused the create (a new realm among the computer's realms): the kit's one sentence for
// it, with the way to more realms, in place of this form's "not created" line.
const sharedWords = (code: string | undefined): boolean => isRealmLimit({ code });

/** The project an untouched form starts on: the account's default project when the list holds it (the API lists
 *  newest first), else the first one, else none. */
function defaultProjectOf(list: readonly Project[]): string {
  return (list.find((p) => p.is_default) ?? list[0])?.id ?? '';
}

export function CreateDrawer({
  isOpen,
  servers,
  projects,
  realms,
  onClose,
  onDone,
  serversError,
  computers,
  canCopy,
  startFrom,
  projectsError,
  projectsBusy,
  onProjectsRetry,
  onNewProject,
}: {
  isOpen: boolean;
  servers: Server[] | undefined;
  serversError: boolean;
  projects: Project[] | undefined;
  realms: Realm[] | undefined;
  onClose: () => void;
  onDone: () => void;
  /** The person's computers: room counts on dedicated servers, and the Copy from list. */
  computers?: readonly Computer[];
  /** This login may copy computers: the form offers "A copy of one of yours". */
  canCopy?: boolean;
  /** Opens already copying this computer (back from New project, which the copy opened). */
  startFrom?: Computer;
  /** The projects list's read error, when it could not be read (nothing can be sent until it is). */
  projectsError?: unknown;
  /** The projects list is being read again (a copy waits for it before it trusts the project). */
  projectsBusy?: boolean;
  onProjectsRetry?: () => void;
  /** A copy's New project (this realm's), with the computer being copied: the drawer reads the list again when it
   *  comes back. A new computer's project is made inside this drawer (NewProject). */
  onNewProject?: (from?: Computer) => void;
}) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const out = useOut();
  const { selected, pinned } = useCoreRealms();
  const inRealm = HEX24.test(selected);
  // The realm the create lands in (data.ts useHostRealm: a token session's pinned realm, else the realm shown; undefined
  // is the base host). That host always adds its realm to the new computer, so it is shown checked and locked, and
  // never sent. It needs no realm list: the name falls back to core's label (alias, else short id) while the list is
  // not in.
  const hostRealm = useHostRealm();
  const hostName = hostRealm === undefined ? '' : (realms?.find((r) => r.id === hostRealm)?.name ?? labelText(hostRealm));
  const otherRealms = (realms ?? []).filter((r) => r.id !== hostRealm);
  const create = useRunner<{ project: string; body: Record<string, unknown>; before?: readonly string[]; realm?: string }>(useCreate(), { lock: 'computer.create', vars: (i) => ({ project: String(i.project ?? ''), body: { name: String(i.name ?? '') } }) });
  const [form, setForm] = useState<CreateForm>(DEFAULT_FORM);
  // What the person picked themselves (not the drawer's defaults): a picked project is never swapped for another,
  // and a picked server counts as an edit New project would drop.
  const [picked, setPicked] = useState<{ project?: true; server?: true }>({});
  // A project made here (NewProject: a done answer to its own send, or Select on a held one proved), picked as soon as
  // the list holds its name; a later pick of the person's own takes its place. While it is sent the drawer neither closes, switches to Copy, nor
  // sends the computer (projBusy).
  const [want, setWant] = useState<string | null>(null);
  const [projBusy, setProjBusy] = useState(false);
  // New project's form shows in the Project row; while it does, or while a project create is held, the row's button is away.
  const [newOpen, setNewOpen] = useState(false);
  const [projHeld, setProjHeld] = useState(false);
  // Moves on every project picked by hand: a made project is picked only if nothing was picked since it was sent.
  const pickGen = useRef(0);
  const wantMade = useCallback((name: string, gen: number) => {
    if (gen === pickGen.current) setWant(name);
  }, []);
  const selectMade = useCallback((name: string) => {
    pickGen.current++;
    setWant(name);
  }, []);
  const [more, setMore] = useState(false);
  // Where the computer starts from: a new one (this form), or a copy of `src` (Copy's form, drawn here). The new
  // form keeps its values while a copy is shown, so going back loses nothing.
  const [from, setFrom] = useState<'new' | 'copy'>('new');
  // The computer picked to copy, kept as picked: a list read again without it (deleted elsewhere, or the list
  // emptied) never drops a copy being sent or held. The fresh row replaces it while the list has it.
  const [src, setSrc] = useState<Computer | null>(null);
  const choice = useComputerChoice();
  // Turning the Hoody kit off asks first: the computer is made without it and it can't be added later.
  const [kitAsk, setKitAsk] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const room = useMemo(() => offered(servers), [servers]);
  const roomiest = room[0];
  // Any server in use at all (full ones count): with none the words say so, never "no room left".
  const anyServer = (servers ?? []).some((x) => x.status === 'active' || !x.status);
  const roomUp = createUpgrade(servers, room.length);
  // The Server row's "Get more room" shows only to a session that may take a plan step (the kit link's own rule).
  const canBuy = useCanUpgrade('plan');
  const patch = (p: Partial<CreateForm>) => setForm((f) => ({ ...f, ...p }));
  // Counts the private keys (and pieces of one) the SSH key field refused since the form was opened: each refusal
  // gives the field a new editor, and after the first one the field is strict (secretLike), as the SSH key drawer's.
  const [sshRefusals, setSshRefusals] = useState(0);
  const typeSsh = (v: string) => {
    // A private key pasted by mistake is refused at once: it never stays in the field until the form is sent.
    if (secretLike(v, sshRefusals > 0)) {
      patch({ ssh: '' });
      setErrors((e) => ({ ...e, ssh: 'ssh_private' }));
      setSshRefusals((n) => n + 1);
      return;
    }
    patch({ ssh: v });
    setErrors((e) => {
      if (e.ssh !== 'ssh_private') return e;
      const { ssh: _gone, ...rest } = e;
      return rest;
    });
  };
  // Environment values are secrets: they go when the tab is left, the page locks or the session ends. So does a key
  // text that is not one public key line (it may be a private key pasted by mistake).
  useWipeOn(() => setForm((f) => {
    const ssh = keepSsh(f.ssh);
    return f.env === '' && ssh === f.ssh ? f : { ...f, env: '', ssh };
  }));

  useEffect(() => {
    if (!isOpen) {
      // The form (its environment textarea included) leaves the page on close.
      setForm(DEFAULT_FORM);
      setSshRefusals(0);
      setPicked({});
      setWant(null);
      setNewOpen(false);
      setMore(false);
      setFrom('new');
      setSrc(null);
      setKitAsk(false);
      setErrors({});
      create.reset();
      return;
    }
    const first = suggestName();
    // One of the swatches the Colour row shows (COLORS: the palette's first ones, so they fit one line).
    const color = randomPresetColor(() => (Math.random() * COLORS.length) / PRESET_COLORS.length);
    setForm((f) => ({ ...f, name: first, suggestion: first, color, colorStart: color, project: f.project || defaultProjectOf(projects ?? []) }));
    if (startFrom && canCopy) {
      setFrom('copy');
      setSrc(startFrom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  useEffect(() => {
    if (isOpen && !form.server && roomiest) patch({ server: roomiest.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, room.length]);

  // While a create may have gone through, the form is hidden behind the held band: nothing to submit and no unsaved
  // edits to warn about (the band's Check again and Dismiss are the way on).
  const sendForm: CreateForm = { ...form, hostRealm };
  // The project the create goes under, or '' when there is none to send. A realm's API host lists, and creates
  // under, only that realm's projects (the API refuses another realm's project on purpose): the account's default
  // project is in no realm, so a realm can list none. With no project nothing is ever sent (core would refuse an
  // empty :pid unsent): an empty list says how to get one, a list still loading or unread says to wait or retry.
  // The list decides, never a remembered pick: a project chosen earlier that the current list lacks (deleted, or
  // moved out of this realm) is never sent, and a failed read blocks even over cached rows (the retry shows).
  const listed = projects ?? [];
  // An untouched default follows the list (the account's default project when listed, else the first); a project
  // the person picked that the list lost waits for a new pick ('gone'), never another project in its place.
  const inList = !!form.project && listed.some((p) => p.id === form.project);
  const chosen = inList ? form.project : picked.project ? '' : defaultProjectOf(listed);
  const projectState = projectsError != null ? 'unread' : projects === undefined ? 'loading' : chosen ? 'ok' : listed.length > 0 ? 'gone' : 'none';
  const project = projectState === 'ok' ? chosen : '';
  const made = want === null ? undefined : listed.find((p) => p.name === want);
  useEffect(() => {
    if (!made) return;
    setWant(null);
    setPicked((x) => ({ ...x, project: true }));
    patch({ project: made.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [made?.id]);
  const diff = create.held ? [] : changed(sendForm);
  // The New project form open with a name not yet sent: Get computer waits for it (a held project create was sent, so
  // it holds nothing to lose and blocks nothing).
  const newDraft = newOpen && !projHeld;
  // A typed name and a picked server or project count too (the drawer's own dirty check leaves them out).
  const edited = diff.length > 0 || !!picked.server || !!picked.project || (form.name.trim() !== '' && form.name !== form.suggestion);
  // The computers a copy can start from; the list decides, so a source that left it is no longer picked.
  const copyable = canCopy ? (computers ?? []) : [];
  // Copying needs the right to copy and a computer to copy (one listed, or one already picked).
  const copying = canCopy === true && from === 'copy' && (copyable.length > 0 || src !== null);
  const source = copying && src ? (copyable.find((c) => c.id === src.id) ?? src) : null;
  const pickable = source && !copyable.some((c) => c.id === source.id) ? [...copyable, source] : copyable;
  const copy = useCopyForm(source, {
    projects,
    projectsError,
    projectsBusy,
    onProjectsRetry,
    servers,
    onClose,
    onDone,
    onCancel: onClose,
    alsoLost: edited,
    ...(source ? { newProjectAskBody: t('create.copyNewProjectAskBody', { name: source.name }) } : {}),
    ...(onNewProject ? { onNewProject: () => onNewProject(source ?? undefined) } : {}),
  });
  // Everything changed sits in More options (the colour too; the one picked at random is no change).
  const moreChanged = diff.length;
  const serverRows = serverOptions(servers, { t: t as unknown as (k: string, v?: Record<string, string | number>) => string, computers, inRealm, market: out.has.market });
  const outcome: OutcomeLike | undefined = create.outcome && !create.held
    ? { kind: create.outcome.kind, message: create.outcome.kind === 'failed' && !sharedWords(create.outcome.code) ? messageFor(create.outcome.code, t) : undefined }
    : undefined;
  // A refusal this form has its own sentence for shows it in place of the kit's words; every refusal keeps its Details.
  const ownWords = create.outcome?.kind === 'failed' && (CODES as readonly string[]).includes(create.outcome.code ?? '');

  function submit() {
    if (create.held || copying || projBusy || newDraft) return;
    const r = check(sendForm, room);
    if (!project) return;
    if (!r.ok) {
      setErrors(r.errors);
      // A refused private key does not stay in the field.
      if (r.errors.ssh === 'ssh_private') patch({ ssh: '' });
      if (Object.keys(r.errors).some((k) => k !== 'name' && k !== 'server')) setMore(true);
      return;
    }
    setErrors({});
    // The press is captured now (firstPick.ts): a realm known empty here gets the new computer as its current one once
    // the create is proved, unless the person picked a computer since.
    const made = { project, name: String(r.body.name ?? '') };
    markPress(made);
    // Every computer the list shows now: a read-back proves the create only by a row not among them (data.ts
    // listMadeNew), so neither a computer already under this name nor one renamed into it later proves it. With no
    // list read yet, or a list that may not be the whole list (a full page: data.ts pressBefore), there is none, and
    // no read proves it. The realm it lands in goes with them (pressRealm: 'all' for the base host, and when the page
    // names no realm API domain): a realm's create is proved only by a row of that realm.
    const before = pressBefore(computers);
    void create.run({ project, body: r.body, realm: pressRealm(hostRealm), ...(before ? { before } : {}) }).then((x) => {
      if (x.outcome === 'done') {
        // Created, but the key that was sent is not on it (already on another computer): say so, for longer than a
        // plain toast (the computer was made: a warning, never an error).
        if (keyNotInstalled(r.body, x.data)) showToast({ tone: 'warn' /* noDetails: the create answered done; the key not being installed is its own fact, not a rejection */, title: t('create.sshNotInstalled'), body: t('create.sshNotInstalledBody') }, SSH_NOTE_MS);
        onDone();
        onClose();
        void afterProof(made, t);
        return;
      }
      // A pending answer that core's own read-back then proves applied gets firstPick's turn too (once: the mark is
      // used by the first proof); the drawer's band settles on its own, so nothing closes it here.
      const hold = (x as { hold?: string }).hold;
      if (x.outcome === 'pending' && hold) void sendProved(hold).then((ok) => { if (ok) { onDone(); void afterProof(made, t); } });
    });
  }

  // Check again on a held create: the drawer closes only when the read proved it (create.check() true), and the
  // proved computer then gets firstPick's turn; an unproved check keeps the drawer and its band open.
  async function recheck(): Promise<void> {
    const h = create.held;
    const ok = await create.check();
    onDone();
    if (!ok) return;
    if (h) void afterProof({ project: String(h.project ?? ''), name: String(h.name ?? '') }, t);
    onClose();
  }

  // While the create is in flight every kit field (the realms picker too) is locked: the body was taken at submit,
  // so a later change would show in the form but never be sent. An unknown outcome swaps the form for Held.
  const sending = useMemo(() => ({ locked: create.busy, busy: create.busy, outcome: null }), [create.busy]);

  const err = (k: string): string | undefined => (errors[k] ? t(`create.error.${errors[k]}` as never) : undefined);

  const projectPicker = (
    <ProjectPicker
      label={t('field.project')}
      projects={listed.map((p) => ({ id: p.id, name: p.name, color: computerColor(p) ?? undefined }))}
      value={chosen || undefined}
      onChange={(v) => {
        pickGen.current++;
        setWant(null);
        setPicked((x) => ({ ...x, project: true }));
        patch({ project: v });
      }}
    />
  );

  // What the plate says is missing, first thing first; null when Get computer can send.
  const serverOk = room.some((x) => x.id === form.server);
  const missing: Missing | null = serversError ? 'serversUnread'
    : servers === undefined ? 'loading'
    : projectState === 'unread' ? 'projectsUnread'
    : projectState === 'loading' ? 'loading'
    : !serverOk ? (!anyServer ? 'noServer' : room.length === 0 ? 'room' : 'server')
    : projectState === 'none' ? 'project'
    : projectState === 'gone' ? 'projectGone'
    : null;
  const server = (servers ?? []).find((x) => x.id === form.server);

  return (
    <Drawer overlayId="computers-create" resizeKey="computers-create"
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('create.title')}
      // No line over a held create: its band is the only thing to read.
      subtitle={create.held ? undefined : copying ? t('create.ledeCopy') : missing === null ? t('create.lede') : missing === 'loading' ? undefined : t('create.ledeMissing')}
      size="lg"
      // Every edit counts (a typed name, a picked server or project, an open New project form), not only More options.
      dirty={edited || newDraft || (copying && copy.edited)}
      busy={projBusy}
      footer={copying && !create.held ? copy.footer : <FormFooter dirty={edited || newDraft} requireDirty={false} submitDisabled={!!create.held || missing !== null || projBusy || newDraft} busy={create.busy} {...(newDraft && !projBusy ? { reason: t('create.newProjectOpen') } : {})} outcome={outcome} error={refusal(create.outcome)} failedDetail={ownWords ? outcome?.message : undefined} onCheck={recheck} submitLabel={t('create.go')} onSubmit={submit} onCancel={onClose} />}
    >
      {create.held ? (
        <Held kind="create" name={String(create.held.name ?? '')} onCheck={recheck} onDismiss={create.dismiss} />
      ) : (
      <FormStateProvider value={sending}>
      <Stack gap={4}>
        {copyable.length > 0 || copying ? (
          // What it starts from decides everything under it, so it comes first. Locked while either one is being
          // sent: its body was taken at submit (Make copy's or Get computer's).
          <RadioGroup
            aria-label={t('create.from')}
            variant="cards"
            options={[
              { value: 'new', label: t('create.fromNew'), description: t('create.fromNewHelp') },
              { value: 'copy', label: t('create.fromCopy'), description: t('create.fromCopyHelp') },
            ]}
            value={from}
            onChange={(v) => setFrom(v)}
            isDisabled={create.busy || copy.busy || copy.isHeld || projBusy}
          />
        ) : null}
        {copying ? (
          copy.isHeld ? null : <Summary copyOf={source?.name ?? ''} server={(servers ?? []).find((x) => x.id === copy.server)} project={(projects ?? []).find((x) => x.id === copy.project)?.name} realm={hostRealm === undefined ? undefined : hostName} />
        ) : (
          <Summary
            missing={missing}
            server={server}
            software={[form.hoodyKit ? t('create.hoodyKit') : '', form.devKit ? t('create.devKit') : '', form.ai ? t('create.ai') : ''].filter(Boolean)}
            autostart={form.autostart}
            canGrow={roomUp.available !== 'none' && canBuy}
            canRent={out.has.market}
          />
        )}

        {copying ? (
          // Copy's own fields (its name, server and project) as rows of the same group, then its Make copy in the
          // footer. The kit Form locks them while the copy is sent, and Enter sends the same guarded copy.
          // A held copy keeps the computer it was made from in view (locked) above its band.
          <>
            <Form layout="bare" busy={copy.busy} onSubmit={copy.submit}>
              <Widget size="l" fit><SettingGroup variant="field" title={t('create.g.computer')}>
                  <SettingRow label={t('create.copyFrom')}>
                    <ComputerPicker
                      label={t('create.copyFrom')}
                      placeholder={t('create.copyFromPick')}
                      computers={pickable.map((c) => choice({ ...c, server_label: serverLabel(c).name, city: c.server?.city, country: c.server?.country }))}
                      value={source?.id}
                      onChange={(id) => setSrc(copyable.find((c) => c.id === id) ?? null)}
                      isDisabled={copy.busy || copy.isHeld}
                    />
                  </SettingRow>
                {copy.isHeld ? null : copy.rows}
              </SettingGroup></Widget>
            </Form>
            {copy.held}
          </>
        ) : (
        <>
        <Widget size="l" fit><SettingGroup variant="field" title={t('create.g.computer')}>
        <SettingRow label={t('field.name')} help={t('create.nameHelp')}>
          {(ids) => (
            <TextField
              aria-label={t('field.name')}
              aria-describedby={ids.helpId}
              value={form.name}
              onChange={(v) => patch({ name: v })}
              errorMessage={err('name')}
              suffix={
                <IconButton
                  icon="reload"
                  size="sm"
                  variant="ghost"
                  label={t('create.another')}
                  isDisabled={create.busy}
                  onPress={() => {
                    if (create.busy) return;
                    const n = suggestName();
                    patch({ name: n, suggestion: n });
                  }}
                />
              }
            />
          )}
        </SettingRow>
          <SettingRow label={t('field.server')} help={t('create.serverHelp')}>
            <Stack gap={2}>
              <Select
                aria-label={t('field.server')}
                value={form.server || undefined}
                onChange={(v) => {
                  if (v === NEW_SERVER) {
                    out.market();
                    return;
                  }
                  setPicked((x) => ({ ...x, server: true }));
                  patch({ server: v });
                }}
                options={serverRows}
                description={serversError ? t('create.serversFail') : servers === undefined ? t('state.loading') : room.length ? undefined : anyServer ? t('field.noRoom') : t('create.noServers')}
                errorMessage={err('server')}
              />
              {/* The quiet room upgrade, only when a server is full or no room is left. */}
              {serversError || roomUp.available === 'none' ? null : <UpgradeLink available={roomUp.available} prominence={roomUp.prominence} href={billingLinks.plans} label={t('srv.upgrade')} />}
            </Stack>
          </SettingRow>

          {/* The project is always shown, also when there is only one. With none nothing can be sent: the row says how
              to get one (a token session pinned to its realm can't switch realms: its words leave All realms out).
              A project is made right in this row, whatever the list holds (even unread or loading: a project being
              sent stays in the row until its answer); the form stays as typed. */}
          <SettingRow label={t('field.project')} help={t('create.projectHelp')} align="start" data-create-row="project">
            <Stack gap={2}>
              {listed.length === 0 ? null : (
                // The kit's field around the picker carries the error line; the row already shows the name.
                <PickerField label={t('field.project')} showLabel={false} {...(projectState === 'gone' ? { errorMessage: t('create.error.projectGone') } : {})}>
                  {projectPicker}
                </PickerField>
              )}
              {projectState === 'none' ? (
                <Band
                  tone="warn"
                  size="table"
                  /* noDetails: an empty projects list is what the realm holds, not a rejection; no error to show */
                >
                  {t(hostRealm === undefined ? 'create.error.noProjectAny' : pinned !== null ? 'create.error.noProjectPinned' : 'create.error.noProject')}
                </Band>
              ) : projectState === 'unread' ? (
                <ErrorState size="compact" error={projectsError} title={t('create.projectsFail')} onRetry={onProjectsRetry} />
              ) : projectState === 'loading' ? (
                <Band size="table" /* noDetails: a hint while the projects list loads; nothing to retry or check yet */>{t('create.projectsLoading')}</Band>
              ) : null}
              {newOpen || projHeld ? null : (
                <Row>
                  <Button size="sm" variant="ghost" icon="plus" onPress={() => setNewOpen(true)}>{hostRealm !== undefined ? t('create.newProject') : t('proj.new')}</Button>
                </Row>
              )}
              <NewProject projects={projects} inRealm={hostRealm !== undefined} open={newOpen} onOpenChange={setNewOpen} pickGen={() => pickGen.current} onWant={wantMade} onSelect={selectMade} onBusy={setProjBusy} onHeld={setProjHeld} />
            </Stack>
          </SettingRow>

          {/* The realm the create lands in is always added by its API host, so it is a fact here, never a choice,
              and never sent. */}
          {hostRealm !== undefined ? (
            <SettingRow label={t('create.realm')} help={t('create.realmHost')} data-create-row="realm">
              <Tag><RealmDot color={realms?.find((r) => r.id === hostRealm)?.color} /> {hostName}</Tag>
            </SettingRow>
          ) : null}
        </SettingGroup></Widget>

        <Disclosure title={t('create.more')} description={moreChanged ? t('create.changed', { count: moreChanged }) : t('create.moreWhat')} isExpanded={more} onExpandedChange={setMore}>
          <Stack gap={4}>
            <Widget size="l" fit><SettingGroup variant="field" title={t('create.g.look')}>
              <SettingRow label={t('create.color')} help={t('create.colorHelp')}>
                <ColorPicker label={t('create.color')} labelHidden presets={COLORS} value={form.color} onChange={(v) => patch({ color: v })} errorMessage={err('color')} />
              </SettingRow>
              <SettingRow label={t('create.comment')} help={t('create.commentHelp')} align="start">
                {(ids) => <TextField aria-label={t('create.comment')} aria-describedby={ids.helpId} multiline rows={2} value={form.comment} onChange={(v) => patch({ comment: v })} placeholder={t('create.commentPlaceholder')} errorMessage={err('comment')} />}
              </SettingRow>
            </SettingGroup></Widget>

            <Widget size="l" fit><SettingGroup variant="field" title={t('create.g.software')}>
              {/* What each one installs is the row's own help, read as the switch's description: an info button's
                  hover tooltip never opens on a phone's tap. */}
              <SettingSwitch label={t('create.hoodyKit')} help={t('create.hoodyKitHelp')} isSelected={form.hoodyKit} onChange={(v) => (v ? patch({ hoodyKit: true, devKit: form.devKitTouched ? form.devKit : true }) : setKitAsk(true))} />
              <SettingSwitch label={t('create.devKit')} help={t('create.devKitHelp')} isSelected={form.devKit} onChange={(v) => patch({ devKit: v, devKitTouched: true })} />
              <SettingSwitch label={t('create.ai')} help={t('create.aiHelp')} isSelected={form.ai} onChange={(v) => patch({ ai: v })} />
            </SettingGroup></Widget>

            <Widget size="l" fit><SettingGroup variant="field" title={t('create.g.machine')}>
              <SettingSwitch label={t('create.autostart')} help={t('create.autostartHelp')} isSelected={form.autostart} onChange={(v) => patch({ autostart: v })} />
              <SettingSwitch label={t('create.ramdisk')} help={t('create.ramdiskHelp')} isSelected={form.ramdisk} onChange={(v) => patch({ ramdisk: v })} />
              <SettingSwitch label={t('create.kvm')} help={err('kvm') ?? t('create.kvmHelp')} isSelected={form.kvm} onChange={(v) => patch({ kvm: v })} />
            </SettingGroup></Widget>

            <Widget size="l" fit><SettingGroup variant="field" title={t('create.g.access')}>
              {/* A public key is one line, so the field is one line: the row stays as low as its neighbours. */}
              <SettingRow label={t('create.ssh')} help={t('create.sshHelp')} align="start">
                <Stack gap={2}>
                  {/* The key is optional: Hoody Terminal opens in the browser without one. That terminal comes with the Hoody kit, so
                      with the kit off the line is left out (no help line promises a browser terminal without it). */}
                  <TextField key={sshRefusals} focusOnError={sshRefusals > 0} aria-label={t('create.ssh')} mono value={form.ssh} onChange={typeSsh} errorMessage={err('ssh')} spellCheck="false" autoComplete="off" {...(form.hoodyKit ? { description: t('create.sshOptional') } : {})} />
                  {/* No address yet: SshKeyHelp says the Connect tab shows it once the computer exists. A key made in the
                      browser is named for the computer; "Use this key" puts its public line in the field above and folds
                      the help. While sending, no "Use this key" (the kit helper has no lock of its own): it would change
                      a field the body already holds. */}
                  <SshKeyHelp computer={form.name} {...(create.busy ? {} : { onKey: (k: string) => { typeSsh(k); return true; } })} />
                </Stack>
              </SettingRow>
              {/* The host realm is always added and shown above as a fact, so it never enters this list or `realms`. */}
              {/* Offered as soon as there is one realm to add, also in All realms with a single realm. */}
              {otherRealms.length > 0 ? (
                <SettingRow label={t(hostRealm === undefined ? 'create.realms' : 'create.realmsMore')} align="start">
                  <Stack gap={2}>
                    <PickerPanel
                      label={t(hostRealm === undefined ? 'create.realms' : 'create.realmsMore')}
                      mode="multi"
                      items={otherRealms.map((r) => ({
                        id: r.id,
                        label: r.name,
                        facts: typeof r.computers === 'number' ? t('realmsd.count', { count: r.computers }) : undefined,
                        lead: <RealmDot color={r.color} />,
                      }))}
                      value={form.realms.filter((id) => id !== hostRealm)}
                      onChange={(ids) => patch({ realms: ids.filter((id) => id !== hostRealm) })}
                      // A long realm list keeps its height: about six rows show, the rest scroll inside.
                      maxRows={6}
                    />
                    <Why question={t('create.realmsWhy')} faq={{ item: byId.realmsAndProjects, label: t('create.realmsFaq') }}>
                      {t('create.realmsHelp')}
                    </Why>
                  </Stack>
                </SettingRow>
              ) : null}
            </SettingGroup></Widget>

            {/* Framed like the groups above it; the rows keep their own name and note (the kit's EnvRows). */}
            <Widget size="l" fit><EnvEditor value={form.env} onChange={(v) => patch({ env: v })} error={err('env')} /></Widget>
          </Stack>
        </Disclosure>
        </>
        )}
      </Stack>
      {copy.dialogs}
      <ConfirmDialog overlayId="computers-create-kit-off"
        isOpen={kitAsk}
        onOpenChange={(o) => !o && setKitAsk(false)}
        title={t('create.kitOffTitle')}
        body={t('create.kitOffBody')}
        confirmLabel={t('create.kitOffGo')}
        tone="danger"
        onConfirm={() => {
          setKitAsk(false);
          patch({ hoodyKit: false, devKit: form.devKitTouched ? form.devKit : false });
        }}
      />
      </FormStateProvider>
      )}
    </Drawer>
  );
}

const HEX24 = /^[0-9a-f]{24}$/;

/** core's name for a realm with no alias in the page's list: its alias, else its short id. */
function labelText(id: string): string {
  const n = realmLabel(id);
  return 'text' in n ? n.text : id;
}

/** How long the "created without its SSH key" toast stays (a plain one closes after 4 s). */
const SSH_NOTE_MS = 20000;

function messageFor(code: string | undefined, t: (k: never, v?: never) => string): string | undefined {
  const known = (CODES as readonly string[]).includes(code ?? '');
  return known ? (t as unknown as (k: string) => string)(`create.refused.${code}`) : (t as unknown as (k: string) => string)('create.refused.other');
}
