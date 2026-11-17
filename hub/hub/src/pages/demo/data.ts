// The demo page's data: its queries and mutations, declared in one place.
// The demo page is a template sample: it reads fixtures through core's pageFixtures (fixture builds only). A page with a live API declares its
// data with core's defineQuery/defineMutation.
import { pageFixtures } from '@core';

export type ItemStatus = 'active' | 'paused' | 'failed';

export interface Item {
  id: string;
  name: string;
  status: ItemStatus;
  owner: string;
  /** ISO time. */
  updatedAt: string;
  sizeBytes: number;
}

const source = pageFixtures('demo')!;

export function useItems() {
  return source.useQuery<Item[]>('items');
}

/** Rename an item. Its answer is a C9 outcome: `pending` means "may have gone through". */
export function useSaveItem() {
  return source.useMutation<Item, { id: string; name: string }>('save');
}
