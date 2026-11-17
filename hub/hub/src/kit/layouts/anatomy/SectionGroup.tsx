// A category of related Sections. The group sets the larger break
// between categories, and with two or more sections it owns first use: while EVERY section is proven empty it shows one
// first-use card instead of a row of empty cards. The card keeps every section's primary action (the first is its own,
// the next two are secondaries, the rest go in ⋯), and each section keeps its notices and promise above it.
import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActionMenu, type MenuAction } from '../../overlays/Menu';
import { EmptyState } from '../../states/States';
import { useStrings } from '../../strings';
import kitStrings from '../../strings.en.json';
import { ActionControl } from './ActionBar';
import { Heading, HeadingLevel, StrictScope } from './Heading';
import { cardActionId, cardOwnId, useFocusFollow } from './focusFollow';
import { markElement } from './provenance';
import { isLinkSpec, type AnyAction, type SectionGroupProps, type SectionState } from './types';
import s from './anatomy.module.css';

interface Member {
  empty: boolean;
  primary?: AnyAction;
  /** Where the section is in the document (its element, or its marker while the group is collapsed). */
  place: () => Element | null;
}

interface GroupApi {
  register(id: string, m: Member): void;
  unregister(id: string): void;
  collapsed: boolean;
}

const GroupContext = createContext<GroupApi | null>(null);

/** Every shown property of a primary (its callback is read at press time, so a new closure needs no render). */
const actionSig = (a: AnyAction | undefined): string =>
  a === undefined ? '' : isLinkSpec(a) ? ['L', a.id, a.label, a.name, a.href, a.icon, a.literal].join('\u0002') : ['A', a.id, a.label, a.name, a.icon, a.opens, a.busy, a.disabledReason, a.tone, a.literal].join('\u0002');

/** The members in document order: a keyed reorder of existing sections keeps their Map entries
 *  where they were, so insertion order would keep the card's primaries in the old order. A member not in the document
 *  yet keeps its insertion place after the placed ones. */
