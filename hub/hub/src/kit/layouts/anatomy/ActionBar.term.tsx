// ActionBar in the terminal (the web's ActionBar.tsx): the same rule from actionSplit.ts. At most one primary and two
// secondaries are drawn, the rest in ⋯. When the pane is narrow (below FOLD_BELOW at 8 px a column), action secondaries
// fold into ⋯; links stay. InlineActions never fold and wrap instead; SuggestionActions draws every suggestion under its
// label. Controls are the kit's terminal Button / LinkButton, so each says its name and its disabled reason in the tree.
// The web's focus-follow (a control turning into a ReasonButton keeps the focus) is DOM-only: here an action is one
// Button whatever its state, so a control that turns soft-disabled while its send is out, and back, keeps the focus.
import { useId } from 'react';
import type * as Web from './ActionBar';
import { Box, Text } from '../../../term/prim';
import { Button, LinkButton } from '../../controls/Button';
import { ActionMenu } from '../../overlays/Menu';
import { useContentNarrow } from '../../media';
import { useStrings } from '../../strings';
import kitStrings from '../../strings.en.json';
import { assertDistinct, assertDistinctList, FOLD_BELOW, splitActions, SUGGESTIONS_MAX } from './actionSplit';
import { ButtonWrap, SoftPressNotice } from '../../controls/termPress';
import { isLinkSpec } from './types';

export type { BarSplit } from './actionSplit';
export type { InlineActionsProps, SuggestionActionsProps, ActionBarProps } from './ActionBar';
export { FOLD_BELOW, splitActions, SUGGESTIONS_MAX };

export const ActionControl: typeof Web.ActionControl = ({ action, variant, size = 'md' }) => {
  if (isLinkSpec(action))
    return (
      <LinkButton href={action.href} variant={variant} size={size} {...(action.name ? { 'aria-label': action.name } : {})}>
        {action.label}
      </LinkButton>
    );
  // One tree in both states. Drawn as a ReasonButton while it has a reason (its notice provider around a Button) and as a
  // bare Button otherwise, the control was a new one at each change: the focused "Take a snapshot" lost the focus the
  // moment its press turned it off, and Tab started again from the top. With a reason it is what ReasonButton draws: the
  // soft-disabled Button, no tone, icon or busy mark, a press heard by nobody.
  const reason = action.disabledReason;
  const on = reason === undefined;
  return (
    <SoftPressNotice.Provider value={undefined}>
      <Button
        variant={variant}
        {...(on && action.tone ? { tone: action.tone } : {})}
        size={size}
        {...(on && action.icon ? { icon: action.icon } : {})}
        {...(on && action.busy ? { busy: action.busy } : {})}
        {...(action.name ? { 'aria-label': action.name } : {})}
        {...(on ? { onPress: action.onPress } : { isDisabled: true, disabledReason: reason })}
      >
        {action.label}
      </Button>
    </SoftPressNotice.Provider>
  );
};

export const InlineActions: typeof Web.InlineActions = ({ actions, primary, more = [], label, size = 'sm' }) => {
  const t = useStrings(kitStrings);
  const count = actions.length + (primary ? 1 : 0);
  if (import.meta.env.DEV) {
    if (count > 3) throw new Error(`InlineActions: ${count} actions; at most 3 stay inline (more go in a section's ActionBar)`);
    if (count + (more.length > 0 ? 1 : 0) > 1 && !label) throw new Error('InlineActions: more than one action needs a group label');
    assertDistinctList([primary, ...actions], more);
  }
  if (count === 0 && more.length === 0) return null;
  const group = count + (more.length > 0 ? 1 : 0) > 1;
  return (
    // A label that is data wraps inside its button (ButtonWrap), never "…", as the web's `.inline > *` row.
    <ButtonWrap.Provider value>
    <Box dir="row" wrap gapX={1} gapY={0} shrink={0} {...(group ? { sem: { role: 'group' as const, ...(label ? { name: label } : {}) } } : {})}>
      {actions.map((a) => <ActionControl key={a.id} action={a} variant="secondary" size={size} />)}
      {primary ? <ActionControl action={primary} variant="primary" size={size} /> : null}
      {more.length > 0 ? <ActionMenu items={more} label={t('action.more')} size={size} /> : null}
    </Box>
    </ButtonWrap.Provider>
  );
};

export const SuggestionActions: typeof Web.SuggestionActions = ({ label, actions, size = 'sm' }) => {
  const id = useId();
  if (import.meta.env.DEV) {
    if (actions.length > SUGGESTIONS_MAX) throw new Error(`SuggestionActions: ${actions.length} suggestions; at most ${SUGGESTIONS_MAX} (a longer list is a choice: a Select or a menu)`);
    if (!label.trim()) throw new Error('SuggestionActions: the row needs a visible label');
    assertDistinctList(actions);
  }
  if (actions.length === 0) return null;
  return (
    <Box dir="column" shrink={0}>
      <Box shrink={0} sem={{ id }}><Text colour="muted">{label}</Text></Box>
      <ButtonWrap.Provider value>
      <Box dir="row" wrap gapX={1} gapY={0} shrink={0} sem={{ role: 'list', labelledBy: id }}>
        {actions.map((a) => (
          // Shrinks to the row's width so a long suggestion wraps inside its button (ButtonWrap).
          <Box key={a.id} shrink={1} minWidth={0} sem={{ role: 'listitem' }}>
            <ActionControl action={a} variant="secondary" size={size} />
          </Box>
        ))}
      </Box>
      </ButtonWrap.Provider>
    </Box>
  );
};

export const ActionBar: typeof Web.ActionBar = ({ label, size = 'md', withoutPrimary, ...actions }) => {
  if (import.meta.env.DEV) assertDistinct(actions);
  const t = useStrings(kitStrings);
  const [, narrow] = useContentNarrow(FOLD_BELOW);
  const { primary, shown, menu } = splitActions(actions, narrow);
  const drawn = withoutPrimary ? undefined : primary;
  if (!drawn && shown.length === 0 && menu.length === 0) return null;
  return (
    <Box dir="row" wrap gapX={1} gapY={0} shrink={0} sem={{ role: 'group', name: label }}>
      {shown.map((a) => <ActionControl key={a.id} action={a} variant="secondary" size={size} />)}
      {drawn ? <ActionControl action={drawn} variant="primary" size={size} /> : null}
      {menu.length > 0 ? <ActionMenu items={menu} label={t('action.more')} size={size} /> : null}
    </Box>
  );
};
