// The shape of a page's shots.ts (rendered by `bun run hub:shots --page <id>`). Each shot is
// one named state; the runner renders it at 1440 light, 1920 light, 1440 dark, 1100 light, 768
// light and 390 light, plus any `extra` variants (1024 light with the sidebar rail; 1440 light with the Ask dock
// open; 768 dark for a page whose tablet layout needs a dark check).
export interface Shot {
  /** File-name-safe name, unique in the page. */
  name: string;
  /** Fixture state (defaults to the fixtures' default). */
  state?: string;
  /** 'all' or a realm id of the world (default Personal). */
  realm?: string;
  /** false boots with no current computer. */
  computer?: false;
  /** Appended to the page path: '?sel=item-02', '/settings?tab=keys'. */
  path?: string;
  /** Text that must be visible before the shot is taken. */
  waitForText?: string;
  /** Press these keys (Playwright key names) after load, e.g. ['j', 'j', 'Enter']. */
  keys?: readonly string[];
  /** After load, click a button or link with this accessible name, or a Playwright selector ('role=checkbox >> nth=1', 'text=…'). */
  click?: string;
  /**
   * Steps run after load (and after click/keys): perform the action the state is named after.
   * A state named pending, unknown or failed must act and end with that kit Outcome line visible.
   * Targets are an accessible name or a Playwright selector ('role=…', 'text=…', 'css=…').
   */
  act?: readonly ActStep[];
  /** A reviewed reason why an outcome-named state shows no Outcome line (rare). */
  noOutcome?: string;
  /** The state opens scrolled on purpose (a deep link to a section or anchor): the terminal page gate
   *  (scripts/term/goldens.ts) then does not fail it as `scrolled-open`. The web runner ignores it. */
  scrolled?: boolean;
  /** Extra variants for this shot. */
  extra?: readonly ('1024-light' | '1440-dock' | '768-dark' | '1350-light' | '1350-dark' | '3440-light' | '3440-dark' | '390-dark')[];
}

export type ActStep =
  | { click: string }
  | { hover: string }
  | { fill: string; text: string }
  | { press: string }
  | { waitFor: string };

export type Shots = readonly Shot[];
