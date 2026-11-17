// core/host-env.ts: the host seam. The load window holds registrations until the env resolves, a host installs once
// before that, and the browser path reads its globals at each call.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostEnv, installHostEnv, localStore, registrationGroup, resetHostEnvForTests, sessionStore, webHostEnv, type HostChannel, type HostEnv } from './host-env';

afterEach(() => { resetHostEnvForTests(); vi.restoreAllMocks(); });

function fakeEnv(log: string[]): HostEnv {
  const mem = (): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; key(i: number): string | null; readonly length: number } => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
  };
  const local = mem();
  return {
    local, session: mem(), vault: null, locks: null,
    onExternalChange: () => { log.push('ext+'); return () => { log.push('ext-'); }; },
    visible: () => true,
    onVisibilityChange: () => { log.push('vis+'); return () => { log.push('vis-'); }; },
    onLifecycle: (type) => { log.push('life+' + type); return () => { log.push('life-' + type); }; },
    channel: () => null,
  };
}

describe('the load window', () => {
  it('holds registrations until install, then attaches them in order', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    hostEnv().onExternalChange(() => {});
    hostEnv().onVisibilityChange(() => {});
    hostEnv().onLifecycle('pageshow', () => {});
    expect(log).toEqual([]);
    installHostEnv(fakeEnv(log));
    expect(log).toEqual(['ext+', 'vis+', 'life+pageshow']);
  });

  it('unsubscribing a held registration drops it; it never attaches', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    const off = hostEnv().onLifecycle('focus', () => {});
    hostEnv().onLifecycle('online', () => {});
    off(); off();
    installHostEnv(fakeEnv(log));
    expect(log).toEqual(['life+online']);
  });

  it('a registration unsubscribed while an earlier one is attaching never attaches', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    let offSecond: () => void = () => {};
    hostEnv().onLifecycle('online', () => {});
    offSecond = hostEnv().onLifecycle('offline', () => {});
    const env = fakeEnv(log);
    installHostEnv({ ...env, onLifecycle: (type) => { log.push('life+' + type); if (type === 'online') offSecond(); return () => {}; } });
    expect(log).toEqual(['life+online']);
  });

  it('unsubscribing after the attach calls the host unsubscribe once', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    const off = hostEnv().onVisibilityChange(() => {});
    installHostEnv(fakeEnv(log));
    off(); off();
    expect(log).toEqual(['vis+', 'vis-']);
  });

  it('a registration after the env resolved attaches at once', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    installHostEnv(fakeEnv(log));
    hostEnv().onLifecycle('offline', () => {});
    expect(log).toEqual(['life+offline']);
  });

  it('the first call that is not a registration resolves the env to the browser path and flushes', () => {
    resetHostEnvForTests({ unresolved: true });
    const add = vi.spyOn(window, 'addEventListener');
    hostEnv().onLifecycle('online', () => {});
    expect(add.mock.calls.filter(([n]) => n === 'online')).toHaveLength(0);
    expect(typeof hostEnv().visible()).toBe('boolean');
    expect(add.mock.calls.filter(([n]) => n === 'online')).toHaveLength(1);
  });

  it('install after the env resolved throws, and so does a second install', () => {
    resetHostEnvForTests({ unresolved: true });
    installHostEnv(fakeEnv([]));
    expect(() => installHostEnv(fakeEnv([]))).toThrow('HOST_ENV_ALREADY_RESOLVED');
    resetHostEnvForTests();
    expect(() => installHostEnv(fakeEnv([]))).toThrow('HOST_ENV_ALREADY_RESOLVED');
  });

  it('an installed env serves the storage, and a host with none throws the helper', () => {
    resetHostEnvForTests({ unresolved: true });
    const env = fakeEnv([]);
    installHostEnv({ ...env, session: null });
    localStore().setItem('a', '1');
    expect(hostEnv().local?.getItem('a')).toBe('1');
    expect(() => sessionStore()).toThrow('STORAGE_UNAVAILABLE');
  });
});

