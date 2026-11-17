// A strip of quiet header actions joined into one row of plates with one shared line between them, beside the page's
// primary. Use it instead of loose secondary buttons when a header has two or more quiet actions. The strip is a named
// group; the buttons inside keep their own names, menus, tooltips and focus ring. A kit Button or IconButton inside reads
// the strip from context and takes the strip look itself (Button.module.css .inStrip), so a page never restyles a button.
// A strip whose buttons all render nothing draws nothing.
import { createContext, useContext, type ReactNode } from 'react';
import s from './ButtonStrip.module.css';

const StripContext = createContext(false);

/** True inside a ButtonStrip: Button and IconButton take the strip look. */
export function useInButtonStrip(): boolean {
  return useContext(StripContext);
}

/** Ends the strip for its children: an overlay a strip button opens is a new surface, so the buttons in it keep their
 * own look. CardScopeReset calls it; the overlays that wrap their content in it are Popover (popover and phone sheet),
 * Dialog, Drawer and ActionMenu (tray and popover). Raw popovers (Qr, FilterChips, IpInfo, InfoTip, DataTable, the
 * forms "more") do not wrap their content in it: reset them before a strip holds one. */
export function StripScopeReset({ children }: { children: ReactNode }) {
  return <StripContext.Provider value={false}>{children}</StripContext.Provider>;
}

export interface ButtonStripProps {
  /** The group's accessible name (a resolved string). */
  label: string;
  children: ReactNode;
}

export function ButtonStrip({ label, children }: ButtonStripProps) {
  return (
    <div role="group" aria-label={label} className={s.strip} data-button-strip="">
      <StripContext.Provider value>{children}</StripContext.Provider>
    </div>
  );
}
