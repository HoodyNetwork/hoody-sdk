// Vitest: the reader, and every catalogue parameter sorted by hand.
import { describe, expect, it } from 'vitest';
import catalog from '../pages/board/embed/catalog.ui.json';
import { familyDomains } from './hosts';
import { ACTING_NAMES, LINK_PROGRAMS, PROGRAM_ACTING_NAMES, labelNamesOtherHost, readLink } from './linkRead';

const PROXY = 'computers.hoody.test';
/** The proxy's sibling host family, served the same way. */
const TWIN = familyDomains(PROXY).find((d) => d !== PROXY) as string;
const ENV = { proxy: PROXY, origin: 'https://hub.hoody.test' };
const P = 'a'.repeat(24);
const C = 'b'.repeat(24);
const on = (name: string, n: number | string = 1) => `${P}-${C}-${name}-${n}.sg1.${PROXY}`;
const read = (url: string) => {
  const r = readLink(url, ENV);
  if (!r) throw new Error('not read: ' + url);
  return r;
};

// Every catalogue parameter that is not acting, with why, in groups. A new name fails until it lands here or on an acting list.
const HARMLESS = new Set([
  // Terminal, display and code looks: fonts, cursor, colours, layout, reconnection, recording of the viewer's own view.
  'audio_codec', 'backgroundColor', 'bandwidth_limit', 'borderless', 'chromeless', 'clipboard', 'clipboard_poll', 'clipboard_preferred_format', 'clock', 'colorScheme', 'cursorBlink', 'cursorInactiveStyle', 'cursorStyle', 'cursorWidth', 'dark_mode', 'decorations', 'disable-walkthroughs', 'disableResizeOverlay', 'display_notifications', 'drawBoldTextInBrightColors', 'embed', 'embedBg', 'embedderOrigin', 'encoding', 'extension', 'fastScrollSensitivity', 'file_transfer', 'floating_menu', 'font', 'fontFamily', 'fontSize', 'fontWeight', 'fontWeightBold', 'hide-toolbar', 'hideFooter', 'hideHeader', 'hidePreview', 'hideSidebar', 'hoody-code', 'keyboard', 'keyboard_layout', 'letterSpacing', 'lineHeight', 'locale', 'maximize_new_windows', 'menu', 'minimumContrastRatio', 'mode', 'offscreen', 'override_height', 'override_width', 'page-loader', 'panel-height', 'panel-height-pct', 'panel-position', 'panel-resizable', 'panel-visible', 'panel-width', 'panel-width-pct', 'parent_keys', 'parent_origin', 'printing', 'quality', 'quality_mode', 'readonly', 'reconnect', 'reconnect_count', 'record', 'record_codec', 'record_format', 'record_fps', 'rendererType', 'screenReaderMode', 'scroll', 'scrollSensitivity', 'scroll_reverse_x', 'scroll_reverse_y', 'scroll_speed', 'scrollback', 'sidebar', 'slow_retry_delay', 'slow_retry_max_ms', 'smoothScrollDuration', 'soft_giveup_attempts', 'soft_giveup_ms', 'sound', 'suspend_inactive_tab', 'swap_keys', 'theme', 'title', 'title_show_display_id', 'title_show_hoody', 'toolbar', 'touchpad_scroll_scale', 'unicodeVersion', 'video', 'vrefresh', 'web_notifications', 'webtransport', 'onboarding', 'simple', 'ssl', 'insecure', 'view',
  // What to show: a place, a row, a page of a list. Reading only.
  'after_id', 'alias', 'at', 'base64', 'computer_id', 'content-type', 'cwd', 'db', 'diff', 'directory', 'display', 'displayId', 'download', 'folder', 'from_seq', 'from_ts', 'hash', 'history', 'id', 'json', 'limit', 'modalNodeId', 'node', 'nodeId', 'order', 'path', 'project_id', 'q', 'revision', 'sha256', 'sort', 'table', 'terminal_id', 'to_seq', 'to_ts', 'url_display_id', 'userId', 'wait_timeout', 'widgetId',
  // Diagnostics only: unlike `debug` itself these name a log channel.
  'app-name', 'debug_audio', 'debug_clipboard', 'debug_draw', 'debug_file', 'debug_geometry', 'debug_keyboard', 'debug_main', 'debug_mouse', 'debug_network', 'notification_connection_type', 'redirect_delay',
]);

const normal = (s: string) => s.toLowerCase().replace(/-/g, '_');
const onList = (list: readonly string[], n: string) => list.some((x) => (x.endsWith('*') ? n.startsWith(x.slice(0, -1)) : x === n));