describe('the browser path', () => {
  it('reads each global at the call: a swapped or throwing storage is seen at once', () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!;
    try {
      const a = { getItem: () => 'A' };
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => a });
      expect(localStore().getItem('k')).toBe('A');
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
      expect(() => localStore()).toThrow('blocked');
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => undefined });
      expect(webHostEnv.local).toBeNull();
    } finally { Object.defineProperty(globalThis, 'localStorage', real); }
  });

  it('locks is navigator.locks itself, read at the call, null when absent', () => {
    const nav = globalThis.navigator;
    const real = Object.getOwnPropertyDescriptor(nav, 'locks');
    try {
      const l = { request: () => Promise.resolve() };
      Object.defineProperty(nav, 'locks', { configurable: true, get: () => l });
      expect(webHostEnv.locks).toBe(l);
      Object.defineProperty(nav, 'locks', { configurable: true, get: () => undefined });
      expect(webHostEnv.locks).toBeNull();
    } finally { if (real) Object.defineProperty(nav, 'locks', real); else delete (nav as unknown as Record<string, unknown>).locks; }
  });

  it('storage events carry the key (null for a clear) and the area', () => {
    const got: Array<[string, string | null]> = [];
    const off = hostEnv().onExternalChange((area, key) => { got.push([area, key]); });
    window.dispatchEvent(new StorageEvent('storage', { key: 'k1' }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    off();
    window.dispatchEvent(new StorageEvent('storage', { key: 'k2' }));
    expect(got).toEqual([['local', 'k1'], ['local', null]]);
  });

  it('a visibility change calls back with no read of its own: the callback reads visible() where it chooses', () => {
    const got: boolean[] = [];
    const off = hostEnv().onVisibilityChange(() => { got.push(webHostEnv.visible()); });
    const spy = vi.spyOn(document, 'visibilityState', 'get');
    spy.mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange'));
    spy.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'));
    off();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(got).toEqual([false, true]);
  });

  it('lifecycle events map: beforeunload can be prevented and given a return value, pageshow carries persisted', () => {
    const seen: string[] = [];
    const offU = hostEnv().onLifecycle('beforeunload', (e) => { e.preventDefault(); e.setReturnValue(''); seen.push(e.type); });
    const offP = hostEnv().onLifecycle('pageshow', (e) => { seen.push('pageshow:' + e.persisted); });
    const u = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(u);
    expect(u.defaultPrevented).toBe(true);
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    offU(); offP();
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    expect(seen).toEqual(['beforeunload', 'pageshow:true', 'pageshow:false']);
  });
});

describe('attaching, failing and channels', () => {
  it('a registration that unsubscribes while it is attaching leaves nothing attached (the host unsubscribe runs once)', () => {
    resetHostEnvForTests({ unresolved: true });
    const hostOff = vi.fn();
    const off = hostEnv().onLifecycle('focus', () => {});
    const env = fakeEnv([]);
    env.onLifecycle = () => { off(); return hostOff; };
    installHostEnv(env);
    expect(hostOff).toHaveBeenCalledTimes(1);
    off();
    expect(hostOff).toHaveBeenCalledTimes(1);
  });

  it('a held registration that fails to attach does not stop the others, and the first failure is thrown from the install', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    hostEnv().onExternalChange(() => {});
    hostEnv().onVisibilityChange(() => {});
    hostEnv().onLifecycle('pageshow', () => {});
    const env = fakeEnv(log);
    env.onVisibilityChange = () => { throw new Error('no document'); };
    expect(() => installHostEnv(env)).toThrow('no document');
    expect(log).toEqual(['ext+', 'life+pageshow']);
    expect(() => installHostEnv(env)).toThrow('HOST_ENV_ALREADY_RESOLVED');
  });

  it('a registration group: the first failure skips the rest of the group, the caller\'s onError takes it, others still attach', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    const errors: unknown[] = [];
    registrationGroup(() => {
      hostEnv().onVisibilityChange(() => {});
      hostEnv().onExternalChange(() => {});
      hostEnv().onLifecycle('pageshow', () => {});
    }, (e) => { errors.push(e); });
    hostEnv().onLifecycle('focus', () => {});
    const env = fakeEnv(log);
    env.onVisibilityChange = () => { throw new Error('no document'); };
    installHostEnv(env);
    expect(errors).toHaveLength(1);
    expect(log).toEqual(['life+focus']);
  });

  it('a group without an onError still skips its rest and the failure is thrown from the install', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    registrationGroup(() => {
      hostEnv().onVisibilityChange(() => {});
      hostEnv().onExternalChange(() => {});
    });
    const env = fakeEnv(log);
    env.onVisibilityChange = () => { throw new Error('boom'); };
    expect(() => installHostEnv(env)).toThrow('boom');
    expect(log).toEqual([]);
  });

  it('once the env is resolved a registration throws into its caller, group or not', () => {
    resetHostEnvForTests({ unresolved: true });
    const env = fakeEnv([]);
    env.onVisibilityChange = () => { throw new Error('no document'); };
    installHostEnv(env);
    const onError = vi.fn();
    expect(() => registrationGroup(() => { hostEnv().onVisibilityChange(() => {}); }, onError)).toThrow('no document');
    expect(onError).not.toHaveBeenCalled();
  });

  function fakeChannel(log: string[]): HostChannel {
    return {
      post: (m) => { log.push('post:' + String(m)); },
      onMessage: () => { log.push('msg+'); return () => { log.push('msg-'); }; },
      close: () => { log.push('close'); },
    };
  }

  it('a channel asked for in the load window attaches its subscription to the installed host, and the install still succeeds', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    const asked: string[] = [];
    const ch = hostEnv().channel('hub');
    ch!.onMessage(() => {});
    expect(asked).toEqual([]);
    const env = fakeEnv([]);
    env.channel = (name) => { asked.push(name); return fakeChannel(log); };
    installHostEnv(env);
    expect(asked).toEqual(['hub']);
    expect(log).toEqual(['msg+']);
  });

  it('unsubscribing a held channel subscription, or closing the channel, before the install opens nothing', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    const asked: string[] = [];
    const a = hostEnv().channel('a');
    a!.onMessage(() => {})();
    const b = hostEnv().channel('b');
    b!.onMessage(() => {});
    b!.close();
    const env = fakeEnv([]);
    env.channel = (name) => { asked.push(name); return fakeChannel(log); };
    installHostEnv(env);
    expect(asked).toEqual([]);
    expect(log).toEqual([]);
  });

  it('closing an attached deferred channel closes the real channel and its subscription; post reaches the real channel', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    const ch = hostEnv().channel('hub')!;
    ch.onMessage(() => {});
    const env = fakeEnv([]);
    env.channel = () => fakeChannel(log);
    installHostEnv(env);
    ch.post('x');
    ch.close();
    expect(log).toEqual(['msg+', 'post:x', 'msg-', 'close']);
    ch.post('y');
    expect(log).toHaveLength(4);
  });

  it('a channel asked for after the env resolved is the env\'s own (null where it has none)', () => {
    resetHostEnvForTests({ unresolved: true });
    installHostEnv(fakeEnv([]));
    expect(hostEnv().channel('hub')).toBeNull();
  });
});

