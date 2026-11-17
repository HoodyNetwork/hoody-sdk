// The registry files (Table R and S) hold what the detector's built-in DEFAULT_REGISTRY holds, plus only the
// strict anatomy's own entries, the DetailHeader slots, the page banner slots and
// PlanCard's, the Composer's Talk slots, the list-detail panes and the overlay
// and banner props, the menu trigger and the tab strip's controls: once they exist the detector reads them instead, so any other difference would change the
// layout test's count. They stay plain data the detector can evaluate without imports.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SLOT_TYPES } from './slots';

interface Registry {
  slots: Record<string, Record<string, string>>;
  slotTypes: Record<string, string[]>;
  renderers: unknown[];
  exceptions?: unknown[];
  portals?: string[];
}
const A = createRequire(import.meta.url)('../../../../scripts/lint/anatomy.cjs') as {
  DEFAULT_REGISTRY: Registry;
  loadRegistry(dir?: string): Registry;
  scan(files: Record<string, string>, opts: { registry: Registry }): { hits: { rule: string; file: string; msg: string }[] };
};

/** A page and a minimal kit, scanned with this directory's registry: the layout.slot messages of the page. */
function slotHits(page: string): string[] {
  const kit: Record<string, string> = {
    'kit/index.ts': "export * from './layouts/ListDetailPage';\nexport * from './misc/Misc';",
    'kit/layouts/ListDetailPage.tsx': [
      'export function DetailHeader(p: any) { return <header>{p.title}{p.status}{p.meta}{p.actions}</header>; }',
      'export function ListDetailPage(p: any) { return <div>{p.toolbar}{p.list}{p.detail}</div>; }',
      'export function DetailBody(p: any) { return <div>{p.children}</div>; }',
      'export function DetailFooter(p: any) { return <footer>{p.children}</footer>; }',
    ].join('\n'),
    'kit/misc/Misc.tsx': [
      'export function IdChip(p: any) { return <span />; }',
      'export function AddressRow(p: any) { return <li />; }',
      'export function Button(p: any) { return <button />; }',
      'export function Fab(p: any) { return <button />; }',
      'export function Composer(p: any) { return <div>{p.mic}{p.talk}{p.captions}</div>; }',
      'export function MicButton(p: any) { return <button />; }',
      'export function TalkBar(p: any) { return <div />; }',
      'export function CaptionStrip(p: any) { return <div />; }',
      'export function ItemList(p: any) { return <ul />; }',
      'export function EmptyState(p: any) { return <div />; }',
      'export function Skeleton(p: any) { return <div />; }',
      'export function Dialog(p: any) { return <div>{p.titleMark}{p.body}{p.outcomeDetail}{p.outcomeNote}{p.outcomeActions}</div>; }',
      'export function ConfirmDialog(p: any) { return <div>{p.titleMark}{p.body}{p.outcomeDetail}{p.outcomeNote}{p.outcomeActions}</div>; }',
      'export function DangerConfirm(p: any) { return <div>{p.titleMark}{p.body}</div>; }',
      'export function OutcomeBanner(p: any) { return <div>{p.body}</div>; }',
      'export function Outcome(p: any) { return <p />; }',
      'export function Drawer(p: any) { return <div>{p.subtitle}{p.actions}{p.primary}{p.secondary}{p.outcome}{p.footer}</div>; }',
      'export function DrawerCancel(p: any) { return <button />; }',
      'export function FormFooter(p: any) { return <footer />; }',
      'export function TextButton(p: any) { return <button />; }',
      'export function ComputerMark(p: any) { return <span />; }',
      'export function ErrorDetails(p: any) { return <div />; }',
      'export function IpInfo(p: any) { return <dl />; }',
      'export function Icon(p: any) { return <svg />; }',
      'export function Monogram(p: any) { return <span />; }',
      'export function RailPane(p: any) { return <nav>{p.head}{p.nav}{p.foot}{p.handle}</nav>; }',
      'export function PaneSeparator(p: any) { return <div role="separator" />; }',
      'export function ActionMenu(p: any) { return <div>{p.trigger}</div>; }',
      'export function Tabs(p: any) { return <div>{p.before}{p.after}{p.end}</div>; }',
      'export function IconButton(p: any) { return <button />; }',
      'export function StatusPill(p: any) { return <span />; }',
      'export function CellLines(p: any) { return <span>{p.children}</span>; }',
      'export function DataTable(p: any) { return <table />; }',
      'export function RowNote(p: any) { return <span />; }',
      'export function Tag(p: any) { return <span />; }',
      'export function PickCard(p: any) { return <button>{p.end}{p.line}</button>; }',
      'export function TextField(p: any) { return <label>{p.prefix}<input />{p.suffix}</label>; }',
    ].join('\n'),
  };
  const r = A.scan({ ...kit, 'pages/x/view.tsx': page }, { registry: A.loadRegistry(join(import.meta.dirname)) });
  return r.hits.filter((h) => h.rule === 'layout.slot' && h.file === 'pages/x/view.tsx').map((h) => h.msg);
}

