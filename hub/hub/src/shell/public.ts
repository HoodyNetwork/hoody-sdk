// The shell's page-facing API, re-exported by '@kit' (pages never import '@shell').
export { useShellData, type ShellData, type ShellRealm, type ShellComputer } from './context';
export { useContributions, type Contributions, type WidgetContribution, type GuideTopicContribution, type TileViewContribution } from './contributions';
export { NotifyHint, type NotifyHintProps } from './notify/NotifyHint';
export { notifyAlert, type NotifyAlertInfo } from './notify/alert';
export { useShortcuts, type ShortcutGroup, type ShortcutRow } from './shortcuts';
export { showBootPanel } from './notices';
export { countText } from './context';
export { usePageVisible, usePageLink, useServedPageLink, followPageLink, type PageLink } from './pageLinks';
export { HeldFromLink, type HeldFromLinkProps } from './HeldFromLink';
export { usePageShortcuts, type PageShortcut } from './pageShortcuts';
export { ComputerRequired, type ComputerRequiredProps } from './ComputerRequired';
export { useChromeHidden, type ChromeHiddenOptions } from './chrome';
export { useKeepPage, usePageShown } from './pageHost';
export { openShortcutsSheet } from './shortcutsOpen';
export { pageShortcutId, type PageShortcutMod } from './pageShortcuts';
