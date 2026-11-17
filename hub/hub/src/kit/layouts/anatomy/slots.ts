// Table S: the slot type of each kit component prop that takes caller content, and what each type admits.
// Plain data: the anatomy detector (hub/scripts/lint/anatomy.cjs loadRegistry) evaluates this file without imports, and
// a layout test pins it. It equals the detector's DEFAULT_REGISTRY, plus the strict anatomy's own
// entries: AnatomySection `notices`, and ActionBar as an `actions` content; plus the list-detail pane
// header: DetailHeader `title`, `status` and `meta` are header text, `actions` are header
// actions: the text and actions lists without the pieces a pane header cannot hold (AddressRow renders an <li>, Fab is a
// fixed-position portal).
// The page banner above both panes: ListDetailPage and DetailPage `banner` hold page-level notices.
// PlanCard's slots: its text beside the name and under the price, a retention Band, the one action.
// A RailPane's `handle` takes the one kit PaneSeparator.
// The kit Composer's Talk slots: each takes exactly its one kit voice part.
// The list-detail panes: ListDetailPage `list` and `detail` take `pane` content, the `body` parts
// plus the states a pane shows and the pane's own header, body and footer.
// The overlay and banner props: a Dialog, ConfirmDialog or DangerConfirm `body` is the consequence in one
// or two sentences (inline text) and `titleMark` the computer's colour mark beside the title (mark: aria-hidden, no text of its own, so a ComputerMark only); Dialog
// `outcomeDetail` and OutcomeBanner `body` are inline text on the outcome's line (a span; the component draws its own
// ErrorDetails from `error`); a Drawer's `subtitle` is its one line of inline text (a <p>). Inline text is the text list
// without the pieces that render block markup: AddressRow (an <li>), ErrorDetails (a disclosure) and IpInfo (a <dl>); `actions`/`primary`/`secondary` its buttons,
// `outcome` the kit Outcome line and `footer` a free-form footer: a FormFooter, DrawerCancel, Outcome or the footer buttons.
// The menu trigger and the tab strip's controls: an ActionMenu `trigger` is the one kit button that opens
// it (Menu.tsx: a Button, or an IconButton like the default ⋯); Tabs `before` and `after` each hold
// one control on the strip's own row, outside the scroll, and Tabs `end` a small action or a count at the bar's end.
// The pick cards: a PickCard is one press, so nothing in it may be pressable. Its `mark` is
// the lg Monogram (card-mark), its `end` its words or a kind word (card-tag: text or a StatusPill), and its `line`, `note` and `meta` are
// card text: plain text plus the text pieces that can draw no control (no Tag, links, copy chips, tips or disclosures). A CardGrid's
// `renderCard` gives one PickCard per item and its `empty` the kit's empty states.
// A wizard's footer: WizardPage `footer` takes the one kit WizardFooter, whose `primary` and
// `secondary` are its buttons (its `back` is a handler and a flag, never content). The detector default holds the same rows.
// A WizardPage `aside` (the flow variant's side card) holds the summary's place: a side-card slot, the summary parts plus
// one AnatomySection, which draws the card itself (the flow aside has no frame of its own, unlike `summary`).
// A TextField's `prefix` and `suffix` are field affixes: words, a mark or status, or one compact control inside the border.