const ordered = (members: ReadonlyMap<string, Member>): Array<[string, Member]> => {
  // Document order is only defined inside one tree: members are grouped by their root (the document, or a shadow root a
  // portal drew them into) in first-seen order, then each group is sorted, so the comparator never mixes trees.
  const trees = new Map<Node, Array<[string, Member, Element]>>();
  const rest: Array<[string, Member]> = [];
  for (const [id, m] of members) {
    const el = m.place();
    if (!el?.isConnected) {
      rest.push([id, m]);
      continue;
    }
    const root = el.getRootNode();
    const tree = trees.get(root) ?? [];
    tree.push([id, m, el]);
    trees.set(root, tree);
  }
  const placed = [...trees.values()].flatMap((tree) =>
    tree.sort((a, b) => (a[2] === b[2] ? 0 : a[2].compareDocumentPosition(b[2]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)),
  );
  return [...placed.map(([id, m]): [string, Member] => [id, m]), ...rest];
};

/** What changes the group's card: membership, order, emptiness and each section's primary as shown. */
const signatureOf = (members: ReadonlyMap<string, Member>): string =>
  ordered(members).map(([id, m]) => `${id}\u0001${m.empty ? 1 : 0}\u0001${actionSig(m.primary)}`).join('\u0000');

/** A section joins the group around it (if any); `collapsed` tells it to show only its notices and promise. `place` goes
 *  on the section's outermost element in every state (its marker when collapsed), so the group reads document order. */
export function useGroupMember(id: string, state: SectionState | undefined, primary: AnyAction | undefined): { collapsed: boolean; place: (el: Element | null) => void } {
  const group = useContext(GroupContext);
  const empty = state?.kind === 'empty';
  const el = useRef<Element | null>(null);
  const place = useCallback((node: Element | null) => {
    el.current = node;
  }, []);
  useLayoutEffect(() => {
    group?.register(id, { empty, primary, place: () => el.current });
  });
  useLayoutEffect(() => () => group?.unregister(id), [group, id]);
  return { collapsed: group?.collapsed ?? false, place };
}

const asMenuItem = (a: Exclude<AnyAction, { href: string }>): MenuAction => ({
  id: a.id,
  // A menu item has one name: the fuller one when the action has it, so folding keeps its context.
  label: a.name ?? a.label,
  tone: a.tone,
  isDisabled: a.disabledReason !== undefined || a.busy === true,
  disabledReason: a.disabledReason,
  opens: a.opens === 'dialog',
  onAction: a.onPress,
});

export function SectionGroup({ title, firstUse, children }: SectionGroupProps) {
  const t = useStrings(kitStrings);
  const titleId = useId();
  const members = useRef(new Map<string, Member>());
  const [signature, setSignature] = useState('');
  const sync = useCallback(() => {
    const next = signatureOf(members.current);
    setSignature((prev) => (prev === next ? prev : next));
  }, []);
  // A reorder that re-renders neither the group nor the moved sections (memoised sections, or wrappers holding them,
  // under a component of the page's own) runs no member layout effect: the DOM moves are noticed here instead.
  // Any move that changes two members' order moves a node holding one of them under a
  // parent that also holds it, so watching every ancestor of every member (childList only) sees it, inside the group,
  // in a portal or in a shadow root alike. A node moved into a parent not yet watched is seen by its removal from a
  // watched one, so any record re-reads every member's ancestors (watching the new ones) before it syncs. A member
  // taken out of the document by other code (React unregisters its own removals first) may come back later under a
  // parent nobody watches, so while one is out the group looks again on a timer, sooner then slower (16 ms doubling to
  // 1 s), until it is back, unregistered or the group unmounts. The observer is made
  // on first use: members register in their layout effects, before the group's own effect runs.
  const observer = useRef<MutationObserver | null>(null);
  const watch = useCallback((el: Element | null) => {
    const mo = observer.current;
    if (!el || !mo) return;
    for (let n = el.parentNode; n; n = n.parentNode) mo.observe(n, { childList: true });
  }, []);
  const away = useRef<{ timer: ReturnType<typeof setTimeout> | null; gone: boolean }>({ timer: null, gone: false });
  /** Watches every member's ancestors again and syncs; true while one of them is out of the document. */
  const reread = useCallback((): boolean => {
    let out = false;
    for (const m of members.current.values()) {
      const el = m.place();
      if (el && !el.isConnected) out = true;
      else watch(el);
    }
    sync();
    return out;
  }, [sync, watch]);
  const lookAgain = useCallback(
    (delay: number) => {
      const a = away.current;
      if (a.timer !== null || a.gone) return;
      a.timer = setTimeout(() => {
        a.timer = null;
        if (!a.gone && reread()) lookAgain(Math.min(delay * 2, 1000));
      }, delay);
    },
    [reread],
  );
  const watchMember = useCallback(
    (el: Element | null) => {
      // No element, nothing to watch (a terminal section has none): the global is never read then (strict globals).
      if (!el || typeof MutationObserver === 'undefined') return;
      observer.current ??= new MutationObserver(() => {
        if (reread()) lookAgain(16);
      });
      watch(el);
    },
    [reread, lookAgain, watch],
  );
  const register = useCallback(
    (id: string, m: Member) => {
      members.current.set(id, m);
      watchMember(m.place());
      sync();
    },
    [sync, watchMember],
  );
  // The card's buttons call the section's CURRENT callback: the ref is refreshed on every section render.
  const latest = useCallback(
    (id: string, a: AnyAction): AnyAction => (isLinkSpec(a) ? { ...a, id: cardActionId(id, a.id) } : { ...a, id: cardActionId(id, a.id), onPress: () => {
      const cur = members.current.get(id)?.primary;
      if (cur && !isLinkSpec(cur)) cur.onPress();
    } }),
    [],
  );
  const unregister = useCallback(
    (id: string) => {
      members.current.delete(id);
      sync();
    },
    [sync],
  );
  // Disconnected on unmount, its timer cleared; a disconnected observer observes again when the members next register
  // (StrictMode's second pass).
  useLayoutEffect(() => {
    const a = away.current;
    a.gone = false;
    return () => {
      observer.current?.disconnect();
      a.gone = true;
      if (a.timer !== null) clearTimeout(a.timer);
      a.timer = null;
    };
  }, []);
  const list = ordered(members.current).map(([id, m]) => ({ ...m, primary: m.primary && latest(id, m.primary) }));
  if (import.meta.env.DEV && signature !== '' && list.length >= 2 && !firstUse) throw new Error(`SectionGroup${title ? ` "${title}"` : ''}: two or more sections need a \`firstUse\` spec`);
  const collapsed = firstUse !== undefined && list.length >= 2 && list.every((m) => m.empty);
  const api = useMemo<GroupApi>(() => ({ register, unregister, collapsed }), [register, unregister, collapsed]);
  // Focus follows a section's primary onto the first-use card when the group collapses, and back when it opens.
  const follow = useFocusFollow(collapsed);

  let card: ReactNode = null;
  if (collapsed && firstUse) {
    // `none` gives the card no main action; the sections' primaries stay on it as secondaries (first use never drops one).
    const own = firstUse.action !== undefined && firstUse.action !== 'primary' && firstUse.action !== 'none' ? [{ ...firstUse.action, id: cardOwnId(firstUse.action.id) }] : [];
    const actions = [...own, ...list.flatMap((m) => (m.primary ? [m.primary] : []))];
    const [main, more] = firstUse.action === 'none' ? [undefined, actions] : [actions[0], actions.slice(1)];
    const secondaries = more.slice(0, 2);
    const rest = more.slice(2);
    const links = rest.filter(isLinkSpec);
    const menu = rest.filter((a): a is Exclude<AnyAction, { href: string }> => !isLinkSpec(a)).map(asMenuItem);
    // Under a group title the card is that titled body's empty state, so its title is not a heading (as
    // with a strict section's empty title): a second h2 beside the group's own title would claim the same level.
    // An untitled group has no heading of its own, so there the card keeps its heading.
    const state = (
      <EmptyState
        size="sm"
        icon={firstUse.icon}
        title={firstUse.title}
        body={firstUse.body}
        action={main && <ActionControl action={main} variant="primary" />}
        secondary={
          secondaries.length + links.length + menu.length > 0 || firstUse.learn ? (
            <>
              {[...secondaries, ...links].map((a) => (
                <ActionControl key={a.id} action={a} variant="secondary" />
              ))}
              {menu.length > 0 && <ActionMenu items={menu} label={t('action.more')} />}
              {firstUse.learn && <ActionControl action={{ ...firstUse.learn, id: cardOwnId(firstUse.learn.id) }} variant="secondary" />}
            </>
          ) : undefined
        }
      />
    );
    card = (
      <div className={s.firstUse} data-hub-state="firstUse">
        {title ? <StrictScope>{state}</StrictScope> : state}
      </div>
    );
  }

  const body = (
    <GroupContext.Provider value={api}>
      {card}
      {children}
    </GroupContext.Provider>
  );
  return (
    <div
      ref={(el) => {
        follow.root.current = el;
        markElement(el);
      }}
      className={s.group}
      role="group"
      aria-labelledby={title ? titleId : undefined}
      data-hub-group=""
      onFocus={follow.onFocus}
      onBlur={follow.onBlur}
    >
      {title ? (
        <>
          <div className={s.groupHead}>
            <Heading id={titleId}>{title}</Heading>
          </div>
          <HeadingLevel>{body}</HeadingLevel>
        </>
      ) : (
        body
      )}
    </div>
  );
}
