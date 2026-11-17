// site.ts: the legal pages on Hoody's site that the Hub links to, written once for every screen that names them (the
// one-file Hub's "Create your account", the plans page).
//
// Absolute https only: the kit Link opens such an address in a new tab, from a served page and from a file opened from
// disk alike. A served page that carries its own addresses on the document element (the checkout's consent line) keeps
// reading those.
export const LEGAL = {
  terms: 'https://hoody.com/terms-of-service/',
  privacy: 'https://hoody.com/privacy-policy/',
} as const;