export const SLOTS = {
  DataTable: {
    empty: 'empty',
    bulkActions: 'actions',
    rowActions: 'actions',
    toolbarEnd: 'toolbar',
    toolbarNote: 'text',
    renderExpanded: 'expanded',
    cardRender: 'card',
    cell: 'cell',
  },
  SettingRow: { label: 'text', help: 'text', actions: 'actions', children: 'field' },
  SettingSwitch: { label: 'text', help: 'text', actions: 'actions' },
  Band: { children: 'text', actions: 'actions', attach: 'attached' },
  OutcomeBanner: { children: 'text', body: 'inline-text', actions: 'actions' },
  EmptyState: { body: 'text', action: 'actions', secondary: 'actions', hint: 'text' },
  IntroPanel: { actions: 'intro-actions', hide: 'actions' },
  ErrorState: { body: 'text', action: 'actions', secondary: 'actions' },
  PageHeader: { actions: 'actions' },
  FirstUseState: { body: 'text', action: 'actions', learn: 'text', hint: 'text' },
  NoAccessState: { body: 'text', action: 'actions' },
  SessionView: { empty: 'empty' },
  RailPane: { head: 'actions', nav: 'surface', foot: 'surface', handle: 'handle' },
  RailFoot: { action: 'surface', end: 'actions' },
  DetailPage: { banner: 'notices', notice: 'notices' },
  ListDetailPage: { banner: 'notices', list: 'pane', detail: 'pane' },
  PlanCard: { chip: 'text', lead: 'text', marks: 'text', footnote: 'notices', note: 'text', action: 'actions' },
  SettingsPage: { summary: 'summary', notice: 'notices' },
  WizardPage: { summary: 'summary', aside: 'side-card', notice: 'notices', footer: 'wizard-footer' },
  WizardFooter: { primary: 'actions', secondary: 'actions' },
  ConversationView: {
    activityExtra: 'text',
    actions: 'actions',
    empty: 'empty',
    top: 'notices',
    pane: 'surface',
    composer: 'surface',
    session: 'conv-session',
    usage: 'conv-usage',
  },
  Sheet: { info: 'body' },
  Dialog: { titleMark: 'mark', body: 'inline-text', outcomeDetail: 'inline-text', outcomeNote: 'inline-text', outcomeActions: 'actions' },
  ConfirmDialog: { titleMark: 'mark', body: 'inline-text', outcomeDetail: 'inline-text', outcomeNote: 'inline-text', outcomeActions: 'actions' },
  DangerConfirm: { titleMark: 'mark', body: 'inline-text' },
  Drawer: { subtitle: 'inline-text', actions: 'actions', primary: 'actions', secondary: 'actions', outcome: 'outcome', footer: 'footer', reason: 'inline-text', primaryOnPhone: 'actions' },
  AnatomySection: { notices: 'notices' },
  DetailHeader: { title: 'header-text', status: 'header-text', meta: 'header-text', actions: 'header-actions' },
  Composer: { mic: 'voice-mic', talk: 'voice-bar', captions: 'voice-captions' },
  ActionMenu: { trigger: 'menu-trigger' },
  /** A CodeEditor's own toolbar (kit/forms/CodeEditor.tsx): the page's controls after Find and the caret line. */
  CodeEditor: { tools: 'actions' },
  /** A LoadScreen (kit/states/LoadScreen.tsx): one notice under its plate, the page's buttons under its cards, and what to do next. */
  LoadScreen: { notice: 'notices', actions: 'actions', next: 'body' },
  Tabs: { before: 'tabs-control', after: 'tabs-control', end: 'tabs-end' },
  /** A cell's stacked lines (kit/data/cells). Its children slot type is the slot it stands in, so in a
   *  DataTable cell the detector checks each child as cell content (anatomy.cjs slotProblems: a part passes its slot on). */
  CellLines: { children: 'cell' },
  // Track's step and Verdict: a step's tags, result and why sentence are inline text; the plate's
  // next line is inline text, its slot (the thing itself) and facts are body parts.
  TrackStep: { tags: 'inline-text', result: 'inline-text', why: 'inline-text' },
  Verdict: { next: 'inline-text', slot: 'body', facts: 'body' },
  /** A Widget's head actions: the buttons at the end of its title row. */
  Widget: { actions: 'actions' },
  PickCard: { mark: 'card-mark', end: 'card-tag', line: 'card-text', note: 'card-text', meta: 'card-text' },
  CardGrid: { renderCard: 'pick-card', empty: 'empty' },
  /** What sits inside a TextField's border, before and after the typed text. */
  TextField: { prefix: 'field-affix', suffix: 'field-affix' },
};

