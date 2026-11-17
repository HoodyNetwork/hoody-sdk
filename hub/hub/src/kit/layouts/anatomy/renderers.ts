// Table R: the modules that may write landmarks themselves.
// Plain data: the anatomy detector (hub/scripts/lint/anatomy.cjs loadRegistry) evaluates this file without imports, and
// a layout test pins it. It equals the detector's DEFAULT_REGISTRY entry.

export const RENDERERS = [
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
];
