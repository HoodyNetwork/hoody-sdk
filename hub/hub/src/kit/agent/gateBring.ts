// gateBring: a request, from the frame around a transcript (ConversationView.term: Activity's Show), to bring one gate's card
// into view and put focus on its first control. The terminal transcript (SessionView.term) reads it; the web frame finds the
// card in the DOM instead. `n` counts requests, so asking for the same gate twice brings it twice.
import { createContext } from 'react';

export interface GateBring { id: string | null; n: number }
export const GateBringContext = createContext<GateBring>({ id: null, n: 0 });
