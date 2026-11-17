import { describe, expect, it } from 'vitest';
import { CAPTION_MAX, TALK_VIEW_START, talkViewStep as step, type TalkView } from './talkView';
import type { ServerFrame } from './runner';

const run = (...fs: ServerFrame[]): TalkView => fs.reduce(step, TALK_VIEW_START);
const prov = (turn_id: string, text: string, seq = 1): ServerFrame => ({ type: 'reply.provisional', turn_id, seq, text });

describe('what Talk shows from the frames', () => {
  it('the person: partial while hearing, final with its outcome', () => {
    expect(run({ type: 'vad.start', utt: 1 }).activity).toBe('hearing');
    expect(run({ type: 'transcript.partial', utt: 1, text: 'bo' }).you).toEqual({ text: 'bo', final: false });
    const sent = run({ type: 'transcript.final', utt: 1, text: 'book', message_id: 'm' });
    expect(sent.you).toEqual({ text: 'book', final: true });
    expect(sent.utt).toBeUndefined();
    expect(sent.activity).toBe('thinking');
  });
  it('an utterance with no message names why, and failed is never read as sent', () => {
    expect(run({ type: 'transcript.final', utt: 1, text: '', no_speech: 'silence' }).utt).toEqual({ family: 'noSpeech', code: 'silence' });
    expect(run({ type: 'transcript.final', utt: 1, text: '', rejected: 'frame_loss' }).utt).toEqual({ family: 'rejected', code: 'frame_loss' });
    expect(run({ type: 'transcript.final', utt: 1, text: '' }).utt).toEqual({ family: 'failed', code: '' });
    expect(run({ type: 'transcript.final', utt: 1, text: '' }).activity).toBe('listening');
  });
  it('a new vad.start clears the last outcome', () => {
    expect(run({ type: 'transcript.final', utt: 1, text: '', rejected: 'x' }, { type: 'vad.start', utt: 2 }).utt).toBeUndefined();
  });
  it('the Bot: provisional text adds up within a turn, another turn starts the line again', () => {
    expect(run(prov('a', 'one '), prov('a', 'two')).bot).toEqual({ text: 'one two', final: false });
    expect(run(prov('a', 'one '), prov('b', 'new')).bot).toEqual({ text: 'new', final: false });
  });
  it('invalidate withdraws from its position, only for the same turn', () => {
    expect(run(prov('a', 'abcdef'), { type: 'reply.invalidate', turn_id: 'a', from_raw: 3 }).bot?.text).toBe('abc');
    expect(run(prov('a', 'abcdef'), { type: 'reply.invalidate', turn_id: 'b', from_raw: 3 }).bot?.text).toBe('abcdef');
  });
  it('invalidate counts from the reply\'s start, after the line dropped its start', () => {
    const long = run(prov('a', 'x'.repeat(CAPTION_MAX + 1000)));
    const v = step(long, { type: 'reply.invalidate', turn_id: 'a', from_raw: CAPTION_MAX + 500 });
    expect(v.bot!.text.length).toBe(CAPTION_MAX - 500);
    expect(step(v, prov('a', 'NEW')).bot!.text.endsWith('xNEW')).toBe(true);
    const before = step(long, { type: 'reply.invalidate', turn_id: 'a', from_raw: 10 });
    expect(before.bot!.text).toBe('');
    const again = step(before, prov('a', 'NEW'));
    expect(step(again, { type: 'reply.invalidate', turn_id: 'a', from_raw: 11 }).bot!.text).toBe('N');
  });
  it('reply.final replaces the line with the whole text and a provisional after it starts over', () => {
    const v = run(prov('a', 'par'), { type: 'reply.final', turn_id: 'a', text: 'partial no more', spoken: true });
    expect(v.bot).toEqual({ text: 'partial no more', final: true });
    expect(step(v, prov('a', 'x')).bot).toEqual({ text: 'x', final: false });
  });
  it('a reply outcome: a person\'s own action is neutral, the rest warn, unknown says so, plain true says nothing', () => {
    const fin = (o: object) => run({ type: 'reply.final', turn_id: 'a', text: '', spoken: true, ...o } as ServerFrame).reply;
    expect(fin({})).toBeUndefined();
    expect(fin({ reason: 'barge_in' })).toEqual({ family: 'speech', code: 'barge_in', warn: false });
    expect(fin({ reason: 'cancelled' })).toEqual({ family: 'speech', code: 'cancelled', warn: false });
    expect(fin({ reason: 'tts_failed' })).toEqual({ family: 'speech', code: 'tts_failed', warn: true });
    expect(fin({ failure: 'refusal', reason: 'cancelled' })).toEqual({ family: 'failure', code: 'refusal', warn: true });
    expect(fin({ spoken: 'unknown' })).toEqual({ family: 'unsure', warn: true });
  });
  it('speaking from output.start until output.stop or the final', () => {
    const v = run({ type: 'output.start', out: 1, reply_id: 'a', seg: 0, kind: 'reply' });
    expect(v.activity).toBe('speaking');
    expect(step(v, prov('a', 'x')).activity).toBe('speaking');
    expect(step(v, { type: 'output.stop', upto_out: 1, reason: 'x' }).activity).toBe('listening');
  });
  it('captions stay within the budget, keeping the end', () => {
    const v = run(prov('a', 'x'.repeat(CAPTION_MAX)), prov('a', 'END'));
    expect(v.bot!.text.length).toBe(CAPTION_MAX);
    expect(v.bot!.text.endsWith('END')).toBe(true);
  });
  it('a new session starts the view again', () => {
    expect(step(run(prov('a', 'x')), { type: 'session', epoch: 1, conn: 'c', in_rate: 16000, out_rate: 24000, vad: false })).toEqual(TALK_VIEW_START);
  });
  it('an announcement names its task when the frame does', () => {
    expect(run({ type: 'gate.announced', ref: { task: 'Deploy' }, reply_id: 'r' }).announced).toBe('Deploy');
    expect(run({ type: 'gate.announced', ref: {}, reply_id: 'r' }).announced).toBe('');
  });
});
