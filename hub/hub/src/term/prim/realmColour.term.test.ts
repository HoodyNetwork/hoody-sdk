// The realm colour table lives in prim (pages reach it as `@term/prim`) and names exactly the kit's display colours.
import { expect, test } from 'bun:test';
import type { RealmColor } from '@kit/data/Display';
import { REALM_HEX, realmHex, type RealmColourName } from './realmColour';
import * as page from './page';
import * as shell from '../shell/realmColour';

// Both directions: a colour added to the kit and not here (or the reverse) is a type error.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const same: Same<RealmColor, RealmColourName> = true;

test('one table: the page barrel and the shell path give the same object; null and unknown give undefined', () => {
  expect(same).toBe(true);
  expect(page.REALM_HEX).toBe(REALM_HEX);
  expect(shell.REALM_HEX).toBe(REALM_HEX);
  expect(page.realmHex('teal')).toBe('#26ffea');
  expect(realmHex(null)).toBeUndefined();
  expect(realmHex(undefined)).toBeUndefined();
});
