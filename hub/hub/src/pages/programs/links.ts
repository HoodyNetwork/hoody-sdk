// Public hrefs of the programs page: the only file other pages may import from this folder.
/** The key of links.newProgram: view.tsx reads it, and nothing else spells it. */
export const NEW_PARAM = 'new';

export const links = {
  list: '/programs',
  /** One program selected (the daemon's id as a decimal string). */
  program: (id: string) => `/programs?sel=${encodeURIComponent(`prog:${id}`)}`,
  /** The Running tab with New program open (the page takes the key out of the URL once it opens the form). */
  newProgram: `/programs?${NEW_PARAM}=1`,
} as const;
