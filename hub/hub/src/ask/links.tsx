// Ask's links to other pages. Each one goes through the shell's page links (usePageLink/followPageLink): a page
// this load serves is a router link that keeps a place plainly under it (placeUnder), and a page it hides has no
// link, so its link draws nothing (there is no classic Hub to fall back to).
import type { ReactNode } from 'react';
import { useRouter } from '@tanstack/react-router';
import { Button, Link, LinkButton, TextButton, followPageLink, useGo, usePageLink } from '@kit';
import { placeUnder } from '@shell/pageLinks';
import { chatLink, links as aiLinks, type ChatRef } from '../pages/ai/links';

export type AskPage = 'computers' | 'ai' | 'guide';

/**
 * A function drawing a link to `path` on `page`, or null when the page has nowhere to go. `text` draws a
 * TextButton in every case (for rows of text buttons); otherwise a served page is a Link.
 */
/** `onFollow`: called when the control is pressed, before it goes (a popover holding the link closes itself). */
export function useToPage(): (page: AskPage, path: string, label: string, o?: { variant?: 'inline' | 'nav'; text?: boolean; onFollow?: () => void }) => ReactNode | null {
  const go = useGo();
  const links = { computers: usePageLink('computers'), ai: usePageLink('ai'), guide: usePageLink('guide') };
  return (page, path, label, o = {}) => {
    const link = links[page];
    if (!link) return null;
    if (link.kind === 'hub') {
      const to = placeUnder(link, path);
      return o.text ? <TextButton onPress={() => { o.onFollow?.(); go(to); }}>{label}</TextButton> : <Link href={to} variant={o.variant} {...(o.onFollow ? { onPress: o.onFollow } : {})}>{label}</Link>;
    }
    return <TextButton onPress={() => { o.onFollow?.(); followPageLink(link, go); }}>{label}</TextButton>;
  };
}

/** Where a control going to `path` on `page` leads, for a kit control drawn in place (an actions slot takes a LinkButton
 *  or a Button, not a Link): a router href that keeps the place under a page this load serves, a press that follows
 *  the shell's page link for one it hands off, or null when the page has nowhere to go (as useToPage). */
export function usePageTarget(page: AskPage, path: string): { href: string } | { onPress: () => void } | null {
  const go = useGo();
  const link = usePageLink(page);
  if (!link) return null;
  if (link.kind === 'hub') return { href: placeUnder(link, path) };
  return { onPress: () => followPageLink(link, go) };
}

/** A secondary control to `path` on `page`, for an empty or error state's action slot (which takes a LinkButton or a
 *  Button, never a Link): usePageTarget's href as a LinkButton, its press as a Button, nothing for a hidden page. */
export function ToPageButton({ page, path, label }: { page: AskPage; path: string; label: string }) {
  const open = usePageTarget(page, path);
  if (!open) return null;
  return 'href' in open
    ? <LinkButton href={open.href} variant="secondary">{label}</LinkButton>
    : <Button variant="secondary" onPress={open.onPress}>{label}</Button>;
}

/** Opens a chat of the AI tab (the one place a conversation is shown whole). False when this load serves no such page, or the reference
 *  is not one a link may carry: the caller then says where the chat is instead of leaving the person guessing. `onPassed`: called
 *  once THIS navigation has got past every leave confirmation; never when one keeps the person where they are, never for a later one. */
export function useOpenChat(): (ref: ChatRef, onPassed?: () => void) => boolean {
  const go = useGo();
  const link = usePageLink('ai');
  const router = useRouter({ warn: false });
  return (ref, onPassed) => {
    const path = chatLink(ref);
    if (!link || link.kind !== 'hub' || !path) return false;
    // A guard that blocks nothing, after every other guard. The history reads its guards when a navigation starts, so this one,
    // taken off right after `go`, is asked by this navigation alone, and only once the guards before it have let it through.
    const off = onPassed && router ? router.history.block({ blockerFn: () => { onPassed(); return false; }, enableBeforeUnload: false }) : undefined;
    try { go(placeUnder(link, path)); } finally { off?.(); }
    return true;
  };
}

/** Opens the AI tab, whose list shows the unconfirmed forks of the shown computer and realm. False when this load serves no such page. */
export function useShowForks(): () => boolean {
  const go = useGo();
  const link = usePageLink('ai');
  return () => {
    if (!link || link.kind !== 'hub') return false;
    go(placeUnder(link, aiLinks.tab));
    return true;
  };
}
