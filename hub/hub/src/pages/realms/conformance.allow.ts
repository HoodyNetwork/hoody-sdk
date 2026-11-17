import type { PageAllow } from '@app/conformance/allow';

// Conformance allow-list rows of this page (types and rule ids in app/conformance/allow.ts).
// Paths are relative to this folder. Rows only shrink. Delete the file when it is empty.
export const allow: PageAllow = {
  // layout:begin (page-anatomy debt, one row per file and scope. Lower or delete rows as sites are fixed; never add one.)
  'layout.explain': {
    // The two confirm dialogs' safety sentences; they sat in the main scope until the dialogs took an overlayId.
    'view.tsx overlay:realm-leave': 1,
    'view.tsx overlay:realm-stop-tracking': 1,
  },
  'layout.explainGap': {
    'view.tsx': 1,
  },
  'layout.legacy': {
    'view.tsx': 2,
  },
  'layout.looseFaqLink': {
    'view.tsx': 1,
  },
  'layout.state': {
    'view.tsx': 1,
  },
  // layout:end
  // ui:begin (UI-standard debt, one row per file and scope. Lower or delete rows as sites are fixed; never add one.)
  'ui.computerList': {
    'parts/PickedList.tsx': 1, // the summary's picked list, in its own part (with a terminal sibling)
  },
  // ui:end
};
