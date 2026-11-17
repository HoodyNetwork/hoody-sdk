// Vitest: the Images view's pure rules. Every field of the three wire shapes has a malformed case that makes the whole
// answer unreadable; contradictions are refused; the proofs answer only from fresh lists.
import { describe, expect, it } from 'vitest';
// fixtures.ts first: it imports this fixture file and calls its rules, so it must start the cycle.
import './fixtures';
import { CATALOGUE, DOWNLOADS, IMAGES, NO_CATALOGUE } from './fixtures.images';
import {
  downloadAction, downloadGoneProved, downloadsPollMs, DOWNLOADS_FAST_MS, DOWNLOADS_SLOW_MS, imageErrKey, imageGoneProved, imageReasonKey, linkCheck, linkHost,
  parseCatalogue, parseDownload, parseDownloads, parseImages, shaCheck, shortSha,
} from './images-logic';
import strings from './strings.en.json';

type Row = Record<string, unknown>;
const A = 'a'.repeat(64), B = 'b'.repeat(64);
const J1 = '1'.repeat(32), J9 = '9'.repeat(32);
const image: Row = { sha256: A, phase: 'ready', bytes: 10, part_size: 8, modified_unix: 5, media: { volume_id: ' Vol ', os: [{ id: 'x', name: ' Debian 13 ', arch: 'x86_64', live: false, installer: true }] } };
const job: Row = { id: J1, state: 'running', url: 'https://site.example/a.iso?key=secret', fetched_bytes: 3, expected_bytes: 9 };
const without = (r: Row, k: string): Row => Object.fromEntries(Object.entries(r).filter(([x]) => x !== k));

describe('parseImages', () => {
  it('reads the fixture store', () => {
    const out = parseImages(IMAGES);
    expect(out?.map((i) => [i.system, i.volumeId, i.phase, i.bootable])).toEqual([
      ['Debian 13', 'Debian 13.1.0 amd64 n', 'ready', true],
      [null, 'CCCOMA_X64FRE_EN-US_DV9', 'ready', null],
      ['Ubuntu 24.04', 'Ubuntu-Server 24.04.1 LTS arm64', 'ready', false],
      [null, null, 'uploading', null],
    ]);
  });
  it('trims what the image says about itself', () => {
    expect(parseImages([image])).toEqual([{ sha256: A, phase: 'ready', bytes: 10, modifiedUnix: 5, system: 'Debian 13', volumeId: 'Vol', bootable: true }]);
  });
  it.each([
    ['not a list', { items: [] }],
    ['sha256 upper case', [{ ...image, sha256: 'A'.repeat(64) }]],
    ['sha256 short', [{ ...image, sha256: 'abc' }]],
    ['phase unknown', [{ ...image, phase: 'done' }]],
    ['bytes negative', [{ ...image, bytes: -1 }]],
    ['bytes a string', [{ ...image, bytes: '10' }]],
    ['part_size missing', [without(image, 'part_size')]],
    ['modified_unix fractional', [{ ...image, modified_unix: 1.5 }]],
    ['next_part a string', [{ ...without(image, 'media'), phase: 'uploading', next_part: '3' }]],
    ['media not an object', [{ ...image, media: [] }]],
    ['media.os missing', [{ ...image, media: { volume_id: 'v' } }]],
    ['media.volume_id a number', [{ ...image, media: { volume_id: 3, os: [] } }]],
    ['os entry without id', [{ ...image, media: { os: [{ live: false, installer: true }] } }]],
    ['os entry live not a flag', [{ ...image, media: { os: [{ id: 'x', live: 'no', installer: true }] } }]],
    ['os entry installer missing', [{ ...image, media: { os: [{ id: 'x', live: false }] } }]],
    ['os entry name a number', [{ ...image, media: { os: [{ id: 'x', live: false, installer: true, name: 3 }] } }]],
    ['os entry arch a number', [{ ...image, media: { os: [{ id: 'x', live: false, installer: true, arch: 3 }] } }]],
    // Contradictions.
    ['a ready image with a part left to send', [{ ...image, next_part: 4 }]],
    ['an uploading image that already says what it is', [{ ...image, phase: 'uploading' }]],
    ['two rows under one identity', [image, image]],
  ])('unreadable: %s', (_n, wire) => {
    expect(parseImages(wire)).toBeNull();
  });
  it('shortSha is the first 12 digits', () => {
    expect(shortSha(A)).toBe('a'.repeat(12));
  });
});

