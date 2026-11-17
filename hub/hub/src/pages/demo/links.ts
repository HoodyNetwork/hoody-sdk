// Public hrefs of the demo page: the only file other pages may import from this folder.
export const links = {
  list: '/demo',
  item: (id: string) => `/demo?sel=${encodeURIComponent(id)}`,
} as const;
