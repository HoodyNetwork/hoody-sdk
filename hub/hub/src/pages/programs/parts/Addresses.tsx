// A program's ports, in one table (the Computer > Backups pattern): a row for every configured port (a single-port
// program's one port; every port of a range, not only those the model gives a part for, a page at a time), with its
// state, its web address and its aliases. A range port's Start or Restart is on its row; Create alias, Logs and Stop are
// in its ⋯ menu, and its expanded part holds the whole address (Copy, Open, QR code). A single-port program's Start,
// Stop and Restart are the inspector header's (one place for each), so its row offers only Create alias. Create alias
// is offered only on the person's own programs (aliasOffered) and only while the page can open the alias drawer
// (onAlias). The alias read speaks once for the whole table, in the section's notices: one line while the first read is
// out (only where Create alias is offered), one failed line with Try again.
import type { AliasRow } from '@core';
import {
  AddressField, AnatomySection, Band, Button, DataTable, Dialog, Form, Link, Outcome, Row, StatusPill, TextField, createColumnHelper, useStrings, type RowActionEntry,
} from '@kit';
import { useState } from 'react';
import { type Action, type Part, type Row as ProgramRow, parsePort, portText, tone } from '../logic';
import strings from '../strings.en.json';
import sbStrings from '../sandbox/strings.en.json';
import { stateLabel } from './words';

const PORTS_PAGE = 16;

export interface AliasesFailedProps {
  error: unknown;
  retry: () => void;
}

/** The alias read failed: one outcome line (its reason, Details, Try again), so a failure never reads as "no aliases". */
export function AliasesFailed({ failed }: { failed: AliasesFailedProps }) {
  const t = useStrings(strings);
  return <Outcome outcome="failed" title={t('address.aliasesFailed')} error={failed.error} onRetry={failed.retry} wrap />;
}

/**
 * Create alias is offered only on the person's own programs. A Hoody Kit program's address still tells which computer
 * it is on, so an alias there would look private without being private: no offer, one quiet line instead.
 */
export const aliasOffered = (row: ProgramRow): boolean => row.scope !== 'system';

/** The ports of the inclusive range, clamped to 1..65535. */
function bounds(range: { start: number; end: number }): { lo: number; n: number } {
  const lo = Math.max(1, Math.floor(range.start));
  const hi = Math.min(65535, Math.floor(range.end));
  return { lo, n: Math.max(0, hi - lo + 1) };
}

/** One row of the table: a port, and the part the model gives for it (none: a range port not started yet; a
 *  single-port program's row carries none either, its state is the program's). */
interface PortLine {
  port: number;
  part: Part | null;
}

export interface PortsProps {
  row: ProgramRow;
  nameText: string;
  /** This page's op or a sandbox save holds the program's actions (`sbHeld`: the sandbox one, whose reason is said). */
  held: boolean;
  sbHeld: boolean;
  /** The page's press path for one port of a range. */
  onAct: (action: Action, opts: { port: number | null; range: boolean }) => void;
  /** Absent: no Logs page on this load. */
  onLogs?: (port: number) => void;
  /** A port's web address on this computer ('' while the computer's server is not known). */
  addressOf?: (port: number) => string;
  /** Create an alias for exactly one port (Computers' alias drawer); absent while it cannot be offered. */
  onAlias?: (port: number) => void;
  aliases?: ReadonlyMap<number, readonly AliasRow[]>;
  aliasesFailed?: AliasesFailedProps;
  aliasesLoading?: boolean;
}

const col = createColumnHelper<PortLine>();

