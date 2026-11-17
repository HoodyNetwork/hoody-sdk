// Home web widgets, the pure parts: which addresses a widget takes, which it may frame, names, the stored list, and
// the order moves (drag and the buttons give the same order).
import { describe, expect, it } from 'vitest';
import { moveKey } from '../logic';
import { dropIndex, moveKeyTo } from './order';
import { checkUrl, frameable, URL_MAX } from './url';
import { toCard } from './store';
import { addChange, addTo, cleanName, defaultName, newId, parseWidgets, WIDGET_MAX, NAME_MAX, type WebWidget, type WebWidgets } from './model';

const HUB = 'https://hub.example.org';
const PD = 'proxy.example';

describe('checkUrl', () => {
  it('takes an absolute http or https address exactly as typed (trimmed)', () => {
    expect(checkUrl('  https://a.example/x?y=1#z ', HUB)).toEqual({ url: 'https://a.example/x?y=1#z' });
    expect(checkUrl('http://a.example', HUB)).toEqual({ url: 'http://a.example' });
    expect(checkUrl('HTTPS://A.example/', HUB)).toEqual({ url: 'HTTPS://A.example/' });
  });
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['javascript:alert(1)', 'scheme'],
    ['data:text/html,<b>x</b>', 'scheme'],
    ['file:///etc/passwd', 'scheme'],
    ['//a.example/x', 'scheme'],
    ['https:a.example', 'scheme'],
    ['ftp://a.example', 'scheme'],
    ['a.example', 'scheme'],
    ['https://', 'bad'],
    ['https://a b.example', 'bad'],
    ['https://a.example/\u0007', 'bad'],
    ['https://a.example/x y', 'bad'],
    ['https://user:pw@a.example/', 'credentials'],
    ['https://user@a.example/', 'credentials'],
    ['https://hub.example.org/home', 'hub'],
    ['HTTPS://HUB.example.org:443/', 'hub'],
  ])('refuses %j (%s)', (raw, why) => {
    expect(checkUrl(raw, HUB)).toEqual({ refused: why });
  });
  it.each(['\u202e', '\u202a', '\u2066', '\u2069', '\u200e', '\u200f', '\u061c'])('refuses the direction control %j in path, query and fragment', (c) => {
    for (const u of [`https://a.example/x${c}y`, `https://a.example/?q=${c}`, `https://a.example/#${c}`]) expect(checkUrl(u, HUB)).toEqual({ refused: 'bad' });
  });
  it('refuses an address longer than URL_MAX', () => {
    const ok = 'https://a.example/' + 'x'.repeat(URL_MAX - 'https://a.example/'.length);
    expect(checkUrl(ok, HUB)).toEqual({ url: ok });
    expect(checkUrl(ok + 'x', HUB)).toEqual({ refused: 'long' });
  });
  it('a non-string is empty', () => {
    expect(checkUrl(undefined as unknown as string, HUB)).toEqual({ refused: 'empty' });
  });
});

