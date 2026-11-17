// The Hub kit: the only UI library pages use. Pages import from '@kit' and never from
// react-aria-components or TanStack directly (hub/eslint.config.js).
export { definePage, hidesTail, matchScreen } from './page';
export type { PageManifest, PageScreen, ScreenMatch, PageLayout, PageStatus, PageCommand, PageWidget, PageGuideTopic, PageTileView, NavGroup, NavCount, PageNavCount, PageSearchHide, SearchHide } from './page';

export { useStrings, useStringParts, makeT, interpolate, LOCALE } from './strings';
export type { PartVars } from './strings';
export { useNow } from './useNow';
export type { StringTable, StringKey, StringVars, Translate } from './strings';
export * from './format';

export { Icon, ICON_NAMES } from './icons';
export type { IconName } from './icons';

export { Button, IconButton, LinkButton, cx } from './controls/Button';
export type { ButtonProps, IconButtonProps, LinkButtonProps, ButtonVariant, ButtonSize, ButtonTone } from './controls/Button';
export { SR_ONLY } from './controls/SrOnly';
export { CountBadge } from './controls/CountBadge';
export type { CountBadgeProps } from './controls/CountBadge';
export { Kbd } from './controls/Kbd';
export { Link, ExtLink, autolink } from './controls/Link';

export { useSearch, useSearchParam, usePathname, useLocationHash, useGo, useHiddenNow, useLiveLocation, useLiveRoute, useLocationEntry, useSubPath } from './nav';
export { useRenameRealms, type OpenRenameRealms } from './realmRename';

export { Skeleton, EmptyState, ErrorState, OutcomeBanner, Spinner } from './states/States';
export { HoodyLoader, type HoodyLoaderProps } from './states/HoodyLoader';
export { LoadScreen, type LoadAsk, type LoadCard, type LoadScreenProps, type LoadStage, type LoadStageState } from './states/LoadScreen';
export { ActionCards, type ActionCard, type ActionCardsProps } from './data/ActionCards';
export { StaticTable, type StaticTableColumn, type StaticTableProps, type StaticTableRow } from './data/StaticTable';
export { Ledger, ShortcutTable, type LedgerProps, type LedgerRow, type ShortcutTableGroup, type ShortcutTableProps, type ShortcutTableRow } from './data/Ledger';
export type { OutcomeKind, OutcomeLike } from './outcome';

export { PageHeader, Toolbar, ToolbarScope, Breadcrumbs } from './layouts/PageHeader';
export { ContentRegion } from './layouts/ContentRegion';
export type { PageHeaderProps, Crumb, ToolbarSize } from './layouts/PageHeader';
export { Stack, Row } from './layouts/Stack';
export { PageBlock } from './layouts/PageBlock';
export type { StackProps, RowProps } from './layouts/Stack';
export { PaneSeparator, useElementWidth, usePaneWidth, type PaneRange } from './layouts/PaneSeparator';
export { RailFoot, RailFrame, RailNav, RailPane, RailSubnav, type RailFootProps, type RailFrameProps, type RailNavItem, type RailPaneProps, type RailSubnavItem } from './layouts/RailPane';
export { SectionMenuItem, SectionMenuList, type SectionMenuItemProps } from './layouts/SectionMenu';
export { CutFrame, cutFramePath, type CutFrameProps } from './layouts/CutFrame';
export { CARD_CUT, CardEdge, CardScope, cutRingPath, useCardCut } from './layouts/CardEdge';
export { ListDetailPage, useSelection } from './layouts/ListDetailPage';
export { ScrollRegion, type ScrollRegionProps } from './layouts/ScrollRegion';
export type { ListDetailPageProps } from './layouts/ListDetailPage';
export type { PageView, PageViews } from './layouts/views';
export { TablePage, DetailPage, SettingsPage, scrollSettingsSection, DashboardPage, WizardPage, WizardFooter, Widget, Panel, Tile, useWizardStep } from './layouts/Layouts';
export type { DetailTab, SettingsSection, WizardStep } from './layouts/Layouts';