/** Keyed by the program row, so another program starts on its first page with no dialog or copy line open. */
export function Ports({ row, nameText, held, sbHeld, onAct, onLogs, addressOf, onAlias, aliases, aliasesFailed, aliasesLoading = false }: PortsProps) {
  const t = useStrings(strings);
  const ts = useStrings(sbStrings);
  const [page, setPage] = useState(0);
  const [starting, setStarting] = useState(false);
  const [draft, setDraft] = useState('');
  const offered = aliasOffered(row);
  const alias = offered ? onAlias : undefined;
  const range = row.range;
  const single = !range && row.port !== null ? row.port : null;
  if (!range && single === null) return null;

  const { lo, n } = range ? bounds(range) : { lo: single ?? 0, n: 1 };
  const pages = Math.max(1, Math.ceil(n / PORTS_PAGE));
  const at = Math.min(page, pages - 1);
  const first = at * PORTS_PAGE;
  const count = Math.min(PORTS_PAGE, n - first);
  const parts = new Map<number, Part>(row.parts.map((p) => [p.port, p]));
  const lines: PortLine[] = range ? Array.from({ length: Math.max(0, count) }, (_, i) => ({ port: lo + first + i, part: parts.get(lo + first + i) ?? null })) : [{ port: lo, part: null }];

  const off = held || sbHeld;
  const why = sbHeld ? ts('sb.actionsWait') : t('ports.held');
  const offProps = off ? { isDisabled: true, disabledReason: why } : {};
  const rangeV = range ? { a: portText(range.start), b: portText(range.end) } : null;
  const portValue = range ? parsePort(draft, row) : null;
  const urlOf = (port: number): string => (addressOf ? addressOf(port) : '');

  const actions = (l: PortLine): RowActionEntry[] => {
    const v = { name: nameText, port: portText(l.port) };
    const can = range ? (l.part?.can ?? { start: row.can.portStart, stop: false, restart: false }) : { start: false, stop: false, restart: false };
    const act = (a: 'start' | 'restart' | 'stop', inline: boolean) => ({
      id: a,
      label: t(`action.${a}Port` as 'action.startPort', v),
      short: t(`action.${a}`),
      ...(inline ? { inline: true } : {}),
      // One port only (range false): a whole-program press is the header's (links.ts programOp widens range presses).
      onAction: () => onAct(a, { port: l.port, range: false }),
      ...offProps,
    });
    const main = can.start ? 'start' : can.restart ? 'restart' : null;
    const out: RowActionEntry[] = [];
    if (main) out.push(act(main, true));
    if (main === 'start' && can.restart) out.push(act('restart', false));
    if (alias) out.push({ id: 'alias', label: t('address.aliasFor', { port: v.port }), opens: true, onAction: () => alias(l.port) });
    if (range && onLogs) out.push({ id: 'logs', label: t('action.logsPort', v), onAction: () => onLogs(l.port) });
    if (can.stop) out.push('-', act('stop', false));
    return out;
  };

  const columns = [
    col.display({
      id: 'port',
      header: t('col.part'),
      meta: { pinned: true, mono: true, list: 'primary', label: t('col.part'), size: 'fit', fitText: (l) => portText(l.port) },
      cell: (c) => portText(c.row.original.port),
    }),
    col.display({
      id: 'state',
      header: t('col.state'),
      meta: { list: 'status', label: t('col.state') },
      cell: (c) => {
        const p = c.row.original.part;
        if (!range) return <StatusPill tone={tone(row.state)} dot>{stateLabel(t, row.state, row.exitCode)}</StatusPill>;
        return p ? <StatusPill tone={tone(p.state)} dot>{stateLabel(t, p.state, null)}</StatusPill> : <StatusPill tone="neutral">{t('address.notStarted')}</StatusPill>;
      },
    }),
    col.display({
      id: 'address',
      header: t('col.address'),
      // listWraps: on a phone row's meta line the words wrap inside their field, never cut (they are the link's whole
      // visible name; the address itself is hidden).
      meta: { listLabel: true, label: t('col.address'), listWraps: true },
      cell: (c) => {
        const url = urlOf(c.row.original.port);
        // A program address is secret by shape: the kit Link opens it in a new tab and shows only these words.
        // A port that is not running keeps its address; its link says it won't answer until started. `nav`: a link in a
        // row, not a sentence (its own target on a coarse pointer, 44 px).
        const port = portText(c.row.original.port);
        const runs = range ? c.row.original.part?.state === 'running' : row.state === 'running';
        return url ? <Link href={url} variant="nav">{t(runs ? 'address.open' : 'address.openIdle', { port })}</Link> : '—';
      },
    }),
    ...(offered
      ? [
          col.display({
            id: 'alias',
            header: t('col.alias'),
            meta: { listLabel: true, label: t('col.alias') },
            cell: (c) => {
              const port = c.row.original.port;
              const list = aliases?.get(port) ?? [];
              return list.length === 0 ? '' : (
                <>
                  {/* The alias record's own url, as given: never rebuilt from the name. */}
                  {list.map((a: AliasRow) => (
                    <Link key={a.id} href={a.url} variant="nav" aria-label={t('address.aliasLink', { name: a.name, port: portText(port) })}>
                      {a.name}
                    </Link>
                  ))}
                </>
              );
            },
          }),
        ]
      : []),
  ];

  const notices = (
    <>
      {sbHeld && range ? <Band size="table">{ts('sb.actionsWait')}</Band> : null}
      {alias && aliasesLoading ? <Band size="table" /* noDetails: a read still out, not a rejection */>{t('address.aliasesReading')}</Band> : null}
      {aliasesFailed ? <AliasesFailed failed={aliasesFailed} /> : null}
    </>
  );

  const description = !offered && onAlias ? t('address.noAlias') : range ? t('parts', { up: row.partsUp, n: Math.max(0, n) }) : undefined;
  const start = range && row.can.portStart && rangeV
    ? { id: 'start-port', label: t('port.startA'), opens: 'dialog' as const, onPress: () => setStarting(true), ...(off ? { disabledReason: why } : {}) }
    : undefined;
  const cantSend = off || portValue === null;
  const sendable = !cantSend;
  const send = () => {
    if (cantSend || portValue === null) return;
    setStarting(false);
    setDraft('');
    onAct('start', { port: portValue, range: true });
  };

  return (
    <AnatomySection id="ports" title={t('detail.ports')} state={{ kind: 'ready' }} {...(description ? { description } : {})} {...(start ? { actions: { primary: start } } : {})} notices={notices} flush>
      <DataTable
        label={t('detail.portsOf', { name: nameText })}
        data={lines}
        columns={columns}
        getRowId={(l) => String(l.port)}
        fill={false}
        bare
        noViewMenu
        sortParam={false}
        onRowAction={false}
        actions={actions}
        // A port's whole address, with Copy, Open and its QR code, in the row's expanded part (the kit address field).
        renderExpanded={(l) => (urlOf(l.port) ? <PortAddress url={urlOf(l.port)} port={l.port} idle={(range ? l.part?.state : row.state) !== 'running'} resetKey={row.key} /> : null)}
      />
      {pages > 1 && (
        // The summary first, the two chip buttons after it: when they do not fit beside it they go under it, and under
        // each other on a coarse pointer at 390, with their whole labels.
        <Row gap={2} align="center" wrap>
          <span>{t('address.page', { a: portText(lines[0]?.port ?? lo), b: portText(lines[lines.length - 1]?.port ?? lo), n })}</span>
          <Row gap={2} align="center" wrap>
            <Button size="sm" variant="secondary" isDisabled={at === 0} onPress={() => setPage(at - 1)}>
              {t('address.prev')}
            </Button>
            <Button size="sm" variant="secondary" isDisabled={at === pages - 1} onPress={() => setPage(at + 1)}>
              {t('address.next')}
            </Button>
          </Row>
        </Row>
      )}
      {start && rangeV && (
        <Dialog
          overlayId="programs-start-port"
          isOpen={starting}
          onOpenChange={(o) => {
            setStarting(o);
            if (!o) setDraft('');
          }}
          title={t('port.field', rangeV)}
          primaryLabel={t('port.start')}
          primaryDisabled={!sendable}
          onPrimary={send}
        >
          {/* Enter starts, as the dialog's primary does. */}
          <Form onSubmit={send}>
            <TextField
              label={t('port.start')}
              value={draft}
              onChange={setDraft}
              inputMode="numeric"
              placeholder={t('port.placeholder', rangeV)}
              mono
              reserveError
              // Read-only, not disabled, while the actions wait: a disabled field drops the focus out of the dialog and
              // Escape no longer reaches it (the primary and Enter stay refused by cantSend).
              isReadOnly={off}
              errorMessage={draft.trim() !== '' && portValue === null ? t('port.invalid', rangeV) : undefined}
            />
          </Form>
        </Dialog>
      )}
    </AnatomySection>
  );
}


/** One port's address in full: the kit field (masked, Copy, Open, QR code). */
function PortAddress({ url, port, idle, resetKey }: { url: string; port: number; idle: boolean; resetKey: string }) {
  const t = useStrings(strings);
  return <AddressField url={url} label={t('address.port', { port: portText(port) })} idle={idle} resetKey={resetKey} />;
}