type Param = { wire?: string };
const viewParams = new Set(Object.values(catalog.views as unknown as Record<string, { params?: Record<string, Param> }>).flatMap((v) => Object.entries(v.params ?? {}).flatMap(([k, p]) => [k, p.wire ?? k])));
const refused = new Set(Object.values(catalog.kits as unknown as Record<string, { refused?: Record<string, unknown> }>).flatMap((k) => Object.keys(k.refused ?? {})));

describe('the acting lists against the catalogue', () => {
  it('sorts every catalogue parameter: acting everywhere, acting on a program, or harmless', () => {
    expect(viewParams.size).toBeGreaterThan(100);
    expect(refused.size).toBeGreaterThan(50);
    const unsorted = [...viewParams, ...refused].filter((n) => !HARMLESS.has(n) && !onList(ACTING_NAMES, normal(n)) && !PROGRAM_ACTING_NAMES.includes(normal(n)));
    expect(unsorted).toEqual([]);
  });
  it('lists no harmless name that is also acting, and none the catalogue dropped', () => {
    const both = [...HARMLESS].filter((n) => onList(ACTING_NAMES, normal(n)) || PROGRAM_ACTING_NAMES.includes(normal(n)));
    expect(both).toEqual([]);
    expect([...HARMLESS].filter((n) => !viewParams.has(n) && !refused.has(n))).toEqual([]);
  });
  it('blocks exactly two names a Board view accepts, the two that frame any site', () => {
    expect([...viewParams].filter((n) => onList(ACTING_NAMES, normal(n))).sort()).toEqual(['iframe_url', 'panel']);
    expect([...viewParams].filter((n) => PROGRAM_ACTING_NAMES.includes(normal(n)))).toEqual([]);
  });
  it('the programs are the catalogue\'s', () => {
    expect([...LINK_PROGRAMS].sort()).toEqual([...(catalog.programs as string[])].sort());
  });
});