export { DataTable } from './data/DataTable';
export type { DataTableMarkTone, DataTableProps } from './data/DataTable';
export { GroupNotes, type GroupNote, type GroupNoteAction, type GroupNotesProps } from './data/GroupNotes';
export { FilterChips } from './data/FilterChips';
export type { FilterChip, FilterOption } from './data/FilterChips';
export { StatusPill, StatusToggle, RowNote, Facts, StatTile, StatStrip } from './data/Display';
export { StatusLine, type StatusLineProps } from './states/StatusLine';
export { Handoff, type HandoffProps } from './states/Handoff';
export { openOutside } from './states/openOutside';
export { CellLines, checkAgainAction, ProgressCell, progressFit, UnknownCell, type CellLinesProps, type CheckAgainOptions, type Progress, type ProgressCellProps } from './data/cells';
export type { Tone, Fact, Stat, StatStripProps } from './data/Display';
export { createColumnHelper } from '@tanstack/react-table';
export type { ColumnDef, SortingState } from '@tanstack/react-table';

export { TextField, SearchField, Switch, Checkbox, CheckboxGroup, Fieldset } from './forms/fields';
export type { CheckboxGroupProps, FieldsetProps } from './forms/fields';
export { FormSection } from './forms/FormSection';
export type { FormSectionProps } from './forms/FormSection';
export { Lead, type LeadProps } from './layouts/Lead';

export { Drawer, useDrawerParam, ConfirmDialog, DangerConfirm, ActionMenu, MenuThumb, Popover, Tooltip, InfoTip } from './overlays/Overlays';
export { LeaveGuard } from './overlays/LeaveGuard';
export type { LeaveGuardProps } from './overlays/LeaveGuard';
export type { DrawerProps, ConfirmDialogProps, DangerConfirmProps, OutcomeActions, MenuAction, MenuEntry, MenuGroup, MenuList, ActionMenuProps, PopoverProps, TooltipProps, InfoTipProps } from './overlays/Overlays';
export { IdChip, CopyField, CodeBlock, copyText, useCopy, maskId } from './data/Ids';
export type { IdChipProps, CopyFieldProps, CodeBlockProps } from './data/Ids';
export { When, type WhenProps } from './data/When';
export { CODE_LANG_WORDS, codeLangOfPath, codeLangOfWord, type ColouredLang } from './data/codeLang';
export { AddressField, AddressList, AddressRow, AddressText, webAddress, type AddressFieldProps, type AddressRowProps } from './data/Address';
export { SystemSteps, ExamplePicker, systemOfAgent, SYSTEM_IDS, type SystemId, type SystemStep, type SystemStepsProps, type StepCode, type Example, type ExamplePickerProps } from './data/Steps';
export { IpInfo, ipDetailsFrom, type IpDetails, type IpInfoProps } from './data/IpInfo';
export { MarkdownViewer, type MarkdownViewerProps } from './data/MarkdownViewer';
export { NumberField, Select, Combobox, EntityPicker, RadioGroup, SecretField, SecretInput, Form, FormFooter } from './forms/more';
export type { Option, NumberFieldProps, SelectProps, ComboboxProps, EntityPickerProps, RadioGroupProps, SecretFieldProps, SecretInputProps, FormProps, FormFooterProps } from './forms/more';
export { Toaster, showToast } from './states/Toast';
export type { ToastContentData } from './states/Toast';

