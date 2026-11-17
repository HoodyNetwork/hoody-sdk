// Where a computer is pinned on the Welcome's world map: one table from its server's country code to a place, in
// percent of the map (x from the west edge, y from the top). Each place is a main city of that country, not the
// server's exact site: the list gives a country, nothing finer. A country not listed has no pin.

export interface MapPlace {
  x: number;
  y: number;
}

/** Longitude and latitude of each country's place. */
const SITES: Readonly<Record<string, readonly [lon: number, lat: number]>> = {
  AU: [151.2, -33.9],
  BR: [-46.6, -23.6],
  CA: [-79.4, 43.7],
  CH: [8.5, 47.4],
  DE: [8.7, 50.1],
  ES: [-3.7, 40.4],
  FI: [24.9, 60.2],
  FR: [2.4, 48.9],
  GB: [-0.1, 51.5],
  HK: [114.2, 22.3],
  IE: [-6.3, 53.3],
  IN: [72.9, 19.1],
  IT: [9.2, 45.5],
  JP: [139.7, 35.7],
  KR: [127.0, 37.6],
  NL: [4.9, 52.4],
  PL: [21.0, 52.2],
  SE: [18.1, 59.3],
  SG: [103.8, 1.35],
  US: [-77.5, 39.0],
};

// The map's projection: longitude is linear over the width; latitude is linear too, the equator 58 % down.
const EQUATOR = 58.03;
const PER_DEGREE = 0.6806;
const round = (n: number): number => Math.round(n * 10) / 10;

/** The place of a country code on the map, or undefined for a code the table does not hold (or no code). */
export function mapPlaceOf(country: string | undefined): MapPlace | undefined {
  const site = country ? SITES[country.toUpperCase()] : undefined;
  if (!site) return undefined;
  return { x: round(((site[0] + 180) / 360) * 100), y: round(EQUATOR - site[1] * PER_DEGREE) };
}

/** The codes the table holds. */
export const MAP_COUNTRIES: readonly string[] = Object.keys(SITES);
