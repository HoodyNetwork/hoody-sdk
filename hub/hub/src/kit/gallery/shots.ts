// Shots of the kit gallery (`bun run hub:shots --kit`): one per family plus each overlay open.
import type { Shots } from '../../app/shots.types';

export default [
  { name: 'actions' },
  // The button family in one frame each: every kind at every size and in every state; the marks and labels a button can
  // carry; the icon-only buttons. At 390 the matrix wraps and runs past the frame, so its state rows have their own shot.
  { name: 'buttons-d47', path: '?tab=actions&part=buttons', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'buttons-d47-states', path: '?tab=actions&part=button-states', extra: ['390-dark'] },
  { name: 'buttons-d47-marks', path: '?tab=actions&part=button-marks', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'buttons-d47-icons', path: '?tab=actions&part=icon-buttons', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'data', path: '?tab=data', waitForText: 'web-1' },
  { name: 'code-colours', path: '?tab=data', waitForText: 'web-1', click: 'role=region[name="Sample (python)"]' },
  { name: 'code-colours-shell', path: '?tab=data', waitForText: 'web-1', click: 'role=region[name="Sample (bash)"]' },
  // The install command is longer than the block at 390: it scrolls under nothing, the Copy button has its own column.
  { name: 'code-copy-column', path: '?tab=data', waitForText: 'web-1', click: 'role=region[name="Install command"]', extra: ['390-dark'] },
  { name: 'data-selected', path: '?tab=data', waitForText: 'web-1', click: 'css=tbody tr[data-index="2"]', keys: ['Space', 'j', 'Space'] },
  { name: 'forms', path: '?tab=forms' },
  // The QR surface open with the Hoody H (a public address) and with a Bot's B.
  { name: 'qr-open-h', path: '?tab=qr', click: 'role=button[name="QR code"] >> nth=1' },
  { name: 'qr-open-b', path: '?tab=qr', click: 'role=button[name="QR code"] >> nth=2' },
  // A keyed code wears the Key badge on top (the secret program address; Alt+Q opens it, s shows it).
  { name: 'qr-open-key', path: '?tab=qr', click: 'role=button[name="QR code"] >> nth=0', keys: ['s'] },
  { name: 'overlays', path: '?tab=overlays' },
  // Every toast tone with and without an action, a long title.
  { name: 'toasts', path: '?tab=toasts', extra: ['1350-light', '1350-dark', '390-dark'] },
  // Every control-spec cell, default and compact density (the compact panel is the page's second one).
  { name: 'controls', path: '?tab=controls' },
  // Every overlay state (Tab, Shift+Tab shows the initial focus ring on Cancel).
  { name: 'ov-drawer-sm', path: '?tab=overlays&open=drawer-sm' },
  { name: 'ov-drawer-md', path: '?tab=overlays&open=drawer-md' },
  { name: 'ov-drawer-lg', path: '?tab=overlays&open=drawer-lg' },
  { name: 'ov-drawer-dirty', path: '?tab=overlays&open=drawer-dirty', keys: ['Escape'] },
  { name: 'ov-drawer-pending', path: '?tab=overlays&open=drawer-pending' },
  { name: 'ov-drawer-busy', path: '?tab=overlays&open=drawer-busy' },
  { name: 'ov-drawer-sub', path: '?tab=overlays&open=drawer-sub' },
  { name: 'ov-confirm', path: '?tab=overlays&open=confirm', keys: ['Tab', 'Shift+Tab'] },
  { name: 'ov-danger-plain', path: '?tab=overlays&open=danger-plain', keys: ['Tab', 'Shift+Tab'] },
  { name: 'ov-danger', path: '?tab=overlays&open=danger' },
  { name: 'ov-rename', path: '?tab=overlays&open=rename' },
  { name: 'ov-forced', path: '?tab=overlays&open=forced' },
  { name: 'ov-confirm-pending', path: '?tab=overlays&open=confirm-pending' },
  { name: 'ov-menu', path: '?tab=overlays&menu=1' },
  { name: 'ov-menu-groups', path: '?tab=overlays&menu=groups' },
  { name: 'ov-popover', path: '?tab=overlays', click: 'Help' },
  { name: 'ov-picker', path: '?tab=overlays', click: 'Pick a computer' },
  // The States tab opens on its loading demos on purpose (skeletons stay): a *loading* shot.
  { name: 'states-loading', path: '?tab=states' },
  // C9 outcome banners alone; at 390 the pending one's Check again and close sit under its text.
  { name: 'states-outcomes', path: '?tab=states&part=outcomes', extra: ['1350-light', '1350-dark', '390-dark'] },
  // Bands, held bands and notices in every tone (the warning ones carry the hazard-stripe edge); the tab also holds the
  // skeleton demos, so a *loading* shot.
  { name: 'feedback-loading', path: '?tab=feedback', extra: ['1350-light', '1350-dark', '390-dark'] },
  // The same tab once drawn: the busy marks (Spinner, a busy Button, HoodyLoader sm / md / lg). It holds the skeleton
  // demos too, so it is a *loading* shot that waits for the loader's line.
  { name: 'feedback-loading-hoody', path: '?tab=feedback', act: [{ hover: 'text=Waiting for the assistant' }], extra: ['1350-light', '1350-dark', '390-dark'] },
  // CopyButton (read at press, disabled, md), Meter tones and busy, removable Tag.
  { name: 'pieces', path: '?tab=pieces', extra: ['1350-light', '1350-dark', '390-dark'] },
  // The Verdicts scrolled into view: a limited step wears the warning's hazard stripe, the marked phrase its underline.
  { name: 'pieces-verdict', path: '?tab=pieces', act: [{ hover: 'text=only commands and replies' }], extra: ['1350-light', '1350-dark', '390-dark'] },
  // The kit ComputerPicker open: search, rows with flag, state dot, place, realm and state; one row off with its reason.
  { name: 'pieces-computer-picker', path: '?tab=pieces', act: [{ click: 'role=button[name=/ Sample computer$/]' }, { waitFor: 'role=dialog[name="Sample computer"s]' }] },
  // A long realm name on a narrow trigger: the computer name gives way first, nothing leaves the field.
  { name: 'pieces-computer-picker-long', path: '?tab=pieces', act: [{ hover: 'role=button[name=/ Sample computer with a long realm$/]' }] },
  // The kit ProgramPicker open (groups, state dot and words, a description) and a ProjectPicker as a form
  // field (label, help, error).
  { name: 'pieces-program-picker', path: '?tab=pieces', act: [{ click: 'role=button[name=/ Sample program$/]' }, { waitFor: 'role=dialog[name="Sample program"s]' }] },
  { name: 'pieces-project-field', path: '?tab=pieces', act: [{ click: 'role=button[name=/ Project in a form$/]' }, { waitFor: 'role=dialog[name="Project in a form"s]' }] },
  // The ledger pieces alone (?part=ledgers). StaticTable: mono paths break after their separators at 390, one hash run
  // breaks anywhere. ActionCards: cards that are not a press, each with its title, line and actions.
  { name: 'pieces-static-table', path: '?tab=pieces&part=ledgers', act: [{ hover: 'role=table[name="Where each agent keeps its skills"]' }], extra: ['390-dark'] },
  { name: 'pieces-action-cards', path: '?tab=pieces&part=ledgers', act: [{ hover: 'role=list[name="Tools"] >> role=button >> nth=-1' }], extra: ['390-dark'] },
  // Every SegmentedControl reads as separate options in one framed tray; one option hovered.
  { name: 'nav-segmented', path: '?tab=nav', act: [{ hover: 'role=radio[name="Stopped"]' }] },
  // Tab strips at 390 scroll with a fade on the side that has more; labels are never cut.
  { name: 'nav-tabs-narrow', path: '?tab=nav', act: [{ hover: 'css=[data-shot="tabs-five"]' }] },
  // An editable tab's ⋯ menu open, and a tab renaming in place.
  { name: 'nav-tabs-edit-menu', path: '?tab=nav', act: [{ click: 'role=button[name="Tab actions: Overview"]' }, { waitFor: 'role=menu' }] },
  { name: 'nav-tabs-renaming', path: '?tab=nav', act: [{ click: 'css=[data-shot="tabs-editable"] [data-tab-id="run"]' }, { press: 'F2' }, { waitFor: 'role=textbox[name=/Rename/]' }] },
  // No ⋯ button; a tab's menu drops from that tab; the page's own menu starts the rename in place.
  { name: 'nav-tabs-buttonless-menu', path: '?tab=nav', act: [{ click: 'css=[data-shot="tabs-buttonless"] [data-tab-id="run"]' }, { press: 'Shift+F10' }, { waitFor: 'role=menu[name="Tab actions: Run"]' }] },
  { name: 'nav-tabs-buttonless-rename', path: '?tab=nav', act: [{ click: 'role=button[name="Views menu"]' }, { click: 'role=menuitem[name=/Rename the open view/]' }, { waitFor: 'role=textbox[name=/Rename Overview/]' }] },
  { name: 'forms-state-dirty', path: '?tab=secure&part=states&state=dirty' },
  { name: 'forms-state-busy', path: '?tab=secure&part=states&state=busy' },
  { name: 'forms-state-pending', path: '?tab=secure&part=states&state=pending', waitForText: 'Outcome unknown' },
  { name: 'forms-state-failed', path: '?tab=secure&part=states&state=failed' },
  { name: 'forms-state-refused-detail', path: '?tab=secure&part=states&state=refused', waitForText: 'Pick a different one' },
  { name: 'forms-state-done', path: '?tab=secure&part=states&state=done' },
  { name: 'forms-sections', path: '?tab=secure&part=section' },
  { name: 'forms-secrets', path: '?tab=secure&part=secrets' },
  { name: 'forms-secrets-shown', path: '?tab=secure&part=secrets', click: 'Show codes' },
  { name: 'forms-otp', path: '?tab=secure&part=otp' },
  { name: 'forms-fields', path: '?tab=secure&part=fields', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'forms-fields-theme', path: '?tab=secure&part=fields', click: 'Theme' },
  // A setting row with its written form on a mono line under the help, in a group and on a switch row.
  { name: 'forms-setting-code', path: '?tab=groups', act: [{ hover: 'css=[data-sg-demo="code"]' }], extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'forms-editor', path: '?tab=secure&part=editor' },
  { name: 'forms-editor-find', path: '?tab=secure&part=editor', click: 'css=textarea', keys: ['Control+f', 'n', 'a', 'm', 'e'] },
  { name: 'layout-settings', path: '?layout=settings', extra: ['1024-light'] },
  { name: 'layout-settings-security', path: '?layout=settings&section=security' },
  { name: 'layout-dashboard', path: '?layout=dashboard', extra: ['1024-light', '1440-dock'] },
  { name: 'layout-wizard', path: '?layout=wizard&step=region', extra: ['1024-light'] },
  // The page FAQ at rest, a question landed through its FaqLink, and the Join dialog with its FaqLink peek open.
  { name: 'layout-faq', path: '?layout=faq', extra: ['1024-light'] },
  { name: 'layout-faq-landed', path: '?layout=faq', act: [{ click: 'role=link[name=/What is the rate\\?/]' }] },
  // The shared rail beside the page (head, places with the nested screen list, list, foot, handle), and as the whole screen.
  { name: 'layout-rail', path: '?layout=rail', extra: ['1024-light'] },
  { name: 'layout-rail-strip', path: '?layout=rail&strip=1' },
  { name: 'layout-faq-peek', path: '?layout=faq', act: [{ click: 'role=button[name="Join"]' }, { click: 'role=button[name=/Why are payouts held/]' }] },
  // Tables, data view states, list presentation, both list/detail modes.
  { name: 'tbl-full', path: '?tab=table', waitForText: 'borealis' },
  { name: 'tbl-filtered', path: '?tab=table&gstate=running&gserver=n12,fra-7&gsort=-name', waitForText: 'borealis' },
  { name: 'tbl-nomatch', path: '?tab=table&gq=zzz', waitForText: 'Clear filters' },
  // Column meta wraps: a sentence and a run with no break point take the lines they need; the one-line row keeps its height.
  { name: 'tbl-cellwraps', path: '?tab=table', waitForText: 'borealis', act: [{ hover: 'css=[data-shot="cell-wraps"] >> role=columnheader[name="Note"]' }], extra: ['1350-dark'] },
  // The keyboard-active row's inset ring (a click on a plain cell, then j moves the active row).
  { name: 'tbl-hover', path: '?tab=table', waitForText: 'borealis', click: 'css=tbody tr[data-index="1"] >> text=Frankfurt', keys: ['j'] },
  // Two picked rows and the bulk bar. Keys, not the checkbox: list presentation (768, 390) shows no checkbox until a pick.
  { name: 'tbl-select', path: '?tab=table', waitForText: 'borealis', click: 'css=tbody tr[data-index="1"] >> text=Frankfurt', keys: ['x', 'k', 'x'] },
  // The refresh bar sits on the table panel's top edge (.wrap is the positioned ancestor).
  { name: 'tbl-refreshing', path: '?tab=table&gfetch=1', waitForText: 'borealis' },
  { name: 'tbl-narrow', path: '?tab=table', waitForText: 'borealis', click: 'role=radio[name="620"]' },
  { name: 'tbl-viewmenu', path: '?tab=table', waitForText: 'borealis', click: 'role=button[name="View options"]' },
  // One active chip; the active row in list presentation (390) and table (1440).
  { name: 'tbl-onechip', path: '?tab=table&gstate=running', waitForText: 'borealis' },
  { name: 'tbl-active', path: '?tab=table&gsel=borealis', waitForText: 'borealis' },
  { name: 'tbl-side', path: '?layout=list-side&sel=borealis', extra: ['1024-light'] },
  { name: 'tbl-fill', path: '?layout=list-fill&sel=atlas', extra: ['1024-light'] },
  { name: 'tbl-fill-none', path: '?layout=list-fill' },
  // Model chooser: one state per page, the views opened by acting from the Ready view.
  { name: 'models-free', path: '?tab=models&mc=free', waitForText: 'Ready to use' },
  { name: 'models-three', path: '?tab=models&mc=three', waitForText: 'Ready to use' },
  { name: 'models-ready-failed', path: '?tab=models&mc=readyFailed', waitForText: 'Try again' },
  { name: 'models-catalogue-failed', path: '?tab=models&mc=catFailed', waitForText: 'Open the AI page' },
  { name: 'models-directory', path: '?tab=models&mc=dir', act: [{ click: 'role=button[name="Set up a provider"]' }, { waitFor: 'role=heading[name="Other ways"]' }] },
  { name: 'models-connect', path: '?tab=models&mc=connect', waitForText: 'Other ways' },
  { name: 'models-drill-598-p2', path: '?tab=models&mc=drill', act: [{ fill: 'role=searchbox', text: 'nanogpt' }, { click: 'role=button[name=/^NanoGPT/]' }, { click: 'role=navigation[name="NanoGPT models pages"] >> role=button[name="Next"]' }, { waitFor: 'text=101–200 of 598' }] },
  { name: 'models-search-gpt', path: '?tab=models&mc=search', act: [{ fill: 'role=searchbox', text: 'gpt' }, { waitFor: 'role=group[name=/^Ready /]' }] },
  { name: 'models-consent', path: '?tab=models&mc=consent', act: [{ click: 'css=[role=option][data-spec^="mistral/"] >> nth=0' }, { waitFor: 'role=button[name="Use it anyway"]' }] },
  { name: 'models-agent-default', path: '?tab=models&mc=agent', waitForText: 'Ready to use' },
  { name: 'models-loading', path: '?tab=models&mc=loading', waitForText: 'Checking models…' },
  { name: 'models-legacy', path: '?tab=models&mc=legacy', waitForText: 'Ready to use' },
  // Model chooser with setup: the setup step per kind, then the attempt's results.
  { name: 'chooser-setup-key', path: '?tab=chooser&ch=key', act: [{ click: 'role=button[name="Set up Anthropic"]' }, { waitFor: 'role=heading[name=/^Set up Anthropic to use/]' }] },
  { name: 'chooser-setup-chatgpt', path: '?tab=chooser&ch=chatgpt', act: [{ click: 'role=button[name="Set up OpenAI"]' }, { waitFor: 'role=radiogroup' }] },
  { name: 'chooser-setup-openrouter', path: '?tab=chooser&ch=openrouter', act: [{ click: 'role=button[name="Set up OpenRouter"]' }, { waitFor: 'role=radiogroup' }] },
  { name: 'chooser-setup-endpoint', path: '?tab=chooser&ch=endpoint', act: [{ click: 'role=button[name="Set up My endpoint"]' }, { waitFor: 'role=button[name="Check and save"]' }] },
  { name: 'chooser-confirming', path: '?tab=chooser&ch=confirming', act: [{ click: 'role=button[name="Set up Anthropic"]' }, { fill: 'css=[data-chooser] input[type="password"]', text: 'sk-sample' }, { click: 'role=button[name="Check and save"]' }, { waitFor: 'text=Key saved. Checking Anthropic…' }] },
  { name: 'chooser-unconfirmed', path: '?tab=chooser&ch=unconfirmed', act: [{ click: 'role=button[name="Set up Anthropic"]' }, { fill: 'css=[data-chooser] input[type="password"]', text: 'sk-sample' }, { click: 'role=button[name="Check and save"]' }, { waitFor: 'role=button[name="Check again"]' }] },
  { name: 'chooser-still-needs', path: '?tab=chooser&ch=still', act: [{ click: 'role=button[name="Set up Anthropic"]' }, { fill: 'css=[data-chooser] input[type="password"]', text: 'sk-sample' }, { click: 'role=button[name="Check and save"]' }, { waitFor: 'text=Anthropic still needs setup.' }] },
  // The load screen tab (kit/states/LoadScreen): its specimens on one page.
  { name: 'loadscreen', path: '?tab=loadscreen', waitForText: 'Setting up your workspace', extra: ['390-dark'] },
] satisfies Shots;
