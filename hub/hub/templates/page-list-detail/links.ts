// Public hrefs of the __ID__ page: the only file other pages' code may import from this folder (their fixtures.ts
// and tests may also import fixtures.links.ts).
export const links = {
  list: '/__ID__',
  item: (id: string) => `/__ID__?sel=${encodeURIComponent(id)}`,
} as const;
