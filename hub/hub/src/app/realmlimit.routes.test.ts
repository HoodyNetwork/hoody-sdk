// The routes whose write can carry a realm the account does not use yet list the Realm limit's code: a secret route
// (computer create) keeps only the codes it lists, and the refusal is never one of a route's "may still be
// under way" codes: it is definite, shown once and never sent again.
import { describe, expect, it } from 'vitest';
import { REALM_LIMIT_CODE } from '@core';
import { CREATE_CODES, routes as computers } from '../pages/computers/routes';
import { TOKEN_MINT_CODES } from '@core';
import { routes as keys } from '../pages/keys/routes';
import { routes as realms } from '../pages/realms/routes';

describe('the Realm limit code on the routes', () => {
  it('every write that can carry a new realm lists the code (a secret route keeps only listed codes)', () => {
    expect(CREATE_CODES).toContain(REALM_LIMIT_CODE);
    expect(computers.create.codes).toContain(REALM_LIMIT_CODE);
    expect(computers.setRealms.codes).toEqual([REALM_LIMIT_CODE]);
    expect(realms.setRealms.codes).toEqual([REALM_LIMIT_CODE]);
    // Keys, shares and Bot URLs are not counted: their writes are never refused by the limit, so they do not list it.
    expect(TOKEN_MINT_CODES).not.toContain(REALM_LIMIT_CODE);
    expect(keys.update.codes ?? []).not.toContain(REALM_LIMIT_CODE);
    expect(computers.projectCreate.codes).toEqual([REALM_LIMIT_CODE]);
    for (const r of [computers.create, computers.setRealms, realms.setRealms, computers.projectCreate]) expect(r.unknownCodes ?? []).not.toContain(REALM_LIMIT_CODE);
  });
});
