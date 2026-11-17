// The page-anatomy detector. Import-resolving: a JSX tag is traced to the module
// that defines it (through `@kit` and the other aliases, `as` renames and local re-exports, depth <= 5), so a renamed
// or re-exported legacy component is found under any name. One detector, three wrappers: the ESLint rule `hub/anatomy`,
// the stylelint rule `hub/page-anatomy-css`, and the ratchets (app/conformance.anatomy.test.ts and the layout gate,
// which runs a PINNED copy of this file).
//
// A hit is keyed (rule, file, scope). scope is `main`, or `overlay:<id>` when the hit's JSX lies inside a kit
// Drawer/Sheet/Dialog/ConfirmDialog/DangerConfirm that carries a literal overlayId, or inside a component whose only
// render sites are inside one. Counts are authored sites: a JSX element written once counts once, however many rows it
// renders, and a second offending sibling counts again.
//
// Everything is syntactic (TypeScript parser, no type checker), so a rule says what it proves. No hit is reported for
// a tag that cannot be traced (a prop forwarded as a tag, a computed name).
//
// Usage from code:
//   const A = require('./anatomy.cjs');
//   const files = A.readTree(srcDir);                 // { 'pages/x/view.tsx': text, ... } (hub/src relative)
//   const { hits, counts, overlays } = A.scan(files, { registry });   // overlays: every literal overlay id, as the scopes read it
// Registries (renderers, slots, surfaces) default to DEFAULT_REGISTRY; loadRegistry(dir, exceptionsPath) reads
// kit/layouts/anatomy/{renderers,slots,surfaces}.ts when they exist (plain data exports, evaluated without imports), and the
// exception list (app/conformance/exceptions.ts), whose ui.* entries drop the hits they cover (scan's usedExceptions).
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');

/**
 * typescript: $HUB_TYPESCRIPT (the layout gate sets it for its pinned copy), else the hub's own install next to this file,
 * else whatever `require` finds. A module that is not the compiler API (a runtime's bundled stub) is skipped.
 */
function loadTs() {
  const usable = (m) => m && m.ScriptTarget && typeof m.createSourceFile === 'function' && typeof m.forEachChild === 'function';
  const tries = [
    () => process.env.HUB_TYPESCRIPT && require(process.env.HUB_TYPESCRIPT),
    () => require(path.join(__dirname, '..', '..', '..', 'node_modules', 'typescript')),
    () => require(path.join(__dirname, '..', '..', 'node_modules', 'typescript')),
    () => require('typescript'),
  ];
  for (const t of tries) {
    try {
      const m = t();
      if (usable(m)) return m;
    } catch {
      /* next */
    }
  }
  throw new Error('anatomy.cjs: typescript not found (set HUB_TYPESCRIPT to its folder)');
}
const ts = loadTs();
// The ui.* family: its own consumer lists and rules, run at the end of scan, keyed like the anatomy rules.
const UI = require('./anatomy-ui.cjs');

const RULES = [
  'layout.heading',
  'layout.landmark',
  'layout.text',
  'layout.state',
  'layout.stateMissing',
  'layout.legacy',
  'layout.localChrome',
  'layout.marker',
  'layout.actionRow',
  'layout.manifest',
  'layout.cssMargin',
  'layout.cssType',
  'layout.cssReach',
  'layout.cssGap',
  'layout.inlineSpacing',
  'layout.prose',
  'layout.slot',
  'layout.visual',
  'layout.screens',
  'layout.overlayId',
  'layout.explain',
  'layout.explainGap',
  'layout.looseFaqLink',
  'layout.bandsPerSection',
  'layout.drawerOl',
  ...UI.UI_RULES,
];
/**
 * Form sections in overlays (reported apart from the layout rows, as scan().formHits; the ratchet and its counted debt
 * list are app/conformance.formsection.test.ts and app/conformance/formSection.debt.ts):
 *   form.flat       an overlay body (per file and overlay scope) with FORM_FLAT_MIN or more kit fields outside a kit
 *                   group: a long form is cut into FormSections. One hit per file and scope, at its first loose field.
 *   form.handGroup  a group made by hand in an overlay body: a <fieldset>, or an element drawn with a page class named
 *                   like a label (`s.fieldLabel`, `s.groupLabel`) that is not a <label>: a group's name is a
 *                   FormSection title, a step above the field labels, never a field label.
 * Fields are counted where they are written: a field in a FormSection or SettingGroup of the same file is grouped; a
 * condition's branches all count (a form that swaps five fields for five others is still a long form).
 */
const FORM_RULES = ['form.flat', 'form.handGroup'];
const FORM_FIELDS = [
  'TextField', 'Select', 'Combobox', 'EntityPicker', 'NumberField', 'DateField', 'DateTimeField', 'TimeField', 'RadioGroup', 'RadioCards',
  'CheckboxGroup', 'Checkbox', 'Switch', 'SecretField', 'SecretInput', 'PathField', 'ScheduleField', 'OtpField', 'IpAllowlistField',
  'ColorPicker', 'EnvRows', 'CodeEditor', 'PickerField', 'ComputerPicker', 'ModelPickField', 'AddressField',
];
const FORM_GROUPS = ['FormSection', 'SettingGroup'];
const FORM_FLAT_MIN = 5;
const FORM_LABEL_TAGS = ['span', 'p', 'div', 'legend', 'strong', 'b', 'h2', 'h3', 'h4', 'h5', 'h6'];
const FORM_LABEL_CLASS = /\.(?:[A-Za-z0-9_]*Label|label)\b/;

/** Rules whose hits are in CSS files. */
const CSS_RULES = ['layout.cssMargin', 'layout.cssType', 'layout.cssReach', 'layout.cssGap', ...UI.UI_CSS_RULES];

// ── default registries (what the kit's slots.ts / renderers.ts / surfaces.ts hold; loadRegistry reads them when present) ──
const DEFAULT_REGISTRY = {
  // Table R: who may emit landmarks directly. Headings are a hit everywhere: the way to a heading is `Heading`.
  // `landmarks` is '*' or the list of tags the module may write. `text`/`actionRow` exempt a module from those rules too.
  renderers: [
    { path: 'kit/layouts/', landmarks: '*' },
    { path: 'kit/states/', landmarks: [] },
    { path: 'kit/overlays/', landmarks: '*' },
    { path: 'kit/data/DataTable.tsx', landmarks: ['nav'] },
    { path: 'kit/pickers/ModelListbox.tsx', landmarks: ['nav'] },
    { path: 'kit/agent/', landmarks: '*' },
    { path: 'kit/forms/CodeEditor.tsx', landmarks: '*' },
    { path: 'shell/TopBar.tsx', landmarks: '*', text: true },
    { path: 'shell/TopBarParts.tsx', landmarks: '*', text: true },
    { path: 'shell/Sidebar.tsx', landmarks: '*', text: true },
    { path: 'shell/BottomNav.tsx', landmarks: '*', text: true },
    { path: 'shell/LockScreen.tsx', landmarks: '*', text: true },
    { path: 'shell/AskDock.tsx', landmarks: '*', text: true },
    { path: 'shell/Switchers.tsx', landmarks: '*', text: true },
    { path: 'shell/ShortcutsSheet.tsx', landmarks: '*', text: true },
    { path: 'shell/notices.tsx', landmarks: '*', text: true },
  ],
  // Roots consumers write against. Kit internals (kit/** outside gallery) are not consumers.
  consumerRoots: ['pages/', 'shell/', 'ask/', 'kit/gallery/'],
  // The shell look owners: the app frame owns its look through tokens, so ui.pageLook skips them. A stem
  // names `<stem>.tsx` and `<stem>.module.css`; an entry ending in '/' names a folder. The kit's renderers.ts, when present, holds the list.
  lookOwners: ['shell/AppShell', 'shell/TopBar', 'shell/TopBarParts', 'shell/Sidebar', 'shell/BottomNav', 'shell/LockScreen', 'shell/AskDock', 'shell/ShortcutsSheet', 'shell/notices'],
  pageRoots: ['pages/'],
  // Components that ARE the legacy API (defining module + name). Resolved through barrels, so any import path finds them.
  legacy: [
    { file: 'kit/layouts/Layouts.tsx', names: ['Panel', 'Section', 'PageFrame'] },
  ],
  legacyPageOnly: ['Tabs'],
  // The strict anatomy family lives under this folder.
  strictDir: 'kit/layouts/anatomy/',
  strictSections: ['Section', 'SubSection', 'AnatomySection'],
  dataLeaves: ['ItemList', 'ProblemList', 'DataTable'],
  overlays: ['Drawer', 'Sheet', 'Dialog', 'ConfirmDialog', 'DangerConfirm'],
  archetypes: {
    TablePage: 'table',
    ListDetailPage: 'list-detail',
    DetailPage: 'detail',
    SettingsPage: 'settings',
    DashboardPage: 'dashboard',
    WizardPage: 'wizard',
    CanvasPage: 'canvas',
    SplitLayout: 'workspace',
  },
  actionComponents: ['Button', 'IconButton', 'LinkButton', 'TextButton', 'ActionMenu', 'ReasonButton', 'ItemActions', 'CopyButton', 'Fab', 'QrButton', 'FileButton'],
  // Table S. slot type per kit component and prop. An unregistered JSX-valued prop on a kit component is a hit.
  slots: {
    DataTable: { empty: 'empty', bulkActions: 'actions', rowActions: 'actions', toolbarEnd: 'actions', toolbarNote: 'text', renderExpanded: 'body', cardRender: 'body', cell: 'text' },
    SettingRow: { label: 'text', help: 'text', actions: 'actions', children: 'field' },
    SettingSwitch: { label: 'text', help: 'text', actions: 'actions' }, // a SettingRow whose control is the kit Switch
    Band: { children: 'text', actions: 'actions', attach: 'attached' },
    OutcomeBanner: { children: 'text', actions: 'actions' },
    EmptyState: { body: 'text', action: 'actions', secondary: 'actions', hint: 'text' },
    IntroPanel: { actions: 'intro-actions', hide: 'actions' },
    ErrorState: { body: 'text', action: 'actions', secondary: 'actions' },
    PageHeader: { actions: 'actions' },
    FirstUseState: { body: 'text', action: 'actions', learn: 'text', hint: 'text' },
    NoAccessState: { body: 'text', action: 'actions' },
    SessionView: { empty: 'empty' },
    DetailPage: { notice: 'notices' },
    SettingsPage: { summary: 'summary', notice: 'notices' },
    // A wizard's footer is the kit WizardFooter: its primary and secondary are buttons; back is
    // a handler and a flag (explain.ownShapes), never caller content.
    WizardPage: { summary: 'summary', aside: 'side-card', notice: 'notices', footer: 'wizard-footer' },
    WizardFooter: { primary: 'actions', secondary: 'actions' },
    ConversationView: { activityExtra: 'text', actions: 'actions', empty: 'empty', top: 'notices', pane: 'surface', composer: 'surface', session: 'surface', usage: 'surface' },
    Sheet: { info: 'body' },
    // Track's step and Verdict: inline-text tags, result, why and next; body slot and facts.
    TrackStep: { tags: 'inline-text', result: 'inline-text', why: 'inline-text' },
    Verdict: { next: 'inline-text', slot: 'body', facts: 'body' },
    // A Widget's head actions (kit/layouts/Layouts.tsx): the buttons at the end of its title row.
    Widget: { actions: 'actions' },
    // A CodeEditor's own toolbar (kit/forms/CodeEditor.tsx): the page's controls after Find and the caret line.
    CodeEditor: { tools: 'actions' },
    // A LoadScreen (kit/states/LoadScreen.tsx): one notice under its plate, the page's buttons under its cards, and what to do next.
    LoadScreen: { notice: 'notices', actions: 'actions', next: 'body' },
  },
  slotTypes: {
    // an IntroPanel's first actions: a button or a link button, or a Handoff around one (a web-only page's link)
    'intro-actions': ['Button', 'LinkButton', 'Handoff'],
    text: ['IdChip', 'Ids', 'Code', 'CodeLine', 'StatusPill', 'Tag', 'Monogram', 'ComputerMark', 'Icon', 'Link', 'Kbd', 'Shortcut', 'AddressText', 'AddressRow', 'IpInfo', 'Spinner', 'When', 'Meter', 'ProgressCell', 'UnknownCell', 'Sparkline', 'ErrorDetails', 'FaqLink', 'ChatNames'],
    actions: ['FaqLink', 'Button', 'IconButton', 'LinkButton', 'TextButton', 'ActionMenu', 'ReasonButton', 'ItemActions', 'CopyButton', 'Fab', 'QrButton', 'PageLinkTo', 'FileButton'],
    field: ['TextField', 'ScheduleField', 'SearchField', 'Switch', 'Checkbox', 'CheckboxGroup', 'NumberField', 'Select', 'Combobox', 'EntityPicker', 'RadioGroup', 'SecretField', 'SecretInput', 'SegmentedControl', 'IdChip', 'Ids', 'Code', 'StatusPill', 'Tag', 'Icon', 'Link', 'AddressText', 'AddressRow', 'CopyField', 'Button', 'TextButton', 'IconButton', 'LinkButton', 'ActionMenu', 'ReasonButton'],
    // a Band's `attach`: the field it warns about, or a kit list whose rows it is about (PickerPanel, SettingGroup: both point
    // their aria-describedby at the Band's sentence). Its own type so the `field` slots (a SettingRow's control) never take a list
    attached: ['TextField', 'ScheduleField', 'SearchField', 'Switch', 'Checkbox', 'CheckboxGroup', 'NumberField', 'Select', 'Combobox', 'EntityPicker', 'RadioGroup', 'SecretField', 'SecretInput', 'SegmentedControl', 'IdChip', 'Ids', 'Code', 'StatusPill', 'Tag', 'Icon', 'Link', 'AddressText', 'AddressRow', 'CopyField', 'Button', 'TextButton', 'IconButton', 'LinkButton', 'ActionMenu', 'ReasonButton', 'PickerPanel', 'SettingGroup'],
    // StepList and Why: a step's how and its one closed explanation sit in a section's body.
    // Track and Verdict: a guided setup's steps and the panel's top plate.
    body: ['SubSection', 'ItemList', 'ProblemList', 'TileGrid', 'ChoiceCards', 'DataTable', 'SettingGroup', 'Facts', 'StaticTable', 'ActionCards', 'StatStrip', 'Form', 'CodeBlock', 'StepList', 'Why', 'Track', 'Verdict', 'Disclosure', 'Visual', 'Surface', 'FilterChips', 'Band', 'OutcomeBanner', 'Outcome'],
    notices: ['Band', 'OutcomeBanner', 'Outcome', 'HeldBand', 'PauseBand'],
    summary: ['Section', 'SubSection', 'Facts', 'StatStrip', 'ItemList', 'ProblemList', 'Link', 'Disclosure', 'Band', 'OutcomeBanner', 'Outcome'],
    // the flow aside draws no frame: one AnatomySection may be its card
    'side-card': ['Section', 'SubSection', 'Facts', 'StatStrip', 'ItemList', 'ProblemList', 'Link', 'Disclosure', 'Band', 'OutcomeBanner', 'Outcome', 'AnatomySection'],
    surface: ['Rail', 'Composer', 'SessionView', 'Usage', 'Surface', 'SplitLayout', 'ChatPane', 'Pane'],
    empty: ['EmptyState', 'FirstUseState', 'NoAccessState'],
    'wizard-footer': ['WizardFooter'],
  },
  // A kit part that stands in a slot only through one prop (a Band with `attach` wraps its field, so it fits a field slot, but
  // only when the attached element is itself a `field` part, never a list; its attach prop is checked as an `attached` slot by the
  // table above). Without that prop the part keeps the plain slotTypes rule.
  slotVia: { Band: { attach: ['field'] } },
  // Props that never carry caller content, even when written as an element (cheap, avoids noise).
  slotIgnoreProps: ['children', 'key', 'ref', 'className', 'style', 'as', 'icon', 'leading', 'trailing', 'component'],
  visualGraphic: ['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc', 'defs', 'linearGradient', 'radialGradient', 'stop', 'use', 'clipPath', 'mask', 'pattern', 'symbol', 'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feFlood', 'feComposite', 'feMerge', 'feMergeNode', 'animate', 'animateTransform', 'img', 'canvas'],
  visualKit: ['Meter', 'Sparkline', 'Bar', 'ProgressRing', 'VisualLabel', 'Icon', 'ComputerMark', 'Monogram', 'Fragment'],
  proseNames: ['Prose', 'Steps'],
  // where the kit's Prose/Steps are defined: the strict family and the reply renderer the `@kit` barrel exports today
  proseOrigins: ['kit/layouts/anatomy/', 'kit/agent/Reply.tsx'],
  proseDir: 'pages/guide/',
  // exact files outside the Guide that render chat messages with the kit's agent-message Prose: message text, not page prose
  // (a Bot's activity thread; the Logs Explain drawer's answer, which is a model's Markdown text like a reply)
  proseConsumers: ['pages/bots/parts/ActivityTab.tsx', 'pages/logs/parts/ExplainDrawer.tsx'],
  // The layout rules (loose FaqLinks, Bands per section, drawer lists), on consumer files outside the gallery (its specimens show each piece alone):
  // layout.looseFaqLink   a FaqLink outside a Why or a Faq (children) and outside a Band's or a Section header's actions
  // layout.bandsPerSection more than one Band in one Section, SubSection or overlay body (a condition's branches count as the
  //                       larger one, not the sum; a nested Section counts on its own)
  // layout.drawerOl       an <ol> inside an overlay body (an overlay in the file, or the overlay scope its component renders in)
  //                       outside a StepList, which is the kit's steps list
  drafty: {
    faqIn: ['Why', 'Faq'],
    faqActions: ['Band', 'Section', 'SubSection', 'AnatomySection'],
    bandHosts: ['Section', 'SubSection', 'AnatomySection', 'Drawer', 'Sheet', 'Dialog', 'ConfirmDialog', 'DangerConfirm'],
    band: ['Band'],
    // kit component -> { list prop: the option key drawn in the section while that option is picked } (kit/forms/more.tsx
    // RadioGroup Option.reveal): its Bands count in the section holding the group, the reveals of one group as the larger one
    optionReveals: { RadioGroup: { options: 'reveal' } },
    stepLists: ['StepList', 'Steps'],
  },
  // layout.explain / layout.explainGap: which pages are measured and what counts as a region of explanation text
  explain: {
    roots: ['pages/'],
    skip: ['pages/guide/'],
    budget: 150,
    step: 75,
    faqBudget: 600,
    faqPrefix: 'faq.',
    // kit component -> the props that hold the region's own text (its children always do)
    regions: {
      Section: ['description'],
      SubSection: ['description'],
      AnatomySection: ['description'],
      Panel: ['description'],
      Widget: ['description'],
      EmptyState: ['body', 'hint'],
      IntroPanel: ['eyebrow', 'lead', 'computer'],
      FirstUseState: ['body', 'learn', 'hint'],
      NoAccessState: ['body', 'hint'],
      Disclosure: ['description'],
      SettingRow: ['help'],
      SettingSwitch: ['help'], // a SettingRow whose control is the kit Switch: its help is the row's own region too
      // outcomeDetail / outcomeNote: the sentences on the outcome's line (kit/overlays/Dialog.tsx), text of the overlay like its body
      Dialog: ['body', 'outcomeDetail', 'outcomeNote'],
      ConfirmDialog: ['body', 'outcomeDetail', 'outcomeNote'],
      DangerConfirm: ['body'],
      Drawer: ['intro', 'subtitle', 'reason'], // reason: the foot's one line about the primary
      Sheet: ['info'],
      // a PickCard (kit/pickers/PickCard.tsx) is one press: its tagline, end words, muted note and disabled reason are the card's
      // own text, judged per card (its title is its name, `meta` its mono facts line: data)
      PickCard: ['line', 'end', 'note', 'disabledReason'],
      // Why: a closed Disclosure whose answer (its children) is a region of its own, like a Disclosure's
      Why: [],
      // Track step and Verdict: a step is a region of its own under a Track that shows one
      // open body at a time (a region named by its heading): its why sentence and its body count there (see pagedRegions). The
      // Verdict plate is one too (a named group): its sentence (children), its muted next line and its count line (`count`, the
      // shown progress words; `segments` is the bar's data, a label: see ownLabels). A done step's `result` ("1 group") and a step's
      // `tags` are shown words of the step too: read where the step counts (its region under a paged Track, else the panel).
      TrackStep: ['why', 'result', 'tags'],
      Verdict: ['next', 'count'],
    },
    // a region only inside its paging parent showing one body at a time: a TrackStep under a Track that is not `flat`. A flat Track
    // (kit/data/Track.tsx: every body shown at once), a `flat` the rule cannot read as false, or a step with no Track the rule can
    // see: the step's region props and body count in the panel that holds it, as one wall of text on screen
    pagedRegions: { TrackStep: 'Track' },
    // archetype props holding a list of objects: `sections` entries are Sections (a region each); the others are panels of the page body
    listProps: ['sections', 'tabs', 'steps'],
    // kit overlays whose `faq` prop is the DialogFaq descriptor { item, label }, rendered as <FaqLink item={faq.item}>{faq.label}</FaqLink> (kit/overlays/Dialog.tsx)
    overlayFaq: ['Dialog', 'ConfirmDialog', 'DangerConfirm', 'Why'], // Why: the same { item, label } descriptor, its answer's closing FaqLink
    // kit components whose data prop is a list of groups of steps (StepList, kit/data/StepList.tsx): a group's `where` and `open` and
    // an item's `id` and `act` are labels, links or controls; an item's `text` and `note` are read. The list may be a const grown by `push`
    // in its own scope (each pushed argument an entry), and an entry or a spread may be a conditional (alternatives: the longer shows)
    stepLists: { StepList: { prop: 'groups', items: 'items', text: ['text', 'note'] } },
    // kit hooks that return the kit's own text, read as that string (their arguments are data): the one pause description (kit/agent/Pause.tsx)
    kitTextCalls: { usePauseDescription: { strings: 'kit/agent/Pause.strings.en.json', key: 'pause.description' } },
    // page hooks whose value is data (a model's display name), never authored text: matched by the binding they resolve to (the
    // export's name and its file), so another function of the same name is an ordinary call
    dataCalls: { useBotModelLabel: 'pages/bots/data.ts', useBotModelLabels: 'pages/bots/data.ts' },
    // the archetype roots whose `faq` prop is the page FAQ (app/conformance.anatomy.faq.test.ts ARCHETYPE): its answers are measured in
    // pages/<page>/faq.ts against faqBudget, so a host region that renders the page (pages/ai/tab.tsx renders the Models page) never counts them again
    rootFaq: ['DetailPage', 'TablePage', 'SettingsPage', 'DashboardPage', 'WizardPage', 'ListDetailPage'],
    // the layouts and strict sections whose `state` prop is a SectionState the kit draws (kit/layouts/anatomy/StateBody.tsx: notHere is an
    // EmptyState): an inline object is an EmptyState's worth of text
    paneState: ['DetailPage', 'ListDetailPage', 'AnatomySection', 'SubSection'],
    listText: ['description', 'content', 'children', 'body', 'help', 'hint'],
    // shown by kind, never counted: notices (they have their own later rule), data leaves, labels and links (a SectionMenuItem's words
    // are a menu row's label, like a button's)
    exempt: ['Band', 'OutcomeBanner', 'Outcome', 'HeldBand', 'PauseBand', 'ErrorState', 'ErrorDetails', 'DataTable', 'ItemList', 'ProblemList', 'Facts', 'StatStrip', 'Heading', 'PageHeader', 'Tabs', 'FaqLink', 'Faq', 'SectionMenuItem'],
    exemptTags: ['a', 'button', 'label', 'summary', 'option', 'th', 'td', 'code', 'kbd', 'svg', 'title', 'script', 'style', 'input', 'select', 'textarea', 'pre'],
    // banner: the page-level notices of DetailPage and ListDetailPage, read like children (a Band in it stays exempt)
    // next: Verdict's muted next-action line, read like its sentence
    // promises: a secret field's promise lines under its description, text of the region that holds the field
    textProps: ['body', 'description', 'help', 'hint', 'learn', 'info', 'intro', 'note', 'message', 'text', 'caption', 'content', 'detail', 'details', 'explanation', 'footNote', 'toolbarNote', 'subtitle', 'summary', 'aside', 'pane', 'footer', 'discardText', 'stopLine', 'checkLine', 'detailFooter', 'below', 'empty', 'banner', 'next', 'nextPending', 'promises', 'children'],
    // props that are labels, ids, styling, handlers or descriptors of data, never explanation: exempt by kind. Any OTHER prop of a kit component that carries authored text is a gap (the rule does not know it yet)
    // kit component -> props that are labels or data on THAT component only (labelPattern applies to every component): the
    // layouts' view switch (PageViews: a bar label and view labels) and a CodeEditor's validation problems
    // ({ line, message }: error output, like error/errorText), and a setting row's outcome
    // line (`detail`: the page's own sentence for a refusal, handed to the exempt Outcome), and a
    // PathField's folder reads (`read`: the entries the field lists; `browseComputer`: the same reads from the computer's top
    // folder, for Browse: data), a CardGrid's per-item
    // functions (`keyOf`, `textOf`: an item's key and its type-ahead name; `renderCard`: one PickCard per item, whose content the
    // slot table checks as pick-card), and FilterChips' `filters` (each chip's label and its options' labels: labels, the
    // same words a DataTable's filter chips carry; an option's `description` is text, ownLabelText below)
    ownLabels: {
      DetailPage: ['views'],
      ListDetailPage: ['views'],
      TablePage: ['views'],
      CodeEditor: ['problems'],
      SettingRow: ['detail'],
      SettingSwitch: ['detail'],
      // a FormFooter's refusal sentence is its outcome line (the exempt Outcome, shown only on a definite refusal), like a row's detail.
      // Its `reason` is the footer's state line (kit/forms/Form.tsx: what pressing the primary does or why it is off, in the place of
      // "Unsaved changes"): a state line beside the button, like a field's errorMessage, never part of a region's explanation
      FormFooter: ['failedDetail', 'reason'],
      // why a dialog's soft-disabled primary cannot act yet (kit/overlays/Dialog.tsx): the button's description and tooltip, as a kit
      // Button's disabledReason is (exempt with the Button)
      Dialog: ['primaryDisabledReason'],
      // the address of the computer's Agent app the conversation's links open (kit/agent/ConversationView.tsx): a URL, never words
      ConversationView: ['agentUrl'],
      ConfirmDialog: ['confirmDisabledReason'],
      // an EnvRows' row words (kit/forms/EnvRows.tsx `labels`): each row's field and remove-button names, the two placeholders and
      // the add button's word, labels by kind (its `description` stays text)
      EnvRows: ['labels'],
      PathField: ['read', 'browseComputer'],
      // the Add my IP read (kit/forms/IpAllowlistField.tsx `readIp`: a function that answers the caller's address, built by
      // readIpFrom from the page's own read): data, never text. The notes the field shows for it are the kit's own strings
      IpAllowlistField: ['readIp'],
      FileChooser: ['reads', 'computers', 'computersStatus', 'places', 'accept', 'limits', 'start', 'problem', 'current', 'recents'],
      Why: ['question'], // the disclosure's label
      CardGrid: ['keyOf', 'textOf', 'renderCard'],
      FilterChips: ['filters'],
      Verdict: ['segments'], // the progress bar's states, data (its words are `count`)
      AddressField: ['url'], // an address: data
      CodeBlock: ['lines'], // captioned command lines: a caption is a label, the code is data
      LoadScreen: ['stages'], // the bar's stages: a name and a state each, labels (its cards are `items`, its line `status`)
      // Allow everything's confirm (kit/agent/ApprovalMode.tsx): `data` is the approvals read, `setYolo` the host's switch (a
      // handler) and `yoloWhy` only takes the offer away (the confirm never draws it); its words are the kit's own strings
      AllowEverythingConfirm: ['data', 'setYolo', 'yoloWhy'],
      // a drop area's target (kit/data/drag.tsx DropArea `drop`): its words show beside the pointer only while something is
      // dragged over it, labels, as a DataTable's drop words are
      DropArea: ['drop'],
    },
    // own-label props that still carry explanation in some fields: every member of these names anywhere in the prop's value (an
    // inline option, one a callback returns) is read as text, before the whole value goes to the label sink. FilterChips: an
    // option's `description` is the line under its label in the chip's menu (kit/data/FilterChips.tsx)
    ownLabelText: { FilterChips: { filters: ['description'] } },
    // object props read only when written as a plain object literal: the listed keys are text, every other key a label or an action.
    // Any other value (a name, a call, a spread, a computed key, a condition) is read as an unknown prop: a gap when it carries authored
    // text, never dropped. TrackStep `foot` { say, primary, secondary }: `say` is the step's footnote
    // Ledger (kit/data/Ledger.tsx): `total` { label, amount } is a label and data; `attach` { text, action } is the strip under the
    // list, whose `text` is one sentence of the region holding the ledger and whose `action` is its button
    literalText: { TrackStep: { foot: ['say'] }, Ledger: { total: [], attach: ['text'] }, ConversationView: { capability: ['text'] } },
    // object props whose listed key is a region of its own and whose other keys are labels, handlers or flags. A setting row's
    // `reveal` (kit/forms/SettingGroup.tsx SettingReveal): `editor` is drawn under the row only while it is open; `label` and
    // `saveLabel` are button words. Read as a plain object literal, also through a const that is never written again and a
    // condition between the literal and nothing; any other value is a gap (stricter than an unknown prop: the editor holds fields)
    // kit parts allowed in text slots whose `text` is the page's own sentence (ChatNames draws it with the chat apps' marks):
    // never exempt by kind, the sentence counts in the region that shows it
    sentenceParts: ['ChatNames'],
    // text props that mostly show data: a done step's result ("T Main", "1 group") is a value the page read, so a bare name in it
    // is data; words the page wrote there are counted like any text
    // A PickCard's line and note often show a catalogue record's own words (a program's tagline): words the page wrote there
    // count in the card, a name the rule cannot trace (a record's field) is data
    dataText: { TrackStep: ['result'], PickCard: ['line', 'note'] },
    // JSX children that show data while the component carries the named attribute (written on the element, not spread): a setting
    // row with `reveal` shows the setting as stored beside its Change… opener (who a share is for, its end, its addresses), read as
    // a dataText prop is. Only when every child is text or an expression; element children are walked as before
    dataChildren: { SettingRow: 'reveal', GroupRow: 'reveal' },
    literalRegions: { SettingRow: { reveal: ['editor'] }, SettingSwitch: { reveal: ['editor'] }, GroupRow: { reveal: ['editor'] } },
    // kit component -> { list prop: the option key whose content sits in the region holding the component }. A radio option's
    // `reveal` (kit/forms/more.tsx Option.reveal) is drawn under its radio while that option is picked, so its text counts where
    // the group is, as if its JSX sat there; one option is picked at a time, so the reveals of one group are alternatives. The list
    // is read as an inline array, a never-reassigned const, a conditional spread or a `.map` whose callback returns object
    // literals; the option's other keys are labels. Any other list value (a call, a prop) is read as a label, as before: a known
    // gap (a reveal inside it is not seen). Select and Combobox take the same Option type but ignore `reveal`
    // ExamplePicker / SystemSteps (kit/data/Steps.tsx) work the same way: one example or system shows at a time, with its own
    // lines (an example's `note` and `footer`; a system's `step`, `need`, `more` and its code block's `footer`); names, labels and
    // the code itself are labels and data. A list of keys reads them all for the option shown; `a.b` is member b of the option's
    // object at a
    optionReveals: { RadioGroup: { options: 'reveal' }, ExamplePicker: { examples: ['note', 'footer'] }, SystemSteps: { systems: ['step', 'need', 'more', 'code.footer'] } },
    // kit component -> object props whose fields are all labels or handlers: the prop is a label only when its value is an object
    // literal holding nothing but these keys (or a condition between such literals and nothing). Another key, a spread, a computed
    // key or any other value is read as usual, so authored text in it is still a gap. WizardFooter `back` is { onPress, isDisabled };
    // its label is the kit's own wizard.back string
    // each field names the only value form it takes: a handler (a function, a name or a member) or a flag (no string, JSX,
    // object, array or function anywhere in it); a method, an accessor or any other value is not the shape
    ownShapes: { WizardFooter: { back: { onPress: 'handler', isDisabled: 'flag' } } },
    // kit component -> its MenuList props (kit/overlays/Menu.tsx): read entry by entry, a separator ('-') is nothing, a group's `items` is
    // read the same way, menuText fields are explanation (a group's note included) and every other field is a label or data; a list, entry
    // or spread the rule cannot read is a gap, and so is a menu array or entry changed in place (push, a member write). The two branches of a
    // conditional spread (`...(cond ? [a] : [b])`) are alternatives: the longer one is what shows
    menus: { DetailPage: ['menu'] },
    menuText: ['description', 'disabledReason', 'note'],
    labelPattern: '^(title|label|name|placeholder|alt|tooltip|href|to|id|key|ref|className|style|icon|value|defaultValue|variant|tone|size|kind|type|mode|header|accent|status|stats|badge|chart|toolbar|actions|action|primary|secondary|pendingSecondary|notice|meta|selected|selectedKey|shortcut|outcome|known|columns|rows|items|options|tabs|steps|sections|emptyState|errorMessage|error|errorText|emptyText|doneText|cancel|placement|legend|code|realm|consequences|sendWhy|list|readOnly|disabled|expanded|maxValue|minValue|returnFocus|closeFocus)$|^(aria-|data-|on[A-Z]|(is|has|can|should)[A-Z])|(Label|Title|Name|Id|Key|Param|Class|Href|Icon|Ref)$',
  },
};

/** An explain.ownShapes value form: a handler is a function, a name or a member (its body is never rendered); a flag holds no
 *  string, template, JSX, object, array or function anywhere in it. */
function ownShapeValue(v, form) {
  const u = unparen(v);
  if (!u) return false;
  const ref = (x) => ts.isIdentifier(x) || (ts.isPropertyAccessExpression(x) && ref(unparen(x.expression)));
  if (form === 'handler') return ts.isArrowFunction(u) || ts.isFunctionExpression(u) || ref(u);
  if (form !== 'flag') return false;
  const bad = (x) =>
    ts.isStringLiteralLike(x) || ts.isTemplateExpression(x) || ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x) || ts.isObjectLiteralExpression(x) || ts.isArrayLiteralExpression(x) || ts.isFunctionLike(x) || !!ts.forEachChild(x, (c) => bad(c) || undefined);
  return !bad(u);
}
/** An explain.ownShapes reading of `ex`: 'ok' when it is an object literal whose every member is a plain or shorthand member named
 *  in `spec` holding that field's value form (no spread, method, computed or other key), or nothing, or a condition (holding no JSX)
 *  between such values; 'accessor' when a literal it holds has a get/set accessor or a method (a gap: its body is code the rule
 *  cannot read, and the usual reading skips it);
 *  else null (the prop is read as usual). */
function ownShapeOf(ex, spec, depth = 0) {
  const u = unparen(ex);
  if (!u || depth > 4) return null;
  if (u.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(u) && u.text === 'undefined')) return 'ok';
  if (ts.isConditionalExpression(u)) {
    if (hasJsx(u.condition)) return null;
    const a = ownShapeOf(u.whenTrue, spec, depth + 1);
    const b = ownShapeOf(u.whenFalse, spec, depth + 1);
    return a === 'accessor' || b === 'accessor' ? 'accessor' : a === 'ok' && b === 'ok' ? 'ok' : null;
  }
  if (!ts.isObjectLiteralExpression(u)) return null;
  if (u.properties.some((p) => ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isMethodDeclaration(p))) return 'accessor';
  const ok = u.properties.every((p) => {
    const k = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;
    if (!k || !Object.hasOwn(spec, k)) return false;
    if (ts.isPropertyAssignment(p)) return ownShapeValue(p.initializer, spec[k]);
    if (ts.isShorthandPropertyAssignment(p)) return ownShapeValue(p.name, spec[k]);
    return false;
  });
  return ok ? 'ok' : null;
}

const hasJsx = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n) || !!ts.forEachChild(n, (c) => hasJsx(c) || undefined);
/** the values of an object literal whose keys are exactly `item` and `label` (plain or shorthand, no spread or computed key), else null;
 *  the FAQ conformance reads overlay descriptors through this same function */
function overlayFaqOf(ex) {
  const u = unparen(ex);
  // shown only in some states: a conditional between the literal and nothing (`cond ? { item, label } : undefined`) is that literal
  if (u && ts.isConditionalExpression(u)) {
    const nothing = (e) => { const x = unparen(e); return x.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(x) && x.text === 'undefined'); };
    // one level only: the shown branch is the literal itself, never another conditional (a chain keeps the gap); the condition holds
    // no JSX (an element there would render outside this reading)
    if (hasJsx(u.condition)) return null;
    const shown = nothing(u.whenFalse) ? unparen(u.whenTrue) : nothing(u.whenTrue) ? unparen(u.whenFalse) : null;
    return shown && ts.isObjectLiteralExpression(shown) ? overlayFaqOf(shown) : null;
  }
  if (!u || !ts.isObjectLiteralExpression(u) || u.properties.length !== 2) return null;
  const vals = new Map();
  for (const pr of u.properties) {
    if (ts.isPropertyAssignment(pr) && ts.isIdentifier(pr.name)) vals.set(pr.name.text, pr.initializer);
    else if (ts.isShorthandPropertyAssignment(pr)) vals.set(pr.name.text, pr.name);
    else return null;
  }
  return vals.has('item') && vals.has('label') ? [vals.get('item'), vals.get('label')] : null;
}

// ── tiny helpers ─────────────────────────────────────────────────────────────────────────────────────────────────
const posix = (p) => p.split(path.sep).join('/');
const isTestFile = (f) =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) ||
  /(^|\/)(fixtures?|shots)[^/]*\.[cm]?[jt]sx?$/.test(f) ||
  /(^|\/)(__tests__|__mocks__|fixtures)\//.test(f) ||
  /(^|\/)(testing|e2e|e2e-focus|e2e-toolbar|test-setup)\.[cm]?[jt]sx?$/.test(f);
const isSourceFile = (f) => /\.(tsx|ts|jsx|js|mjs|cjs)$/.test(f) && !f.endsWith('.d.ts');
const startsWithAny = (f, list) => list.some((p) => f.startsWith(p));
const rendererFor = (reg, file) => reg.renderers.find((r) => (r.path.endsWith('/') ? file.startsWith(r.path) : file === r.path));
const isConsumer = (reg, file) => startsWithAny(file, reg.consumerRoots);

function lineOf(sf, node) {
  const p = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return { line: p.line + 1, col: p.character + 1 };
}
const text = (sf, n) => n.getText(sf);

/** Walk a tree reading every file under src (hub/src) that the detector may need: ts, tsx, js, jsx and css (the Hub allows JS: allowJs). */
/** A terminal sibling or terminal-only test: `<name>.term.<ext>` or `<name>.term.test.<ext>` (never `term/` the folder). */
const isTermFile = (name) => /\.term\.(test\.)?(tsx?|[cm]?jsx?)$/.test(name);

function readTree(srcDir) {
  const out = {};
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      // Terminal siblings (X.term.tsx, X.web.term.ts, their tests) are not web anatomy: they have their own gates (the
      // terminal prim contract, scripts/term/contract.ts and graph.ts).
      if (isTermFile(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (/\.(tsx?|[cm]?jsx?|css)$|strings\.en\.json$/.test(e.name)) out[r] = fs.readFileSync(path.join(dir, e.name), 'utf8');
    }
  };
  walk(srcDir, '');
  return out;
}

// ── registry loader (the kit's TS data files; evaluated without any import) ─────────────────────────────────────────────
function loadRegistry(anatomyDir, exceptionsPath) {
  const reg = JSON.parse(JSON.stringify(DEFAULT_REGISTRY));
  reg.exceptions = [];
  const exportsOf = (file) => {
    if (!fs.existsSync(file)) return null;
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = { exports: {} };
    vm.runInNewContext(js, { module: mod, exports: mod.exports, require: () => { throw new Error('registry files import nothing'); } }, { timeout: 2000 });
    return mod.exports;
  };
  // A missing exception list reads as empty, which can only add hits.
  const ex = exceptionsPath ? exportsOf(exceptionsPath) : null;
  if (ex && Array.isArray(ex.EXCEPTIONS)) reg.exceptions = ex.EXCEPTIONS.map((e) => ({ path: String(e.path), rules: [...e.rules], ...(e.sites ? { sites: [...e.sites] } : {}) }));
  if (!anatomyDir) return reg;
  const r = exportsOf(path.join(anatomyDir, 'renderers.ts'));
  if (r && r.RENDERERS) reg.renderers = r.RENDERERS;
  const s = exportsOf(path.join(anatomyDir, 'slots.ts'));
  if (s) {
    if (s.SLOTS) reg.slots = s.SLOTS;
    if (s.SLOT_TYPES) reg.slotTypes = s.SLOT_TYPES;
    if (s.PORTALS) reg.portals = s.PORTALS;
  }
  const f = exportsOf(path.join(anatomyDir, 'surfaces.ts'));
  if (f && f.SURFACES) reg.slotTypes.surface = f.SURFACES;
  return reg;
}

// ── the project: files, parsing, binding resolution ─────────────────────────────────────────────────────────────
const ALIASES = [
  [/^@kit$/, 'kit/index'],
  [/^@kit\//, 'kit/'],
  [/^@core$/, 'core/index'],
  [/^@core\//, 'core/'],
  [/^@app\//, 'app/'],
  [/^@shell\//, 'shell/'],
  [/^@ask\/io$/, 'ask/io'],
];

const scriptKindOf = (f) => (f.endsWith('.tsx') ? ts.ScriptKind.TSX : f.endsWith('.jsx') ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(f) ? ts.ScriptKind.JS : ts.ScriptKind.TS);

function createProject(files, opts = {}) {
  const reg = opts.registry || DEFAULT_REGISTRY;
  const parsed = new Map();
  const infos = new Map();
  const has = (f) => Object.prototype.hasOwnProperty.call(files, f);

  const sourceOf = (file) => {
    let sf = parsed.get(file);
    if (!sf) {
      sf = ts.createSourceFile(file, files[file], ts.ScriptTarget.Latest, true, scriptKindOf(file));
      parsed.set(file, sf);
    }
    return sf;
  };

  /** Resolve a module specifier from a file to { file } (in the project), { kit:true } (a kit alias with no file), or { ext }. */
  function resolveSpec(from, spec) {
    let base = null;
    let kitAlias = false;
    for (const [re, to] of ALIASES) {
      if (re.test(spec)) {
        base = spec.replace(re, to);
        kitAlias = spec === '@kit' || spec.startsWith('@kit/');
        break;
      }
    }
    if (base === null && spec.startsWith('.')) base = posix(path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)));
    if (base === null) return { ext: spec };
    const stem = base.replace(/\.([cm]?jsx?|tsx?)$/, ''); // './x.js' names the source './x.ts' under TS ESM spelling
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    for (const cand of [base, ...exts.map((x) => base + x), ...exts.map((x) => `${base}/index${x}`), ...(stem !== base ? exts.map((x) => stem + x) : [])]) if (has(cand) && isSourceFile(cand)) return { file: cand, kitAlias };
    return kitAlias ? { kit: true, kitAlias } : { ext: spec };
  }

  function infoOf(file) {
    let info = infos.get(file);
    if (info) return info;
    const sf = sourceOf(file);
    info = { sf, imports: new Map(), named: new Map(), stars: [], defaultLocal: null, defs: new Map(), declared: new Set() };
    infos.set(file, info);
    const exported = (n) => !!(ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export);
    const isDefault = (n) => !!(ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Default);
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
        const spec = st.moduleSpecifier.text;
        const c = st.importClause;
        if (!c) continue;
        if (c.name) info.imports.set(c.name.text, { spec, name: 'default', typeOnly: c.isTypeOnly });
        if (c.namedBindings) {
          if (ts.isNamespaceImport(c.namedBindings)) info.imports.set(c.namedBindings.name.text, { spec, name: '*', typeOnly: c.isTypeOnly });
          else for (const e of c.namedBindings.elements) info.imports.set(e.name.text, { spec, name: (e.propertyName || e.name).text, typeOnly: c.isTypeOnly || e.isTypeOnly });
        }
      } else if (ts.isExportDeclaration(st)) {
        const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
        if (st.exportClause && ts.isNamedExports(st.exportClause)) {
          for (const e of st.exportClause.elements) {
            const exportName = e.name.text;
            const orig = (e.propertyName || e.name).text;
            if (spec) info.named.set(exportName, { from: spec, name: orig, node: e });
            else info.named.set(exportName, { local: orig, node: e });
          }
        } else if (spec && !st.exportClause) info.stars.push(spec);
        else if (spec && st.exportClause && ts.isNamespaceExport(st.exportClause)) info.named.set(st.exportClause.name.text, { from: spec, name: '*', node: st });
      } else if (ts.isExportAssignment(st)) {
        const e = st.expression;
        info.defaultLocal = ts.isIdentifier(e) ? e.text : { expr: e };
      } else if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) {
        if (st.name) {
          info.defs.set(st.name.text, st);
          info.declared.add(st.name.text);
          if (exported(st)) info.named.set(isDefault(st) ? 'default' : st.name.text, { local: st.name.text });
          if (exported(st) && isDefault(st)) info.defaultLocal = st.name.text;
        } else if (isDefault(st)) info.defaultLocal = { expr: st };
      } else if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name)) continue;
          info.declared.add(d.name.text);
          if (d.initializer) info.defs.set(d.name.text, d);
          if (exported(st)) info.named.set(d.name.text, { local: d.name.text });
        }
      } else if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isEnumDeclaration(st)) {
        info.declared.add(st.name.text);
      }
    }
    return info;
  }

  const isKitFile = (f) => f.startsWith('kit/');

  /** Binding of an export of a file: { origin, def, file, via, kit, pub? } or null. `def` is always the declared name (every
   *  identity check reads it); a kit part exported under another name (`export { VerdictRoot as Verdict }`) also carries
   *  `pub`, the exported name, which only the slot table falls back to (slotName). */
  function exportBinding(file, name, depth, kitHop) {
    if (depth > 5) return null;
    const info = infoOf(file);
    const entry = info.named.get(name) || (name === 'default' && info.defaultLocal && typeof info.defaultLocal === 'string' ? { local: info.defaultLocal } : null);
    if (entry && entry.from) {
      const t = resolveSpec(file, entry.from);
      if (t.file) return exportBinding(t.file, entry.name, depth + 1, kitHop || t.kitAlias);
      if (t.kit) return { origin: 'kit', def: entry.name, file: null, via: true, kit: true };
      return { origin: 'external', def: entry.name, file: null, via: true, spec: entry.from, kit: false };
    }
    if (entry && entry.local) {
      if (info.imports.has(entry.local) && !info.defs.has(entry.local)) {
        const b = traceLocal(file, entry.local, depth + 1);
        return b ? { ...b, via: true, kit: b.kit || kitHop } : null;
      }
      const pub = isKitFile(file) && name !== 'default' && name !== entry.local ? { pub: name } : {};
      return { origin: isKitFile(file) ? 'kit' : 'local', def: entry.local, ...pub, file, via: true, kit: isKitFile(file) || !!kitHop };
    }
    for (const spec of info.stars) {
      const t = resolveSpec(file, spec);
      if (!t.file) continue;
      const b = exportBinding(t.file, name, depth + 1, kitHop || t.kitAlias);
      if (b) return b;
    }
    return null;
  }

  /** Binding of a name used in a file. */
  function traceLocal(file, local, depth = 0) {
    if (depth > 5) return null;
    const info = infoOf(file);
    const imp = info.imports.get(local);
    if (!imp) {
      if (info.declared.has(local)) return { origin: isKitFile(file) ? 'kit' : 'local', def: local, file, via: false, kit: isKitFile(file) };
      return null;
    }
    const t = resolveSpec(file, imp.spec);
    if (t.file) {
      if (imp.name === '*') return { origin: isKitFile(t.file) ? 'kit' : 'local', def: '*', file: t.file, via: true, kit: !!t.kitAlias || isKitFile(t.file), ns: true };
      const b = exportBinding(t.file, imp.name, depth + 1, t.kitAlias);
      return b ? { ...b, via: true, kit: b.kit || !!t.kitAlias } : { origin: t.kitAlias ? 'kit' : 'local', def: imp.name, file: null, via: true, kit: !!t.kitAlias };
    }
    if (t.kit) return { origin: 'kit', def: imp.name, file: null, via: true, kit: true, ns: imp.name === '*' };
    return { origin: 'external', def: imp.name, file: null, via: true, spec: imp.spec, kit: false };
  }

  return { reg, files, has, sourceOf, infoOf, resolveSpec, traceLocal, exportBinding, isKitFile };
}


// ── CSS ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const stripCssComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
function splitTop(sel) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}
/** Each style rule with its own declarations; nested rules resolve their selector against the parent. */
function cssRules(css) {
  const s = stripCssComments(css);
  const out = [];
  const stack = [];
  const ownerAt = () => {
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k].rule) return k;
    return -1;
  };
  const owner = () => stack[ownerAt()]?.rule ?? null;
  const decl = (from, to) => {
    const d = s.slice(from, to);
    const c = d.indexOf(':');
    const r = owner();
    if (!r || c < 0 || !d.trim()) return;
    const lead = d.length - d.trimStart().length;
    // cond: written inside an at-rule nested in the rule (`.a { @media (...) { display: grid; } }`), so it holds only under that condition.
    r.decls.push({ prop: d.slice(0, c).trim().toLowerCase(), value: d.slice(c + 1).trim(), at: from + lead, cond: ownerAt() < stack.length - 1 });
  };
  let start = 0;
  let paren = 0;
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote && s[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') {
      paren++;
      continue;
    }
    if (ch === ')') {
      paren = Math.max(0, paren - 1);
      continue;
    }
    if (paren) continue;
    if (ch === '{') {
      const head = s.slice(start, i).trim();
      if (head.startsWith('@')) stack.push({ rule: null });
      else {
        const parent = owner();
        const sel = !parent
          ? head
          : splitTop(parent.sel)
              .flatMap((p) => splitTop(head).map((h) => (h.includes('&') ? h.replace(/&/g, p.trim()) : `${p.trim()} ${h.trim()}`)))
              .join(', ');
        const rule = { sel, at: start + (s.slice(start, i).length - s.slice(start, i).trimStart().length), decls: [], under: stack.some((e) => !e.rule) };
        out.push(rule);
        stack.push({ rule });
      }
      start = i + 1;
    } else if (ch === ';') {
      decl(start, i);
      start = i + 1;
    } else if (ch === '}') {
      decl(start, i);
      stack.pop();
      start = i + 1;
    }
  }
  return { rules: out, text: s };
}

// ── layout.cssGap ──
// A page's vertical rhythm is the kit's: a `row-gap`, or the first value of `gap` (the row gap), larger than `--sp-2` is a hit. The direction is
// never assumed. Not counted: the small steps by name (`--sp-0`..`--sp-2`, `--gap-line`, `--gap-block`), any value that resolves to 8px or less, and a
// gap PROVEN horizontal: the gap's own rule leaves display, direction and wrap as literal keywords (in declaration order, `!important` wins,
// `flex-flow` sets both and resets the one it leaves out) so that it is a flex row that does not wrap, AND no other rule in the module sets
// display, flex-direction, flex-wrap or flex-flow at all (a class applied beside it could turn the row into a column). TSX is never read to learn
// which classes go together.
const GAP_STEP_PX = 8; // --sp-2 as kit/tokens.css has it; the scan reads the token itself when the file is there
const GAP_PROP = /^(?:row-)?gap$/;
const GAP_NAMED = /^var\(\s*--(?:sp-[012]|gap-line|gap-block)\s*\)$/;
const FLOW_PROP = /^(?:display|flex-direction|flex-wrap|flex-flow)$/;
const NOT_RESOLVED = Symbol('not resolved');
/**
 * The custom properties declared by a set of rules, name -> value. The token file is read as written (the last unconditional declaration wins).
 * A module is read for one gap's own rule `own`: a property resolves only when that rule declares it, unconditionally (no at-rule
 * above it) and without `!important`, and no other rule with the same selector declares it too; a later declaration in the same rule wins,
 * as in CSS. Every other case is null (unresolved, and the gap is counted), and another selector's declarations are not read at all.
 */
function cssVars(rules, own) {
  const vars = {};
  for (const r of rules) {
    if (own !== undefined && r !== own && r.sel !== own.sel) continue;
    for (const d of r.decls) {
      if (!d.prop.startsWith('--') || ((d.cond || r.under) && own === undefined)) continue;
      const important = /!\s*important\s*$/i.test(d.value);
      vars[d.prop] = own !== undefined && (d.cond || r.under || important || r !== own) ? null : d.value.replace(/!\s*important\s*$/i, '').trim();
    }
  }
  return vars;
}
/** A length in px, or null when it does not resolve: px, rem, a bare number, var() through `vars` (with its fallback), and calc()/min()/max() of such parts. */
function cssPx(value, vars, depth = 0) {
  if (depth > 8) return null;
  const s = value.trim();
  let i = 0;
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  const fail = () => {
    throw NOT_RESOLVED;
  };
  const args = () => {
    const out = [];
    ws();
    if (s[i] !== '(') fail();
    i++;
    for (;;) {
      out.push(sum());
      ws();
      if (s[i] === ',') i++;
      else if (s[i] === ')') {
        i++;
        return out;
      } else fail();
    }
  };
  const factor = () => {
    ws();
    if (s[i] === '-') {
      i++;
      return -factor();
    }
    if (s[i] === '(') {
      const v = args();
      return v.length === 1 ? v[0] : fail();
    }
    const num = /^(?:\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (num) {
      i += num[0].length;
      const unit = /^[a-z%]*/i.exec(s.slice(i))[0].toLowerCase();
      i += unit.length;
      if (unit === '' || unit === 'px') return +num[0];
      if (unit === 'rem') return +num[0] * 16;
      return fail();
    }
    const fn = /^[a-z-]+/i.exec(s.slice(i));
    if (!fn) return fail();
    const name = fn[0].toLowerCase();
    i += fn[0].length;
    if (name === 'calc') {
      const v = args();
      return v.length === 1 ? v[0] : fail();
    }
    if (name === 'min') return Math.min(...args());
    if (name === 'max') return Math.max(...args());
    if (name === 'var') {
      ws();
      if (s[i] !== '(') fail();
      let d = 1;
      const from = ++i;
      while (i < s.length && d) {
        if (s[i] === '(') d++;
        else if (s[i] === ')') d--;
        i++;
      }
      if (d) fail();
      const inner = s.slice(from, i - 1);
      const comma = inner.indexOf(',');
      const key = (comma < 0 ? inner : inner.slice(0, comma)).trim();
      const src = key in vars ? vars[key] : comma < 0 ? undefined : inner.slice(comma + 1);
      const v = src == null ? null : cssPx(src, vars, depth + 1);
      return v == null ? fail() : v;
    }
    return fail();
  };
  const term = () => {
    let v = factor();
    for (;;) {
      ws();
      if (s[i] === '*') {
        i++;
        v *= factor();
      } else if (s[i] === '/') {
        i++;
        v /= factor();
      } else return v;
    }
  };
  function sum() {
    let v = term();
    for (;;) {
      ws();
      if (s[i] === '+' || (s[i] === '-' && /\s/.test(s[i - 1] || ''))) {
        const plus = s[i++] === '+';
        const w = term();
        v = plus ? v + w : v - w;
      } else return v;
    }
  }
  try {
    const v = sum();
    ws();
    return i === s.length && Number.isFinite(v) ? v : null;
  } catch (e) {
    if (e === NOT_RESOLVED) return null;
    throw e;
  }
}
/** The first top-level value of a `gap` shorthand value (its row gap). */
function firstTop(v) {
  let depth = 0;
  for (let k = 0; k < v.length; k++) {
    if (v[k] === '(') depth++;
    else if (v[k] === ')') depth--;
    else if (depth === 0 && /\s/.test(v[k])) return v.slice(0, k);
  }
  return v;
}
/** The text a lone `var(--x, fallback)` stands for, followed through chains of such variables; null when a variable it needs is unresolved; any other value is returned as it is. */
function expandVar(value, vars) {
  let v = value.trim();
  for (let hop = 0; hop < 8; hop++) {
    if (!/^var\(/i.test(v)) return v;
    let depth = 0;
    let end = -1;
    for (let k = 3; k < v.length && end < 0; k++) {
      if (v[k] === '(') depth++;
      else if (v[k] === ')' && --depth === 0) end = k;
    }
    if (end !== v.length - 1) return v;
    const inner = v.slice(4, end);
    const comma = inner.indexOf(',');
    const key = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    const src = key in vars ? vars[key] : comma < 0 ? null : inner.slice(comma + 1);
    if (src == null) return null;
    v = src.trim();
  }
  return null;
}
/** The first top-level value of a gap declaration: all of `row-gap`, the row gap of the `gap: a b` shorthand (read through variables that hold the whole shorthand). */
function gapFirst(d, vars) {
  const v = d.value.replace(/!\s*important\s*$/i, '').trim();
  if (d.prop !== 'gap' || GAP_NAMED.test(v)) return v;
  const whole = expandVar(v, vars);
  return firstTop(whole === null ? v : whole);
}
/** True when `value` is one of the small steps: by name, or something that resolves to `--sp-2` or less. */
const gapSmall = (value, vars, step) => {
  if (value.toLowerCase() === 'normal' || GAP_NAMED.test(value)) return true;
  const px = cssPx(value, vars);
  return px !== null && px <= step;
};
/** The rule lays out a flex row that does not wrap, from its own declarations in order; anything it cannot read literally is not proven. */
function provenRow(decls) {
  const win = {};
  const put = (prop, v, important) => {
    if (win[prop] && win[prop].important && !important) return;
    win[prop] = { v, important };
  };
  for (const d of decls) {
    const important = /!\s*important\s*$/i.test(d.value);
    const v = d.value.replace(/!\s*important\s*$/i, '').trim().toLowerCase();
    if (d.prop === 'display') put('display', v, important);
    else if (d.prop === 'flex-direction') put('dir', v, important);
    else if (d.prop === 'flex-wrap') put('wrap', v, important);
    else if (d.prop === 'flex-flow') {
      let dir = 'row';
      let wrap = 'nowrap';
      let ok = true;
      let sawDir = false;
      let sawWrap = false;
      for (const p of v.split(/\s+/)) {
        if (/^(?:row|row-reverse|column|column-reverse)$/.test(p) && !sawDir) [dir, sawDir] = [p, true];
        else if (/^(?:nowrap|wrap|wrap-reverse)$/.test(p) && !sawWrap) [wrap, sawWrap] = [p, true];
        else ok = false;
      }
      put('dir', ok ? dir : null, important);
      put('wrap', ok ? wrap : null, important);
    }
  }
  return /^(?:inline-)?flex$/.test(win.display?.v ?? '') && /^(?:row|row-reverse)$/.test(win.dir?.v ?? '') && (!win.wrap || win.wrap.v === 'nowrap');
}
const lineAt = (t, i) => t.slice(0, i).split('\n').length;

// ── the scan ─────────────────────────────────────────────────────────────────────────────────────────────────────
const HEADING = /^h[1-6]$/;
const LANDMARKS = new Set(['section', 'header', 'footer', 'aside', 'nav', 'article', 'hr']);
const TEXT_PARENTS = new Set(['p', 'div', 'span', 'li', 'strong', 'em', 'small', 'label']);
const STATE_COMPONENTS = new Set(['EmptyState', 'ErrorState', 'Skeleton']);
const TRANSPARENT = new Set(['Suspense', 'Fragment', 'StrictMode', 'Activity', 'ErrorBoundary']);
const INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'details', 'iframe', 'object', 'embed', 'foreignObject']);
const SPACING_PROP = /^(?:margin|padding|gap|rowGap|columnGap)/;
const PARSE_METHODS = new Set(['split', 'startsWith', 'slice', 'match', 'replace', 'indexOf', 'substring', 'substr', 'lastIndexOf', 'matchAll', 'search']);

const isJsxEl = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);
const openingOf = (n) => (ts.isJsxElement(n) ? n.openingElement : n);
const childrenOf = (n) => (ts.isJsxElement(n) || ts.isJsxFragment(n) ? n.children : []);
const unparen = (e) => {
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e))) e = e.expression;
  return e;
};
const attrName = (a) => (ts.isJsxAttribute(a) ? (ts.isIdentifier(a.name) ? a.name.text : a.name.getText()) : null);
function attrLiteral(a) {
  if (!a || !ts.isJsxAttribute(a)) return undefined;
  const v = a.initializer;
  if (!v) return true;
  if (ts.isStringLiteral(v)) return v.text;
  if (ts.isJsxExpression(v) && v.expression) {
    const e = unparen(v.expression);
    if (ts.isStringLiteralLike(e)) return e.text;
  }
  return undefined;
}
/** The statically known text of a property name (identifier, string, number, or a computed string literal); undefined when it is dynamic. */
function propKey(n) {
  if (!n) return undefined;
  if (ts.isIdentifier(n) || ts.isStringLiteralLike(n) || ts.isNumericLiteral(n)) return n.text;
  if (ts.isComputedPropertyName(n)) {
    const e = unparen(n.expression);
    if (ts.isStringLiteralLike(e)) return e.text;
  }
  return undefined;
}
/**
 * How a component reads its props: destructured names (local -> prop), the whole props object, a rest binding. `excl` holds the
 * props destructured out of the rest binding; `dynExcl` is set when a destructured key is computed, so the rest binding carries nothing.
 */
function propsBindings(fn) {
  const out = { names: new Map(), whole: new Set(), rest: new Set(), excl: new Set(), dynExcl: false };
  const p = fn && fn.parameters && fn.parameters[0];
  if (!p) return out;
  if (ts.isIdentifier(p.name)) out.whole.add(p.name.text);
  else if (ts.isObjectBindingPattern(p.name)) {
    for (const el of p.name.elements) {
      const key = el.dotDotDotToken ? undefined : propKey(el.propertyName || el.name);
      // a destructured property is not in the rest binding any more
      if (!el.dotDotDotToken) {
        if (key !== undefined) out.excl.add(key);
        else out.dynExcl = true;
      }
      if (!ts.isIdentifier(el.name)) continue;
      if (el.dotDotDotToken) out.rest.add(el.name.text);
      else if (key !== undefined) out.names.set(el.name.text, key);
    }
  }
  return out;
}
const attrExpr = (a) => (ts.isJsxAttribute(a) && a.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : undefined);
/** whether `ex` is the value of `op`'s own attribute `name`, written on it (not one a spread supplies) */
const ownAttr = (ex, op, name) => op.attributes.properties.some((a) => attrName(a) === name && attrExpr(a) === ex);

/** The steps one file's JSX walks (jsxContents, the fragment descents of slotProblems and the action-row scan, and slotHits'
 * matching) may take. Every path is walked, with no memo, so a helper called on many paths costs per path. Past the budget the
 * walk stops and the file fails closed: one layout.slot hit, "too deep to check" (scan, at the end of the file). The budget is set from the
 * walk counts measured on the current pages. */
const JSX_WALK_BUDGET = 20000;
/** Nesting bound of one jsxContents walk (conditions, calls, maps); past it the file fails closed like the budget. */
const JSX_DEPTH = 32;
let jsxBudget = { left: Infinity, at: null, cut: null };
/** one step of the file's JSX walk; false once the budget is spent (the walk then stops) */
function jsxStep(e) {
  if (jsxBudget.left-- > 0) return true;
  if (!jsxBudget.at) jsxBudget.at = e;
  return false;
}
/** Every JSX element/fragment a value expression can produce, through conditions, arrays, .map callbacks, function bodies and calls of
 * same-file functions. `seen` holds the functions and fragments being expanded on the current path, shared with the callers that
 * descend into fragments: a recursive helper ends there, and an entry is left on return, so a deep visit never hides a shallower one.
 * Nothing else is skipped. A node reached on two paths comes out twice; the callers count it once (slotHits). */
function jsxContents(e, out = [], depth = 0, seen = new Set()) {
  if (!e || !jsxStep(e)) return out;
  // past the nesting bound the walk stops and the file fails closed (jsxBudget.cut), never a silent clean
  if (depth > JSX_DEPTH) { if (!jsxBudget.cut) jsxBudget.cut = e; return out; }
  e = unparen(e);
  if (isJsxEl(e) || ts.isJsxFragment(e)) out.push(e);
  else if (ts.isIdentifier(e)) {
    // const pane = <div />; … pane={pane}: the hoisted value is the caller content
    const init = initializerOf(e);
    if (init) jsxContents(init, out, depth + 1, seen);
  } else if (ts.isConditionalExpression(e)) {
    jsxContents(e.whenTrue, out, depth + 1, seen);
    jsxContents(e.whenFalse, out, depth + 1, seen);
  } else if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) jsxContents(e.right, out, depth + 1, seen);
    else if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
      jsxContents(e.left, out, depth + 1, seen);
      jsxContents(e.right, out, depth + 1, seen);
    }
  } else if (ts.isArrayLiteralExpression(e)) for (const x of e.elements) jsxContents(x, out, depth + 1, seen);
  else if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'map' && e.arguments[0]) jsxContents(e.arguments[0], out, depth + 1, seen);
  else if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) {
    // withOverview(listings): a call of a function declared in the file produces what that function returns
    const fn = localFnOf(e.expression);
    if (fn) jsxReturns(fn, out, depth, seen);
  } else if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) jsxReturns(e, out, depth, seen);
  return out;
}
/** What a function returns, for jsxContents: skipped while the function is already being expanded on this path (`seen`). */
function jsxReturns(fn, out, depth, seen) {
  if (seen.has(fn)) return;
  seen.add(fn);
  if (fn.body && !ts.isBlock(fn.body)) jsxContents(fn.body, out, depth + 1, seen);
  else for (const r of returnsOf(fn)) jsxContents(r, out, depth + 1, seen);
  seen.delete(fn);
}
/** The function an identifier names when it is declared in the file: a function declaration, or a const bound to an arrow or function expression. */
function localFnOf(id) {
  const d = localDecl(id);
  if (!d) return null;
  if (ts.isFunctionDeclaration(d)) return d.body ? d : null;
  if (ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.parent.flags & ts.NodeFlags.Const && isFnValue(d.initializer)) return unparen(d.initializer);
  return null;
}
/** Return expressions of a function, not entering nested functions. */
function returnsOf(fn) {
  const out = [];
  const visit = (n) => {
    if (n !== fn && ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
    ts.forEachChild(n, visit);
  };
  if (fn.body) {
    if (ts.isBlock(fn.body)) ts.forEachChild(fn.body, visit);
    else out.push(fn.body);
  }
  return out;
}
const isFnValue = (e) => !!e && (ts.isArrowFunction(unparen(e)) || ts.isFunctionExpression(unparen(e)));

/** The initializer of a variable where it is used (nearest enclosing block / file that declares it). */
function initializerOf(id) {
  for (let n = id.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n) && n.parameters.some((p) => bindsName(p.name, id.text))) return undefined;
    const sts = ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n) ? n.statements : null;
    if (!sts) continue;
    for (const s of sts) {
      if (!ts.isVariableStatement(s)) continue;
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === id.text) return d.initializer;
        if (bindsName(d.name, id.text)) return undefined;
      }
    }
  }
  return undefined;
}
function bindsName(b, name) {
  if (ts.isIdentifier(b)) return b.text === name;
  return b.elements.some((e) => !ts.isOmittedExpression(e) && bindsName(e.name, name));
}
/** Every name a binding (an identifier or a destructuring pattern) binds, in order. */
function boundNames(b, out = []) {
  if (ts.isIdentifier(b)) out.push(b.text);
  else for (const e of b.elements) if (!ts.isOmittedExpression(e)) boundNames(e.name, out);
  return out;
}
/** root -> (name -> its first `var` declaration under root): one walk per var scope instead of one per lookup.
 *  Keyed by the parsed node, so a reparsed file gets a fresh index; a parsed tree must not be changed after a lookup (no caller
 *  does: every scan parses its files fresh and only reads them), or the index answers for the old tree. */
const hoistedVarIndex = new WeakMap();
/** The first `var` declaration of `name` in a function body or module, not entering nested functions: every `var` of one name is one binding. */
function hoistedVar(root, name) {
  let idx = hoistedVarIndex.get(root);
  if (!idx) {
    idx = new Map();
    const visit = (n) => {
      if (n !== root && (ts.isFunctionLike(n) || ts.isClassStaticBlockDeclaration(n) || ts.isModuleBlock(n))) return; // each is its own var scope
      if (ts.isVariableDeclarationList(n) && !(n.flags & ts.NodeFlags.BlockScoped)) {
        for (const d of n.declarations) for (const k of boundNames(d.name)) if (!idx.has(k)) idx.set(k, d);
      }
      ts.forEachChild(n, visit);
    };
    visit(root);
    hoistedVarIndex.set(root, idx);
  }
  return idx.get(name) || null;
}
/**
 * The declaration an identifier reference resolves to when it is declared in the file (a parameter, a variable, a function or class,
 * a catch variable, a for-initializer), nearest scope first; null when it is an import or a global. Used wherever a name must mean the
 * binding it was meant to prove (the React factory, matchScreen and its argument), not just the same spelling. One binding has one
 * answer: every `var` of a name in a function resolves to its first declaration, a switch's clauses share one lexical scope, and a named
 * class expression binds its own name inside itself. The parsed tree is read only: var scopes are indexed once (hoistedVar).
 */
function localDecl(id) {
  const name = id.text;
  const lexical = (sts) => {
    for (const st of sts) {
      if (ts.isVariableStatement(st)) {
        if (!(st.declarationList.flags & ts.NodeFlags.BlockScoped)) continue; // var: hoisted to its function
        for (const d of st.declarationList.declarations) if (bindsName(d.name, name)) return d;
      } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name && st.name.text === name) return st;
    }
    return null;
  };
  for (let n = id.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) {
      const prm = n.parameters.find((q) => bindsName(q.name, name));
      if (prm) return prm;
      if (ts.isFunctionExpression(n) && n.name && n.name.text === name) return n;
      const v = n.body && ts.isBlock(n.body) ? hoistedVar(n.body, name) : null;
      if (v) return v;
    }
    if (ts.isClassExpression(n) && n.name && n.name.text === name) return n;
    if (ts.isCatchClause(n) && n.variableDeclaration && bindsName(n.variableDeclaration.name, name)) return n.variableDeclaration;
    if ((ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n)) && n.initializer && ts.isVariableDeclarationList(n.initializer) && n.initializer.flags & ts.NodeFlags.BlockScoped) {
      for (const d of n.initializer.declarations) if (bindsName(d.name, name)) return d;
    }
    let d = null;
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n)) d = lexical(n.statements);
    else if (ts.isCaseBlock(n)) d = lexical(n.clauses.flatMap((c) => [...c.statements]));
    if (d) return d;
    if (ts.isClassStaticBlockDeclaration(n) || ts.isModuleBlock(n)) {
      const v = hoistedVar(n, name); // its own var scope
      if (v) return v;
    }
    if (ts.isSourceFile(n)) return hoistedVar(n, name);
  }
  return null;
}
/** Literal strings an expression can take (string, conditional of strings). */
function stringsOf(e, out = []) {
  e = unparen(e);
  if (!e) return out;
  if (ts.isStringLiteralLike(e)) out.push(e.text);
  else if (ts.isConditionalExpression(e)) {
    stringsOf(e.whenTrue, out);
    stringsOf(e.whenFalse, out);
  }
  return out;
}

/** Whether an expression reads as a user-visible string (t('…'), a string/template literal, or those combined). */
function isStringish(e) {
  e = unparen(e);
  if (!e) return false;
  if (ts.isStringLiteralLike(e) || ts.isTemplateExpression(e)) return /\S/.test(ts.isStringLiteralLike(e) ? e.text : e.getText());
  if (ts.isCallExpression(e)) {
    const c = e.expression;
    if (ts.isIdentifier(c)) return /^(t|tt|tr|tl)$/.test(c.text);
    if (ts.isPropertyAccessExpression(c)) return c.name.text === 't';
    return false;
  }
  if (ts.isConditionalExpression(e)) return isStringish(e.whenTrue) || isStringish(e.whenFalse);
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (k === ts.SyntaxKind.PlusToken) return isStringish(e.left) || isStringish(e.right);
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) return isStringish(e.right);
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) return isStringish(e.left) || isStringish(e.right);
  }
  return false;
}

/** Slot types whose contents may be plain text; every other type takes elements only. 'header-text' is the text list less
 * AddressRow (the DetailHeader slots), 'inline-text' the text list less AddressRow, ErrorDetails and IpInfo (the overlay and
 * banner sentences), 'card-text' a PickCard's lines: text pieces that draw no control,
 * 'card-tag' a PickCard's end: its words ("Opens Programs") or a StatusPill, never a pressable part,
 * 'field-affix' a TextField's prefix or suffix: words ("https://", a unit) or a compact control; all in
 * kit/layouts/anatomy/slots.ts. */
const TEXT_SLOT_TYPES = ['text', 'cell', 'field', 'attached', 'header-text', 'inline-text', 'card-text', 'card-tag', 'field-affix'];

/** Named character references that render as whitespace; any other named reference (&amp;, &copy;) is visible text. */
const WHITESPACE_ENTITIES = new Set(['nbsp', 'ensp', 'emsp', 'emsp13', 'emsp14', 'numsp', 'puncsp', 'thinsp', 'hairsp', 'ThinSpace', 'VeryThinSpace', 'ZeroWidthSpace', 'NonBreakingSpace', 'MediumSpace', 'Tab', 'NewLine']);

/** Whether JSX text shows anything: JsxText keeps its character references undecoded, so decode them, then look for a non-whitespace character. */
function hasVisibleJsxText(text) {
  const rest = text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/g, (m, dec, hex, name) => {
    if (name) return WHITESPACE_ENTITIES.has(name) ? ' ' : m;
    const cp = parseInt(dec || hex, dec ? 10 : 16);
    if (!(cp >= 0 && cp <= 0x10ffff)) return m;
    const ch = String.fromCodePoint(cp);
    return /\s/.test(ch) || cp === 0x200b ? ' ' : m;
  });
  return /\S/.test(rest);
}

function scanUncached(files, opts = {}) {
  const reg = opts.registry || DEFAULT_REGISTRY;
  const P = createProject(files, { registry: reg });
  const only = opts.only ? new Set(opts.only) : null;
  const disabled = new Set(opts.disabled || []); // tests switch a rule off to prove their fixtures need it
  const hits = [];
  /** form.* hits (FORM_RULES): `{ rule, file, scope, line, msg }`, kept apart from the layout rows. */
  const formHits = [];
  /** `<file>|<scope>` -> { n: kit fields outside a group, first: the first of them }. */
  const formLoose = new Map();
  /** Every literal id an overlay element names, at the element that names it: the ids `overlay:<id>` scopes are keyed by. */
  const overlays = [];

  const scannedSource = Object.keys(files).filter((f) => isSourceFile(f) && !isTestFile(f) && /^(pages|kit|shell|ask)\//.test(f));
  const scannedCss = Object.keys(files).filter((f) => f.endsWith('.css') && f.startsWith('pages/') && !isTestFile(f));

  // ── element facts ──
  const elCache = new WeakMap();
  /** Facts of a JSX element node: tag (intrinsic names, maybe several), binding of a component tag, attributes. */
  function facts(file, node) {
    let f = elCache.get(node);
    if (f) return f;
    // an element resolves against the file it is written in, whatever file the caller is walking (JSX passed in from a caller's
    // props): the cache is by node, so a wrong-file first lookup would stick
    try {
      const sf = node.getSourceFile && node.getSourceFile();
      if (sf && sf.fileName) file = sf.fileName;
    } catch {}
    const op = openingOf(node);
    const tn = op.tagName;
    f = { node, op, file, intrinsic: [], binding: null, attrs: new Map(), spreads: [], defKey: null };
    for (const a of op.attributes.properties) {
      if (ts.isJsxSpreadAttribute(a)) f.spreads.push(a);
      else f.attrs.set(attrName(a), a);
    }
    if (ts.isIdentifier(tn)) {
      const dyn = initializerOf(tn);
      const strs = dyn ? stringsOf(dyn) : [];
      if (strs.length) f.intrinsic = strs;
      else if (/^[a-z]/.test(tn.text)) f.intrinsic = [tn.text];
      else f.binding = P.traceLocal(file, tn.text);
    } else if (ts.isPropertyAccessExpression(tn)) {
      let root = tn;
      while (ts.isPropertyAccessExpression(root)) root = root.expression;
      if (ts.isIdentifier(root)) {
        const b = P.traceLocal(file, root.text);
        if (b && b.ns && b.file) f.binding = P.exportBinding(b.file, tn.name.text, 1, b.kit) || { origin: b.origin, def: tn.name.text, file: null, via: true, kit: b.kit };
        else if (b && b.ns) f.binding = { origin: 'kit', def: tn.name.text, file: null, via: true, kit: true };
      }
    }
    if (f.binding && f.binding.file) f.defKey = `${f.binding.file}#${f.binding.def}`;
    elCache.set(node, f);
    return f;
  }
  const isKitDef = (f, names) => !!f.binding && f.binding.kit && names.includes(f.binding.def);
  const inKitNamed = (f, set) => !!f.binding && f.binding.kit && set.has(f.binding.def);
  /** Whether a file imports a binding named `undefined` (localDecl does not resolve imports). */
  const importsUndefined = (sf) => sf.statements.some((st) => {
    const c = ts.isImportDeclaration(st) && st.importClause;
    if (!c) return false;
    if (c.name && c.name.text === 'undefined') return true;
    const nb = c.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) return nb.name.text === 'undefined';
    return !!nb && nb.elements.some((el) => el.name.text === 'undefined');
  });
  /** Whether element facts `f` set a `state`: the attribute is written and its value is not literally nothing (`undefined`, the
   *  global: neither declared in the file nor imported, `null`, `void …`, or an empty `{}`), which a Section reads as no state. */
  const hasStateAttr = (f) => {
    const a = f.attrs.get('state');
    if (!a) return false;
    if (!a.initializer || !ts.isJsxExpression(a.initializer)) return true;
    const e = unparen(a.initializer.expression);
    if (!e) return false;
    return !(e.kind === ts.SyntaxKind.NullKeyword || ts.isVoidExpression(e) || (ts.isIdentifier(e) && e.text === 'undefined' && !localDecl(e) && !importsUndefined(e.getSourceFile())));
  };

  /** How many Bands a section's own body shows at once (layout.bandsPerSection): its children, read through fragments,
   *  expression containers, a condition (the larger branch), `&&` (its right side), `||`/`??` (the larger side), arrays (the sum)
   *  and a `.map`/`.flatMap` callback (an authored element counts once: the larger of its returns). A nested Band host is a
   *  section of its own (0 here); attributes are not the body. A walk past its node budget or depth limit returns `cut` (the
   *  caller reports the body as unreadable: never a count of what it read). */
  function bandCount(file, el, D) {
    let budget = 4000;
    let cut = false;
    const kids = (x, depth) => {
      let n = 0;
      for (const c of x.children) n += ofNode(c, depth + 1);
      return n;
    };
    const ofFn = (fn, depth) => {
      if (ts.isExpression(fn.body)) return ofNode(fn.body, depth + 1);
      let best = 0;
      const visit = (st) => {
        if (ts.isFunctionLike(st)) return;
        if (ts.isReturnStatement(st) && st.expression) best = Math.max(best, ofNode(st.expression, depth + 1));
        ts.forEachChild(st, visit);
      };
      ts.forEachChild(fn.body, visit);
      return best;
    };
    const ofNode = (x, depth) => {
      if (!x) return 0;
      if (--budget < 0 || depth > 60) {
        cut = true;
        return 0;
      }
      const u = unparen(x) || x;
      if (isJsxEl(u)) {
        const a = facts(file, u);
        // a Band whose `attach` provably holds one element (one JSX element, no later spread that could replace it) is that
        // field's own warning, drawn joined under it: not a strip of the section. An attach that may be empty draws a strip.
        if (isKitDef(a, D.band)) {
          const props = a.op.attributes.properties;
          const at = props.findIndex((p) => ts.isJsxAttribute(p) && attrName(p) === 'attach');
          if (at < 0 || props.slice(at + 1).some((p) => ts.isJsxSpreadAttribute(p))) return 1;
          const v = props[at].initializer;
          const e = v && ts.isJsxExpression(v) ? unparen(v.expression) : v;
          // visibly possibly empty: unset, null/undefined, a fragment, `x && <F />`, or a condition with an empty branch.
          // A name (`attach={field}`) is taken as the field it holds.
          const none = (x) => !x || (ts.isIdentifier(x) && x.text === 'undefined') || ts.isVoidExpression(x) || x.kind === ts.SyntaxKind.NullKeyword || ts.isJsxFragment(x);
          if (none(e)) return 1;
          if (ts.isBinaryExpression(e) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) return 1;
          if (ts.isConditionalExpression(e) && (none(unparen(e.whenTrue)) || none(unparen(e.whenFalse)))) return 1;
          return 0;
        }
        if (isKitDef(a, D.bandHosts)) return 0;
        return (ts.isJsxElement(u) ? kids(u, depth) : 0) + revealBands(a, depth);
      }
      if (ts.isJsxFragment(u)) return kids(u, depth);
      if (ts.isJsxExpression(u)) return u.expression ? ofNode(u.expression, depth + 1) : 0;
      if (ts.isConditionalExpression(u)) return Math.max(ofNode(u.whenTrue, depth + 1), ofNode(u.whenFalse, depth + 1));
      if (ts.isBinaryExpression(u)) {
        const k = u.operatorToken.kind;
        if (k === ts.SyntaxKind.AmpersandAmpersandToken) return ofNode(u.right, depth + 1);
        if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) return Math.max(ofNode(u.left, depth + 1), ofNode(u.right, depth + 1));
        return 0;
      }
      if (ts.isArrayLiteralExpression(u)) return u.elements.reduce((n, e) => n + ofNode(e, depth + 1), 0);
      if (ts.isCallExpression(u) && ts.isPropertyAccessExpression(u.expression) && /^(map|flatMap)$/.test(u.expression.name.text)) {
        const cb = u.arguments[0] && unparen(u.arguments[0]);
        return cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) ? ofFn(cb, depth) : 0;
      }
      return 0;
    };
    // a const's value (never a let or a destructured name): what an options list, an option or a reveal names
    const constInit = (id) => {
      const d = localDecl(id);
      return d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.parent && d.parent.flags & ts.NodeFlags.Const ? d.initializer : undefined;
    };
    const spent = (depth) => {
      if (--budget < 0 || depth > 60) {
        cut = true;
        return true;
      }
      return false;
    };
    // an option of a reveal list (D.optionReveals): the Bands its `key` holds (the last write of the key wins; a spread is not read)
    const optEntry = (e, key, depth, hops) => {
      if (spent(depth)) return 0;
      let u = unparen(e);
      if (u && ts.isIdentifier(u) && hops < 2) return optEntry(constInit(u), key, depth + 1, hops + 1);
      if (u && ts.isConditionalExpression(u)) return Math.max(optEntry(u.whenTrue, key, depth + 1, hops), optEntry(u.whenFalse, key, depth + 1, hops));
      if (!u || !ts.isObjectLiteralExpression(u)) return 0;
      let v = null;
      for (const pr of u.properties) {
        if (ts.isPropertyAssignment(pr) && propKey(pr.name) === key) v = pr.initializer;
        else if (ts.isShorthandPropertyAssignment(pr) && pr.name.text === key) v = pr.name;
      }
      if (!v) return 0;
      const w = unparen(v);
      return ofNode(w && ts.isIdentifier(w) ? constInit(w) : v, depth + 1);
    };
    // an option list: one option is picked at a time, so its count is the larger of its options' (never the sum)
    const optList = (e, key, depth, hops) => {
      if (spent(depth)) return 0;
      const u = unparen(e);
      if (!u) return 0;
      if (ts.isIdentifier(u)) return hops < 2 ? optList(constInit(u), key, depth + 1, hops + 1) : 0;
      if (ts.isConditionalExpression(u)) return Math.max(optList(u.whenTrue, key, depth + 1, hops), optList(u.whenFalse, key, depth + 1, hops));
      if (ts.isArrayLiteralExpression(u)) {
        let best = 0;
        for (const x of u.elements) best = Math.max(best, ts.isSpreadElement(x) ? optList(x.expression, key, depth + 1, hops) : optEntry(x, key, depth + 1, hops));
        return best;
      }
      if (ts.isCallExpression(u) && ts.isPropertyAccessExpression(u.expression) && /^(map|flatMap)$/.test(u.expression.name.text)) {
        const cb = u.arguments[0] && unparen(u.arguments[0]);
        if (!cb || !(ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) return 0;
        const rets = ts.isExpression(cb.body) ? [cb.body] : returnsOf(cb);
        return Math.max(0, ...rets.map((r) => optEntry(r, key, depth + 1, hops)));
      }
      return 0;
    };
    // a kit component whose options draw a reveal in this body (D.optionReveals: RadioGroup `options[].reveal`)
    const revealBands = (a, depth) => {
      const rv = D.optionReveals || {};
      const comp = Object.keys(rv).find((c) => isKitDef(a, [c]));
      if (!comp) return 0;
      let n = 0;
      for (const [prop, key] of Object.entries(rv[comp])) {
        const at = a.op.attributes.properties.find((p) => ts.isJsxAttribute(p) && attrName(p) === prop);
        if (at) n += optList(attrExpr(at), key, depth + 1, 0);
      }
      return n;
    };
    const n = ts.isJsxElement(el) ? kids(el, 0) : 0;
    return { n, cut };
  }

  function* ancestorEls(file, node) {
    for (let p = node.parent; p; p = p.parent) if (isJsxEl(p)) yield facts(file, p);
  }

  /** Nearest enclosing component definition key (`file#Name`), or null. */
  function enclosingComponent(file, node) {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isFunctionDeclaration(p) && p.name && /^[A-Z]/.test(p.name.text)) return { key: `${file}#${p.name.text}`, fn: p };
      if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && p.parent) {
        let q = p.parent;
        while (q && (ts.isParenthesizedExpression(q) || (ts.isCallExpression(q) && /^(memo|forwardRef)$/.test(q.expression.getText()))) ) q = q.parent;
        if (q && ts.isVariableDeclaration(q) && ts.isIdentifier(q.name) && /^[A-Z]/.test(q.name.text)) return { key: `${file}#${q.name.text}`, fn: p };
        if (q && ts.isExportAssignment(q)) return { key: `${file}#default`, fn: p };
      }
    }
    return null;
  }

  // ── pre-pass: overlay forwarders and render sites ──
  const forwarders = new Map(); // `file#Name` -> the props its render sites carry ids in (components that forward them into kit overlays)
  const renderSites = new Map(); // `file#Name` -> [{file,node}]
  const overlayNames = reg.overlays;
  const walkJsx = (file, fn) => {
    const sf = P.sourceOf(file);
    const v = (n) => {
      if (isJsxEl(n)) fn(n);
      ts.forEachChild(n, v);
    };
    v(sf);
  };
  for (const file of scannedSource) {
    walkJsx(file, (n) => {
      const f = facts(file, n);
      if (f.defKey) {
        const arr = renderSites.get(f.defKey) || [];
        arr.push({ file, node: n });
        renderSites.set(f.defKey, arr);
      }
    });
  }
  const isOverlayEl = (f) => (isKitDef(f, overlayNames) || (f.defKey && forwarders.has(f.defKey)));
  /** The attributes that carry an overlay element's ids: `overlayId` on a kit overlay, every forwarded prop on a wrapper. */
  const idAttrsOf = (f) => (isKitDef(f, overlayNames) ? ['overlayId'] : forwarders.get(f.defKey) || ['overlayId']);
  /**
   * What an overlay element says about the id in `attr`, taking the attributes and object spreads in source order (the last one
   * wins): { lit } a literal string, { prop } the enclosing component's own prop forwarded unchanged (a destructured name,
   * props.x, or the whole props / a rest spread that still carries it), or {}. Nothing else forwards. A name counts as the
   * component's prop only when it resolves to the component's own first parameter, never to a nested parameter or local of that
   * spelling. A spread of an unknown identifier leaves the earlier answer standing (it is common, and failing it would red every
   * dialog); a key computed from a variable inside an inline object is unresolved ({ unresolved }): the id is then not named,
   * whatever came before it.
   */
  function idOf(f, comp, attrIn) {
    const attr = attrIn || idAttrsOf(f)[0];
    const pb = comp ? propsBindings(comp.fn) : null;
    const prm = comp && comp.fn.parameters && comp.fn.parameters[0];
    const own = (id) => !!prm && localDecl(id) === prm;
    const fromExpr = (ex) => {
      const e = ex && unparen(ex);
      if (!e) return {};
      if (ts.isStringLiteralLike(e)) return e.text ? { lit: e.text } : {};
      if (!pb) return {};
      if (ts.isIdentifier(e) && pb.names.has(e.text) && own(e)) return { prop: pb.names.get(e.text) };
      const root = (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) && unparen(e.expression);
      if (root && ts.isIdentifier(root) && pb.whole.has(root.text) && own(root)) {
        const key = ts.isPropertyAccessExpression(e) ? e.name.text : e.argumentExpression && ts.isStringLiteralLike(unparen(e.argumentExpression)) ? unparen(e.argumentExpression).text : undefined;
        if (key !== undefined) return { prop: key };
      }
      return {};
    };
    /** The inline object a local variable was declared with (the declaration the name resolves to, never an outer one it shadows). */
    const inlineObjectOf = (id) => {
      const d = localDecl(id);
      const init = d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.initializer && unparen(d.initializer);
      return init && ts.isObjectLiteralExpression(init) ? init : null;
    };
    let cur = {};
    const spread = (ex) => {
      const e = unparen(ex);
      if (ts.isObjectLiteralExpression(e)) {
        for (const pr of e.properties) {
          if (ts.isSpreadAssignment(pr)) {
            spread(pr.expression);
            continue;
          }
          const key = propKey(pr.name);
          if (key === undefined) {
            cur = { unresolved: true }; // a key computed from a variable may be this very id: fail closed
            continue;
          }
          if (key !== attr) continue;
          if (ts.isPropertyAssignment(pr)) cur = fromExpr(pr.initializer);
          else if (ts.isShorthandPropertyAssignment(pr)) cur = fromExpr(pr.name);
          else cur = {};
        }
      } else if (ts.isIdentifier(e) && !own(e) && inlineObjectOf(e)) {
        spread(inlineObjectOf(e)); // const merge = { overlayId: pick() }; … {...merge}: the inline object it holds
      } else if (pb && ts.isIdentifier(e) && own(e) && (pb.whole.has(e.text) || (pb.rest.has(e.text) && !pb.excl.has(attr) && !pb.dynExcl))) cur = { prop: attr };
    };
    for (const a of f.op.attributes.properties) {
      if (ts.isJsxAttribute(a)) {
        if (attrName(a) !== attr) continue;
        if (!a.initializer) cur = {};
        else if (ts.isJsxExpression(a.initializer)) cur = fromExpr(a.initializer.expression);
        else cur = fromExpr(a.initializer);
        continue;
      }
      spread(a.expression);
    }
    return cur;
  }
  // a component that forwards its own id prop into an overlay (or into another forwarder) is a forwarder; its render sites name the overlay
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const file of scannedSource) {
      walkJsx(file, (n) => {
        const f = facts(file, n);
        if (!isOverlayEl(f)) return;
        const comp = enclosingComponent(file, n);
        if (!comp) return;
        for (const attr of idAttrsOf(f)) {
          const r = idOf(f, comp, attr);
          const have = forwarders.get(comp.key) || [];
          if (r.prop && !have.includes(r.prop)) {
            forwarders.set(comp.key, [...have, r.prop]);
            changed = true;
          }
        }
      });
    }
    if (!changed) break;
  }

  /** Where an element renders for layout.drawerOl, over every render site of its component (other files included): a set of
   *  'overlay' (in an overlay's body), 'steps' (in a StepList's body) and 'plain'. The climb takes children only: an overlay's or
   *  StepList's own attributes are not its body (the climb goes on past them); an attribute of any other element is. */
  const olMemo = new Map();
  function olContexts(file, node, D, guard = new Set()) {
    let viaAttr = false;
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isJsxAttribute(p) || ts.isJsxSpreadAttribute(p)) viaAttr = true;
      else if (isJsxEl(p) && p !== node) {
        if (!viaAttr) {
          const a = facts(file, p);
          if (isKitDef(a, D.stepLists)) return new Set(['steps']);
          if (isOverlayEl(a)) return new Set(['overlay']);
        }
        viaAttr = false;
      }
    }
    const comp = enclosingComponent(file, node);
    if (!comp) return new Set(['plain']);
    if (olMemo.has(comp.key)) return olMemo.get(comp.key);
    if (guard.has(comp.key)) return new Set(['plain']);
    guard.add(comp.key);
    const sites = renderSites.get(comp.key) || [];
    const out = new Set(sites.length ? [] : ['plain']);
    for (const s of sites) for (const c of olContexts(s.file, s.node, D, guard)) out.add(c);
    guard.delete(comp.key);
    olMemo.set(comp.key, out);
    return out;
  }

  // ── scope ──
  const scopeMemo = new Map();
  function scopeOfNode(file, node, guard = new Set()) {
    const comp = enclosingComponent(file, node);
    for (const f of ancestorEls(file, node)) {
      if (!isOverlayEl(f)) continue;
      const r = idOf(f, comp);
      if (r.lit) return `overlay:${r.lit}`;
      // a dialog whose id is the component's own prop is named by the caller's attribute for THAT prop
      if (r.prop && comp && forwarders.has(comp.key)) {
        const s = scopeOfComponent(comp.key, guard, r.prop);
        if (s !== 'main') return s;
      }
    }
    if (!comp) return 'main';
    return scopeOfComponent(comp.key, guard);
  }
  function scopeOfComponent(key, guard, prop) {
    const memoKey = `${key}|${prop || ''}`;
    if (scopeMemo.has(memoKey)) return scopeMemo.get(memoKey);
    if (guard.has(key)) return 'main';
    guard.add(key);
    const sites = renderSites.get(key);
    let out = 'main';
    if (sites && sites.length) {
      const ids = new Set(
        sites.map((s) => {
          // a forwarding wrapper's render site names the overlay itself: <Del id="drop" />
          if (forwarders.has(key)) {
            const sc = enclosingComponent(s.file, s.node);
            const r = idOf(facts(s.file, s.node), sc, prop);
            if (r.lit) return `overlay:${r.lit}`;
            // the site forwards the id on from its own component's prop Y: the scope follows Y through that wrapper
            if (r.prop && sc && forwarders.has(sc.key)) {
              const up = scopeOfComponent(sc.key, guard, r.prop);
              if (up !== 'main') return up;
            }
          }
          return scopeOfNode(s.file, s.node, guard);
        }),
      );
      if (ids.size === 1) {
        const [only1] = ids;
        if (only1.startsWith('overlay:')) out = only1;
      }
    }
    guard.delete(key);
    scopeMemo.set(memoKey, out);
    return out;
  }

  // ── hit sink ──
  // The site of a hit is the function it sits in: the enclosing component, else the nearest named function (a declaration or a
  // const-bound arrow/function), else `<module>` (CSS hits too). An exception may name sites (ui.* only); hits keep their shape.
  const hitSite = new Map();
  const nameOfFn = (p) => {
    if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p)) {
      let q = p.parent;
      while (q && ts.isParenthesizedExpression(q)) q = q.parent;
      if (q && ts.isVariableDeclaration(q) && ts.isIdentifier(q.name)) return q.name.text;
    }
    return null;
  };
  // the hit node itself counts: a rule may report a named function (a computer-row callback) as its own site
  const siteOf = (file, node) => {
    const own = nameOfFn(node);
    if (own && /^[A-Z]/.test(own)) return own;
    const c = enclosingComponent(file, node);
    if (c) return c.key.slice(c.key.indexOf('#') + 1);
    for (let p = node; p; p = p.parent) {
      const n = nameOfFn(p);
      if (n) return n;
    }
    return '<module>';
  };
  const hit = (file, node, rule, msg, scopeOverride) => {
    if ((only && !only.has(file)) || disabled.has(rule)) return;
    const sf = P.sourceOf(file);
    const { line, col } = lineOf(sf, node);
    const h = { rule, file, scope: scopeOverride || scopeOfNode(file, node), line, col, msg: msg || rule };
    hits.push(h);
    if (rule.startsWith('ui.')) hitSite.set(h, siteOf(file, node));
  };
  // One slot's hits. A slot's JSX walk reaches a node once per path to it (a helper called twice, `.map(f)` and `f(0)`, a fragment
  // and the element it wraps). Each content the walk yields is counted once (the same node again adds nothing) and comes with every
  // problem in it (slotProblems). After the walk, each content claims one problem no other content has claimed (a maximum
  // matching, so the order of the contents never changes the count), and each claim is one hit, reported at its content. The
  // contents are tried in walk order and each content's problems in source order, so one input gives the same hits in the same
  // order. Each problem the matching tries is a step of the file's JSX walk budget: a slot past it fails closed with the walk. So two
  // contents that share their only problem are one hit, a fragment with two raw children is one hit as before, and a fragment
  // whose first problem another content reports still reports its next one. Problems are keyed per slot (slotHits() per slot),
  // so one node placed in two slots is a problem in each.
  const slotHits = (file, prefix) => {
    const sf = P.sourceOf(file);
    const contents = []; // { node, problems: [{ key, msg }] }
    const counted = new Set();
    return {
      add(node, problems) {
        const k = node.getStart(sf);
        if (counted.has(k)) return;
        counted.add(k);
        const byKey = new Map();
        for (const p of problems) { const key = p.at.getStart(sf); if (!byKey.has(key)) byKey.set(key, { key, msg: p.msg }); }
        if (byKey.size) contents.push({ node, problems: [...byKey.values()] });
      },
      flush() {
        const owner = new Map(); // problem key -> index of the content that claims it
        const claim = (i, tried) => {
          for (const p of contents[i].problems) {
            if (tried.has(p.key)) continue;
            if (!jsxStep(contents[i].node)) return false;
            tried.add(p.key);
            if (!owner.has(p.key) || claim(owner.get(p.key), tried)) { owner.set(p.key, i); return true; }
          }
          return false;
        };
        for (let i = 0; i < contents.length; i++) claim(i, new Set());
        const mine = new Map([...owner].map(([key, i]) => [i, key]));
        contents.forEach((c, i) => {
          if (!mine.has(i)) return;
          const p = c.problems.find((x) => x.key === mine.get(i));
          hit(file, c.node, 'layout.slot', `${prefix}: ${p.msg}`);
        });
      },
    };
  };

  // ── returned roots of a component (for layout.manifest and slot content) ──
  function rootsOfFn(file, fn, depth, seen) {
    const out = [];
    for (const r of returnsOf(fn)) collectRoots(file, r, depth, seen, out);
    return out;
  }
  function collectRoots(file, e, depth, seen, out) {
    e = unparen(e);
    if (!e) return;
    if (ts.isConditionalExpression(e)) {
      collectRoots(file, e.whenTrue, depth, seen, out);
      collectRoots(file, e.whenFalse, depth, seen, out);
      return;
    }
    if (ts.isBinaryExpression(e)) {
      const k = e.operatorToken.kind;
      if (k === ts.SyntaxKind.AmpersandAmpersandToken) collectRoots(file, e.right, depth, seen, out);
      else if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
        collectRoots(file, e.left, depth, seen, out);
        collectRoots(file, e.right, depth, seen, out);
      }
      return;
    }
    if (ts.isJsxFragment(e)) {
      for (const c of e.children) if (isJsxEl(c) || ts.isJsxFragment(c)) collectRoots(file, c, depth, seen, out);
      return;
    }
    if (!isJsxEl(e)) return;
    const f = facts(file, e);
    if (f.intrinsic.length) {
      out.push({ kind: 'intrinsic', tag: f.intrinsic[0], node: e });
      return;
    }
    const b = f.binding;
    if (!b) return;
    if (b.kit && reg.archetypes[b.def]) {
      out.push({ kind: 'archetype', layout: reg.archetypes[b.def], def: b.def, node: e });
      return;
    }
    if (TRANSPARENT.has(b.def) && b.origin !== 'local') {
      for (const c of childrenOf(e)) if (isJsxEl(c) || ts.isJsxFragment(c)) collectRoots(file, c, depth, seen, out);
      return;
    }
    if (b.kit && b.origin === 'kit') {
      out.push({ kind: 'kit', def: b.def, node: e });
      return;
    }
    if (b.origin === 'local' && b.file && depth < 5) {
      const k = `${b.file}#${b.def}`;
      if (seen.has(k)) return;
      seen.add(k);
      const fn = fnOfDef(b.file, b.def);
      if (fn) out.push(...rootsOfFn(b.file, fn, depth + 1, seen));
    }
  }
  function fnOfDef(file, name) {
    const info = P.infoOf(file);
    const d = info.defs.get(name);
    if (!d) return null;
    if (ts.isFunctionDeclaration(d)) return d;
    if (ts.isVariableDeclaration(d)) {
      let e = unparen(d.initializer);
      while (e && ts.isCallExpression(e) && /^(memo|forwardRef)$/.test(e.expression.getText()) && e.arguments[0]) e = unparen(e.arguments[0]);
      if (e && (ts.isArrowFunction(e) || ts.isFunctionExpression(e))) return e;
    }
    return null;
  }

  // ── what a wrapper renders, proven or a hit ──
  // Inside a local component (a wrapper) in a slot, every value a return or a fragment child can produce is resolved, or it is a
  // hit at the site: no unknown is read as absent, as text or as an overlay. Items: { jsx, ctx, file } (the file the
  // JSX is written in), { text } (a string, a template, a number, a t()/tt() of useStrings; { text, maybe } for the falsy left of
  // &&, which renders "" or 0 at most), { unknown, why }. Props and children resolve to what the use site passes (in its own file
  // and ctx), a same-file helper's parameters to its call's arguments, with defaults; a binding the code can change (a let, var,
  // reassigned parameter, prop or function, a rest parameter, a spread argument, a key the walk cannot name) is { unknown }.
  const TEXT_FNS = new Set(['t', 'tt']);
  const BOOL_OPS = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanEqualsToken,
    ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.InstanceOfKeyword, ts.SyntaxKind.InKeyword]);
  /** operators whose operand is only tested (memberWrittenIn testReads): comparisons, and && (its left only) */
  const XC_TESTS = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanEqualsToken,
    ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.AmpersandAmpersandToken]);
  /** True when `e` is a boolean by its syntax (so a false `e && x` renders nothing). */
  function boolish(e, depth = 0) {
    e = unparen(e);
    if (!e || depth > JSX_DEPTH) return false;
    if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword) return true;
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) return true;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'Boolean' && !localDecl(e.expression)) return true;
    if (ts.isBinaryExpression(e)) {
      const o = e.operatorToken.kind;
      if (BOOL_OPS.has(o)) return true;
      if (o === ts.SyntaxKind.AmpersandAmpersandToken || o === ts.SyntaxKind.BarBarToken) return boolish(e.left, depth + 1) && boolish(e.right, depth + 1);
      return false;
    }
    if (ts.isConditionalExpression(e)) return boolish(e.whenTrue, depth + 1) && boolish(e.whenFalse, depth + 1);
    if (ts.isIdentifier(e)) { const init = constInit(e); return !!init && boolish(init, depth + 1); }
    return false;
  }
  /** A const's initializer (a binding the code cannot change); null for anything else. */
  function constInit(id) {
    const d = localDecl(id);
    return d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.parent.flags & ts.NodeFlags.Const ? d.initializer || null : null;
  }
  /** True when `name` is written to (=, op=, ++, --, as a destructuring target, or as a for...of / for...in target) anywhere
   *  under `root`. Shadowing is not tracked: a write to any binding of that name counts (fail closed). A node `skip` accepts is
   *  not looked into. */
  function writtenIn(root, name, skip = null) {
    let hit = false;
    const isAssign = (k) => k >= ts.SyntaxKind.FirstAssignment && k <= ts.SyntaxKind.LastAssignment;
    const targets = (t) => {
      t = unparen(t);
      if (ts.isIdentifier(t)) return t.text === name;
      if (ts.isArrayLiteralExpression(t)) return t.elements.some((x) => targets(ts.isSpreadElement(x) ? x.expression : x));
      if (ts.isObjectLiteralExpression(t)) return t.properties.some((q) => (ts.isShorthandPropertyAssignment(q) ? q.name.text === name : ts.isPropertyAssignment(q) ? targets(q.initializer) : ts.isSpreadAssignment(q) ? targets(q.expression) : false));
      return false;
    };
    const visit = (n) => {
      if (hit || (skip && skip(n))) return;
      if (ts.isBinaryExpression(n) && isAssign(n.operatorToken.kind) && targets(n.left)) { hit = true; return; }
      if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken) && targets(n.operand)) { hit = true; return; }
      // for (x of xs) / for (x in o) on an existing binding (slot-wrapper-soundness form 1)
      if ((ts.isForOfStatement(n) || ts.isForInStatement(n)) && !ts.isVariableDeclarationList(n.initializer) && targets(n.initializer)) { hit = true; return; }
      ts.forEachChild(n, visit);
    };
    visit(root);
    return hit;
  }
  /** True when a member of `name` may be written under `root`: name.x = …, name[k] = …, delete name.x, ++/-- on a member, a
   *  member as a destructuring or for...of / for...in target, or `name` itself leaving the walk's sight (passed to a call such as
   *  Object.assign, aliased by a declaration or assignment, held in an array or object, returned): anything other than reading
   *  a member, a spread copy or a typeof (slot-wrapper-soundness forms 1 and 5, fail closed). A node `skip` accepts is not
   *  looked into. With `testReads`, a use only tested also stays in sight: an operand of a comparison, `!name`, the left of
   *  `&&`, or the test of a conditional, if or loop; and a type (an inline props type, an interface, a type alias) is not looked
   *  into. */
  function memberWrittenIn(root, name, skip = null, testReads = false) {
    let hit = false;
    const isAssign = (k) => k >= ts.SyntaxKind.FirstAssignment && k <= ts.SyntaxKind.LastAssignment;
    const onName = (t) => { t = unparen(t); return (ts.isPropertyAccessExpression(t) || ts.isElementAccessExpression(t)) && ts.isIdentifier(unparen(t.expression)) && unparen(t.expression).text === name; };
    const targets = (t) => {
      t = unparen(t);
      if (onName(t)) return true;
      if (ts.isArrayLiteralExpression(t)) return t.elements.some((x) => targets(ts.isSpreadElement(x) ? x.expression : x));
      if (ts.isObjectLiteralExpression(t)) return t.properties.some((q) => (ts.isPropertyAssignment(q) ? targets(q.initializer) : ts.isSpreadAssignment(q) ? targets(q.expression) : false));
      return false;
    };
    // a bare reference to `name` whose use is not a member read, a spread copy or a typeof
    const escapes = (id) => {
      let c = id;
      while (c.parent && (ts.isParenthesizedExpression(c.parent) || ts.isNonNullExpression(c.parent) || ts.isAsExpression(c.parent) || ts.isSatisfiesExpression(c.parent) || ts.isTypeAssertionExpression(c.parent))) c = c.parent;
      const p = c.parent;
      if (!p) return false;
      if ((ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === c) return false;
      if (ts.isSpreadElement(p) || ts.isSpreadAssignment(p) || ts.isJsxSpreadAttribute(p) || ts.isTypeOfExpression(p)) return false;
      if ((ts.isParameter(p) || ts.isBindingElement(p) || ts.isVariableDeclaration(p)) && p.name === c) return false; // the binding itself, not a default or initializer
      if (ts.isPropertyAccessExpression(p) && p.name === c) return false; // x.name, not the binding
      if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)) && p.name === c) return false; // a key
      if (ts.isJsxAttribute(p) || ts.isTypeReferenceNode(p) || ts.isQualifiedName(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false;
      if (ts.isBinaryExpression(p) && p.left === c && isAssign(p.operatorToken.kind)) return false; // a write of the binding: writtenIn's
      if (testReads && XC_TESTS.has(ts.isBinaryExpression(p) ? p.operatorToken.kind : -1) && (p.left === c || p.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken)) return false;
      if (testReads && ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) return false;
      if (testReads && (ts.isConditionalExpression(p) || ts.isIfStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p) || ts.isForStatement(p)) && (p.condition === c || p.expression === c)) return false;
      return true;
    };
    const visit = (n) => {
      if (hit || (skip && skip(n))) return;
      if (testReads && ((n.kind >= ts.SyntaxKind.FirstTypeNode && n.kind <= ts.SyntaxKind.LastTypeNode) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n))) return; // a type is never a use
      if (ts.isBinaryExpression(n) && isAssign(n.operatorToken.kind) && targets(n.left)) { hit = true; return; }
      if (ts.isDeleteExpression(n) && onName(n.expression)) { hit = true; return; }
      if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken) && onName(n.operand)) { hit = true; return; }
      if ((ts.isForOfStatement(n) || ts.isForInStatement(n)) && !ts.isVariableDeclarationList(n.initializer) && targets(n.initializer)) { hit = true; return; }
      if (ts.isIdentifier(n) && n.text === name && escapes(n)) { hit = true; return; }
      ts.forEachChild(n, visit);
    };
    visit(root);
    return hit;
  }
  /** The static text of a property name or key expression: identifier, string, number, no-substitution template, or a computed
   *  key of a literal; null when the walk cannot name it (a computed key named by an identifier, { [key]: … }, is a value, not
   *  its spelling: slot-wrapper-soundness form 2). */
  function keyText(k) {
    if (!k) return null;
    if (ts.isComputedPropertyName(k)) {
      k = unparen(k.expression);
      if (!(ts.isStringLiteral(k) || ts.isNumericLiteral(k) || ts.isNoSubstitutionTemplateLiteral(k))) return null;
    }
    if (ts.isIdentifier(k) || ts.isPrivateIdentifier(k)) return k.text;
    if (ts.isStringLiteral(k) || ts.isNumericLiteral(k) || ts.isNoSubstitutionTemplateLiteral(k)) return k.text;
    return null;
  }
  // ── the kit's measuring probe ──
  // kit useButtonLabelsWidth returns { width, probe }: `probe` draws kit Buttons inside an aria-hidden, inert box that is out of flow
  // and takes no room (kit controls/buttonMetrics), only so their width can be measured. Where a page renders it, it is neither
  // explanation text nor slot content, so both walks read it as nothing. Proven syntactically, else it is read as before (fail
  // closed): `x.probe` / `x['probe']` on a const x bound to a probe call whose members are never written, which never leaves
  // the walk's sight (memberWrittenIn) and through which nothing is called (calledThrough: a method could rewrite this.probe); a const destructured `probe` (any local name, no default) of a probe call; a const bound
  // to one of those; a fragment of nothing but probes. A probe call is a call of useButtonLabelsWidth as defined in kit
  // controls/buttonMetrics (traced through `@kit` and renames), or of a stable top-level function (stableFnOf: in its file, or
  // imported) whose every way out returns an object literal of plain members with exactly one `probe`, itself a probe.
  const PROBE_HOOKS = new Set(['useButtonLabelsWidth']);
  const fnScopeOf = (n) => {
    let s = n.parent;
    while (s && !ts.isFunctionLike(s) && !ts.isSourceFile(s)) s = s.parent;
    return s;
  };
  /** True when a member of `name` is called under `root` (name.f(), name[k](), name?.f(), a tagged name.f`…`): the callee runs with
   *  `this` bound to the object. Shadowing is not tracked (fail closed). */
  function calledThrough(root, name) {
    let hit = false;
    const onName = (t) => { t = unparen(t); return (ts.isPropertyAccessExpression(t) || ts.isElementAccessExpression(t)) && ts.isIdentifier(unparen(t.expression)) && unparen(t.expression).text === name; };
    const visit = (n) => {
      if (hit) return;
      if ((ts.isCallExpression(n) && onName(n.expression)) || (ts.isTaggedTemplateExpression(n) && onName(n.tag))) { hit = true; return; }
      ts.forEachChild(n, visit);
    };
    visit(root);
    return hit;
  }
  const isConstDecl = (d) => !!d && ts.isVariableDeclaration(d) && !!d.parent && ts.isVariableDeclarationList(d.parent) && !!(d.parent.flags & ts.NodeFlags.Const) && !!d.initializer;
  function isKitProbe(e, depth = 0, seen = new Set()) {
    e = unparen(e);
    if (!e || depth > 8) return false;
    if (ts.isJsxFragment(e)) {
      return e.children.every((c) => (ts.isJsxText(c) ? !hasVisibleJsxText(c.text) : ts.isJsxExpression(c) && !c.dotDotDotToken && (!c.expression || isKitProbe(c.expression, depth + 1, seen))));
    }
    if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) {
      const arg = ts.isElementAccessExpression(e) ? unparen(e.argumentExpression) : null;
      const key = ts.isPropertyAccessExpression(e) ? e.name.text : arg && ts.isStringLiteralLike(arg) ? arg.text : null;
      const root = unparen(e.expression);
      if (key !== 'probe' || !ts.isIdentifier(root)) return false;
      const d = localDecl(root);
      if (!isConstDecl(d) || !ts.isIdentifier(d.name)) return false;
      const scope = fnScopeOf(d);
      if (!scope || memberWrittenIn(scope, root.text)) return false;
      // a call through the object (x.f(), x[k](), x.f`…`) runs with `this` bound to it, so a method can rewrite x.probe: not proven
      if (calledThrough(scope, root.text)) return false;
      return probeCall(d.initializer, depth + 1, seen);
    }
    if (ts.isIdentifier(e)) {
      const d = localDecl(e);
      if (!isConstDecl(d)) return false;
      if (ts.isIdentifier(d.name)) return isKitProbe(d.initializer, depth + 1, seen);
      if (!ts.isObjectBindingPattern(d.name)) return false;
      const el = d.name.elements.find((x) => ts.isIdentifier(x.name) && x.name.text === e.text);
      if (!el || el.dotDotDotToken || el.initializer) return false;
      if ((el.propertyName ? keyText(el.propertyName) : e.text) !== 'probe') return false;
      return probeCall(d.initializer, depth + 1, seen);
    }
    return false;
  }
  /** The kit module that defines the probe hook: only its own definition is trusted (a kit re-export of another file's function is not). */
  const PROBE_HOME = /^kit\/controls\/buttonMetrics\.tsx?$/;
  /** A top-level function of `file` whose binding never changes: a function declaration the file never assigns, or a const bound
   *  directly to an arrow or function expression (no wrapping call such as memo(): its result is another function). Else null. */
  function stableFnOf(file, name) {
    const d = P.infoOf(file).defs.get(name);
    if (!d) return null;
    if (ts.isFunctionDeclaration(d)) return d.body && !writtenIn(P.sourceOf(file), name) ? d : null;
    if (!isConstDecl(d) || !ts.isIdentifier(d.name)) return null;
    const e = unparen(d.initializer);
    return e && (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) ? e : null;
  }
  /** A call that returns an object whose `probe` is the kit probe (isKitProbe). */
  function probeCall(c, depth, seen) {
    c = unparen(c);
    if (!c || !ts.isCallExpression(c) || !ts.isIdentifier(c.expression)) return false;
    const file = c.getSourceFile().fileName;
    const name = c.expression.text;
    const ld = localDecl(c.expression);
    let b;
    if (ld) {
      // a function declared at the top of this file (stableFnOf proves its binding); a nested name is not followed
      const top = ts.isFunctionDeclaration(ld) ? ld.parent : isConstDecl(ld) && ts.isIdentifier(ld.name) ? ld.parent.parent && ld.parent.parent.parent : null;
      if (!top || !ts.isSourceFile(top)) return false;
      b = { file, def: name };
    } else b = P.traceLocal(file, name);
    if (!b || !b.file || b.ns) return false;
    const fn = stableFnOf(b.file, b.def);
    if (!fn) return false;
    // the kit hook, defined in its own module: its contract (aria-hidden, inert, out of flow) is the kit's, tested there
    if (PROBE_HOME.test(b.file) && PROBE_HOOKS.has(b.def)) return true;
    const k = `${b.file}#${b.def}`;
    if (seen.has(k)) return false;
    // every way out returns an object: no bare `return`, and a block body ends in a return (no fall-through to undefined)
    if (fn.body && ts.isBlock(fn.body)) {
      const last = fn.body.statements[fn.body.statements.length - 1];
      if (!last || !ts.isReturnStatement(last)) return false;
      let bare = false;
      const visit = (n) => {
        if (bare || (n !== fn && ts.isFunctionLike(n))) return;
        if (ts.isReturnStatement(n) && !n.expression) bare = true;
        else ts.forEachChild(n, visit);
      };
      ts.forEachChild(fn.body, visit);
      if (bare) return false;
    }
    const rets = returnsOf(fn);
    if (!rets.length) return false;
    const next = new Set([...seen, k]);
    return rets.every((r) => {
      const o = unparen(r);
      if (!o || !ts.isObjectLiteralExpression(o)) return false;
      // plain members only (no spread, getter, setter or method), each with a name the walk can spell; `__proto__: X` (identifier
      // or string key) sets the prototype rather than a member, so a `__proto__` key is refused (computed and shorthand forms too)
      if (o.properties.some((q) => !(ts.isPropertyAssignment(q) || ts.isShorthandPropertyAssignment(q)) || keyText(q.name) === null || keyText(q.name) === '__proto__')) return false;
      const ps = o.properties.filter((q) => keyText(q.name) === 'probe');
      if (ps.length !== 1) return false;
      const q = ps[0];
      if (ts.isPropertyAssignment(q)) return isKitProbe(q.initializer, depth + 1, next);
      return !q.objectAssignmentInitializer && isKitProbe(q.name, depth + 1, next);
    });
  }
  /** True when `id` names a strings function: a const t = useStrings(…), or a parameter/prop bound to one at the call/use site. */
  function isTextFn(id, ctx, depth = 0) {
    if (!ts.isIdentifier(id) || depth > WRAP_DEPTH) return false;
    const init = constInit(id);
    // const t = useStrings(…), where useStrings is the imported one (a local function or parameter of that name is not:
    // slot-wrapper-soundness form 3)
    if (init) {
      const c = unparen(init);
      if (!(ts.isCallExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === 'useStrings')) return false;
      // the kit's own useStrings, traced through the file's imports; a global, another module's or one the trace cannot
      // follow is not proven
      if (localDecl(c.expression)) return false;
      const sf = c.getSourceFile();
      const b = sf && sf.fileName ? P.traceLocal(sf.fileName, 'useStrings') : null;
      return !!(b && b.kit && b.def === 'useStrings');
    }
    const prop = ctx && propOf(id, ctx);
    if (!prop || prop.unknownBinding || prop.whole || prop.none || prop.def) return false;
    if (ctx.call) { const a = ctx.call.arguments[prop.arg]; return !!a && isTextFn(unparen(a), ctx.parent, depth + 1); }
    const op = openingOf(ctx.use);
    let ok = false;
    for (const a of op.attributes.properties) {
      if (ts.isJsxSpreadAttribute(a)) return false;
      if (attrName(a) !== prop.name) continue;
      if (!a.initializer || !ts.isJsxExpression(a.initializer) || !a.initializer.expression) return false;
      ok = isTextFn(unparen(a.initializer.expression), ctx.parent, depth + 1);
    }
    return ok;
  }
  function valueParts(e, ctx, file, depth = 0, out = []) {
    e = unparen(e);
    if (!e) return out;
    if (depth > JSX_DEPTH || !jsxStep(e)) { out.push({ unknown: e, why: 'too deep to check' }); return out; }
    // the kit's measuring probe is no content
    if (isKitProbe(e)) return out;
    const k = e.kind;
    // an element is the same whoever holds it: a const's JSX is checked as written (viaConst ends at JSX)
    if (isJsxEl(e) || ts.isJsxFragment(e)) { out.push({ jsx: e, ctx: unvia(ctx), file }); return out; }
    if (k === ts.SyntaxKind.NullKeyword || k === ts.SyntaxKind.FalseKeyword || k === ts.SyntaxKind.TrueKeyword) return out;
    if (ts.isIdentifier(e) && e.text === 'undefined' && !localDecl(e)) return out;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e) || ts.isNumericLiteral(e)) { out.push({ text: e }); return out; }
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && TEXT_FNS.has(e.expression.text) && isTextFn(e.expression, ctx)) { out.push({ text: e }); return out; }
    if (ts.isConditionalExpression(e)) { valueParts(e.whenTrue, ctx, file, depth + 1, out); valueParts(e.whenFalse, ctx, file, depth + 1, out); return out; }
    if (ts.isBinaryExpression(e)) {
      const o = e.operatorToken.kind;
      if (o === ts.SyntaxKind.AmpersandAmpersandToken) {
        // a falsy left renders itself: nothing for a boolean, "" or 0 at most otherwise (text, never an element)
        if (!boolish(e.left)) out.push({ text: e.left, maybe: true });
        return valueParts(e.right, ctx, file, depth + 1, out);
      }
      if (o === ts.SyntaxKind.BarBarToken || o === ts.SyntaxKind.QuestionQuestionToken) { valueParts(e.left, ctx, file, depth + 1, out); return valueParts(e.right, ctx, file, depth + 1, out); }
      out.push({ unknown: e, why: 'a value the check cannot read' }); return out;
    }
    if (ts.isArrayLiteralExpression(e)) {
      if (ctx && ctx.viaConst) { out.push({ unknown: e, why: 'an array not written in the slot itself (a binding can change it): a value the check cannot read' }); return out; }
      for (const x of e.elements) {
        if (ts.isSpreadElement(x)) { out.push({ unknown: x, why: 'a spread the check cannot read' }); continue; }
        valueParts(x, ctx, file, depth + 1, out);
      }
      return out;
    }
    const prop = ctx && propOf(e, ctx);
    if (prop) return passedParts(prop, ctx, depth, out);
    if (ts.isIdentifier(e)) {
      // only a const's initializer is its value: a let, a var or a parameter not bound here can change
      const init = constInit(e);
      // a const binding does not freeze an array (push, a member write, a callback's array argument…): an array reached through
      // a const (in any branch of its initializer) is unknown, in direct content and in a wrapper alike; an array literal written
      // inline is read
      if (init) return valueParts(init, via(ctx), file, depth + 1, out);
    }
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) {
      const fn = localFnOf(e.expression);
      if (fn && !writtenIn(e.expression.getSourceFile(), e.expression.text)) {
        if (onPath(ctx, fn)) { out.push({ unknown: e, why: `<${e.expression.text}> calls itself: too deep to check` }); return out; }
        if (e.arguments.some((a) => ts.isSpreadElement(a))) { out.push({ unknown: e, why: 'a spread argument the check cannot read' }); return out; }
        // only an array written in the expression itself is read: one a helper returns may be one it holds by a binding (a
        // const, a parameter, a default, a closure) and changes, so its returns walk under viaConst (wrapper
        // content too)
        const c = { fn, call: e, parent: ctx, file, useFile: file, viaConst: true };
        if (fn.body && !ts.isBlock(fn.body)) valueParts(fn.body, c, file, depth + 1, out);
        else for (const r of returnsOf(fn)) valueParts(r, c, file, depth + 1, out);
        return out;
      }
    }
    if (isDirect(ctx)) {
      // content written directly in a slot: a render callback renders its returns, and a .map its
      // callback's, as jsxContents reads them for the JSX it checks
      if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
        if (e.body && !ts.isBlock(e.body)) return valueParts(e.body, ctx, file, depth + 1, out);
        for (const r of returnsOf(e)) valueParts(r, ctx, file, depth + 1, out);
        return out;
      }
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'map' && e.arguments[0] && provenArray(e.expression.expression)) {
        // the array .map makes is as changeable as a literal once a const holds it
        if (ctx.viaConst) { out.push({ unknown: e, why: 'an array not written in the slot itself (a binding can change it): a value the check cannot read' }); return out; }
        return valueParts(e.arguments[0], ctx, file, depth + 1, out);
      }
    }
    // anything else, a .map on a receiver the walk cannot prove an array included, is a value the check cannot read
    out.push({ unknown: e, why: 'a value the check cannot read' });
    return out;
  }
  // the ctx of content written directly in a slot that takes no text: its values (fragment children included) walk like a
  // wrapper's; an element whose binding the walk cannot classify keeps the direct rule (slotProblems: strict only off DIRECT)
  const DIRECT = { fn: null, parent: null, file: null, direct: true };
  const ARRAY_OF = new Set(['filter', 'slice', 'concat', 'flat', 'toSorted', 'toReversed', 'sort', 'reverse']);
  /** `e` is an array the walk can prove (so its .map is Array.prototype.map): an array literal written inline, an array
   *  method of one, or Object.keys/values/entries / Array.from / Array.of (globals, not local names). */
  function provenArray(e, depth = 0) {
    e = unparen(e);
    if (!e || depth > JSX_DEPTH) return false;
    if (ts.isArrayLiteralExpression(e)) return true;
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
      const m = e.expression.name.text;
      const r = unparen(e.expression.expression);
      if (ts.isIdentifier(r) && !localDecl(r) && ((r.text === 'Object' && ['keys', 'values', 'entries'].includes(m)) || (r.text === 'Array' && ['from', 'of'].includes(m)))) return true;
      if (ARRAY_OF.has(m) || m === 'map') return provenArray(e.expression.expression, depth + 1);
    }
    return false;
  }
  // direct content: DIRECT itself, or a helper call made from it; a component wrapper (a ctx with a `use`) ends it
  const isDirect = (ctx) => { for (let c = ctx; c; c = c.parent) { if (c.direct) return true; if (c.use) return false; } return false; };
  /** The values written directly in a slot of a type that takes no text (TEXT_SLOT_TYPES) that the walk cannot prove (an unknown:
   *  a let, a parameter, a member read, a call it cannot follow, a .map on a receiver it cannot prove an array) or that are text:
   *  each a problem at the site, as inside a wrapper. The whole value is
   *  walked by valueParts under DIRECT (fragment children and helper arguments included); its JSX goes to slotProblems, which
   *  keeps the direct rule for an element whose binding it cannot classify. Returns the items, or null for a text-like slot.
   *  COUNTED LIMIT: a text-like slot (text, cell, field, header-text, inline-text) takes a value the walk cannot read,
   *  since a string is what it expects and without types the walk cannot tell a string from an element: such values
   *  (title={name}, subtitle={user.email}, …) pass unchecked. What it can read there is still judged: markup, wrong parts. */
  function directItems(e, type, file) {
    if (TEXT_SLOT_TYPES.includes(type)) return null;
    return valueParts(e, DIRECT, file).map((it) => ({ ...it, file: it.file || file }));
  }
  const itemNode = (it) => it.jsx || it.text || it.unknown;
  const onPath = (ctx, fn) => { for (let c = ctx; c; c = c.parent) if (c.fn === fn) return true; return false; };
  /** Which prop (or call argument) of the ctx's function `e` names: { name, def } for a component prop (children included),
   *  { arg, def } for a helper's positional argument, { whole } for the props object, { none, def } for a later component
   *  parameter, { unknownBinding } for a binding the walk cannot prove stable; null when `e` is not one of the ctx's parameters. */
  function propOf(e, ctx) {
    const fn = ctx.fn;
    if (!fn || !fn.parameters) return null;
    const param = (id) => { const d = localDecl(id); return d && ts.isParameter(d) && d.parent === fn ? d : null; };
    const bindingEl = (id) => { const d = localDecl(id); return d && ts.isBindingElement(d) ? d : null; };
    let id = null;
    let member = null;
    if (ts.isIdentifier(e)) id = e;
    else if ((ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) && ts.isIdentifier(unparen(e.expression))) { id = unparen(e.expression); member = e; }
    if (!id) return null;
    let d = param(id);
    let el = null;
    if (d && !ts.isIdentifier(d.name)) {
      // localDecl names the parameter for a destructured name: find its element (top level of an object pattern; else unknown)
      el = ts.isObjectBindingPattern(d.name) ? d.name.elements.find((x) => ts.isIdentifier(x.name) && x.name.text === id.text) || null : null;
      if (!el) return { unknownBinding: true };
    }
    if (!d) {
      el = bindingEl(id);
      if (!el) return null;
      let top = el;
      while (top && !ts.isParameter(top)) top = top.parent;
      if (!top || top.parent !== fn) return null;
      d = top;
    }
    const i = fn.parameters.indexOf(d);
    if (writtenIn(fn, id.text)) return { unknownBinding: true };
    if (d.dotDotDotToken) return { unknownBinding: true };
    if (member) {
      // p.x / p["x"] on the props object (an identifier first parameter, no default, no member writes)
      if (ctx.call || i !== 0 || el || !ts.isIdentifier(d.name) || d.initializer || memberWrittenIn(fn, id.text)) return { unknownBinding: true };
      const ax = ts.isElementAccessExpression(member) ? unparen(member.argumentExpression) : null;
      const name = ts.isPropertyAccessExpression(member) ? member.name.text : ax && (ts.isStringLiteral(ax) || ts.isNumericLiteral(ax) || ts.isNoSubstitutionTemplateLiteral(ax)) ? ax.text : null;
      return name ? { name } : { unknownBinding: true };
    }
    if (ctx.call) return ts.isIdentifier(d.name) ? { arg: i, def: d.initializer } : { unknownBinding: true };
    if (i !== 0) return el ? { unknownBinding: true } : { none: true, def: d.initializer };
    if (!el) return ts.isIdentifier(d.name) ? { whole: true } : { unknownBinding: true };
    // a destructured prop: one level, a named key, no rest, no default on the props object
    if (el.parent.parent !== d || !ts.isObjectBindingPattern(el.parent) || el.dotDotDotToken || d.initializer) return { unknownBinding: true };
    const name = el.propertyName ? keyText(el.propertyName) : ts.isIdentifier(el.name) ? el.name.text : null;
    return name ? { name, def: el.initializer } : { unknownBinding: true };
  }
  /** What the use site (or call) passes for `prop`, resolved in the caller's file and ctx; a default in the callee's. */
  function passedParts(prop, ctx, depth, out) {
    if (prop.unknownBinding) { out.push({ unknown: ctx.use || ctx.call, why: 'a parameter the check cannot read' }); return out; }
    // a default is a possible value whenever the passed one is omitted or may be undefined: always included
    // (the parameter holds it by a binding, as a passed value: an array there is unknown)
    if (prop.def) valueParts(prop.def, via(ctx), ctx.file, depth + 1, out);
    if (prop.none) return out;
    if (ctx.call) {
      const a = ctx.call.arguments[prop.arg];
      // a helper holds its argument by a binding (it can push into it, alias it…): an array passed in is unknown, as through
      // a const (viaConst). JSX passed in is checked as written.
      const at = via(ctx.parent);
      return a ? valueParts(a, at, ctx.useFile, depth + 1, out) : out;
    }
    const use = ctx.use;
    // a component holds what the use site passes by a binding too (a prop, children): an array passed in is unknown (viaConst),
    // JSX is checked as written
    if (prop.whole) { out.push({ unknown: use, why: 'renders its props object: a value the check cannot read' }); return out; }
    const op = openingOf(use);
    if (prop.name === 'children') {
      for (const c of childrenOf(use)) {
        if (ts.isJsxText(c)) { if (hasVisibleJsxText(c.text)) out.push({ text: c }); continue; }
        if (isJsxEl(c) || ts.isJsxFragment(c)) out.push({ jsx: c, ctx: ctx.parent || WRAPPED, file: ctx.useFile });
        else if (ts.isJsxExpression(c) && c.expression) valueParts(c.expression, via(ctx.parent), ctx.useFile, depth + 1, out);
      }
    }
    for (const a of op.attributes.properties) {
      if (ts.isJsxSpreadAttribute(a)) {
        // a spread of object literals (through conditions) is read: its value for the prop, if it names it; else unknown
        const objs = [];
        const lits = (x) => { x = unparen(x); if (ts.isObjectLiteralExpression(x)) { objs.push(x); return true; } if (ts.isConditionalExpression(x)) return lits(x.whenTrue) && lits(x.whenFalse); return false; };
        if (!lits(a.expression) || objs.some((o) => o.properties.some((q) => !(ts.isPropertyAssignment(q) || ts.isShorthandPropertyAssignment(q)) || keyText(q.name) === null))) { out.push({ unknown: a, why: 'a spread prop the check cannot read' }); continue; }
        for (const o of objs) for (const q of o.properties) {
          if (keyText(q.name) !== prop.name) continue;
          valueParts(ts.isPropertyAssignment(q) ? q.initializer : q.name, via(ctx.parent), ctx.useFile, depth + 1, out);
        }
        continue;
      }
      if (attrName(a) !== prop.name) continue;
      if (!a.initializer) continue;
      if (ts.isStringLiteral(a.initializer)) out.push({ text: a.initializer });
      else if (ts.isJsxExpression(a.initializer)) { if (a.initializer.expression) valueParts(a.initializer.expression, via(ctx.parent), ctx.useFile, depth + 1, out); }
      else valueParts(a.initializer, via(ctx.parent), ctx.useFile, depth + 1, out);
    }
    return out;
  }
  /** The parts a fragment child can produce: proven items in a wrapper ctx, jsxContents for content written in the slot itself. */
  function childParts(c, ctx, file) {
    if (isJsxEl(c) || ts.isJsxFragment(c)) return [{ jsx: c, ctx, file }];
    if (!ts.isJsxExpression(c) || !c.expression) return [];
    if (ctx) return valueParts(c.expression, ctx === WRAPPED ? null : ctx, file);
    return jsxContents(c.expression, [], 0, new Set()).map((x) => ({ jsx: x, ctx: null, file }));
  }
  /** The problem with an item in a slot of `type`: text where only elements fit, an unknown, or slotProblems of its JSX (in the
   *  file the JSX is written in). */
  function itemProblems(type, it, depth, seen, out) {
    if (it.text) { if (!TEXT_SLOT_TYPES.includes(type)) out.push({ msg: `${it.maybe ? 'a condition that can render "" or 0' : 'visible text'} in a ${type} slot`, at: it.text }); return out; }
    if (it.unknown) { out.push({ msg: `${it.why} in a ${type} slot`, at: it.unknown }); return out; }
    return slotProblems(it.file, type, it.jsx, depth, seen, out, it.ctx);
  }
  // the ctx of JSX inside a wrapper with no parameters of its own in scope: marks "inside a wrapper" for slotProblems
  const WRAPPED = { fn: null, parent: null, file: null };
  // viaConst: the value is held by a binding (a const, a parameter, a prop, a helper's return), so an array in it is unknown;
  // via() enters it, unvia() leaves it at JSX (an element is the same whoever holds it). VIA_WRAPPED is WRAPPED under it.
  const VIA_WRAPPED = { ...WRAPPED, viaConst: true };
  const via = (ctx) => (!ctx || ctx === WRAPPED ? VIA_WRAPPED : ctx.viaConst ? ctx : { ...ctx, viaConst: true });
  const unvia = (ctx) => (!ctx || ctx === VIA_WRAPPED ? WRAPPED : ctx.viaConst ? { ...ctx, viaConst: false } : ctx);
  const tagText = (n) => { const op = openingOf(n); return op && op.tagName ? op.tagName.getText() : '?'; };

  // ── slot allowance ──
  const slotTypeNames = (type) => reg.slotTypes[type] || [];
  /** The slot table's name of a kit binding: its declared name when the table knows it, else its exported name (a part exported
   *  under another name: Verdict, Track), else the declared name. */
  const slotName = (b) => (b.pub && !Object.hasOwn(reg.slots, b.def) ? b.pub : b.def);
  /** A slot type lists the binding by its declared or its exported name. */
  const inSlotType = (b, type) => slotTypeNames(type).includes(b.def) || (!!b.pub && slotTypeNames(type).includes(b.pub));
  /** True when kit part `def` stands in a `type` slot through a prop it is written with (reg.slotVia): a Band with `attach` in a field slot.
   *  The prop must provably hold an element on every path: written as one JSX element (`attach={<NumberField />}`), with no
   *  spread after it that could replace it. An unset, conditional, computed or fragment value (`attach={undefined}`,
   *  `attach={on ? <F /> : undefined}`, `attach={field}`, `attach={<></>}`) can leave a plain notice in the slot, so it does
   *  not count, nor does an element that is not itself a kit field part (a local component may render nothing);
   *  the element itself is then checked as the Band.attach `attached` slot. */
  const viaSlot = (def, f, type) =>
    Object.entries((reg.slotVia || {})[def] || {}).some(([prop, types]) => {
      if (!types.includes(type)) return false;
      const a = f.attrs.get(prop);
      const v = a && ts.isJsxAttribute(a) ? a.initializer : undefined;
      if (!v) return false;
      const e = ts.isJsxExpression(v) ? unparen(v.expression) : v;
      if (!e || !isJsxEl(e)) return false;
      if (f.spreads.some((sp) => sp.pos > a.pos)) return false;
      // ...and that element is itself a kit field (a local component may render nothing: not provable).
      const fb = facts(f.file, e).binding;
      return !!fb && fb.kit && fb.origin !== 'local' && slotTypeNames(type).includes(fb.def);
    });
  const WRAP_DEPTH = 5;
  /** Every problem with JSX node `n` in a slot of `type`, in document order, as { msg, at } (`at`: the node the problem is in).
   *  An element has at most one; a fragment has each of its parts'. */
  function slotProblems(file, type, n, depth = 0, seen = new Set(), out = [], ctx = null) {
    if (ts.isJsxFragment(n)) {
      // a fragment already being checked on this path (a helper that returns one around a call of itself) is checked there
      if (seen.has(n) || !jsxStep(n)) return out;
      seen.add(n);
      fragmentProblems(file, type, n, depth, seen, out, ctx);
      seen.delete(n);
      return out;
    }
    const f = facts(file, n);
    if (f.intrinsic.length) { out.push({ msg: `a raw <${f.intrinsic[0]}> in a ${type} slot`, at: n }); return out; }
    const b = f.binding;
    // inside a wrapper (ctx set) a root the walk cannot classify is a hit; written in the slot itself it keeps the existing rule
    if (!b) { if (ctx && !isDirect(ctx)) out.push({ msg: `<${tagText(n)}> cannot be read in a ${type} slot`, at: n }); return out; }
    if (b.kit && b.origin !== 'local') {
      if (!inSlotType(b, type) && !viaSlot(slotName(b), f, type)) out.push({ msg: `<${slotName(b)}> in a ${type} slot`, at: n });
      // A kit part that passes its slot on (its `children` slot type is the slot it stands in: CellLines in a cell):
      // its children, written between its tags or as a `children` prop, are that slot's content,
      // checked by the same rules.
      else if (reg.slots[slotName(b)] && reg.slots[slotName(b)].children === type && !seen.has(n) && jsxStep(n)) {
        seen.add(n);
        if (ts.isJsxElement(n)) fragmentProblems(file, type, n, depth, seen, out, ctx);
        // a spread can carry children the walk cannot see: fail closed
        if (f.spreads.length) out.push({ msg: `a spread on <${b.def}> (its children cannot be read) in a ${type} slot`, at: f.spreads[0] });
        const ce = f.attrs.has('children') ? attrExpr(f.attrs.get('children')) : null;
        if (ce) {
          const parts = ctx ? valueParts(ce, ctx === WRAPPED ? null : ctx, file) : jsxContents(ce, [], 0, new Set()).map((x) => ({ jsx: x, ctx: null, file }));
          for (const x of parts) itemProblems(type, x, depth, seen, out);
        }
        seen.delete(n);
      }
      return out;
    }
    if (ctx && !isDirect(ctx) && !(b.origin === 'local' && b.file)) { out.push({ msg: `<${b.def || tagText(n)}> cannot be read in a ${type} slot`, at: n }); return out; }
    // A local component in a slot is judged by what it renders, as if that were written in the slot: its returns, through
    // conditions, maps, consts and same-file calls (jsxContents), each part by the same rules, nested components included
    // up to WRAP_DEPTH. One hit at the site, naming the first problem (and how many more).
    if (b.origin === 'local' && b.file) {
      const key = `${b.file}#${b.def}`;
      const fn = fnOfDef(b.file, b.def);
      let inner = [];
      if (!fn) inner = [{ msg: `<${b.def}> cannot be read (not a function component) in a ${type} slot` }];
      else if (seen.has(key) || onPath(ctx, fn)) inner = [{ msg: `<${b.def}> renders itself: too deep to check in a ${type} slot` }];
      else if (depth >= WRAP_DEPTH) inner = [{ msg: `<${b.def}> nests local components past ${WRAP_DEPTH} levels: too deep to check in a ${type} slot` }];
      else {
        seen.add(key);
        const c = { fn, use: n, parent: ctx === WRAPPED || (ctx && ctx.direct) ? null : ctx, file: b.file, useFile: file };
        const rets = fn.body && !ts.isBlock(fn.body) ? [fn.body] : returnsOf(fn);
        if (writtenIn(fn.getSourceFile(), b.def)) inner = [{ msg: `<${b.def}> is reassigned: cannot be read in a ${type} slot` }];
        else for (const r of rets) for (const it of valueParts(r, c, b.file)) itemProblems(type, it, depth + 1, seen, inner);
        seen.delete(key);
      }
      if (inner.length) {
        // the wrapper's own verdict (unreadable, reassigned, too deep) reads as it is; a problem in what it renders reads "renders ..."
        const own = !inner[0].at && inner[0].msg.startsWith(`<${b.def}> `) && !inner[0].msg.startsWith(`<${b.def}> renders `);
        const m = inner[0].msg.replace(/^<[^>]+> renders /, '').replace(/ in an? (\S+) slot$/, ' into a $1 slot');
        out.push({ msg: `${own ? inner[0].msg : `<${b.def}> renders ${m}`}${inner.length > 1 ? ` (and ${inner.length - 1} more)` : ''}`, at: n });
      }
    }
    return out;
  }
  /** True when everything `x` can render is an overlay: a kit overlay (reg.overlays), a kit portal part (reg.portals), or a
   *  component (local or kit composite) whose every reachable root, through jsxContents and fragments, is one. Anything not
   *  proven (raw markup, other parts, an unreadable or too deep definition) is false: it is then judged as content. */
  function overlayOnly(file, it, depth, seen) {
    if (!it.jsx) return false; // text or a value the walk cannot prove is never an overlay
    const x = it.jsx;
    if (ts.isJsxFragment(x)) {
      // a fragment already on this path (a helper that returns one around a call of itself) is not proven an overlay
      if (seen.has(x)) return false;
      const ps = [];
      for (const c of x.children) {
        if (ts.isJsxText(c)) { if (hasVisibleJsxText(c.text)) return false; continue; }
        ps.push(...childParts(c, it.ctx, it.file || file));
      }
      seen.add(x);
      const all = ps.length > 0 && ps.every((q) => overlayOnly(file, q, depth, seen));
      seen.delete(x);
      return all;
    }
    const f = facts(it.file || file, x);
    if (f.intrinsic.length) return false;
    const b = f.binding;
    if (!b) return false;
    if (b.kit && b.origin !== 'local' && (reg.overlays.includes(b.def) || (reg.portals || []).includes(b.def))) return true;
    if (!b.file || depth >= WRAP_DEPTH) return false;
    const key = `${b.file}#${b.def}`;
    if (seen.has(key)) return false;
    const fn = fnOfDef(b.file, b.def);
    if (!fn || onPath(it.ctx, fn)) return false;
    seen.add(key);
    if (writtenIn(fn.getSourceFile(), b.def)) { seen.delete(key); return false; }
    const c = { fn, use: x, parent: it.ctx === WRAPPED || (it.ctx && it.ctx.direct) ? null : it.ctx, file: b.file, useFile: it.file || file };
    const rets = fn.body && !ts.isBlock(fn.body) ? [fn.body] : returnsOf(fn);
    const roots = rets.flatMap((r) => valueParts(r, c, b.file));
    const ok = roots.length > 0 && roots.every((r) => overlayOnly(b.file, r, depth + 1, seen));
    seen.delete(key);
    return ok;
  }
  /** True when `x` holds a trigger: a kit action part (the actions slot list, ActionMenu included) anywhere in its JSX,
   *  including JSX passed in props, or in what a local component it uses renders (bounded by WRAP_DEPTH). */
  function triggerIn(file, x, depth, seen) {
    const acts = slotTypeNames('actions');
    let found = false;
    const visit = (m) => {
      if (found) return;
      if (isJsxEl(m)) {
        const b = facts(file, m).binding;
        if (b && b.kit && b.origin !== 'local' && acts.includes(b.def)) { found = true; return; }
        if (b && b.origin === 'local' && b.file && depth < WRAP_DEPTH && !seen.has(`${b.file}#${b.def}`)) {
          const fn = fnOfDef(b.file, b.def);
          if (fn) {
            const key = `${b.file}#${b.def}`;
            seen.add(key);
            for (const r of returnsOf(fn)) for (const y of jsxContents(r, [], 0, seen)) if (!found && triggerIn(b.file, y, depth + 1, seen)) found = true;
            seen.delete(key);
            if (found) return;
          }
        }
      }
      ts.forEachChild(m, visit);
    };
    visit(x);
    return found;
  }
  function fragmentProblems(file, type, n, depth, seen, out, ctx = null) {
    const partsOf = (c) => childParts(c, ctx, file);
    // A dialog beside its trigger renders in a portal, outside the slot: it is not slot content. The checkable shape: a fragment
    // child every part of which is an overlay (overlayOnly), and another child of the same fragment holding a trigger
    // (triggerIn: a kit action part, in its own JSX, its props' JSX or what a local component renders). A dialog in the same
    // child as content (cond ? <A /> : <Dialog />), alone, or used directly in the slot is judged like any part.
    const kids = n.children.filter((c) => !ts.isJsxText(c)).map((c) => ({ c, parts: partsOf(c) }));
    const overlayKid = (k) => k.parts.length > 0 && k.parts.every((x) => overlayOnly(file, x, 0, new Set()));
    const exempt = new Set(kids.filter((k) => overlayKid(k) && kids.some((o) => o !== k && !overlayKid(o) && o.parts.some((x) => x.jsx && triggerIn(x.file || file, x.jsx, 0, new Set())))).map((k) => k.c));
    for (const c of n.children) {
      // element children, the elements an expression child can produce ({cond && <X />}, a .map), and visible text where only elements fit
      const parts = exempt.has(c) ? [] : partsOf(c);
      for (const x of parts) itemProblems(type, x, depth, seen, out);
      if (ts.isJsxText(c) && hasVisibleJsxText(c.text) && !TEXT_SLOT_TYPES.includes(type)) out.push({ msg: `visible text in a ${type} slot`, at: c });
    }
  }

  // ── per-file passes ──
  const cssPassed = new Map(); // css file -> Set(class) a page passes to a kit component
  for (const file of scannedSource) {
    const sf = P.sourceOf(file);
    const info = P.infoOf(file);
    jsxBudget = { left: JSX_WALK_BUDGET, at: null, cut: null };
    const consumer = isConsumer(reg, file);
    const D = reg.drafty;
    const rend = rendererFor(reg, file);
    const isPage = startsWithAny(file, reg.pageRoots);
    const inKit = file.startsWith('kit/');
    const isManifest = /^pages\/[^/]+\/page\.ts$/.test(file);
    const cssMods = new Map();
    for (const [local, imp] of info.imports) if (/\.module\.css$/.test(imp.spec)) {
      const t = path.posix.join(path.posix.dirname(file), imp.spec);
      cssMods.set(local, t);
    }

    const landmarkAllowed = (tag) => !!rend && (rend.landmarks === '*' || (Array.isArray(rend.landmarks) && rend.landmarks.includes(tag)));
    const headingOrLandmark = (tag, node, viaAs) => {
      if (HEADING.test(tag)) hit(file, node, 'layout.heading', `${viaAs ? 'as="' + tag + '"' : '<' + tag + '>'}: a heading comes from the kit (Heading / PageHeader / Section title)`);
      else if (LANDMARKS.has(tag) && !landmarkAllowed(tag)) hit(file, node, 'layout.landmark', `${viaAs ? 'as="' + tag + '"' : '<' + tag + '>'}: landmarks come from the kit archetypes`);
    };

    const visit = (n) => {
      if (isJsxEl(n)) onElement(n);
      else if (ts.isCallExpression(n)) onCall(n);
      if (isFunctionLikeDef(n)) onFunctionDef(n);
      ts.forEachChild(n, visit);
    };

    function isFunctionLikeDef(n) {
      return ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n);
    }

    /** React's createElement under any local spelling: a named alias, React.createElement / a namespace, a const alias, or a re-export. */
    function isReactFactory(c, depth) {
      c = unparen(c);
      if (depth > 3) return false;
      const fromReact = (b, names) => !!b && b.origin === 'external' && b.spec === 'react' && names.includes(b.def);
      if (ts.isIdentifier(c)) {
        // a name declared here (a parameter, a local, a function) is that declaration, never the module's import of the same spelling
        const d = localDecl(c);
        if (d) {
          const init = ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) ? d.initializer && unparen(d.initializer) : null;
          return !!init && (ts.isIdentifier(init) || ts.isPropertyAccessExpression(init)) && isReactFactory(init, depth + 1);
        }
        return fromReact(P.traceLocal(file, c.text), ['createElement']);
      }
      if (ts.isPropertyAccessExpression(c) && c.name.text === 'createElement') {
        const root = unparen(c.expression);
        return ts.isIdentifier(root) && !localDecl(root) && fromReact(P.traceLocal(file, root.text), ['default', '*']);
      }
      return false;
    }
    /** The tag strings of a createElement first argument: a literal, a conditional of literals, or a const holding one. */
    function tagStringsOf(e) {
      e = unparen(e);
      if (ts.isIdentifier(e)) {
        const init = initializerOf(e);
        return init ? stringsOf(init) : [];
      }
      return stringsOf(e);
    }

    function onCall(n) {
      const c = n.expression;
      const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '';
      if (n.arguments[0] && isReactFactory(c, 0)) {
        for (const tag of tagStringsOf(n.arguments[0])) {
          headingOrLandmark(tag, n, false);
          // createElement('p', props, 'text'): the same text rule as written JSX
          if (consumer && !(rend && rend.text) && TEXT_PARENTS.has(tag) && n.arguments.slice(2).some((a) => isStringish(a))) {
            hit(file, n, 'layout.text', `text written directly in createElement('${tag}'): text has seven kit places (subtitle, description, info, note, item meta, field help, notice)`);
          }
        }
        // createElement(tag, { 'data-hub-x': 1 }): the kit's markers are the kit's
        const props = n.arguments[1] && unparen(n.arguments[1]);
        if (consumer && !file.startsWith('shell/') && props && ts.isObjectLiteralExpression(props)) {
          for (const p of props.properties) {
            const k = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) ? p.name.text : null;
            if (k && k.startsWith('data-hub-')) hit(file, p, 'layout.marker', `${k}: only the kit writes data-hub-* markers`);
          }
        }
      }
      if (isPage && ts.isIdentifier(c)) {
        // the hooks under any local name; the matchScreen exemption belongs to the call whose value feeds matchScreen, not to the file
        const b = P.traceLocal(file, c.text);
        if (b && b.kit && b.def === 'useSubPath' && !feedsMatchScreen(n)) hit(file, n, 'layout.screens', 'useSubPath outside matchScreen: routes come from manifest.screens');
        if (b && b.kit && b.def === 'usePathname' && pathnameParsed(n) && !feedsMatchScreen(n)) hit(file, n, 'layout.screens', 'usePathname split into a sub-path: routes come from manifest.screens');
      }
      if (isManifest && name === 'definePage') onDefinePage(n);
    }

    const isMatchScreenCall = (x) => {
      if (!ts.isCallExpression(x) || !ts.isIdentifier(x.expression)) return false;
      if (localDecl(x.expression)) return false; // a local function that happens to be called matchScreen is not the kit's
      const b = P.traceLocal(file, x.expression.text);
      return !!b && b.kit && b.def === 'matchScreen';
    };
    /** Whether the value of `n` (through .split()/[i]/!/as chains) is handed to the kit's matchScreen, directly or through a const. */
    function feedsMatchScreen(n) {
      let e = n;
      while (e.parent && ((ts.isPropertyAccessExpression(e.parent) && e.parent.expression === e) || (ts.isElementAccessExpression(e.parent) && e.parent.expression === e) || (ts.isCallExpression(e.parent) && e.parent.expression === e) || ts.isNonNullExpression(e.parent) || ts.isParenthesizedExpression(e.parent) || ts.isAsExpression(e.parent))) e = e.parent;
      const p = e.parent;
      if (!p) return false;
      if (isMatchScreenCall(p) && p.arguments.includes(e)) return true;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && p.initializer === e) {
        let scope = p.parent;
        while (scope && !ts.isBlock(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
        return reachesMatchScreen(localDecl(p.name) || p, scope, new Set(), 0);
      }
      return false;
    }
    /** The function a declaration names (a function declaration, or a const holding a function value; a reassignable one is not followed), else null. */
    const fnOfDecl = (d) => (!d ? null : ts.isFunctionDeclaration(d) ? d : ts.isVariableDeclaration(d) && d.initializer && d.parent.flags & ts.NodeFlags.Const && isFnValue(d.initializer) ? unparen(d.initializer) : null);
    /**
     * Whether the binding `decl` (a variable, or a parameter) is handed to the kit's matchScreen somewhere in `scope`: directly, or
     * as an argument of a local helper whose matching parameter is handed on the same way. Bindings are compared by identity, so a
     * shadowing name proves nothing; `seen` and `depth` bound recursive helpers.
     */
    function reachesMatchScreen(decl, scope, seen, depth) {
      if (!scope || depth > 3 || seen.has(decl)) return false;
      seen.add(decl); // the recursion stack: left on return, so a failed deep visit never blocks a shallower one
      const isIt = (a) => {
        a = unparen(a);
        return ts.isIdentifier(a) && localDecl(a) === decl;
      };
      let found = false;
      const walk = (x) => {
        if (found) return;
        if (ts.isCallExpression(x)) {
          if (isMatchScreenCall(x)) {
            if (x.arguments.some(isIt)) {
              found = true;
              return;
            }
          } else if (ts.isIdentifier(x.expression)) {
            const f = fnOfDecl(localDecl(x.expression));
            if (f && f.body) {
              x.arguments.forEach((a, i) => {
                const prm = f.parameters[i];
                if (!found && isIt(a) && prm && ts.isIdentifier(prm.name) && reachesMatchScreen(prm, f.body, seen, depth + 1)) found = true;
              });
              if (found) return;
            }
          }
        }
        ts.forEachChild(x, walk);
      };
      walk(scope);
      seen.delete(decl);
      return found;
    }

    function pathnameParsed(call) {
      const p = call.parent;
      // usePathname().split(...)
      if (ts.isPropertyAccessExpression(p) && p.expression === call && PARSE_METHODS.has(p.name.text)) return true;
      if (!ts.isVariableDeclaration(p) || !ts.isIdentifier(p.name)) return false;
      const v = p.name.text;
      let scope = p.parent;
      while (scope && !ts.isBlock(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
      if (!scope) return false;
      let found = false;
      const w = (x) => {
        if (found) return;
        if (ts.isPropertyAccessExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === v && PARSE_METHODS.has(x.name.text)) found = true;
        if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === 'test' && x.arguments.some((a) => ts.isIdentifier(a) && a.text === v)) found = true;
        ts.forEachChild(x, w);
      };
      w(scope);
      return found;
    }

    function onDefinePage(call) {
      const arg = unparen(call.arguments[0]);
      if (!arg || !ts.isObjectLiteralExpression(arg)) return;
      const props = new Map();
      for (const p of arg.properties) if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))) props.set(p.name.text, p);
      if (!props.has('screens')) hit(file, call, 'layout.screens', 'the manifest declares no screens');
      const layoutProp = props.get('layout');
      const layout = layoutProp && ts.isStringLiteralLike(unparen(layoutProp.initializer)) ? unparen(layoutProp.initializer).text : null;
      if (layout === 'custom') hit(file, layoutProp, 'layout.manifest', "layout: 'custom' is retired");
      const allowed = new Set(layout ? [layout] : []);
      const sub = props.get('subLayouts');
      // subLayouts are read only as an inline literal of string literals: anything else would leave the root check with no
      // layouts to prove, so it is a hit of its own, never a silent skip
      const subUnread = () => hit(file, sub, 'layout.manifest', 'subLayouts the rule cannot read: write them inline, each a string literal');
      if (sub && ts.isObjectLiteralExpression(unparen(sub.initializer))) {
        for (const sp of unparen(sub.initializer).properties) {
          if (ts.isPropertyAssignment(sp) && ts.isStringLiteralLike(unparen(sp.initializer))) allowed.add(unparen(sp.initializer).text);
          else return subUnread();
        }
      } else if (sub) return subUnread();
      const load = props.get('load');
      if (!layout || !load) return;
      let target = null;
      const w = (x) => {
        if (target) return;
        if (ts.isCallExpression(x) && x.expression.kind === ts.SyntaxKind.ImportKeyword && x.arguments[0] && ts.isStringLiteralLike(x.arguments[0])) target = x.arguments[0].text;
        ts.forEachChild(x, w);
      };
      w(load.initializer);
      if (!target) return;
      const t = P.resolveSpec(file, target);
      if (!t.file) return;
      const b = P.exportBinding(t.file, 'default', 0, false);
      if (!b || !b.file) return;
      const fn = fnOfDef(b.file, b.def);
      if (!fn) return;
      const seenLayouts = new Set();
      for (const r of rootsOfFn(b.file, fn, 0, new Set([`${b.file}#${b.def}`]))) {
        if (r.kind === 'archetype' && !allowed.has(r.layout) && !seenLayouts.has(r.layout)) {
          seenLayouts.add(r.layout);
          hit(file, layoutProp || call, 'layout.manifest', `the page's root is a ${r.def} (${r.layout}) but the manifest says ${[...allowed].join(', ')}`);
        }
      }
    }

    // A local component that renders a heading/landmark, or forwards its own props into a kit section as chrome.
    function onFunctionDef(n) {
      if (!consumer || rend) return;
      let name = null;
      let fn = null;
      if (ts.isFunctionDeclaration(n) && n.name) {
        name = n.name.text;
        fn = n;
      } else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        name = n.name.text;
        fn = fnOfDef(file, name);
        if (fn && fn.parent && !(unparen(n.initializer) === fn || ts.isCallExpression(unparen(n.initializer)))) fn = null;
      }
      if (!name || !fn || !/^[A-Z]/.test(name) || !fn.body) return;
      let chrome = null;
      const params = new Set();
      for (const p of fn.parameters) collectBound(p.name, params);
      const w = (x) => {
        if (chrome) return;
        if (x !== fn && ts.isFunctionLike(x) && !isJsxCallback(x)) return;
        if (isJsxEl(x)) {
          const f = facts(file, x);
          if (f.intrinsic.some((t) => HEADING.test(t) || LANDMARKS.has(t))) chrome = `renders a <${f.intrinsic.find((t) => HEADING.test(t) || LANDMARKS.has(t))}>`;
          else if (f.binding && f.binding.kit && ['Section', 'SubSection', 'AnatomySection', 'Panel'].includes(f.binding.def)) {
            for (const nm of ['title', 'heading', 'description', 'actions']) {
              const e = unparen(attrExpr(f.attrs.get(nm) || {}));
              if (e && rootIdent(e) && params.has(rootIdent(e).text)) chrome = `forwards its ${nm} prop into <${f.binding.def}>`;
            }
          }
        }
        ts.forEachChild(x, w);
      };
      ts.forEachChild(fn, w);
      if (chrome) hit(file, n, 'layout.localChrome', `${name} ${chrome}: a look-alike of kit chrome`);
    }
    const isJsxCallback = (x) => ts.isArrowFunction(x) || ts.isFunctionExpression(x);
    function collectBound(b, set) {
      if (ts.isIdentifier(b)) set.add(b.text);
      else for (const e of b.elements) if (!ts.isOmittedExpression(e)) collectBound(e.name, set);
    }
    function rootIdent(e) {
      while (ts.isPropertyAccessExpression(e)) e = e.expression;
      return ts.isIdentifier(e) ? e : null;
    }

    // ── a kit DataTable's own empty state ──
    // A state component written as the `empty` value of a kit DataTable is the table's empty state. It is in place when the table
    // renders where data states belong: inside a Widget, inside a `state` value, or inside a kit Section that takes a `state` (the
    // Section draws loading and failure; the table draws its own no-rows). The walk reads the table's ancestry through the file's
    // own components to the places they are rendered; anything it cannot prove stays a hit (fail closed).
    /** True when `n` is a kit EmptyState written as the `empty={…}` value of a kit DataTable that renders in a state home (a
     *  Skeleton or ErrorState there is a loading or failure state: the Section's state draws those). */
    function tableEmptyHome(file, n) {
      if (!isKitDef(facts(file, n), ['EmptyState'])) return false;
      let e = n.parent;
      while (e && ts.isParenthesizedExpression(e)) e = e.parent;
      if (!e || !ts.isJsxExpression(e) || !e.parent || !ts.isJsxAttribute(e.parent) || attrName(e.parent) !== 'empty') return false;
      const op = e.parent.parent && e.parent.parent.parent; // JsxAttribute -> JsxAttributes -> its opening element
      if (!op || !(ts.isJsxOpeningElement(op) || ts.isJsxSelfClosingElement(op))) return false;
      const el = ts.isJsxOpeningElement(op) ? op.parent : op;
      return isKitDef(facts(file, el), ['DataTable']) && inStateHome(file, el, 0, new Set());
    }
    /** True when element `el` renders inside a Widget, a `state` value or a kit Section with a `state`: read lexically, and from the
     *  top of a component of this file (see stateHomeComponent) on at every place it is rendered (depth <= 4, cycles cut). A
     *  Widget or Section counts only for its children: a table in one of its attributes (actions, description) is not in it. */
    function inStateHome(file, el, depth, seen) {
      for (let c = el, p = el.parent; p; c = p, p = p.parent) {
        if (ts.isJsxAttribute(p) && attrName(p) === 'state') return true;
        if (ts.isJsxElement(p) && c !== p.openingElement) {
          const g = facts(file, p);
          if (isKitDef(g, ['Widget'])) return true;
          if (g.binding && g.binding.kit && g.binding.file && g.binding.file.startsWith(reg.strictDir) && reg.strictSections.includes(g.binding.def) && hasStateAttr(g)) return true;
        }
        if (ts.isFunctionLike(p)) {
          const decl = stateHomeComponent(p);
          if (decl) return depth < 4 && !seen.has(decl) && rendersInStateHome(file, decl, depth, new Set([...seen, decl]));
        }
      }
      return false;
    }
    /** The declaration of a component that `fn` is the body of, when its every use can be read: a top-level function declaration or
     *  a const bound directly to an arrow or function expression, of the file, neither exported nor default; else null. */
    function stateHomeComponent(fn) {
      let d = null;
      if (ts.isFunctionDeclaration(fn) && fn.name && fn.parent && ts.isSourceFile(fn.parent)) d = fn;
      else if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
        let q = fn.parent;
        while (q && ts.isParenthesizedExpression(q)) q = q.parent;
        const list = q && ts.isVariableDeclaration(q) && ts.isIdentifier(q.name) && unparen(q.initializer) === fn ? q.parent : null;
        if (list && ts.isVariableDeclarationList(list) && list.flags & ts.NodeFlags.Const && list.parent && ts.isVariableStatement(list.parent) && list.parent.parent && ts.isSourceFile(list.parent.parent)) d = q;
      }
      if (!d || ts.getCombinedModifierFlags(d) & (ts.ModifierFlags.Export | ts.ModifierFlags.Default)) return null;
      return d;
    }
    /** True when component `decl` is rendered at least once and every reference to its name in the file is the tag of a JSX element
     *  that resolves to it (localDecl) and renders in a state home. Any other reference (a value, an export list, a write, a
     *  property of the same spelling) refuses. */
    function rendersInStateHome(file, decl, depth, seen) {
      const name = decl.name.text;
      let uses = 0;
      let bad = false;
      const visit = (x) => {
        if (bad) return;
        if (ts.isIdentifier(x) && x.text === name && x !== decl.name) {
          const t = x.parent;
          if (t && ts.isJsxClosingElement(t) && t.tagName === x) {
            // the closing tag of a use counted at its opening tag
          } else if (t && (ts.isJsxOpeningElement(t) || ts.isJsxSelfClosingElement(t)) && t.tagName === x && localDecl(x) === decl) {
            uses++;
            if (!inStateHome(file, ts.isJsxOpeningElement(t) ? t.parent : t, depth + 1, seen)) bad = true;
          } else bad = true;
        }
        ts.forEachChild(x, visit);
      };
      visit(decl.getSourceFile());
      return !bad && uses > 0;
    }

    function onElement(n) {
      const f = facts(file, n);
      const op = f.op;

      // headings and landmarks (intrinsic, dynamic, `as`)
      for (const tag of f.intrinsic) headingOrLandmark(tag, n, false);
      const as = f.attrs.get('as');
      if (as) {
        const v = attrLiteral(as);
        if (typeof v === 'string' && (HEADING.test(v) || LANDMARKS.has(v))) headingOrLandmark(v, n, true);
      }

      // markers (page code writing the kit's data-hub-* attributes; the shell's own hooks are not page content)
      if (consumer && !file.startsWith('shell/')) {
        for (const [name, a] of f.attrs) if (name && name.startsWith('data-hub-')) hit(file, a, 'layout.marker', `${name}: only the kit writes data-hub-* markers`);
        for (const sp of f.spreads) {
          const e = unparen(sp.expression);
          const obj = e && ts.isObjectLiteralExpression(e) ? e : e && ts.isIdentifier(e) ? unparen(initializerOf(e)) : null;
          if (obj && ts.isObjectLiteralExpression(obj)) {
            for (const p of obj.properties) {
              const k = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) ? p.name.text : null;
              if (k && k.startsWith('data-hub-')) hit(file, sp, 'layout.marker', `${k}: only the kit writes data-hub-* markers`);
            }
          }
        }
      }

      // text directly in an intrinsic
      if (consumer && !(rend && rend.text) && f.intrinsic.length === 1 && TEXT_PARENTS.has(f.intrinsic[0])) {
        const direct = childrenOf(n).some((c) => (ts.isJsxText(c) && /\S/.test(c.text.replace(/&nbsp;/g, ' '))) || (ts.isJsxExpression(c) && c.expression && isStringish(c.expression)));
        if (direct) {
          let inVisual = false;
          for (const a of ancestorEls(file, n)) if (isKitDef(a, ['Visual'])) inVisual = true;
          if (!inVisual) hit(file, n, 'layout.text', `text written directly in a <${f.intrinsic[0]}>: text has seven kit places (subtitle, description, info, note, item meta, field help, notice)`);
        }
      }

      // states
      if (consumer && inKitNamed(f, STATE_COMPONENTS)) {
        let ok = false;
        for (let p = n.parent; p && !ok; p = p.parent) {
          if (ts.isJsxAttribute(p) && attrName(p) === 'state') ok = true;
          if (isJsxEl(p) && isKitDef(facts(file, p), ['Widget'])) ok = true;
        }
        if (!ok) ok = tableEmptyHome(file, n);
        if (!ok) hit(file, n, 'layout.state', `${f.binding.def} outside a Widget or a Section's state: data states come from the Section state renderer`);
      }

      // strict section without a state
      if (consumer && f.binding && f.binding.kit && f.binding.file && f.binding.file.startsWith(reg.strictDir) && reg.strictSections.includes(f.binding.def) && !hasStateAttr(f)) {
        let leaf = false;
        const w = (x) => {
          if (leaf) return;
          if (isJsxEl(x) && x !== n) {
            const g = facts(file, x);
            if (g.binding && g.binding.kit && reg.dataLeaves.includes(g.binding.def)) leaf = true;
            if (g.binding && g.binding.kit && g.binding.file && g.binding.file.startsWith(reg.strictDir) && reg.strictSections.includes(g.binding.def)) return; // a nested section judges its own
          }
          if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === 'map' && x.arguments[0] && jsxContents(x.arguments[0]).length) leaf = true;
          ts.forEachChild(x, w);
        };
        for (const c of childrenOf(n)) w(c);
        if (leaf) hit(file, n, 'layout.stateMissing', `${f.binding.def} holds a data leaf and has no state`);
      }

      // legacy
      if (f.binding && f.binding.via && f.binding.kit) {
        const leg = reg.legacy.find((l) => l.file === f.binding.file && l.names.includes(f.binding.def));
        if (leg || (!f.binding.file && ['Panel', 'PageFrame'].includes(f.binding.def)) || (isPage && f.binding.file && reg.legacyPageOnly.includes(f.binding.def) && f.binding.file.startsWith('kit/'))) {
          const inDefining = f.binding.file === file;
          if (!inDefining) hit(file, n, 'layout.legacy', `<${f.binding.def}> is the legacy API (being removed)`);
        }
        if (f.binding.def === 'Stack' && attrLiteral(f.attrs.get('padding')) === 'page') hit(file, n, 'layout.legacy', '<Stack padding="page"> is the legacy page frame');
        if (f.binding.def === 'SettingsPage') {
          const sec = unparen(attrExpr(f.attrs.get('sections') || {}));
          const arr = sec && ts.isIdentifier(sec) ? unparen(initializerOf(sec)) : sec;
          if (arr && ts.isArrayLiteralExpression(arr)) {
            for (const el of arr.elements) {
              const o = unparen(el);
              if (!o || !ts.isObjectLiteralExpression(o)) continue;
              for (const p of o.properties) if (ts.isPropertyAssignment(p) && p.name.getText() === 'description' && jsxContents(p.initializer).length) hit(file, p, 'layout.legacy', 'a ReactNode description on a SettingsSection: use a string');
            }
          }
        }
      }

      // Layout rules: loose FaqLinks, more than one Band in a section, an <ol> in an overlay body
      if (D && consumer && !file.startsWith('kit/gallery/')) {
        if (isKitDef(f, ['FaqLink'])) {
          // climb the file's JSX: through a child, a Why or Faq holds it; through an attribute, only a Band's or Section's `actions`
          let ok = false;
          let via = null;
          for (let p = n.parent; p && !ok; p = p.parent) {
            if (ts.isJsxSpreadAttribute(p)) break; // a spread's keys are not read: loose
            if (ts.isJsxAttribute(p)) via = attrName(p);
            else if (isJsxEl(p)) {
              const a = facts(file, p);
              if (via === null) ok = isKitDef(a, D.faqIn);
              else if (via === 'actions' && isKitDef(a, D.faqActions)) ok = true;
              else break; // any other attribute ends the climb: loose
              via = null;
            }
          }
          if (!ok) hit(file, n, 'layout.looseFaqLink', 'a FaqLink outside a Why: it ends a Why (or sits in a Band or Section header actions), never loose in a body');
        }
        if (isKitDef(f, D.bandHosts) && isJsxEl(n)) {
          const { n: bands, cut } = bandCount(file, n, D);
          // keyed by the body's scope (an overlay's own id), not the scope the host element sits in
          if (cut) hit(file, n, 'layout.bandsPerSection', `a ${f.binding.def} body too large or too deep for the rule to count its Bands: split it into SubSections`, scopeOfNode(file, n.children[0]));
          else if (bands > 1) hit(file, n, 'layout.bandsPerSection', `${bands} Bands in one ${f.binding.def}: keep one; the others become a field's description, a Why or the Verdict`, scopeOfNode(file, n.children[0]));
        }
        if (f.intrinsic.includes('ol')) {
          if (olContexts(file, n, D).has('overlay')) hit(file, n, 'layout.drawerOl', 'an <ol> in an overlay body: steps are the kit StepList (or a Track), never a hand-made list');
        }
        // Form sections in overlays (FORM_RULES)
        {
          const field = isKitDef(f, FORM_FIELDS);
          const fieldset = f.intrinsic.includes('fieldset');
          const cls = f.attrs.get('className');
          const labelLook = !fieldset && f.intrinsic.some((t) => FORM_LABEL_TAGS.includes(t)) && !!cls && FORM_LABEL_CLASS.test(cls.getText(sf));
          if ((field || fieldset || labelLook) && olContexts(file, n, D).has('overlay')) {
            const scope = scopeOfNode(file, n);
            const { line } = lineOf(sf, n);
            if (fieldset) formHits.push({ rule: 'form.handGroup', file, scope, line, msg: 'a <fieldset> in an overlay body: a group of fields is a kit FormSection (its title is a step above the field labels)' });
            else if (labelLook) formHits.push({ rule: 'form.handGroup', file, scope, line, msg: 'text drawn as a label by a page class in an overlay body: a group\'s name is a FormSection title, a field\'s name is the kit field\'s label' });
            else if (![...ancestorEls(file, n)].some((a) => isKitDef(a, FORM_GROUPS))) {
              const key = `${file}|${scope}`;
              const at = formLoose.get(key);
              if (at) at.n++;
              else formLoose.set(key, { n: 1, file, scope, line });
            }
          }
        }
      }

      // actions written by hand
      if (consumer && !(rend) && f.intrinsic.length === 1) {
        let inItem = false;
        for (const a of ancestorEls(file, n)) if (isKitDef(a, ['Item', 'Tile', 'Choice'])) inItem = true;
        if (!inItem) {
          let has = false;
          const kids = [];
          const seen = new Set();
          for (const c of childrenOf(n)) {
            if (isJsxEl(c) || ts.isJsxFragment(c)) kids.push(c);
            else if (ts.isJsxExpression(c) && c.expression) kids.push(...jsxContents(c.expression, [], 0, seen));
          }
          const scanKids = (arr) => {
            for (const k of arr) {
              if (ts.isJsxFragment(k)) {
                // a fragment already being scanned on this path (a recursive helper) adds nothing new
                if (seen.has(k) || !jsxStep(k)) continue;
                seen.add(k);
                scanKids(childrenOf(k).flatMap((c) => (isJsxEl(c) || ts.isJsxFragment(c) ? [c] : ts.isJsxExpression(c) && c.expression ? jsxContents(c.expression, [], 0, seen) : [])));
                seen.delete(k);
              } else if (isKitDef(facts(file, k), reg.actionComponents)) has = true;
            }
          };
          scanKids(kids);
          if (has) hit(file, n, 'layout.actionRow', `a hand-written <${f.intrinsic[0]}> around actions: actions come from ActionSpec slots`);
        }
      }

      // prose
      if (consumer && f.binding && f.binding.kit && (!f.binding.file || startsWithAny(f.binding.file, reg.proseOrigins)) && reg.proseNames.includes(f.binding.def) && !file.startsWith(reg.proseDir) && !reg.proseConsumers.includes(file)) hit(file, n, 'layout.prose', `<${f.binding.def}> is for the Guide only`);

      // overlays need a literal id; a wrapper may forward its own id prop only while its render sites name the overlay
      if (!rend && isOverlayEl(f)) {
        const comp = enclosingComponent(file, n);
        // every id the element carries is judged: a wrapper with two forwarded props needs both named at each render site
        let bad = null;
        for (const attr of idAttrsOf(f)) {
          const r = idOf(f, comp, attr);
          if (r.lit) {
            if (!only || only.has(file)) overlays.push({ file, ...lineOf(P.sourceOf(file), n), id: r.lit });
            continue; // named
          }
          if (r.prop && comp && (renderSites.get(comp.key) || []).length) continue; // forwarded: every render site is judged in its own right
          bad = r;
          break;
        }
        if (bad) hit(file, n, 'layout.overlayId', bad.prop ? `<${f.binding ? f.binding.def : 'overlay'}> forwards an id that no render site names` : `<${f.binding ? f.binding.def : 'overlay'}> needs a literal overlayId`);
      }

      // Visual contents
      if (consumer && isKitDef(f, ['Visual'])) checkVisual(n);

      // slots
      if (consumer && f.binding && f.binding.kit && f.binding.origin !== 'local') checkSlots(n, f);

      // classes passed to a kit component (for layout.cssReach)
      if (isPage && f.binding && f.binding.kit && cssMods.size) {
        for (const [name, a] of f.attrs) {
          if (!/class/i.test(name || '')) continue;
          const e = attrExpr(a);
          if (e) moduleClassesIn(e, cssMods, (cssFile, cls) => {
            const set = cssPassed.get(cssFile) || new Set();
            set.add(cls);
            cssPassed.set(cssFile, set);
          });
        }
      }
    }

    function checkVisual(root) {
      const w = (x) => {
        if (isJsxEl(x) && x !== root) {
          const g = facts(file, x);
          if (g.intrinsic.length) {
            const t = g.intrinsic[0];
            if (INTERACTIVE.has(t) || !reg.visualGraphic.includes(t)) hit(file, x, 'layout.visual', `<${t}> inside Visual: graphic children only`);
          } else if (g.binding && g.binding.kit && !reg.visualKit.includes(g.binding.def)) hit(file, x, 'layout.visual', `<${g.binding.def}> inside Visual: graphic children only`);
          for (const nm of ['tabIndex', 'contentEditable', 'contenteditable']) if (g.attrs.has(nm)) hit(file, g.attrs.get(nm), 'layout.visual', `${nm} inside Visual: nothing focusable or editable`);
        }
        ts.forEachChild(x, w);
      };
      for (const nm of ['tabIndex', 'contentEditable']) if (facts(file, root).attrs.has(nm)) hit(file, root, 'layout.visual', `${nm} on Visual`);
      for (const c of childrenOf(root)) {
        if (ts.isJsxText(c) && /\S/.test(c.text)) hit(file, c, 'layout.visual', 'text directly inside Visual: use VisualLabel or svg <text>');
        else w(c);
      }
    }

    function checkSlots(n, f) {
      const sn = slotName(f.binding);
      const table = reg.slots[sn] || {};
      for (const [name, a] of f.attrs) {
        if (!name || reg.slotIgnoreProps.includes(name) || /^(on[A-Z]|aria-|data-)/.test(name)) continue;
        const e = attrExpr(a);
        if (!e) continue;
        const seen = new Set();
        const contents = jsxContents(e, [], 0, seen);
        const type = table[name];
        const direct = type ? directItems(e, type, file) : null;
        if (!contents.length && !(direct && direct.length)) continue;
        if (!type) {
          hit(file, a, 'layout.slot', `${sn}.${name} takes caller content and is not in the slot table`);
          continue;
        }
        const slot = slotHits(file, `${sn}.${name}`);
        if (direct) for (const it of direct) slot.add(itemNode(it), itemProblems(type, it, 0, seen, []));
        else for (const c of contents) slot.add(c, slotProblems(file, type, c, 0, seen));
        slot.flush();
      }
      // render-function children
      if (ts.isJsxElement(n)) {
        for (const c of n.children) {
          if (ts.isJsxExpression(c) && c.expression && isFnValue(c.expression) && (jsxContents(c.expression).length || (table.children && !TEXT_SLOT_TYPES.includes(table.children)))) {
            const type = table.children;
            if (!type) hit(file, c, 'layout.slot', `${sn} children as a function are not in the slot table`);
            else {
              const seen = new Set();
              const slot = slotHits(file, `${sn} children`);
              const direct = directItems(c.expression, type, file);
              if (direct) for (const it of direct) slot.add(itemNode(it), itemProblems(type, it, 0, seen, []));
              else for (const x of jsxContents(c.expression, [], 0, seen)) slot.add(x, slotProblems(file, type, x, 0, seen));
              slot.flush();
            }
          }
        }
      }
    }

    // DataTable column cell/header renderers (callbacks written in a column definition)
    const usesTable = [...info.imports].some(([local, imp]) => {
      if (imp.name !== 'DataTable' && imp.name !== 'createColumnHelper') return false;
      const b = P.traceLocal(file, local);
      return !!(b && b.kit);
    });
    const colSlot = (n) => {
      if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && (n.name.text === 'cell' || n.name.text === 'header') && isFnValue(n.initializer)) {
        const seen = new Set();
        const slot = slotHits(file, `DataTable ${n.name.text}`);
        for (const c of jsxContents(n.initializer, [], 0, seen)) slot.add(c, slotProblems(file, n.name.text === 'cell' ? (reg.slots.DataTable && reg.slots.DataTable.cell) || 'text' : 'text', c, 0, seen));
        slot.flush();
      }
    };

    // inline spacing
    const inlineStyle = (n) => {
      if (ts.isJsxAttribute(n) && attrName(n) === 'style') {
        let e = unparen(attrExpr(n));
        if (e && ts.isIdentifier(e)) e = unparen(initializerOf(e));
        if (e && ts.isObjectLiteralExpression(e)) {
          for (const p of e.properties) {
            if (ts.isSpreadAssignment(p)) {
              const s = ts.isIdentifier(unparen(p.expression)) ? unparen(initializerOf(unparen(p.expression))) : null;
              if (s && ts.isObjectLiteralExpression(s)) for (const q of s.properties) if (q.name && SPACING_PROP.test(q.name.getText().replace(/['"]/g, ''))) hit(file, n, 'layout.inlineSpacing', `inline style ${q.name.getText()}`);
            } else if (p.name && SPACING_PROP.test(p.name.getText().replace(/['"]/g, ''))) hit(file, p, 'layout.inlineSpacing', `inline style ${p.name.getText()}`);
          }
        }
      }
    };

    const extra = (n) => {
      if (usesTable) colSlot(n);
      if ((isPage || file.startsWith('shell/')) && !rend) inlineStyle(n);
      ts.forEachChild(n, extra);
    };

    // re-exports of a legacy binding count as importers
    if (consumer || inKit) {
      for (const [exportName, e] of info.named) {
        if (!e.from && !e.local) continue;
        const b = e.from ? P.exportBinding(file, exportName, 0, false) : info.imports.has(e.local) ? P.traceLocal(file, e.local) : null;
        if (b && b.kit && b.file && b.file !== file && reg.legacy.some((l) => l.file === b.file && l.names.includes(b.def))) hit(file, e.node || sf, 'layout.legacy', `re-exports the legacy <${b.def}>`);
      }
    }

    visit(sf);
    extra(sf);
    // fail closed: a file whose JSX walks passed the budget is not known to be clean
    if (jsxBudget.at) {
      const at = jsxBudget.at.getSourceFile() === sf ? jsxBudget.at : sf;
      hit(file, at, 'layout.slot', `too deep to check: the JSX this file's slots and action rows can produce took over ${JSX_WALK_BUDGET} steps to walk; simplify the helpers it calls`);
    }
    if (jsxBudget.cut) {
      const at = jsxBudget.cut.getSourceFile() === sf ? jsxBudget.cut : sf;
      hit(file, at, 'layout.slot', `too deep to check: an expression the slots and action rows can produce nests past ${JSX_DEPTH} levels; simplify it`);
    }
    jsxBudget = { left: Infinity, at: null, cut: null };
  }

  // ── CSS ──
  const gapTokens = files['kit/tokens.css'] ? cssVars(cssRules(files['kit/tokens.css']).rules) : {};
  // The step is read when the first gap declaration needs it, so a scan of files with no gap never asks the token file.
  let gapStepMemo;
  const gapStep = () => {
    if (gapStepMemo === undefined) gapStepMemo = files['kit/tokens.css'] ? cssPx('var(--sp-2)', gapTokens) : GAP_STEP_PX;
    if (gapStepMemo === null) throw new Error('kit/tokens.css has no resolvable --sp-2');
    return gapStepMemo;
  };
  for (const file of scannedCss) {
    const { rules, text: css } = cssRules(files[file]);
    const passed = cssPassed.get(file) || new Set();
    const addCss = (rule, at, msg) => {
      if ((only && !only.has(file)) || disabled.has(rule)) return;
      hits.push({ rule, file, scope: 'main', line: lineAt(css, at), col: 1, msg });
    };
    const ruleVars = new Map();
    const gapVars = (r) => ruleVars.get(r) ?? ruleVars.set(r, { ...gapTokens, ...cssVars(rules, r) }).get(r);
    for (const r of rules) {
      for (const d of r.decls) {
        if (/^margin(-|$)/.test(d.prop)) {
          const v = d.value.replace(/!important/i, '').trim();
          const zero = /^(?:(?:0(?:\.0+)?(?:[a-z%]+)?|auto|inherit|initial|unset|revert)\s*)+$/i.test(v);
          if (!zero) addCss('layout.cssMargin', d.at, `${d.prop}: ${v}`);
        }
        if (/var\(\s*--(?:t-(?:section|heading|title|display)|fs-(?:lg|xl|2xl|3xl))\s*[,)]/.test(d.value)) addCss('layout.cssType', d.at, `${d.prop}: ${d.value}`);
        if (/^--(?:pad-card|gap-|sg-)/.test(d.prop)) addCss('layout.cssReach', d.at, `overrides the kit property ${d.prop}`);
        if (GAP_PROP.test(d.prop) && !gapSmall(gapFirst(d, gapVars(r)), gapVars(r), gapStep()) && !(provenRow(r.decls) && !rules.some((o) => o.decls.some((x) => FLOW_PROP.test(x.prop) && (o !== r || x.cond))))) addCss('layout.cssGap', d.at, `${d.prop}: ${d.value.replace(/!\s*important\s*$/i, '').trim()}`);
      }
      for (const part of splitTop(r.sel)) {
        if (/\[data-hub-|:global\(/.test(part)) addCss('layout.cssReach', r.at, `selector reaches into the kit: ${part.trim()}`);
        else if (passed.size) {
          const compounds = part.trim().split(/\s*[>+~]\s*|\s+/).filter(Boolean);
          const before = compounds.slice(0, -1).join(' ');
          const ofKit = [...before.matchAll(/\.([A-Za-z_][\w-]*)/g)].some((m) => passed.has(m[1]));
          if (ofKit) addCss('layout.cssReach', r.at, `descendant selector below a class passed to a kit component: ${part.trim()}`);
        }
      }
    }
  }

  // ── layout.explain / layout.explainGap (a WHITELIST that fails closed) ──
  // Explanation text is measured per REGION (a Section head, a state, a Disclosure, an overlay, a SettingRow help) in characters, never
  // per key or per sentence, so splitting or merging text changes nothing: the text of a region is joined first and normalized once.
  // A region's text is everything it renders, followed through page-local components at each render site (a component is transparent:
  // its text belongs to the region it is rendered in; a component nothing in the scanned pages renders makes its own root a region).
  // Every rendered occurrence is its own region occurrence: a helper rendered twice is measured twice, and carries the overlay scope of
  // ITS render site.
  //
  // THE CONTRACT. Only these forms are measured: a string literal, a template of measured parts, JSX text, `t('key')` on a translator
  // (a function: `t.key` is not a form) or `strings.key` on a table the walk can trace, a prop the render site gave, a `const` that holds one of these, and the
  // kit's known text props. Everything else in a measured position (an identifier it cannot trace, a member read, a call it has no rule
  // for, a method, a spread it cannot read, a prop it does not know that carries text, HTML from a string, a member or computed
  // component, a callback it cannot read) is a GAP (layout.explainGap) at that occurrence, never a silent zero. Data forms (numbers,
  // booleans, comparisons, `.length`) show no authored text. Content shown together sums; EXCLUSIVE content (ternary branches, `||` / `??`,
  // the returns of one function, a conditional spread, a key template matching several keys) takes the max of its branches, regions
  // created inside a branch included. Gaps only shrink: turning measured text into something unreadable cannot repay debt (the gate
  // refuses a lower layout.explain beside a gap). Sibling alternatives are scored by independent maxima, so two ternaries
  // driven by one condition can score more than the text that shows together; the canonical form is one outer conditional.
  function explainPass() {
    const X = reg.explain;
    if (!X || (disabled.has('layout.explain') && disabled.has('layout.explainGap'))) return;
    const exemptKit = new Set([...X.exempt, ...reg.actionComponents, ...(reg.slotTypes.actions || []), ...(reg.slotTypes.text || [])]);
    // a text-slot part that draws the page's own sentence stays measured: its text prop is explanation like any other
    for (const n of X.sentenceParts || []) exemptKit.delete(n);
    const exemptTags = new Set(X.exemptTags);
    const textProps = new Set(X.textProps);
    const labelRe = new RegExp(X.labelPattern);
    const MAX_DEPTH = 4; // helper components between a region (or a root) and its text; deeper is a gap
    const MAX_HOPS = 24; // components between a root and any region: a runaway guard, never a silent drop of a reachable region
    const MAX_EXPR = 12; // nesting of one content expression
    const TEXT_METHODS = new Set(['trim', 'trimStart', 'trimEnd', 'toLowerCase', 'toUpperCase', 'toLocaleLowerCase', 'toLocaleUpperCase', 'slice', 'substring', 'at', 'charAt', 'toString', 'toFixed', 'filter', 'flat', 'reverse']);
    const DATA_MEMBERS = new Set(['length', 'size']);
    const DATA_CALLS = new Set(['Number', 'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'isFinite']);
    const ASSIGN_OPS = new Set([ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken, ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.SlashEqualsToken, ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken]);

    // The accumulators are a tree: a plain region, or a GROUP of exclusive alternatives (each a list). A group scores the branch with the
    // most hits and every gap of every branch.
    const top = [];
    let cur = top;
    const newAcc = (file, node, budget, env) => {
      const a = { file: fileOfNode(node, file), node, len: 0, lead: false, trail: false, extra: 0, gaps: [], auth: false, budget, occScope: env ? env.scope || null : null };
      cur.push(a);
      return a;
    };
    const flatAccs = (list, out = []) => {
      for (const it of list) {
        if (it.group) for (const br of it.group) flatAccs(br, out);
        else out.push(it);
      }
      return out;
    };
    const intoList = (list, fn) => {
      const saved = cur;
      cur = list;
      try {
        return fn();
      } finally {
        cur = saved;
      }
    };

    // A measure is the collapsed text of a stretch of content: its length, and whether it starts / ends with the one space whitespace collapses to.
    // Joining two measures merges the space at the seam, so the length of the join is the length of the one string (split/merge invariance).
    const effOf = (x) => Math.max(0, x.len - (x.lead ? 1 : 0) - (x.trail && x.len > (x.lead ? 1 : 0) ? 1 : 0));
    const measureOfText = (raw) => {
      const s = raw.replace(/\{\{\s*[\w.]+\s*\}\}/g, '______').replace(/\s+/g, ' ');
      return s ? { len: s.length, lead: s[0] === ' ', trail: s[s.length - 1] === ' ' } : { len: 0, lead: false, trail: false };
    };
    const append = (m, x) => {
      if (!x.len) return;
      if (!m.len) {
        m.len = x.len;
        m.lead = x.lead;
        m.trail = x.trail;
        return;
      }
      m.len += x.len - (m.trail && x.lead ? 1 : 0);
      m.trail = x.trail;
    };
    const proseLit = (s) => s.trim().length >= 12 && /\s/.test(s.trim());
    const addStr = (m, raw, auth) => {
      const x = measureOfText(raw);
      if (!x.len) return;
      append(m, x);
      if (auth) m.auth = true;
    };
    /** React's rule for the text between tags: each line trimmed (a first line keeps its start, a last line its end), blank lines dropped, lines joined by one space. */
    const jsxTextValue = (raw) => {
      const lines = raw.replace(/&nbsp;/g, ' ').split(/\r\n|\n|\r/);
      const out = [];
      lines.forEach((ln, i) => {
        let s = ln.replace(/\t/g, ' ');
        if (i > 0) s = s.replace(/^ +/, '');
        if (i < lines.length - 1) s = s.replace(/ +$/, '');
        if (s) out.push(s);
      });
      return out.join(' ');
    };
    /** the file a node lives in: a node read through a caller's props or an imported record is not in the file being walked */
    const fileOfNode = (node, fallback) => {
      try {
        const sf = node && node.getSourceFile && node.getSourceFile();
        return sf && sf.fileName ? sf.fileName : fallback;
      } catch {
        return fallback;
      }
    };
    const gap = (m, node, why, file, kind) => m.gaps.push({ node, why, file, kind });
    const branch = (m) => ({ len: 0, lead: false, trail: false, extra: 0, auth: false, gaps: m.gaps, isRoot: m.isRoot });
    /** content that is exempt by kind (a button, a Band, an action prop) is walked into a sink: the regions it holds still count, its own text does not */
    const sink = (m) => ({ len: 0, lead: false, trail: false, extra: 0, auth: false, gaps: [], isRoot: m.isRoot, sink: true });
    /** exclusive alternatives: the longest one is what shows; regions created in a branch are alternatives of each other */
    const mergeMax = (m, parts) => {
      let best = null;
      for (const p of parts) {
        m.auth = m.auth || p.auth;
        if (!best || effOf(p) > effOf(best)) best = p;
      }
      if (best) append(m, best);
      m.extra += Math.max(0, ...parts.map((p) => p.extra));
    };
    const alt = (m, fns) => {
      const parts = [];
      const lists = [];
      for (const fn of fns) {
        const b = branch(m);
        const list = [];
        intoList(list, () => fn(b));
        parts.push(b);
        lists.push(list);
      }
      mergeMax(m, parts);
      if (lists.some((l) => l.length)) cur.push({ group: lists });
    };

    // tables: JSON read from `files`, else opts.readSrc; a table that an import names and nobody can read throws (the gate fails red)
    const tables = new Map();
    const readTable = (rel) => {
      if (tables.has(rel)) return tables.get(rel);
      let text = Object.prototype.hasOwnProperty.call(files, rel) ? files[rel] : typeof opts.readSrc === 'function' ? opts.readSrc(rel) : null;
      if (typeof text !== 'string') throw new Error(`cannot read table ${rel}`);
      let obj;
      try {
        obj = JSON.parse(text);
      } catch (e) {
        throw new Error(`cannot read table ${rel}: ${e.message.split('\n')[0]}`);
      }
      const t = Object.create(null);
      if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) if (typeof v === 'string') t[k] = v;
      tables.set(rel, t);
      return t;
    };
    const jsonPath = (from, spec) => {
      if (!spec.endsWith('.json')) return null;
      if (spec.startsWith('.')) return posix(path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)));
      for (const [re, to] of ALIASES) if (re.test(spec)) return spec.replace(re, to);
      return null;
    };

    /** is the variable of this declaration ever assigned again (so its initializer is not its value)? */
    const reassigned = (d) => {
      if (!ts.isVariableDeclaration(d) || !ts.isIdentifier(d.name)) return true;
      if (d.parent && ts.isVariableDeclarationList(d.parent) && d.parent.flags & ts.NodeFlags.Const) return false;
      const name = d.name.text;
      let scope = d.parent;
      while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
      let hit = false;
      const v = (n) => {
        if (hit) return;
        if (ts.isBinaryExpression(n) && ASSIGN_OPS.has(n.operatorToken.kind) && ts.isIdentifier(unparen(n.left)) && unparen(n.left).text === name) hit = true;
        else if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken) && ts.isIdentifier(unparen(n.operand)) && unparen(n.operand).text === name) hit = true;
        if (!hit) ts.forEachChild(n, v);
      };
      if (scope) v(scope);
      return hit;
    };
    /** the initializer of a plain variable that is never assigned again, else undefined */
    const stableInit = (id) => {
      const d = localDecl(id);
      if (!d || !ts.isVariableDeclaration(d) || !ts.isIdentifier(d.name) || !d.initializer || reassigned(d)) return undefined;
      return d.initializer;
    };

    /**
     * The table an expression names: an imported JSON, or a module-level object literal made of spreads of tables and string-literal
     * members (depth <= 2), later members winning as in JavaScript. The identifier's own declaration wins over an import of the same
     * spelling. Any other member (a computed key, a non-literal value, a method) makes the table unreadable (null), so its lookups are
     * gaps, never a silently stale value.
     */
    function tableOfExpr(file, e, depth = 0) {
      e = unparen(e);
      if (!e || depth > 2) return null;
      if (ts.isIdentifier(e)) {
        const d = localDecl(e);
        if (d) return ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.initializer && !reassigned(d) ? tableOfExpr(file, d.initializer, depth + 1) : null;
        const imp = P.infoOf(file).imports.get(e.text);
        if (imp) {
          const p = jsonPath(file, imp.spec);
          return p ? readTable(p) : null;
        }
        return null;
      }
      if (ts.isObjectLiteralExpression(e)) {
        const out = Object.create(null);
        for (const pr of e.properties) {
          if (ts.isSpreadAssignment(pr)) {
            const t = tableOfExpr(file, pr.expression, depth + 1);
            if (!t) return null;
            Object.assign(out, t);
          } else if (ts.isPropertyAssignment(pr)) {
            const k = propKey(pr.name);
            const v = unparen(pr.initializer);
            if (k === undefined || !v || !ts.isStringLiteralLike(v)) return null;
            out[k] = v.text;
          } else return null;
        }
        return out;
      }
      return null;
    }

    /** the callee of a hook binding is `useStrings` / `makeT`, by name or through an import alias */
    const isStringsHook = (id, file) => {
      if (/^(useStrings|makeT)$/.test(id.text)) return true;
      const imp = P.infoOf(file).imports.get(id.text);
      return !!imp && /^(useStrings|makeT)$/.test(imp.name);
    };
    /**
     * The page's own FAQ builder, called right where it is passed: literally a call of `pageFaq` imported (by that name, under any local
     * alias, not type-only, never a local binding) from this page's faq.ts (pages/<page>/faq, by a relative specifier). Nothing is followed:
     * a name that holds the result can be changed before the page reads it, and a conditional is not the conformance's builder form, so
     * any other faq value is still unknown.
     */
    function pageFaqOf(ex, file) {
      ex = unparen(ex);
      const page = /^(pages\/[^/]+)\//.exec(file);
      if (!ex || !page || !P.has(`${page[1]}/faq.ts`)) return false;
      if (!ts.isCallExpression(ex) || !ts.isIdentifier(ex.expression) || localDecl(ex.expression)) return false;
      const imp = P.infoOf(file).imports.get(ex.expression.text);
      return !!imp && !imp.typeOnly && imp.name === 'pageFaq' && imp.spec.startsWith('.') && path.posix.normalize(path.posix.join(path.posix.dirname(file), imp.spec)) === `${page[1]}/faq`;
    }
    const stringsCall = (init, file) => init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && isStringsHook(init.expression, file) && init.arguments[0] ? init : null;
    /**
     * The table of a local translator hook (`const t = useT()`): the hook must RETURN the translator a `useStrings(table)` call made
     * (directly, or through a const that holds it). A hook that returns anything else (a wrapper that changes the key) has a table
     * the rule cannot name: { table: null }, so every lookup through it is a gap. null when the callee is not a local hook that calls useStrings.
     */
    function hookTable(callee, env) {
      if (!ts.isIdentifier(callee)) return null;
      const b = P.traceLocal(env.file, callee.text);
      if (!b || !b.file || b.origin !== 'local') return null;
      const fn = fnOfDef(b.file, b.def);
      if (!fn) return null;
      let uses = 0;
      const v = (n) => {
        if (stringsCall(n, b.file)) uses++;
        ts.forEachChild(n, v);
      };
      v(fn.body);
      if (!uses) return null;
      const rets = returnsOf(fn);
      if (rets.length !== 1) return { table: null };
      let r = unparen(rets[0]);
      if (r && ts.isIdentifier(r)) {
        const init = stableInit(r);
        r = init ? unparen(init) : null;
      }
      const call = r ? stringsCall(r, b.file) : null;
      return { table: call ? tableOfExpr(b.file, call.arguments[0]) : null };
    }

    /** the closest environment (this one or an outer one) of the function that declares parameter `d` */
    const ownerOf = (d, env) => {
      for (let e = env; e; e = e.outer) if (e.fn && d.parent === e.fn) return e;
      return null;
    };
    /** the prop name a parameter identifier reads in environment `e`: the identifier itself (a positional call), or the destructured key of the props object */
    const propNameOf = (id, d, e) => {
      if (e.positional) return id.text;
      if (e.fn.parameters[0] !== d) return undefined;
      return propsBindings(e.fn).names.get(id.text);
    };
    /** the value a render site (or a positional call) gave for a parameter identifier: { g, own } | null */
    const givenFor = (id, env) => {
      const d = localDecl(id);
      if (!d || !ts.isParameter(d)) return null;
      const own = ownerOf(d, env);
      if (!own || !own.props) return null;
      const prop = propNameOf(id, d, own);
      if (prop === undefined) return null;
      const g = own.props.get(prop);
      return g ? { g, own, prop } : null;
    };

    /** { table } for an identifier that is a translate function (useStrings(...) result, or a prop that the render site passes one into); null otherwise. table null = a translator whose table cannot be named. */
    function translatorOf(id, env, depth = 0) {
      if (depth > 6 || !ts.isIdentifier(id)) return null;
      if (env.faqTable && /^t[a-z]?$/.test(id.text)) {
        const shadow = localDecl(id);
        if (!shadow || ts.isParameter(shadow)) return { table: env.faqTable }; // a `t` the builder declares itself is not the page translator
      }
      const d = localDecl(id);
      if (!d) return null;
      if (ts.isVariableDeclaration(d)) {
        if (!ts.isIdentifier(d.name)) return null;
        const init = d.initializer && unparen(d.initializer);
        const sc = stringsCall(init, env.file);
        if (sc) return { table: tableOfExpr(env.file, sc.arguments[0]) };
        if (init && ts.isIdentifier(init)) return translatorOf(init, env, depth + 1);
        if (init && ts.isCallExpression(init) && ts.isIdentifier(init.expression)) return hookTable(init.expression, env);
        return null;
      }
      if (!ts.isParameter(d)) return null;
      const own = ownerOf(d, env);
      if (!own) return null;
      const prop = propNameOf(id, d, own);
      if (prop === undefined) return null;
      const given = own.props && own.props.get(prop);
      if (given && given.expr) {
        const ge = unparen(given.expr);
        if (ge && ts.isIdentifier(ge)) return translatorOf(ge, given.env, depth + 1);
        return { table: null };
      }
      if (given) return { table: null };
      return looksT(prop) ? { table: null } : null; // a root with no render site: a translator by its conventional name, table unknown
    }

    const PLURALS = ['', '_zero', '_one', '_two', '_few', '_many', '_other'];
    /** the longest reading of a key (its plural and variant forms): a measure, or null when the table has none of them */
    const lookupText = (table, key) => {
      let best = null;
      for (const sfx of PLURALS) {
        if (!((key + sfx) in table)) continue;
        const x = measureOfText(table[key + sfx]);
        if (!best || effOf(x) > effOf(best)) best = x;
      }
      return best;
    };
    /** the property of an object literal a key names, last write wins: { node } | { none: true } | { unknown: true } (a later spread or computed key may override it) */
    function objProp(obj, key) {
      for (let i = obj.properties.length - 1; i >= 0; i--) {
        const pr = obj.properties[i];
        if (ts.isSpreadAssignment(pr)) return { unknown: true };
        if (ts.isPropertyAssignment(pr)) {
          const k = propKey(pr.name);
          if (k === undefined) return { unknown: true };
          if (k === key) return { node: pr.initializer };
        } else if (ts.isShorthandPropertyAssignment(pr)) {
          if (pr.name.text === key) return { node: pr.name };
        } else return { unknown: true };
      }
      return { none: true };
    }
    /** a record the map callback is bound to, or a local const record: its object literal and the file it lives in */
    const recOf = (e, env) => {
      e = unparen(e);
      if (!e || !ts.isIdentifier(e)) return null;
      if (env.recs && env.recs.has(e.text) && !localShadow(e, env)) return env.recs.get(e.text);
      const init = stableInit(e);
      const u = init && unparen(init);
      return u && ts.isObjectLiteralExpression(u) ? { obj: u, file: env.file } : null;
    };
    /** the literal string an expression names (a literal, a map element, a record field, a parameter the render site gave a literal), or null */
    function litOf(ex, env, depth = 0) {
      ex = unparen(ex);
      if (!ex || depth > 4) return null;
      if (ts.isStringLiteralLike(ex)) return ex.text;
      if (ts.isIdentifier(ex)) {
        if (env.vars && env.vars.has(ex.text) && !localShadow(ex, env)) return env.vars.get(ex.text);
        const gf = givenFor(ex, env);
        if (gf && gf.g.expr) return litOf(gf.g.expr, gf.g.env, depth + 1);
        const si = stableInit(ex); // a module-level `const LONG = '...'` in whichever file the identifier is in
        if (si && !gf) return litOf(si, { ...env, file: fileOfNode(si, env.file) }, depth + 1);
        return null;
      }
      if (ts.isPropertyAccessExpression(ex) || ts.isElementAccessExpression(ex)) {
        const rec = recOf(ex.expression, env);
        const key = ts.isPropertyAccessExpression(ex) ? ex.name.text : ex.argumentExpression && ts.isStringLiteralLike(unparen(ex.argumentExpression)) ? unparen(ex.argumentExpression).text : undefined;
        if (!rec || key === undefined) return null;
        const p = objProp(rec.obj, key);
        return p.node ? litOf(p.node, { ...env, file: rec.file }, depth + 1) : null;
      }
      return null;
    }
    /** the operands of a left-nested `a + b + c` chain, in order */
    function plusOperands(ex) {
      ex = unparen(ex);
      if (ex && ts.isBinaryExpression(ex) && ex.operatorToken.kind === ts.SyntaxKind.PlusToken) return [...plusOperands(ex.left), ...plusOperands(ex.right)];
      return [ex];
    }
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    /** The literal keys (or one pattern) a first argument names: { keys } | { pattern } | null (unresolved). */
    function keysOf(arg, env, depth = 0) {
      const e = unparen(arg);
      if (!e || depth > 4) return null;
      const lit = litOf(e, env);
      if (lit !== null) return { keys: [lit] };
      if (ts.isIdentifier(e)) {
        const init = stableInit(e);
        return init ? keysOf(init, env, depth + 1) : null;
      }
      if (ts.isConditionalExpression(e)) {
        const a = keysOf(e.whenTrue, env, depth + 1);
        const b = keysOf(e.whenFalse, env, depth + 1);
        if (!a || !b || a.pattern || b.pattern) return null;
        return { keys: [...a.keys, ...b.keys] };
      }
      if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        // 'prefix.' + x: the literal parts, any run between them a wildcard
        const parts = [];
        const flat = (x) => {
          x = unparen(x);
          if (x && ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            flat(x.left);
            flat(x.right);
          } else parts.push(x);
        };
        flat(e);
        let src = '';
        let exact = '';
        let wild = false;
        for (const p of parts) {
          const l = p ? litOf(p, env) : null;
          if (l !== null) {
            src += escapeRe(l);
            exact += l;
          } else {
            wild = true;
            src += '.+';
          }
        }
        return wild ? { pattern: new RegExp(`^${src}$`) } : { keys: [exact] };
      }
      if (ts.isTemplateExpression(e)) {
        let src = escapeRe(e.head.text);
        let exact = e.head.text;
        let wild = false;
        for (const sp of e.templateSpans) {
          const l = litOf(sp.expression, env);
          if (l !== null) {
            src += escapeRe(l) + escapeRe(sp.literal.text);
            exact += l + sp.literal.text;
          } else {
            wild = true;
            src += '.+' + escapeRe(sp.literal.text);
          }
        }
        return wild ? { pattern: new RegExp(`^${src}$`) } : { keys: [exact] };
      }
      return null;
    }

    const hasJsx = (n) => {
      let found = false;
      const v = (x) => {
        if (found) return;
        if (isJsxEl(x) || ts.isJsxFragment(x)) found = true;
        else ts.forEachChild(x, v);
      };
      v(n);
      return found;
    };
    const looksT = (s) => /^t[a-z]?$/.test(s);

    /** An object literal's properties in source order as key -> node, spreads of readable objects expanded in place; `unknown` when a spread or a computed key cannot be read. */
    function objectMap(e, env, depth = 0) {
      const map = new Map();
      let unknown = false;
      const go = (x, d) => {
        x = unparen(x);
        if (!x || d > 3) return void (unknown = true);
        if (ts.isIdentifier(x)) {
          const init = stableInit(x);
          return init ? go(init, d + 1) : void (unknown = true);
        }
        if (!ts.isObjectLiteralExpression(x)) return void (unknown = true);
        for (const pr of x.properties) {
          if (ts.isPropertyAssignment(pr)) {
            const k = propKey(pr.name);
            if (k === undefined) unknown = true;
            else map.set(k, pr.initializer);
          } else if (ts.isShorthandPropertyAssignment(pr)) map.set(pr.name.text, pr.name);
          else if (ts.isSpreadAssignment(pr)) go(pr.expression, d + 1);
          // a handler written as a method (`onAction() {}`) is an action, like `onAction: () => {}`; any other method is still unknown
          else if (ts.isMethodDeclaration(pr) && /^on[A-Z]/.test(propKey(pr.name) ?? '')) map.set(propKey(pr.name), pr);
          else unknown = true;
        }
      };
      go(e, depth);
      return { map, unknown };
    }
    /** the entries of an array-valued prop: the object literals of an inline array or a const array (spreads of readable arrays expanded); anything else is `bad` (one gap each) */
    const objectList = (e, depth) => {
      e = unparen(e);
      if (!e || depth > 3) return null;
      if (ts.isIdentifier(e)) {
        const init = stableInit(e);
        return init ? objectList(init, depth + 1) : null;
      }
      if (!ts.isArrayLiteralExpression(e)) return null;
      const items = [];
      const bad = [];
      for (const x of e.elements) {
        let u = unparen(x);
        if (u && ts.isSpreadElement(u)) {
          const sub = objectList(u.expression, depth + 1);
          if (sub) {
            items.push(...sub.items);
            bad.push(...sub.bad);
          } else bad.push(u);
          continue;
        }
        if (u && ts.isIdentifier(u)) {
          const init = stableInit(u);
          if (init) u = unparen(init);
        }
        if (u && ts.isObjectLiteralExpression(u)) items.push(u);
        else bad.push(x);
      }
      return { items, bad };
    };
    /** a const changed in place, or one that escapes where it could be: only the references that resolve to this declaration count
     *  (lexical shadowing respected). A reference is a write when a member chain on it (`a.b`, `a[0].c`) is assigned, updated or
     *  deleted, or ends in a mutating array method (`a.push`, `a[0].items.push`); it escapes when it is bound to another name
     *  (`const b = a`, `b = a`) or passed to a call (`f(a)`): its later changes cannot be followed, so the value is unreadable.
     *  reassigned() sees only `x = ...` of the name itself. */
    const MUTATORS = new Set(['push', 'unshift', 'splice', 'pop', 'shift', 'sort', 'reverse', 'fill', 'copyWithin']);
    const mutated = (id, allow, strict) => {
      const d = localDecl(id);
      if (!d || !ts.isVariableDeclaration(d) || !ts.isIdentifier(d.name)) return true;
      const name = d.name.text;
      let scope = d.parent;
      while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
      const isMember = (n, inner) => (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) && n.expression === inner;
      const wraps = (n, inner) => (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression?.(n) || ts.isTypeAssertionExpression(n)) && n.expression === inner;
      const changes = (r) => {
        let top = r;
        let chained = false;
        for (;;) {
          const up = top.parent;
          if (!up) break;
          if (isMember(up, top)) chained = true;
          else if (!wraps(up, top)) break;
          top = up;
        }
        const up = top.parent;
        if (!up) return false;
        if (chained) {
          if (ts.isBinaryExpression(up) && up.left === top && ASSIGN_OPS.has(up.operatorToken.kind)) return true;
          if ((ts.isPrefixUnaryExpression(up) || ts.isPostfixUnaryExpression(up)) && (up.operator === ts.SyntaxKind.PlusPlusToken || up.operator === ts.SyntaxKind.MinusMinusToken)) return true;
          if (ts.isDeleteExpression(up)) return true;
          if (ts.isCallExpression(up) && up.expression === top && ts.isPropertyAccessExpression(top) && MUTATORS.has(top.name.text)) return !(allow && allow(up, top));
          // a computed method call (`a['push'](x)`, `a[m](x)`) may be any mutator: a change
          if (ts.isCallExpression(up) && up.expression === top && ts.isElementAccessExpression(top)) return true;
          // strict (a step-group list or entry): a member value bound to another name or passed to a call escapes too
          // (`const a = x.items; a.push(...)`), as the value itself would
          if (strict && ts.isVariableDeclaration(up) && up.initializer === top) return true;
          if (strict && ts.isBinaryExpression(up) && up.right === top && ASSIGN_OPS.has(up.operatorToken.kind)) return true;
          if (strict && (ts.isCallExpression(up) || ts.isNewExpression(up)) && up.expression !== top && (up.arguments || []).includes(top)) return true;
          return false;
        }
        if (ts.isVariableDeclaration(up) && up.initializer === top) return true;
        if (ts.isBinaryExpression(up) && up.right === top && ASSIGN_OPS.has(up.operatorToken.kind)) return true;
        if ((ts.isCallExpression(up) || ts.isNewExpression(up)) && up.expression !== top && (up.arguments || []).includes(top)) return true;
        return false;
      };
      let hit = false;
      const v = (n) => {
        if (hit) return;
        if (ts.isIdentifier(n) && n.text === name && n !== d.name && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n) && localDecl(n) === d && changes(n)) hit = true;
        else ts.forEachChild(n, v);
      };
      if (scope) v(scope);
      return hit;
    };
    /** the entries of a MenuList prop (X.menus): like objectList, plus a separator string (skipped), a conditional spread (an `alts`
     *  entry: each branch its own list) and a const changed in place (unreadable) */
    const menuList = (e, depth) => {
      e = unparen(e);
      if (!e || depth > 3) return null;
      if (ts.isIdentifier(e)) {
        const init = stableInit(e);
        return init && !mutated(e) ? menuList(init, depth + 1) : null;
      }
      if (!ts.isArrayLiteralExpression(e)) return null;
      const items = [];
      const bad = [];
      const spread = (x) => {
        const sub = menuList(x, depth + 1);
        if (sub) return sub;
        bad.push(x);
        return null;
      };
      for (const x of e.elements) {
        let u = unparen(x);
        if (u && ts.isSpreadElement(u)) {
          const sx = unparen(u.expression);
          if (sx && ts.isConditionalExpression(sx) && !hasJsx(sx.condition)) {
            const alts = [sx.whenTrue, sx.whenFalse].map(spread).filter(Boolean);
            if (alts.length) items.push({ alts });
          } else {
            const sub = spread(u.expression);
            if (sub) {
              items.push(...sub.items);
              bad.push(...sub.bad);
            }
          }
          continue;
        }
        if (u && (ts.isStringLiteral(u) || ts.isNoSubstitutionTemplateLiteral(u)) && u.text === '-') continue;
        if (u && ts.isIdentifier(u)) {
          const init = mutated(u) ? undefined : stableInit(u);
          if (init) u = unparen(init);
        }
        if (u && ts.isObjectLiteralExpression(u)) items.push(u);
        else bad.push(x);
      }
      return { items, bad };
    };
    /** the entries of a step-group list (X.stepLists): like objectList, plus a const array grown only by `name.push(...)` in its own scope
     *  (each pushed argument an entry) and a conditional entry (`c ? {a} : {b}`: an `alts` entry, each branch its own list). Any other
     *  change in place (an index write, another mutator, an escape to a call) makes it unreadable (null) */
    const stepList = (e, depth) => {
      e = unparen(e);
      if (!e || depth > 3) return null;
      const items = [];
      const bad = [];
      const entry = (x) => {
        let u = unparen(x);
        if (u && ts.isSpreadElement(u)) {
          const sx = unparen(u.expression);
          if (sx && ts.isConditionalExpression(sx) && !hasJsx(sx.condition)) {
            const alts = [sx.whenTrue, sx.whenFalse].map((b) => stepList(b, depth + 1) || { items: [], bad: [b] });
            items.push({ alts });
            return;
          }
          const sub = stepList(u.expression, depth + 1);
          if (sub) {
            items.push(...sub.items);
            bad.push(...sub.bad);
          } else bad.push(u);
          return;
        }
        if (u && ts.isIdentifier(u)) {
          const init = mutated(u, undefined, true) ? undefined : stableInit(u);
          if (init) u = unparen(init);
        }
        if (u && ts.isConditionalExpression(u) && !hasJsx(u.condition)) {
          const alts = [u.whenTrue, u.whenFalse].map((b) => {
            const one = { items: [], bad: [] };
            const w = unparen(b);
            if (w && ts.isObjectLiteralExpression(w)) one.items.push(w);
            else one.bad.push(b);
            return one;
          });
          items.push({ alts });
          return;
        }
        if (u && ts.isObjectLiteralExpression(u)) items.push(u);
        else bad.push(x);
      };
      if (ts.isIdentifier(e)) {
        const init = stableInit(e);
        if (!init) return null;
        const pushed = [];
        const decl = localDecl(e);
        let home = decl && decl.parent;
        while (home && !ts.isBlock(home) && !ts.isSourceFile(home)) home = home.parent;
        // a push runs once only at statement level of the list's own block, or in the then-branch of an `if` with no else (it may
        // run or not; both counted as it may). A push in a loop, a callback, an else or a switch runs an unknown number of times
        // or exclusively of another: unreadable
        const once = (call) => {
          let n = call.parent;
          if (!n || !ts.isExpressionStatement(n)) return false;
          for (;;) {
            const up = n.parent;
            if (!up) return false;
            if (up === home) return true;
            if (ts.isBlock(up)) n = up;
            else if (ts.isIfStatement(up) && up.thenStatement === n && !up.elseStatement) n = up;
            else return false;
          }
        };
        const onlyPushes = !mutated(e, (call, top) => {
          if (top.name.text !== 'push' || !ts.isIdentifier(unparen(top.expression)) || !once(call)) return false;
          pushed.push(...call.arguments);
          return true;
        }, true);
        if (!onlyPushes) return null;
        const base = stepList(init, depth + 1);
        if (!base) return null;
        items.push(...base.items);
        bad.push(...base.bad);
        for (const a of pushed) entry(a);
        return { items, bad };
      }
      if (!ts.isArrayLiteralExpression(e)) return null;
      for (const x of e.elements) entry(x);
      return { items, bad };
    };
    /** an entry forwarded from a caller (a rest spread) is read in the caller's bindings, at this position's component count */
    const envFor = (entry, base) => (entry.env === base || entry.env === undefined ? base : { ...entry.env, depth: base.depth, hops: base.hops, stack: new Set([...base.stack, ...entry.env.stack]), mapFns: base.mapFns, scope: base.scope, paged: base.paged });
    /**
     * An element's props in source order: attributes and object spreads (an inline object, or an identifier holding one) later winning.
     * A conditional spread keeps BOTH readings: a prop the branches disagree on (or only one sets) holds `alts`, each alternative
     * applied on top of what came before. `unknown` when a spread cannot be read.
     */
    function propsOf(f, env) {
      let exprs = new Map(); // name -> { node, env } | { alts: [entry|null] }
      let unknown = false;
      const own = (node) => ({ node, env });
      const spreadInto = (e, depth) => {
        e = unparen(e);
        if (!e || depth > 3) return void (unknown = true);
        if (ts.isConditionalExpression(e) || (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) {
          const arms = ts.isConditionalExpression(e) ? [e.whenTrue, e.whenFalse] : [e.right, null];
          const base = exprs;
          const results = arms.map((arm) => {
            exprs = new Map(base);
            if (arm) spreadInto(arm, depth + 1);
            return exprs;
          });
          const merged = new Map(base);
          const names = new Set(results.flatMap((r) => [...r.keys()]));
          for (const n of names) {
            const vs = results.map((r) => r.get(n) || null);
            if (vs.every((v) => v === vs[0])) {
              if (vs[0]) merged.set(n, vs[0]);
              continue;
            }
            merged.set(n, { alts: vs });
          }
          exprs = merged;
          return;
        }
        if (ts.isIdentifier(e)) {
          // the whole props / the rest binding of the component this element is in: the props its own render site gave (the rest binding minus the destructured names)
          const d = localDecl(e);
          const oe = d && ts.isParameter(d) ? ownerOf(d, env) : null;
          if (oe && oe.props && oe.fn.parameters[0] === d) {
            const pb = propsBindings(oe.fn);
            const whole = pb.whole.has(e.text);
            if (!whole && !pb.rest.has(e.text)) return void (unknown = true);
            if (pb.dynExcl) return void (unknown = true);
            for (const [k, g] of oe.props) if (whole || !pb.excl.has(k)) exprs.set(k, g.alts ? g : g.expr ? { node: g.expr, env: g.env } : { children: g.children, env: g.env });
            return;
          }
          const init = stableInit(e);
          return init ? spreadInto(init, depth + 1) : void (unknown = true);
        }
        if (!ts.isObjectLiteralExpression(e)) return void (unknown = true);
        for (const pr of e.properties) {
          if (ts.isPropertyAssignment(pr)) {
            const k = propKey(pr.name);
            if (k === undefined) unknown = true;
            else exprs.set(k, own(pr.initializer));
          } else if (ts.isShorthandPropertyAssignment(pr)) exprs.set(pr.name.text, own(pr.name));
          else if (ts.isSpreadAssignment(pr)) spreadInto(pr.expression, depth + 1);
          else unknown = true;
        }
      };
      for (const a of f.op.attributes.properties) {
        if (ts.isJsxSpreadAttribute(a)) {
          spreadInto(a.expression, 0);
          continue;
        }
        const n = attrName(a);
        const ex = attrExpr(a);
        if (ex) exprs.set(n, own(ex));
        else if (a.initializer && ts.isStringLiteral(a.initializer)) exprs.set(n, own(a.initializer));
        else exprs.delete(n);
      }
      return { exprs, unknown };
    }
    /** every expression node an entry can hold */
    const nodesOf = (entry, out = []) => {
      if (!entry) return out;
      if (entry.alts) for (const a of entry.alts) nodesOf(a, out);
      else if (entry.node) out.push({ node: entry.node, env: entry.env });
      return out;
    };
    /** run `fn(entry, measure)` once, or once per alternative of a conditional entry, as exclusive branches */
    const eachAlt = (entry, m, fn) => {
      if (!entry.alts) return fn(entry, m);
      alt(
        m,
        entry.alts.map((a) => (b) => {
          if (a) eachAlt(a, b, fn);
        }),
      );
    };
    const toSink = (ex, env, m) => {
      if (ex) walkExpr(ex, env, sink(m));
    };

    /** the lookup of keys in a table as shown text (a FAQ answer read outside faq.ts is one hit per site; it replaces the answer's own text, other alternatives still count), missing keys are gaps */
    function emitKeys(m, table, names, node, env) {
      let best = null;
      let faqHit = false;
      for (const key of names) {
        if (key.startsWith(X.faqPrefix) && !env.file.endsWith('/faq.ts')) faqHit = true; // the placement is a hit whether or not the key resolves
        const x = lookupText(table, key);
        if (!x) {
          gap(m, node, `the key ${key} is missing from its table`, env.file);
          continue;
        }
        if (key.startsWith(X.faqPrefix) && !env.file.endsWith('/faq.ts')) continue;
        if (!best || effOf(x) > effOf(best)) best = x;
      }
      if (faqHit) {
        m.extra += 1;
        m.auth = true;
      }
      if (best) {
        append(m, best);
        if (best.len) m.auth = true;
      }
    }

    /** `t(...)` as shown text. Returns true when the call was a translate call (handled), false when the callee is not one. */
    function tCall(call, env, m) {
      const cal = unparen(call.expression);
      let tr = null;
      let named = false;
      if (ts.isIdentifier(cal)) {
        tr = translatorOf(cal, env);
        named = looksT(cal.text);
        if (!tr && named) {
          // a local function that happens to be called t is an ordinary call
          const d = localDecl(cal);
          if (d && (ts.isFunctionDeclaration(d) || (ts.isVariableDeclaration(d) && d.initializer && isFnValue(d.initializer)))) return false;
        }
      } else if (ts.isPropertyAccessExpression(cal) && looksT(cal.name.text)) {
        // props.t('k'): the translator the render site passed in `t`
        named = true;
        const root = unparen(cal.expression);
        if (root && ts.isIdentifier(root)) {
          const d = localDecl(root);
          const own = d && ts.isParameter(d) ? ownerOf(d, env) : null;
          if (own && own.props && own.fn.parameters[0] === d && propsBindings(own.fn).whole.has(root.text)) {
            const g = own.props.get(cal.name.text);
            if (g && g.expr) {
              const ge = unparen(g.expr);
              tr = ge && ts.isIdentifier(ge) ? translatorOf(ge, g.env) : { table: null };
            }
          }
        }
      }
      if (!tr) {
        if (!named) return false;
        gap(m, call, 'a translate call whose translator cannot be traced', env.file);
        return true;
      }
      const arg = call.arguments[0];
      const k = arg ? keysOf(arg, env) : null;
      if (!k) {
        gap(m, call, 'a non-literal key', env.file);
        return true;
      }
      if (!tr.table) {
        gap(m, call, 'the table of this t cannot be named', env.file);
        return true;
      }
      const names = k.pattern ? Object.keys(tr.table).filter((x) => k.pattern.test(x)) : k.keys;
      if (k.pattern && names.length === 0) {
        gap(m, call, 'a key template that matches no key', env.file);
        return true;
      }
      emitKeys(m, tr.table, names, call, env);
      return true;
    }

    /** The elements of an array an expression names (an inline literal, a const, an imported const): { kind, ... } per element, or null when any element is not a string or an object literal */
    function arrayElems(e, env, depth = 0) {
      e = unparen(e);
      if (!e || depth > 3) return null;
      if (ts.isArrayLiteralExpression(e)) {
        const out = [];
        for (const x of e.elements) {
          let u = unparen(x);
          if (u && ts.isIdentifier(u) && stableInit(u)) u = unparen(stableInit(u)); // `[sub]` with `const sub = { ... }` reads the record
          if (!u) return null;
          if (ts.isStringLiteralLike(u)) out.push({ str: u.text });
          else if (ts.isObjectLiteralExpression(u)) out.push({ rec: { obj: u, file: env.file } });
          else return null;
        }
        return out;
      }
      if (ts.isIdentifier(e)) {
        const init = stableInit(e);
        if (init) return arrayElems(init, env, depth + 1);
        if (localDecl(e)) return null;
        const b = P.traceLocal(env.file, e.text);
        if (b && b.file && b.origin === 'local') {
          const d = P.infoOf(b.file).defs.get(b.def);
          if (d && ts.isVariableDeclaration(d) && d.initializer) return arrayElems(d.initializer, { ...env, file: b.file }, depth + 1);
        }
      }
      return null;
    }

    function walkChildren(children, env, m) {
      // sibling `cond && X` children whose conditions cannot hold together are alternatives: the longest shows.
      // Each group is scored where its first member stands.
      const groups = exclusiveChildGroups(children);
      for (const c of children) {
        const g = groups.get(c);
        // a later alternative's slot is a barrier: the text around it never merges a space across it (the alternative shown there
        // stands between them in the render)
        if (g === null) {
          m.trail = false;
          continue;
        }
        if (g) {
          // only the text the alternatives add to this region is scored, by the longest; regions they create stay standalone.
          // The longest is added at the first member's place with its whole length and no space merged at either seam: an upper
          // bound of every alternative at its own place (merging only ever shortens), never an undercount.
          const parts = g.map((x) => { const b = branch(m); walkExpr(x.expression, env, b); return b; });
          let best = null;
          for (const p of parts) {
            m.auth = m.auth || p.auth;
            if (!best || p.len > best.len) best = p;
          }
          if (best && best.len) append(m, { len: best.len, lead: false, trail: false });
          m.extra += Math.max(0, ...parts.map((p) => p.extra));
          continue;
        }
        if (ts.isJsxText(c)) {
          if (hasVisibleJsxText(c.text)) addStr(m, jsxTextValue(c.text), true);
        } else if (ts.isJsxExpression(c)) {
          if (c.dotDotDotToken) gap(m, c, 'a spread of children the rule cannot read', env.file);
          else if (c.expression) walkExpr(c.expression, env, m);
        } else if (isJsxEl(c) || ts.isJsxFragment(c)) walkEl(c, env, m);
      }
    }
    /** The guard of a `cond && X` child, or null. */
    const xcGuardOf = (c) => {
      if (!ts.isJsxExpression(c) || c.dotDotDotToken || !c.expression) return null;
      const e = unparen(c.expression);
      return ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? e.left : null;
    };
    /** The xcConjuncts of a condition: a && b && c gives [a, b, c]. */
    const xcConjuncts = (e, out = []) => {
      e = unparen(e);
      if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) { xcConjuncts(e.left, out); xcConjuncts(e.right, out); } else out.push(e);
      return out;
    };
    /** A key that reads the same value at every sibling of one render: a local binding nothing writes (a const, or a parameter,
     *  let or var never written in its file), or one named member of it (a.b, a?.b) when nothing in the file writes a member of
     *  it or lets it out of sight (memberWrittenIn, the slot rules' test). A const made by `new` or holding an object with an
     *  accessor is not one. A deeper chain, an import, a global, a call or an index is not a key: those siblings still sum. */
    const xcKey = (e) => {
      e = unparen(e);
      const member = ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name);
      const root = member ? unparen(e.expression) : e;
      if (!ts.isIdentifier(root) || !xcStable(root, member)) return null;
      return member ? `${root.text}.${e.name.text}` : root.text;
    };
    /** decl -> (`name|member` -> xcStable's answer): the answer depends only on the declaration, the name and the member flag,
     *  and every pair of guards in a children list asks again. */
    const xcStableMemo = new WeakMap();
    const xcStable = (id, member) => {
      const d = localDecl(id);
      if (!d || !(ts.isParameter(d) || ts.isVariableDeclaration(d))) return false;
      let memo = xcStableMemo.get(d);
      if (!memo) xcStableMemo.set(d, (memo = new Map()));
      const key = `${id.text}|${member}`;
      if (!memo.has(key)) memo.set(key, xcStableOf(d, id, member));
      return memo.get(key);
    };
    const xcStableOf = (d, id, member) => {
      // the binding's own scope: its function (a parameter's, or the one a declaration sits in), else the file; a write of
      // any binding of the name in it counts (shadowing is not tracked: fail closed)
      let sf = d.parent;
      while (sf && !ts.isFunctionLike(sf) && !ts.isSourceFile(sf)) sf = sf.parent;
      if (!sf) return false;
      const isConst = ts.isVariableDeclaration(d) && !!d.parent && ts.isVariableDeclarationList(d.parent) && !!(d.parent.flags & ts.NodeFlags.Const);
      if (!isConst && writtenIn(sf, id.text, xcLater)) return false;
      const init = ts.isVariableDeclaration(d) && d.initializer ? unparen(d.initializer) : null;
      if (init && (ts.isNewExpression(init) || (ts.isObjectLiteralExpression(init) && init.properties.some((q) => ts.isGetAccessorDeclaration(q) || ts.isSetAccessorDeclaration(q))))) return false;
      return !member || !memberWrittenIn(sf, id.text, xcLater, true);
    };
    /** code that never runs while the siblings of one children list are evaluated: a function written as a JSX attribute's value
     *  (an event handler, a render callback; creating the element never calls it), a React effect's callback (it runs after
     *  the render), and a React hook's dependency list made of plain reads */
    const XC_EFFECTS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
    const XC_DEPS = new Set([...XC_EFFECTS, 'useMemo', 'useCallback', 'useImperativeHandle']);
    const xcLater = (n) => {
      const p = n.parent;
      if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && p && ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) return true;
      if (!p || !ts.isCallExpression(p)) return false;
      const hook = xcReactHook(p.expression), i = p.arguments.indexOf(n);
      if (!hook) return false;
      if (i === 0 && XC_EFFECTS.has(hook) && (ts.isArrowFunction(n) || ts.isFunctionExpression(n))) return true;
      // a dependency list is skipped only when every entry is a plain read (a name or a chain of named members): an entry
      // that writes, calls or builds anything is looked into
      return i === p.arguments.length - 1 && i > 0 && XC_DEPS.has(hook) && ts.isArrayLiteralExpression(n) && n.elements.every(xcPlainRead);
    };
    const xcPlainRead = (e) => {
      e = unparen(e);
      while (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name)) e = unparen(e.expression);
      return ts.isIdentifier(e);
    };
    /** the React hook a callee names (useEffect imported from 'react', or React.useEffect on the default or namespace import of
     *  'react'), else null: a same-named function from anywhere else is not one */
    const xcReactHook = (callee) => {
      const fromReact = (id) => {
        const sf = id.getSourceFile();
        for (const st of sf.statements) {
          if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text !== 'react' || !st.importClause) continue;
          const c = st.importClause;
          if (c.name && c.name.text === id.text) return { whole: true };
          const nb = c.namedBindings;
          if (nb && ts.isNamespaceImport(nb) && nb.name.text === id.text) return { whole: true };
          if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (el.name.text === id.text) return { name: (el.propertyName || el.name).text };
        }
        return null;
      };
      callee = unparen(callee);
      if (ts.isIdentifier(callee)) {
        if (localDecl(callee)) return null;
        const r = fromReact(callee);
        return r && r.name ? r.name : null;
      }
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name) && ts.isIdentifier(unparen(callee.expression))) {
        const root = unparen(callee.expression);
        if (localDecl(root)) return null;
        const r = fromReact(root);
        return r && r.whole ? callee.name.text : null;
      }
      return null;
    };
    const xcLitOf = (e) => {
      e = unparen(e);
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return `s:${e.text}`;
      if (ts.isNumericLiteral(e)) return `n:${Number(e.text)}`;
      return null;
    };
    /** key === literal (either side), as [key, literal], or null */
    const xcEqOf = (e) => {
      e = unparen(e);
      if (!ts.isBinaryExpression(e) || e.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return null;
      const l = xcKey(e.left), r = xcLitOf(e.right);
      if (l !== null && r !== null) return [l, r];
      const l2 = xcKey(e.right), r2 = xcLitOf(e.left);
      return l2 !== null && r2 !== null ? [l2, r2] : null;
    };
    const xcNotOf = (e) => { e = unparen(e); return ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken ? xcKey(e.operand) : null; };
    /** two xcConjuncts that cannot both hold: K === a and K === b with a != b, or K and !K */
    const xcContradict = (x, y) => {
      const ex = xcEqOf(x), ey = xcEqOf(y);
      if (ex && ey && ex[0] === ey[0] && ex[1] !== ey[1]) return true;
      const nx = xcNotOf(x), ny = xcNotOf(y);
      if (nx !== null && nx === xcKey(y)) return true;
      if (ny !== null && ny === xcKey(x)) return true;
      return false;
    };
    const xcExclusive = (a, b) => { const ca = xcConjuncts(a), cb = xcConjuncts(b); return ca.some((x) => cb.some((y) => xcContradict(x, y))); };
    /** child -> its group (the first member) or null (a later member, scored with the first); groups of one are left out */
    function exclusiveChildGroups(children) {
      const groups = [];
      for (const c of children) {
        const g = xcGuardOf(c);
        if (!g) continue;
        const home = groups.find((gr) => gr.every((o) => xcExclusive(xcGuardOf(o), g)));
        if (home) home.push(c);
        else groups.push([c]);
      }
      const out = new Map();
      for (const gr of groups) if (gr.length > 1) gr.forEach((c, i) => out.set(c, i === 0 ? gr : null));
      return out;
    }

    /** Evaluate an expression as shown content. Every form that is not listed here is a gap. */
    function walkExpr(e, env, m, depth = 0) {
      e = unparen(e);
      if (!e) return;
      if (depth > MAX_EXPR) return gap(m, e, `an expression nested deeper than ${MAX_EXPR}`, env.file);
      // the kit's measuring probe shows nothing
      if ((ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) || ts.isJsxFragment(e)) && isKitProbe(e)) return;
      if (ts.isStringLiteralLike(e)) return addStr(m, e.text, proseLit(e.text));
      if (ts.isNumericLiteral(e) || ts.isBigIntLiteral(e) || e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword) return;
      if (ts.isTemplateExpression(e)) {
        // the literal parts are prose together, not piece by piece: `Some words ${n} more words` is authored text
        const prose = proseLit([e.head.text, ...e.templateSpans.map((sp) => sp.literal.text)].join(' '));
        addStr(m, e.head.text, prose);
        for (const sp of e.templateSpans) {
          walkExpr(sp.expression, env, m, depth + 1);
          addStr(m, sp.literal.text, prose);
        }
        return;
      }
      if (isJsxEl(e) || ts.isJsxFragment(e)) return walkEl(e, env, m);
      if (ts.isConditionalExpression(e)) {
        return alt(m, [(b) => walkExpr(e.whenTrue, env, b, depth + 1), (b) => walkExpr(e.whenFalse, env, b, depth + 1)]);
      }
      if (ts.isBinaryExpression(e)) {
        const k = e.operatorToken.kind;
        if (k === ts.SyntaxKind.AmpersandAmpersandToken) return walkExpr(e.right, env, m, depth + 1);
        if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
          return alt(m, [(b) => walkExpr(e.left, env, b, depth + 1), (b) => walkExpr(e.right, env, b, depth + 1)]);
        }
        if (k === ts.SyntaxKind.PlusToken) {
          // the literal operands of a chain are prose together, as the parts of a template are
          const ops = plusOperands(e);
          const lits = ops.map((x) => litOf(x, env));
          const prose = proseLit(lits.filter((l) => typeof l === 'string').join(' '));
          ops.forEach((x, i) => (typeof lits[i] === 'string' ? addStr(m, lits[i], prose) : walkExpr(x, env, m, depth + 1)));
          return;
        }
        if (k === ts.SyntaxKind.CommaToken) return walkExpr(e.right, env, m, depth + 1);
        if (ASSIGN_OPS.has(k)) return gap(m, e, 'an assignment shown as content', env.file);
        return; // comparisons and arithmetic are data
      }
      if (ts.isArrayLiteralExpression(e)) {
        for (const x of e.elements) walkExpr(x, env, m, depth + 1);
        return;
      }
      if (ts.isIdentifier(e)) return walkName(e, env, m, depth);
      if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) return walkAccess(e, env, m, depth);
      if (ts.isCallExpression(e)) return walkCall(e, env, m, depth);
      if (ts.isSpreadElement(e)) return walkExpr(e.expression, env, m, depth + 1);
      if (ts.isPrefixUnaryExpression(e) || ts.isTypeOfExpression(e) || ts.isVoidExpression(e) || ts.isDeleteExpression(e)) return;
      if (ts.isObjectLiteralExpression(e)) {
        // a record is data, not shown text; authored text it holds is still flagged, so a prop that is handed one is judged by what it carries
        // what the record cannot show (a gap in a member, a spread, a computed key) is kept: it is the record's gap
        const rec = branch({ gaps: m.gaps, isRoot: m.isRoot });
        for (const pr of e.properties) {
          if (ts.isPropertyAssignment(pr)) {
            if (ts.isComputedPropertyName(pr.name) && propKey(pr.name) === undefined) gap(rec, pr, 'a computed key in a record', env.file);
            walkExpr(pr.initializer, env, rec, depth + 1);
          } else if (ts.isShorthandPropertyAssignment(pr)) walkExpr(pr.name, env, rec, depth + 1);
          else if (ts.isSpreadAssignment(pr)) walkExpr(pr.expression, env, rec, depth + 1);
          else gap(rec, pr, 'a method or accessor in a record', env.file);
        }
        if (rec.auth || rec.extra) {
          m.auth = true;
          m.extra += rec.extra;
        }
        return;
      }
      // a render callback in a content position (the kit calls function children): its returns are alternatives of what it shows
      if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return walkFunction(e, env, m, depth, []);
      gap(m, e, 'a form the rule does not measure', env.file);
    }

    /** a callback / local function as content: parameters are the call's arguments by position (none for a render callback) */
    function walkFunction(fnNode, env, m, depth, args) {
      if (env.hops >= MAX_HOPS || (env.depth >= MAX_DEPTH && !m.isRoot)) return gap(m, fnNode, `a helper chain deeper than ${MAX_DEPTH}`, env.file);
      const props = new Map();
      const missing = new Set(); // parameters whose argument is absent or `undefined`: their defaults apply, the parameter-level one included
      fnNode.parameters.forEach((p, i) => {
        const a = args[i];
        if (!a || isUndefinedExpr(a)) return void missing.add(p);
        if (ts.isIdentifier(p.name)) return void props.set(p.name.text, { expr: a, env });
        // a destructured parameter reads the argument's members; an argument the rule cannot open leaves its names unreadable (a gap where they are shown)
        const { map, unknown } = ts.isObjectBindingPattern(p.name) ? objectMap(a, env) : { map: new Map(), unknown: true };
        const names = [];
        const collect = (pat) => {
          for (const el of pat.elements) {
            if (ts.isOmittedExpression(el)) continue;
            if (ts.isIdentifier(el.name)) names.push([el.name.text, el.dotDotDotToken ? undefined : ts.isObjectBindingPattern(pat) ? propKey(el.propertyName || el.name) : undefined, !!el.dotDotDotToken]);
            else collect(el.name);
          }
        };
        collect(p.name);
        for (const [local, key, rest] of names) {
          const v = !rest && key !== undefined && ts.isObjectBindingPattern(p.name) ? map.get(key) : null;
          if (v) props.set(local, { expr: v, env });
          else if (unknown || rest || key === undefined) props.set(local, { opaque: a, env });
        }
      });
      const inner = { ...env, fn: fnNode, props, outer: env, depth: env.depth + 1, hops: env.hops + 1, positional: true, missing };
      walkReturns(fnNode, inner, m, depth + 1);
    }

    /** a value `bindingValue` resolved from a destructuring path */
    function bindingPath(pattern, name, path = []) {
      for (const el of pattern.elements) {
        if (ts.isOmittedExpression(el) || el.dotDotDotToken) continue;
        const idx = pattern.elements.indexOf(el);
        const step = ts.isObjectBindingPattern(pattern) ? propKey(el.propertyName || el.name) : idx;
        if (ts.isIdentifier(el.name)) {
          if (el.name.text === name) return step === undefined ? null : { path: [...path, step], el };
        } else {
          const sub = bindingPath(el.name, name, step === undefined ? path : [...path, step]);
          if (sub) return step === undefined ? null : sub;
        }
      }
      return null;
    }
    /** `const { a: x } = init` / `const [x] = init`: the node (or table key) the name reads, resolved through readable objects, arrays and tables; null when it cannot be read */
    function resolvePath(init, path, env) {
      let curN = unparen(init);
      let guard = 0;
      for (let i = 0; i < path.length; i++) {
        if (!curN || ++guard > 24) return null;
        if (ts.isIdentifier(curN)) {
          const tbl = tableOfExpr(env.file, curN);
          if (tbl && i === path.length - 1 && typeof path[i] === 'string') return { table: tbl, key: path[i] };
          const nx = stableInit(curN);
          if (!nx) return null;
          curN = unparen(nx);
          i--;
          continue;
        }
        if (ts.isObjectLiteralExpression(curN) && typeof path[i] === 'string') {
          const p = objProp(curN, path[i]);
          if (!p.node) return null;
          curN = unparen(p.node);
        } else if (ts.isArrayLiteralExpression(curN) && typeof path[i] === 'number') {
          const x = curN.elements[path[i]];
          if (!x || curN.elements.slice(0, path[i] + 1).some((y) => ts.isSpreadElement(y))) return null;
          curN = unparen(x);
        } else return null;
      }
      return curN ? { node: curN } : null;
    }

    /** `undefined` / `void 0`: what makes a default apply */
    function isUndefinedExpr(ex) {
      ex = unparen(ex);
      return !!ex && ((ts.isIdentifier(ex) && ex.text === 'undefined' && !localDecl(ex)) || ts.isVoidExpression(ex));
    }
    /** an expression that can be `undefined` at run time, so a default beside it may apply */
    function exprMayBeUndefined(ex) {
      ex = unparen(ex);
      if (!ex) return false;
      if (isUndefinedExpr(ex)) return true;
      if (ts.isConditionalExpression(ex)) return exprMayBeUndefined(ex.whenTrue) || exprMayBeUndefined(ex.whenFalse);
      if (ts.isBinaryExpression(ex) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(ex.operatorToken.kind)) return exprMayBeUndefined(ex.right);
      return false;
    }
    const givenMayBeUndefined = (g) => (g.alts ? g.alts.some((a) => a && givenMayBeUndefined(a)) : !!g.expr && exprMayBeUndefined(g.expr));
    /** a bare name as shown content */
    function walkName(id, env, m, depth) {
      if (id.text === 'undefined' || id.text === 'NaN' || id.text === 'Infinity') return;
      if (env.vars && env.vars.has(id.text) && !localShadow(id, env)) return addStr(m, env.vars.get(id.text), false);
      const d = localDecl(id);
      if (d && ts.isParameter(d)) {
        const own = ownerOf(d, env);
        if (!own) return gap(m, id, 'a value captured from a function the rule is not inside', env.file, 'name');
        const prop = propNameOf(id, d, own);
        if (prop === undefined) {
          if (ts.isIdentifier(d.name) && own.fn.parameters[0] === d && !own.positional) return gap(m, id, 'the whole props object shown as content', env.file, 'name');
          return gap(m, id, 'a parameter the rule cannot read', env.file, 'name');
        }
        const g = own.props && own.props.get(prop);
        const def = defaultOfParam(d, id.text, own);
        const walkDefault = (b) => (def.unreadable ? gap(b, id, 'a parameter default the rule cannot read', env.file, 'name') : walkExpr(def.node, own, b, depth + 1));
        if (g) {
          // a prop given as `undefined` (or maybe) falls back to the default
          if (def && givenMayBeUndefined(g)) return alt(m, [(b) => emitGiven(g, env, b, depth), walkDefault]);
          return emitGiven(g, env, m, depth);
        }
        // not given: a default value in the signature, else nothing renders; a root's props come from outside the scanned pages
        if (def) return walkDefault(m);
        if (!own.props) return gap(m, id, 'a prop of a component nothing in the scanned pages renders', env.file, 'name');
        return;
      }
      if (d && ts.isVariableDeclaration(d)) {
        if (ts.isIdentifier(d.name)) {
          // the translate function itself is not content
          if (translatorOf(id, env)) return;
          if (!d.initializer || reassigned(d)) return gap(m, id, 'a variable that is assigned after it is declared', env.file, 'name');
          return walkExpr(d.initializer, env, m, depth + 1);
        }
        // destructuring: const { a: x } = init
        const bp = bindingPath(d.name, id.text);
        const stableDecl = !!d.parent && ts.isVariableDeclarationList(d.parent) && (!!(d.parent.flags & ts.NodeFlags.Const) || !reassignedName(d, id.text));
        if (bp && d.initializer && stableDecl) {
          const r = resolvePath(d.initializer, bp.path, env);
          if (r && r.table) return emitKeys(m, r.table, [r.key], id, env);
          if (r && r.node) {
            // `const { a = dflt } = { a: undefined }`: the default applies when the value is undefined
            const dflt = bp.el.initializer;
            if (dflt && exprMayBeUndefined(r.node)) return alt(m, [(b) => walkExpr(r.node, env, b, depth + 1), (b) => walkExpr(dflt, env, b, depth + 1)]);
            return walkExpr(r.node, env, m, depth + 1);
          }
        }
        return gap(m, id, 'a destructured name the rule cannot read', env.file, 'name');
      }
      gap(m, id, 'a name the rule cannot trace to text', env.file, 'name');
    }
    const reassignedName = (d, name) => {
      let scope = d.parent;
      while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
      let hit = false;
      const v = (n) => {
        if (hit) return;
        if (ts.isBinaryExpression(n) && ASSIGN_OPS.has(n.operatorToken.kind) && ts.isIdentifier(unparen(n.left)) && unparen(n.left).text === name) hit = true;
        if (!hit) ts.forEachChild(n, v);
      };
      if (scope) v(scope);
      return hit;
    };
    /** the default value of a parameter (`function F({ text = x })` / `function f(a = x)`) */
    function defaultOfParam(d, name, own) {
      if (ts.isIdentifier(d.name)) return d.name.text === name && d.initializer ? { node: d.initializer } : undefined;
      const bp = d.name && bindingPath(d.name, name);
      if (!bp) return undefined;
      if (bp.el.initializer) return { node: bp.el.initializer };
      // `function f({ a }: P = { a: x })`: the whole-argument default applies when the call gave none (a component always gets a props object, so never there)
      if (d.initializer && own && own.missing && own.missing.has(d)) {
        const r = resolvePath(d.initializer, bp.path, own);
        return r && r.node ? { node: r.node } : { unreadable: true };
      }
      return undefined;
    }
    /** a map-element name that a nested declaration shadows is not the element */
    const localShadow = (id, env) => {
      const d = localDecl(id);
      return !!d && !(ts.isParameter(d) && d.parent && env.mapFns && env.mapFns.has(d.parent));
    };

    /** A prop the render site gave: its expression evaluated in the caller's env; `children` are the caller's JSX children. */
    function emitGiven(g, env, m, depth) {
      if (g.alts) return alt(m, g.alts.map((a) => (b) => (a ? emitGiven(a, env, b, depth) : void 0)));
      if (g.opaque) return gap(m, g.opaque, 'an argument the rule cannot read', env.file, 'name');
      // the caller's content is rendered here: it continues THIS position's component count, with the caller's own bindings
      const genv = { ...g.env, depth: env.depth, hops: env.hops, stack: new Set([...env.stack, ...g.env.stack]), scope: env.scope, paged: env.paged };
      if (g.children) return walkChildren(g.children, genv, m);
      if (g.expr) walkExpr(g.expr, genv, m, depth + 1);
    }

    /** An optional prop the render site left out is undefined there: a member read, call or optional chain that starts from it
     *  (`locked?.hint`, `note?.(p)`, `props.note?.(p)`, `locked.copy.text`) shows nothing (it is undefined, or it throws). True only
     *  when the render site (or a positional call) is known, the prop is not among what it gave and its signature has no default;
     *  a component nothing renders keeps its props unknown. */
    function absentChain(e, env) {
      let n = unparen(e);
      let first; // the member read right after the root name (`props.note`: note)
      for (let guard = 0; n && guard < 32; guard++) {
        if (ts.isPropertyAccessExpression(n)) {
          first = n.name.text;
          n = unparen(n.expression);
        } else if (ts.isElementAccessExpression(n)) {
          const a = n.argumentExpression && unparen(n.argumentExpression);
          first = a && (ts.isStringLiteralLike(a) || ts.isNumericLiteral(a)) ? a.text : undefined;
          n = unparen(n.expression);
        } else if (ts.isCallExpression(n)) {
          first = undefined;
          n = unparen(n.expression);
        } else if (ts.isNonNullExpression(n)) n = unparen(n.expression);
        else break;
      }
      if (!n || !ts.isIdentifier(n) || n === unparen(e)) return false;
      if (env.vars && env.vars.has(n.text) && !localShadow(n, env)) return false;
      const d = localDecl(n);
      if (!d || !ts.isParameter(d)) return false;
      const own = ownerOf(d, env);
      if (!own || !own.props) return false;
      let prop = propNameOf(n, d, own);
      if (prop === undefined) {
        // the whole props object: `props.note` is the prop `note`
        if (own.positional || own.fn.parameters[0] !== d || !propsBindings(own.fn).whole.has(n.text) || first === undefined) return false;
        prop = first;
        return !own.props.has(prop);
      }
      return !own.props.has(prop) && !defaultOfParam(d, n.text, own);
    }

    /** `x.key` / `x['key']` / `x[0]` as shown content */
    function walkAccess(e, env, m, depth) {
      if (absentChain(e, env)) return;
      const root = unparen(e.expression);
      const computed = ts.isElementAccessExpression(e);
      const arg = computed && e.argumentExpression ? unparen(e.argumentExpression) : null;
      let key = !computed ? e.name.text : arg && (ts.isStringLiteralLike(arg) || ts.isNumericLiteral(arg)) ? arg.text : undefined;
      if (key === undefined && arg) {
        const l = litOf(arg, env);
        if (l !== null) key = l;
      }
      const dataMember = !computed && DATA_MEMBERS.has(e.name.text); // `.length` / `.size` are data unless the table, props or record in front really holds such a key
      if (root && ts.isIdentifier(root)) {
        // a prop the render site gave: props.key
        const d = localDecl(root);
        if (d && ts.isParameter(d)) {
          const own = ownerOf(d, env);
          if (own && own.props && own.fn.parameters[0] === d && !own.positional && propsBindings(own.fn).whole.has(root.text)) {
            if (key === undefined) return gap(m, e, 'a prop read with a computed key', env.file);
            const g = own.props.get(key);
            if (g) return emitGiven(g, env, m, depth);
            return;
          }
        }
        // a strings table read as an object: strings.key
        const tbl = tableOfExpr(env.file, root);
        if (tbl) {
          if (key === undefined) return gap(m, e, 'a table read with a computed key', env.file);
          if (dataMember && !lookupText(tbl, key)) return;
          return emitKeys(m, tbl, [key], e, env);
        }
        // a record the map is bound to / a local object literal of copy: COPY.key (the last write wins; a later spread or computed key may override it)
        const rec = recOf(root, env);
        if (rec) {
          if (key === undefined) return gap(m, e, 'a record read with a computed key', env.file);
          const p = objProp(rec.obj, key);
          if (p.node) return walkExpr(p.node, { ...env, file: rec.file }, m, depth + 1);
          if (p.unknown) return gap(m, e, 'a record whose member may be overridden by a spread or a computed key', env.file);
          return;
        }
      }
      if (dataMember) return;
      // a local array of readable elements: arr[0], or arr[i] (the longest element shows)
      if (computed) {
        const init = root && ts.isIdentifier(root) ? stableInit(root) : root;
        const arr = init ? unparen(init) : null;
        if (arr && ts.isArrayLiteralExpression(arr) && !arr.elements.some((x) => ts.isSpreadElement(x) || ts.isOmittedExpression(x))) {
          if (key !== undefined && /^\d+$/.test(key)) {
            const x = arr.elements[Number(key)];
            return x ? walkExpr(x, env, m, depth + 1) : undefined;
          }
          return alt(m, arr.elements.map((x) => (b) => walkExpr(x, env, b, depth + 1)));
        }
      }
      gap(m, e, 'a property read the rule does not follow', env.file, 'name');
    }

    /** the returns of a function are alternatives of one result: the longest shows */
    function walkReturns(fn, env, m, depth) {
      const rets = returnsOf(fn);
      if (rets.length === 1) return walkExpr(rets[0], env, m, depth);
      alt(m, rets.map((r) => (b) => walkExpr(r, env, b, depth)));
    }

    /** the function node a callee names, when it is a function declared in the scanned code: { node } */
    function localFnOf(callee) {
      const d = localDecl(callee);
      if (!d) return null;
      if (ts.isFunctionDeclaration(d)) return d;
      if (ts.isVariableDeclaration(d) && d.initializer && isFnValue(d.initializer) && !reassigned(d)) return unparen(d.initializer);
      return null;
    }

    /** a `list.map(cb)` call's plan: its callback, the expressions the callback returns, and one env per element when the list is a
     *  literal the rule can bind the callback's parameter to (`runs`), else null runs (a list of unknown size). Null when the
     *  callback cannot be read. */
    function mapPlan(call, env) {
      let cb = unparen(call.arguments[0]);
      if (cb && ts.isIdentifier(cb)) cb = localFnOf(cb);
      if (!cb || !(ts.isArrowFunction(cb) || ts.isFunctionExpression(cb) || ts.isFunctionDeclaration(cb))) return null;
      const elems = arrayElems(unparen(call.expression).expression, env);
      const p0 = cb.parameters[0];
      const bodies = cb.body && ts.isBlock(cb.body) ? returnsOf(cb) : cb.body ? [cb.body] : [];
      const bindNames = (p, el, vars, recs) => {
        if (!p) return true;
        if (ts.isIdentifier(p.name)) {
          if (el.str !== undefined) vars.set(p.name.text, el.str);
          else recs.set(p.name.text, el.rec);
          return true;
        }
        if (ts.isObjectBindingPattern(p.name) && el.rec) {
          for (const b of p.name.elements) {
            if (b.dotDotDotToken || !ts.isIdentifier(b.name)) return false;
            const k = propKey(b.propertyName || b.name);
            const pr = k === undefined ? { unknown: true } : objProp(el.rec.obj, k);
            const lit = pr.node ? litOf(pr.node, { ...env, file: el.rec.file }) : null;
            if (lit === null) return false;
            vars.set(b.name.text, lit);
          }
          return true;
        }
        return false;
      };
      if (elems && p0) {
        const mapFns = new Set([...(env.mapFns || []), cb]);
        let ok = true;
        const runs = [];
        for (const el of elems) {
          const vars = new Map(env.vars || []);
          const recs = new Map(env.recs || []);
          if (!bindNames(p0, el, vars, recs)) {
            ok = false;
            break;
          }
          runs.push({ vars, recs });
        }
        if (ok) return { cb, bodies, runs: runs.map((r) => ({ ...env, vars: r.vars, recs: r.recs, mapFns, outer: env })) };
      }
      return { cb, bodies, runs: null };
    }

    function walkCall(call, env, m, depth) {
      if (absentChain(call, env)) return; // a call through an optional prop the render site left out
      if (tCall(call, env, m)) return;
      const callee = unparen(call.expression);
      if (ts.isPropertyAccessExpression(callee)) {
        const name = callee.name.text;
        const recv = unparen(callee.expression);
        // Math.* is data
        if (recv && ts.isIdentifier(recv) && recv.text === 'Math' && !localDecl(recv)) return;
        // list.map(cb): a literal array sums once per element; an array of unknown size counts its body once, and anything it shows is a gap
        if (name === 'map' && call.arguments[0]) {
          const plan = mapPlan(call, env);
          if (!plan) return gap(m, call, 'a map callback the rule cannot read', env.file);
          const { cb, bodies } = plan;
          if (plan.runs) {
            for (const r of plan.runs) for (const b of bodies) walkExpr(b, r, m, depth + 1);
            return;
          }
          const probe = branch({ gaps: [], isRoot: m.isRoot });
          const mine = [];
          intoList(mine, () => {
            for (const b of bodies) walkExpr(b, { ...env, mapFns: new Set([...(env.mapFns || []), cb]) }, probe, depth + 1);
          });
          cur.push(...mine);
          // regions the body creates are counted where they are; their authored text still makes the map an unknown multiple of it
          const inner = flatAccs(mine).some((a) => a.auth || a.extra || a.gaps.length);
          if (probe.auth || probe.extra || probe.gaps.length || inner) gap(m, call, 'a map over data of unknown size renders authored text', env.file);
          return;
        }
        // string methods with a rule: the receiver's text (a method that only shortens or reformats), concat / join / replace add their arguments
        if (TEXT_METHODS.has(name)) return walkExpr(callee.expression, env, m, depth + 1);
        if (name === 'concat') {
          walkExpr(callee.expression, env, m, depth + 1);
          for (const a of call.arguments) walkExpr(a, env, m, depth + 1);
          return;
        }
        if (name === 'join') {
          const sepArg = call.arguments[0] ? litOf(call.arguments[0], env) : ',';
          const arr = unparen(callee.expression);
          const lit = arr && ts.isIdentifier(arr) ? stableInit(arr) : arr;
          const a = lit ? unparen(lit) : null;
          if (sepArg === null || !a || !ts.isArrayLiteralExpression(a) || a.elements.some((x) => ts.isSpreadElement(x))) return gap(m, call, 'a join the rule cannot measure', env.file);
          a.elements.forEach((x, i) => {
            if (i) addStr(m, sepArg, false);
            walkExpr(x, env, m, depth + 1);
          });
          return;
        }
        if (name === 'replace' || name === 'replaceAll') {
          // the receiver, and the replacement once (a pattern that matches several times is an approximation: the longest single reading)
          walkExpr(callee.expression, env, m, depth + 1);
          const rep = call.arguments[1] && unparen(call.arguments[1]);
          if (!rep || ts.isArrowFunction(rep) || ts.isFunctionExpression(rep)) return gap(m, call, 'a replacement the rule cannot measure', env.file);
          // one reading is only the text when the pattern matches once and the replacement does not echo the match: anything else repeats text
          const pat = call.arguments[0] && unparen(call.arguments[0]);
          const everywhere = name === 'replaceAll' || !pat || !(ts.isStringLiteralLike(pat) || (ts.isRegularExpressionLiteral(pat) && !/g/.test(pat.text.slice(pat.text.lastIndexOf('/')))));
          if (everywhere) return gap(m, call, 'a replacement that may match more than once', env.file);
          const repLit = litOf(rep, env);
          if (repLit === null && !ts.isTemplateExpression(rep) && !ts.isNoSubstitutionTemplateLiteral(rep) && !ts.isBinaryExpression(rep)) return walkExpr(rep, env, m, depth + 1);
          if (typeof repLit === 'string' ? /\$[&'`0-9<$]/.test(repLit) : ts.isTemplateExpression(rep) && /\$[&'`0-9<$]/.test([rep.head.text, ...rep.templateSpans.map((sp) => sp.literal.text)].join(''))) return gap(m, call, 'a replacement that echoes the match', env.file);
          return walkExpr(rep, env, m, depth + 1);
        }
        return gap(m, call, `the method ${name}, which the rule does not measure`, env.file);
      }
      if (ts.isIdentifier(callee)) {
        if (callee.text === 'String' && !localDecl(callee)) return call.arguments[0] ? walkExpr(call.arguments[0], env, m, depth + 1) : undefined;
        if (DATA_CALLS.has(callee.text) && !localDecl(callee)) return;
        if (!localDecl(callee)) {
          // a page hook whose value is data (X.dataCalls), and a kit hook that returns the kit's own text (X.kitTextCalls): read as that string
          const kb = P.traceLocal(env.file, callee.text);
          if (kb && !kb.kit && X.dataCalls && Object.hasOwn(X.dataCalls, kb.def) && kb.file === X.dataCalls[kb.def]) return;
          const kt = kb && kb.kit && X.kitTextCalls ? X.kitTextCalls[kb.def] : undefined;
          if (kt) {
            const x = lookupText(readTable(kt.strings), kt.key);
            if (!x) return gap(m, call, `the key ${kt.key} is missing from its table`, env.file);
            append(m, x);
            if (x.len) m.auth = true;
            return;
          }
        }
        // a function declared in this file: followed like a component, arguments by position
        const fnNode = localFnOf(callee);
        if (fnNode && !translatorOf(callee, env)) return walkFunction(fnNode, env, m, depth, [...call.arguments]);
        // a function of a page's own pure module (`X.pure.ts`: the side-effect-free half split out of a page file), followed
        // the same way: text that moved there still counts where it renders (debt moves, never drops)
        if (!fnNode && !localDecl(callee)) {
          // only an import that names the pure module itself (`from './X.pure'`), not one re-exported through another module
          const imp = P.infoOf(env.file).imports.get(callee.text);
          const pb = imp && /\.pure$/.test(imp.spec) ? P.traceLocal(env.file, callee.text) : null;
          const pureFn = pb && !pb.kit && !pb.ns && pb.file && /\.pure\.ts$/.test(pb.file) ? stableFnOf(pb.file, pb.def) : null;
          if (pureFn && !translatorOf(callee, env)) return walkFunction(pureFn, env, m, depth, [...call.arguments]);
        }
      }
      gap(m, call, 'a call the rule does not measure', env.file);
    }

    function walkEl(el, env, m) {
      if (ts.isJsxFragment(el)) return walkChildren(el.children, env, m);
      const f = facts(env.file, el);
      const tn = openingOf(el).tagName;
      if (f.intrinsic.length) {
        const exempt = f.intrinsic.some((tg) => exemptTags.has(tg));
        const tgt = exempt ? sink(m) : m;
        const { exprs, unknown } = propsOf(f, env);
        if (unknown) gap(tgt, el, 'a spread the rule cannot read', env.file);
        const kids = childrenOf(el);
        const dh = exprs.get('dangerouslySetInnerHTML');
        if (dh) {
          // the HTML is the content: its final `__html` (spreads applied in order), measured when it reads as text, a gap when it reads as nothing
          eachAlt(dh, tgt, (entry, mm) => {
            const { map, unknown: unk } = objectMap(entry.node, entry.env);
            const html = map.get('__html');
            if (unk) gap(mm, el, 'HTML whose object the rule cannot read', env.file);
            const probe = branch({ gaps: mm.gaps, isRoot: mm.isRoot });
            const before = mm.gaps.length;
            if (html) walkExpr(html, entry.env, probe);
            if (!html || (!probe.len && mm.gaps.length === before)) gap(mm, el, 'HTML set from a value the rule cannot read', env.file);
            else {
              append(mm, probe);
              mm.extra += probe.extra;
              mm.auth = mm.auth || probe.auth;
            }
          });
        }
        // the `children` prop shows only when the element has no JSX children of its own
        const ch = exprs.get('children');
        if (ch && !kids.length) eachAlt(ch, tgt, (entry, mm) => (entry.children ? walkChildren(entry.children, envFor(entry, env), mm) : entry.node ? walkExpr(entry.node, envFor(entry, env), mm) : undefined));
        return walkChildren(kids, env, tgt);
      }
      const b = f.binding;
      if (!b) {
        if (ts.isPropertyAccessExpression(tn) || (ts.isIdentifier(tn) && /^[A-Z]/.test(tn.text))) gap(m, el, ts.isIdentifier(tn) ? 'a computed component' : 'a member component the rule cannot resolve', env.file);
        else if (!ts.isIdentifier(tn)) gap(m, el, 'a component the rule cannot resolve', env.file);
        return;
      }
      const { exprs, unknown } = propsOf(f, env);
      if (b.kit) {
        const name = b.def;
        if (exemptKit.has(name)) {
          for (const entry of exprs.values()) for (const n of nodesOf(entry)) toSink(n.node, envFor(n, env), m);
          return walkChildren(childrenOf(el), env, sink(m));
        }
        // the region table's name: the declared one when the table knows it, else the exported one (a part exported under another
        // name, as slotName reads it: Verdict is VerdictRoot, Track is TrackRoot)
        const pagers = new Set(Object.values(X.pagedRegions || {}));
        const known = (n) => Object.hasOwn(X.regions, n) || pagers.has(n);
        const rname = b.pub && !known(name) ? b.pub : name;
        const pagedBy = X.pagedRegions && Object.hasOwn(X.pagedRegions, rname) ? X.pagedRegions[rname] : null;
        const region = pagedBy && env.paged !== pagedBy ? undefined : X.regions[rname];
        const target = region ? newAcc(env.file, el, undefined, env) : m;
        let renv = region ? { ...env, depth: 0 } : env; // a region starts its own count of helper components
        // a paging parent (Track): its steps are regions only when it shows one body at a time. Fail closed: a bare `flat`, any
        // `flat` value but a literal false, or a spread the rule cannot read, and the steps count where the Track is
        if (pagers.has(rname)) {
          const lit = f.op.attributes.properties.find((a) => ts.isJsxAttribute(a) && attrName(a) === 'flat');
          const vals = nodesOf(exprs.get('flat')).map((n) => unparen(n.node));
          const flat = unknown || (lit && !attrExpr(lit)) || vals.some((v) => !v || v.kind !== ts.SyntaxKind.FalseKeyword);
          renv = { ...renv, paged: flat ? undefined : rname };
        }
        if (unknown) gap(target, el, 'a spread the rule cannot read', env.file);
        // a paged region outside its parent: its region props count in the panel holding it, with the shared text props
        const attrs = region ? new Set(region) : pagedBy ? new Set([...textProps, ...X.regions[rname]]) : textProps;
        const kids = childrenOf(el);
        for (const [an, entry0] of exprs) {
          if (an === 'children' && kids.length) continue; // JSX children win over the prop
          eachAlt(entry0, target, (entry, tgtm) => {
            if (entry.children) return walkChildren(entry.children, envFor(entry, renv), tgtm);
            if (!entry.node) return;
            const ex = entry.node;
            const eenv = envFor(entry, renv);
            // a step-group list (StepList): read group by group; an item's text and note count in this region, the rest are labels or data
            const sl = X.stepLists && X.stepLists[name];
            if (sl && an === sl.prop) {
              // the keys an entry sets, through literal and const spreads (a conditional spread: either branch's keys, once). A key set
              // twice may be replaced by a later one, which the reader does not resolve: a gap, never the earlier text counted silently
              const keysOf = (o, seen, dup) => {
                for (const pr of o.properties) {
                  let ks = [];
                  if (ts.isPropertyAssignment(pr) || ts.isShorthandPropertyAssignment(pr)) {
                    const k = ts.isShorthandPropertyAssignment(pr) ? pr.name.text : propKey(pr.name);
                    if (k !== undefined) ks = [k];
                  } else if (ts.isSpreadAssignment(pr)) {
                    const one = (x) => {
                      let u = unparen(x);
                      if (u && ts.isIdentifier(u)) u = unparen(stableInit(u));
                      if (!u || !ts.isObjectLiteralExpression(u)) return [];
                      const inner = new Set();
                      keysOf(u, inner, dup);
                      return [...inner];
                    };
                    const u = unparen(pr.expression);
                    ks = u && ts.isConditionalExpression(u) ? [...new Set([...one(u.whenTrue), ...one(u.whenFalse)])] : one(u);
                  }
                  for (const k of ks) {
                    if (seen.has(k)) dup.add(k);
                    seen.add(k);
                  }
                }
              };
              const readObj = (o, mm, fn, nested) => {
                const dup = new Set();
                if (!nested) keysOf(o, new Set(), dup);
                for (const k of dup) gap(mm, o, `the key ${k} set twice in a ${an} entry, which the rule cannot resolve`, env.file);
                for (const pr of o.properties) {
                  if (ts.isPropertyAssignment(pr)) {
                    const k = propKey(pr.name);
                    if (k === undefined) gap(mm, pr, `a computed key in a ${an} entry the rule cannot read`, env.file);
                    else fn(k, pr.initializer, mm);
                  } else if (ts.isShorthandPropertyAssignment(pr)) fn(pr.name.text, pr.name, mm);
                  else if (ts.isSpreadAssignment(pr)) {
                    let u = unparen(pr.expression);
                    if (u && ts.isIdentifier(u)) u = mutated(u, undefined, true) ? undefined : unparen(stableInit(u));
                    if (u && ts.isObjectLiteralExpression(u)) readObj(u, mm, fn, true);
                    else if (u && ts.isConditionalExpression(u) && !hasJsx(u.condition)) {
                      const side = (b) => (bm) => {
                        const w = unparen(b);
                        if (w && ts.isObjectLiteralExpression(w)) readObj(w, bm, fn, true);
                        else gap(bm, b, `a spread in a ${an} entry the rule cannot read`, env.file);
                      };
                      alt(mm, [side(u.whenTrue), side(u.whenFalse)]);
                    } else gap(mm, pr, `a spread in a ${an} entry the rule cannot read`, env.file);
                  } else gap(mm, pr, `a member of a ${an} entry the rule cannot read`, env.file);
                }
              };
              const readList = (lst, mm, isItem) => {
                for (const bad of lst.bad) gap(mm, bad, `a ${an} entry the rule cannot read`, env.file);
                for (const o of lst.items) {
                  if (o.alts) {
                    alt(mm, o.alts.map((sub) => (b) => readList(sub, b, isItem)));
                    continue;
                  }
                  readObj(o, mm, (key, val, m2) => {
                    if (!isItem && key === sl.items) {
                      const sub = stepList(val, 0);
                      if (!sub) return gap(m2, val, `the ${an} ${key} list cannot be read`, env.file);
                      return readList(sub, m2, true);
                    }
                    if (isItem && sl.text.includes(key)) return walkExpr(val, eenv, m2);
                    return toSink(val, eenv, m2);
                  });
                }
              };
              const top = stepList(ex, 0);
              if (!top) return gap(tgtm, el, `the ${an} list cannot be read`, env.file);
              return readList(top, tgtm, false);
            }
            // archetype list props: each `sections` entry is a Section's worth of text; `tabs` / `steps` entries are panels of the page body
            if (X.listProps.includes(an)) {
              const list = objectList(ex, 0);
              if (!list) {
                gap(tgtm, el, `the ${an} list cannot be read`, env.file);
                return;
              }
              for (const bad of list.bad) gap(tgtm, bad, `a ${an} entry the rule cannot read`, env.file);
              for (const o of list.items) {
                const tgt = an === 'sections' ? newAcc(env.file, o, undefined, env) : tgtm;
                const oenv = an === 'sections' ? { ...eenv, depth: 0 } : eenv;
                const { map, unknown: unk } = objectMap(o, oenv);
                if (unk) gap(tgt, o, `a spread or computed key in a ${an} entry the rule cannot read`, env.file);
                for (const [key, val] of map) {
                  if (X.listText.includes(key) || textProps.has(key)) walkExpr(val, oenv, tgt);
                  else toSink(val, oenv, tgt);
                }
              }
              return;
            }
            // a MenuList prop: each entry's description / disabledReason is explanation, its other fields labels or data (a group's items read alike)
            if (X.menus[name]?.includes(an)) {
              const readList = (list, m, depth) => {
                for (const bad of list.bad) gap(m, bad, `a ${an} entry the rule cannot read`, env.file);
                for (const o of list.items) {
                  if (o.alts) {
                    alt(m, o.alts.map((sub) => (b) => readList(sub, b, depth)));
                    continue;
                  }
                  const { map, unknown: unk } = objectMap(o, eenv);
                  if (unk) gap(m, o, `a spread or computed key in a ${an} entry the rule cannot read`, env.file);
                  for (const [key, val] of map) {
                    if (key === 'items' && depth < 2) readMenu(val, m, depth + 1);
                    else if (X.menuText.includes(key)) walkExpr(val, eenv, m);
                    else toSink(val, eenv, m);
                  }
                }
              };
              const readMenu = (mex, m, depth) => {
                const list = menuList(mex, 0);
                if (!list) return gap(m, mex === ex ? el : mex, `the ${an} list cannot be read`, env.file);
                readList(list, m, depth);
              };
              readMenu(ex, tgtm, 0);
              return;
            }
            // an object prop read only as a plain literal (X.literalText): its text keys are read, the rest are labels or actions
            const lt = X.literalText?.[name] ?? X.literalText?.[rname];
            if (lt && Object.hasOwn(lt, an)) {
              // `cond ? { … } : null` (either order) reads as the one literal: the empty side shows nothing
              const none = (x) => !x || isUndefinedExpr(x) || x.kind === ts.SyntaxKind.NullKeyword;
              let o = unparen(ex);
              if (o && ts.isConditionalExpression(o) && !hasJsx(o.condition)) {
                const wt = unparen(o.whenTrue), wf = unparen(o.whenFalse);
                if (none(wf)) o = wt;
                else if (none(wt)) o = wf;
              }
              const plain = (pr) => (ts.isPropertyAssignment(pr) && propKey(pr.name) !== undefined) || ts.isShorthandPropertyAssignment(pr);
              if (o && ts.isObjectLiteralExpression(o) && o.properties.every(plain)) {
                for (const pr of o.properties) {
                  const k = ts.isShorthandPropertyAssignment(pr) ? pr.name.text : propKey(pr.name);
                  const v = ts.isShorthandPropertyAssignment(pr) ? pr.name : pr.initializer;
                  if (lt[an].includes(k)) walkExpr(v, eenv, tgtm);
                  else toSink(v, eenv, tgtm);
                }
                return;
              }
            }
            // an object prop whose listed keys are regions of their own (X.literalRegions): the other keys are labels, handlers or flags
            const lr = X.literalRegions?.[name] ?? X.literalRegions?.[rname];
            if (lr && Object.hasOwn(lr, an)) {
              const plain = (pr) => (ts.isPropertyAssignment(pr) && propKey(pr.name) !== undefined) || ts.isShorthandPropertyAssignment(pr);
              const nothing = (x) => !x || isUndefinedExpr(x) || x.kind === ts.SyntaxKind.NullKeyword;
              const read = (x, mm, hops) => {
                let o = unparen(x);
                if (nothing(o)) return;
                if (ts.isIdentifier(o) && hops < 2) {
                  const init = mutated(o, undefined, true) ? undefined : stableInit(o);
                  if (init) return read(init, mm, hops + 1);
                }
                if (ts.isConditionalExpression(o) && !hasJsx(o.condition)) return alt(mm, [(b) => read(o.whenTrue, b, hops), (b) => read(o.whenFalse, b, hops)]);
                if (!ts.isObjectLiteralExpression(o) || !o.properties.every(plain)) return gap(mm, el, `a ${an} the rule cannot read (write it as a plain object, or a const holding one)`, env.file);
                for (const pr of o.properties) {
                  const k = ts.isShorthandPropertyAssignment(pr) ? pr.name.text : propKey(pr.name);
                  const v = ts.isShorthandPropertyAssignment(pr) ? pr.name : pr.initializer;
                  if (lr[an].includes(k)) walkExpr(v, { ...eenv, depth: 0 }, newAcc(env.file, v, undefined, env));
                  else toSink(v, eenv, mm);
                }
              };
              return read(ex, tgtm, 0);
            }
            // a list prop whose options draw content where the component sits (X.optionReveals: a RadioGroup option's `reveal` is
            // drawn under its radio while it is picked). Each option's reveal is read in this region as if its JSX sat here; one
            // option is picked at a time, so the reveals are alternatives. Every other key of an option is a label, and a list,
            // entry or spread the reader cannot follow is a label as before (a known gap: a reveal inside it is not seen)
            const orv = X.optionReveals?.[name] ?? X.optionReveals?.[rname];
            if (orv && Object.hasOwn(orv, an)) {
              // the option keys whose content is drawn (one key, or several: an option's text members, all shown together while it is
              // chosen); `a.b` is member b of the option's object at a (read as an option is: a literal or a never-reassigned const)
              const keys = [].concat(orv[an]);
              // a list of keys (ExamplePicker): the prop was an unknown prop before it was read here, so a value the reader cannot follow
              // (a helper's list, a spread in an entry) stays what it was then: a gap when it carries authored text. One key (RadioGroup):
              // such a value is a label, as it always was (the known gap pinned in the explain test)
              const strict = Array.isArray(orv[an]);
              const unread = (x, oenv) => {
                if (!strict) return toSink(x, oenv, tgtm);
                const probe = branch({ gaps: [], isRoot: oenv.isRoot });
                walkExpr(x, oenv, probe);
                if (probe.auth || probe.extra || probe.gaps.some((g) => g.kind !== 'name')) gap(tgtm, x, `authored text in the ${an} prop that the rule cannot read (a list or entry it cannot follow)`, env.file);
              };
              const reveals = [];
              const stable = (id) => (mutated(id) ? undefined : stableInit(id));
              // one option: its drawn values go to `vals` (one alternative); a conditional option is two alternatives
              const entry = (x, oenv, hops, ks = keys, vals = null) => {
                const o = unparen(x);
                if (o && ts.isIdentifier(o) && hops < 2) {
                  const init = stable(o);
                  if (init) return entry(init, oenv, hops + 1, ks, vals);
                }
                if (o && ts.isConditionalExpression(o) && !hasJsx(o.condition) && !vals) {
                  entry(o.whenTrue, oenv, hops, ks);
                  entry(o.whenFalse, oenv, hops, ks);
                  return;
                }
                if (!o || !ts.isObjectLiteralExpression(o)) return unread(x, oenv);
                const own = vals ?? [];
                for (const pr of o.properties) {
                  const k = ts.isPropertyAssignment(pr) ? propKey(pr.name) : ts.isShorthandPropertyAssignment(pr) ? pr.name.text : null;
                  const v = ts.isPropertyAssignment(pr) ? pr.initializer : ts.isShorthandPropertyAssignment(pr) ? pr.name : ts.isSpreadAssignment(pr) ? pr.expression : null;
                  if (!v) continue;
                  const sub = k === null ? [] : ks.filter((x) => x.startsWith(`${k}.`)).map((x) => x.slice(k.length + 1));
                  if (k === null) unread(v, oenv);
                  else if (ks.includes(k)) own.push({ v, env: oenv });
                  else if (sub.length) entry(v, oenv, 0, sub, own);
                  else toSink(v, oenv, tgtm);
                }
                if (!vals && own.length) reveals.push(own);
              };
              const list = (x, oenv, hops) => {
                const u = unparen(x);
                if (!u || isUndefinedExpr(u) || u.kind === ts.SyntaxKind.NullKeyword) return;
                if (ts.isIdentifier(u) && hops < 2) {
                  const init = stable(u);
                  if (init) return list(init, oenv, hops + 1);
                }
                if (ts.isConditionalExpression(u) && !hasJsx(u.condition)) {
                  list(u.whenTrue, oenv, hops);
                  list(u.whenFalse, oenv, hops);
                  return;
                }
                if (ts.isArrayLiteralExpression(u)) {
                  for (const el of u.elements) {
                    if (ts.isSpreadElement(el)) list(el.expression, oenv, hops);
                    else entry(el, oenv, hops);
                  }
                  return;
                }
                const callee = ts.isCallExpression(u) ? unparen(u.expression) : null;
                const plan = callee && ts.isPropertyAccessExpression(callee) && callee.name.text === 'map' && u.arguments[0] ? mapPlan(u, oenv) : null;
                if (!plan) return unread(x, oenv);
                const runs = plan.runs || [{ ...oenv, mapFns: new Set([...(oenv.mapFns || []), plan.cb]) }];
                for (const r of runs) for (const b of plan.bodies) entry(b, r, 0);
              };
              list(ex, eenv, 0);
              if (reveals.length) alt(tgtm, reveals.map((vs) => (b) => vs.forEach((r) => walkExpr(r.v, r.env, b))));
              return;
            }
            // a component's own labels win over the shared text props (SettingRow's `detail` is a text prop name elsewhere)
            if ((Object.hasOwn(X.ownLabels, name) ? X.ownLabels[name] : X.ownLabels[rname])?.includes(an)) {
              const textKeys = (X.ownLabelText?.[name] ?? X.ownLabelText?.[rname])?.[an];
              if (textKeys) {
                const visit = (n) => {
                  if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && textKeys.includes(ts.isShorthandPropertyAssignment(n) ? n.name.text : propKey(n.name))) {
                    walkExpr(ts.isShorthandPropertyAssignment(n) ? n.name : n.initializer, eenv, tgtm);
                  }
                  ts.forEachChild(n, visit);
                };
                visit(ex);
              }
              return toSink(ex, eenv, tgtm);
            }
            const shape = X.ownShapes && Object.hasOwn(X.ownShapes, name) && Object.hasOwn(X.ownShapes[name], an) ? X.ownShapes[name][an] : null;
            const read = shape ? ownShapeOf(ex, shape) : null;
            if (read === 'ok') return toSink(ex, eenv, tgtm);
            if (read === 'accessor') return gap(tgtm, ex, `an accessor or method in the ${an} prop, which the rule cannot read`, env.file);
            // a text prop that mostly shows data (X.dataText): its authored words count, and a name the rule cannot trace to text is
            // data, as in a prop the rule does not know; any other unreadable value is still a gap
            if ((X.dataText?.[rname] ?? X.dataText?.[name])?.includes(an)) {
              const b = { ...branch(tgtm), gaps: [] };
              walkExpr(ex, eenv, b);
              append(tgtm, b);
              tgtm.auth = tgtm.auth || b.auth;
              tgtm.extra += b.extra;
              for (const g of b.gaps) if (g.kind !== 'name') tgtm.gaps.push(g);
              return;
            }
            if (attrs.has(an) || textProps.has(an)) return walkExpr(ex, eenv, tgtm);
            if (labelRe.test(an)) return toSink(ex, eenv, tgtm);
            // the overlay FAQ descriptor: only the exact literal { item, label } (or a conditional between it and nothing) is a link (label = its text,
            // item = a reference); any other shape is still unknown
            if (an === 'faq' && X.overlayFaq.includes(name)) {
              const d = overlayFaqOf(ex);
              if (d) return d.forEach((n) => toSink(n, eenv, tgtm));
            }
            // the page FAQ on an archetype root: shown by kind, like Faq and FaqLink (its answers are faq.ts's regions). Only an explicit
            // faq={...} attribute of this element whose value is the page's own pageFaq (the form the FAQ conformance holds to faq.ts); a faq a
            // spread supplies, an inline object or another page's builder is still unknown
            if (an === 'faq' && X.rootFaq.includes(name) && ownAttr(ex, f.op, an) && pageFaqOf(ex, eenv.file)) return toSink(ex, eenv, tgtm);
            // a pane's data state: the kit draws it as an EmptyState, so an inline object is a region of its own: its text props count as that
            // state's body does, its title and action are labels. A state the rule cannot see into (a variable, a call) is still unknown
            if (an === 'state' && X.paneState.includes(name) && unparen(ex) && ts.isObjectLiteralExpression(unparen(ex))) {
              const o = unparen(ex);
              const tgt = newAcc(env.file, o, undefined, env);
              const oenv = { ...eenv, depth: 0 };
              const { map, unknown: unk } = objectMap(o, oenv);
              // any spread is a gap, even one objectMap can follow: it reads the initializer, not a later write to a property of the object
              if (unk || o.properties.some(ts.isSpreadAssignment)) gap(tgt, o, 'a spread or computed key in a state the rule cannot read', env.file);
              for (const [key, val] of map) {
                if (textProps.has(key)) walkExpr(val, oenv, tgt);
                else toSink(val, oenv, tgt);
              }
              return;
            }
            // a prop the rule does not know: any authored text it carries is a gap (regions inside it still count where they are)
            const u = unparen(ex);
            const probe = branch({ gaps: [], isRoot: eenv.isRoot });
            if (u && ts.isObjectLiteralExpression(u)) {
              for (const pr of u.properties) {
                if (ts.isPropertyAssignment(pr)) walkExpr(pr.initializer, eenv, probe);
                else if (ts.isShorthandPropertyAssignment(pr)) walkExpr(pr.name, eenv, probe);
                else if (ts.isSpreadAssignment(pr)) gap(probe, pr, 'a spread the rule cannot read', env.file);
              }
            } else walkExpr(u, eenv, probe);
            if (probe.auth || probe.extra || probe.gaps.some((g) => g.kind !== 'name')) gap(tgtm, el, `authored text in the ${an} prop, which the rule does not know`, env.file);
          });
        }
        const dc = X.dataChildren?.[rname] ?? X.dataChildren?.[name];
        if (dc && kids.length && kids.every((k) => ts.isJsxText(k) || ts.isJsxExpression(k)) && f.op.attributes.properties.some((a) => ts.isJsxAttribute(a) && attrName(a) === dc)) {
          const d = { ...branch(target), gaps: [] };
          walkChildren(kids, renv, d);
          append(target, d);
          target.auth = target.auth || d.auth;
          target.extra += d.extra;
          for (const g of d.gaps) if (g.kind !== 'name') target.gaps.push(g);
          return;
        }
        return walkChildren(kids, renv, target);
      }
      if (b.origin === 'local' && b.file) return expandLocal(f, el, env, m, exprs, unknown);
      // an outside component (a router link, a React wrapper): its children are shown; a prop that carries authored text is a gap
      for (const [an, entry0] of exprs) {
        if (an === 'children') continue;
        eachAlt(entry0, m, (entry, mm) => {
          if (!entry.node || labelRe.test(an)) return;
          const probe = branch({ gaps: [], isRoot: m.isRoot });
          walkExpr(entry.node, envFor(entry, env), probe);
          if (probe.auth || probe.extra || probe.gaps.some((g) => g.kind !== 'name')) gap(mm, el, `authored text in the ${an} prop of a component the rule cannot read`, env.file);
        });
      }
      walkChildren(childrenOf(el), env, m);
    }

    const visited = new Set();
    /** the overlay scope an element sits in inside its own file (a literal overlay id, or a forwarded one), else null */
    const ancestorScope = (file, node) => {
      const comp = enclosingComponent(file, node);
      for (const fa of ancestorEls(file, node)) {
        if (!isOverlayEl(fa)) continue;
        const r = idOf(fa, comp);
        if (r.lit) return `overlay:${r.lit}`;
        if (r.prop && comp && forwarders.has(comp.key)) {
          const s = scopeOfComponent(comp.key, new Set(), r.prop);
          if (s !== 'main') return s;
        }
      }
      return null;
    };

    function expandLocal(f, el, env, m, exprs, unknown) {
      const b = f.binding;
      const key = `${b.file}#${b.def}`;
      visited.add(key);
      if (env.stack.has(key)) return gap(m, el, 'a component that renders itself', env.file);
      if (env.hops >= MAX_HOPS) return gap(m, el, `a component chain deeper than ${MAX_HOPS}`, env.file);
      if (env.depth >= MAX_DEPTH && !m.isRoot) return gap(m, el, `a component chain deeper than ${MAX_DEPTH}`, env.file);
      const fn = fnOfDef(b.file, b.def);
      if (!fn) {
        // a context provider (`Context.Provider` or a name ending Provider) holding only a value shows its children; any other prop of a component the rule cannot open may carry text
        const only = [...exprs.keys()].every((k) => k === 'value' || k === 'children');
        if (/Provider$/.test(b.def) && only) return walkChildren(childrenOf(el), env, m);
        return gap(m, el, 'a component the rule cannot follow', env.file);
      }
      if (unknown) gap(m, el, 'a spread the rule cannot read', env.file);
      const props = new Map();
      for (const [an, ex] of exprs) props.set(an, ex.alts ? { alts: ex.alts, env } : ex.children ? { children: ex.children, env: ex.env } : { expr: ex.node, env: ex.env });
      const kids = childrenOf(el);
      if (kids.length) props.set('children', { children: kids, env });
      const scope = ancestorScope(env.file, el) || env.scope || null;
      const inner = { file: b.file, fn, props, vars: new Map(), recs: new Map(), depth: env.depth + 1, hops: env.hops + 1, stack: new Set([...env.stack, key]), scope, paged: env.paged };
      walkReturns(fn, inner, m, 0);
    }
    // alts props: make `alts` entries readable where props are read by name (an alternative that is absent renders nothing)
    // (emitGiven handles alts; translator and literal lookups read `.expr` and so treat an alternative prop as unreadable, a gap)

    // roots: every page component that no scanned page renders; its root return is its region
    const inScope = (file) => X.roots.some((r) => file.startsWith(r)) && !X.skip.some((r) => file.startsWith(r));
    const renderedInScope = (key) => (renderSites.get(key) || []).some((s) => inScope(s.file) && !selfSite(key, s));
    /** a render site inside the component it renders: a recursive call is not another way to reach it */
    const selfSite = (key, s) => {
      const comp = enclosingComponent(s.file, s.node);
      return !!comp && comp.key === key;
    };
    const isDefaultMod = (st) => !!st.modifiers && st.modifiers.some((md) => md.kind === ts.SyntaxKind.DefaultKeyword);
    const seenRoots = new Set();
    const walkRoot = (file, key, fn) => {
      if (seenRoots.has(key)) return;
      seenRoots.add(key);
      visited.add(key);
      const rets = returnsOf(fn);
      if (!rets.length) return;
      const acc = newAcc(file, rets[0], undefined, null);
      acc.isRoot = true;
      const env = { file, fn, props: null, vars: new Map(), recs: new Map(), depth: 0, hops: 0, stack: new Set([key]), scope: null };
      walkReturns(fn, env, acc, 0);
    };
    const unwrapRootExpr = (expr) => {
      let e = unparen(expr);
      while (e && ts.isCallExpression(e) && /^(?:React\.)?(memo|forwardRef)$/.test(e.expression.getText()) && e.arguments[0]) e = unparen(e.arguments[0]);
      return e;
    };
    const rootCandidates = []; // [file, key, fn] of every component the page defines
    for (const file of scannedSource) {
      if (!inScope(file) || (only && !only.has(file))) continue;
      const info = P.infoOf(file);
      for (const [name] of info.defs) {
        if (!/^[A-Z]/.test(name)) continue;
        const fn = fnOfDef(file, name);
        if (fn) rootCandidates.push([file, `${file}#${name}`, fn]);
      }
      // `export default function () {}`, `export default function view() {}`, `export default () => …`, `export default memo(…)`, `export default view`
      for (const st of P.sourceOf(file).statements) {
        if (ts.isFunctionDeclaration(st) && isDefaultMod(st)) rootCandidates.push([file, st.name ? `${file}#${st.name.text}` : `${file}#default`, st]);
        else if (ts.isExportAssignment(st)) {
          const e = unwrapRootExpr(st.expression);
          if (e && (ts.isArrowFunction(e) || ts.isFunctionExpression(e))) rootCandidates.push([file, `${file}#default`, e]);
          else if (!file.endsWith('.tsx')) {
            // a manifest (definePage(...)) is not a component
          } else if (e && ts.isIdentifier(e)) {
            const fn = fnOfDef(file, e.text);
            if (fn) rootCandidates.push([file, `${file}#${e.text}`, fn]);
            else {
              const acc = newAcc(file, st, undefined, null);
              acc.isRoot = true;
              gap(acc, st, 'an exported component the rule cannot read', file);
            }
          } else {
            const acc = newAcc(file, st, undefined, null);
            acc.isRoot = true;
            gap(acc, st, 'an exported component the rule cannot read', file);
          }
        }
      }
    }
    // a component nothing else renders is a root; then any component still unvisited (a recursive graph nothing outside enters) is entered too, so no rendered graph is skipped
    for (const [file, key, fn] of rootCandidates) if (!renderedInScope(key)) walkRoot(file, key, fn);
    for (const [file, key, fn] of rootCandidates) if (!visited.has(key)) walkRoot(file, key, fn);

    // faq.ts: a COMPLETE answer (the `a` of an item) is one region with the FAQ budget, however many keys or pieces it joins; its table is the nearest strings.en.json up the page folder
    for (const file of scannedSource) {
      if (!/^pages\/.*\/faq\.ts$/.test(file) || (only && !only.has(file))) continue;
      let dir = path.posix.dirname(file);
      let table = null;
      for (;;) {
        const cand = `${dir}/strings.en.json`;
        if (Object.prototype.hasOwnProperty.call(files, cand) || (typeof opts.readSrc === 'function' && opts.readSrc(cand) !== null)) {
          table = readTable(cand);
          break;
        }
        if (!dir.includes('/')) break;
        dir = path.posix.dirname(dir);
      }
      const answers = [];
      const covered = [];
      const enclosingFn = (n) => {
        for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return p;
        return null;
      };
      const answer = (valueNode, at) => {
        covered.push([at.pos, at.end]);
        const acc = newAcc(file, at, X.faqBudget, null);
        acc.isRoot = true;
        const env = { file, fn: enclosingFn(at), props: null, vars: new Map(), recs: new Map(), depth: 0, hops: 0, stack: new Set(), faqTable: table, scope: null };
        answers.push(() => walkExpr(valueNode, env, acc));
      };
      const sf = P.sourceOf(file);
      const find = (n) => {
        if (ts.isPropertyAssignment(n) && propKey(n.name) === 'a') answer(n.initializer, n);
        else if (ts.isShorthandPropertyAssignment(n) && n.name.text === 'a') answer(n.name, n);
        else if (ts.isObjectLiteralExpression(n)) {
          // a computed property name or a spread in an item can supply the answer: the complete answer cannot be established
          for (const pr of n.properties) {
            if ((ts.isPropertyAssignment(pr) && ts.isComputedPropertyName(pr.name) && propKey(pr.name) === undefined) || ts.isSpreadAssignment(pr)) {
              const acc = newAcc(file, pr, X.faqBudget, null);
              acc.isRoot = true;
              gap(acc, pr, 'an item member the rule cannot read (a computed name or a spread can supply the answer)', file);
            }
          }
        }
        ts.forEachChild(n, find);
      };
      find(sf);
      for (const run of answers) run();
      // an answer key read anywhere else in the file (outside an `a` property) is still an answer: one region per read
      const visit = (n) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && looksT(n.expression.text) && n.arguments[0] && ts.isStringLiteralLike(unparen(n.arguments[0]))) {
          const key = unparen(n.arguments[0]).text;
          if (key.startsWith(X.faqPrefix) && /\.a(?:[._]|$)/.test(key) && !covered.some(([s, e]) => n.pos >= s && n.end <= e)) {
            const a = newAcc(file, n, X.faqBudget, null);
            const x = table ? lookupText(table, key) : null;
            if (!x) gap(a, n, `the key ${key} cannot be read`, file);
            else {
              append(a, x);
              a.auth = true;
            }
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }

    // a region that IS an overlay (a ConfirmDialog, a Drawer) lives in its own overlay scope; otherwise the scope of the element's own overlay ancestor, else the scope of the render occurrence, else the existing resolver
    const regionScope = (a) => {
      const file = a.file;
      const node = a.node;
      const f = ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) ? facts(file, node) : null;
      if (f && isOverlayEl(f)) {
        const comp = enclosingComponent(file, node);
        const r = idOf(f, comp);
        if (r.lit) return `overlay:${r.lit}`;
        if (r.prop && comp && forwarders.has(comp.key)) {
          const sc = scopeOfComponent(comp.key, new Set(), r.prop);
          if (sc !== 'main') return sc;
        }
      }
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
        const anc = ancestorScope(file, node);
        if (anc) return anc;
      }
      return a.occScope || scopeOfNode(file, node);
    };
    /** hits and gaps of a tree of accumulators: a group scores every gap of every branch and the hits of the branch with the most */
    function tally(list) {
      const out = { gaps: [], hits: [] };
      for (const it of list) {
        if (it.group) {
          let best = null;
          const seen = new Set();
          for (const br of it.group) {
            const t = tally(br);
            for (const g of t.gaps) {
              const k = `${g.g.node.pos}:${g.g.node.end}:${g.g.why}`;
              if (seen.has(k)) continue;
              seen.add(k);
              out.gaps.push(g);
            }
            if (!best || t.hits.length > best.hits.length) best = t;
          }
          if (best) out.hits.push(...best.hits);
        } else {
          const budget = it.budget || X.budget;
          const chars = effOf(it);
          const n = (chars > budget ? Math.ceil((chars - budget) / X.step) : 0) + it.extra;
          for (const g of it.gaps) out.gaps.push({ a: it, g });
          for (let i = 0; i < n; i++) out.hits.push({ a: it, chars, budget });
        }
      }
      return out;
    }
    // every region occurrence is judged on its own text; occurrences under one element add up under that element's key
    const res = tally(top);
    for (const { a, g } of res.gaps) hit(a.file, a.node, 'layout.explainGap', `${g.why} (${g.file}:${lineOf(P.sourceOf(g.file), g.node).line})`, regionScope(a));
    for (const { a, chars, budget } of res.hits) hit(a.file, a.node, 'layout.explain', `${chars} characters of explanation in one region (budget ${budget})`, regionScope(a));
  }
  explainPass();

  // ── the ui.* family (anatomy-ui.cjs) ──
  const cssHit = (file, rule, at, msg) => {
    if ((only && !only.has(file)) || disabled.has(rule)) return;
    hits.push({ rule, file, scope: 'main', line: lineAt(cssRules(files[file]).text, at), col: 1, msg });
  };
  UI.scanUi({
    ts, files, reg, P, facts, hit, cssHit, disabled, ancestorEls, enclosingComponent, isTestFile, isSourceFile, cssRules, lineAt,
    unparen, attrName, attrExpr, attrLiteral, propKey, propsBindings, localDecl, initializerOf, stringsOf, isJsxEl, openingOf, childrenOf,
    moduleClassesIn, readSrc: typeof opts.readSrc === 'function' ? opts.readSrc : null,
  });
  // An exception drops the ui.* hits it covers: its path is the hit's file, or a folder ('…/') that holds it, and it names the
  // hit's rule; an entry with sites covers only the hits whose site it lists. Layout hits are never dropped (layout debt lives in
  // rows). usedExceptions lists `<path>|<rule>` (`<path>|<rule>|<site>` for each listed site) for every entry rule (site) that covers
  // at least one hit, so a stale entry or site is found. Overlapping entries (a folder and a file in it, or two folders)
  // are each credited with every hit they cover, so the result does not depend on the order of the list.
  const used = new Set();
  const kept = [];
  for (const h of hits) {
    const site = hitSite.get(h) || '<module>';
    const covering = h.rule.startsWith('ui.') ? (reg.exceptions || []).filter((x) => x.rules.includes(h.rule) && (x.path.endsWith('/') ? h.file.startsWith(x.path) : h.file === x.path) && (!x.sites || x.sites.includes(site))) : [];
    for (const e of covering) used.add(e.sites ? `${e.path}|${h.rule}|${site}` : `${e.path}|${h.rule}`);
    if (!covering.length) kept.push(h);
  }
  const counts = countKeys(kept);
  for (const at of formLoose.values()) {
    if (at.n >= FORM_FLAT_MIN) formHits.push({ rule: 'form.flat', file: at.file, scope: at.scope, line: at.line, msg: `${at.n} fields in one column of an overlay: cut the form into kit FormSections (a titled group, a rule between groups, a closing summary)` });
  }
  formHits.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return { hits: kept, counts, overlays, usedExceptions: [...used].sort(), formHits };
}

// ── the scan cache (on only through HUB_CACHE_DIR) ────────────────────────────────────────────
// A whole-tree scan costs about 19 CPU-s, and every test file and lint process that needed it computed it again on the same
// tree. scan() keeps the result in $HUB_CACHE_DIR/anatomy-scan/<key>.json. The key is a sha256 over this file's and
// anatomy-ui.cjs's bytes, the typescript and node versions, the options (registry, only, disabled) and every file's path and
// text, all in their own order (the detector walks them in that order, and its hits keep it), so a hit can not be stale.
// The inputs are checked first and the scan then runs on that checked copy, so the key and the scan see the same values:
// options and files must be plain data (own enumerable data properties of plain objects and arrays, strings, numbers,
// booleans, null, RegExps; no getter, proxy, prototype chain or non-enumerable property); anything else, such as a readSrc
// function, leaves the call uncached. A stored result carries its own sha256 and is served only when that sum and the
// result's shape check out; a result that does not survive a JSON round trip unchanged is never stored. Only whole-tree
// scans (SCAN_CACHE_MIN files and up) use it; fixture scans never touch the disk. Only the Hub's own detector (hub/scripts/lint,
// a vite.config.mts two folders up) uses it: a copy elsewhere, such as the layout gate's pinned detector, never does.
// Concurrent processes compute once: the first takes <key>.lock and the others wait for its result while its PID lives, for
// at most SCAN_CACHE_WAIT_MS; a dead or unknown holder, an old lock, a timeout or any error = compute here. A miss or any cache
// error computes normally (the slow path, never "no hits").
const SCAN_CACHE_VERSION = 2;
const SCAN_CACHE_MIN = 200;
const SCAN_CACHE_WAIT_MS = 180_000;
const SCAN_CACHE_KEEP = 24;
let scanCodeDigest;
let scanInHub;
function scanCacheDir() {
  const d = process.env.HUB_CACHE_DIR;
  if (!d) return null;
  const hub = path.join(__dirname, '..', '..');
  if (scanInHub === undefined) scanInHub = path.basename(__dirname) === 'lint' && fs.existsSync(path.join(hub, 'vite.config.mts'));
  return scanInHub ? path.join(path.resolve(hub, d), 'anatomy-scan') : null;
}
function unlinkQuiet(p) {
  try {
    fs.unlinkSync(p);
  } catch {
    /* gone already */
  }
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** True for an Object.prototype, of this realm or another (registry objects come from vm.runInNewContext). */
function isObjectPrototype(p) {
  if (p === Object.prototype) return true;
  if (!p || Object.getPrototypeOf(p) !== null || util.types.isProxy(p)) return false;
  const c = Object.getOwnPropertyDescriptor(p, 'constructor');
  return !!c && 'value' in c && typeof c.value === 'function' && c.value.name === 'Object' && c.value.prototype === p && /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(c.value));
}
function isArrayPrototype(p) {
  if (p === Array.prototype) return true;
  if (!p || !Array.isArray(p) || util.types.isProxy(p) || !isObjectPrototype(Object.getPrototypeOf(p))) return false;
  const c = Object.getOwnPropertyDescriptor(p, 'constructor');
  return !!c && 'value' in c && typeof c.value === 'function' && c.value.name === 'Array' && c.value.prototype === p;
}
/** The own data value of `v[k]`; throws for an accessor or a non-enumerable property. */
function dataOf(v, k) {
  const d = Object.getOwnPropertyDescriptor(v, k);
  if (!d || !('value' in d) || !d.enumerable) throw new Error(`not a plain data property: ${String(k)}`);
  if (k === '__proto__') throw new Error('an own __proto__ property'); // an assignment of it would set a prototype
  return d.value;
}
/** Plain data as unambiguous text for the key, in its own order; throws on anything else (a function, a Map, a getter, a
 *  proxy, an inherited or non-enumerable property, a cycle). */
function canonOf(v, depth = 0) {
  if (depth > 64) throw new Error('too deep');
  if (v === null) return 'n';
  if (v === undefined) return 'u';
  switch (typeof v) {
    case 'boolean':
      return v ? 'T' : 'F';
    case 'number':
      return `d${Object.is(v, -0) ? '-0' : String(v)};`;
    case 'string':
      return `s${v.length}:${v}`;
    case 'object':
      break;
    default:
      throw new Error(`not plain data: ${typeof v}`);
  }
  if (util.types.isProxy(v)) throw new Error('proxy');
  if (Object.getOwnPropertySymbols(v).length) throw new Error('symbol keys');
  const names = Object.getOwnPropertyNames(v);
  const proto = Object.getPrototypeOf(v);
  if (util.types.isRegExp(v)) {
    const rp = proto && Object.getPrototypeOf(proto);
    if (!(proto === RegExp.prototype || (proto && isObjectPrototype(rp) && Object.getOwnPropertyDescriptor(proto, 'constructor')?.value?.name === 'RegExp'))) throw new Error('RegExp subclass');
    if (names.length !== 1 || names[0] !== 'lastIndex') throw new Error('RegExp with own properties');
    const src = RegExp.prototype.toString.call(v);
    return `r${src.length}:${src};`;
  }
  if (Array.isArray(v)) {
    if (!isArrayPrototype(proto)) throw new Error('array subclass');
    const len = v.length;
    if (names.length !== len + 1) throw new Error('array with holes or extra properties');
    let o = `a${len}[`;
    for (let i = 0; i < len; i++) o += canonOf(dataOf(v, String(i)), depth + 1);
    return `${o}]`;
  }
  if (Object.prototype.toString.call(v) !== '[object Object]' || !(proto === null || isObjectPrototype(proto))) throw new Error('not a plain object');
  let o = `o${names.length}{`;
  for (const k of names) o += `k${k.length}:${k}${canonOf(dataOf(v, k), depth + 1)}`;
  return `${o}}`;
}
/** The checked inputs of a cacheable scan: {key, files, opts} (copies the scan then runs on), or null (scan uncached). */
function scanCacheInputs(files, opts) {
  if (scanCodeDigest === undefined) {
    try {
      scanCodeDigest = crypto
        .createHash('sha256')
        .update(fs.readFileSync(__filename))
        .update('\0')
        .update(fs.readFileSync(require.resolve('./anatomy-ui.cjs')))
        .update(`\0ts ${ts.version}\0node ${process.version}`)
        .digest('hex');
    } catch {
      scanCodeDigest = null;
    }
  }
  if (!scanCodeDigest) return null;
  const plainObject = (v) => v !== null && typeof v === 'object' && !util.types.isProxy(v) && !Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]' && (Object.getPrototypeOf(v) === null || isObjectPrototype(Object.getPrototypeOf(v))) && !Object.getOwnPropertySymbols(v).length;
  if (!plainObject(files) || !plainObject(opts)) return null;
  // Null-prototype copies: an assignment can then never reach an inherited setter (dataOf refuses an own __proto__ anyway).
  const optsCopy = Object.create(null);
  for (const k of Object.getOwnPropertyNames(opts)) optsCopy[k] = dataOf(opts, k);
  const h = crypto.createHash('sha256').update(`anatomy-scan ${SCAN_CACHE_VERSION}\0${scanCodeDigest}\0`);
  // the registry the scan falls back to is part of the key, as the registry it was given would be
  h.update(canonOf(optsCopy.registry ? optsCopy : { ...optsCopy, registry: DEFAULT_REGISTRY }));
  const names = Object.getOwnPropertyNames(files);
  if (names.length < SCAN_CACHE_MIN) return null;
  const filesCopy = Object.create(null);
  h.update(`\0files ${names.length}\0`);
  for (const f of names) {
    const t = dataOf(files, f);
    if (typeof t !== 'string') throw new Error('a file text is not a string');
    filesCopy[f] = t;
    h.update(`${f.length}:${f}\0${t.length}\0`).update(t).update('\0');
  }
  return { key: h.digest('hex'), files: filesCopy, opts: optsCopy };
}
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}
/** A scan result's shape (what every caller reads): anything else is no result. */
function scanResultShape(r) {
  const plain = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
  return (
    plain(r) &&
    Array.isArray(r.hits) &&
    r.hits.every((x) => plain(x) && typeof x.rule === 'string' && typeof x.file === 'string') &&
    plain(r.counts) &&
    Array.isArray(r.overlays) &&
    Array.isArray(r.usedExceptions)
  );
}
/** The stored result for `key`, served only when its version, key, sha256 and shape all check out; else null. */
function readScanCache(file, key) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!j || j.v !== SCAN_CACHE_VERSION || j.key !== key || typeof j.json !== 'string' || j.sum !== sha256(j.json)) return null;
    const r = JSON.parse(j.json);
    return scanResultShape(r) ? r : null;
  } catch {
    return null;
  }
}
function writeScanCache(dir, file, key, result) {
  const json = JSON.stringify(result);
  if (!scanResultShape(result) || !util.isDeepStrictEqual(JSON.parse(json), result)) return; // not plain JSON: never cached
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ v: SCAN_CACHE_VERSION, key, sum: sha256(json), json }));
    fs.renameSync(tmp, file);
  } catch {
    unlinkQuiet(tmp);
    return;
  }
  // Keep the newest SCAN_CACHE_KEEP results; temp files of a crashed writer go after an hour.
  try {
    const now = Date.now();
    const ents = [];
    for (const n of fs.readdirSync(dir)) {
      const st = fs.statSync(path.join(dir, n), { throwIfNoEntry: false });
      if (!st) continue;
      if (n.includes('.tmp-') && now - st.mtimeMs > 3600_000) unlinkQuiet(path.join(dir, n));
      else if (n.endsWith('.json')) ents.push([st.mtimeMs, n]);
    }
    ents.sort((a, b) => b[0] - a[0]);
    for (const [, n] of ents.slice(SCAN_CACHE_KEEP)) unlinkQuiet(path.join(dir, n));
  } catch {
    /* pruning is best effort */
  }
}
/** Scan results of a file tree: the cached whole-tree result when one exists for these exact inputs, else a fresh scan. */
function scan(files, opts = {}) {
  const dir = scanCacheDir();
  let inp = null;
  if (dir) {
    try {
      inp = scanCacheInputs(files, opts);
    } catch {
      inp = null; // not plain data: uncached
    }
  }
  if (!inp) return scanUncached(files, opts);
  const { key } = inp;
  const file = path.join(dir, `${key}.json`);
  const lock = path.join(dir, `${key}.lock`);
  let own = false;
  try {
    const hit = readScanCache(file, key);
    if (hit) return hit;
    fs.mkdirSync(dir, { recursive: true });
    const end = performance.now() + SCAN_CACHE_WAIT_MS; // a monotonic clock: a wall-clock step can not stretch the wait
    for (;;) {
      if (performance.now() >= end) break; // never wait past SCAN_CACHE_WAIT_MS
      // The lock appears with its content in one step (a link of a written temp file), so a waiter never reads it empty.
      const tmpLock = `${lock}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
      try {
        fs.writeFileSync(tmpLock, `${process.pid} ${Date.now()}\n`);
        fs.linkSync(tmpLock, lock);
        own = true;
      } catch (e) {
        if (e.code !== 'EEXIST') {
          unlinkQuiet(tmpLock);
          break; // can not lock: compute here, unlocked
        }
      }
      unlinkQuiet(tmpLock);
      if (own) break;
      const hit2 = readScanCache(file, key);
      if (hit2) return hit2;
      const st = fs.statSync(lock, { throwIfNoEntry: false });
      if (!st) continue; // the holder just finished or gave up: look again, then try the lock
      let pid = 0;
      try {
        pid = Number(fs.readFileSync(lock, 'utf8').split(' ')[0]) || 0;
      } catch {
        continue;
      }
      // A dead or unreadable holder, a lock older than the wait (by its mtime), or our own wait used up: compute here.
      if (!pid || !pidAlive(pid) || Date.now() - st.mtimeMs > SCAN_CACHE_WAIT_MS || performance.now() >= end) break;
      sleepMs(250);
    }
  } catch {
    /* any cache error: compute here */
  }
  try {
    // Look once more, lock or no lock: the holder we waited for may have stored the result just before we took the lock.
    const hit3 = readScanCache(file, key);
    if (hit3) return hit3;
    const result = scanUncached(inp.files, inp.opts);
    try {
      writeScanCache(dir, file, key, result);
    } catch {
      /* not stored */
    }
    return result;
  } finally {
    if (own) unlinkQuiet(lock);
  }
}

/** Pulls every CSS-module class named in an expression (s.x, s['x'], through cx(…), ternaries and local consts). */
function moduleClassesIn(n, modules, found, depth = 0) {
  if (depth > 8) return;
  if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && modules.has(n.expression.text)) return void found(modules.get(n.expression.text), n.name.text);
  if (ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression) && modules.has(n.expression.text) && ts.isStringLiteralLike(n.argumentExpression)) return void found(modules.get(n.expression.text), n.argumentExpression.text);
  if (ts.isIdentifier(n)) {
    const init = initializerOf(n);
    if (init) moduleClassesIn(init, modules, found, depth + 1);
    return;
  }
  ts.forEachChild(n, (k) => moduleClassesIn(k, modules, found, depth + 1));
}

// ── counting and comparing ───────────────────────────────────────────────────────────────────────────────────────
const keyOf = (rule, file, scope) => `${rule}|${file}|${scope}`;
function parseKey(k) {
  const [rule, file, ...scope] = k.split('|');
  return { rule, file, scope: scope.join('|') };
}
function countKeys(hits) {
  const c = {};
  for (const h of hits) {
    const k = keyOf(h.rule, h.file, h.scope);
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

/**
 * The monotone comparison (gate). limits: key -> max count. actual: key -> count. Per (rule, file):
 *  - `main` never grows;
 *  - an overlay scope may grow only by what `main` shrank (debt that moved into a named overlay), never more;
 *  - a (rule, file) with no limit at all is new debt.
 * Returns { ok, problems } where each problem is { kind, key, limit, actual }.
 */
function compareDebt(limits, actual) {
  const group = (m) => {
    const g = new Map();
    for (const [k, n] of Object.entries(m)) {
      const { rule, file, scope } = parseKey(k);
      const id = `${rule}|${file}`;
      const e = g.get(id) || { main: 0, ov: {}, any: true };
      if (scope === 'main') e.main = n;
      else e.ov[scope] = n;
      g.set(id, e);
    }
    return g;
  };
  const L = group(limits);
  const A = group(actual);
  const problems = [];
  for (const [id, a] of A) {
    const l = L.get(id);
    if (!l) {
      for (const [scope, n] of [['main', a.main], ...Object.entries(a.ov)]) if (n > 0) problems.push({ kind: 'new', key: `${id}|${scope}`, limit: 0, actual: n });
      continue;
    }
    if (a.main > l.main) problems.push({ kind: 'grew', key: `${id}|main`, limit: l.main, actual: a.main });
    let growth = 0;
    const grown = [];
    for (const [scope, n] of Object.entries(a.ov)) {
      const lim = l.ov[scope] || 0;
      if (n > lim) {
        growth += n - lim;
        grown.push([scope, lim, n]);
      }
    }
    const room = Math.max(0, l.main - a.main);
    if (growth > room) for (const [scope, lim, n] of grown) problems.push({ kind: lim === 0 ? 'new' : 'grew', key: `${id}|${scope}`, limit: lim, actual: n });
  }
  return { ok: problems.length === 0, problems };
}

/** The effective lower of two count maps: key -> min over the keys present in `a` (used by the baseline update). */
function lowerOf(a, b) {
  const out = {};
  for (const [k, n] of Object.entries(a)) {
    const m = Math.min(n, b[k] || 0);
    if (m > 0) out[k] = m;
  }
  return out;
}

/** Read rows of a tree's conformance.allow.ts files and allow.shared.ts (transpiled, evaluated without imports). */
function loadRows(files) {
  const rows = {}; // key -> count
  const evalRows = (f) => {
    const js = ts.transpileModule(files[f], { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = { exports: {} };
    vm.runInNewContext(js, { module: mod, exports: mod.exports, require: () => ({}) }, { timeout: 2000 });
    return mod.exports.allow || mod.exports.shared || {};
  };
  for (const f of Object.keys(files)) {
    const page = /^pages\/([^/]+)\/conformance\.allow\.ts$/.exec(f);
    if (!page && f !== 'app/conformance/allow.shared.ts') continue;
    let allow;
    try {
      allow = evalRows(f);
    } catch {
      continue;
    }
    for (const [rule, map] of Object.entries(allow)) {
      if (!RULES.includes(rule) || !map || typeof map !== 'object') continue;
      for (const [k, n] of Object.entries(map)) {
        const [file, scope] = splitRowKey(k);
        const full = page ? `pages/${page[1]}/${file}` : file;
        rows[keyOf(rule, full, scope)] = n;
      }
    }
  }
  return rows;
}
/** A row key is `<file>` (scope main) or `<file> overlay:<id>`. */
function splitRowKey(k) {
  const i = k.indexOf(' ');
  return i < 0 ? [k, 'main'] : [k.slice(0, i), k.slice(i + 1)];
}
const rowKeyOf = (file, scope) => (scope === 'main' ? file : `${file} ${scope}`);

/**
 * For the lint wrappers: the hits of one file whose (rule, file, scope) count is above its in-tree row, so an author sees
 * the lines of debt that grew (rows equal to the count stay silent). The project is scanned once per process.
 */
let lintCache = null;
/** A cheap identity of the lintable tree (path, mtime, size): a changed, added or removed file changes it. */
function treeSignature(srcDir) {
  const parts = [];
  const walk = (dir, rel) => {
    let ents = [];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      // Terminal siblings (X.term.tsx, X.web.term.ts, their tests) are not web anatomy: they have their own gates (the
      // terminal prim contract, scripts/term/contract.ts and graph.ts).
      if (isTermFile(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (/\.(tsx?|[cm]?jsx?|css)$|strings\.en\.json$/.test(e.name)) {
        const st = fs.statSync(path.join(dir, e.name));
        parts.push(`${r}:${st.mtimeMs}:${st.size}`);
      }
    }
  };
  walk(srcDir, '');
  return parts.join('\n');
}
/**
 * A command-line eslint or stylelint run (no --fix) reads a tree that does not change under it, so it takes the
 * signature once per srcDir instead of walking every file for each file it lints. Editors, test runners and fix runs
 * (stylelint writes fixes while it runs) keep the per-call walk. HUB_LINT_TREE_ONCE=1 or 0 forces the choice.
 */
const treeOnce =
  process.env.HUB_LINT_TREE_ONCE === '1' ||
  (process.env.HUB_LINT_TREE_ONCE !== '0' &&
    /(^|[\\/])(eslint|stylelint)(\.[cm]?js)?$/.test(process.argv[1] || '') &&
    !process.argv.some((a) => a === '--fix' || a.startsWith('--fix=')));
const treeSigOnce = new Map();
function treeSignatureFor(srcDir) {
  if (!treeOnce) return treeSignature(srcDir);
  if (!treeSigOnce.has(srcDir)) treeSigOnce.set(srcDir, treeSignature(srcDir));
  return treeSigOnce.get(srcDir);
}
/**
 * Hits of one file for an editor or lint run. The cache holds while the tree on disk is unchanged. A caller that has an unsaved
 * buffer may pass it as `source`: a buffer other than the one cached rescans the whole tree, so the ESLint and stylelint rules
 * do not pass it (a rule runs once per file and test; the disk state is read after a save).
 */
function lintHits(srcDir, rel, source) {
  const sig = source === undefined ? treeSignatureFor(srcDir) : treeSignature(srcDir);
  if (!lintCache || lintCache.srcDir !== srcDir || lintCache.sig !== sig || (source !== undefined && lintCache.files[rel] !== source)) {
    const files = readTree(srcDir);
    if (source !== undefined) files[rel] = source;
    const r = scan(files, { registry: loadRegistry(path.join(srcDir, 'kit/layouts/anatomy'), path.join(srcDir, 'app/conformance/exceptions.ts')) });
    lintCache = { srcDir, sig, files, hits: r.hits, counts: r.counts, rows: loadRows(files) };
  }
  const { hits, counts, rows } = lintCache;
  return hits.filter((h) => h.file === rel && counts[keyOf(h.rule, h.file, h.scope)] > (rows[keyOf(h.rule, h.file, h.scope)] || 0));
}

const EXPLAIN = {
  'layout.heading': 'a raw h1-h6 / as="hN": headings come from the kit',
  'layout.landmark': 'a raw landmark (section, header, footer, aside, nav, article, hr) outside a renderer',
  'layout.text': 'text written directly in a p/div/span/li/strong/em/small/label',
  'layout.state': 'EmptyState/ErrorState/Skeleton outside a Widget or a Section state',
  'layout.stateMissing': 'a strict Section holding a data leaf without a state',
  'layout.legacy': 'a legacy Panel/Section/PageFrame/Tabs/padding="page"/ReactNode description',
  'layout.localChrome': 'a page component that renders kit-like chrome',
  'layout.marker': 'a data-hub-* attribute written by page code',
  'layout.actionRow': 'a hand-written wrapper around kit action components',
  'layout.manifest': "layout: 'custom', or a root that does not match the manifest",
  'layout.cssMargin': 'a non-zero margin in page CSS',
  'layout.cssType': 'a heading font token in page CSS',
  'layout.cssReach': 'page CSS reaching into a kit component',
  'layout.cssGap': 'a row gap larger than the small step in page CSS (a page does not set vertical rhythm; the kit Section does)',
  'layout.inlineSpacing': 'inline style spacing',
  'layout.prose': 'Prose/Steps outside the Guide',
  'layout.slot': 'caller content not allowed by the kit slot table',
  'layout.visual': 'a Visual child that is not a graphic element',
  'layout.screens': 'sub-path parsing outside matchScreen, or a manifest without screens',
  'layout.overlayId': 'a kit overlay without a literal overlayId',
  'layout.explain': 'explanation text longer than a short line in one region (it belongs in the page FAQ)',
  'layout.explainGap': 'text the explanation rule cannot read (an unresolved lookup, a shape it cannot follow)',
  'layout.looseFaqLink': 'a FaqLink loose in a body: it ends a Why, or sits in a Band or Section header actions',
  'layout.bandsPerSection': 'more than one Band in one section or overlay body',
  'layout.drawerOl': 'a hand-made <ol> in an overlay body: steps are the kit StepList',
  ...UI.UI_EXPLAIN,
};

module.exports = {
  RULES,
  FORM_RULES,
  CSS_RULES,
  EXPLAIN,
  DEFAULT_REGISTRY,
  loadRegistry,
  readTree,
  createProject,
  scan,
  cssPx,
  countKeys,
  compareDebt,
  lowerOf,
  loadRows,
  lintHits,
  keyOf,
  parseKey,
  splitRowKey,
  rowKeyOf,
  isTestFile,
  isSourceFile,
  isTermFile,
  cssRules,
  localDecl,
  overlayFaqOf,
};
