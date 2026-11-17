// Public hrefs of the schedules page: the only file other pages may import from this folder.
export const links = {
  list: '/schedules',
  /** One schedule selected (the row key, e.g. "cron:user/<id>"). */
  item: (key: string) => `/schedules?sel=${encodeURIComponent(key)}`,
  /** The New schedule drawer. */
  create: '/schedules?edit=new',
} as const;
