// Public hrefs of the keys page: the only file other pages may import from this folder.
export const links = {
  list: "/keys",
  ssh: "/keys/ssh",
  shared: "/keys/shared",
  item: (handle: string) => `/keys?sel=${encodeURIComponent(handle)}`,
  /** Open the New key form once (Home's first steps). */
  create: "/keys?new=1",
  /** Open "Share a realm" once (the shell's realm menu); `realm` is preselected when the account lists it. It rides
   *  the shell's realm-link key (shell/realmParam.tsx OPEN_REALM, pinned equal there): the shell switches to it
   *  first. */
  shareRealm: (realm?: string) => (realm ? `/keys/shared?share=1&open_realm=${encodeURIComponent(realm)}` : "/keys/shared?share=1"),
} as const;
