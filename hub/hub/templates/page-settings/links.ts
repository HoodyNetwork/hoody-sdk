// Public hrefs of the __ID__ page: the only file other pages' code may import from this folder (their fixtures.ts
// and tests may also import fixtures.links.ts).
export const links = {
  page: '/__ID__',
  section: (id: 'general' | 'notifications' | 'danger') => `/__ID__?section=${id}`,
} as const;
