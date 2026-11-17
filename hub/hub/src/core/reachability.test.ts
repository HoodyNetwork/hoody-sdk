// reachOf: the one classifier of a computer read's outcome. Every rule has a case here.
import { describe, expect, it } from 'vitest';
import { reachOf } from './reachability';
import { rejection, notSentRejection } from './kit';
import { errorInfo } from './errors';
import { SourceError } from './source';

const TID = '0123456789abcdef0123456789abcdef';

describe('reachOf: no answer is unreachable', () => {
  it('a kit rejection with no answer (NETWORK or TIMEOUT) is unreachable', () => {
    expect(reachOf(rejection('unreachable', 0, 'NETWORK'))).toBe('unreachable');
    expect(reachOf(rejection('unreachable', 0, 'TIMEOUT'))).toBe('unreachable');
  });

  it('the same rejection labelled by api() (route added) is unreachable', () => {
    expect(reachOf({ ...rejection('unreachable', 0, 'NETWORK'), route: 'GET /x' })).toBe('unreachable');
  });

  it('a source read that got no answer (SourceError network, NETWORK/TIMEOUT) is unreachable', () => {
    expect(reachOf(new SourceError('network', 'NETWORK', null))).toBe('unreachable');
    expect(reachOf(new SourceError('network', 'TIMEOUT', 0))).toBe('unreachable');
  });


  it('a source read whose answer arrived but whose body was lost carries no code, so it is not unreachable', () => {
    expect(reachOf(new SourceError('network', null, null))).toBe('unknown');
  });
});

describe('reachOf: an answer is reachable', () => {
  it('a 4xx or 5xx answer with a body is reachable, not unreachable', () => {
    for (const st of [400, 401, 403, 404, 409, 429, 500, 502, 503, 504]) {
      expect(reachOf(rejection('unavailable', st, 'X'))).toBe('reachable');
      expect(reachOf(errorInfo(rejection('refused', st, null), { page: 'files' }))).toBe('reachable');
    }
  });

  it('a source read that got an answer (any SourceError with an HTTP status) is reachable', () => {
    expect(reachOf(new SourceError('server', null, 503))).toBe('reachable');
    expect(reachOf(new SourceError('forbidden', null, 403))).toBe('reachable');
    expect(reachOf(new SourceError('not_found', null, 404))).toBe('reachable');
  });

  it('a 2xx answer the page could not use is reachable (it answered)', () => {
    expect(reachOf(rejection('unavailable', 200, 'BAD_JSON'))).toBe('reachable');
    expect(reachOf(rejection('too_large', 200))).toBe('reachable');
  });
});

describe('reachOf: anything else is unknown', () => {
  it('an abort by the user is unknown, never unreachable', () => {
    expect(reachOf(rejection('aborted', 0))).toBe('unknown');
    expect(reachOf(new SourceError('network', 'aborted', 0))).toBe('unknown');
    expect(reachOf({ ...rejection('unreachable', 0, 'NETWORK'), cancelled: true })).toBe('unknown');
  });

  it('a stale or superseded answer is unknown', () => {
    expect(reachOf({ ...rejection('unreachable', 0, 'NETWORK'), stale: true })).toBe('unknown');
    expect(reachOf({ ...rejection('unreachable', 0, 'NETWORK'), superseded: true })).toBe('unknown');
    expect(reachOf({ status: 401, superseded: true })).toBe('unknown');
    expect(reachOf(rejection('stale', 0))).toBe('unknown');
    expect(reachOf(new SourceError('stale', 'NETWORK', null))).toBe('unknown');
  });

  it('a stale source read or stale error facts with a synthetic status are unknown, never reachable', () => {
    expect(reachOf(new SourceError('stale', null, 401))).toBe('unknown');
    // only a SourceError 'network' is a read nothing answered: another kind with the no-answer code is not
    expect(reachOf(new SourceError('server', 'NETWORK', null))).toBe('unknown');
    expect(reachOf(new SourceError('bad_request', 'TIMEOUT', null))).toBe('unknown');
    expect(reachOf(errorInfo({ kind: 'stale', superseded: true, status: 401 }, { page: 'files' }))).toBe('unknown');
    expect(reachOf(errorInfo({ cancelled: true, status: 500 }, { page: 'files' }))).toBe('unknown');
    // api.ts gone(): an unsent superseded-session rejection with a synthetic 401
    expect(reachOf(errorInfo({ kind: 'not_sent', notSent: true, superseded: true, status: 401 }, { page: 'files' }))).toBe('unknown');
  });

  it('nothing sent is unknown', () => {
    expect(reachOf(notSentRejection('NETWORK'))).toBe('unknown');
    expect(reachOf({ ...rejection('unreachable', 0, 'NETWORK'), notSent: true })).toBe('unknown');
    expect(reachOf(errorInfo(notSentRejection('NETWORK'), { page: 'files' }))).toBe('unknown');
  });

  it('a body lost after the answer arrived is unknown (answered, or a trace id came)', () => {
    expect(reachOf(rejection('unreachable', 0, 'NETWORK', { answered: true }))).toBe('unknown');
    expect(reachOf(rejection('unreachable', 0, 'TIMEOUT', { answered: true }))).toBe('unknown');
    expect(reachOf(rejection('unreachable', 0, 'NETWORK', { traceId: TID }))).toBe('unknown');
    expect(reachOf(new SourceError('network', 'NETWORK', null, { traceId: TID }))).toBe('unknown');
  });

  it("error facts (ErrorInfo) never prove no answer: they keep no 'answered' (status null → unknown)", () => {
    expect(reachOf(errorInfo(rejection('unreachable', 0, 'NETWORK'), { page: 'files' }))).toBe('unknown');
    expect(reachOf(errorInfo(rejection('unreachable', 0, 'TIMEOUT', { answered: true }), { page: 'files' }))).toBe('unknown');
  });

  it('a refused preflight, a wrapped foreign throw and other status-0 codes are unknown', () => {
    expect(reachOf(rejection('preflight_refused', 0))).toBe('unknown');
    expect(reachOf({ kind: 'unreachable', status: 0, code: 'CALL_FAILED' })).toBe('unknown');
    expect(reachOf(rejection('unreachable', 0, 'SOMETHING'))).toBe('unknown');
    expect(reachOf(rejection('redirected', 0))).toBe('unknown');
  });

  it('an unrecognised value is unknown', () => {
    for (const v of [undefined, null, 0, '', 'NETWORK', new TypeError('fetch'), {}, { code: 'NETWORK' }, { status: '0', code: 'NETWORK' },
      // the no-answer shape without its status 0 (or with a non-HTTP status) proves nothing
      { kind: 'unreachable', code: 'NETWORK' }, { kind: 'unreachable', status: null, code: 'TIMEOUT' }, { kind: 'unreachable', status: 7, code: 'NETWORK' },
      // a function carrying the rejection's shape is no rejection (the object guard)
      Object.assign(() => undefined, { kind: 'unreachable', status: 0, code: 'NETWORK' })])
      expect(reachOf(v)).toBe('unknown');
  });

  it('a kind other than unreachable with status 0 and NETWORK is unknown (a stream state, a refusal) ', () => {
    expect(reachOf({ kind: 'private', status: 0, code: 'NETWORK' })).toBe('unknown');
    expect(reachOf({ status: 0, code: 'NETWORK' })).toBe('unknown');
    expect(reachOf({ state: 'error', status: 0, code: 'budget' })).toBe('unknown');
    expect(reachOf({ state: 'closed', reason: 'network' })).toBe('unknown');
  });
});
