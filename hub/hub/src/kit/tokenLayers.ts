// The three token layers of kit/tokens.css, by name. An entry ending in `*` is a
// prefix; any other entry is one exact name. Every declared token matches exactly one entry (tokenLayers.test.ts).
//   primitive: raw values (palette colours, scales). Read by the kit and the shell look owners.
//   role:      meanings (type roles, tones, ink and lines, spacing roles, elevation). Read by the kit and the shell
//              look owners; consumer CSS reads only the spacing and z roles.
//   component: kit-private values, read only by the kit part that owns them (the shell frame also reads --hx-nav-*
//              and --hx-app*).

export type TokenLayer = 'primitive' | 'role' | 'component';

export const TOKEN_LAYERS: Readonly<Record<TokenLayer, readonly string[]>> = {
  primitive: [
    '--hx-r-*',
    '--hx-code-*',
    '--hx-blue',
    '--hx-blue-shade',
    '--hx-acc',
    '--hx-ok',
    '--sp-*',
    '--fs-*',
    '--fw-*',
    '--lh-*',
    '--font-*',
    '--r-*',
    '--bw*',
    '--dur-0',
    '--dur-1',
    '--dur-2',
    '--dur-3',
    '--dur-4',
    '--ease-*',
    '--z-*',
    '--bp-*',
  ],
  role: [
    '--t-*',
    '--dur-press',
    '--dur-hover',
    '--dur-enter',
    '--dur-exit',
    '--dur-loop',
    '--dur-pulse',
    '--dur-blink',
    '--hx-acc-*',
    '--hx-ok-*',
    // --hx-warn/--hx-danger/--hx-info resolve to their role inks (var(--hx-warn-text) ...), so they are roles.
    '--hx-warn',
    '--hx-warn-*',
    '--hx-danger',
    '--hx-danger-*',
    '--hx-notice-*',
    '--hx-stripe-gap', // the dark band of the warning stripe (--hx-warn-stripe), a role beside it
    '--hx-info',
    '--hx-info-*',
    '--hx-blue-text',
    '--hx-blue-hover',
    '--hx-blue-t2',
    '--hx-bg',
    '--hx-card',
    '--hx-raised',
    '--hx-sidebar',
    '--hx-fill',
    '--hx-hover',
    '--hx-press',
    '--hx-scrim',
    '--hx-frame',
    '--hx-grey*',
    '--hx-dim',
    '--hx-faint',
    '--hx-heading',
    '--hx-ink',
    '--hx-muted*',
    '--hx-line*',
    '--hx-scroll-thumb', // every scroller's thumb (kit base.css)
    '--hx-scroll-thumb-hover', // the same thumb under the pointer
    '--hx-rule',
    '--hx-tile-fill',
    '--hx-link*',
    '--hx-do-*',
    '--hx-focus',
    '--hx-selected*',
    '--hx-on-*',
    '--hx-input-*',
    '--hx-panel-*',
    '--hx-sec-*',
    '--hx-swatch-*',
    '--focus-ring*',
    '--ring-gap',
    '--gap-*',
    '--tracking-*',
    '--case-*',
    '--sh-*',
    '--measure',
    '--pad-surface*',
    '--pad-row-*',
    '--pad-page',
    '--pad-menu',
    '--pad-drawer',
    '--surface-inset',
  ],
  component: [
    '--btn-*',
    '--ctl-*',
    '--touch-*',
    '--hit-*',
    '--row-h*',
    '--table-row-h',
    '--tile-head-h', // the Board tile head (the small control plus its line)
    '--strip-btn', // a Board strip icon button's drawn width
    '--xs-press-out', // how far an xs control's press reaches out of its box (0 with a mouse)
    '--xs-press-h', // the whole height of an xs control's press (its box plus the reach each way)
    '--group-row-h*',
    '--pad-card*',
    '--card-*',
    '--pop-*',
    '--pane-*',
    '--hx-btn-*',
    '--hx-bubble-*',
    '--hx-count-line', // the accent CountBadge's edge (a grey line under the chalk highlight in light)
    '--hx-cc-*',
    '--hx-tag-*',
    '--hx-nav-*',
    '--hx-section-*', // the kit SectionMenu (SettingsPage rail, Guide index)
    '--hx-app*',
    '--hx-field-*', // the toolbar field look (DataTable toolbar, Button size="toolbar")
    '--hx-faq-*', // the Questions well (kit/layouts/Faq)
    '--hx-switch-*',
    '--hx-meter-*', // the kit Meter's ten blocks
    '--hx-card-rail*', // the kit DataTable's rail card (tint and dashed divider)
    '--hx-ledger-*', // the kit DataTable ledger (lines="dashed"): row line, head line, head fill
    '--dt-mark-*', // the kit DataTable row mark (rowMark): bar width, bar and wash per tone
    '--hx-folder-*',
    '--hx-tog-*',
    '--hx-topbar-*', // the top bar's search fill, picker fill and zone hairline
    '--hx-plate-*', // the Guide Connect rail plate
    '--hx-codeline-*', // the kit step code line and its copy cell
    '--hx-verdict-*', // the Verdict state plate, light and dark
    '--hx-plan-*', // the billing plan cards, their frame, edge, well and field
    '--hx-table-*', // the plan comparison table's head fill, strong line and stripe
    '--hx-rail-tile-*', // the rail tile's current frame, fill and text
    '--hx-start-cell-*', // the start strip's cell line
    '--head-row-h', // a page or section head row's height (the kit layouts)
    '--scrollbar-*', // the scroller's track size and inset (kit base.css)
    '--table-cut*', // the cut corner of a kit table frame and the room it clears
    '--auth-card-w', // the widest a sign-in card grows (the one-file Hub's card)
    '--bar-*',
    '--bell-*',
    '--bottom-nav-*',
    '--brand-h', // the Hoody Hub logo's height (kit BrandMark sm)
    '--codeline-*', // the step code line's height and copy cell width
    '--col-*',
    '--content-*',
    '--detail-*',
    '--dialog-*',
    '--drawer-*',
    '--fab-*',
    '--field-*',
    '--flow-*', // WizardPage variant="flow": the side card width and the page block cap
    '--form-*',
    '--icon-*',
    '--kbd-*',
    '--option-row-h', // a ModelChooser option row
    '--picker-*',
    '--plate-*', // the rail plate's sizes
    '--track-node', // a Track step's node and the spine's column
    '--popover-*',
    '--rail-*',
    '--rc',
    '--safe-*',
    '--savebar-*',
    '--search-*',
    '--section-*',
    '--setting-*',
    '--sidebar-*',
    '--skeleton-*',
    '--stat-*',
    '--stepper-*',
    '--strip-more-w', // a scrolling strip's chevron
    '--summary-*',
    '--swatch', // a ColorPicker swatch
    '--switch-*',
    '--tabs-*',
    '--tb-*', // a toolbar control's height (--tb-ctl-h)
    '--tag-h', // a StatusPill or Tag box's height
    '--th-*',
    '--toast-*',
    '--tog-*',
    '--toggle-box', // the Checkbox box and Radio dot
    '--toolbar-*',
    '--topbar-*',
    '--wizard-*',
    '--viewer-h-*', // MarkdownViewer and CodeBlock scroll heights
  ],
};

/** The entries of TOKEN_LAYERS that `name` matches, with their layer. */
export function tokenLayerMatches(name: string): { layer: TokenLayer; entry: string }[] {
  const out: { layer: TokenLayer; entry: string }[] = [];
  for (const layer of Object.keys(TOKEN_LAYERS) as TokenLayer[]) {
    for (const entry of TOKEN_LAYERS[layer]) {
      const hit = entry.endsWith('*') ? name.startsWith(entry.slice(0, -1)) : name === entry;
      if (hit) out.push({ layer, entry });
    }
  }
  return out;
}
