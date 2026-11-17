// scriptOfLink: the script a public link (an exec alias) opens, for pages that show a link without the Scripts page
// (Programs' Ports & aliases tab). Found in the link's folder's script list by the same match as the script's own Public
// link list; when several scripts answer the path, the one Exec routes to; nothing for a gone script or a caller-picked path.
import { describe, expect, it } from 'vitest';
import { scriptOfLink } from './links';

const rows = [
  { path: 'default/1/probe-ai.ts' },
  { path: 'default/1/users/me.ts' },
  { path: 'default/1/users/[id].ts' },
  { path: 'default/1/api/weather.ts', magicComments: { label: 'Weather' } },
  { path: 'default/1/_sdk/helper.ts' },
  { path: 'default/1/readme.md' },
  { path: 'default/2/report.ts' },
];

describe('scriptOfLink', () => {
  it('names the script a path opens as the Scripts page lists it: its label, else its file name in words', () => {
    expect(scriptOfLink(rows, { index: 1, target: '/probe-ai' })).toEqual({ rootRel: 'default/1/probe-ai.ts', name: 'Probe ai' });
    expect(scriptOfLink(rows, { index: 1, target: '/api/weather?city=x' })).toEqual({ rootRel: 'default/1/api/weather.ts', name: 'Weather' });
  });

  it('picks the script Exec routes to: a plain address before a parameter', () => {
    expect(scriptOfLink(rows, { index: 1, target: '/users/me' })?.rootRel).toBe('default/1/users/me.ts');
    expect(scriptOfLink(rows, { index: 1, target: '/users/42' })?.rootRel).toBe('default/1/users/[id].ts');
  });

  it('is null for a path no listed script answers, for another folder, for a non-script file and for a caller-picked path', () => {
    expect(scriptOfLink(rows, { index: 1, target: '/old-report' })).toBeNull();
    expect(scriptOfLink(rows, { index: 1, target: '/report' })).toBeNull();
    expect(scriptOfLink(rows, { index: 2, target: '/report' })?.rootRel).toBe('default/2/report.ts');
    expect(scriptOfLink(rows, { index: 1, target: '/_sdk/helper' })).toBeNull();
    expect(scriptOfLink(rows, { index: 1, target: '/readme' })).toBeNull();
    expect(scriptOfLink(rows, { index: 1, target: '/probe-ai', anyPath: true })).toBeNull();
  });

  it('is null when two scripts of the same kind answer the path (no guess)', () => {
    expect(scriptOfLink([{ path: 'default/1/a/[x].ts' }, { path: 'default/1/a/[y].ts' }], { index: 1, target: '/a/1' })).toBeNull();
  });
});
