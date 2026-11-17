// One group of actions: at most one primary and two secondaries, the rest in
// ⋯. When the content gets narrow (below 600 px, the same line as the kit's `@container content` rules) the action
// secondaries MOVE into ⋯; links stay where they are, because a menu item cannot be a link. One function decides what
// is shown and what is in the menu, so the bar and its menu never both hold an action.
import { useCallback, useId } from 'react';
import { Button, cx, LinkButton } from '../../controls/Button';
import { useContentNarrow } from '../../media';
import { ActionMenu, type MenuList } from '../../overlays/Menu';
import { useStrings } from '../../strings';
import kitStrings from '../../strings.en.json';
import { useFocusFollow } from './focusFollow';
import { markElement } from './provenance';
import { ReasonButton } from './ReasonButton';
import { actionShape, assertDistinct, assertDistinctList, FOLD_BELOW, splitActions, SUGGESTIONS_MAX } from './actionSplit';
import { isLinkSpec, type AnyAction, type SectionActions } from './types';
import s from './anatomy.module.css';

export { FOLD_BELOW, splitActions };
export type { BarSplit } from './actionSplit';

/** One action as a kit control: a link, a reason button, or a button. */
export function ActionControl({ action, variant, size = 'md' }: { action: AnyAction; variant: 'primary' | 'secondary'; size?: 'sm' | 'md' }) {
  if (isLinkSpec(action))
    return (
      <LinkButton href={action.href} variant={variant} size={size} icon={action.icon} literal={action.literal} aria-label={action.name} data-action-id={action.id}>
        {action.label}
      </LinkButton>
    );
  if (action.disabledReason !== undefined)
    return (
      <ReasonButton reason={action.disabledReason} name={action.name} variant={variant} size={size} actionId={action.id} literal={action.literal} dismiss={action.dismiss}>
        {action.label}
      </ReasonButton>
    );
  return (
    <Button
      variant={variant}
      tone={action.tone}
      size={size}
      icon={action.icon}
      busy={action.busy}
      literal={action.literal}
      {...(action.dismiss ? { chip: false } : {})}
      aria-label={action.name}
      aria-haspopup={action.opens}
      data-action-id={action.id}
      onPress={action.onPress}
    >
      {action.label}
    </Button>
  );
}

export interface InlineActionsProps {
  /** Secondaries, in order: with the primary, one to three in all. */
  actions: readonly AnyAction[];
  /** The row's main action (a form's "Put in the code"), drawn last as the primary. Never folded either: beside it the
   *  secondaries stay where they answer it, as an ActionBar would not keep them below 600 px. */
  primary?: AnyAction;
  /** Actions past the three, least used first out (a band's Discard beside three fixes): the kit's More menu, drawn after
   *  the primary. The three drawn stay; only these fold. */
  more?: MenuList;
  /** The group's accessible name, needed once there is more than one control ("Actions for this outcome"); one action
   *  draws no group, so a label beside it is not used. */
  label?: string;
  size?: 'sm' | 'md';
}

/** Actions that stay on their line at every width (K-actionbar-inline): one to three that answer what is right above
 *  them, such as a field's "Use <free address>" or an outcome's own buttons. An ActionBar folds its secondaries into
 *  More below 600 px of content; these never fold, since behind More they would leave the thing they answer. They
 *  wrap onto a second line instead. A row's own primary (a form's "Put in the code") is drawn last; a page's primary
 *  stays in its section's ActionBar. At most three are drawn: a fourth, the least used, goes in `more`, the kit's More
 *  menu. */
