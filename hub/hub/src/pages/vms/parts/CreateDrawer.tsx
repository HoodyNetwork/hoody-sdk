// New VM. Top to bottom: a plate saying what you get (and the one thing still missing), the VM (name, system), what
// goes on its disk, its size and screen, and "Advanced" for what is fixed for the VM's life. Every choice is a row of a
// titled group. A field is sent only when it differs from what the VM program picks by itself (create-logic.ts check).
//
// One create at a time. An accepted create closes the drawer and opens the VM's own screen, which shows it being made.
// A create whose answer was lost, or that the computer answered with a server error, may have gone through: the form
// gives way to a band naming what was sent, with Check again (reads the VM list, never sends) and Stop tracking. The
// list is read every few seconds for the first minute; a read that shows the VM opens it, one that proves it was not
// made brings the form back as typed. In a Hub shown inside another page nothing is sent, and the form says so.
import { refusal } from '@core';
import { Band, Disclosure, Drawer, Facts, Form, FormFooter, formatBytes, HeldBand, NumberField, RadioGroup, Select, SettingGroup, SettingRow, SettingSwitch, Stack, TextField, Verdict, Widget, useStrings, type Fact, type OutcomeLike } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { freshVmList, useCreateGate, useCreateVm, useImages, useTemplates } from '../create';
import { BOUNDS, check, copySources, createVerdict, DEFAULT_FORM, gates, memoryRoomMib, resolve, sentOf, sizeOf, SOURCES, SYSTEMS, type CreateForm, type CreateSent, type Field, type FieldError } from '../create-logic';
import type { Host, VmListRead } from '../data';
import { POLL_FAST_MS, vmCode, type VmCode } from '../logic';
import strings from '../strings.en.json';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
/** The refusals this form has its own sentence for. */
const CODES = ['AlreadyExists', 'SpecInvalid', 'NameInvalid', 'OperationInProgress', 'SourceBusy', 'NotFound', 'DisplayRangeExhausted', 'DisplayInUse', 'DisplayUnavailable', 'Orphaned'] as const;
type OwnCode = (typeof CODES)[number];
const ownCode = (c: VmCode | null): OwnCode | null => CODES.find((k) => k === c) ?? null;
/** How long after a send the form reads the VM list by itself (reads only); after it, the person's Check again does. */
const AUTO_CHECK_MS = 60_000;
/** The first field the plate names as missing, in the form's order. */
const ORDER: readonly Field[] = ['name', 'system', 'image', 'imagePath', 'template', 'copyOf', 'filePath', 'memory', 'vcpus', 'disk', 'firmware', 'secureBoot', 'tpm', 'share'];