describe('frameable (the Hub page frames its own Kit addresses only: frame-src https://*.<proxy domain>)', () => {
  it('takes https under the proxy domain', () => {
    expect(frameable('https://p-c-agent-1.srv.proxy.example/x', PD)).toBe(true);
    expect(frameable('https://a.PROXY.example', PD)).toBe(true);
  });
  it.each([
    'http://p-c-agent-1.srv.proxy.example/',
    'https://proxy.example/',
    'https://evilproxy.example/',
    'https://proxy.example.evil.org/',
    'https://a.example/',
    'https://a.proxy.example:8443/',
    'not a url',
  ])('refuses %j', (u) => {
    expect(frameable(u, PD)).toBe(false);
  });
  it('frames nothing when the page has no proxy domain', () => {
    expect(frameable('https://a.proxy.example/', '')).toBe(false);
  });
  describe('a proxy domain under a host family label also frames the twin family, exact suffix only', () => {
    const C = 'computers.proxy.example';
    const K = 'containers.proxy.example';
    it.each([
      ['https://p-c-agent-1.srv.computers.proxy.example/x', C],
      ['https://p-c-agent-1.srv.containers.proxy.example/x', C],
      ['https://p-c-agent-1.srv.computers.proxy.example/x', K],
      ['https://p-c-agent-1.srv.containers.proxy.example/x', K],
      ['https://A.SRV.Containers.PROXY.example/', C],
    ])('frames %j under %j', (u, pd) => {
      expect(frameable(u, pd)).toBe(true);
    });
    it.each([
      'https://computers.proxy.example/',
      'https://containers.proxy.example/',
      'https://a.evilcomputers.proxy.example/',
      'https://a.containers.proxy.example.evil.org/',
      'https://a.computers.proxy.example.evil.org/',
      'https://a.other.proxy.example/',
      'https://a.computers.other.example/',
      'http://a.srv.containers.proxy.example/',
      'https://a.srv.containers.proxy.example:8443/',
      'https://a.srv.containers.proxy.example./',
    ])('refuses %j', (u) => {
      expect(frameable(u, C)).toBe(false);
    });
    it('a proxy domain without a family label stands for itself only', () => {
      expect(frameable('https://a.containers.proxy.example/', 'proxy.example')).toBe(true);
      expect(frameable('https://a.computers.other.example/', 'other.example')).toBe(true);
      expect(frameable('https://a.containers.other.example/', 'computers')).toBe(false);
    });
  });
});

describe('names', () => {
  it('cleans a typed name: spaces folded and trimmed', () => {
    expect(cleanName('  My   page ')).toBe('My page');
    expect(cleanName('')).toBe('');
  });
  it('refuses control and separator characters and anything too long', () => {
    expect(cleanName('a\u0000b')).toBeNull();
    expect(cleanName('a\u0085b')).toBeNull();
    expect(cleanName('a\u2028b')).toBeNull();
    for (const c of ['\u202e', '\u2067', '\u200f', '\u061c']) expect(cleanName(`a${c}b`), c).toBeNull();
    expect(cleanName('a\nb')).toBe('a b');
    expect(cleanName('x'.repeat(NAME_MAX))).toBe('x'.repeat(NAME_MAX));
    expect(cleanName('x'.repeat(NAME_MAX + 1))).toBeNull();
    // "Up to 40 characters" counts what a person sees: an emoji is one character, not two.
    expect(cleanName('\u{1F600}'.repeat(NAME_MAX))).toBe('\u{1F600}'.repeat(NAME_MAX));
    expect(cleanName('\u{1F600}'.repeat(NAME_MAX + 1))).toBeNull();
  });
  it('defaults to the host', () => {
    expect(defaultName('https://Docs.Example.org:8080/a')).toBe('docs.example.org');
    expect(defaultName('nonsense')).toBe('');
  });
});

describe('parseWidgets (fails closed per item)', () => {
  const w = (o: Partial<WebWidget> = {}): WebWidget => ({ id: 'abcd1234', url: 'https://a.example/', size: 'm', ...o });
  it('gives the empty list for anything that is not the stored shape', () => {
    for (const raw of [null, undefined, 1, 'x', [], {}, { v: 2, items: [w()] }, { v: 1 }, { v: 1, items: 'x' }]) expect(parseWidgets(raw)).toEqual({ v: 1, items: [] });
  });
  it('keeps good items and drops bad ones one at a time', () => {
    const items = [
      w(),
      w({ id: 'bad id!!' }),
      w({ id: 'efgh5678', url: 'javascript:alert(1)' }),
      w({ id: 'ijkl9012', size: 'xl' as 's' }),
      w({ id: 'mnop3456', name: 'a\u0000' }),
      w({ id: 'qrst7890', name: '  Docs  ', size: 'l' }),
      w({ id: 'abcd1234' }),
    ];
    expect(parseWidgets({ v: 1, items })).toEqual({ v: 1, items: [w(), w({ id: 'qrst7890', name: 'Docs', size: 'l' })] });
  });
  it('drops an empty name and unknown fields', () => {
    expect(parseWidgets({ v: 1, items: [{ ...w(), name: '', extra: 1 }] })).toEqual({ v: 1, items: [w()] });
  });
  it(`keeps at most ${WIDGET_MAX}`, () => {
    const many = Array.from({ length: WIDGET_MAX + 3 }, (_, i) => w({ id: `id${String(i).padStart(6, '0')}` }));
    expect(parseWidgets({ v: 1, items: many }).items).toHaveLength(WIDGET_MAX);
  });
  it('a stored address that is no longer one (the Hub origin rule needs the page) is still kept as typed http(s)', () => {
    expect(parseWidgets({ v: 1, items: [w({ url: 'http://a.example' })] }).items).toHaveLength(1);
  });
  it('a throwing getter reads as the default', () => {
    const evil = { v: 1, get items(): never { throw new Error('x'); } };
    expect(parseWidgets(evil)).toEqual({ v: 1, items: [] });
  });
});