describe('families', () => {
  const cases: [string, string, string?][] = [
    [`https://${on('terminal', 3)}/`, 'program', 'terminal'],
    [`https://${on('t', 3)}/`, 'program', 'terminal'],
    [`https://${on('http', 3000)}/`, 'port', 'http'],
    [`https://${on('https', 3000)}/`, 'port', 'https'],
    [`https://${on('exec', 8)}/orders/list`, 'script', 'exec'],
    [`https://${on('cron')}/`, 'kit', 'cron'],
    [`https://my-app.sg1.${PROXY}/`, 'alias'],
    [`https://my-app.sg1.${TWIN}/`, 'alias'],
    ['http://localhost:3000/', 'local'],
    ['http://127.0.0.1:3000/', 'local'],
    ['http://0.0.0.0:3000/', 'local'],
    ['http://[::1]:3000/', 'local'],
    [`https://${P}-${C}-terminal-1.sg1.other.example/`, 'shaped', 'terminal'],
    ['https://example.org/', 'outside'],
    [`https://computers.hoody.test.evil.org/`, 'outside'],
    ['https://hub.hoody.test/auth/home#/ai', 'hub'],
    ['https://hub.hoody.test/other', 'outside'],
  ];
  for (const [url, family, name] of cases) {
    it(`${url.replace(/[0-9a-f]{24}/g, 'x')} is ${family}`, () => {
      const r = read(url);
      expect(r.family).toBe(family);
      expect(r.name).toBe(name);
    });
  }
  it('takes the parts from the host, and a trailing dot off it', () => {
    expect(read(`https://${on('http', 3000)}./x`)).toMatchObject({ project: P, computer: C, n: '3000', server: 'sg1', host: on('http', 3000) });
  });
  it('without a proxy domain, nothing is under it, and the Hoody shape still reads', () => {
    expect(readLink(`https://x.y.${PROXY}/?cmd=a`, { proxy: '', origin: '' })?.family).toBe('outside');
    expect(readLink(`https://${on('terminal')}/?cmd=a`, { proxy: '', origin: '' })).toMatchObject({ family: 'shaped', text: true });
  });
  it('answers null for anything but http(s)', () => {
    for (const u of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.example/', '/relative', 'not a url']) expect(readLink(u, ENV)).toBeNull();
  });
});

describe('hard block 1: acting names', () => {
  const hosts = [on('terminal'), on('t'), on('http', 7681), on('https', 7681), `my-alias.sg1.${PROXY}`, `my-alias.sg1.${TWIN}`, 'localhost:7681', '127.0.0.1:7681', '0.0.0.0:7681', `${P}-${C}-terminal-1.sg1.other.example`];
  for (const host of hosts) {
    for (const q of ['cmd=bHM=', 'arg=x', 'startup_script=x', 'shell=/bin/sh', 'ssh_host=x', 'socks5_port=1', 'panel=https://evil.org', 'iframe_url=https://evil.org']) {
      it(`${q} on ${host.replace(/[0-9a-f]{24}/g, 'x')} is text`, () => {
        expect(read(`https://${host}/?a=1&${q}`)).toMatchObject({ text: true, bare: true });
      });
    }
  }
  it('reads a name however it is written', () => {
    for (const q of ['CMD=x', 'c%6Dd=x', 'cmd', 'cmd[]=x', 'iframe-url=x', 'IFRAME_URL=x', 'a=1;cmd=x', 'welcome-iframe-url=x', 'REDIRECT=x']) expect(read(`https://${on('http', 7681)}/?${q}`).text, q).toBe(true);
  });
  it('reads the fragment when it holds pairs', () => {
    expect(read(`https://${on('http', 7681)}/#cmd=x`).text).toBe(true);
    expect(read(`https://${on('http', 7681)}/#/app?panel=x`).text).toBe(true);
    expect(read(`https://${on('http', 7681)}/#cmd`).text).toBe(false);
  });
  it('leaves an outside site alone, whatever its query says', () => {
    expect(read('https://example.org/?cmd=x&panel=y&redirect=z')).toMatchObject({ text: false, bare: false });
    expect(read(`https://computers.hoody.test.evil.org/?cmd=x`).text).toBe(false);
  });
  it('program names act on a program only', () => {
    for (const q of ['user=root', 'pid=1', 'agent=x', 'desktop=1', 'welcome=1', 'ephemeral=1', 'debug=1', 'steal=1', 'sharing=1', 'restart=1', 'action=x', 'app=x', 'sql=x', 'env=A%3D1', 'redirect=/x', 'reset=1']) {
      expect(read(`https://${on('terminal')}/?${q}`).text, q).toBe(true);
      expect(read(`https://${on('http', 3000)}/?${q}`).text, q).toBe(false);
    }
  });
  describe('env, redirect and reset: too common for every site', () => {
    for (const q of ['env=prod', 'redirect=/home', 'reset=1']) {
      it(`${q} acts on a program, a Hoody-shaped program and the terminal's port`, () => {
        for (const h of [on('terminal'), on('t'), on('files'), `${P}-${C}-terminal-1.sg1.other.example`, on('http', 7681), on('https', 7681), `${P}-${C}-http-7681.sg1.other.example`, 'localhost:7681', '127.0.0.1:7681']) expect(read(`https://${h}/?${q}`).text, h).toBe(true);
      });
      it(`${q} stays a plain link on other ports, an alias, a local app and a kit host`, () => {
        for (const h of [on('http', 3000), on('https', 3000), `${P}-${C}-http-3000.sg1.other.example`, `my-terminal.sg1.${PROXY}`, 'localhost:3000', on('exec', 8), on('cron')]) expect(read(`https://${h}/?${q}`), h).toMatchObject({ text: false, bare: false });
      });
    }
  });
  it('names the name it found', () => {
    expect(read(`https://${on('terminal')}/?cmd=x`).acting).toBe('cmd');
    expect(read(`https://${on('terminal')}/?SSH-host=x`).acting).toBe('ssh_host');
  });
  it('keeps what real links carry', () => {
    expect(read(`https://${on('terminal')}/?cwd=%2Fhome&readonly=true`)).toMatchObject({ text: false, bare: false });
    expect(read(`https://${on('terminal')}/?terminal_id=abc`)).toMatchObject({ text: false, bare: false });
    expect(read(`https://${on('http', 3000)}/orders/42?tab=open&page=2`)).toMatchObject({ text: false, bare: false });
    expect(read(`https://${on('http', 7681)}/?panel-height=3`).text).toBe(false);
  });
});

describe('hard block 2: nested values', () => {
  const inner = 'https://evil.org/x';
  const shapes: [string, string][] = [
    ['plain', inner],
    ['percent', encodeURIComponent(inner)],
    ['percent twice', encodeURIComponent(encodeURIComponent(inner))],
    ['base64', btoa(inner)],
    ['base64url of percent', encodeURIComponent(btoa(inner).replace(/=+$/, ''))],
    ['scheme-relative', '//evil.org/x'],
    ['backslashes', '\\\\evil.org/x'],
    ['with a tab', 'ht%09tps://evil.org/x'],
    ['javascript', 'javascript:alert(1)'],
    ['ws', 'wss://evil.org/x'],
  ];
  for (const [name, v] of shapes) {
    it(`${name} stays a link but loses frame and mark`, () => {
      expect(read(`https://${on('http', 3000)}/?next=${v}`)).toMatchObject({ nested: true, text: false, bare: true });
    });
  }
  it('reads every family under the proxy, and not an outside site', () => {
    expect(read(`https://x.sg1.${PROXY}/?u=${inner}`).nested).toBe(true);
    expect(read(`http://localhost:3000/?u=${inner}`).nested).toBe(true);
    expect(read(`https://example.org/?u=${inner}`)).toMatchObject({ nested: false, bare: false });
  });
  it('reads the fragment', () => {
    expect(read(`https://${on('http', 3000)}/#u=${inner}`).nested).toBe(true);
  });
  it('an address inside that would act is text', () => {
    const acting = `https://${on('terminal')}/?cmd=bHM=`;
    expect(read(`https://${on('http', 3000)}/?next=${encodeURIComponent(acting)}`)).toMatchObject({ acting: 'cmd', text: true });
    expect(read(`https://${on('http', 3000)}/?next=${btoa(acting)}`).text).toBe(true);
    const start = `https://${on('browser')}/api/v1/browser/start`;
    expect(read(`https://${on('http', 3000)}/?next=${encodeURIComponent(start)}`)).toMatchObject({ action: true, text: true });
    expect(read(`https://${on('http', 3000)}/?next=${encodeURIComponent('//' + on('terminal') + '/?panel=x')}`).text).toBe(true);
  });
  it('ordinary values are not addresses', () => {
    for (const v of ['hello', 'a:b', '/home/user', '2026-11-07', 'dGVzdHRlc3Q=', '12345678', 'http']) expect(read(`https://${on('http', 3000)}/?v=${v}`).nested, v).toBe(false);
  });
});

describe('hard block 3: program API paths', () => {
  it('a program API path stays a link with no frame or mark', () => {
    for (const p of ['/api/v1/x', '/API/v1/x', '//api/v1/x', '/x/../api/v1/x', '/%61pi/v1/x', '/api']) expect(read(`https://${on('files')}${p}`), p).toMatchObject({ api: true, text: false, bare: true });
  });
  it('a program page is not an API path, nor is a site\'s own /api on a port', () => {
    expect(read(`https://${on('files')}/apis/x`)).toMatchObject({ api: false, bare: false });
    expect(read(`https://${on('http', 3000)}/api/orders`)).toMatchObject({ api: false, bare: false });
  });
  it('a known action on GET is text, on any Hoody host', () => {
    for (const a of ['start', 'stop', 'restart']) {
      for (const h of [on('browser'), on('t'), on('http', 9222), `x.sg1.${PROXY}`]) expect(read(`https://${h}/api/v1/browser/${a}`), h).toMatchObject({ action: true, text: true });
    }
    expect(read(`https://${on('browser')}/API/V1//browser/start/?x=1`).text).toBe(true);
    expect(read('https://example.org/api/v1/browser/start').text).toBe(false);
    expect(read(`https://${on('browser')}/api/v1/browser/health`)).toMatchObject({ action: false, text: false, bare: true });
  });
});

describe('hard block 10: a Hub link in its fixed shape', () => {
  const hub = 'https://hub.hoody.test/auth/home';
  it('keeps the page and what selects', () => {
    expect(read(`${hub}#/ai/c/s1?computer=h1&realm=r1`).href).toBe(`${hub}#/ai/c/s1?computer=h1&realm=r1`);
    expect(read(`${hub}#/board?b=x`).href).toBe(`${hub}#/board?b=x`);
    expect(read(`${hub}#/skills?sel=a%20b`).href).toBe(`${hub}#/skills?sel=a+b`);
  });
  it('drops every other key', () => {
    for (const k of ['open_realm', 'add', 'cid', 'do', 'drawer', 'edit', 'new', 'connect', 'share', 'settings', 'anything']) {
      expect(read(`${hub}#/board?${k}=x&b=y`).href, k).toBe(`${hub}#/board?b=y`);
    }
    expect(read(`${hub}#/board?connect=ssh`).href).toBe(`${hub}#/board`);
  });
  it('drops the query before the fragment, and takes the first of a repeated key', () => {
    expect(read(`${hub}?open_realm=x#/ai`).href).toBe(`${hub}#/ai`);
    expect(read(`${hub}#/board?b=1&b=2`).href).toBe(`${hub}#/board?b=1`);
  });
  it('a page path of another shape opens the home page', () => {
    for (const h of ['#//evil.org', '#/\\evil.org', '#evil', '#', '', '#/a//b', '#/a|b', '#/a{b']) expect(read(hub + h).href, h).toBe(hub);
  });
  it('reads a trailing dot on the host as the Hub, and rebuilds on this origin', () => {
    expect(read('https://HUB.hoody.test./auth/home#/ai?open_realm=all&sel=x')).toMatchObject({ family: 'hub', href: `${hub}#/ai?sel=x` });
  });
  it('reads the Hub when this origin itself has the dot, either way round', () => {
    const dotted = { proxy: PROXY, origin: 'https://hub.hoody.test.' };
    for (const u of ['https://hub.hoody.test./auth/home#/ai?open_realm=all', 'https://hub.hoody.test/auth/home#/ai?open_realm=all']) {
      expect(readLink(u, dotted), u).toMatchObject({ family: 'hub', href: 'https://hub.hoody.test./auth/home#/ai' });
    }
    expect(readLink('https://hub.hoody.test:8443/auth/home#/ai?do=x', ENV)?.family).toBe('outside');
    expect(readLink('http://hub.hoody.test/auth/home#/ai?do=x', ENV)?.family).toBe('outside');
  });
  it('is the Hub only on this origin', () => {
    expect(read(`https://hub.hoody.test.evil.org/auth/home#/ai?do=x`).family).toBe('outside');
    expect(readLink(`${hub}#/ai`, { proxy: PROXY, origin: '' })?.family).toBe('outside');
  });
});

describe('hard block 11: embedded credentials', () => {
  it('reads the real host and drops them', () => {
    expect(read('https://hub.hoody.test@evil.org/x')).toMatchObject({ host: 'evil.org', href: 'https://evil.org/x', credentials: true, bare: true, text: false, family: 'outside' });
    expect(read('https://user:pw@example.org/')).toMatchObject({ href: 'https://example.org/', credentials: true, bare: true });
  });
  it('on a Hub page too', () => {
    expect(read('https://u:p@hub.hoody.test/auth/home#/ai')).toMatchObject({ family: 'hub', href: 'https://hub.hoody.test/auth/home#/ai', credentials: true, bare: true });
  });
});

describe('a label that names another host', () => {
  const lying: [string, string, string][] = [
    ['hub.hoody.com', 'evil.org', 'hub.hoody.com'],
    ['https://hub.hoody.com/login', 'evil.org', 'hub.hoody.com'],
    ['Open HUB.HOODY.COM now', 'evil.org', 'hub.hoody.com'],
    ['ｈｕｂ．ｈｏｏｄｙ．ｃｏｍ', 'evil.org', 'hub.hoody.com'],
    ['hub.hoo' + String.fromCharCode(0x200b) + 'dy.com', 'evil.org', 'hub.hoody.com'],
    ['hub。hoody。com', 'evil.org', 'hub.hoody.com'],
    ['hub.hoody.com', 'hub.hoody.com.evil.org', 'hub.hoody.com'],
    ['1.2.3.4', 'evil.org', '1.2.3.4'],
    ['https://notes.md/x', 'evil.org', 'notes.md'],
    ['hub.hoody.com.evil.org', 'evil.org', 'hub.hoody.com.evil.org'],
    ['docs.example.com', 'example.com', 'docs.example.com'],
    ['exämple.org', 'evil.org', 'xn--exmple-cua.org'],
  ];
  for (const [label, host, named] of lying) it(`"${label}" on ${host} names ${named}`, () => expect(labelNamesOtherHost(label, host)).toBe(named));
  const honest: [string, string][] = [
    ['example.com', 'example.com'],
    ['example.com', 'www.example.com'],
    ['EXAMPLE.COM', 'example.com'],
    ['the docs', 'evil.org'],
    ['README.md', 'evil.org'],
    ['checkout.ts', 'evil.org'],
    ['config.yaml', 'evil.org'],
    ['v1.2.3', 'evil.org'],
    ['e.g. this', 'evil.org'],
    ['3.14', 'evil.org'],
    ['Node.js', 'evil.org'],
  ];
  for (const [label, host] of honest) it(`"${label}" on ${host} does not`, () => expect(labelNamesOtherHost(label, host)).toBeNull());
});
