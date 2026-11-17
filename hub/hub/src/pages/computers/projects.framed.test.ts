// A project's access rules hold the credentials that open every computer in it, so a framed page never reads
// or changes them: the entry in public/auth/shared.js's FRAMED_SENSITIVE_ROUTES (read here from the real file).
import { describe, expect, it } from 'vitest';
import { loadShared } from '@core/test/env';

describe('project access rules: framed pages', () => {
  it("a framed page never reads or changes a project's rules; its members and the project itself stay readable", () => {
    const sh = loadShared();
    const pid = 'e'.repeat(24);
    for (const m of ['GET', 'PUT', 'POST', 'DELETE']) expect(sh.framedSensitiveRoute(m, `/projects/${pid}/proxy/permissions`)).not.toBeNull();
    expect(sh.framedSensitiveRoute('PUT', `/projects/${pid}/proxy/permissions/groups/team/password`)).not.toBeNull();
    expect(sh.framedSensitiveRoute('GET', `/projects/${pid}/proxy/permissions?x=1`)).not.toBeNull();
    expect(sh.framedSensitiveRoute('GET', `/projects/${pid}/permissions`)).toBeNull();
    expect(sh.framedSensitiveRoute('GET', `/projects/${pid}`)).toBeNull();
  });

  it("a framed page never reads or changes one computer's rules either; the computer itself stays readable", () => {
    const sh = loadShared();
    const id = 'c'.repeat(24);
    for (const m of ['GET', 'PUT', 'POST', 'DELETE']) expect(sh.framedSensitiveRoute(m, `/computers/${id}/proxy/permissions`)).not.toBeNull();
    expect(sh.framedSensitiveRoute('PUT', `/computers/${id}/proxy/permissions/groups/team/password`)).not.toBeNull();
    expect(sh.framedSensitiveRoute('GET', `/computers/${id}/proxy/permissions?x=1`)).not.toBeNull();
    expect(sh.framedSensitiveRoute('GET', `/computers/${id}`)).toBeNull();
  });
});
