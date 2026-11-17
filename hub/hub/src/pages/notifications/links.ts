// Public hrefs of the notifications page: the only file other pages may import from this folder.
export const links = {
  inbox: '/notifications',
  archive: '/notifications?box=archive',
  item: (id: string) => `/notifications?sel=${encodeURIComponent(id)}`,
  notices: '/notifications/notices',
  notice: (id: string) => `/notifications/notices?sel=${encodeURIComponent(id)}`,
  learn: '/notifications/learn',
  learnSection: (id: 'kinds' | 'where' | 'browser' | 'phone') => `/notifications/learn#${id}`,
} as const;
