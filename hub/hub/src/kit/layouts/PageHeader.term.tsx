// The page header in the terminal: breadcrumbs (folded to "‹ Parent" when narrow), the title line with its meta, the
// actions and the primary on the end side (they move under the title when the row cannot hold both), then the
// subtitle and the context line, each one flowing line of text and links (never one block per piece).
import { useRef, useState, type ReactNode } from 'react';
import type { BoxRenderable } from '../../term/prim/otui';
import type * as Web from './PageHeader';
import { Button } from '../controls/Button';
import { Link } from '../controls/Link';
import { Box, Text, usePaneSize } from '../../term/prim';
import { HeaderPanelSlot, Inline, useTermSize } from './termParts';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { NARROW_COLS, SHORT_ROWS } from './termBreaks';
import { useReportPageHeader } from '../../term/shell/headerShown';

export type { Crumb, PrimaryAction, PageHeaderProps, ToolbarSize } from './PageHeader';

export const Breadcrumbs: typeof Web.Breadcrumbs = ({ items }) => {
  // Folds by the room the header has (its pane), as the web folds by the header's own width.
  const { cols: width } = usePaneSize();
  const t = useStrings(kitStrings);
  if (width < NARROW_COLS) {
    // As the web's phone row: only the way back up, "‹ Parent".
    const parent = [...items.slice(0, -1)].reverse().find((c) => c.href);
    if (!parent) return <></>;
    return <Box dir="row" sem={{ role: 'list', name: t('breadcrumbs') }}><Link href={parent.href!}>{`‹ ${parent.label}`}</Link></Box>;
  }
  return (
    <Box dir="row" gap={0} wrap sem={{ role: 'list', name: t('breadcrumbs') }}>
      {items.map((c, i) => (
        <Box key={`${i}-${c.label}`} dir="row">
          {c.href && i < items.length - 1 ? <Link href={c.href}>{c.label}</Link> : <Text colour="muted" truncate>{c.label}</Text>}
          {i < items.length - 1 && <Text colour="faint"> › </Text>}
        </Box>
      ))}
    </Box>
  );
};

export const PrimaryButton: typeof Web.PrimaryButton = ({ action, quiet = false }) => (
  <Button variant={quiet ? 'secondary' : 'primary'} icon={action.icon} onPress={action.onPress} isDisabled={action.isDisabled} disabledReason={action.disabledReason} busy={action.busy}>{action.label}</Button>
);
/** The web floats it over the page (a portal); a terminal has no layer to float in, so it is the same button in place. */
export const Fab: typeof Web.Fab = ({ action }) => <PrimaryButton action={action} /> as ReturnType<typeof Web.Fab>;

export const PageHeader: typeof Web.PageHeader = ({ title, subtitle, context, meta, breadcrumbs, actions, menu, primary, leading, size = 'md', primaryQuiet = false, tabsFollow = false }) => {
  const root = useRef<BoxRenderable>(null);
  useReportPageHeader(root);
  const { height } = useTermSize();
  // What an action opened in place (HeaderPanelSlot): drawn under the title row, so the actions keep their row.
  const [panel, setPanel] = useState<ReactNode>(null);
  // The page's ⋯ (web PageHeader `menu`): last on the end side, after the primary, as on the web's one-line row.
  const end: ReactNode = (actions || primary || menu) ? (
    // Never wider than the header (maxWidth): an action that opens in place (AgentHint's panel) wraps inside it, where a
    // content-sized end ran past the screen (Vault 80x24: 103 cells in 78; Scripts 120x40: 108 in 100).
    <Box dir="row" gap={2} shrink={0} maxWidth="100%" align="center">
      <HeaderPanelSlot.Provider value={setPanel}>{actions}</HeaderPanelSlot.Provider>
      {primary && <PrimaryButton action={primary} quiet={primaryQuiet} />}
      {menu}
    </Box>
  ) : null;
  return (
    // A short terminal gives the header no blank row under it; the content needs the line more. A tab strip right under
    // the header (tabsFollow) closes it, so no blank row either.
    <Box boxRef={root} dir="column" shrink={0} pad={!tabsFollow && (height >= SHORT_ROWS || size === 'lg') ? { bottom: 1 } : undefined}>
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      {/* Title and end side wrap: when they do not fit one row, the actions take the row under the title (web: stacked).
          gapX: the gap along the line only; no gapY, so a wrapped row sits right under the title (headerWrap.term.test.tsx). */}
      <Box dir="row" wrap gapX={2} justify="between" align="start">
        {/* The meta wraps too: one that does not fit beside the title (billing's compact ErrorState) takes the rows
            under it instead of squeezing the title to nothing (a wrapping line breaks on each part's own width before
            anything shrinks). maxWidth bounds the row so it can wrap at all (a content-sized row never does). */}
        <Box dir="row" wrap gapX={2} shrink={1} maxWidth="100%" align="center">
          {leading}
          {typeof title === 'string' || typeof title === 'number'
            ? <Text bold colour="ink" sem={{ role: 'heading', level: 1, name: String(title) }}>{String(title)}</Text>
            : <Box sem={{ role: 'heading', level: 1 }}>{title}</Box>}
          {meta}
        </Box>
        {end}
      </Box>
      {panel}
      {size !== 'sm' && subtitle !== undefined && subtitle !== null && subtitle !== false && <Inline>{subtitle}</Inline>}
      {size !== 'sm' && context !== undefined && context !== null && context !== false && <Inline>{context}</Inline>}
    </Box>
  );
};

export const toolbarSizeProps: typeof Web.toolbarSizeProps = (size) => ({ 'data-tb-size': size === '32' ? '32' : 'default' });
export const ToolbarScope: typeof Web.ToolbarScope = ({ children }) => <>{children}</>;
export const Toolbar: typeof Web.Toolbar = ({ start, end, notice, label }) => (
  <Box dir="column" shrink={0}>
    <Box dir="row" gapX={2} justify="between" wrap sem={{ role: 'group', ...(label ? { name: label } : {}) }}>
      {/* The start side grows into the free room from its own width, as the web's (.toolbarStart: flex 1 1 auto): a
          group a page pushes to the start's end (Logs: Live, Refresh, ⋯ with margin-inline-start: auto) reaches the row's
          end. Content-sized, it stopped where the controls did (column 200 of 320). */}
      {/* It grows but does not shrink: the engine gives the one item that both grows and shrinks a basis of 0 (Yoga's
          single-flex-child shortcut), so beside an end part that did not fit it was squeezed to a few cells and wrapped
          over three rows instead of the end part moving under it. Capped at the row's width, a start wider than the
          row still wraps inside it. */}
      <Box dir="row" gapX={2} grow={1} shrink={0} maxWidth="100%" wrap align="center">{start}</Box>
      {end && <Box dir="row" gap={2} align="center">{end}</Box>}
    </Box>
    {notice && <Inline>{notice}</Inline>}
  </Box>
);
