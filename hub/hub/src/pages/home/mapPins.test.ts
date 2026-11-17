// Vitest: the Welcome map's one table from a server's country code to its place on the map.
import { describe, expect, it } from 'vitest';
import { isLand } from '../../kit/widgets/worldDots';
import { MAP_COUNTRIES, mapPlaceOf } from './mapPins';

describe('mapPlaceOf', () => {
  it('Singapore is where the design pins it: 78.8 % across, 57.1 % down', () => {
    expect(mapPlaceOf('SG')).toEqual({ x: 78.8, y: 57.1 });
  });

  it('reads the code in either case', () => {
    expect(mapPlaceOf('sg')).toEqual(mapPlaceOf('SG'));
  });

  it('an unknown, empty or absent code has no place (no pin)', () => {
    expect(mapPlaceOf('ZZ')).toBeUndefined();
    expect(mapPlaceOf('')).toBeUndefined();
    expect(mapPlaceOf(undefined)).toBeUndefined();
    // A name that is on every object is not a country.
    expect(mapPlaceOf('constructor')).toBeUndefined();
  });

  it('every place is inside the map', () => {
    for (const code of MAP_COUNTRIES) {
      const place = mapPlaceOf(code);
      expect(place, code).toBeDefined();
      expect(place!.x, code).toBeGreaterThan(0);
      expect(place!.x, code).toBeLessThan(100);
      expect(place!.y, code).toBeGreaterThan(0);
      expect(place!.y, code).toBeLessThan(100);
    }
  });

  it('west is left of east and north is above south', () => {
    const us = mapPlaceOf('US')!;
    const de = mapPlaceOf('DE')!;
    const jp = mapPlaceOf('JP')!;
    const au = mapPlaceOf('AU')!;
    const fi = mapPlaceOf('FI')!;
    expect(us.x).toBeLessThan(de.x);
    expect(de.x).toBeLessThan(jp.x);
    expect(fi.y).toBeLessThan(de.y);
    expect(de.y).toBeLessThan(au.y);
  });

  it('every place is on or beside land of the dotted map (the table and the map share one projection)', () => {
    for (const code of MAP_COUNTRIES) {
      const place = mapPlaceOf(code)!;
      const col = Math.floor((place.x / 100) * 125);
      const row = Math.floor((place.y / 100) * 54);
      let near = false;
      for (let dc = -2; dc <= 2; dc++) for (let dr = -2; dr <= 2; dr++) near ||= isLand(col + dc, row + dr);
      expect(near, code).toBe(true);
    }
  });
});