describe('kit/layouts/anatomy registries', () => {
  it('equal the detector default plus AnatomySection notices, ActionBar as actions content, the DetailHeader slots, the banners, PlanCard, the Composer Talk slots, the list-detail panes, the overlay and banner props, the RailPane handle, the menu trigger, the tab strip controls and the pick cards', () => {
    const loaded = A.loadRegistry(join(import.meta.dirname));
    const base = structuredClone(A.DEFAULT_REGISTRY);
    expect(loaded.slots.AnatomySection).toEqual({ notices: 'notices' });
    expect(loaded.slots.DetailHeader).toEqual({ title: 'header-text', status: 'header-text', meta: 'header-text', actions: 'header-actions' });
    expect(loaded.slotTypes.actions).toEqual([...base.slotTypes.actions!, 'ActionBar']);
    expect(loaded.slots.ListDetailPage).toEqual({ banner: 'notices', list: 'pane', detail: 'pane' });
    expect(loaded.slots.RailPane).toEqual({ head: 'actions', nav: 'surface', foot: 'surface', handle: 'handle' });
    expect(loaded.slotTypes.handle).toEqual(['PaneSeparator']);
    expect(loaded.slots.RailFoot).toEqual({ action: 'surface', end: 'actions' });
    expect(loaded.slotTypes.surface).toEqual(expect.arrayContaining(['RailNav', 'RailFoot', 'PauseControl']));
    expect(loaded.slots.PlanCard).toEqual({ chip: 'text', lead: 'text', marks: 'text', footnote: 'notices', note: 'text', action: 'actions' });
    expect(loaded.slots.DetailPage).toEqual({ banner: 'notices', ...base.slots.DetailPage });
    expect(loaded.slots.Composer).toEqual({ mic: 'voice-mic', talk: 'voice-bar', captions: 'voice-captions' });
    expect(loaded.slotTypes['voice-mic']).toEqual(['MicButton']);
    expect(loaded.slotTypes['voice-bar']).toEqual(['TalkBar']);
    expect(loaded.slotTypes['voice-captions']).toEqual(['CaptionStrip']);
    expect(loaded.slots.Dialog).toEqual({ titleMark: 'mark', body: 'inline-text', outcomeDetail: 'inline-text', outcomeNote: 'inline-text', outcomeActions: 'actions' });
    expect(loaded.slots.ConfirmDialog).toEqual({ titleMark: 'mark', body: 'inline-text', outcomeDetail: 'inline-text', outcomeNote: 'inline-text', outcomeActions: 'actions' });
    expect(loaded.slots.DangerConfirm).toEqual({ titleMark: 'mark', body: 'inline-text' });
    expect(loaded.slots.OutcomeBanner).toEqual({ ...base.slots.OutcomeBanner, body: 'inline-text' });
    // A Drawer's foot `reason` is one line of inline text, `primaryOnPhone` the open step's primary the foot mirrors under 600 px.
    expect(loaded.slots.Drawer).toEqual({ subtitle: 'inline-text', actions: 'actions', primary: 'actions', secondary: 'actions', outcome: 'outcome', footer: 'footer', reason: 'inline-text', primaryOnPhone: 'actions' });
    expect(loaded.slotTypes.outcome).toEqual(['Outcome']);
    expect(loaded.slotTypes.mark).toEqual(['ComputerMark']);
    expect(loaded.slots.ActionMenu).toEqual({ trigger: 'menu-trigger' });
    expect(loaded.slots.Tabs).toEqual({ before: 'tabs-control', after: 'tabs-control', end: 'tabs-end' });
    expect(loaded.slotTypes['menu-trigger']).toEqual(['Button', 'IconButton']);
    expect(loaded.slotTypes['tabs-control']).toEqual(['ActionMenu', 'Button', 'IconButton', 'TextButton', 'LinkButton', 'ReasonButton']);
    expect(loaded.slotTypes['tabs-end']).toEqual([...loaded.slotTypes['tabs-control']!, 'StatusPill', 'Tag', 'Spinner']);
    expect(loaded.slotTypes['inline-text']).toEqual(loaded.slotTypes.text!.filter((c) => !['AddressRow', 'ErrorDetails', 'IpInfo'].includes(c)));
    expect(loaded.slotTypes.footer).toEqual(['FormFooter', 'DrawerCancel', 'Outcome', 'Button', 'TextButton', 'LinkButton', 'ReasonButton', 'ActionMenu', 'ActionBar']);
    // Narrow kit types for DataTable's and ConversationView's own composites, and the portal parts
    expect(loaded.slots.DataTable).toEqual({ ...base.slots.DataTable, toolbarEnd: 'toolbar', renderExpanded: 'expanded', cardRender: 'card', cell: 'cell' });
    expect(loaded.slots.ConversationView).toEqual({ ...base.slots.ConversationView, session: 'conv-session', usage: 'conv-usage' });
    expect(loaded.slotTypes.toolbar).toEqual([...loaded.slotTypes.actions!, 'SegmentedControl']);
    expect(loaded.slotTypes.card).toEqual([...base.slotTypes.body!, 'CutFrame']);
    expect(loaded.slotTypes.expanded).toEqual([...base.slotTypes.body!, 'AddressField']);
    // The text list is the detector default plus the kit's ComputerLink; a cell takes every text part, RowNote, CellLines,
    // ProviderMark (an AI account's row names its provider after the provider's mark) and ScaleBar (a plan beside the others).
    expect(loaded.slotTypes.text).toEqual([...base.slotTypes.text!, 'ComputerLink']);
    expect(loaded.slotTypes.cell).toEqual([...loaded.slotTypes.text!, 'RowNote', 'CellLines', 'ProviderMark', 'ScaleBar']);
    expect(loaded.slots.CellLines).toEqual({ children: 'cell' });
    expect(loaded.slotTypes['conv-usage']).toEqual(['UsageTab']);
    expect(loaded.slotTypes['conv-session']).toEqual(['SessionView', 'SessionTab']);
    // The pick cards: a PickCard holds nothing pressable; a CardGrid gives one PickCard per item.
    expect(loaded.slots.PickCard).toEqual({ mark: 'card-mark', end: 'card-tag', line: 'card-text', note: 'card-text', meta: 'card-text' });
    expect(loaded.slots.CardGrid).toEqual({ renderCard: 'pick-card', empty: 'empty' });
    expect(loaded.slotTypes['card-mark']).toEqual(['Monogram']);
    expect(loaded.slotTypes['card-tag']).toEqual(['StatusPill']);
    expect(loaded.slotTypes['card-text']).toEqual(['StatusPill', 'Monogram', 'ComputerMark', 'Icon', 'Kbd', 'Spinner']);
    expect(loaded.slotTypes['pick-card']).toEqual(['PickCard']);
    // A TextField's prefix and suffix sit inside the field's border: words, a small mark, or one compact control.
    expect(loaded.slots.TextField).toEqual({ prefix: 'field-affix', suffix: 'field-affix' });
    expect(loaded.slotTypes['field-affix']).toEqual(['IconButton', 'ActionMenu', 'StatusPill', 'Tag', 'Icon', 'Spinner', 'Kbd']);
    expect(loaded.portals).toEqual(['AskAgentDrawer']);
    // a Band's attach: the field list plus the two kit lists a warning may be about; the field list itself is not widened
    expect(loaded.slots.Band).toEqual({ children: 'text', actions: 'actions', attach: 'attached' });
    expect(loaded.slotTypes.attached).toEqual([...loaded.slotTypes.field!, 'PickerPanel', 'SettingGroup']);
    expect(loaded.slotTypes.field).not.toContain('SettingGroup');
    // The loader adds the exception list (empty without one); it is not registry data.
    expect(loaded.exceptions).toEqual([]);
    const rest = structuredClone(loaded);
    delete rest.exceptions;
    delete rest.portals;
    rest.slots.DataTable = base.slots.DataTable!;
    rest.slots.ConversationView = base.slots.ConversationView!;
    for (const k of ['toolbar', 'card', 'expanded', 'cell', 'conv-usage', 'conv-session']) delete rest.slotTypes[k];
    delete rest.slots.AnatomySection;
    delete rest.slots.DetailHeader;
    delete rest.slots.ListDetailPage;
    delete rest.slots.PlanCard;
    delete rest.slots.Composer;
    delete rest.slots.RailPane;
    delete rest.slots.RailFoot;
    delete rest.slots.Dialog;
    delete rest.slots.ConfirmDialog;
    delete rest.slots.DangerConfirm;
    delete rest.slots.Drawer;
    delete rest.slots.ActionMenu;
    delete rest.slots.Tabs;
    delete rest.slots.CellLines;
    delete rest.slots.PickCard;
    delete rest.slots.CardGrid;
    delete rest.slots.TextField;
    delete rest.slotTypes['field-affix'];
    for (const k of ['card-mark', 'card-tag', 'card-text', 'pick-card']) delete rest.slotTypes[k];
    delete rest.slotTypes['menu-trigger'];
    delete rest.slotTypes['tabs-control'];
    delete rest.slotTypes['tabs-end'];
    rest.slots.OutcomeBanner = base.slots.OutcomeBanner!;
    delete rest.slotTypes.outcome;
    delete rest.slotTypes.footer;
    delete rest.slotTypes.mark;
    delete rest.slotTypes.handle;
    delete rest.slotTypes['inline-text'];
    rest.slots.DetailPage = base.slots.DetailPage!;
    delete rest.slotTypes['header-text'];
    delete rest.slotTypes['header-actions'];
    delete rest.slotTypes['voice-mic'];
    delete rest.slotTypes['voice-bar'];
    delete rest.slotTypes['voice-captions'];
    delete rest.slotTypes.pane;
    rest.slotTypes.actions = base.slotTypes.actions!;
    rest.slotTypes.text = base.slotTypes.text!;
    rest.slotTypes.surface = rest.slotTypes.surface!.filter((n: string) => !['RailNav', 'RailFoot', 'PauseControl'].includes(n));
    expect(rest).toEqual(base);
  });

  it('a pane header takes the text and actions lists less what it cannot hold: no AddressRow, no Fab', () => {
    const loaded = A.loadRegistry(join(import.meta.dirname));
    expect(loaded.slotTypes['header-text']).toEqual(loaded.slotTypes.text!.filter((c) => c !== 'AddressRow'));
    expect(loaded.slotTypes['header-actions']).toEqual(loaded.slotTypes.actions!.filter((c) => c !== 'Fab'));
    // @ts-expect-error AddressRow renders an <li>: not header text
    const row: (typeof SLOT_TYPES['header-text'])[number] = 'AddressRow';
    // @ts-expect-error Fab is a fixed-position portal: not a header action
    const fab: (typeof SLOT_TYPES['header-actions'])[number] = 'Fab';
    expect([row, fab]).toHaveLength(2);
  });

  it('a list-detail pane takes the body parts plus the states a pane shows and its own header, body and footer, and AnatomySection', () => {
    const loaded = A.loadRegistry(join(import.meta.dirname));
    expect(loaded.slotTypes.pane).toEqual([
      ...loaded.slotTypes.body!,
      'EmptyState',
      'FirstUseState',
      'NoAccessState',
      'ErrorState',
      'DetailHeader',
      'DetailBody',
      'DetailFooter',
      'DetailPage',
      'Skeleton',
      'AnatomySection',
    ]);
  });

  it('a PickCard end is its words or a StatusPill; nothing pressable (a Tag) and no block markup', () => {
    const page = (props: string) => `import { PickCard, StatusPill, Tag } from '@kit';\nexport function V({ w }: { w: string }) { return <PickCard title="t" ${props} onPress={() => {}} />; }`;
    expect(slotHits(page('end="Opens Programs"'))).toEqual([]);
    expect(slotHits(page('end={w}'))).toEqual([]);
    expect(slotHits(page('end={<StatusPill />}'))).toEqual([]);
    expect(slotHits(page('end={<Tag />}'))).toEqual(['PickCard.end: <Tag> in a card-tag slot']);
    expect(slotHits(page('end={<p>x</p>}'))).toEqual(['PickCard.end: a raw <p> in a card-tag slot']);
  });

  it('ListDetailPage list and detail: pane parts pass; raw markup or a bare action is a hit; toolbar stays unregistered', () => {
    const page = (props: string) =>
      `import { ListDetailPage, DetailHeader, DetailBody, DetailFooter, ItemList, EmptyState, Skeleton, IdChip, Button } from '@kit';\nexport function V() { return <ListDetailPage ${props} />; }`;
    expect(slotHits(page('list={<ItemList />} detail={<DetailHeader title={<IdChip />} />}'))).toEqual([]);
    expect(slotHits(page('list={<Skeleton />} detail={<EmptyState />}'))).toEqual([]);
    expect(slotHits(page('detail={<><DetailHeader title={<IdChip />} /><DetailBody><ItemList /></DetailBody><DetailFooter><Button /></DetailFooter></>}'))).toEqual([]);
    expect(slotHits(page('list={<p>none</p>}'))).toEqual(['ListDetailPage.list: a raw <p> in a pane slot']);
    expect(slotHits(page('detail={<Button />}'))).toEqual(['ListDetailPage.detail: <Button> in a pane slot']);
    expect(slotHits(page('toolbar={<Button />}'))).toEqual(['ListDetailPage.toolbar takes caller content and is not in the slot table']);
  });

  it('DetailHeader: bare words beside a chip are header text; AddressRow and Fab are refused there', () => {
    const page = (props: string) => `import { DetailHeader, IdChip, AddressRow, Button, Fab } from '@kit';\nexport function V() { return <DetailHeader ${props} />; }`;
    expect(slotHits(page('title={<>Run <IdChip /></>} status={<>Ready</>} meta={<>on <IdChip /></>} actions={<Button />}'))).toEqual([]);
    expect(slotHits(page('title={<AddressRow />}'))).toEqual(['DetailHeader.title: <AddressRow> in a header-text slot']);
    expect(slotHits(page('actions={<Fab />}'))).toEqual(['DetailHeader.actions: <Fab> in a header-actions slot']);
  });

  it('menu trigger and tab strip controls: a kit button passes; raw markup or another kit part is the hit', () => {
    const page = (el: string) => `import { ActionMenu, Tabs, Button, IconButton, StatusPill, IdChip, ItemList } from '@kit';\nexport function V() { return ${el}; }`;
    expect(slotHits(page('<ActionMenu trigger={<Button />} />'))).toEqual([]);
    expect(slotHits(page('<ActionMenu trigger={<IconButton />} />'))).toEqual([]);
    expect(slotHits(page('<ActionMenu trigger={<button />} />'))).toEqual(['ActionMenu.trigger: a raw <button> in a menu-trigger slot']);
    expect(slotHits(page('<ActionMenu trigger={<StatusPill />} />'))).toEqual(['ActionMenu.trigger: <StatusPill> in a menu-trigger slot']);
    expect(slotHits(page('<Tabs before={<ActionMenu />} after={<IconButton />} end={<StatusPill />} />'))).toEqual([]);
    expect(slotHits(page('<Tabs before={<IdChip />} after={<ItemList />} end={<ItemList />} />'))).toEqual([
      'Tabs.before: <IdChip> in a tabs-control slot',
      'Tabs.after: <ItemList> in a tabs-control slot',
      'Tabs.end: <ItemList> in a tabs-end slot',
    ]);
  });
  it('TextField prefix and suffix: words, a mark or a compact control pass; a full button, a block part or raw markup is the hit', () => {
    const page = (props: string) => `import { TextField, IconButton, ActionMenu, StatusPill, Tag, Icon, Button, ItemList } from '@kit';\nexport function V({ unit }: { unit: string }) { return <TextField label="Name" ${props} />; }`;
    expect(slotHits(page('prefix="https://" suffix={unit}'))).toEqual([]);
    expect(slotHits(page('prefix={<Icon name="search" />} suffix={<IconButton />}'))).toEqual([]);
    expect(slotHits(page('suffix={<ActionMenu />}'))).toEqual([]);
    expect(slotHits(page('suffix={<><IconButton /><IconButton /></>}'))).toEqual([]);
    expect(slotHits(page('suffix={<StatusPill />} prefix={<Tag />}'))).toEqual([]);
    expect(slotHits(page('suffix={<>ms</>}'))).toEqual([]);
    expect(slotHits(page('suffix={<Button />}'))).toEqual(['TextField.suffix: <Button> in a field-affix slot']);
    expect(slotHits(page('prefix={<ItemList />}'))).toEqual(['TextField.prefix: <ItemList> in a field-affix slot']);
    expect(slotHits(page('suffix={<span>ms</span>}'))).toEqual(['TextField.suffix: a raw <span> in a field-affix slot']);
  });

  it('RailPane handle: it takes the one PaneSeparator; another kit part is a hit', () => {
    const page = (props: string) => `import { RailPane, PaneSeparator, Button } from '@kit';\nexport function V() { return <RailPane label="r" ${props} />; }`;
    expect(slotHits(page('handle={<PaneSeparator />}'))).toEqual([]);
    expect(slotHits(page('handle={<Button />}'))).toEqual(['RailPane.handle: <Button> in a handle slot']);
  });

  it('Composer Talk slots: each takes its one voice part; another kit part, or a voice part in the wrong slot, is a hit', () => {
    const page = (props: string) => `import { Composer, MicButton, TalkBar, CaptionStrip, Button } from '@kit';\nexport function V() { return <Composer ${props} />; }`;
    expect(slotHits(page('mic={<MicButton />} talk={<TalkBar />} captions={<CaptionStrip />}'))).toEqual([]);
    expect(slotHits(page('mic={<Button />}'))).toEqual(['Composer.mic: <Button> in a voice-mic slot']);
    expect(slotHits(page('talk={<CaptionStrip />}'))).toEqual(['Composer.talk: <CaptionStrip> in a voice-bar slot']);
    expect(slotHits(page('captions={<TalkBar />}'))).toEqual(['Composer.captions: <TalkBar> in a voice-captions slot']);
    expect(slotHits(page('mic={<TalkBar />}'))).toEqual(['Composer.mic: <TalkBar> in a voice-mic slot']);
  });
  it('Composer props outside the Talk slots keep their hit: the entry registers only mic, talk and captions', () => {
    const page = `import { Composer, Button } from '@kit';\nexport function V() { return <Composer tools={<Button />} below={<Button />} />; }`;
    expect(slotHits(page)).toEqual([
      'Composer.tools takes caller content and is not in the slot table',
      'Composer.below takes caller content and is not in the slot table',
    ]);
  });

  it('overlay and banner props: a sentence or a mark passes; raw markup, a block or a button is the real hit', () => {
    const page = (el: string) =>
      `import { Dialog, ConfirmDialog, DangerConfirm, OutcomeBanner, Outcome, Drawer, DrawerCancel, FormFooter, TextButton, Button, ComputerMark, IdChip, ItemList, AddressRow, ErrorDetails, IpInfo, Icon, Monogram } from '@kit';\nexport function V() { return ${el}; }`;
    expect(slotHits(page('<ConfirmDialog titleMark={<ComputerMark />} body={<>Stops <IdChip /> now.</>} />'))).toEqual([]);
    expect(slotHits(page('<DangerConfirm body={<>Deletes <IdChip />.</>} />'))).toEqual([]);
    expect(slotHits(page('<Dialog body={<>One line.</>} outcomeDetail={<>Refused by <IdChip /></>} />'))).toEqual([]);
    expect(slotHits(page('<OutcomeBanner body={<>Nothing was removed. <IdChip /></>} />'))).toEqual([]);
    expect(slotHits(page('<ConfirmDialog body={<p>Stops it.</p>} />'))).toEqual(['ConfirmDialog.body: a raw <p> in a inline-text slot']);
    expect(slotHits(page('<ConfirmDialog body={<ItemList />} />'))).toEqual(['ConfirmDialog.body: <ItemList> in a inline-text slot']);
    expect(slotHits(page('<OutcomeBanner body={<TextButton />} />'))).toEqual(['OutcomeBanner.body: <TextButton> in a inline-text slot']);
    // the text pieces that render block markup are refused where a sentence goes
    expect(slotHits(page('<OutcomeBanner body={<AddressRow />} />'))).toEqual(['OutcomeBanner.body: <AddressRow> in a inline-text slot']);
    expect(slotHits(page('<Dialog outcomeDetail={<ErrorDetails />} />'))).toEqual(['Dialog.outcomeDetail: <ErrorDetails> in a inline-text slot']);
    expect(slotHits(page('<Drawer subtitle={<IpInfo />} />'))).toEqual(['Drawer.subtitle: <IpInfo> in a inline-text slot']);
    expect(slotHits(page('<DangerConfirm body={<AddressRow />} />'))).toEqual(['DangerConfirm.body: <AddressRow> in a inline-text slot']);
    // a title mark is a mark only: no words, no chip, no link
    expect(slotHits(page('<Dialog titleMark={<IdChip />} />'))).toEqual(['Dialog.titleMark: <IdChip> in a mark slot']);
    expect(slotHits(page('<ConfirmDialog titleMark={<>Stop</>} />'))).toEqual(['ConfirmDialog.titleMark: visible text in a mark slot']);
    expect(slotHits(page('<DangerConfirm titleMark={<Icon name="warn" label="Warning" />} />'))).toEqual(['DangerConfirm.titleMark: <Icon> in a mark slot']);
    expect(slotHits(page('<Dialog titleMark={<Monogram name="Ada" />} />'))).toEqual(['Dialog.titleMark: <Monogram> in a mark slot']);
    expect(slotHits(page('<Drawer subtitle={<>On <IdChip /></>} primary={<Button />} secondary={<TextButton />} actions={<Button />} outcome={<Outcome />} />'))).toEqual([]);
    expect(slotHits(page('<Drawer footer={<FormFooter />} />'))).toEqual([]);
    expect(slotHits(page('<Drawer footer={<><Outcome /><DrawerCancel /><Button /></>} />'))).toEqual([]);
    expect(slotHits(page('<Drawer footer={<div><Button /></div>} />'))).toEqual(['Drawer.footer: a raw <div> in a footer slot']);
    expect(slotHits(page('<Drawer outcome={<Button />} />'))).toEqual(['Drawer.outcome: <Button> in a outcome slot']);
    expect(slotHits(page('<Drawer primary={<p>Go</p>} />'))).toEqual(['Drawer.primary: a raw <p> in a actions slot']);
  });

  it('CellLines in a DataTable cell passes the cell on: words and kit cell parts pass; a raw <br> or a block part is the hit', () => {
    const page = (el: string) =>
      `import { CellLines, DataTable, RowNote, Tag, IdChip, ItemList } from '@kit';\nconst cols = [{ id: 'a', cell: (x: any) => ${el} }];\nexport function V() { return <DataTable columns={cols} />; }`;
    expect(slotHits(page('<CellLines>photos.zip<RowNote>From the backup</RowNote></CellLines>'))).toEqual([]);
    expect(slotHits(page('<CellLines><IdChip />{x.on && <Tag>Shared</Tag>}</CellLines>'))).toEqual([]);
    expect(slotHits(page('<CellLines>photos.zip<br />From the backup</CellLines>'))).toEqual(['DataTable cell: a raw <br> in a cell slot']);
    expect(slotHits(page('<CellLines>photos.zip{x.on && <ItemList />}</CellLines>'))).toEqual(['DataTable cell: <ItemList> in a cell slot']);
    // children given as a prop are the same content: a self-closing CellLines or one with tags
    expect(slotHits(page('<CellLines children={<br />} />'))).toEqual(['DataTable cell: a raw <br> in a cell slot']);
    expect(slotHits(page('<CellLines children={<>a<br /></>}></CellLines>'))).toEqual(['DataTable cell: a raw <br> in a cell slot']);
    expect(slotHits(page('<CellLines children={x.on && <ItemList />} />'))).toEqual(['DataTable cell: <ItemList> in a cell slot']);
    expect(slotHits(page('<CellLines children={<RowNote>From the backup</RowNote>} />'))).toEqual([]);
    // a spread can carry children the walk cannot read: fail closed
    expect(slotHits(page('<CellLines {...{ children: <br /> }} />'))).toEqual(['DataTable cell: a spread on <CellLines> (its children cannot be read) in a cell slot']);
    expect(slotHits(page('<CellLines {...x.props}>a</CellLines>'))).toEqual(['DataTable cell: a spread on <CellLines> (its children cannot be read) in a cell slot']);
    // the same raw <br> written in the cell itself, for comparison: CellLines neither hides nor adds a hit
    expect(slotHits(page('<>photos.zip<br />From the backup</>'))).toEqual(['DataTable cell: a raw <br> in a cell slot']);
  });
});