describe('parseDownloads', () => {
  it('reads one job in each state, and keeps only the site of the link', () => {
    const out = parseDownloads(DOWNLOADS);
    expect(out?.map((d) => d.state)).toEqual(['running', 'running', 'verifying', 'ready', 'failed', 'interrupted']);
    expect(out?.[0]).toMatchObject({ host: 'releases.ubuntu.com', expectedBytes: 2600 * 1024 ** 2, sha256: null, checked: null });
    expect(out?.[1]?.expectedBytes).toBeNull();
    expect(out?.[3]).toMatchObject({ sha256: A, checked: false });
    expect(out?.[4]?.error).toBe('the site answered 404 for this link');
    expect(JSON.stringify(parseDownload(job))).not.toContain('secret');
  });
  it('a checked download says so', () => {
    expect(parseDownload({ ...job, state: 'ready', sha256: A, verification: 'asserted' })?.checked).toBe(true);
  });
  it.each([
    ['not an object', 'x'],
    ['id not 32 hex', { ...job, id: 'abc' }],
    ['state unknown', { ...job, state: 'paused' }],
    ['url missing', without(job, 'url')],
    ['fetched_bytes negative', { ...job, fetched_bytes: -2 }],
    ['expected_bytes a string', { ...job, expected_bytes: '9' }],
    ['sha256 malformed', { ...job, state: 'ready', sha256: 'zz' }],
    ['error a number', { ...job, error: 5 }],
    ['verification unknown', { ...job, verification: 'maybe' }],
    // Contradictions.
    ['done without the image it became', { ...job, state: 'ready' }],
    ['an image named before it is done', { ...job, sha256: A }],
  ])('unreadable: %s', (_n, wire) => {
    expect(parseDownload(wire)).toBeNull();
    expect(parseDownloads([wire])).toBeNull();
  });
  it('a list that is not a list, or names one job twice, is unreadable', () => {
    expect(parseDownloads({})).toBeNull();
    expect(parseDownloads([job, job])).toBeNull();
  });
  it('linkHost: web links only', () => {
    expect(linkHost('https://a.example:8443/x')).toBe('a.example:8443');
    expect(linkHost('ftp://a.example/x')).toBe('');
    expect(linkHost('nope')).toBe('');
  });
  it('what a row offers, and how often the list is read', () => {
    expect(downloadAction({ state: 'running' })).toBe('cancel');
    expect(downloadAction({ state: 'verifying' })).toBe('wait');
    for (const state of ['ready', 'failed', 'cancelled', 'interrupted'] as const) expect(downloadAction({ state })).toBe('clear');
    expect(downloadsPollMs([{ state: 'ready' }, { state: 'verifying' }])).toBe(DOWNLOADS_FAST_MS);
    expect(downloadsPollMs([{ state: 'failed' }])).toBe(DOWNLOADS_SLOW_MS);
    expect(downloadsPollMs(undefined)).toBe(DOWNLOADS_SLOW_MS);
  });
});

describe('parseCatalogue', () => {
  const entry = (m: Row, e: Row = {}): Row => ({ arch: 'x86_64', available: true, status: 'healthy', unreadable: 0, entries: [{ id: 'i', name: 'Sys', media: [{ url: 'https://s.example/a.iso', arch: 'x86_64', live: false, installer: true, identifiable: true, ...m }], ...e }] });
  it('keeps only what can start here, sorted by name', () => {
    expect(parseCatalogue(CATALOGUE)).toEqual({
      available: true,
      choices: [
        { url: 'https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-13.1.0-amd64-netinst.iso', name: 'Debian 13', variant: 'netinst', live: false },
        { url: 'https://releases.ubuntu.com/24.04/ubuntu-24.04.1-live-server-amd64.iso', name: 'Ubuntu 24.04', variant: 'server', live: true },
      ],
    });
    expect(parseCatalogue(NO_CATALOGUE)).toEqual({ available: false, choices: [] });
  });
  it('leaves out a link that could not be sent, an unnamed system and a repeated link', () => {
    expect(parseCatalogue(entry({ url: 'ftp://s.example/a.iso' }))?.choices).toEqual([]);
    expect(parseCatalogue(entry({ url: 'https://user:pw@s.example/a.iso' }))?.choices).toEqual([]);
    expect(parseCatalogue(entry({}, { name: ' ' }))?.choices).toEqual([]);
    expect(parseCatalogue(entry({}, { name: undefined, short_id: 'sys1' }))?.choices[0]?.name).toBe('sys1');
    const twice = entry({});
    (twice.entries as Row[]).push((twice.entries as Row[])[0]!);
    expect(parseCatalogue(twice)?.choices).toHaveLength(1);
  });
  it.each([
    ['not an object', []],
    ['entries missing', { ...NO_CATALOGUE, entries: undefined }],
    ['available not a flag', { ...NO_CATALOGUE, available: 'no' }],
    ['status unknown', { ...NO_CATALOGUE, status: 'fine' }],
    ['unreadable negative', { ...NO_CATALOGUE, unreadable: -1 }],
    ['arch a number', { ...NO_CATALOGUE, arch: 5 }],
    ['entry id missing', { ...CATALOGUE, entries: [{ media: [] }] }],
    ['entry media missing', { ...CATALOGUE, entries: [{ id: 'i' }] }],
    ['entry name a number', entry({}, { name: 4 })],
    ['entry short_id a number', entry({}, { short_id: 4 })],
    ['media url missing', entry({ url: undefined })],
    ['media live not a flag', entry({ live: 1 })],
    ['media installer not a flag', entry({ installer: null })],
    ['media identifiable missing', entry({ identifiable: undefined })],
    ['media arch a number', entry({ arch: 64 })],
    ['media variant a number', entry({ variant: 1 })],
    // Contradictions.
    ['available with no list', { ...NO_CATALOGUE, available: true }],
    ['healthy with lost files', { ...CATALOGUE, unreadable: 2 }],
  ])('unreadable: %s', (_n, wire) => {
    expect(parseCatalogue(wire)).toBeNull();
  });
});

