// The pure part of the FAQ (Faq.tsx and its terminal sibling share it): which hash names the questions, and the items'
// rules (non-empty, unique ids).
import type { FaqItem } from './Faq';

export type Target = { kind: 'item'; id: string } | { kind: 'section' };

/** `faq-<id>` names an item, `faq` the section; any other hash is not ours. */
export function targetOf(hash: string): Target | null {
  if (hash === 'faq') return { kind: 'section' };
  return hash.startsWith('faq-') && hash.length > 4 ? { kind: 'item', id: hash.slice(4) } : null;
}

/** Whether a location hash targets the questions, the section or one item. */
export const isFaqHash = (hash: string): boolean => targetOf(hash) !== null;

export function validate(items: readonly FaqItem[]): void {
  if (items.length === 0) throw new Error('Faq: `items` is empty. A page without explanations passes no `faq` (an empty FAQ is refused).');
  const seen = new Set<string>();
  for (const { id } of items) {
    if (seen.has(id)) throw new Error(`Faq: duplicate item id "${id}"; the anchor #faq-${id} must be unique on the page.`);
    seen.add(id);
  }
}
