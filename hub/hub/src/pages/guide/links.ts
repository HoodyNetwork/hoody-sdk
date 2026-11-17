// Public hrefs of the guide page: the only file other pages may import from this folder.
export type GuideSection = 'ask' | 'connect' | 'skills' | 'build' | 'links' | 'bots' | 'tools' | 'try' | 'realms' | 'topics' | 'keys' | 'look';

export const links = {
  guide: '/guide',
  section: (id: GuideSection) => `/guide#${id}`,
  door: (door: string) => `/guide?door=${encodeURIComponent(door)}#connect`,
} as const;
