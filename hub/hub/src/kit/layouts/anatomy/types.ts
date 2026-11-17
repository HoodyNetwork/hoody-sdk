// The strict page anatomy's descriptors. No
// primitive takes `className` or `style`, and text props are strings: a page describes its sections, the kit draws them.
import type { ReactNode } from 'react';
import type { Fact, Tone } from '../../data/Display';
import type { IconName } from '../../icons';
import type { MenuList } from '../../overlays/Menu';

export interface ActionSpec {
  /** Stable: focus follows it across the head, the empty state and the ⋯ menu. */
  id: string;
  /** The visible label, 1 to 3 words, never cut. */
  label: string;
  /** The accessible name when it says more than the label ("Upgrade to Pro: sunny-red"); it starts with the label. */
  name?: string;
  icon?: IconName;
  onPress: () => void;
  /** It opens a dialog or a menu (aria-haspopup). */
  opens?: 'dialog' | 'menu';
  busy?: boolean;
  /** Set: the action stays focusable but does nothing; the reason shows on focus, hover and tap (ReasonButton). */
  disabledReason?: string;
  tone?: 'default' | 'danger';
  /** The label is data (a name, an id, a path): shown as written, no theme case (the std `literal` rule). */
  literal?: boolean;
  /** It ends or backs out of the flow (Cancel, Back, Close, Not now): no forward glyph. The glyph is for an action that
   *  goes somewhere or continues. */
  dismiss?: boolean;
}

/** A destination: it renders as a real link wherever it is shown, and never folds into a menu. */
export interface LinkSpec {
  id: string;
  label: string;
  name?: string;
  href: string;
  icon?: IconName;
  /** The label is data (a name, an id, a path): shown as written, no theme case (the std `literal` rule). */
  literal?: boolean;
}

export type AnyAction = ActionSpec | LinkSpec;

export const isLinkSpec = (a: AnyAction): a is LinkSpec => 'href' in a;

/** One group of actions (ActionBar, a Section head): at most one primary and two secondaries; the rest go in ⋯. */
export interface SectionActions {
  primary?: AnyAction;
  secondary?: readonly [AnyAction] | readonly [AnyAction, AnyAction];
  menu?: MenuList;
}

export interface EmptySpec {
  title: string;
  body: string;
  /** 'primary' (the default): the section's primary action moves here while the section is empty. */
  action?: AnyAction | 'primary' | 'none';
  learn?: LinkSpec;
  icon?: IconName;
}

declare const wholeBrand: unique symbol;
/** A count of a whole, fresh, unfiltered list. Only core's `wholeCount` makes one; an object literal cannot pose as one. */
export type WholeCount = { readonly total: number; readonly [wholeBrand]: true };

declare const emptyProof: unique symbol;
/** Proof that a list was read whole, fresh and unfiltered, and held nothing. Only core makes one. */
export type EmptyProof = { readonly [emptyProof]: true };

/** What a data section shows. `empty` needs core's proof; the other kinds a page may build. */
export type SectionState =
  | { kind: 'loading'; rows?: number; variant?: 'rows' | 'table' }
  | { kind: 'ready' }
  | { kind: 'empty'; proof: EmptyProof }
  | { kind: 'noMatch'; onClear: () => void }
  | { kind: 'partial'; shown: number; onRecheck: () => void; busy?: boolean }
  | { kind: 'stale'; shown: number; error: unknown; onRetry: () => void; busy?: boolean }
  | { kind: 'unknown'; text: string; onRecheck: () => void; busy?: boolean }
  | { kind: 'failed'; error: unknown; onRetry: () => void; busy?: boolean }
  /** The list cannot be read in the scope shown (All realms, no computer): the kit draws the spec's words where the body
   * goes, never a count. Not a proof of empty, so the head's primary stays off. Its action is the spec's own, if any. */
  | { kind: 'notHere'; title: string; body: string; icon?: IconName; action?: AnyAction; learn?: LinkSpec };

export interface SectionProps {
  /** The anchor: deep links and focusSection(id). */
  id: string;
  title: string;
  /** Shown beside the title only while the state is ready (or absent) and the total is above zero. */
  count?: WholeCount;
  /** One sentence. */
  description?: string;
  /** Always visible: safety, privacy and money promises only. */
  promise?: string;
  /** Supplemental text behind a quiet "About" control; never the only route to a fact. */
  info?: string;
  actions?: SectionActions;
  /** Notice roots only (Band, OutcomeBanner, Outcome). */
  notices?: ReactNode;
  /** Required when the body holds a data leaf. */
  state?: SectionState;
  /** Required when the state can be empty. */
  empty?: EmptySpec;
  note?: string;
  tone?: 'default' | 'danger';
  /** No body padding (a list that runs edge to edge). */
  flush?: boolean;
  children?: ReactNode;
}

export interface SubSectionProps {
  id?: string;
  title: string;
  description?: string;
  actions?: Pick<SectionActions, 'secondary' | 'menu'>;
  state?: SectionState;
  empty?: EmptySpec;
  children?: ReactNode;
}

export interface SectionGroupProps {
  /** The category's title; without it the group only spaces and separates its sections. */
  title?: string;
  /** Required with two or more sections: shown alone while every section is proven empty. */
  firstUse?: EmptySpec;
  children: ReactNode;
}

export interface ItemProps {
  id: string;
  title: string;
  /** The accessible name when the row says more than its title. */
  name?: string;
  /** The row opens something: click or Enter on the row. */
  onOpen?: () => void;
  href?: string;
  leading?: IconName;
  /** An order mark before the title ("3", "2b"), at most 4 characters; a row takes a mark or a leading icon, not both. */
  mark?: string;
  /** The title is data (a name, an id, a path): shown as written, in the code font. */
  mono?: boolean;
  /** A nested row (a branch's step): one or two levels in, rendered as a list nested under the nearest row above it one
   *  level up. The first row is never indented, and a row is at most one level deeper than the row above it. */
  indent?: 1 | 2;
  meta?: readonly [string] | readonly [string, string];
  /** `tip` (at most 200 characters) makes the pill's words an InfoTip that explains the status. */
  status?: { tone: Tone; label: string; tip?: string };
  /** Structured facts under the row (since, reasons, last failure). */
  details?: readonly Fact[];
  actions?: { inline?: readonly [AnyAction] | readonly [AnyAction, AnyAction]; menu?: MenuList };
}

export interface ItemListProps {
  /** The list's accessible name. */
  label: string;
  items: readonly ItemProps[];
}
