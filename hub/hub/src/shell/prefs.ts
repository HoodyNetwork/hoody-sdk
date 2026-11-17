// Device preferences of the shell: sidebar expanded/rail and theme. Stored per device in
// localStorage only, never a cookie, a server or the account (best effort; refused storage only means
// the choice isn't remembered). The theme key is hub_theme_v1, which fouc.js reads
// before the first paint. The Ask dock's state lives in @kit/ask (pages open it too).
import { useSyncExternalStore } from 'react';

/** The theme drawn (data-hx-theme). */
export type Theme = 'light' | 'dark';
/** The theme chosen: System (the default) follows the device's prefers-color-scheme, live. */
export type ThemeChoice = Theme | 'system';

interface Prefs {
  /** The user's choice; undefined = the viewport default (rail below 1280). */
  collapsed: boolean | undefined;
  /** The theme drawn now. */
  theme: Theme;
  /** The theme chosen: a saved light or dark, else system (nothing saved, or anything else saved). */
  choice: ThemeChoice;
}

const KEY = 'hub.v3.shell';
const THEME_KEY = 'hub_theme_v1';
const DARK = '(prefers-color-scheme: dark)';

function savedChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}
function deviceTheme(): Theme {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK).matches ? 'dark' : 'light';
}
const drawn = (choice: ThemeChoice): Theme => (choice === 'system' ? deviceTheme() : choice);

function read(): Prefs {
  let collapsed: boolean | undefined;
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as { collapsed?: unknown };
    collapsed = typeof raw.collapsed === 'boolean' ? raw.collapsed : undefined;
  } catch {
    /* defaults */
  }
  const choice = savedChoice();
  return { collapsed, theme: drawn(choice), choice };
}

let prefs: Prefs = typeof window === 'undefined' ? { collapsed: undefined, theme: 'light', choice: 'system' } : read();
// A fixture's ?theme= (main.tsx): drawn as given, the device's scheme not followed, nothing saved.
let pinned = false;
const listeners = new Set<() => void>();

function draw(): void {
  document.documentElement.setAttribute('data-hx-theme', prefs.theme);
  for (const l of listeners) l();
}

function commit(next: Partial<Pick<Prefs, 'collapsed' | 'choice'>>): void {
  prefs = { ...prefs, ...next };
  if (next.choice) prefs.theme = drawn(next.choice);
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ collapsed: prefs.collapsed }));
    if (next.choice) window.localStorage.setItem(THEME_KEY, next.choice);
  } catch {
    /* not remembered */
  }
  if (next.choice) {
    pinned = false;
    draw();
  } else for (const l of listeners) l();
}

// While the choice is System, a change of the device's scheme (the OS, or the browser's own setting) redraws the open
// page. Watched from the first subscriber on (a module does nothing at load), for the page's life.
let watching = false;
function watchDevice(): void {
  if (watching || typeof window.matchMedia !== 'function') return;
  watching = true;
  const follow = () => {
    if (pinned || prefs.choice !== 'system') return;
    const theme = deviceTheme();
    if (theme === prefs.theme) return;
    prefs = { ...prefs, theme };
    draw();
  };
  window.matchMedia(DARK).addEventListener('change', follow);
  // The scheme was read when the module loaded and nothing watched it until now: catch up with a switch made between.
  follow();
}

function subscribe(l: () => void): () => void {
  watchDevice();
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Draws the chosen theme now (fixtures mode, where fouc.js has not run). */
export function applyTheme(): void {
  watchDevice();
  draw();
}
/** Draws `theme` and keeps it (a fixture's ?theme=, so shots are deterministic): the device's scheme is not followed
 *  and nothing is saved, until the person picks a theme. */
export function pinTheme(theme: Theme): void {
  pinned = true;
  prefs = { ...prefs, theme };
  draw();
}

export function useShellPrefs() {
  const p = useSyncExternalStore(subscribe, () => prefs, () => prefs);
  return {
    ...p,
    setCollapsed: (collapsed: boolean) => commit({ collapsed }),
    setTheme: (choice: ThemeChoice) => commit({ choice }),
  };
}

/** Matches a media query and follows it: the kit's one hook. */
export { useMedia } from '@kit/media';