export function CreateDrawer({ isOpen, host, list, onClose, onMade }: {
  isOpen: boolean;
  host: Host;
  list: VmListRead;
  onClose: () => void;
  /** A create was accepted, or a held one proved: the VM by this name is being made (or made). */
  onMade: (name: string) => void;
}) {
  const t = useStrings(strings);
  // The Hub is shown inside another page: nothing is sent, and the form says so.
  const gate = useCreateGate();
  const framed = gate.framed;
  const caps = host.state.kind === 'ready' ? host.state.caps : null;
  // The memory still free for a VM that starts now; null with no answer or no memory limit (no hint then).
  const roomMib = caps ? memoryRoomMib(caps) : null;
  const reads = isOpen && caps !== null;
  const images = useImages(reads);
  const templates = useTemplates(reads && caps.provisioning.templates);
  const create = useCreateVm(host.target);
  const [form, setForm] = useState<CreateForm>(DEFAULT_FORM);
  const [shown, setShown] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  // What the last check said while the create stays held.
  const [checkNote, setCheckNote] = useState<string | undefined>(undefined);
  // A held create that a read proved was not made: said once above the form, until the next send.
  const [notMade, setNotMade] = useState<string | null>(null);
  // The person changed a field since the form opened (plain flag: closing asks before it drops typed values).
  const [touched, setTouched] = useState(false);
  // The VM this form made: the drawer stops asking about typed values first (a render), then the VM's screen opens.
  const [made, setMade] = useState<string | null>(null);
  // A held create that left without Stop tracking, waiting for the VM list to show which way it went.
  const [settling, setSettling] = useState<CreateSent | null>(null);
  // The press's own read of the VM list (right before a send): under way, or why it sent nothing.
  const [preflight, setPreflight] = useState<{ readonly why: 'reading' | 'listUnread' | 'noId'; readonly name: string } | null>(null);
  const reading = preflight?.why === 'reading';
  useEffect(() => {
    if (made === null) return;
    // After this render's effects: the drawer's own leave guard has let go of the typed values by then.
    const id = setTimeout(() => onMade(made), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [made]);
  const patch = (p: Partial<CreateForm>) => { setTouched(true); setPreflight(null); setForm((f) => ({ ...f, ...p })); };

  useEffect(() => {
    if (isOpen) return;
    setForm(DEFAULT_FORM);
    setTouched(false);
    setMade(null);
    setShown(false);
    setAdvanced(false);
    setNotMade(null);
    setSettling(null);
    setPreflight(null);
    create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── a create that may have gone through ──
  const held = create.held;
  const heldName = held ? String(held.name ?? '') : null;
  const heldAt = held ? Number(held.at ?? 0) : 0;
  const own = held !== null && create.elsewhere === null;
  // The list as last read without a failure; undefined: no such read (nothing is created, nothing is proved from it).
  const rows = list.failed ? undefined : list.rows;
  const computerId = host.target?.container.id ?? null;
  const computerRef = useRef(computerId);
  computerRef.current = computerId;
  const openRef = useRef(isOpen);
  openRef.current = isOpen;
  // What the form said about one computer's create is not said about another's.
  useEffect(() => {
    setNotMade(null);
    setSettling(null);
    setPreflight(null);
  }, [computerId]);
  // The held send this form showed last: what it sent, and whether the person stopped tracking it.
  const was = useRef<{ sent: CreateSent; dismissed: boolean } | null>(null);
  useEffect(() => {
    const before = was.current;
    const sent = sentOf(held);
    if (sent !== null) {
      const same = before && before.sent.name === sent.name && before.sent.at === sent.at && before.sent.computer === sent.computer;
      was.current = same ? before : { sent, dismissed: false };
      // A newer create is held (this form's or another sender's): an earlier one still waiting on the list is not
      // judged over it, and the earlier one's "not created" is no longer the news.
      if (!same) { setSettling(null); setNotMade(null); }
      return;
    }
    was.current = null;
    setCheckNote(undefined);
    // The hold is gone. A hold that was this computer's and not stopped by the person is judged by the VM list below;
    // a hold that left with the computer shown says nothing.
    if (!before || before.dismissed || before.sent.computer !== computerRef.current) return;
    setSettling(before.sent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldName, heldAt]);
  // The read that freed the hold lands in the page's VM list a render or more after the hold is gone, so the list is
  // judged as it arrives, by the rule the read proved it with (createVerdict: a new id under the name). Until it shows
  // that row nothing is said; another computer shown, a new send or a closed form ends the wait.
  useEffect(() => {
    if (settling === null) return;
    if (settling.computer !== computerId) { setSettling(null); return; }
    const verdict = createVerdict(settling, rows ? [rows] : []);
    if (verdict === undefined) return;
    setSettling(null);
    if (verdict === 'applied') { if (isOpen) setMade(settling.name); }
    else setNotMade(settling.name);
  }, [settling, rows, computerId, isOpen]);
  // The list is read again every few seconds for the first minute after the send (reads only); after that the person's
  // Check again does it.
  const checkRef = useRef(create.check);
  checkRef.current = create.check;
  useEffect(() => {
    if (!own || heldAt <= 0) return;
    const id = setInterval(() => {
      if (Date.now() - heldAt > AUTO_CHECK_MS) { clearInterval(id); return; }
      void checkRef.current();
    }, POLL_FAST_MS);
    return () => clearInterval(id);
  }, [own, heldAt, heldName]);

  const ctx = caps ? { caps, rows, images: images.data, templates: templates.data } : null;
  const result = ctx ? check(form, ctx) : null;
  const errors: { readonly [K in Field]?: FieldError } = result && !result.ok ? result.errors : {};
  // A field's error shows once the person pressed Create, and for the name as soon as it is typed.
  const err = (k: Field): string | undefined => {
    const e = errors[k];
    if (!e || (!shown && !(k === 'name' && form.name !== '' && e !== 'listUnread'))) return undefined;
    return t(`create.error.${e}`);
  };

  const refuse = (errs: { readonly [K in Field]?: FieldError }) => {
    setShown(true);
    if (errs.firmware || errs.secureBoot || errs.tpm || errs.share) setAdvanced(true);
  };
  // One press: the form as shown is checked, the VM list is read now (the ids already under the name are the create's
  // baseline, and the name is checked against that list again), then one create is sent. A list that cannot be read
  // now, or that holds the name without an id, sends nothing: a later read could not tell this create from that row.
  async function submit() {
    if (create.busy || reading || held || framed || !ctx || !host.target) return;
    const first = check(form, ctx);
    if (!first.ok) { refuse(first.errors); return; }
    const target = host.target;
    const name = first.body.name;
    setNotMade(null);
    setSettling(null);
    create.reset();
    setPreflight({ why: 'reading', name });
    const got = await freshVmList();
    // The form closed or shows another computer meanwhile: that press sends nothing.
    if (!openRef.current || computerRef.current !== target.container.id) { setPreflight(null); return; }
    if (!got) { setPreflight({ why: 'listUnread', name }); return; }
    const r = check(form, { ...ctx, rows: got.data });
    if (!r.ok) { setPreflight(null); refuse(r.errors); return; }
    const same = got.data.filter((x) => x.name === name);
    if (same.some((x) => x.vmId === null)) { setPreflight({ why: 'noId', name }); return; }
    setPreflight(null);
    const x = await create.run({ target, name, body: r.body, before: same.map((y) => y.vmId as string), at: Date.now() });
    if (x.outcome === 'done') setMade(name);
  }

  const failedCode = create.outcome?.kind === 'failed' ? ownCode(vmCode({ code: create.outcome.code })) : null;
  const ownWords = failedCode !== null;
  const outcome: OutcomeLike | undefined = create.outcome && !held && create.outcome.kind !== 'done'
    ? { kind: create.outcome.kind, ...(failedCode !== null ? { message: t(`create.refused.${failedCode}`) } : {}) }
    : undefined;

  const g = caps ? gates(caps) : null;
  const r = caps ? resolve(form, caps) : null;
  const size = sizeOf(form.system);
  const computer = host.name;
  const missing = ORDER.find((k) => errors[k] !== undefined);
  const stopped = copySources(rows);
  const sized = form.source === 'image' || form.source === 'blank';

  // The one line above the form, the first that applies.
  const top: { tone: 'neutral' | 'warn'; text: string } | null = framed ? { tone: 'neutral', text: t('create.framed') }
    : preflight !== null && !reading ? { tone: 'warn', text: t(`create.preflight.${preflight.why}`, { vm: preflight.name }) }
    : notMade !== null ? { tone: 'warn', text: t('create.notMade', { vm: notMade }) }
    : !caps ? { tone: 'neutral', text: t('create.wait') }
    : null;

  const facts: Fact[] = [];
  if (r && g) {
    facts.push({ label: t('create.f.memory'), value: formatBytes(r.memoryMib * MIB) });
    facts.push({ label: t('create.f.cpus'), value: String(r.vcpus) });
    facts.push({ label: t('create.f.disk'), value: r.diskGib !== null ? formatBytes(r.diskGib * GIB) : t(form.source === 'template' ? 'create.f.disk.template' : form.source === 'copy' ? 'create.f.disk.copy' : 'create.f.disk.file') });
    facts.push({ label: t('create.f.screen'), value: t(r.screen ? 'create.on' : 'create.off') });
    facts.push({ label: t('create.f.firmware'), value: t(r.biosFallback ? 'create.f.firmware.fallback' : `vm.firmware.${r.firmware}`) });
    facts.push({ label: t('create.f.tpm'), value: t(r.tpm ? 'create.yes' : form.system === 'windows-server' && form.tpm === null && !g.tpm ? 'create.f.tpm.none' : 'create.no') });
    if (r.driverDisc) facts.push({ label: t('create.f.discs'), value: t('create.f.discs.driver') });
    else if (r.bus === 'sata') facts.push({ label: t('create.f.bus'), value: t('create.bus.sata') });
  }

  const imageReveal = (
      <Stack gap={2}>
        <RadioGroup
          aria-label={t('create.imageFrom')}
          orientation="horizontal"
          options={[{ value: 'store', label: t('create.imageFrom.store') }, { value: 'path', label: t('create.imageFrom.path') }]}
          value={form.imageFrom}
          onChange={(v) => patch({ imageFrom: v })}
        />
        {form.imageFrom === 'store' ? (
          <Select
            aria-label={t('create.image')}
            placeholder={t('create.image.pick')}
            value={form.image || undefined}
            onChange={(v) => patch({ image: v })}
            options={(images.data ?? []).map((i) => ({ value: i.sha256, label: i.label ?? t('create.image.unnamed', { id: i.sha256.slice(0, 12) }), description: !i.ready ? t('create.image.uploading') : i.bootable === false ? t('create.image.otherMachine') : formatBytes(i.bytes), isDisabled: !i.ready || i.bootable === false }))}
            description={images.isError ? undefined : images.data === undefined ? t('create.imagesLoading') : images.data.length === 0 ? t('create.imagesNone') : undefined}
            errorMessage={images.isError ? t('create.imagesFail') : err('image')}
          />
        ) : (
          <TextField aria-label={t('create.imagePath')} mono value={form.imagePath} onChange={(v) => patch({ imagePath: v })} placeholder={t('create.path.placeholder')} description={t('create.imagePath.help')} errorMessage={err('imagePath')} spellCheck="false" autoComplete="off" />
        )}
      </Stack>
    );
  const templateReveal = (
      <Select
        aria-label={t('create.template')}
        placeholder={t('create.template.pick')}
        value={form.template || undefined}
        onChange={(v) => patch({ template: v })}
        options={(templates.data ?? []).map((x) => ({ value: x.id, label: x.id, description: formatBytes(x.diskBytes) }))}
        errorMessage={err('template')}
      />
    );
  const copyReveal = (
      <Select
        aria-label={t('create.copyOf')}
        placeholder={t('create.copyOf.pick')}
        value={form.copyOf || undefined}
        onChange={(v) => patch({ copyOf: v })}
        options={stopped.map((n) => ({ value: n, label: n }))}
        description={stopped.length === 0 ? t('create.copyOf.none') : t('create.copyOf.help')}
        errorMessage={err('copyOf')}
      />
    );
  const fileReveal = <TextField aria-label={t('create.filePath')} mono value={form.filePath} onChange={(v) => patch({ filePath: v })} placeholder={t('create.path.placeholder')} description={t('create.filePath.help')} errorMessage={err('filePath')} spellCheck="false" autoComplete="off" />;
  // A template is offered only where the computer has some.
  const sources = SOURCES.filter((k) => k !== 'template' || (g?.templates === true && (templates.data ?? []).length > 0));

  return (
    <Drawer
      overlayId="vms-create"
      resizeKey="vms-create"
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={computer ? t('create.title', { name: computer }) : t('create.title.none')}
      size="lg"
      dirty={touched && heldName === null && made === null}
      footer={
        <FormFooter
          dirty={touched && made === null}
          requireDirty={false}
          submitDisabled={!!create.held || gate.framed}
          busy={create.busy || reading}
          outcome={outcome}
          error={ownWords ? undefined : refusal(create.outcome)} /* noDetails: only for this form's own refusal codes (CODES), whose sentence the kit map would replace; every other refusal passes error= */
          submitLabel={t('create.go')}
          onSubmit={() => void submit()}
          onCancel={onClose}
        />
      }
    >
      {held ? (
        <HeldBand
          overlayId="vms-create-held"
          text={t('create.held', { vm: heldName ?? '', name: computer })}
          readOnly={!own}
          note={checkNote}
          onCheck={async () => {
            const ok = await create.check();
            if (!ok) setCheckNote(t('create.held.notYet'));
          }}
          onDismiss={async () => {
            if (was.current) was.current.dismissed = true;
            const freed = await create.stopTracking();
            if (!freed && was.current) was.current.dismissed = false;
          }}
        />
      ) : (
        <Form layout="bare" busy={create.busy || reading} onSubmit={() => void submit()}>
          <Stack gap={4}>
            {top ? <Band tone={top.tone} size="table" /* noDetails: the form's own state (shown inside another page, still checking, the press's own list read sent nothing, or a fresh read showed the VM was not made); a failed list read has no details worth showing */>{top.text}</Band> : null}
            <Verdict label={t('create.sum.label')} facts={facts.length > 0 ? <Facts label={t('create.sum.label')} items={facts} columns={2} /> : undefined} next={missing !== undefined && errors[missing] ? t(`create.next.${errors[missing]}`) : undefined}>
              {t('create.sum', { system: t(`create.system.${form.system}`), name: computer })}
            </Verdict>

            <Widget size="l" fit><SettingGroup variant="field" title={t('create.g.vm')}>
              <SettingRow label={t('create.name')} help={t('create.name.help')}>
                {(ids) => <TextField aria-label={t('create.name')} aria-describedby={ids.helpId} mono value={form.name} onChange={(v) => patch({ name: v })} errorMessage={err('name')} spellCheck="false" autoComplete="off" />}
              </SettingRow>
              <SettingRow label={t('create.system')} help={t('create.system.help')} align="start">
                <RadioGroup
                  aria-label={t('create.system')}
                  options={SYSTEMS.map((k) => {
                    const why = g?.system[k];
                    return { value: k, label: t(`create.system.${k}`), ...(why ? { isDisabled: true, description: t(`create.system.${why}`) } : {}) };
                  })}
                  value={form.system}
                  onChange={(v) => patch({ system: v })}
                  errorMessage={err('system')}
                />
              </SettingRow>
            </SettingGroup></Widget>

            <Widget size="l" fit><SettingGroup variant="field" title={t('create.g.disk')}>
              <SettingRow label={t('create.source')} align="start">
                <RadioGroup
                  aria-label={t('create.source')}
                  options={sources.map((k) => ({ value: k, label: t(`create.source.${k}`), reveal: k === 'image' ? imageReveal : k === 'template' ? templateReveal : k === 'copy' ? copyReveal : k === 'file' ? fileReveal : undefined }))}
                  value={form.source}
                  onChange={(v) => patch({ source: v })}
                />
              </SettingRow>
            </SettingGroup></Widget>

            <Widget size="l" fit><SettingGroup variant="field" title={t('create.g.size')}>
              <SettingRow label={t('create.memory')} help={roomMib !== null ? t('create.memory.help', { free: formatBytes(roomMib * MIB) }) : undefined}>
                <NumberField aria-label={t('create.memory')} value={form.memoryGib ?? size.memoryGib} onChange={(v) => patch({ memoryGib: Number.isFinite(v) ? v : null })} minValue={BOUNDS.memoryGib.min} step={0.5} errorMessage={err('memory')} />
              </SettingRow>
              <SettingRow label={t('create.vcpus')}>
                <NumberField aria-label={t('create.vcpus')} value={form.vcpus ?? size.vcpus} onChange={(v) => patch({ vcpus: Number.isFinite(v) ? v : null })} minValue={BOUNDS.vcpus.min} step={1} errorMessage={err('vcpus')} />
              </SettingRow>
              {sized ? (
                <SettingRow label={t('create.disk')} help={caps ? t('create.disk.help', { free: formatBytes(caps.freeDiskBytes) }) : undefined}>
                  <NumberField aria-label={t('create.disk')} value={form.diskGib ?? size.diskGib} onChange={(v) => patch({ diskGib: Number.isFinite(v) ? v : null })} minValue={BOUNDS.diskGib.min} step={1} errorMessage={err('disk')} />
                </SettingRow>
              ) : null}
              <SettingSwitch label={t('create.screen')} help={t('create.screen.help')} isSelected={form.screen} onChange={(v) => patch({ screen: v })} />
              <SettingSwitch label={t('create.autostart')} help={t('create.autostart.help')} isSelected={form.autostart} onChange={(v) => patch({ autostart: v })} />
            </SettingGroup></Widget>

            <Disclosure title={t('create.advanced')} description={t('create.advanced.what')} isExpanded={advanced} onExpandedChange={setAdvanced}>
              <Widget size="l" fit><SettingGroup variant="field" title={t('create.g.fixed')}>
                <SettingRow label={t('create.firmware')}>
                  <Select
                    aria-label={t('create.firmware')}
                    value={r?.firmware === 'bios' ? 'bios' : 'uefi'}
                    onChange={(v) => patch({ firmware: v, ...(v === 'bios' ? { secureBoot: null } : {}) })}
                    options={[{ value: 'uefi', label: t('vm.firmware.uefi'), isDisabled: g?.uefi === false }, { value: 'bios', label: t('vm.firmware.bios') }]}
                    errorMessage={err('firmware')}
                  />
                </SettingRow>
                <SettingSwitch label={t('create.secureBoot')} isSelected={r?.firmware === 'uefi-secure-boot'} isDisabled={r?.firmware === 'bios' || g?.secureBoot === false} onChange={(v) => patch({ secureBoot: v })} />
                <SettingSwitch label={t('create.tpm')} isSelected={r?.tpm === true} isDisabled={g?.tpm === false} onChange={(v) => patch({ tpm: v })} />
                <SettingRow label={t('create.bus')} help={t('create.bus.help')}>
                  <Select aria-label={t('create.bus')} value={r?.bus ?? 'virtio'} onChange={(v) => patch({ bus: v })} options={[{ value: 'virtio', label: t('create.bus.virtio') }, { value: 'sata', label: t('create.bus.sata') }]} />
                </SettingRow>
                <SettingSwitch label={t('create.hostCpu')} help={t('create.hostCpu.help')} isSelected={form.hostCpu} onChange={(v) => patch({ hostCpu: v })} />
                <SettingSwitch label={t('create.agent')} isSelected={form.agent} onChange={(v) => patch({ agent: v })} />
                <SettingSwitch label={t('create.console')} isSelected={form.console} onChange={(v) => patch({ console: v })} />
                {g?.share ? <SettingSwitch label={t('create.share')} help={t('create.share.help')} isSelected={form.share} onChange={(v) => patch({ share: v })} /> : null}
              </SettingGroup></Widget>
            </Disclosure>
          </Stack>
        </Form>
      )}
    </Drawer>
  );
}
