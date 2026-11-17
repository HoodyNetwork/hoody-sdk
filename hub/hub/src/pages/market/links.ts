// Public hrefs of the market page: the only file other pages may import from this folder.
export const links = {
  list: '/market',
  item: (id: string) => `/market?sel=${encodeURIComponent(id)}`,
  reservations: '/market?tab=reservations',
} as const;
