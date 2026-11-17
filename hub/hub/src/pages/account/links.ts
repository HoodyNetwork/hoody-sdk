// Public hrefs of the account page: the only file other pages may import from this folder.
export const links = {
  account: '/account',
  password: '/account?sheet=password',
  twoStep: '/account?sheet=setup',
  sessions: '/account?section=sessions',
} as const;
