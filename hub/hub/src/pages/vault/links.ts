// Public hrefs of the vault page: the only file other pages may import from this folder.
// The partition is the top bar's realm, so no link carries one.
export const links = {
  list: '/vault',
  /** The New entry form. */
  create: '/vault?edit=new',
  /** One entry's detail, by name. */
  item: (key: string) => `/vault?sel=${encodeURIComponent(key)}`,
} as const;
