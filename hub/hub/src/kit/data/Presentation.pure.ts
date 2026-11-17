// The Cards / List choice without its look, shared by Presentation.tsx (web) and Presentation.term.tsx: the remembered
// value of a group, the fit a DataTable toolbar gives the switch it draws, and the kit's default items.
import { createContext } from 'react';
import { localSetting, useLocalSetting, type LocalSetting } from '@core';
import type { IconName } from '../icons';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';

/** How a list draws its rows by the person's choice; inside 'list' the table's width picks table or list rows. */
export type Presentation ='cards' | 'list' | 'icons';

/** One choice of a presentation switch: the page's own words and icon. */
export interface PresentationItem {
  readonly id: Presentation;
  readonly label: string;
  readonly icon: IconName;
}

const CARDS_OR_LIST: readonly Presentation[] = ['cards', 'list'];

const settings = new Map<string, LocalSetting>();
function settingFor(group: string): LocalSetting {
  let s = settings.get(group);
  if (!s) {
    s = localSetting(`hub.v3.table.present.${group}`);
    settings.set(group, s);
  }
  return s;
}

/** The group's remembered choice (`fallback` until one is made) and its setter. Every list using the same group
 *  follows a change at once, in this tab and others. A stored value outside `allowed` (default Cards / List) reads as
 *  the fallback. */
export function usePresentation(group: string, fallback: Presentation = 'list', allowed: readonly Presentation[] = CARDS_OR_LIST): [Presentation, (p: Presentation) => void] {
  const [raw, set] = useLocalSetting(settingFor(group));
  const value: Presentation = allowed.find((p) => p === raw) ?? fallback;
  return [value, (p) => void set(p)];
}

/** How a DataTable toolbar wants its Cards / List switch drawn at its current fit: with words, or as icons alone. */
export type PresentationFit = 'labels' | 'icons';
/** The fit a DataTable toolbar gives the switch it draws; null outside one (the switch then follows the page's width). */
export const PresentationFitContext =createContext<PresentationFit | null>(null);

/** The kit's Cards / List items (the default of every switch). */
export function useCardsOrList(): readonly PresentationItem[] {
  const t = useStrings(kitStrings);
  return [
    { id: 'cards', label: t('table.present.cards'), icon: 'apps' },
    { id: 'list', label: t('table.present.list'), icon: 'menu' },
  ];
}