describe('newId', () => {
  it('is 8 base36 characters, not taken', () => {
    const id = newId(['zzzzzzzz']);
    expect(id).toMatch(/^[0-9a-z]{8}$/);
    let n = 0;
    const rand = () => (n++ < 3 ? 0 : 0.5);
    expect(newId(['00000000'], rand)).not.toBe('00000000');
  });
});

describe('moveKeyTo and dropIndex', () => {
  const keys = ['a', 'b', 'c', 'd', 'e'];
  it('moving to a place equals the same number of single moves', () => {
    for (const k of keys) {
      for (let to = 0; to < keys.length; to++) {
        let viaButtons = [...keys];
        const from = keys.indexOf(k);
        const step = to > from ? 1 : -1;
        for (let i = from; i !== to; i += step) viaButtons = moveKey(viaButtons, k, step as 1 | -1);
        expect(moveKeyTo(keys, k, to), `${k}->${to}`).toEqual(viaButtons);
      }
    }
  });
  it('clamps the place and leaves an unknown key alone', () => {
    expect(moveKeyTo(keys, 'a', 99)).toEqual(['b', 'c', 'd', 'e', 'a']);
    expect(moveKeyTo(keys, 'e', -5)).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(moveKeyTo(keys, 'e', -1)).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(moveKeyTo(keys, 'x', 0)).toEqual(keys);
  });
  it('dropIndex: the row whose middle the pointer passed', () => {
    const mids = [10, 30, 50, 70];
    expect(dropIndex(mids, 0, 0)).toBe(0);
    expect(dropIndex(mids, 0, 29)).toBe(0);
    expect(dropIndex(mids, 0, 31)).toBe(1);
    expect(dropIndex(mids, 0, 100)).toBe(3);
    expect(dropIndex(mids, 3, 51)).toBe(3);
    expect(dropIndex(mids, 3, 49)).toBe(2);
    expect(dropIndex(mids, 3, 9)).toBe(0);
    expect(dropIndex(mids, 2, 50)).toBe(2);
    expect(dropIndex([], 0, 5)).toBe(0);
  });
});

describe('toCard', () => {
  const w: WebWidget = { id: 'abcd1234', url: 'https://a.proxy.example/x', size: 'l' };
  it('frames a frameable address, titled by its host without a name', () => {
    expect(toCard(w, PD, HUB)).toEqual({ key: 'home-web:abcd1234', pageId: 'home-web', id: 'abcd1234', title: 'a.proxy.example', name: '', order: 200, size: 'l', url: w.url, frame: true });
    expect(toCard({ ...w, name: 'Docs' }, PD, HUB).title).toBe('Docs');
  });
  it('masks access ids in the title, named or not', () => {
    const kit = { ...w, url: 'https://p-0123456789abcdef01234567-agent-1.srv.proxy.example/' };
    expect(toCard(kit, PD, HUB).title).toBe('p-0123…4567-agent-1.srv.proxy.example');
    expect(toCard({ ...kit, name: 'x 0123456789abcdef01234567' }, PD, HUB).title).toBe('x 0123…4567');
  });
  it('never frames the Hub page itself, even under the proxy domain', () => {
    expect(toCard(w, PD, 'https://a.proxy.example').frame).toBe(false);
  });
  it('does not frame an address off the proxy domain', () => {
    expect(toCard({ ...w, url: 'https://a.example/' }, PD, HUB).frame).toBe(false);
  });
});