// Basics (keys, links, command steps, states, toasts, navigation controls, QR, widget rows)
export { Shortcut, shortcutKeys, formatShortcut, isApplePlatform } from './controls/Kbd';
export type { KbdProps, ShortcutProps } from './controls/Kbd';
export { ButtonStrip } from './controls/ButtonStrip';
export type { ButtonStripProps } from './controls/ButtonStrip';
export { TextButton } from './controls/Link';
export type { LinkProps, ExtLinkProps, TextButtonProps } from './controls/Link';
export { FileButton } from './controls/FileButton';
export type { FileButtonProps } from './controls/FileButton';
export { PageLinkTo } from './controls/PageLinkTo';
export { ComputerLink } from './controls/ComputerLink';
export type { ComputerLinkProps } from './controls/ComputerLink';
export { UpgradeLink, UpgradeScope, useCanUpgrade, upgradeProminence, UPGRADE_NEAR_PCT } from './controls/UpgradeLink';
export type { UpgradeLinkProps, UpgradeProminence, UpgradeAvailable } from './controls/UpgradeLink';
export type { PageLinkToProps } from './controls/PageLinkTo';
export { CountryFlag } from './controls/CountryFlag';
export type { CountryFlagProps } from './controls/CountryFlag';
// CodeLine is exported once and carries both meanings: the inline component (JSX, a value) and
// CodeBlock's line record (a type). See their doc comments in kit/data/Ids.tsx.
export { CopyButton, codeLineText, CodeLine } from './data/Ids';
export type { CodePart, CodePlaceholder, CodeLineProps } from './data/Ids';
// The highlighter's languages (CodeBlock / CodeEditor `lang`), so a page names them by type instead of by hand.
export type { HlLang } from './data/highlight';
export { StepList } from './data/StepList';
export type { StepListProps, StepListGroup, StepListItem } from './data/StepList';
// A page picks its open step in its own flow file.
export { Track, TrackStep } from './data/Track';
export type { TrackProps, TrackStepProps, TrackStepFoot, TrackState } from './data/Track';
export { Verdict, VerdictMark } from './states/Verdict';
export type { VerdictProps, VerdictMarkProps, VerdictSegment } from './states/Verdict';
export type { SkeletonProps, EmptyStateProps, ErrorStateProps, OutcomeBannerProps } from './states/States';
export { closeToast } from './states/Toast';
export type { ToastTone, ToastAction, ErrorToastOptions } from './states/Toast';
export { useAskDock, askOn, setAskForFixtures, startAgentConversation } from './ask';
export { useWindowTitleDetail } from './windowTitle';
// The Ask names with no browser state live in ask.pure.ts (shared with the terminal build).
export { ASK_ENABLED, DOCK_MIN, DOCK_MAX, splitAskContext, agentStartText, askPlain, askStartRoom, ASK_MAX_TEXT, ASK_CONTEXT_MARK } from './ask.pure';
export type { AskDraft, AskStartOutcome, AgentStart } from './ask.pure';
export type { AskDock } from './ask';
export { agentSignedOut } from './agent';
export { DetailBody, DetailFooter, DetailHeader } from './layouts/ListDetailPage';
export type { DetailFooterProps, DetailHeaderProps } from './layouts/ListDetailPage';
export { Section, SettingRow, PageFrame, CanvasPage } from './layouts/Layouts';
// The strict page anatomy.
export { AnatomySection, SubSection, focusSection } from './layouts/anatomy/Section';
export { SectionGroup } from './layouts/anatomy/SectionGroup';
export { ItemList } from './layouts/anatomy/ItemList';
export { ProblemList, type Problem, type ProblemListProps } from './data/ProblemList';
export { Glance, type GlanceFact, type GlanceProps, type GlanceRead } from './layouts/anatomy/Glance';
export { ReasonButton, type ReasonButtonProps } from './layouts/anatomy/ReasonButton';
export { ActionBar, InlineActions, SuggestionActions, type ActionBarProps, type InlineActionsProps, type SuggestionActionsProps } from './layouts/anatomy/ActionBar';
export { Heading, type HeadingProps } from './layouts/anatomy/Heading';
export type { ActionSpec, AnyAction, EmptyProof, EmptySpec, ItemListProps, ItemProps, LinkSpec, SectionActions, SectionGroupProps, SectionProps, SectionState, SubSectionProps, WholeCount } from './layouts/anatomy/types';
export { Faq, FaqLink } from './layouts/Faq';
export type { FaqItem, FaqSpec, FaqProps, FaqLinkProps } from './layouts/Faq';
export { Why } from './layouts/Why';
export type { WhyProps } from './layouts/Why';
export { type RowNeed, useContainerNarrow, useMedia, useReloadOnReturn, useRowFit } from './media';
export { motionOff, perfOn, usePerf } from './perf';
export type { CanvasPageProps } from './layouts/Layouts';
export { Splitter } from './layouts/Splitter';
export type { SplitterProps } from './layouts/Splitter';
export type { WidgetProps, PanelProps, TablePageProps, DetailPageProps, SettingsPageProps, DashboardPageProps, WizardPageProps, WizardFooterProps, WizardStepOptions, TileProps } from './layouts/Layouts';
export { Fab } from './layouts/PageHeader';
export type { PrimaryAction } from './layouts/PageHeader';
export { useListPane, useDetailPane } from './layouts/pane';
export { SegmentedControl } from './controls/SegmentedControl';
export type { SegmentedControlProps, SegmentItem } from './controls/SegmentedControl';
export { SideTabs } from './controls/SideTabs';
export type { SideTabItem, SideTabsProps } from './controls/SideTabs';
export { StripMore, Tabs, useStripEdges } from './controls/Tabs';
export type { TabsEdit, TabsEditHandle, TabsProps, TabItem } from './controls/Tabs';
export { QrButton, QrPanel, QrCode, QrImage, QrSecret, useQrSecretNote } from './qr/Qr';
export type { QrButtonProps, QrCodeProps, QrImageProps, QrLogoKind, QrPanelProps, QrReach, QrReachKind, QrSecretProps } from './qr/Qr';
export { canQr, qrMatrix, qrReachOf, qrTextMatrix, standInMatrix } from './qr/qr';
export { WidgetTitle, WidgetList, WidgetRow, WidgetStat, WidgetProgress, WidgetActions, Sparkline } from './widgets/Widgets';
export { Meter, ScaleBar, type MeterProps, type ScaleBarProps } from './widgets/Widgets';
export { NodeLink, type NodeLinkEdge, type NodeLinkNode, type NodeLinkProps } from './widgets/NodeLink';
export { PlanCard, PlanGrid, type PlanCardProps, type PlanGridProps, type PlanCardRegion, type PlanCardRegions } from './widgets/PlanCard';
export { isFresh, useFresh, PropagatingNote, PROPAGATION_MS, type PropagatingNoteProps } from './widgets/Propagating';
export { CHAT_SLOTS, ChatNames, markChatApps } from './widgets/ChatNames';
export { IntroPanel, type IntroPanelComputer, type IntroPanelProps } from './widgets/IntroPanel';
export type { CopyButtonProps } from './data/Ids';
export type { WidgetTitleProps, WidgetListProps, WidgetRowProps, WidgetStatProps, WidgetProgressProps, SparklineProps } from './widgets/Widgets';
export { ContextLine } from './data/Display';
export type { ContextLineProps, RealmColor, StatusPillProps, StatusToggleProps, RowNoteProps, FactsProps, StatTileProps } from './data/Display';
export { SrOnly, Tag, Monogram } from './data/Display';
export type { TagProps, TagTone, MonogramProps } from './data/Display';
export { ComputerMark, type ComputerMarkProps } from './data/ComputerMark';
export { BrandMark, type BrandMarkProps } from './data/BrandMark';
export { Disclosure } from './controls/Disclosure';
export type { DisclosureProps } from './controls/Disclosure';
export { Band, Notice } from './states/Band';
export { HeldBand } from './states/HeldBand';
// Error details: mapped words, Details + Copy for support, the error toast
export { ErrorDetails, errorLines, errorText, errorSentence, useErrorInfo } from './states/ErrorDetails';
export type { ErrorDetailsProps, ErrorLine } from './states/ErrorDetails';
export { errorWords, ERROR_WORD_KEYS } from './states/errorWords';
export type { ErrorWords, ErrorWordKey, ErrorWordsOptions } from './states/errorWords';
export { showErrorToast } from './states/Toast';
export type { BandProps, BandTone, NoticeLevel, NoticeProps } from './states/Band';
export type { HeldBandProps } from './states/HeldBand';
export { FirstUseState, NoMatchState, NoAccessState, OfflineState } from './states/Recipes';
export type { FirstUseStateProps, NoMatchStateProps, NoAccessStateProps, OfflineStateProps } from './states/Recipes';
export { UnreachableState, type UnreachableStateProps } from './states/Unreachable';
// Shell: shell data, cross-page contributions, notification hint and alerts
export { useShellData, useContributions, NotifyHint, notifyAlert, useShortcuts, showBootPanel, countText, usePageVisible, usePageLink, useServedPageLink, HeldFromLink, type HeldFromLinkProps, followPageLink, usePageShortcuts, pageShortcutId, useChromeHidden, type ChromeHiddenOptions, useKeepPage, usePageShown, openShortcutsSheet, ComputerRequired, type ComputerRequiredProps, type PageShortcut, type PageShortcutMod, type PageLink, type ShortcutGroup, type ShortcutRow, type ShellData, type ShellRealm, type ShellComputer, type Contributions, type WidgetContribution, type GuideTopicContribution, type NotifyHintProps, type NotifyAlertInfo } from '../shell/public';