export function InlineActions({ actions, primary, more = [], label, size = 'sm' }: InlineActionsProps) {
  const t = useStrings(kitStrings);
  // An action that turns disabled (Discard once the draft is cleared) is drawn as a ReasonButton, a new element: focus
  // follows it there, as it follows a primary the anatomy moves.
  const shape = actionShape([...actions, primary]);
  const follow = useFocusFollow(shape);
  const count = actions.length + (primary ? 1 : 0);
  if (import.meta.env.DEV) {
    if (count > 3) throw new Error(`InlineActions: ${count} actions; at most 3 stay inline (more go in a section's ActionBar)`);
    if (count + (more.length > 0 ? 1 : 0) > 1 && !label) throw new Error('InlineActions: more than one action needs a group label');
    assertDistinctList([primary, ...actions], more);
  }
  if (count === 0 && more.length === 0) return null;
  // One action answers the line above it and is no group, label or not; a More menu beside it makes one.
  const group = count + (more.length > 0 ? 1 : 0) > 1;
  return (
    <div
      ref={(el) => {
        follow.root.current = el;
      }}
      onFocus={follow.onFocus}
      onBlur={follow.onBlur}
      role={group ? 'group' : undefined}
      aria-label={group ? label : undefined}
      className={s.inline}
      data-hub-inline-actions=""
    >
      {actions.map((a) => (
        <ActionControl key={a.id} action={a} variant="secondary" size={size} />
      ))}
      {primary && <ActionControl action={primary} variant="primary" size={size} />}
      {more.length > 0 && <ActionMenu items={more} label={t('action.more')} size={size} />}
    </div>
  );
}

export { SUGGESTIONS_MAX };

export interface SuggestionActionsProps {
  /** The row's visible name ("Examples"); the list is labelled by it. */
  label: string;
  /** The suggestions, in order, every one drawn: one to eight. */
  actions: readonly AnyAction[];
  size?: 'sm' | 'md';
}

/** A labelled row of suggestions that are all shown (K-suggestion-chips): each is a shortcut for what is right above it,
 *  such as an example that fills a description. Unlike InlineActions (at most three that answer a line) and ActionBar
 *  (two secondaries, the rest in More), nothing folds and there is no primary: hiding examples behind More would leave
 *  only some of them to pick from. The row wraps onto more lines instead, with the same rules as InlineActions, so a
 *  long label wraps its own words and is never cut. */
export function SuggestionActions({ label, actions, size = 'sm' }: SuggestionActionsProps) {
  const id = useId();
  const shape = actionShape(actions);
  const follow = useFocusFollow(shape);
  if (import.meta.env.DEV) {
    if (actions.length > SUGGESTIONS_MAX) throw new Error(`SuggestionActions: ${actions.length} suggestions; at most ${SUGGESTIONS_MAX} (a longer list is a choice: a Select or a menu)`);
    if (!label.trim()) throw new Error('SuggestionActions: the row needs a visible label');
    assertDistinctList(actions);
  }
  if (actions.length === 0) return null;
  return (
    <div className={s.suggest} data-hub-suggestions="">
      <span className={s.suggestLabel} id={id}>
        {label}
      </span>
      <ul
        ref={(el) => {
          follow.root.current = el;
        }}
        onFocus={follow.onFocus}
        onBlur={follow.onBlur}
        aria-labelledby={id}
        className={cx(s.inline, s.suggestList)}
      >
        {actions.map((a) => (
          <li key={a.id}>
            <ActionControl action={a} variant="secondary" size={size} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ActionBarProps extends SectionActions {
  /** The group's accessible name ("Actions for this log line"). */
  label: string;
  size?: 'sm' | 'md';
  /** The primary is not drawn here (a Section moves it into its empty state). */
  withoutPrimary?: boolean;
}

export function ActionBar({ label, size = 'md', withoutPrimary, ...actions }: ActionBarProps) {
  if (import.meta.env.DEV) assertDistinct(actions);
  const t = useStrings(kitStrings);
  // The fold reads the `content` container the bar sits in, as the kit's `@container content` rules beside it do (the AI
  // tab's main region beside its rail, not the whole page region).
  const [anchor, narrow] = useContentNarrow(FOLD_BELOW);
  const bar = useCallback(
    (el: HTMLDivElement | null) => {
      markElement(el);
      anchor(el);
    },
    [anchor],
  );
  const { primary, shown, menu } = splitActions(actions, narrow);
  const drawn = withoutPrimary ? undefined : primary;
  if (!drawn && shown.length === 0 && menu.length === 0) return null;
  return (
    <div ref={bar} role="group" aria-label={label} className={s.bar} data-hub-action-group="">
      {shown.map((a) => (
        <ActionControl key={a.id} action={a} variant="secondary" size={size} />
      ))}
      {drawn && <ActionControl action={drawn} variant="primary" size={size} />}
      {menu.length > 0 && <ActionMenu items={menu} label={t('action.more')} size={size} />}
    </div>
  );
}
