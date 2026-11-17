// The __ID__ page's data: its queries and mutations, declared in one place.
// The scaffold reads fixtures through fixtureSource. A live page moves these hooks onto @core (coreSource over
// its routes, or defineQuery/defineMutation) and keeps their names and types.
import { fixtureSource } from '@app/fixtures';

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

const source = fixtureSource('__ID__');

export function useItems() {
  return source.useQuery<Item[]>('items');
}

/** Rename an item. Its answer is a C9 outcome: `pending` means "may have gone through". */
export function useSaveItem() {
  return source.useMutation<Item, { id: string; name: string }>('save');
}
