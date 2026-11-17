// Where the shell's alerts and hints lead: the Notifications page's inbox and its Learn sections. The
// page owns these routes (pages/notifications/links.ts); the shell never imports a page, so it keeps
// this copy, and notify/paths.test.ts fails the moment the two differ.
import type { SectionId } from '@core/shell';

export const notifyPaths = {
  inbox: '/notifications',
  learnSection: (id: SectionId) => `/notifications/learn#${id}`,
} as const;
