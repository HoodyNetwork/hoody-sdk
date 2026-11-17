// @vitest-environment node
// Share rows as the Hub reads them: only the computer-named shape, nothing guessed.
import { describe, expect, it } from 'vitest';
import { ATLAS_ID, GRANITE_ID, incomingWire, listAnswer, shareWire } from './fixtures';
import { mountPathOk, shareAnswerOf, shareListOf, shareRowOf } from './wire';

describe('shareRowOf', () => {
  it('reads a published share', () => {
    expect(shareRowOf(shareWire({ expires_at: 1_800_000_000 }))).toEqual({
      id: 'sh_0001', sourceComputerId: ATLAS_ID, sourcePath: '/home/ada/projects', mountPath: '/hoody/shares/projects-3f9a1c2e',
      targetType: 'computer', targetComputerId: GRANITE_ID, targetProjectId: null, mode: 'readonly', enabled: true,
      status: 'active', statusMessage: null, expiresAt: 1_800_000_000, expiryKnown: true,
    });
  });
  it('reads the receiver view, which has no alias, label or description', () => {
    expect(shareRowOf(incomingWire())?.id).toBe('sh_0001');
  });
  it('an answer without mount_path reads as not known (null), never as the source path', () => {
    const { mount_path: _m, ...rest } = shareWire();
    expect(shareRowOf(rest)?.mountPath).toBeNull();
    expect(shareRowOf(shareWire({ mount_path: null }))?.mountPath).toBeNull();
  });
  it('the old container-named shape is not read', () => {
    const { source_computer_id: _s, target_computer_id: _t, ...rest } = shareWire();
    expect(shareRowOf({ ...rest, source_container_id: ATLAS_ID, target_container_id: GRANITE_ID, target_type: 'container' })).toBeNull();
  });
  it('a project share reads its project, never a computer', () => {
    const row = shareRowOf(shareWire({ target_type: 'project', target_computer_id: null, target_project_id: 'p1' }));
    expect(row).toMatchObject({ targetType: 'project', targetProjectId: 'p1', targetComputerId: null });
    expect(shareRowOf(shareWire({ target_type: 'project', target_project_id: null }))).toBeNull();
    expect(shareRowOf(shareWire({ target_type: 'computer', target_computer_id: null }))).toBeNull();
  });
  it('a target id of the other kind is dropped, not kept', () => {
    expect(shareRowOf(shareWire({ target_project_id: 'p1' }))?.targetProjectId).toBeNull();
  });
  it.each([
    ['no id', { id: undefined }], ['an empty id', { id: '' }], ['no source path', { source_path: undefined }],
    ['an unknown mode', { mode: 'rw' }], ['enabled as a string', { enabled: 'true' }], ['no enabled', { enabled: undefined }],
    ['an unknown target type', { target_type: 'everyone' }], ['not an object', null],
  ])('refuses a row with %s', (_why, over) => {
    expect(shareRowOf(over === null ? null : shareWire(over))).toBeNull();
  });
  it('enabled as 1 or 0 reads as a boolean (a SQLite integer that escaped toJSON)', () => {
    expect(shareRowOf(shareWire({ enabled: 1 }))?.enabled).toBe(true);
    expect(shareRowOf(shareWire({ enabled: 0 }))?.enabled).toBe(false);
  });
  it('a status the API does not publish reads as other, never as active', () => {
    expect(shareRowOf(shareWire({ status: 'pending' }))?.status).toBe('other');
    expect(shareRowOf(shareWire({ status: undefined }))?.status).toBe('other');
    expect(shareRowOf(shareWire({ status: 'failed' }))?.status).toBe('failed');
  });
  it('expires_at: null is no end, finite seconds are an end; anything else is an end not known', () => {
    expect(shareRowOf(shareWire({ expires_at: null }))).toMatchObject({ expiresAt: null, expiryKnown: true });
    expect(shareRowOf(shareWire({ expires_at: 0 }))).toMatchObject({ expiresAt: 0, expiryKnown: true });
    expect(shareRowOf(shareWire({ expires_at: 1_800_000_000 }))).toMatchObject({ expiresAt: 1_800_000_000, expiryKnown: true });
    for (const bad of ['1800000000', Number.NaN, Number.POSITIVE_INFINITY, undefined, {}]) {
      expect(shareRowOf(shareWire({ expires_at: bad }))).toMatchObject({ expiresAt: null, expiryKnown: false });
    }
    const { expires_at: _x, ...absent } = shareWire();
    expect(shareRowOf(absent)).toMatchObject({ expiresAt: null, expiryKnown: false });
  });
  it('an empty status message reads as none', () => {
    expect(shareRowOf(shareWire({ status_message: '' }))?.statusMessage).toBeNull();
  });
});

describe('shareListOf and shareAnswerOf', () => {
  it('reads every row and counts the ones it could not read', () => {
    const list = shareListOf(listAnswer(shareWire(), shareWire({ id: 'sh_x', mode: 'rw' }), shareWire({ id: 'sh_0009' })));
    expect(list?.rows.map((r) => r.id)).toEqual(['sh_0001', 'sh_0009']);
    expect(list?.dropped).toBe(1);
  });
  it('an answer with no array under data is no list (null), not an empty one', () => {
    expect(shareListOf({ data: {} })).toBeNull();
    expect(shareListOf(null)).toBeNull();
    expect(shareListOf({ data: [] })).toEqual({ rows: [], dropped: 0 });
  });
  it('a create or update answer is one share under data', () => {
    expect(shareAnswerOf({ statusCode: 201, data: shareWire() })?.id).toBe('sh_0001');
    expect(shareAnswerOf({ statusCode: 200, message: 'Storage share deleted.' })).toBeNull();
  });
});

describe('mountPathOk (the API vectors)', () => {
  it.each([
    ['/hoody/shares/data-0123abcd', true],
    ['/hoody/shares/data-0123456789abcdef', true],
    ['/hoody/shares/data-0123abc', false],
    ['/hoody/shares/data-0123456789abcdef0', false],
    ['/hoody/shares/a/b-0123abcd', false],
    ['/hoody/shares/..-0123abcd', false],
    ['/hoody/shares/.x-0123abcd', false],
    ['/hoody/containers/x-0123abcd', false],
    ['/data', false],
    ['hoody/shares/data-0123abcd', false],
  ])('%s is %s', (p, ok) => {
    expect(mountPathOk(p)).toBe(ok);
  });
  it('a name of 40 characters passes, 41 does not; an upper-case suffix does not', () => {
    expect(mountPathOk(`/hoody/shares/${'a'.repeat(40)}-0123abcd`)).toBe(true);
    expect(mountPathOk(`/hoody/shares/${'a'.repeat(41)}-0123abcd`)).toBe(false);
    expect(mountPathOk('/hoody/shares/data-0123ABCD')).toBe(false);
  });
  it('a name holding .. inside is refused', () => {
    expect(mountPathOk('/hoody/shares/a..b-0123abcd')).toBe(false);
  });
});
