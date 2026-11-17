// Public hrefs of the bots page: the only file other pages may import from this folder.
export const links = {
  list: '/bots',
  item: (key: string) => `/bots?sel=${encodeURIComponent(key)}`,
  byRealm: (realm: string) => `/bots?realm=${encodeURIComponent(realm)}`,
  byComputer: (computer: string) => `/bots?computer=${encodeURIComponent(computer)}`,
  /** A Bot's tab: activity (default), link, apps or work. */
  tab: (key: string, tab: 'activity' | 'link' | 'apps' | 'work') => `/bots?sel=${encodeURIComponent(key)}${tab === 'activity' ? '' : `&tab=${tab}`}`,
  /** A Bot's Settings drawer at a section (model by default). */
  settings: (key: string, section: 'model' | 'behaviour' | 'guardrails' | 'voice' | 'advanced' = 'model') => `/bots?sel=${encodeURIComponent(key)}&settings=${section}`,
  /** A Bot with one of its confirmations open (stop, reset, forget, purge, delete). */
  action: (key: string, action: 'stop' | 'reset' | 'forget' | 'purge' | 'delete') => `/bots?sel=${encodeURIComponent(key)}&do=${action}`,
  newBot: (computer?: string) => (computer ? `/bots?drawer=new&initial=${encodeURIComponent(computer)}` : '/bots?drawer=new'),
} as const;

/** The same table under the name the page's own files use. */
export const botLinks = links;
