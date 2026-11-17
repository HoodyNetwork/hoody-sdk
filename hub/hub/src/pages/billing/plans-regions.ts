// Where a paid plan's server can run. The list is the API's own, read per plan (GET /subserver-subscriptions/regions):
// each location with whether a server of that plan can be placed there now. Nothing here names a location the API
// did not list: the plan cards, the Compare plans table and the checkout's Location choice all read this one shape.
import { type commerceRules, listingRules } from '@core';

/** A location a server is or would be in (the region code; country code and city for display, either may be ''). */
export type PaidPlace = commerceRules.PaidPlace;
/** A location of a plan's list, with `available`: a server of that plan can be placed there now. */
export type PaidRegion = commerceRules.PaidRegion;

/** A location as the page words it: "Frankfurt, Germany"; the country alone when no city is named (or the city is the
 *  country's own name); the region code when the API names neither. */
export function placeName(p: PaidPlace): string {
  const country = p.country ? listingRules.countryName(p.country) : '';
  const city = p.city;
  if (city && country) return city.toLowerCase() === country.toLowerCase() ? country : `${city}, ${country}`;
  return city || country || p.region.toUpperCase();
}

/** A location with room, as a plan card's tag or a part of the Compare table's line. */
export interface PlanRegion {
  /** The region code (the row key). */
  id: string;
  /** ISO 3166 country code, for the flag ('' when the API names none). */
  country: string;
  name: string;
}

/** What the Plans view knows about one plan's locations: still being read, not readable, or the list's locations that
 *  have room for the plan now (none: every listed location is full, or none is listed). */
export type PlanRegions = { state: 'loading' } | { state: 'unknown' } | { state: 'refused' } | { state: 'list'; regions: readonly PlanRegion[] };

export const REGIONS_LOADING: PlanRegions = Object.freeze({ state: 'loading' });
export const REGIONS_UNKNOWN: PlanRegions = Object.freeze({ state: 'unknown' });
/** The Hub refused the read itself (an access key without the right): no retry and no other view will list them. */
export const REGIONS_REFUSED: PlanRegions = Object.freeze({ state: 'refused' });

/** One plan's read as the Plans view shows it. A failed read is unknown even when an earlier answer is still held. */
export function planRegions(
  read: { isPending: boolean; isError: boolean; data?: readonly PaidRegion[] | null } | undefined,
  refused = false,
): PlanRegions {
  if (read && read.isError && refused) return REGIONS_REFUSED;
  if (!read || read.isError) return REGIONS_UNKNOWN;
  if (read.isPending || !read.data) return read.isPending ? REGIONS_LOADING : REGIONS_UNKNOWN;
  return { state: 'list', regions: read.data.filter((r) => r.available).map((r) => ({ id: r.region, country: r.country, name: placeName(r) })) };
}
