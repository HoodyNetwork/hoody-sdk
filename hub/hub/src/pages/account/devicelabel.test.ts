// Vitest: Account > Sign-in sessions names each device from what the server records (the Device column must never
// read "unknown" or "web" for most rows). The client's own name first; else its user agent, read as a browser on a system
// or a script; else how it signed in; "Unknown device" only when nothing is known. The channel shows as a tag only when
// the name does not already say it.
import { makeT } from '@kit/strings';
import { describe, expect, it } from 'vitest';
import { cleanLabel, deviceLabel, guessAgent, historyChannel, knownChannel } from './logic';
import strings from './strings.en.json';

const T = makeT(strings);
const name = (client: string, userAgent: string, clientName = '') => deviceLabel({ client, clientName, userAgent }, T);

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  firefoxWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  safariIpad: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1',
  firefoxIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/144.0 Mobile/15E148 Safari/605.1.15',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  operaWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/125.0.0.0',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  chromeOs: 'Mozilla/5.0 (X11; CrOS x86_64 16181.61.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  chromiumLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/141.0.0.0 Chrome/141.0.0.0 Safari/537.36',
  vivaldi: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Vivaldi/7.6',
};

describe('device names: browsers', () => {
  it.each([
    [UA.chromeMac, 'Chrome on macOS'],
    [UA.firefoxWin, 'Firefox on Windows'],
    [UA.firefoxLinux, 'Firefox on Linux'],
    [UA.safariMac, 'Safari on macOS'],
    [UA.safariIphone, 'Safari on iPhone'],
    [UA.safariIpad, 'Safari on iPad'],
    [UA.chromeIphone, 'Chrome on iPhone'],
    [UA.firefoxIphone, 'Firefox on iPhone'],
    [UA.edgeWin, 'Edge on Windows'],
    [UA.operaWin, 'Opera on Windows'],
    [UA.chromeAndroid, 'Chrome on Android'],
    [UA.samsung, 'Samsung Internet on Android'],
    [UA.chromeOs, 'Chrome on ChromeOS'],
    [UA.chromiumLinux, 'Chromium on Linux'],
    [UA.vivaldi, 'Vivaldi on Linux'],
  ])('%s -> %s', (ua, want) => {
    expect(name('web', ua)).toEqual({ name: want, tag: null });
  });

  it('a browser with no known system, or a system with no known browser', () => {
    expect(name('web', 'Mozilla/5.0 (Plan9) Gecko/20100101 Firefox/144.0').name).toBe('Firefox');
    expect(name('web', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)').name).toBe('Browser on Linux');
  });
});

describe('device names: what wins', () => {
  it('the client name first, the user agent next, the channel after, Unknown device last', () => {
    expect(name('web', UA.chromeMac, 'Work laptop')).toEqual({ name: 'Work laptop', tag: 'Browser' });
    expect(name('web', UA.chromeMac)).toEqual({ name: 'Chrome on macOS', tag: null });
    expect(name('web', '')).toEqual({ name: 'Browser', tag: null });
    expect(name('', '')).toEqual({ name: 'Unknown device', tag: null });
  });

  it('"unknown", an empty client and any other text are no channel', () => {
    for (const c of ['unknown', '', 'UNKNOWN', 'Web', 'telnet', ' ']) {
      expect(knownChannel(c)).toBeNull();
      expect(name(c, '')).toEqual({ name: 'Unknown device', tag: null });
      expect(name(c, UA.firefoxWin)).toEqual({ name: 'Firefox on Windows', tag: null });
    }
    expect(knownChannel(null)).toBeNull();
    expect(knownChannel(undefined)).toBeNull();
  });

  it('every channel has its own word when nothing else is known', () => {
    expect(name('web', '').name).toBe('Browser');
    expect(name('cli', '').name).toBe('Hoody CLI');
    expect(name('sdk', '').name).toBe('Hoody SDK');
    expect(name('ssh', '').name).toBe('SSH');
    expect(name('webssh', '').name).toBe('SSH');
    expect(name('agent', '').name).toBe('Agent');
    expect(name('admin', '').name).toBe('Admin');
    expect(name(' cli ', '').name).toBe('Hoody CLI');
  });
});

describe('device names: scripts and Hoody clients', () => {
  it.each([
    ['node', 'Node.js'],
    ['undici', 'Node.js'],
    ['node-fetch/1.0 (+https://github.com/bitinn/node-fetch)', 'Node.js'],
    ['axios/1.12.2', 'Node.js'],
    ['Bun/1.3.1', 'Bun'],
    ['Deno/2.5.4', 'Deno'],
    ['curl/8.14.1', 'curl'],
    ['Wget/1.25.0', 'Wget'],
    ['python-requests/2.32.5', 'Python'],
    ['Python-urllib/3.13', 'Python'],
    ['python-httpx/0.28.1', 'Python'],
    ['aiohttp/3.12', 'Python'],
    ['Go-http-client/2.0', 'Go'],
    ['okhttp/4.12.0', 'Java'],
    ['Java/21.0.8', 'Java'],
    ['Ruby', 'Ruby'],
    ['Faraday v2.13.4', 'Ruby'],
    ['PostmanRuntime/7.49.0', 'Postman'],
  ])('%s -> Script (%s)', (ua, tool) => {
    expect(guessAgent(ua)).toEqual({ kind: 'script', tool });
    expect(name('', ua)).toEqual({ name: `Script (${tool})`, tag: null });
  });

  it('a script shows how it signed in as a tag', () => {
    expect(name('sdk', 'node')).toEqual({ name: 'Script (Node.js)', tag: 'Hoody SDK' });
    expect(name('cli', 'curl/8.14.1')).toEqual({ name: 'Script (curl)', tag: 'Hoody CLI' });
  });

  it("Hoody's own clients name their channel, tagged only when it signed in another way", () => {
    expect(name('cli', 'hoody-cli/3.4.1')).toEqual({ name: 'Hoody CLI', tag: null });
    expect(name('', 'hoody-cli/3.4.1')).toEqual({ name: 'Hoody CLI', tag: null });
    expect(name('sdk', 'hoody-sdk/2.0 node/22')).toEqual({ name: 'Hoody SDK', tag: null });
    expect(name('agent', 'hoody-agent/1.0')).toEqual({ name: 'Agent', tag: null });
    expect(name('admin', 'hoody-cli/3.4.1')).toEqual({ name: 'Hoody CLI', tag: 'Admin' });
  });

  it('a named client keeps its channel as a tag; a browser on web SSH says SSH', () => {
    expect(name('cli', 'hoody-cli/3.4.1', 'build-server')).toEqual({ name: 'build-server', tag: 'Hoody CLI' });
    expect(name('unknown', 'hoody-cli/3.4.1', 'build-server')).toEqual({ name: 'build-server', tag: null });
    expect(name('webssh', UA.chromeMac)).toEqual({ name: 'Chrome on macOS', tag: 'SSH' });
  });

  it('an agent it cannot read shows its first word; one that says nothing is not a name', () => {
    expect(name('', 'MyTool/1.2 (linux)')).toEqual({ name: 'MyTool', tag: null });
    expect(name('sdk', 'MyTool/1.2')).toEqual({ name: 'MyTool', tag: 'Hoody SDK' });
    expect(name('', 'Mozilla/5.0')).toEqual({ name: 'Unknown device', tag: null });
    expect(name('cli', 'Mozilla/5.0 (compatible)')).toEqual({ name: 'Hoody CLI', tag: null });
    expect(name('', '   ')).toEqual({ name: 'Unknown device', tag: null });
  });

  it('a browser-looking agent is never read as a script, and a script word inside a browser agent is not one', () => {
    expect(guessAgent('Mozilla/5.0 (X11; Linux x86_64) curl/8 Firefox/144.0')).toEqual({ kind: 'browser', browser: 'Firefox', os: 'Linux' });
  });
});

describe('device names: placeholders and repeats', () => {
  it('a placeholder or channel word sent as the user agent or the client name is no name', () => {
    for (const p of ['unknown', 'Unknown', 'UNKNOWN', 'web', 'Web', 'cli', 'null', 'undefined', 'none', 'n/a', '-', '---']) {
      expect(name('unknown', p)).toEqual({ name: 'Unknown device', tag: null });
      expect(name('web', p)).toEqual({ name: 'Browser', tag: null });
      expect(name('sdk', p)).toEqual({ name: 'Hoody SDK', tag: null });
    }
    for (const p of ['unknown', 'null', 'undefined', 'none', 'n/a', '-']) {
      expect(name('unknown', '', p)).toEqual({ name: 'Unknown device', tag: null });
      expect(name('web', UA.firefoxWin, p)).toEqual({ name: 'Firefox on Windows', tag: null });
    }
    expect(guessAgent('unknown/1.0')).toBeNull();
    expect(guessAgent('Mozilla')).toBeNull();
  });

  it('no tag that repeats what the name already says', () => {
    expect(name('cli', '', 'Hoody CLI')).toEqual({ name: 'Hoody CLI', tag: null });
    expect(name('cli', '', 'hoody cli on build-server')).toEqual({ name: 'hoody cli on build-server', tag: null });
    expect(name('ssh', 'OpenSSH_9.9')).toEqual({ name: 'OpenSSH_9.9', tag: null });
    expect(name('ssh', 'MyTool/1.2')).toEqual({ name: 'MyTool', tag: 'SSH' });
    expect(name('cli', '', 'laptop')).toEqual({ name: 'laptop', tag: 'Hoody CLI' });
  });

  it('only a whole channel word counts as saying it', () => {
    expect(name('cli', '', 'CLI')).toEqual({ name: 'CLI', tag: null });
    expect(name('cli', '', 'my-cli')).toEqual({ name: 'my-cli', tag: null });
    expect(name('cli', '', 'clinic-pc')).toEqual({ name: 'clinic-pc', tag: 'Hoody CLI' });
    expect(name('web', '', 'BrowserStack')).toEqual({ name: 'BrowserStack', tag: 'Browser' });
    expect(name('web', '', 'my browser')).toEqual({ name: 'my browser', tag: null });
    expect(name('sdk', '', 'SDK runner')).toEqual({ name: 'SDK runner', tag: null });
    expect(name('webssh', '', 'ssh box')).toEqual({ name: 'ssh box', tag: null });
    expect(name('agent', '', 'Agent 7')).toEqual({ name: 'Agent 7', tag: null });
    expect(name('admin', '', 'admin desk')).toEqual({ name: 'admin desk', tag: null });
    expect(name('admin', '', 'administrator')).toEqual({ name: 'administrator', tag: 'Admin' });
  });

  it('a placeholder with details, or a one-letter word, is no name', () => {
    expect(name('unknown', 'n/a (unknown)')).toEqual({ name: 'Unknown device', tag: null });
    expect(name('cli', 'unknown (x)')).toEqual({ name: 'Hoody CLI', tag: null });
    expect(name('', 'x/1.0')).toEqual({ name: 'Unknown device', tag: null });
  });
});

describe('device names: untrusted text', () => {
  it('cleans the client name (controls, bidi) and cuts it at 80', () => {
    expect(name('', '', 'evil\u202egnp.exe\u0000x').name).toBe('evil gnp.exe x');
    expect(name('', '', 'x'.repeat(200)).name).toBe(`${'x'.repeat(79)}…`);
  });

  it('cleans and cuts an unread agent word at 40', () => {
    expect(name('', `${'a'.repeat(100)}/1`).name).toBe(`${'a'.repeat(39)}…`);
    expect(name('', 'ab\u2066cd/1').name).toBe('ab');
  });

  it('a long agent is read within its first 512 characters', () => {
    expect(name('', `${'Mozilla/5.0 (X11; Linux x86_64) '}${'x'.repeat(600)} Firefox/144.0`).name).toBe('Browser on Linux');
  });
});

describe('device names: programs, headless Chrome and invisible text', () => {
  it('a program that names a system in its agent is not a browser: it shows its first word', () => {
    expect(name('', 'MyTool/1.2 (Linux)')).toEqual({ name: 'MyTool', tag: null });
    expect(name('sdk', 'MyTool/1.2 (Linux)')).toEqual({ name: 'MyTool', tag: 'Hoody SDK' });
    expect(name('cli', 'SomeApp/2.0 (Windows NT 10.0)')).toEqual({ name: 'SomeApp', tag: 'Hoody CLI' });
    expect(name('', 'Dalvik/2.1.0 (Linux; U; Android 14; Pixel 8 Build/AP2A)')).toEqual({ name: 'Dalvik', tag: null });
    expect(name('', 'Hoody/1.0 (iPhone; iOS 18.0)')).toEqual({ name: 'Hoody', tag: null });
    expect(guessAgent('MyTool/1.2 (Linux)')).toEqual({ kind: 'other', text: 'MyTool' });
  });

  it('a browser agent with a system and no browser it knows is still a browser on that system', () => {
    expect(name('', 'Mozilla/5.0 (X11; Linux x86_64)')).toEqual({ name: 'Browser on Linux', tag: null });
    expect(name('', 'Mozilla/5.0 (Linux; Android 14)')).toEqual({ name: 'Browser on Android', tag: null });
    // A browser it knows, without the Mozilla prefix, stays a browser.
    expect(name('', 'Opera/9.80 (Windows NT 6.1) Presto/2.12.388 Version/12.18')).toEqual({ name: 'Opera on Windows', tag: null });
  });

  it('headless Chrome says so', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36';
    expect(guessAgent(ua)).toEqual({ kind: 'browser', browser: 'Headless Chrome', os: 'Linux' });
    expect(name('', ua)).toEqual({ name: 'Headless Chrome on Linux', tag: null });
    // Chrome itself is unchanged.
    expect(name('', UA.chromeMac)).toEqual({ name: 'Chrome on macOS', tag: null });
  });

  it('the Arabic letter mark and zero-width characters are removed from untrusted text', () => {
    expect(cleanLabel('\u061cevil', 80)).toBe('evil');
    for (const c of ['\u200b', '\u200c', '\u200d', '\u2060', '\u2061', '\u2062', '\u2063', '\u2064']) {
      expect(cleanLabel(`a${c}b`, 80)).toBe('a b');
      expect(cleanLabel(`${c}laptop${c}`, 80)).toBe('laptop');
    }
    expect(name('', '', '\u200bChrome on macOS')).toEqual({ name: 'Chrome on macOS', tag: null });
    // Visible text next to them is kept.
    expect(cleanLabel('caf\u00e9 \u0645\u0631\u062d\u0628\u0627', 80)).toBe('caf\u00e9 \u0645\u0631\u062d\u0628\u0627');
  });
});