describe('the browser path throws what the browser throws', () => {
  it('a throwing visibility read escapes visible()', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => { throw new Error('no visibility'); });
    expect(() => webHostEnv.visible()).toThrow('no visibility');
    expect(() => hostEnv().visible()).toThrow('no visibility');
  });

  it('a missing document escapes onVisibilityChange', () => {
    vi.stubGlobal('document', undefined);
    try {
      expect(() => webHostEnv.onVisibilityChange(() => {})).toThrow();
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('the channel, the handler and the event', () => {
  function taggedChannel(log: string[], id: number): HostChannel {
    return {
      post: (m) => { log.push(`post:${String(m)}@${id}`); },
      onMessage: () => { log.push(`msg+@${id}`); return () => { log.push(`msg-@${id}`); }; },
      close: () => { log.push(`close@${id}`); },
    };
  }

  it('subscribe, then post before the env resolves: one real channel, the subscription and the post on it, closed once', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    let made = 0;
    vi.spyOn(webHostEnv, 'channel').mockImplementation(() => taggedChannel(log, ++made));
    const ch = hostEnv().channel('hub')!;
    ch.onMessage(() => {});
    ch.post('x'); // resolves the env: the flush opens the channel for the subscription
    ch.post('y');
    ch.close();
    expect(made).toBe(1);
    expect(log).toEqual(['msg+@1', 'post:x@1', 'post:y@1', 'msg-@1', 'close@1']);
  });

  it('a close made while the held registrations attach leaves no channel open and posts nothing', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    let made = 0;
    hostEnv().onLifecycle('online', () => {});
    const ch = hostEnv().channel('hub')!;
    ch.onMessage(() => {});
    vi.spyOn(webHostEnv, 'onLifecycle').mockImplementation(() => { ch.close(); return () => {}; });
    vi.spyOn(webHostEnv, 'channel').mockImplementation(() => taggedChannel(log, ++made));
    ch.post('x');
    expect(made).toBe(0);
    expect(log).toEqual([]);
  });

  it('a group handler that throws does not stop the others; its error is the one thrown after them', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    registrationGroup(() => {
      hostEnv().onVisibilityChange(() => {});
      hostEnv().onExternalChange(() => {});
    }, () => { throw new Error('handler'); });
    hostEnv().onLifecycle('pageshow', () => {});
    const env = fakeEnv(log);
    env.onVisibilityChange = () => { throw new Error('no document'); };
    expect(() => installHostEnv(env)).toThrow('handler');
    expect(log).toEqual(['life+pageshow']);
  });

  it('an earlier unhandled failure stays the one thrown when a later handler throws too', () => {
    resetHostEnvForTests({ unresolved: true });
    const log: string[] = [];
    hostEnv().onExternalChange(() => {});
    registrationGroup(() => { hostEnv().onVisibilityChange(() => {}); }, () => { throw new Error('handler'); });
    hostEnv().onLifecycle('pageshow', () => {});
    const env = fakeEnv(log);
    env.onExternalChange = () => { throw new Error('first'); };
    env.onVisibilityChange = () => { throw new Error('second'); };
    expect(() => installHostEnv(env)).toThrow('first');
    expect(log).toEqual(['life+pageshow']);
  });

  it('a throwing visibility getter at the event still reaches the callback: the adapter reads nothing', () => {
    const calls: string[] = [];
    const off = hostEnv().onVisibilityChange(() => { calls.push('cb'); });
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => { throw new Error('getter'); });
    document.dispatchEvent(new Event('visibilitychange'));
    off();
    expect(calls).toEqual(['cb']);
  });
});
