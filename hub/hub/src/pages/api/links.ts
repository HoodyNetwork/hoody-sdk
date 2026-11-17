// Public hrefs of the API page: the only file other pages may import from this folder.
export const links = {
  api: '/api',
  /** One endpoint, by operationId. */
  op: (id: string) => `/api?op=${encodeURIComponent(id)}`,
} as const;