// Overlays (Dialog, Sheet, drawer footer/guard API)
export { Dialog, DrawerCancel, useDrawer, Sheet, useIsPhone, runMenuAction, COPIED_MS } from './overlays/Overlays';
export { MenuFooter, menuFooterClass, menuFooterSectionClass, menuSearchClass, type FooterAction, type FooterActions, type MenuFooterProps } from './overlays/Overlays';
export type { DialogProps, DrawerSize, PopoverWidth, SheetProps } from './overlays/Overlays';

// Forms (Outcome line, form lock, secrets, OTP, time)
export { Outcome, OutcomeSlot, useOutcome, usePendingToast } from './forms/Outcome';
export type { OutcomeLineProps, OutcomeSlotProps, CheckFn } from './forms/Outcome';
export { OUTCOME_ICON, toOutcome, isUnknown, fromMutation } from './outcome';
export type { OutcomeInput, MutationLike } from './outcome';
export { useFormState, useFieldLock } from './forms/lock';
export { EnvRows } from './forms/EnvRows';
export type { EnvRow, EnvRowsProps } from './forms/EnvRows';
export { useWipeOn } from './forms/wipe';
export { OtpField, otpDigits } from './forms/OtpField';
export type { OtpFieldProps } from './forms/OtpField';
export { TimeField, normalizeTime, copyWhenRead, useRevealGuard } from './forms/more';
export { DateTimeField, normalizeDate, type DateTimeFieldProps } from './forms/DateTimeField';
export { ScheduleField, type ScheduleFieldProps } from './forms/ScheduleField';
export { PathField, type PathEntry, type PathFieldProps, type PathReads } from './forms/PathField';
export { DateField, type DateFieldProps } from './forms/DateField';
export { ColorPicker, normalizeHexColor, PRESET_COLORS, randomPresetColor, type ColorPickerProps } from './forms/ColorPicker';
export { SshKeyHelp, SshKeyFinish, guessKeyOs, sshKeyCommands, type KeyOs, type SshKeyHelpProps, type SshKeyFinishProps } from './forms/SshKeyHelp';
export { IpAllowlistField, readIpFrom, type IpAllowlistFieldProps } from './forms/IpAllowlistField';
export type { TimeFieldProps, SecretConfirm, CopyAttempt } from './forms/more';
export type { SettingRowProps } from './forms/SettingRow';
export { SettingGroup, SettingSwitch, useSettingGroup } from './forms/SettingGroup';
export type { SettingGroupProps, SettingGroupVariant, SettingSwitchProps, SettingIds, SettingReveal, SettingReset } from './forms/SettingGroup';
export { RuleChecklist } from './forms/fields';
export type { FieldRule } from './forms/fields';
export { CodeEditor } from './forms/CodeEditor';
export type { CodeEditorProps, CodeEditorHandle, CodeProblem } from './forms/CodeEditor';
// Tables (DataTable, the standard data view, filter chips, list/detail)
export { useDataView } from './data/DataTableView';
export { useBusyMark } from './data/busy';
export type { DataView, DataViewOptions, DataViewServer, DataQuery, ViewFilter } from './data/DataTableView';
export type { RowAction, RowActionEntry, TableGroup, ToolbarAction } from './data/DataTable';
export { EDGE_PAD, fitWidth, textWidth, type TextMetrics } from './data/DataTableLayout';
export { clearClipTitle, clipTitle, hoverPointer } from './data/clipTitle';
export { useFontsReady } from './data/fontsReady';
export { useButtonLabelsWidth, type ButtonLabel, type ButtonLabelSpec, type ButtonLabelsOptions, type ButtonLabelsWidth } from './controls/buttonMetrics';
export { statusPillMetrics } from './data/pillMetrics';
export { copyKeyName, DropArea, useRefuseStrayFiles } from './data/drag';
export { PRESS_HOLD_MS, pressClasses, type PressState } from './controls/pressFeedback';
export type { DragInfo, DropData, DropTarget, RowDrag, RowTarget } from './data/drag';
export { PresentationSwitch, usePresentation } from './data/Presentation';
export type { Presentation } from './data/Presentation';
export { FiltersButton, chipValueText } from './data/FilterChips';
export { fold as foldText, matchesSearch, compareValues } from './data/DataTableViewLogic';
export type { FilterKind, FilterValue } from './data/DataTableViewLogic';
export { cliCommand, platformHosts, currentPlatformHosts, platformText, type PlatformHosts, type AgentHintPage, type AgentHintFacts } from './widgets/agentHints'; export { AgentHint, type AgentHintProps } from './widgets/AgentHint';
export { useAskAgent, withAskAgent, AskAgentButton, AskAgentDrawer, AskAgentPanel, askAgentHeld, resetAskAgentForTests, type AskAgent, type AgentQuestion, type AgentReadPart, type AskAgentKind, type UseAskAgentOptions } from './widgets/AskAgent';
export { PickerPanel, SEARCH_ABOVE, type PickerItem, type PickerPanelProps } from './pickers/PickerPanel';
export { ComputerPicker, PickerTrigger, PickerPopover, RealmChip, type ComputerChoice, type ComputerPickerProps, type PickerTriggerProps } from './pickers/ComputerPicker';
export { ProjectPicker, type ProjectChoice, type ProjectPickerProps } from './pickers/ProjectPicker';
export { ProgramPicker, type ProgramChoice, type ProgramPickerProps } from './pickers/ProgramPicker';
export { PickerField, type PickerFieldProps } from './pickers/PickerField';
export { LanguageMenu, type LanguageMenuProps } from './pickers/LanguageMenu';
export { HUB_LOCALE, HUB_LOCALES, localeName, type HubLocale } from './locales';
export { PickCard, type PickCardProps } from './pickers/PickCard';
export { CardGrid, type CardGridProps } from './pickers/CardGrid';
export { useComputerChoice, type ComputerChoiceRow } from './pickers/computerChoice';
// The one dialog for choosing files or a folder on a computer (PathField's Browse is it too); the host reads. See kit/pickers/FileChooser.tsx.
export { FileChooser, type FileChooserProps, type ChooserEntry, type ChooserFileRef, type ChooserFind, type ChooserFindAsk, type ChooserFolder, type ChooserFound, type ChooserPlace, type ChooserPlaceLink, type ChooserPreview, type ChooserPreviewState, type ChooserReads, type ChooserResult } from './pickers/FileChooser';
export { acceptExtensions, fileOriginText, fileReferenceText } from './pickers/fileChooser';
import type * as Catalogue7k from './pickers/fixtures/catalogue7k';
/**
 * Fixture builds only (hub:dev, shots, tests): the real chat catalogue, 206 providers and 7,078 models, with the
 * model picker's scenarios. Loaded on demand so the 348 KB fixture never enters a page's chunk; production builds
 * fold the import away (__HUB_FIXTURES__ is false there).
 */
