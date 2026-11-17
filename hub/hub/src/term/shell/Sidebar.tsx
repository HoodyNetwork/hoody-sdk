// The terminal sidebar: the web Sidebar's entries, groups, labels and badges (shell/Sidebar.tsx, shell/nav.ts). Groups
// in NAV_PLACE order; Build is titled by the computer shown ("On ada-box ▾", a press opens the computer switcher, as
// the web's), Account by its name; the foot holds Rent servers and the Help pages. The current page is marked with
// ▌ and bold on the accent plate in its ink (the web's current item); the focused row is drawn on the blue fill with
// a › mark, so neither reads by colour alone; a plain row under the pointer stands on the `hover` ground (truecolor only). Either plate fills the whole row, up to the rule. The rule beside the list is drawn by a plain box (never the scroll
// box's focus border). The column stands on the sidebar ground (`side`), a step from the page's, where the Hub paints
// grounds (tokens.ts ground).
import type { NavGroup, PageManifest } from '@kit/page';
import { makeT, useStrings } from '@kit/strings';
import { countText, useShellData } from '../../shell/context';
import { navEntries } from '../../shell/nav';
import { usePageLink } from '../../shell/pageLinks';
import { openComputerSwitcher, useComputerSwitcherReady } from '../../shell/Switchers';
import shellStrings from '../../shell/strings.en.json';
import { Box, ground, Pressable, Scroll, Text } from '../prim';
import { focusMark } from '../prim/FocusInk';

/** Wide enough for the longest label and a badge. */
export const SIDEBAR_COLS = 24;
const GROUPS: readonly NavGroup[] = ['main', 'build', 'account'];

export const navLabel = (p: PageManifest): string => makeT(p.strings)(p.nav?.label ?? p.title);

/** A group's title as the web's sidebar gives it (none for main). */
export function useGroupLabel(): (g: NavGroup) => string | undefined {
  const t = useStrings(shellStrings);
  const data = useShellData();
  const computer = data.computers.find((c) => c.id === data.computerId);
  return (g) => (g === 'main' || g === 'help' ? undefined : g === 'build' ? (computer ? t('nav.group.buildOn', { name: computer.name }) : t('nav.group.buildNone')) : t('nav.group.account'));
}

/** The sidebar badge of a page, as text with its meaning in words (never a dot alone). The narrow page list
 *  (Menus.tsx NavMenu) shows the same badge: below SIDEBAR_MIN_COLS it is the only place the count is. */
export function useBadge(): (p: PageManifest) => string | undefined {
  const data = useShellData();
  return (p) => {
    if (p.id === 'bots' && (data.botsWaiting ?? 0) > 0) return countText(data.botsWaiting ?? 0, !!data.botsWaitingAtLeast);
    if (p.id === 'notifications' && (data.unread ?? 0) > 0) return countText(data.unread ?? 0, data.unreadCapped);
    return undefined;
  };
}

function Item({ label, current, badge, onPress }: { label: string; current: boolean; badge?: string; onPress: () => void }) {
  return (
    <Pressable dir="row" height={1} onPress={onPress}>
      {({ focused, hovered }) => {
        // The plate is the row's, not the words': the whole row is filled to the rule (a plate under the label alone
        // left a ragged right edge, a different width on every page).
        // Under the pointer a plain row stands on the `hover` ground: its words, mark and badge stay as they are, and the
        // focused and the current row keep their own plates.
        const plate = focused ? 'blue' : current ? 'acc' : hovered ? 'hover' : undefined;
        return (
          <Box dir="row" height={1} grow={1} bg={plate}>
            <Text colour={focused ? 'blueInk' : current ? 'accInk' : 'ink'} bg={plate} bold={current} truncate grow={1}>
              {(focused ? '›' : current ? '▌' : ' ') + label}
            </Text>
            {badge && <Text colour={focused ? 'blueInk' : current ? 'accInk' : 'warn'} bg={plate}>{` ${badge} `}</Text>}
          </Box>
        );
      }}
    </Pressable>
  );
}

export function Sidebar({ pages, current, go }: { pages: readonly PageManifest[]; current: string | undefined; go: (to: string) => void }) {
  const t = useStrings(shellStrings);
  const entries = navEntries(pages);
  const label = useGroupLabel();
  const badge = useBadge();
  const data = useShellData();
  const canSwitch = useComputerSwitcherReady() && data.computers.length > 0;
  const rent = usePageLink('market');
  const help = entries.filter((e) => e.group === 'help').map((e) => e.page);
  return (
    <Box dir="row" width={SIDEBAR_COLS} shrink={0} bg={ground('side')}>
      <Scroll dir="column" grow={1} followFocus>
        {GROUPS.map((g) => {
          const list = entries.filter((e) => e.group === g).map((e) => e.page);
          if (list.length === 0) return null;
          const title = label(g);
          return (
            <Box key={g} dir="column" pad={{ bottom: 1 }}>
              {title && g === 'build' && canSwitch ? (
                <Pressable dir="row" height={1} onPress={openComputerSwitcher}>
                  {({ focused }) => <Text colour={focused ? 'blueInk' : 'faint'} bg={focused ? 'blue' : undefined} truncate {...focusMark(focused)}>{title + ' ▾'}</Text>}
                </Pressable>
              ) : (
                title && <Text colour="faint" truncate>{title}</Text>
              )}
              {list.map((p) => <Item key={p.id} label={navLabel(p)} current={p.id === current} badge={badge(p)} onPress={() => go(p.path)} />)}
            </Box>
          );
        })}
        {(rent || help.length > 0) && (
          <Box dir="column">
            {rent && <Item label={'+ ' + t('nav.rent')} current={current === 'market'} onPress={() => go(rent.href)} />}
            {help.map((p) => <Item key={p.id} label={navLabel(p)} current={p.id === current} badge={badge(p)} onPress={() => go(p.path)} />)}
          </Box>
        )}
      </Scroll>
      {/* The rule: its own box, so a click in the list never paints it in the focus colour. */}
      <Box width={1} border={['left']} borderColour="line" />
    </Box>
  );
}