describe('addTo (the id is chosen once per add, so a replay of the same change adds the same widget)', () => {
  it('adds at the end with the given id, size m, and the name only when given', () => {
    const one = addTo({ v: 1, items: [] }, 'aaaa0001', 'https://a.example/', '');
    expect(one).toEqual({ v: 1, items: [{ id: 'aaaa0001', url: 'https://a.example/', size: 'm' }] });
    const two = addTo(one as WebWidgets, 'aaaa0002', 'https://b.example/', 'B');
    expect(two?.items.map((w) => w.name)).toEqual([undefined, 'B']);
  });
  it('a replay gives the same widget, so later changes by id still find it', () => {
    const a = addTo({ v: 1, items: [] }, 'aaaa0001', 'https://a.example/', '');
    const b = addTo({ v: 1, items: [] }, 'aaaa0001', 'https://a.example/', '');
    expect(a).toEqual(b);
  });
  it('refuses an id already taken (another tab chose the same one)', () => {
    const one = addTo({ v: 1, items: [] }, 'aaaa0001', 'https://a.example/', '') as WebWidgets;
    expect(addTo(one, 'aaaa0001', 'https://b.example/', '')).toBeNull();
  });
  it(`refuses past ${WIDGET_MAX} (another tab may have filled it)`, () => {
    let now: WebWidgets = { v: 1, items: [] };
    for (let i = 0; i < WIDGET_MAX; i++) now = addTo(now, `id${String(i).padStart(6, '0')}`, `https://e${i}.example/`, '') as WebWidgets;
    expect(addTo(now, 'zzzz0000', 'https://x.example/', '')).toBeNull();
  });
});

describe('addChange (one add, as core applies it again on top of another tab\'s value)', () => {
  const full = (): WebWidgets => {
    let now: WebWidgets = { v: 1, items: [] };
    for (let i = 0; i < WIDGET_MAX; i++) now = addTo(now, `id${String(i).padStart(6, '0')}`, `https://e${i}.example/`, '') as WebWidgets;
    return now;
  };
  const eleven = (): WebWidgets => ({ v: 1, items: full().items.slice(0, WIDGET_MAX - 1) });
  it('the first application decides; a later one that finds the list full says the add was lost, once', () => {
    let lost = 0;
    const op = addChange('aaaa0001', 'https://a.example/', '', () => { lost++; });
    expect(op.fn(eleven()).items).toHaveLength(WIDGET_MAX);
    expect(op.result()).toBe('added');
    const f = full();
    expect(op.fn(f)).toBe(f);
    expect(op.fn(f)).toBe(f);
    expect(lost).toBe(1);
  });
  it('an add refused as full stays refused when a later application finds room', () => {
    const op = addChange('aaaa0001', 'https://a.example/', '', () => undefined);
    const f = full();
    expect(op.fn(f)).toBe(f);
    expect(op.result()).toBe('full');
    const e = eleven();
    expect(op.fn(e)).toBe(e);
  });
  it('replays add the same id', () => {
    const op = addChange('aaaa0001', 'https://a.example/', 'A', () => undefined);
    expect(op.fn({ v: 1, items: [] }).items[0]?.id).toBe('aaaa0001');
    expect(op.fn(eleven()).items.at(-1)?.id).toBe('aaaa0001');
  });
  it('not applied at all reads null', () => {
    expect(addChange('aaaa0001', 'https://a.example/', '', () => undefined).result()).toBeNull();
  });
});
