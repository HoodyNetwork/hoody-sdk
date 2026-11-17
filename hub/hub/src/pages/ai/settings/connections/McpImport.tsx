// Importing MCP servers from another tool's config. The person pastes a config, the agent
// previews it (each server with what it runs or where it sends, and the NAMES of its values; it writes nothing), and only that
// exact text, as previewed, goes on to the import's confirm: an edit after the preview needs a new one. The paste box is the
// kit's secret entry (a config carries keys and tokens): hidden as bullets until the person presses Show, emptied on a route
// change, page hide or the end of the context it opened in. Nothing else here shows or logs the pasted values; the open dialog
// keeps the previewed text (what the confirm imports) until it closes. The preview carries names only, and is unreadable as a
// whole when it does not; the agent's advisories quote values, so only fixed words stand for them. A name the list shows
// from another layer, or in another case, refuses the import. Every imported server lands off. Replace is off unless the person ticks it, and
// the confirm then names EVERY incoming server as one it may replace. The send itself is the section's (Mcp.tsx).
import { Band, Button, Checkbox, Dialog, Facts, OutcomeBanner, Row, SecretInput, Select, Stack, useWipeOn } from '@kit';
import type { useStrings } from '@kit';
import { useRef, useState } from 'react';
import type { Hold, SettingsAt } from '../rules/Session';
import { previewImport, type PreviewResult } from './mcp.data';
import {
  advisoriesOf, effectOf, importBlocks, importDocProblem, looksLikeCredential, sameLayerNames,
  type Advisory, type ImportBlock, type ImportEntry, type ImportPreview, type McpList, type McpScope,
} from './mcp.logic';
import strings from './Mcp.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
const word = (t: T, k: string, v?: Record<string, string | number>): string => t(k as never, v as never);

/** A paste to start from (after a refusal: Review again) and its choices. */
export interface ImportStart { doc: string; scope: McpScope; replace: boolean }
/** What the person reviewed: the text exactly as previewed, its preview, the layer and Replace. */
export interface ImportReview { doc: string; preview: ImportPreview; scope: McpScope; replace: boolean }

/** One previewed server's effect, as its confirm line says it. */
export function importEffectText(e: ImportEntry, computer: string, t: T): string {
  const x = effectOf(e);
  if (x.kind === 'runs') return t('imp.effect.runs', { name: e.name, command: x.command, computer });
  if (x.kind === 'sends') return t('imp.effect.sends', { name: e.name, host: x.host });
  return t('imp.effect.unknown', { name: e.name });
}

/** The import's confirm: each server's effect and value names, where it is saved, what Replace may overwrite (every incoming
 *  server: the list cannot show every name a layer holds), and that every server lands off. */
export function importEffects(r: ImportReview, computer: string, scopeLabel: string, t: T): string[] {
  const out: string[] = [];
  for (const e of r.preview.servers) {
    out.push(importEffectText(e, computer, t));
    const keys = [...e.envKeys, ...e.headerKeys];
    if (keys.length) out.push(t('imp.effect.keys', { name: e.name, names: keys.join(', ') }));
  }
  out.push(`${t('dlg.savedIn')}: ${scopeLabel}`);
  if (r.replace) for (const e of r.preview.servers) out.push(t('imp.effect.replaces', { name: e.name, scope: scopeLabel }));
  out.push(t('imp.effect.off'));
  return out;
}

interface ImportDialogProps {
  computer: string;
  t: T;
  at: SettingsAt;
  hold: Hold;
  /** null while a replaced session's list is read: the pasted text stays; Preview and Next wait for the new list. */
  list: McpList | null;
  addScopes: readonly McpScope[];
  folderPlace: boolean;
  scopeLabel: (s: McpScope) => string;
  start: ImportStart | null;
  onClose: () => void;
  onNext: (r: ImportReview) => void;
}

