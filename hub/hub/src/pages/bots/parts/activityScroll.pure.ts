// The Activity log's follow rule values, shared by the web scroll (activityScroll.ts) and its terminal sibling.
import type { MutableRefObject } from 'react';

/** How near the end counts as the end: about one line of text (the kit's follow rule, kit/agent/SessionView.tsx FOLLOW_LINE). */
export const FOLLOW_LINE = 24;

export const noteSeen = (last: MutableRefObject<{ top: number; height: number }>, sc: HTMLElement) => {
  last.current = { top: sc.scrollTop, height: sc.scrollHeight };
};
export const atEnd = (sc: HTMLElement) => sc.scrollHeight - sc.clientHeight - sc.scrollTop <= FOLLOW_LINE;
export const toEnd = (sc: HTMLElement) => {
  sc.scrollTop = sc.scrollHeight - sc.clientHeight;
};
export const SHOW_GAP = 8;
