// SectionGroup in the terminal: the same membership and first-use rule as the web group (SectionGroup.tsx), with no DOM.
// A terminal section has no element, so members keep their registration order (the order they mount in) and there is
// no order watch or focus follow. With two or more sections the group shows one first-use card while EVERY section is
// proven empty; the card keeps every section's primary (the first is its own, the next two are secondaries, the rest
// go in ⋯), and each section keeps its notices and promise.
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as Web from './SectionGroup';
import { Box, Text } from '../../../term/prim';
import { ActionMenu, type MenuAction } from '../../overlays/Menu';
import { EmptyState } from '../../states/States';
import { useStrings } from '../../strings';
import kitStrings from '../../strings.en.json';
import { ActionControl } from './ActionBar';
import { HeadingLevel, StrictScope, useHeadingLevel } from './Heading';
import { cardActionId, cardOwnId } from './focusFollow.pure';
import { isLinkSpec, type AnyAction } from './types';

interface Member {
  empty: boolean;
  primary?: AnyAction;
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

/** What changes the group's card: membership, order, emptiness and each section's primary as shown. */
const signatureOf = (members: ReadonlyMap<string, Member>): string =>
  [...members].map(([id, m]) => `${id}\u0001${m.empty ? 1 : 0}\u0001${actionSig(m.primary)}`).join('\u0000');

/** A section joins the group around it (if any); `collapsed` tells it to show only its notices and promise. `place` is
 *  kept for the web signature: a terminal section has no element to give it. */
export const useGroupMember: typeof Web.useGroupMember = (id, state, primary) => {
  const group = useContext(GroupContext);
  const empty = state?.kind === 'empty';
  const place = useCallback((_node: Element | null) => {}, []);
  useLayoutEffect(() => {
    group?.register(id, { empty, primary });
  });
  useLayoutEffect(() => () => group?.unregister(id), [group, id]);
  return { collapsed: group?.collapsed ?? false, place };
};

const asMenuItem = (a: Exclude<AnyAction, { href: string }>): MenuAction => ({
  id: a.id,
  label: a.name ?? a.label,
  tone: a.tone,
  isDisabled: a.disabledReason !== undefined || a.busy === true,
  disabledReason: a.disabledReason,
  opens: a.opens === 'dialog',
  onAction: a.onPress,
});

export const SectionGroup: typeof Web.SectionGroup = ({ title, firstUse, children }) => {
  const t = useStrings(kitStrings);
  const level = Math.min(6, useHeadingLevel() + 1);
  const members = useRef(new Map<string, Member>());
  const [signature, setSignature] = useState('');
  const sync = useCallback(() => {
    const next = signatureOf(members.current);
    setSignature((prev) => (prev === next ? prev : next));
  }, []);
  const register = useCallback(
    (id: string, m: Member) => {
      members.current.set(id, m);
      sync();
    },
    [sync],
  );
  const unregister = useCallback(
    (id: string) => {
      members.current.delete(id);
      sync();
    },
    [sync],
  );
  // The card's buttons call the section's CURRENT callback: the map entry is refreshed on every section render.
  const latest = useCallback(
    (id: string, a: AnyAction): AnyAction => (isLinkSpec(a) ? { ...a, id: cardActionId(id, a.id) } : { ...a, id: cardActionId(id, a.id), onPress: () => {
      const cur = members.current.get(id)?.primary;
      if (cur && !isLinkSpec(cur)) cur.onPress();
    } }),
    [],
  );
  const list = [...members.current].map(([id, m]) => ({ ...m, primary: m.primary && latest(id, m.primary) }));
  if (import.meta.env.DEV && signature !== '' && list.length >= 2 && !firstUse) throw new Error(`SectionGroup${title ? ` "${title}"` : ''}: two or more sections need a \`firstUse\` spec`);
  const collapsed = firstUse !== undefined && list.length >= 2 && list.every((m) => m.empty);
  const api = useMemo<GroupApi>(() => ({ register, unregister, collapsed }), [register, unregister, collapsed]);

  let card: ReactNode = null;
  if (collapsed && firstUse) {
    const own = firstUse.action !== undefined && firstUse.action !== 'primary' && firstUse.action !== 'none' ? [{ ...firstUse.action, id: cardOwnId(firstUse.action.id) }] : [];
    const actions = [...own, ...list.flatMap((m) => (m.primary ? [m.primary] : []))];
    const [main, more] = firstUse.action === 'none' ? [undefined, actions] : [actions[0], actions.slice(1)];
    const secondaries = more.slice(0, 2);
    const rest = more.slice(2);
    const links = rest.filter(isLinkSpec);
    const menu = rest.filter((a): a is Exclude<AnyAction, { href: string }> => !isLinkSpec(a)).map(asMenuItem);
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
    card = title ? <StrictScope>{state}</StrictScope> : state;
  }

  const body = (
    <GroupContext.Provider value={api}>
      {card}
      {children}
    </GroupContext.Provider>
  );
  return (
    <Box dir="column" sem={title ? { role: 'group', name: title } : undefined}>
      {title ? (
        <>
          <Text bold colour="ink" sem={{ role: 'heading', level, name: title }}>{title}</Text>
          <HeadingLevel>{body}</HeadingLevel>
        </>
      ) : (
        body
      )}
    </Box>
  );
};
