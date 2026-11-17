// SplitLayout: the AI tab's frame rule, once, for the tab, the dock and tiles.
// Nothing overlays the conversation. Below 840 the list and the conversation take turns, and Details is a sheet that
// takes the whole page; at m and l Details takes the pane's place; at xl and xxl pane, conversation and Details sit
// side by side. A slot the rule hides stays mounted (hidden), so a draft, a scroll position and a focus survive.
import type { ReactNode } from 'react';
import { isSmall, type SizeClass } from './useSizeClass';
import s from './SplitLayout.module.css';

export type DetailsMode = 'none' | 'sheet' | 'column';
export interface SplitState {
  pane: boolean;
  main: boolean;
  details: DetailsMode;
}

/** Which slots show. `screen` matters below 840 only: the list, or the conversation. */
export function splitState(size: SizeClass, o: { detailsOpen: boolean; screen?: 'list' | 'conversation' }): SplitState {
  if (isSmall(size)) {
    if (o.detailsOpen) return { pane: false, main: false, details: 'sheet' };
    return o.screen === 'list' ? { pane: true, main: false, details: 'none' } : { pane: false, main: true, details: 'none' };
  }
  if (!o.detailsOpen) return { pane: true, main: true, details: 'none' };
  return { pane: size === 'xl' || size === 'xxl', main: true, details: 'column' };
}

export interface SplitLayoutProps {
  size: SizeClass;
  detailsOpen: boolean;
  screen?: 'list' | 'conversation';
  pane: ReactNode;
  main: ReactNode;
  details?: ReactNode;
}

export function SplitLayout({ size, detailsOpen, screen, pane, main, details }: SplitLayoutProps) {
  const st = splitState(size, { detailsOpen: detailsOpen && details !== undefined, screen });
  return (
    <div className={s.root} data-size={size} data-details={st.details}>
      <div className={s.pane} hidden={!st.pane}>{pane}</div>
      <div className={s.main} hidden={!st.main}>{main}</div>
      {details !== undefined && <div className={s.details} hidden={st.details === 'none'}>{details}</div>}
    </div>
  );
}
