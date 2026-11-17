// The Images view of the list screen: the installer images kept on the shown computer, and the downloads that fetch
// them from a link. Two sections; "Add from a link" opens a drawer.
//
// Contract, in plain words:
//   - Nothing is asked of the VM program until it answers for this computer (host.state ready): never on a shared
//     server, a stopped or expired computer, or with no computer picked.
//   - Downloads are long: their progress comes from reading the list again, fast while one is at work. Nothing here
//     waits on a request for them.
//   - Delete asks first, naming the image, and is bound to it: if the computer changes or the image leaves the list,
//     the question closes and nothing is sent. Cancel asks first the same way, bound to its download; Clear (a finished
//     row, never the image it made) does not ask.
//   - Every change is sent once. A lost answer is held (images.ts): the section shows it with Check again, which only
//     reads, and Stop tracking. A held "add" cannot be proved by a read, and says to look at the list first.
//   - A refusal says what to do in the view's own words where it has them, and keeps its details.
//   - In a Hub shown inside another page every change is off, with the reason.
import { isFramed, refusal, useRunner, type HeldChange, type RunnerOutcome, type Target } from '@core';
import {
  AnatomySection, Band, Combobox, ConfirmDialog, createColumnHelper, DataTable, Drawer, EmptyState, Form, FormFooter, formatBytes, formatDateTime, HeldBand,
  Outcome, ProgressCell, StatusPill, TextField, usePageLink, useStrings, type AnyAction, type RowActionEntry, type SectionState, type Tone,
} from '@kit';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Host } from '../data';
import {
  IMAGES_LOCK, imagesHeldBy, useAddDownload, useCatalogue, useDownloads, useImages, useRemoveImage, useStopDownload,
  type AddVars, type RemoveVars, type StopVars,
} from '../images';
import {
  downloadAction, imageErrKey, imageReasonKey, linkCheck, shaCheck, shortSha,
  type Download, type DownloadState, type Image, type ImageChange, type ImageReasonKey,
} from '../images-logic';
import strings from '../strings.en.json';

const imageCol = createColumnHelper<Image>();
const downloadCol = createColumnHelper<Download>();
const NO_IMAGES: readonly Image[] = [];
const NO_DOWNLOADS: readonly Download[] = [];

const DOWNLOAD_TONE: Record<DownloadState, Tone> = { running: 'info', verifying: 'info', ready: 'ok', failed: 'danger', cancelled: 'neutral', interrupted: 'warn' };

const heldByRemove = (h: HeldChange) => imagesHeldBy('remove', h);
const heldByStop = (h: HeldChange) => imagesHeldBy('stop', h);
const heldByAdd = (h: HeldChange) => imagesHeldBy('add', h);

type Shown = (RunnerOutcome & { facts?: Parameters<typeof refusal>[0] extends infer O ? (O extends { facts?: infer F } ? F : never) : never }) | undefined;

