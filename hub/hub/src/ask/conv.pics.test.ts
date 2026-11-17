// conv.ts historyPics: a reopened chat's pictures, from the agent's image blocks; the leading "[Image: name]" lines are their
// names only when there are exactly as many as image blocks (else no names, and the text stays as the agent gave it).
import { describe, expect, it } from 'vitest';
import * as C from './conv';

const ID = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const img = (o: Record<string, unknown> = {}) => ({ kind: 'image', image_id: ID, media_type: 'image/png', bytes: 48213, ...o });

describe('historyPics', () => {
  it('no image block: the text is left as it is, even when it starts with an "[Image: x]" line the person typed', () => {
    expect(C.historyPics('[Image: shot.png]\n\nwhat is this?', [{ kind: 'text', text: 'x' }])).toEqual({ text: '[Image: shot.png]\n\nwhat is this?', pics: [] });
  });
  it('one image block: its name is the leading line, which leaves the text with the blank line after it', () => {
    expect(C.historyPics('[Image: shot.png]\n\nwhat is this?', [img()])).toEqual({ text: 'what is this?', pics: [{ id: ID, name: 'shot.png', media: 'image/png', bytes: 48213 }] });
  });
  it('as many lines as blocks: each block takes the line in its place, in order', () => {
    const r = C.historyPics('[Image: a.png]\n[Image: b.png]\n\nhello', [img(), img({ image_id: ID.replace('9', 'a') })]);
    expect(r.text).toBe('hello');
    expect(r.pics.map((p) => p.name)).toEqual(['a.png', 'b.png']);
  });
  it('more lines than blocks: no picture is named and the text stays whole (which line is which cannot be told)', () => {
    const r = C.historyPics('[Image: a.png]\n[Image: typed by me]\n\nhello', [img()]);
    expect(r.text).toBe('[Image: a.png]\n[Image: typed by me]\n\nhello');
    expect(r.pics.map((p) => p.name)).toEqual(['']);
  });
  it('fewer lines than blocks (a picture placed inline has no line, a terminal client\'s mix): no picture is named and the text stays whole', () => {
    const r = C.historyPics('[Image: b.png]\n\nsee [Image #1]', [img(), img({ image_id: ID.replace('9', 'a') })]);
    expect(r.text).toBe('[Image: b.png]\n\nsee [Image #1]');
    expect(r.pics.map((p) => p.name)).toEqual(['', '']);
    expect(r.pics.map((p) => p.id)).toEqual([ID, ID.replace('9', 'a')]);
  });
  it('a message that is only its pictures keeps an empty text (the agent writes the lines with no blank line after them)', () => {
    expect(C.historyPics('[Image: a.png]', [img()])).toEqual({ text: '', pics: [{ id: ID, name: 'a.png', media: 'image/png', bytes: 48213 }] });
    expect(C.historyPics('[Image: a.png]\n[Image: b.png]', [img(), img()]).text).toBe('');
  });
  it('a message that is only its pictures with no name line at all: unnamed pictures, empty text', () => {
    expect(C.historyPics('', [img(), img()])).toEqual({ text: '', pics: [{ id: ID, name: '', media: 'image/png', bytes: 48213 }, { id: ID, name: '', media: 'image/png', bytes: 48213 }] });
  });
  it.each([
    [{ kind: 'image' }],
    [{ kind: 'image', image_id: 'ABC', media_type: 'image/png' }],
    [{ kind: 'image', image_id: ID + '0', media_type: 'image/png' }],
    [{ kind: 'image', image_id: ID, media_type: 'image/svg+xml' }],
    [{ kind: 'image', image_id: ID }],
    [{ kind: 'image', image_id: '../' + ID.slice(3), media_type: 'image/png' }],
  ])('a block that cannot be asked for (%j) marks a picture with no id', (b) => {
    expect(C.historyPics('hi', [b]).pics[0]?.id).toBeNull();
  });
});

describe('the history builder', () => {
  it('a user message with an image block keeps its picture on the row; a picture-only message is a row too', () => {
    const c = C.historyFrom({ messages: [
      { role: 'user', blocks: [{ kind: 'text', text: '[Image: shot.png]\n\nwhat is this?' }, img()] },
      { role: 'assistant', blocks: [{ kind: 'text', text: 'A cat.' }] },
      { role: 'user', blocks: [{ kind: 'text', text: '[Image: b.png]' }, img({ image_id: undefined })] },
      { role: 'assistant', blocks: [{ kind: 'text', text: 'ok' }] },
    ] }, { liveTail: false, idOf: (n: number) => 'u' + n, at: 1 });
    const us = c.users;
    expect(us.map((u) => u.text)).toEqual(['what is this?', '']);
    expect(us[0]?.pics).toEqual([{ id: ID, name: 'shot.png', media: 'image/png', bytes: 48213 }]);
    expect(us[1]?.pics).toEqual([{ id: null, name: 'b.png', media: 'image/png', bytes: 48213 }]);
  });
  it('a picture-only message with no text block at all, and one whose text is only its name lines, are rows with their pictures (never skipped)', () => {
    const c = C.historyFrom({ messages: [
      { role: 'user', blocks: [img(), img({ image_id: ID.replace('9', 'b') })] },
      { role: 'assistant', blocks: [{ kind: 'text', text: 'Two cats.' }] },
      { role: 'user', blocks: [{ kind: 'text', text: '[Image: a.png]\n[Image: b.png]' }, img(), img()] },
      { role: 'assistant', blocks: [{ kind: 'text', text: 'ok' }] },
    ] }, { liveTail: false, idOf: (n: number) => 'u' + n, at: 1 });
    expect(c.users.map((u) => u.text)).toEqual(['', '']);
    expect(c.users.map((u) => u.pics?.map((p) => p.name))).toEqual([['', ''], ['a.png', 'b.png']]);
    expect(c.users[0]?.pics?.map((p) => p.id)).toEqual([ID, ID.replace('9', 'b')]);
    expect(c.turns).toHaveLength(2);
  });
});
