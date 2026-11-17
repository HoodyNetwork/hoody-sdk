// The page's own table. A layout that holds one page-wide table (kit TablePage) says so with TableHome, and that
// table takes the first focus even when the page body scrolls (a FAQ under it), as a table filling its pane does, so
// ↓ moves its row cursor as soon as the page opens. A table in a section (Account's sign-in sessions) never sees it.
// The first focus is 'auto' (focus.ts): it never scrolls the page body.
import { createContext, createElement, useContext, type ReactElement, type ReactNode } from 'react';

const Home = createContext(false);

/** Marks what it holds as the page's table area (one per page). */
export function TableHome({ children }: { children?: ReactNode }): ReactElement {
  return createElement(Home.Provider, { value: true }, children);
}

/** True inside a TableHome: the table there is the page's own. */
export const useTableHome = (): boolean => useContext(Home);
