// What a ListDetailPage tells the pieces inside it. The list pane tells its DataTable which
// presentation to use (list rows beside a fill-mode detail) and, in side mode, how to follow the
// active row (j/k moves the inspector). The detail pane tells its DetailHeader which pane
// controls to draw (Hide list in fill mode, × in side mode, Back when one pane).
import { createContext, useContext } from 'react';

export interface ListPane {
  /** Set by every ListDetailPage list pane: the table is the page's list, so its empty state takes the table frame's
   * place (kit/states EmptyPlace 'frame'). A table embedded in a section or a rail never sees it. */
  list?: boolean;
  presentation?: 'list';
  /** The list is a left rail, beside a detail or as the whole stacked screen: one grid (kit/tokens.css --rail-*), title
   * alone on line 1, status and meta on line 2, the ⋯ in its own column. DataTable applies it only to list rows. */
  rail?: boolean;
  /** The rail itself is the frame (RailPane): the table draws none of its own. */
  flush?: boolean;
  /** Side mode: the inspector follows the keyboard's active row (debounced by the table). */
  follow?: (id: string) => void;
  /** The row whose detail just closed (`n` grows on every close): the table gives that row the focus, even when it was
   * drawn again (a one-pane list comes back new). Set where the focus cannot be restored by element (the terminal);
   * the web restores its own element and leaves it unset. */
  returnTo?: { id: string; n: number };
}

export interface DetailPane {
  mode: 'fill' | 'side';
  /** One pane shows (the page is narrower than the list and the detail need side by side): the detail's way out is
   *  "‹ <page>", so its header draws no pane control. */
  onePane?: boolean;
  listHidden: boolean;
  toggleList: () => void;
  close: () => void;
}

export const ListPaneContext = createContext<ListPane>({});
export const DetailPaneContext = createContext<DetailPane | null>(null);

export const useListPane = (): ListPane => useContext(ListPaneContext);
export const useDetailPane = (): DetailPane | null => useContext(DetailPaneContext);
