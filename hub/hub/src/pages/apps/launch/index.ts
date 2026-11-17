// The launcher's public entry. Other pages reach it only through links.ts loadLauncher() (the page boundary
// lets them import links.ts alone), e.g. lazy(() => loadLauncher().then((m) => ({ default: m.AppLauncher }))).
//   - AppsSection: the Apps tab of Programs (the apps opened on demand, and Launch an app).
//   - AppLauncher: Launch an app in a narrow panel (the Board's Add a program), handing back a Placement.
//   - LaunchHold: wraps a Board tile placed for a launch not proven yet ("may still be starting", Check).
//   - TileHold: LaunchHold from the Board's own computer row and tile record (the Board's one-line mount).
//   - Open with (Files launches): planFor/toLaunch are the only way to a Files launch request;
//     useOpenWith starts one (claim, list, send); wordsFor says what its row says; rememberable gates the remembered
//     choice; the template table and its default order feed the chooser.
// Loaded on demand, so the run code stays out of the Board's and Programs' first chunk. links.ts re-exports the
// Placement type.
export { AppsSection, type AppsSectionProps } from './AppsSection';
export { AppLauncher, type AppLauncherProps } from './AppLauncher';
export { LaunchHold, type LaunchHoldProps } from './LaunchHold';
export { TileHold, type TileHoldProps } from './TileHold';
export { placeOfTile, useLaunchHeld, type AnyTile, type HoldComputer, type HoldTile } from './match';
export type { Placement } from './placement';
export { planFor, rememberable, toLaunch, type Entry, type LaunchPlan, type Launcher, type PlanInput, type PlanReason, type ScriptPlan } from './openWith/plan';
export { launchablePath, type PathReason } from './openWith/argv';
export { DEFAULT_ORDER, TEMPLATES, templateById, type FileKind, type Template, type TemplateId } from './openWith/templates';
export { owText, wordsFor, type Words } from './openWith/facts';
export { removeUnlisted } from './openWith/ledger';
export { useOpenWith, type OwOutcome, type StartOpts } from './openWith/useOpenWith';