export const SLOT_TYPES = {
  /** An IntroPanel's first actions: a button or a link button, or a Handoff around one (a web-only page's link). */
  'intro-actions': ['Button', 'LinkButton', 'Handoff'],
  outcome: ['Outcome'],
  /** A WizardPage's footer row: the kit WizardFooter, which lays out Back, the secondary and the primary (Layouts.tsx). */
  'wizard-footer': ['WizardFooter'],
  /** The colour mark beside a dialog title: aria-hidden, no text of its own (Dialog.tsx), so not a Monogram (its initials)
   *  or an Icon (a label makes it an image). */
  mark: ['ComputerMark'],
  /** A RailPane's resize handle, lying over its end edge: the kit's one pane handle. */
  handle: ['PaneSeparator'],
  /** `text` without the pieces that render block markup: AddressRow (an <li>), ErrorDetails (a disclosure), IpInfo (a <dl>). */
  'inline-text': [
    'IdChip',
    'Ids',
    'Code',
    'CodeLine',
    'StatusPill',
    'Tag',
    'Monogram',
    'ComputerMark',
    'Icon',
    'Link',
    'Kbd',
    'Shortcut',
    'AddressText',
    'Spinner',
    'When',
    'Meter',
    'ProgressCell',
    'UnknownCell',
    'Sparkline',
    'FaqLink',
    'ChatNames',
    'ComputerLink',
  ],
  footer: ['FormFooter', 'DrawerCancel', 'Outcome', 'Button', 'TextButton', 'LinkButton', 'ReasonButton', 'ActionMenu', 'ActionBar'],
  text: [
    'IdChip',
    'Ids',
    'Code',
    'CodeLine',
    'StatusPill',
    'Tag',
    'Monogram',
    'ComputerMark',
    'Icon',
    'Link',
    'Kbd',
    'Shortcut',
    'AddressText',
    'AddressRow',
    'IpInfo',
    'Spinner',
    'When',
    'Meter',
    'ProgressCell',
    'UnknownCell',
    'Sparkline',
    'ErrorDetails',
    'FaqLink',
    'ChatNames',
    'ComputerLink',
  ],
  actions: [
    'FaqLink',
    'Button',
    'IconButton',
    'LinkButton',
    'TextButton',
    'ActionMenu',
    'ReasonButton',
    'ItemActions',
    'CopyButton',
    'Fab',
    'QrButton',
    'PageLinkTo',
    'FileButton',
    'ActionBar',
  ],
  field: [
    'TextField',
    'ScheduleField',
    'SearchField',
    'Switch',
    'Checkbox',
    'CheckboxGroup',
    'NumberField',
    'Select',
    'Combobox',
    'EntityPicker',
    'RadioGroup',
    'SecretField',
    'SecretInput',
    'SegmentedControl',
    'IdChip',
    'Ids',
    'Code',
    'StatusPill',
    'Tag',
    'Icon',
    'Link',
    'AddressText',
    'AddressRow',
    'CopyField',
    'Button',
    'TextButton',
    'IconButton',
    'LinkButton',
    'ActionMenu',
    'ReasonButton',
  ],
  /** A Band's `attach`: the field it warns about (the `field` list), or a kit list whose rows it is about: PickerPanel
   *  and SettingGroup point their aria-describedby at the Band's sentence. Its own type so `field` slots never take a list. */
  attached: [
    'TextField',
    'ScheduleField',
    'SearchField',
    'Switch',
    'Checkbox',
    'CheckboxGroup',
    'NumberField',
    'Select',
    'Combobox',
    'EntityPicker',
    'RadioGroup',
    'SecretField',
    'SecretInput',
    'SegmentedControl',
    'IdChip',
    'Ids',
    'Code',
    'StatusPill',
    'Tag',
    'Icon',
    'Link',
    'AddressText',
    'AddressRow',
    'CopyField',
    'Button',
    'TextButton',
    'IconButton',
    'LinkButton',
    'ActionMenu',
    'ReasonButton',
    'PickerPanel',
    'SettingGroup',
  ],
  body: [
    'SubSection',
    'ItemList',
    'ProblemList',
    'TileGrid',
    'ChoiceCards',
    'DataTable',
    'SettingGroup',
    'Facts',
    'StaticTable',
    'ActionCards',
    'StatStrip',
    'Form',
    'CodeBlock',
    // StepList and Why: a step's how and its one closed explanation.
    'StepList',
    'Why',
    // Track and Verdict: a guided setup's steps and the panel's top plate.
    'Track',
    'Verdict',
    'Disclosure',
    'Visual',
    'Surface',
    'FilterChips',
    'Band',
    'OutcomeBanner',
    'Outcome',
  ],
  /** DataTable's toolbar end (toolbarEnd): the actions list plus SegmentedControl, the table's own view switch
   *  (composites pass where the kit declares them, narrow types, not the shared lists). */
  toolbar: ['FaqLink', 'Button', 'IconButton', 'LinkButton', 'TextButton', 'ActionMenu', 'ReasonButton', 'ItemActions', 'CopyButton', 'Fab', 'QrButton', 'PageLinkTo', 'FileButton', 'ActionBar', 'SegmentedControl'],
  /** DataTable's card renderer (cardRender): body parts plus CutFrame, the card's own cut-to-fit frame. */
  card: ['SubSection', 'ItemList', 'ProblemList', 'TileGrid', 'ChoiceCards', 'DataTable', 'SettingGroup', 'Facts', 'StaticTable', 'ActionCards', 'StatStrip', 'Form', 'CodeBlock', 'StepList', 'Why', 'Track', 'Verdict', 'Disclosure', 'Visual', 'Surface', 'FilterChips', 'Band', 'OutcomeBanner', 'Outcome', 'CutFrame'],
  /** DataTable's expanded row (renderExpanded): body parts plus AddressField, the row's full address. */
  expanded: ['SubSection', 'ItemList', 'ProblemList', 'TileGrid', 'ChoiceCards', 'DataTable', 'SettingGroup', 'Facts', 'StaticTable', 'ActionCards', 'StatStrip', 'Form', 'CodeBlock', 'StepList', 'Why', 'Track', 'Verdict', 'Disclosure', 'Visual', 'Surface', 'FilterChips', 'Band', 'OutcomeBanner', 'Outcome', 'AddressField'],
  /** A DataTable column cell: text parts plus RowNote, the kit's muted sentence in a row's cell (Display.tsx), CellLines,
   *  the cell's parts stacked as lines (kit/data/cells), ProviderMark, a provider's mark before its name (an AI account's
   *  row), and ScaleBar, a plan's place beside the others (a plans table's AI row). */
  cell: ['IdChip', 'Ids', 'Code', 'CodeLine', 'StatusPill', 'Tag', 'Monogram', 'ComputerMark', 'Icon', 'Link', 'Kbd', 'Shortcut', 'AddressText', 'AddressRow', 'IpInfo', 'Spinner', 'When', 'Meter', 'ProgressCell', 'UnknownCell', 'Sparkline', 'ErrorDetails', 'FaqLink', 'ChatNames', 'ComputerLink', 'RowNote', 'CellLines', 'ProviderMark', 'ScaleBar'],
  /** ConversationView's usage and session panes: the conversation's own panels, nowhere else. */
  'conv-usage': ['UsageTab'],
  'conv-session': ['SessionView', 'SessionTab'],
  notices: ['Band', 'OutcomeBanner', 'Outcome', 'HeldBand', 'PauseBand'],
  /** A list-detail pane: `body` plus the states a pane shows (empty, first use, no access, error, loading) and the pane's own header, body and footer. */
  pane: [
    'SubSection',
    'ItemList',
    'ProblemList',
    'TileGrid',
    'ChoiceCards',
    'DataTable',
    'SettingGroup',
    'Facts',
    'StaticTable',
    'ActionCards',
    'StatStrip',
    'Form',
    'CodeBlock',
    'StepList',
    'Why',
    'Track',
    'Verdict',
    'Disclosure',
    'Visual',
    'Surface',
    'FilterChips',
    'Band',
    'OutcomeBanner',
    'Outcome',
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
  ],
  summary: [
    'Section',
    'SubSection',
    'Facts',
    'StatStrip',
    'ItemList',
    'ProblemList',
    'Link',
    'Disclosure',
    'Band',
    'OutcomeBanner',
    'Outcome',
  ],
  'side-card': [
    'Section',
    'SubSection',
    'Facts',
    'StatStrip',
    'ItemList',
    'ProblemList',
    'Link',
    'Disclosure',
    'Band',
    'OutcomeBanner',
    'Outcome',
    'AnatomySection',
  ],
  empty: ['EmptyState', 'FirstUseState', 'NoAccessState'],
  /** `text` without AddressRow (it renders an <li>). */
  'header-text': [
    'IdChip',
    'Ids',
    'Code',
    'CodeLine',
    'StatusPill',
    'Tag',
    'Monogram',
    'ComputerMark',
    'Icon',
    'Link',
    'Kbd',
    'Shortcut',
    'AddressText',
    'IpInfo',
    'Spinner',
    'When',
    'Meter',
    'ProgressCell',
    'UnknownCell',
    'Sparkline',
    'ErrorDetails',
    'FaqLink',
    'ChatNames',
    'ComputerLink',
  ] as const,
  /** `actions` without Fab (a fixed-position portal, not an inline header action). */
  'header-actions': [
    'FaqLink',
    'Button',
    'IconButton',
    'LinkButton',
    'TextButton',
    'ActionMenu',
    'ReasonButton',
    'ItemActions',
    'CopyButton',
    'QrButton',
    'PageLinkTo',
    'FileButton',
    'ActionBar',
  ] as const,
  /** The Composer's Talk entry beside Send. */
  'voice-mic': ['MicButton'] as const,
  /** The Talk bar that takes the Composer's action row while Talk is on. */
  'voice-bar': ['TalkBar'] as const,
  /** Live captions above the Composer's box. */
  'voice-captions': ['CaptionStrip'] as const,
  /** An ActionMenu's own trigger: the one kit button that opens it. */
  'menu-trigger': ['Button', 'IconButton'] as const,
  /** One control on a tab strip's row before or after the tabs: a menu of them, or a button (New tab). */
  'tabs-control': ['ActionMenu', 'Button', 'IconButton', 'TextButton', 'LinkButton', 'ReasonButton'] as const,
  /** A PickCard's mark: the letter mark only (aria-hidden; the title names the thing). */
  'card-mark': ['Monogram'] as const,
  /** A PickCard's end: its words ("Web page", "Opens Programs"; plain text is allowed, anatomy.cjs TEXT_SLOT_TYPES) or a kind
   *  word as a StatusPill (a Tag can carry a remove button or a tip: not here). */
  'card-tag': ['StatusPill'] as const,
  /** A PickCard's line, note and mono line: plain text plus the text pieces that can draw no control (no Tag, Link,
   *  AddressText, IdChip or anything with a button, tip or link). */
  'card-text': ['StatusPill', 'Monogram', 'ComputerMark', 'Icon', 'Kbd', 'Spinner'] as const,
  /** A CardGrid's card: one PickCard. */
  'pick-card': ['PickCard'] as const,
  /** Inside a field's border: words ("https://", a unit; plain text is allowed, anatomy.cjs TEXT_SLOT_TYPES), a small mark
   *  or status, or a compact control (an IconButton such as "Suggest another", a History menu). A button with words is the
   *  field's `action`, drawn after the box, never an affix. */
  'field-affix': ['IconButton', 'ActionMenu', 'StatusPill', 'Tag', 'Icon', 'Spinner', 'Kbd'] as const,
  /** The strip's end: a control as above, or a small count or status. */
  'tabs-end': ['ActionMenu', 'Button', 'IconButton', 'TextButton', 'LinkButton', 'ReasonButton', 'StatusPill', 'Tag', 'Spinner'] as const,
};

/** Kit parts that render in a portal, outside the slot they are written in, whose own code does not show it (AskAgentDrawer
 * renders the drawer its useAskAgent hook built). Beside its trigger in the same fragment such a part is not slot content;
 * alone, or used directly in a slot, it is judged like any part. */
export const PORTALS = ['AskAgentDrawer'] as const;
