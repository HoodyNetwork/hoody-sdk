// The __ID__ page's data: its queries and mutations, declared in one place.
// The scaffold reads fixtures through fixtureSource. A live page moves these hooks onto @core (coreSource over
// its routes, or defineQuery/defineMutation) and keeps their names and types.
import { fixtureSource } from '@app/fixtures';

export interface Plan {
  id: string;
  name: string;
  /** Monthly price in cents. */
  priceCents: number;
  /** One line on what the plan gives ("2 cores, 4 GB"). */
  detail: string;
}

export interface Existing {
  id: string;
  name: string;
}

export interface CreateRequest {
  name: string;
  planId: string;
}

const source = fixtureSource('__ID__');

export function usePlans() {
  return source.useQuery<Plan[]>('plans');
}

/** What already exists: name checks before sending, and the read-back of an unknown create. */
export function useExisting() {
  return source.useQuery<Existing[]>('existing');
}

/** Create the item. Its answer is a C9 outcome: `pending` means "may have gone through". */
export function useCreate() {
  return source.useMutation<Existing, CreateRequest>('create');
}
