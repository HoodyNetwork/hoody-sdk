import type { PageAllow } from '@app/conformance/allow';

// Conformance allow-list rows of the Support page (types and rule ids in app/conformance/allow.ts).
// Paths are relative to this folder. Rows only shrink: a fixed site leaves its row in the same change. The page was
// born with this anatomy debt: the list
// and thread slots the kit's slot table does not list yet (the drawer's are listed), the thread's states outside a Section, and the
// message/unread looks the kit has no part for.
export const allow: PageAllow = {
  // layout:begin (page-anatomy debt, one row per file and scope. Lower or delete rows as sites are fixed; never add one.)
  'layout.actionRow': {
    'parts/ReplyBox.tsx': 1,
    'parts/Thread.tsx': 3,
    'view.tsx': 1,
  },
  'layout.explainGap': {
    'count.ts': 1,
    'parts/NewTicket.tsx overlay:support-new': 2,
    'view.tsx': 1,
  },
  'layout.slot': {
    'parts/Thread.tsx': 1,
    'view.tsx': 4,
  },
  'layout.state': {
    'parts/Thread.tsx': 5,
    'view.tsx': 1,
  },
  'layout.text': {
    'parts/Limits.tsx overlay:support-new': 1,
    'parts/ReplyBox.tsx': 1,
    'parts/Thread.tsx': 3,
    'view.tsx': 1,
  },
  'ui.pageLook': {
    'parts/parts.module.css': 18,
  },
  // layout:end
};
