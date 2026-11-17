// The cards of the dashboard: the ones other pages contribute through their manifests (kit useContributions) and
// Home's own cards, in the one shape Home arranges, hides and orders them.
import type { ComponentType } from 'react';
import type { WidgetContribution } from '@kit';
import { widgetKey, type HomeMode } from '../logic';

export interface Contribution {
  /** Unique across pages: `<pageId>:<widgetId>`. */
  key: string;
  pageId: string;
  id: string;
  title: string;
  /** Item count shown next to the title ("Bots 3"), when the card reports one. */
  count?: number;
  size: 's' | 'm' | 'l';
  order: number;
  /** Link label when "View all" does not fit. */
  viewLabel?: string;
  /** Where "View all" goes. */
  href: string;
  Component: ComponentType;
}

export type HomeCardId = 'actions' | 'steps' | 'realms' | 'keys';

/** One of Home's own cards: drawn by Home itself (view.tsx), arranged like a page card. */
export interface HomeCard {
  key: string;
  pageId: 'home';
  id: HomeCardId;
  title: string;
  order: number;
}

export type Card = Contribution | HomeCard;

export const isHomeCard = (c: Card): c is HomeCard => c.pageId === 'home' && !('Component' in c);

/** Page cards that only repeat what an empty realm's own empty state already says (no computer here, get one). */
const REPEATS_EMPTY_REALM = new Set([widgetKey('computers', 'your-computer')]);

/** The page cards Home shows in this mode: an empty realm drops the cards that would repeat its empty state. */
export function withoutRepeats<W extends Pick<WidgetContribution, 'pageId' | 'id'>>(widgets: readonly W[], mode: HomeMode): readonly W[] {
  return mode === 'empty-realm' ? widgets.filter((w) => !REPEATS_EMPTY_REALM.has(widgetKey(w.pageId, w.id))) : widgets;
}

export function toContributions(widgets: readonly WidgetContribution[]): Contribution[] {
  return widgets.map((w) => ({
    key: widgetKey(w.pageId, w.id),
    pageId: w.pageId,
    id: w.id,
    title: w.title,
    size: w.size,
    order: w.order,
    href: w.href,
    Component: w.Component,
  }));
}

/** Default places among the page cards (computers 10, bots 20, notifications 40). */
const ORDER: Record<HomeCardId, number> = { actions: 15, steps: 50, realms: 60, keys: 70 };
type TitleKey = 'actions.title' | 'steps.title' | 'realms.title' | 'keys.title';
const TITLE: Record<HomeCardId, TitleKey> = { actions: 'actions.title', steps: 'steps.title', realms: 'realms.title', keys: 'keys.title' };

/** Home's cards that apply now (a card that does not apply is not offered in Customize either). */
export function homeCards(on: Record<HomeCardId, boolean>, t: (key: TitleKey) => string): HomeCard[] {
  return (Object.keys(ORDER) as HomeCardId[]).filter((id) => on[id]).map((id) => ({ key: widgetKey('home', id), pageId: 'home', id, title: t(TITLE[id]), order: ORDER[id] }));
}
