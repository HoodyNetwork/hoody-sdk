// The window title's detail (a chat's name, untrusted text) never carries an id or an address into the terminal's
// title (window lists, tab bars, shell history of titles): a 24-hex id, an access-key or Bot-key shape (hdy_, hbk_), an
// IPv4 or IPv6 address and a host name of three labels or more each become "…". An ordinary name passes unchanged. The chat list is not changed.
import { expect, test } from 'bun:test';
import { maskTitleDetail, termWindowTitle } from './windowTitle';

const title = (detail: string): string => termWindowTitle({ page: 'AI', detail, locked: false, neutral: false });

test('a 24-hex id in the detail is masked', () => {
  expect(title('About 64f0ada00000000000000001 today')).toBe('About … today · AI · Hoody Hub');
  expect(title('ID 64F0ADA00000000000000001')).toBe('ID … · AI · Hoody Hub');
});

test('access-key and Bot-key shapes are masked', () => {
  expect(title('key hdy_AbC123xyz_-9 here')).toBe('key … here · AI · Hoody Hub');
  expect(title('bot hbk_q1W2e3R4t5')).toBe('bot … · AI · Hoody Hub');
});

test('an IPv4 address is masked', () => {
  expect(title('reach 192.0.2.17:8080 now')).toBe('reach …:8080 now · AI · Hoody Hub');
});

test('an IPv6 address is masked; a time is not', () => {
  expect(title('peer 2001:db8::8a2e:370:7334 up')).toBe('peer … up · AI · Hoody Hub');
  expect(title('link fe80::1:2 down')).toBe('link … down · AI · Hoody Hub');
  expect(title('full 2001:0db8:0000:0000:0000:ff00:0042:8329')).toBe('full … · AI · Hoody Hub');
  expect(title('standup 10:30:00 room')).toBe('standup 10:30:00 room · AI · Hoody Hub');
  expect(title('lunch 12:30')).toBe('lunch 12:30 · AI · Hoody Hub');
});

test('an id or key split by an invisible character is masked once cleaned', () => {
  expect(title('About 65a1b2c3d4e5\u200bf6a7b8c9d0e1 today')).toBe('About … today · AI · Hoody Hub');
  expect(title('key hdy\u200b_AbC123xyz')).toBe('key … · AI · Hoody Hub');
  expect(title('About 65a1b2c3d4e5\u200ef6a7b8c9d0e1 today')).toBe('About … today · AI · Hoody Hub');
  expect(title('key hdy_\u202eAbC123xyz')).toBe('key … · AI · Hoody Hub');
});

test('a ZERO WIDTH JOINER splitting an id or a key does not hide it; an emoji keeps its joiners', () => {
  expect(title('About 65a1b2c3d4e5\u200df6a7b8c9d0e1 today')).toBe('About … today · AI · Hoody Hub');
  expect(title('key hdy\u200d_AbC123xyz')).toBe('key … · AI · Hoody Hub');
  expect(title('Family \u{1F468}\u200d\u{1F469}\u200d\u{1F467} plan')).toBe('Family \u{1F468}\u200d\u{1F469}\u200d\u{1F467} plan · AI · Hoody Hub');
});

test('a combining mark or a variation selector splitting an id or a key does not hide it', () => {
  expect(title('key hdy_AAAA\ufe0fBBBBcc')).toBe('key … · AI · Hoody Hub');
  expect(title('About 65a1b2c3d4e5\u0301f6a7b8c9d0e1 today')).toBe('About … today · AI · Hoody Hub');
});

test('a control character inside a key or an id does not leave part of it visible', () => {
  expect(title('key hdy_abc\x01defgh')).toBe('key … · AI · Hoody Hub');
  expect(title('About 65a1b2c3d4e5\x85f6a7b8c9d0e1 today')).toBe('About … today · AI · Hoody Hub');
});

test('a key with letters right before it is masked', () => {
  expect(title('keyhdy_AbC123xyz')).toBe('key… · AI · Hoody Hub');
});

test('an id or key inside a word joined by an underscore is masked', () => {
  expect(title('realm_65a1b2c3d4e5f6a7b8c9d0e1 notes')).toBe('realm_… notes · AI · Hoody Hub');
  expect(title('my_hdy_AbC123xyz')).toBe('my_… · AI · Hoody Hub');
});

test('an address inside a word joined by an underscore or after a label and a colon is masked', () => {
  expect(title('ip_192.0.2.17 down')).toBe('ip_… down · AI · Hoody Hub');
  expect(title('ssh_a.example.com now')).toBe('ssh_… now · AI · Hoody Hub');
  expect(title('host:2001:db8::1 up')).toBe('host:… up · AI · Hoody Hub');
  expect(title('ipv6:2001:db8::1 up')).toBe('ipv6:… up · AI · Hoody Hub');
  expect(title('id:2001:db8::1 up')).toBe('id:… up · AI · Hoody Hub');
  expect(title('app v1.2.3.4 notes')).toBe('app v1.2.3.4 notes · AI · Hoody Hub');
  expect(title('at:10:42:07 build')).toBe('at:10:42:07 build · AI · Hoody Hub');
  expect(title('see -a.example.com')).toBe('see -… · AI · Hoody Hub');
});

test('a mark on a letter of another script stays when ASCII follows it', () => {
  expect(title('किA plan')).toBe('किA plan · AI · Hoody Hub');
  expect(title('कि́A plan')).toBe('कि́A plan · AI · Hoody Hub');
  expect(title('❤️v2 launch')).toBe('❤️v2 launch · AI · Hoody Hub');
});

test('a host name (a computer address) is masked', () => {
  expect(title('open p1-c2-http-80.node-a.computers.example.test')).toBe('open … · AI · Hoody Hub');
  expect(title('docs at a.example.com')).toBe('docs at … · AI · Hoody Hub');
});

test('a two-label dotted word passes unchanged', () => {
  expect(title('Fix Node.js build')).toBe('Fix Node.js build · AI · Hoody Hub');
  expect(title('docs at example.com')).toBe('docs at example.com · AI · Hoody Hub');
});

test('an ordinary name passes unchanged', () => {
  const plain = 'Release notes v1.2 – Q3 plan (draft 2)';
  expect(maskTitleDetail(plain)).toBe(plain);
  expect(title(plain)).toBe(`${plain} · AI · Hoody Hub`);
  expect(title('hdy notes and 1234 apples')).toBe('hdy notes and 1234 apples · AI · Hoody Hub');
});

test('the page part is never masked (only the declared detail)', () => {
  expect(termWindowTitle({ page: 'Computers', detail: null, locked: false, neutral: false })).toBe('Computers · Hoody Hub');
});
