// Form sections in overlays: the counted debt of the form.* rules (hub/scripts/lint/anatomy.cjs FORM_RULES).
//   form.flat       five or more kit fields in one column of a Dialog, Drawer or Sheet, outside a FormSection
//   form.handGroup  a hand-made <fieldset>, or text drawn with a page class named like a label, in an overlay body
// A row is `<hub/src file> <scope>` -> count, where scope is `main` or `overlay:<overlayId>`, exactly as the detector
// counts it. The ratchet (app/conformance.formsection.test.ts) keeps every row equal to the detector's count: a new
// offender fails, a fixed overlay lowers or deletes its row in the same change. This list only shrinks.
export const FORM_SECTION_DEBT: Readonly<Record<'form.flat' | 'form.handGroup', Readonly<Record<string, number>>>> = {
  'form.flat': {
    'pages/ai/auto/loops/Edit.tsx main': 1,
    'pages/ai/knowledge/memory/Detail.tsx main': 1,
    'pages/ai/settings/connections/Mcp.tsx overlay:ai.mcp.server': 1,
    'pages/ai/settings/rules/HookEdit.tsx overlay:ai-hook-edit': 1,
    'pages/board/options/Rows.tsx main': 1,
    'pages/board/parts/BrowserForm.tsx main': 1,
    'pages/board/parts/Picker.tsx main': 1,
    'pages/board/parts/SshForm.tsx main': 1,
    'pages/bots/parts/ChatSettings.tsx main': 1,
    'pages/bots/parts/HelperModels.tsx overlay:bots-settings-drawer': 1,
    'pages/computers/parts/AccessPeople.tsx overlay:computers-access-people-add': 1,
    'pages/computers/parts/ExitIp.tsx overlay:computers-exit-ip': 1,
    'pages/keys/parts/KeyFields.tsx main': 1,
    'pages/programs/sandbox/NewProgram.tsx overlay:programs-new-program': 1,
    'pages/programs/sandbox/SandboxFields.tsx main': 1,
    'pages/vault/parts/EditDrawer.tsx overlay:vault-edit': 1,
  },
  'form.handGroup': {
    'pages/board/options/ShellRow.tsx main': 1,
    'pages/bots/parts/ChatPeople.tsx overlay:bots-people-add': 1,
    'pages/computers/parts/ServerDetail.tsx overlay:computers-server-detail-drawer': 1,
    'pages/keys/parts/RightsPicker.tsx main': 2,
  },
};
