// One place Jump to can land that only a page's view draws (shell/search/index.gen.ts, made by hub/scripts/search-index-gen.ts).
export type DeepKind = 'section' | 'setting' | 'tab' | 'faq';

export interface DeepEntry {
  /** The page's id. */
  page: string;
  kind: DeepKind;
  label: string;
  /** Appended to the page's path: '?section=passcode', '?tab=storage', '#faq-lockScope', '/learn?section=kinds'. */
  to: string;
  /** The section a setting row sits in (its title). */
  under?: string;
  /** Folded search words from the row's help or the answer: matched, never shown. */
  words: string;
}