export function Images({ host }: { host: Host }) {
  const t = useStrings(strings);
  const ready = host.state.kind === 'ready';
  const target = host.target;
  const computer = target?.container.id ?? '';
  const name = host.name;
  const framed = isFramed();
  const files = usePageLink('files');

  const images = useImages(ready);
  const downloads = useDownloads(ready);
  const imageRows = images.data ?? NO_IMAGES;
  const downloadRows = downloads.data ?? NO_DOWNLOADS;

  // Each change's holds are those of this computer that name its own subject (an image, a job, a link's site).
  const pickRemove = useCallback((i: Record<string, unknown>) => computer !== '' && i.computer === computer && typeof i.image === 'string', [computer]);
  const pickStop = useCallback((i: Record<string, unknown>) => computer !== '' && i.computer === computer && typeof i.job === 'string', [computer]);
  const pickAdd = useCallback((i: Record<string, unknown>) => computer !== '' && i.computer === computer && typeof i.site === 'string', [computer]);
  const remove = useRunner<RemoveVars>(useRemoveImage(), {
    lock: IMAGES_LOCK, pick: pickRemove, heldBy: heldByRemove,
    vars: (i) => ({ computer: String(i.computer ?? ''), target: target as Target, sha256: String(i.image ?? '') }),
  });
  const stop = useRunner<StopVars>(useStopDownload(), {
    lock: IMAGES_LOCK, pick: pickStop, heldBy: heldByStop,
    vars: (i) => ({ computer: String(i.computer ?? ''), target: target as Target, id: String(i.job ?? ''), how: i.how === 'clear' ? 'clear' : 'cancel' }),
  });
  // A held add is named again by its site alone: the link itself is never kept.
  const add = useRunner<AddVars>(useAddDownload(), {
    lock: IMAGES_LOCK, pick: pickAdd, heldBy: heldByAdd,
    vars: (i) => ({ computer: String(i.computer ?? ''), target: target as Target, url: `https://${String(i.site ?? '')}/`, sha256: null }),
  });

  // The image the delete question names, and the download the cancel question names: confirming acts on exactly it.
  const [askRemove, setAskRemove] = useState<{ computer: string; sha256: string; title: string } | null>(null);
  const [askStop, setAskStop] = useState<{ computer: string; id: string; site: string } | null>(null);
  // What stopped a confirmed press before anything was sent (the row changed under the question).
  const [stale, setStale] = useState<'remove' | 'stop' | null>(null);
  // The kind of the stop this page sent: a cancelled download stays listed (as cancelled), a cleared one leaves the list.
  // Unknown (a stop found held after a reload): the general words.
  const [stopHow, setStopHow] = useState<'cancel' | 'clear' | null>(null);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [sha, setSha] = useState('');
  const [system, setSystem] = useState<string | undefined>(undefined);
  // What the computer reported with a held add's 5xx, for the held note.
  const [addReason, setAddReason] = useState<ImageReasonKey | null>(null);
  const catalogue = useCatalogue(ready && adding);

  const titleOf = useCallback((im: Pick<Image, 'system' | 'volumeId'>) => im.system ?? im.volumeId ?? t('images.unnamed'), [t]);
  const siteOf = useCallback((d: Pick<Download, 'host'>) => d.host || t('images.dl.site.unknown'), [t]);

  // A question is bound to what opened it: another computer, or a row that left or moved on, closes it.
  useEffect(() => {
    if (askRemove && (askRemove.computer !== computer || (images.data !== undefined && !images.data.some((x) => x.sha256 === askRemove.sha256)))) setAskRemove(null);
  }, [askRemove, computer, images.data]);
  useEffect(() => {
    if (askStop && (askStop.computer !== computer || (downloads.data !== undefined && downloads.data.find((x) => x.id === askStop.id)?.state !== 'running'))) setAskStop(null);
  }, [askStop, computer, downloads.data]);
  // Nothing kept from another computer.
  const resetRemove = remove.reset, resetStop = stop.reset, resetAdd = add.reset;
  useEffect(() => {
    setAdding(false);
    setUrl('');
    setSha('');
    setSystem(undefined);
    setStale(null);
    setAddReason(null);
    resetRemove();
    resetStop();
    resetAdd();
  }, [computer, resetRemove, resetStop, resetAdd]);
  useEffect(() => {
    if (!add.held) setAddReason(null);
  }, [add.held]);

  const whyOff = (r: { busy: boolean; held: unknown }): string | undefined =>
    framed ? t('images.why.framed') : r.busy ? t('images.why.busy') : r.held ? t('images.why.held') : undefined;

  const removeNow = (ask: { computer: string; sha256: string }) => {
    setAskRemove(null);
    if (!target || ask.computer !== computer || remove.busy || remove.held) return;
    // The image is its own identity: still listed under it is still that image.
    if (!images.data?.some((x) => x.sha256 === ask.sha256)) { setStale('remove'); return; }
    setStale(null);
    void remove.run({ computer, target, sha256: ask.sha256 }).then((r) => { if (r.outcome === 'done') void images.refetch(); });
  };
  const stopNow = (ask: { computer: string; id: string }, expect: 'cancel' | 'clear') => {
    setAskStop(null);
    if (!target || ask.computer !== computer || stop.busy || stop.held) return;
    const cur = downloads.data?.find((x) => x.id === ask.id);
    if (!cur || downloadAction(cur) !== expect) { setStale('stop'); return; }
    setStale(null);
    setStopHow(expect);
    void stop.run({ computer, target, id: ask.id, how: expect }).then((r) => { if (r.outcome === 'done') void downloads.refetch(); });
  };

  const link = linkCheck(url);
  const digest = shaCheck(sha);
  const addValid = link === 'ok' && digest !== undefined && !framed && target !== null;
  const addNow = () => {
    if (!addValid || !target || digest === undefined || add.busy || add.held) return;
    void add.run({ computer, target, url: url.trim(), sha256: digest }).then((r) => {
      if (r.outcome === 'done') {
        setAdding(false);
        setUrl('');
        setSha('');
        setSystem(undefined);
        void downloads.refetch();
      } else if (r.outcome === 'pending') {
        // Held: the drawer closes and the section shows it, with the list to look at.
        setAddReason(imageReasonKey(r.code));
        setAdding(false);
        void downloads.refetch();
      }
    });
  };

  // A refusal's own sentence where the view has one; the kit's words for the rest. Details ride on `error`.
  const detailOf = (change: ImageChange, o: Shown): string | undefined => {
    const key = o?.kind === 'failed' ? imageErrKey(change, o.code) : null;
    return key ? t(key) : undefined;
  };

  const imageColumns = useMemo(
    () => [
      imageCol.display({ id: 'name', header: t('images.col.name'), meta: { pinned: true, list: 'primary', label: t('images.col.name') }, cell: (c) => titleOf(c.row.original) }),
      imageCol.display({
        id: 'state',
        header: t('images.col.state'),
        meta: { width: '200px', priority: 1, list: 'status', label: t('images.col.state') },
        cell: (c) => {
          const im = c.row.original;
          if (im.phase === 'uploading') return <StatusPill tone="info" dot>{t('images.state.uploading')}</StatusPill>;
          return im.bootable === false ? <StatusPill tone="warn" dot>{t('images.state.otherArch')}</StatusPill> : <StatusPill tone="ok" dot>{t('images.state.ready')}</StatusPill>;
        },
      }),
      imageCol.display({ id: 'size', header: t('images.col.size'), meta: { size: 'fit', align: 'end', mono: true, priority: 2, listLabel: true, label: t('images.col.size'), fitText: (r) => formatBytes(r.bytes) }, cell: (c) => formatBytes(c.row.original.bytes) }),
      imageCol.display({ id: 'added', header: t('images.col.added'), meta: { size: 'fit', priority: 3, listLabel: true, label: t('images.col.added'), fitText: (r) => formatDateTime(r.modifiedUnix * 1000) }, cell: (c) => formatDateTime(c.row.original.modifiedUnix * 1000) }),
      imageCol.display({ id: 'id', header: t('images.col.id'), meta: { size: 'fit', mono: true, priority: 4, list: false, label: t('images.col.id'), fitText: (r) => shortSha(r.sha256) }, cell: (c) => shortSha(c.row.original.sha256) }),
    ],
    [t, titleOf],
  );
  const downloadColumns = useMemo(
    () => [
      downloadCol.display({ id: 'from', header: t('images.dl.col.from'), meta: { pinned: true, mono: true, list: 'primary', label: t('images.dl.col.from') }, cell: (c) => siteOf(c.row.original) }),
      downloadCol.display({
        id: 'state',
        header: t('images.dl.col.state'),
        meta: { width: '150px', priority: 1, list: 'status', label: t('images.dl.col.state') },
        cell: (c) => <StatusPill tone={DOWNLOAD_TONE[c.row.original.state]} dot>{t(`images.dl.state.${c.row.original.state}`)}</StatusPill>,
      }),
      downloadCol.display({
        id: 'progress',
        header: t('images.dl.col.progress'),
        meta: { priority: 2, listLabel: true, label: t('images.dl.col.progress') },
        cell: (c) => {
          const d = c.row.original;
          switch (d.state) {
            case 'running': return <ProgressCell name={siteOf(d)} done={d.fetchedBytes} total={d.expectedBytes} />;
            case 'verifying': return t('images.dl.words.verifying');
            case 'ready': return t(d.checked ? 'images.dl.words.checked' : 'images.dl.words.unchecked');
            // The VM program's own sentence for what went wrong, shown as it wrote it.
            case 'failed': return d.error ?? t('images.dl.words.failed');
            case 'cancelled': return t('images.dl.words.cancelled');
            default: return t('images.dl.words.interrupted');
          }
        },
      }),
    ],
    [t, siteOf],
  );

  const imageActions = (im: Image): RowActionEntry[] => {
    const off = whyOff(remove);
    const title = titleOf(im);
    return [{
      id: 'delete', label: t('images.row.deleteName', { name: title }), short: t('images.row.delete'), inline: true, opens: true, tone: 'danger',
      onAction: () => setAskRemove({ computer, sha256: im.sha256, title }), ...(off ? { isDisabled: true, disabledReason: off } : {}),
    }];
  };
  const downloadActions = (d: Download): RowActionEntry[] => {
    const site = siteOf(d);
    const kind = downloadAction(d);
    const off = kind === 'wait' ? t('images.dl.why.verifying') : whyOff(stop);
    const dis = off ? { isDisabled: true, disabledReason: off } : {};
    if (kind === 'cancel') return [{ id: 'cancel', label: t('images.dl.cancelName', { site }), short: t('images.dl.cancel'), inline: true, opens: true, onAction: () => setAskStop({ computer, id: d.id, site }), ...dis }];
    return [{ id: 'clear', label: t('images.dl.clearName', { site }), short: t('images.dl.clear'), inline: true, onAction: () => stopNow({ computer, id: d.id }, 'clear'), ...dis }];
  };

  const stateOf = (q: { data: unknown; isError: boolean; error: unknown; isFetching: boolean; refetch: () => unknown }, shown: number): SectionState => {
    const retry = () => void q.refetch();
    if (q.data !== undefined) return q.isError ? { kind: 'stale', shown, error: q.error, onRetry: retry, busy: q.isFetching } : { kind: 'ready' };
    return q.isError ? { kind: 'failed', error: q.error, onRetry: retry, busy: q.isFetching } : { kind: 'loading', rows: 3, variant: 'table' };
  };

  const addOff = whyOff(add);
  const addAction: AnyAction = { id: 'add', label: t('images.add.open'), icon: 'plus', opens: 'dialog', onPress: () => setAdding(true), ...(addOff ? { disabledReason: addOff } : {}) };
  const filesLink: AnyAction | null = files ? { id: 'files', label: t('images.files'), href: files.href } : null;

  const heldImage = remove.held ? imageRows.find((x) => x.sha256 === remove.held?.image) : undefined;
  const heldRemoveName = heldImage ? titleOf(heldImage) : shortSha(String(remove.held?.image ?? ''));
  const heldJob = stop.held ? downloadRows.find((x) => x.id === stop.held?.job) : undefined;
  const addBand = add.held ? (
    <HeldBand
      overlayId="vms-images-held-add"
      elsewhere={null}
      text={t('images.held.add', { site: String(add.held.site ?? '') || t('images.dl.site.unknown') })}
      note={addReason ? t(addReason) : undefined}
      readOnly={add.elsewhere !== null}
      onCheck={async () => { await add.check(); await downloads.refetch(); }}
      onDismiss={add.dismiss}
    />
  ) : null;

  const options = useMemo(
    () => (catalogue.data?.choices ?? []).map((c) => {
      const full = c.variant ? t('images.add.system.variant', { name: c.name, variant: c.variant }) : c.name;
      return { value: c.url, label: c.live ? t('images.add.system.live', { name: full }) : full };
    }),
    [catalogue.data, t],
  );
  const systemHelp = catalogue.isError ? t('images.add.system.unread') : catalogue.data && options.length === 0 ? t('images.add.system.none') : t('images.add.system.help');

  return (
    <>
      <AnatomySection
        id="vms-images"
        title={t('images.title')}
        description={t('images.about')}
        note={t('images.note')}
        actions={{ secondary: filesLink ? [addAction, filesLink] : [addAction] }}
        state={ready ? stateOf(images, imageRows.length) : { kind: 'loading', rows: 3, variant: 'table' }}
        notices={
          <>
            {remove.held ? (
              <HeldBand overlayId="vms-images-held-remove" elsewhere={null} text={t('images.held.remove', { name: heldRemoveName })} readOnly={remove.elsewhere !== null} onCheck={remove.check} onDismiss={remove.dismiss} />
            ) : null}
            {stale === 'remove' ? <Band size="table" onDismiss={() => setStale(null)}>{t('images.remove.gone')}</Band> : null}
            {remove.held ? null : <Outcome outcome={remove.outcome} doneText={t('images.remove.done')} detail={detailOf('remove', remove.outcome)} error={refusal(remove.outcome)} onDismiss={remove.reset} />}
          </>
        }
        flush
      >
        <DataTable
          label={t('images.label', { name })}
          data={imageRows as Image[]}
          columns={imageColumns}
          getRowId={(x) => x.sha256}
          fill={false}
          bare
          noViewMenu
          sortParam={false}
          onRowAction={false}
          countLabel={(n) => t('images.count', { count: n })}
          empty={<EmptyState icon="hoody-kit" size="sm" title={t('images.empty.title')} body={t('images.empty.body')} />}
          actions={imageActions}
        />
        <ConfirmDialog
          overlayId="vms-images-remove"
          isOpen={askRemove !== null}
          onOpenChange={(o) => !o && setAskRemove(null)}
          title={t('images.remove.title', { name: askRemove?.title ?? '' })}
          body={t('images.remove.body', { computer: name })}
          confirmLabel={t('images.remove.go')}
          tone="danger"
          onConfirm={() => { if (askRemove) removeNow(askRemove); }}
        />
      </AnatomySection>
      <AnatomySection
        id="vms-downloads"
        title={t('images.dl.title')}
        description={t('images.dl.about')}
        state={ready ? stateOf(downloads, downloadRows.length) : { kind: 'loading', rows: 3, variant: 'table' }}
        notices={
          <>
            {addBand}
            {stop.held ? (
              <HeldBand overlayId="vms-images-held-stop" elsewhere={null} text={t('images.held.stop', { site: heldJob ? siteOf(heldJob) : t('images.dl.site.unknown') })} readOnly={stop.elsewhere !== null} onCheck={stop.check} onDismiss={stop.dismiss} />
            ) : null}
            {stale === 'stop' ? <Band size="table" onDismiss={() => setStale(null)}>{t('images.stop.gone')}</Band> : null}
            {adding || add.held ? null : <Outcome /* noDetails: only the done outcome is drawn here; a refusal shows in the drawer's footer with its details */ outcome={add.outcome?.kind === 'done' ? add.outcome : undefined} doneText={t('images.add.done')} onDismiss={add.reset} />}
            {stop.held ? null : <Outcome outcome={stop.outcome} doneText={t(stopHow === 'cancel' ? 'images.stop.cancelled' : 'images.stop.done')} detail={detailOf('stop', stop.outcome)} error={refusal(stop.outcome)} onDismiss={stop.reset} />}
          </>
        }
        flush
      >
        <DataTable
          label={t('images.dl.label', { name })}
          data={downloadRows as Download[]}
          columns={downloadColumns}
          getRowId={(x) => x.id}
          fill={false}
          bare
          noViewMenu
          sortParam={false}
          onRowAction={false}
          countLabel={(n) => t('images.dl.count', { count: n })}
          empty={<EmptyState icon="download" size="sm" title={t('images.dl.empty')} />}
          actions={downloadActions}
        />
        <ConfirmDialog
          overlayId="vms-images-stop"
          isOpen={askStop !== null}
          onOpenChange={(o) => !o && setAskStop(null)}
          title={t('images.stop.title')}
          body={t('images.stop.body', { site: askStop?.site ?? '' })}
          confirmLabel={t('images.stop.go')}
          cancelLabel={t('images.stop.keep')}
          tone="danger"
          onConfirm={() => { if (askStop) stopNow(askStop, 'cancel'); }}
        />
        <Drawer
          overlayId="vms-images-add"
          resizeKey="vms-images-add"
          isOpen={adding && ready && !add.held}
          onOpenChange={(o) => !o && !add.busy && setAdding(false)}
          title={t('images.add.title')}
          size="sm"
          dirty={(url.trim() !== '' || sha.trim() !== '') && !add.held && !add.busy}
          footer={
            <FormFooter
              dirty={url.trim() !== ''}
              requireDirty={false}
              submitDisabled={!addValid}
              /* The link is the one required field and an empty one has no error: the footer says what Add image waits for. */
              {...(link === 'empty' && !add.busy ? { reason: t('images.add.need') } : {})}
              busy={add.busy}
              busyLabel={t('images.add.busy')}
              outcome={add.outcome}
              pendingDetail={undefined}
              error={imageErrKey('add', add.outcome?.code) ? undefined : refusal(add.outcome)}
              /* noDetails: a refusal the view has its own sentence for shows that sentence (its code names it); every other refusal passes error= */
              submitLabel={t('images.add.go')}
              onSubmit={addNow}
            />
          }
        >
          <Form onSubmit={addNow} busy={add.busy}>
            <Combobox
              label={t('images.add.system')}
              options={options}
              value={system}
              onChange={(v) => { setSystem(v); setUrl(v); }}
              description={systemHelp}
              isDisabled={options.length === 0}
            />
            <TextField
              label={t('images.add.url')}
              value={url}
              onChange={(v) => { setUrl(v); if (v !== system) setSystem(undefined); }}
              description={t('images.add.url.help')}
              errorMessage={link === 'invalid' ? t('images.add.url.invalid') : undefined}
              inputMode="url"
            />
            <TextField
              label={t('images.add.sha')}
              value={sha}
              onChange={setSha}
              description={t('images.add.sha.help')}
              errorMessage={digest === undefined ? t('images.add.sha.invalid') : undefined}
            />
            {detailOf('add', add.outcome) ? <Band tone="danger" size="table" /* noDetails: the view's own sentence for this refusal's code; the footer names the outcome */>{detailOf('add', add.outcome)}</Band> : null}
          </Form>
        </Drawer>
      </AnatomySection>
    </>
  );
}
