// Rail mode: entering the AI tab draws the Hub sidebar as its rail when the viewport is under
// 1560 px (the AI pane and the page need the room); leaving gives back the person's own setting. A toggle made while on
// the AI tab wins until they leave, and is never saved: their own setting is only what they chose elsewhere.

/** Whether a path is in the AI tab. */
export const onAiTab = (path: string): boolean => path === '/ai' || path.startsWith('/ai/');

/** Whether the sidebar draws as its rail: `own` is the person's setting, `choice` a toggle made on the AI tab. */
export function railCollapsed(o: { own: boolean; onAi: boolean; xl: boolean; choice: boolean | null }): boolean {
  if (!o.onAi) return o.own;
  if (o.choice !== null) return o.choice;
  return o.own || !o.xl;
}