describe('security history: how a sign-in came in', () => {
  it('uses the session words: web is Browser, ssh and webssh are SSH, Hoody clients by name', () => {
    expect(historyChannel('web', T)).toBe('Browser');
    expect(historyChannel('ssh', T)).toBe('SSH');
    expect(historyChannel('webssh', T)).toBe('SSH');
    expect(historyChannel('cli', T)).toBe('Hoody CLI');
    expect(historyChannel('sdk', T)).toBe('Hoody SDK');
    expect(historyChannel('agent', T)).toBe('Agent');
    expect(historyChannel(' cli ', T)).toBe('Hoody CLI');
  });

  it('unknown, empty or any other text is not known: null (the cell shows the no-value dash)', () => {
    for (const c of ['unknown', '', '   ', null, undefined, 'Web', 'mobile', 'web\u202e']) expect(historyChannel(c, T)).toBeNull();
  });
});

describe('untrusted text: joiners that shape text stay', () => {
  it('a ZWNJ inside a Persian word and a ZWJ inside a joined emoji are kept', () => {
    expect(cleanLabel('\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645', 80)).toBe('\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645');
    expect(cleanLabel('\u{1f468}\u200d\u{1f469}\u200d\u{1f467} laptop', 80)).toBe('\u{1f468}\u200d\u{1f469}\u200d\u{1f467} laptop');
  });

  it('a joiner next to ASCII, a space, an edge or another joiner goes', () => {
    expect(cleanLabel('a\u200db', 80)).toBe('a b');
    expect(cleanLabel('\u0645\u200cb', 80)).toBe('\u0645 b');
    expect(cleanLabel('a\u200c\u0645', 80)).toBe('a \u0645');
    expect(cleanLabel('\u200dlaptop\u200c', 80)).toBe('laptop');
    expect(cleanLabel('\u0645\u200c \u0645', 80)).toBe('\u0645 \u0645');
    expect(cleanLabel('\u0645\u200d\u200d\u0645', 80)).toBe('\u0645 \u0645');
    // Next to another invisible that goes (a word joiner), it goes too.
    expect(cleanLabel('\u0645\u2060\u200c\u0645', 80)).toBe('\u0645 \u0645');
  });

  it('kept only where it shapes text: a joining script or an emoji sequence', () => {
    // A Devanagari ZWNJ and an emoji ZWJ after the presentation selector shape text: kept.
    expect(cleanLabel('\u0915\u094d\u200c\u0937', 80)).toBe('\u0915\u094d\u200c\u0937');
    // An Arabic vowel mark (Script=Inherited) and the tatweel (Script=Common) are Arabic by Script_Extensions, so a ZWNJ
    // after either still shapes the word.
    expect(cleanLabel('\u0645\u064e\u200c\u062e', 80)).toBe('\u0645\u064e\u200c\u062e');
    expect(cleanLabel('\u0645\u0640\u200c\u062e', 80)).toBe('\u0645\u0640\u200c\u062e');
    // A mark shared with a joining script is not enough: one side must be the script's own character (Script=), so a
    // joiner between two shared marks in Latin, CJK, Cyrillic or Vedic-marked text goes.
    expect(cleanLabel('\u0645\u200c\u0308', 80)).toBe('\u0645\u200c\u0308');
    expect(cleanLabel('e\u0303\u200d\u0308', 80)).toBe('e\u0303 \u0308');
    expect(cleanLabel('o\u0307\u200c\u0323', 80)).toBe('o\u0307 \u0323');
    expect(cleanLabel('\u02bc\u200c\u02bc', 80)).toBe('\u02bc \u02bc');
    expect(cleanLabel('\u4e2d\u0308\u200c\u0308\u6587', 80)).toBe('\u4e2d\u0308 \u0308\u6587');
    expect(cleanLabel('\u0430\u1df8\u200c\u1df8', 80)).toBe('\u0430\u1df8 \u1df8');
    expect(cleanLabel('a\u0951\u200d\u0952', 80)).toBe('a\u0951 \u0952');
    expect(cleanLabel('\u2764\ufe0f\u200d\u{1f525}', 80)).toBe('\u2764\ufe0f\u200d\u{1f525}');
    // Between letters a joiner does not shape (Latin, CJK, Cyrillic), it would make two labels that look the same
    // differ: it goes.
    expect(cleanLabel('\u00e9\u200d\u00e9', 80)).toBe('\u00e9 \u00e9');
    expect(cleanLabel('\u65e5\u200c\u672c', 80)).toBe('\u65e5 \u672c');
    expect(cleanLabel('\u0430\u200d\u0431', 80)).toBe('\u0430 \u0431');
    // A ZWNJ is never part of an emoji sequence, and a joiner between an emoji and a letter shapes nothing.
    expect(cleanLabel('\u{1f468}\u200c\u{1f469}', 80)).toBe('\u{1f468} \u{1f469}');
    expect(cleanLabel('\u{1f468}\u200d\u0645', 80)).toBe('\u{1f468} \u0645');
    // Digits of a joining script, and two text signs that are pictographs (not an emoji sequence), join nothing
    // (the joiner between them carries no shape there).
    expect(cleanLabel('\u0660\u200c\u0661', 80)).toBe('\u0660 \u0661');
    // A letter of a joining script on one side and a digit of the same script on the other: no joining.
    expect(cleanLabel('\u0645\u200c\u0661', 80)).toBe('\u0645 \u0661');
    expect(cleanLabel('\u00a9\u200d\u00ae', 80)).toBe('\u00a9 \u00ae');
    // A sequence that joins a text pictograph after an emoji keeps its joiner (man health worker).
    expect(cleanLabel('\u{1f468}\u200d\u2695\ufe0f', 80)).toBe('\u{1f468}\u200d\u2695\ufe0f');
    // A selector or skin tone counts only on a pictograph; on one it keeps the joiner.
    expect(cleanLabel('a\ufe0f\u200d\u00a9', 80)).toBe('a\ufe0f \u00a9');
    expect(cleanLabel('a\u{1f3fd}\u200d\u{1f525}', 80)).toBe('a\u{1f3fd} \u{1f525}');
    expect(cleanLabel('\u{1f3c3}\u{1f3fd}\u200d\u2640\ufe0f', 80)).toBe('\u{1f3c3}\u{1f3fd}\u200d\u2640\ufe0f');
  });

  it('the cut at n splits no character and never ends on a joiner', () => {
    expect(cleanLabel('a\u{1f600}bc', 3)).toBe('a\u2026');
    expect(cleanLabel('\u{1f468}\u200d\u{1f469} x', 4)).toBe('\u{1f468}\u2026');
    expect(cleanLabel('abcdef', 4)).toBe('abc\u2026');
  });
});
