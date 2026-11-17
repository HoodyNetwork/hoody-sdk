// The kit overlays under one import path for kit code and the shell; pages import them from '@kit' and never build an
// overlay of their own. LeaveGuard and the focus helpers of shared.ts are exported by the barrel directly.
export { Drawer, DrawerCancel, useDrawer, useDrawerParam } from './Drawer';
export type { DrawerProps, DrawerSize } from './Drawer';
export { Dialog, ConfirmDialog, DangerConfirm } from './Dialog';
export type { DialogProps, ConfirmDialogProps, DangerConfirmProps, OutcomeActions } from './Dialog';
export { ActionMenu, MenuThumb, menuFooterSectionClass, menuSearchClass, menuInitialKey, menuLabel, menuSections, runMenuAction, COPIED_MS } from './Menu';
export type { ActionMenuProps, MenuAction, MenuEntry, MenuGroup, MenuList, MenuSectionModel } from './Menu';
export { InfoTip } from './InfoTip';
export type { InfoTipProps } from './InfoTip';
export { MenuFooter, menuFooterClass } from './MenuFooter';
export type { FooterAction, FooterActions, MenuFooterProps } from './MenuFooter';
export { Popover, Sheet, Tooltip } from './Popover';
export type { PopoverProps, PopoverWidth, SheetProps, TooltipProps } from './Popover';
export { useIsPhone } from './shared';