describe('what the person types', () => {
  it('linkCheck', () => {
    expect(linkCheck('  ')).toBe('empty');
    expect(linkCheck(' https://a.example/x.iso ')).toBe('ok');
    expect(linkCheck('http://a.example/x.iso')).toBe('ok');
    for (const bad of ['ftp://a.example/x', 'a.example/x', 'https://u:p@a.example/x', 'https://u@a.example/x', 'https://a.example/a b', `https://a.example/${'x'.repeat(2100)}`]) expect(linkCheck(bad)).toBe('invalid');
  });
  it('shaCheck', () => {
    expect(shaCheck(' ')).toBeNull();
    expect(shaCheck(` ${'AB'.repeat(32)} `)).toBe('ab'.repeat(32));
    expect(shaCheck('abc')).toBeUndefined();
    expect(shaCheck('g'.repeat(64))).toBeUndefined();
  });
});

describe('proofs', () => {
  const im = (sha256: string) => ({ sha256 });
  it('an image delete is proved only by fresh lists that all lack it', () => {
    expect(imageGoneProved({ image: A }, [[[im(B)]]])).toBe('applied');
    expect(imageGoneProved({ image: A }, [[[im(B)], [im(A)]]])).toBeUndefined();
    expect(imageGoneProved({ image: A }, [[[im(A)]]])).toBeUndefined();
    // No fresh list, an answer that is not a list, an identity that names no image: no verdict.
    expect(imageGoneProved({ image: A }, [[]])).toBeUndefined();
    expect(imageGoneProved({ image: A }, [])).toBeUndefined();
    expect(imageGoneProved({ image: A }, [[null]])).toBeUndefined();
    expect(imageGoneProved({ image: 'nope' }, [[[]]])).toBeUndefined();
    expect(imageGoneProved(null, [[[]]])).toBeUndefined();
  });
  it('a download removal is proved by the job gone or cancelled in every fresh list', () => {
    const cancel = { job: J1, how: 'cancel' }, clear = { job: J1, how: 'clear' };
    expect(downloadGoneProved(cancel, [[[{ id: J9, state: 'running' }]]])).toBe('applied');
    expect(downloadGoneProved(cancel, [[[{ id: J1, state: 'cancelled' }]]])).toBe('applied');
    expect(downloadGoneProved(cancel, [[[{ id: J1, state: 'running' }]]])).toBeUndefined();
    expect(downloadGoneProved(cancel, [[[], [{ id: J1, state: 'ready' }]]])).toBeUndefined();
    // A clear is proved by absence only: a row that was already cancelled and is still listed was not cleared.
    expect(downloadGoneProved(clear, [[[{ id: J1, state: 'cancelled' }]]])).toBeUndefined();
    expect(downloadGoneProved(clear, [[[{ id: J1, state: 'ready' }]]])).toBeUndefined();
    expect(downloadGoneProved(clear, [[[{ id: J9, state: 'cancelled' }]]])).toBe('applied');
    // An identity that does not say which of the two it was proves nothing.
    expect(downloadGoneProved({ job: J1 }, [[[]]])).toBeUndefined();
    expect(downloadGoneProved({ job: J1, how: 'other' }, [[[]]])).toBeUndefined();
    expect(downloadGoneProved(cancel, [[]])).toBeUndefined();
    expect(downloadGoneProved({ job: 'x', how: 'clear' }, [[[]]])).toBeUndefined();
  });
});

describe('refusals', () => {
  it('every sentence the view names exists, and no other code has one', () => {
    for (const [change, code] of [['add', 'SpecInvalid'], ['add', 'AlreadyExists'], ['add', 'OperationInProgress'], ['remove', 'BadState'], ['remove', 'OperationInProgress'], ['remove', 'NotFound'], ['stop', 'BadState'], ['stop', 'NotFound']] as const) {
      const key = imageErrKey(change, code);
      expect(key).toBe(`images.err.${change}.${code}`);
      expect(strings[key!]).toBeTruthy();
    }
    expect(imageErrKey('stop', 'SpecInvalid')).toBeNull();
    expect(imageErrKey('add', 'InsufficientSpace')).toBeNull();
    expect(imageErrKey('add', undefined)).toBeNull();
  });
  it('a 5xx reason is a note of a held change, never a refusal', () => {
    expect(strings[imageReasonKey('InsufficientSpace')!]).toBeTruthy();
    expect(strings[imageReasonKey('DownloadFailed')!]).toBeTruthy();
    expect(imageReasonKey('BadState')).toBeNull();
  });
});
