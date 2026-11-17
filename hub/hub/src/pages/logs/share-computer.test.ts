// Vitest: "Copy link" says it opens these logs for anyone with access to this computer, so the link names the
// computer. It still leaves out what someone typed, the port and the run.
import { expect, it } from 'vitest';
import { DEFAULT_VIEW, hrefFor, shareSearch, viewFromSearch } from './logic';

it('the copied link names the computer and keeps the view', () => {
  const v = { ...DEFAULT_VIEW, source: 'visits' as const, severity: 'failed' as const, search: 'token=abc', port: 8081, exec: 'run-1' };
  const sp = shareSearch(v, 'atlas.00a1');
  expect(sp).toEqual({ src: 'visits', sev: 'failed', computer: 'atlas.00a1' });
  expect(hrefFor('/logs', sp)).toContain('computer=atlas.00a1');
  expect(viewFromSearch(sp)).toMatchObject({ source: 'visits', severity: 'failed', search: '', port: null });
});

it('no handle known: the link is the view alone', () => {
  expect(shareSearch(DEFAULT_VIEW, '')).toEqual({});
});