export const loadCatalogue7k = (): Promise<typeof Catalogue7k> =>
  __HUB_FIXTURES__ ? import('./pickers/fixtures/catalogue7k') : Promise.reject(new Error('fixture builds only'));
export { ModelPicker, type ModelChoice, type ModelPickerProps, type ModelReady } from './pickers/ModelPicker'; export { ProviderSetup, type Connected as ProviderConnected, type ProviderSetupProps } from './pickers/ProviderSetup';
export { OpenRouterSetup, type OpenRouterSetupProps } from './pickers/OpenRouterSetup';
export { EndpointRevNote, useEndpointRev, type EndpointRev, type EndpointRevState } from './pickers/endpointRev';
export { scopeKey, settleAttempt, useModelCatalogue, type Attempt, type AttemptInput, type AttemptIntent, type AttemptResult, type AttemptView, type CatalogueOptions, type CatalogueReads, type ModelCatalogue } from './pickers/useModelCatalogue';
export { ModelBrowser, type ModelBrowserProps, type OtherWayOrAi, type SetupRequest } from './pickers/ModelBrowser';
export { ModelChooser, type ChooserLeave, type ModelChooserProps } from './pickers/ModelChooser';
export { ModelPickChip, ModelPickField, ModelPickPanel, type ModelPickChipProps, type ModelPickFieldProps, type ModelPickPanelProps, type PickDraft, type PickOutcome, type ThinkingStep } from './pickers/ModelPick';
export { ModelListbox, ModelPager, optionId, type ListGroup, type ListOption, type ModelListboxProps, type ModelPagerProps } from './pickers/ModelListbox';
export { ProviderDirectory, dirControlId, NO_PAGES, type DirPages, type ProviderDirectoryProps } from './pickers/ProviderDirectory';
export { ProviderMark } from './pickers/ProviderMark';
export type { FallbackRow } from './pickers/modelViews';
export { AgentSettings, NEW_DRAFT, type AgentDraft, type AgentSettingsProps } from './agent/AgentSettings';
export { Prose, FoldedCode, ReplyBox, ReplyFooter, useFooterMenuOpen } from './agent/Reply';
export { ChatLinkHost, LinkHost, type ChatHost, type HostComputer, type HostComputers, type LinkHostValue, type LinkTarget } from './agent/linkHost';
export { turnMenuOf, forkItems, forkWholeItems, type TurnTarget, type TurnItems, type TurnItemsHook, type ForkHost } from './agent/ForkMenu';
export { ForkPending, type ForkPendingProps } from './agent/ForkPending';
export { TurnRun, turnArg, type TurnAsk, type TurnAskOf, type TurnProviders } from './agent/TurnRun';
export { copyReply, pickReplyToCopy, type CopyReplyOutcome, type CopyReplyPick } from './agent/copyReply';
export { useForkList, provideForkList, type ForkScope, type ForkListOps, type ForkListProvider, type ForkListView, type ForkElsewhereCount } from './agent/forkList';
export { GateCard, DecidedLine, CardFrame, CardHead, CardBody, type CardProps, type GateView, type GateQuestionView, type GateChoice, type DecidedView } from './agent/GateCard';
export { Composer, composerPlain, composerCount, type ComposerProps, type ComposerNote, type ComposerAttachment, type ComposerScreenshot } from './agent/Composer';
export { shotRoutes } from './agent/displayShot';
export { useConvComposer, attemptTarget, attemptsOf, takeBackToDraft, subscribeAttempts, CONV_MAX, CONV_AUTO, type ConvComposer, type ComposerFiles, type ChatAttempts, type SendAttempt, type StopAttempt } from './agent/convComposer';
export { AttachList, AttachChip, AttachThumb } from './agent/AttachChips';
export { StepPictureHost, type StepPictureReader } from './agent/StepPictures';
export { readSessionImage, sessionImageRoute } from './agent/sessionImage';
export { queuedOf, setQueued, useQueuedSend, queuedIsCommand, type QueuedSend } from './agent/queuedSend';
export { PauseControl, PauseBand, usePauseView, useHoldPause, usePauseDescription, usePauseToggle, type PauseProps, type PauseToggle } from './agent/Pause';
export { createPauseStore, type PauseDeps, type PauseStore, type PauseView } from './agent/pause';
export { StopAllButton, StopAllConfirm, StopAllResult, useStopView, type StopAllConfirmProps, type StopAllProps } from './agent/StopAll';
export { createStopRun, MAX_PAGES as STOP_MAX_PAGES, type StopPhase, type StopRun, type StopView } from './agent/stop';
export { RealmBand, realmBandWords, type RealmBandProps, type RealmBandHost, type RealmBandState } from './agent/RealmBand';
export { ApprovalSection, type ApprovalSectionProps } from './agent/ApprovalSection';
export { useApproval, type ApprovalData, type ApprovalChangeState } from './agent/useApproval';
export { ApprovalMode, AllowEverythingConfirm, allowEverythingOffered, useApprovalModeNote, type ApprovalModeProps, type ApprovalModeState } from './agent/ApprovalMode';
export { GateAllowAll } from './agent/GateCard';
export { AgentState, type AgentStateView, type AgentStateProps } from './agent/states/AgentStates';
export { ShellJobRows, shownShellJobs, type ShellJobRowsProps, type ShownJob } from './agent/ShellJobRows';
export { createShellJobStops, type JobAttemptView, type ChatRef, type JobStopTarget, type ShellJobStopDeps, type ShellJobStops, type ShellJobStopsSnapshot, type StopRefusal, type StopResult } from './agent/shellJobStop';
export { evidenceOfRead, evidenceOfStop, parseJobList, parseJobStopReply, type JobRow, type JobStopReply, type ParsedStop, type StopEvidence } from './agent/jobStop';
export { reduceShellJobs, MAX_SHELL_JOBS, type ShellJobRow } from './agent/shellJobs';
export { RateLimitChip, type RateLimitChipProps } from './agent/RateLimitChip';
export { parseRateLimit, rateLimitSupersedes, type RateLimitReading } from './agent/rateLimit';
export { approvers } from './agent/approver-live';
export { createApproverManager, tabHolder, tix, approverRefusalOf, useApproverWords, type ApproverHandle, type ApproverManager, type ApproverPhase, type ApproverRef, type ApproverState } from './agent/approver';
export { ConfirmEffect, type ConfirmEffectProps } from './agent/ConfirmEffect';
export { leases, createLeaseManager, type LeaseHandle, type LeaseManager, type LeaseState, type SessionRef as LeaseRef } from './agent/lease';
export { asLine, asWritten, diffRows, clean as cleanAgentText, scrubSecrets, shownText, type DiffRow, type DiffParts } from './agent/code';
export { can, missingPrerequisites, ACTIONS, SENDING, type Action, type Capability, type CapFacts, type Prerequisite, type Reason } from './agent/capability';
export { sizeClassOf, isSmall, SIZE_BREAKS, useSizeClass, type SizeClass } from './agent/useSizeClass';
export { SplitLayout, splitState, type SplitLayoutProps, type SplitState } from './agent/SplitLayout';
export { SessionView, type SessionViewProps } from './agent/SessionView';
export { SessionTab, type SessionTabProps } from './agent/SessionTab';
export { JumpToNewest } from './agent/JumpToNewest';
export { NeedsBar, needsWhat, type NeedsBarProps } from './agent/NeedsBar';
export { ConvHeader, type ConvHeaderProps } from './agent/ConvHeader';
export { DetailsPanel, type DetailsPanelProps, type DetailsTab } from './agent/DetailsPanel';
export { ConversationView, type ConversationViewProps } from './agent/ConversationView';
export { takesText, useEditing } from './agent/takesText';
export { useWhy } from './agent/why';
export { isActive, convKey, type ForkOutcome, type ForkReason, type ForkRowView, type ConversationSource, type ActiveSource, type ConvRef, type ConvSnapshot, type ConvBlock, type GateEntry, type StepView, type FileView, type ConvMeta, type EditView, type SendOutcome, type Watch, type WatchRank, type GateRef, type Decision, type Answer, type Draft, type DraftFile, type PendingRef } from './agent/source';
export { activateSource, approverFactOf, forkGate, type ActivationDeps, type Readiness, type SourceOps } from './agent/activate';
export { useConversation, useConversationHold, useConversationList, provideConversations, type ConversationProvider, type ConvList, type ConvListRow, type ShownComputer, type Held } from './agent/conversations';
export { useBotSource, type BotSource, type BotFeed, type BotHome, type BotTail } from './agent/source.bot';
export { useActiveConversation, useActiveConversationHold, provideActiveConversations, useStarter, type ActiveConversationProvider, type HeldActive, type StartAt, type StartAuto, type StartDoor, type StartOpts, type StartPhase, type StartState, type Starter } from './agent/conversationsActive';
export { UsageTab, type UsageTabProps, type UsageTurn } from './agent/Usage';
export { createUsageStore, useUsageView, USAGE_PAGE, USAGE_MAX_PAGES, type UsageStore, type UsageView } from './agent/useUsage';
export { usagePageOf, requestsOf, groupTurns, byModel, sideOf, speechOf, cachePct, mergeRows, rollupOf, type UsageKind, type UsageRow, type UsageTotals, type UsagePage, type UsageRequest, type TurnResponses, type TurnUsage, type GroupedUsage, type ModelUsage, type Rollup } from './agent/usage';
export { TalkBar, useTalkShortcuts, type TalkActivity, type TalkDevice, type TalkBarHandlers, type TalkBarProps, type TalkShortcuts } from './voice/TalkBar';
export { CaptionStrip, type CaptionLine, type CaptionStripProps } from './voice/CaptionStrip';
export { MicButton, useMicAction, type MicReason, type MicButtonProps } from './voice/MicButton';
// Bots voice: Talk's live half (audio engine and its worklets, capture, devices), for pages/bots/voice/talkLive.ts.
export { CAPTURE_PROCESSOR, voiceEngine, type VoiceEngine } from './voice/audio';
export { CAPTURE_RATE, SendQueue, startCapture, type CaptureHandle } from './voice/capture';
export { echoCancellationReported, listDevices, onDeviceChange, openMic, setSink, sinkSupported, stopStream, type MicOptions, type MicRefusal } from './voice/devices';