export function ImportDialog({ computer, t, at, hold, list, addScopes, folderPlace, scopeLabel, start, onClose, onNext }: ImportDialogProps) {
  const [doc, setDoc] = useState(start?.doc ?? '');
  const [scope, setScope] = useState<McpScope>(start?.scope ?? addScopes[0] ?? 'user');
  const [replace, setReplace] = useState(start?.replace ?? false);
  // The preview and the exact text it read: shown, and importable, only while the box still holds that text.
  const [previewed, setPreviewed] = useState<{ doc: string; res: PreviewResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ReturnType<typeof importDocProblem>>(null);
  const press = useRef(0);
  // The preview holds the text it read: it goes when the box is wiped (page hide, route change, the context ending), and an
  // answer still out then writes nothing (its press is no longer the last).
  useWipeOn(() => {
    press.current++;
    setPreviewed(null);
    setBusy(false);
  });
  const current = previewed && previewed.doc === doc ? previewed.res : null;
  const stale = previewed !== null && previewed.doc !== doc;
  const ok = current?.outcome === 'ok' ? current.preview : null;
  const same = ok && list ? sameLayerNames(ok.servers, list, scope) : [];
  const blocks = ok && list ? importBlocks(ok.servers, list, scope) : [];

  const runPreview = () => {
    if (!list) return;
    const p = importDocProblem(doc);
    setProblem(p);
    if (p !== null) return;
    const mine = ++press.current;
    const sent = doc;
    setBusy(true);
    void previewImport(at, hold, sent).then((res) => {
      // Only the last press answers: an earlier preview of other text is never shown for this one.
      if (press.current === mine) setPreviewed({ doc: sent, res });
    }).finally(() => { if (press.current === mine) setBusy(false); });
  };

  return (
    <Dialog
      isOpen
      overlayId="ai.mcp.import"
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t('imp.title')}
      size="lg"
      primaryLabel={t('dlg.next')}
      primaryDisabled={!list || !ok || ok.servers.length === 0 || blocks.length > 0 || busy}
      primaryDisabledReason={list && !busy && !current ? t('imp.needPreview') : undefined}
      onPrimary={() => { if (list && ok && ok.servers.length > 0 && blocks.length === 0 && !busy) onNext({ doc, preview: ok, scope, replace }); }}
    >
      <Stack gap={3}>
        <SecretInput
          label={t('imp.doc')} description={t('imp.docHint')} value={doc} multiline rows={8}
          onChange={(v) => { setDoc(v); setProblem(null); }}
          errorMessage={problem ? word(t, `imp.problem.${problem}`) : undefined}
        />
        <Row gap={2}>
          <Button size="sm" variant="secondary" onPress={runPreview} isDisabled={busy || !list}>{t('imp.preview')}</Button>
        </Row>
        {stale && <Band tone="neutral" size="table">{t('imp.stale')}</Band>}
        {current && list && <PreviewView computer={computer} t={t} res={current} same={same} blocks={blocks} scopeLabel={scopeLabel} scope={scope} />}
        {folderPlace && addScopes.length > 1 && (
          <Select label={t('dlg.savedIn')} options={addScopes.map((s) => ({ value: s, label: scopeLabel(s) }))} value={scope} onChange={setScope} />
        )}
        <Checkbox isSelected={replace} onChange={setReplace} label={t('imp.replace')} />
      </Stack>
    </Dialog>
  );
}

/** A block as words: why nothing can be imported until it is resolved. */
function blockText(b: ImportBlock, t: T, scopeLabel: (s: McpScope) => string): string {
  if (b.kind === 'incomplete') return t('imp.block.incomplete');
  if (b.kind === 'case') return t('imp.block.case', { name: b.name, existing: b.existing });
  return t('imp.block.otherLayer', { name: b.name, layer: b.layer ? scopeLabel(b.layer) : t('scope.none') });
}
/** An advisory as fixed words (never the agent's text). */
function advisoryText(a: Advisory, t: T): string {
  return a.kind === 'other' || a.kind === 'inputs' ? word(t, `imp.adv.${a.kind}`) : word(t, `imp.adv.${a.kind}`, { name: a.name ?? t('imp.adv.someServer') });
}

function PreviewView({ computer, t, res, same, blocks, scopeLabel, scope }: {
  computer: string; t: T; res: PreviewResult; same: readonly string[]; blocks: readonly ImportBlock[]; scopeLabel: (s: McpScope) => string; scope: McpScope;
}) {
  if (res.outcome === 'refused') return <Band tone="warn" size="table" /* noDetails: the agent's words may quote the pasted values, so they are not kept */>{t('imp.refused')}</Band>;
  if (res.outcome === 'unreadable') return <Band tone="warn" size="table" /* noDetails: an answer the page could not read, not a rejection */>{t('imp.unreadable')}</Band>;
  if (res.outcome !== 'ok') return <OutcomeBanner kind={res.outcome} title={t('imp.failed')} error={res} />;
  const p = res.preview;
  if (p.servers.length === 0) return <Band tone="neutral" size="table">{t('imp.empty')}</Band>;
  const dialect = `imp.dialect.${p.dialect}`;
  const credInText = p.servers.some((e) => looksLikeCredential({ url: e.url, args: e.args }));
  const head = `${dialect in strings ? word(t, dialect) : t('imp.dialect.other')} ${t('imp.count', { count: p.servers.length })}`;
  return (
    <Stack gap={2}>
      <Band tone="neutral" size="table">{head}</Band>
      {advisoriesOf(p.warnings, p.servers.map((e) => e.name)).map((a) => (
        <Band key={`${a.kind}\u0000${a.name ?? ''}`} tone="warn" size="table" /* noDetails: fixed words for the agent's advice; its text quotes values */>{advisoryText(a, t)}</Band>
      ))}
      {p.servers.map((e) => (
        // Each server as facts: what it does, then its value NAMES (the preview has no value to show).
        <Facts
          key={e.name}
          columns={1}
          label={e.name}
          items={[
            { label: t('col.effect'), value: importEffectText(e, computer, t), wide: true },
            ...(e.transport === 'stdio' ? [{ label: t('dlg.env'), value: e.envKeys.join(', ') || '—' }] : [{ label: t('dlg.headers'), value: e.headerKeys.join(', ') || '—' }]),
          ]}
        />
      ))}
      {blocks.map((b) => (
        <Band key={`${b.kind}\u0000${'name' in b ? b.name : ''}`} tone="danger" size="table" /* noDetails: a check made on this page before anything is sent */>{blockText(b, t, scopeLabel)}</Band>
      ))}
      {same.length > 0 && <Band tone="warn" size="table" /* noDetails: a check made on this page before anything is sent */>{t('imp.overlap', { names: same.join(', '), scope: scopeLabel(scope) })}</Band>}
      {credInText && <Band tone="warn" size="table" /* noDetails: a check made on this page before anything is sent */>{t('dlg.credInText')}</Band>}
    </Stack>
  );
}
