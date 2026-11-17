import { describe, expect, it } from 'vitest';
import { createListeners } from './listeners';

describe('createListeners', () => {
  it('emits to every listener, in the order added', () => {
    const l = createListeners();
    const seen: string[] = [];
    l.add(() => seen.push('a'));
    l.add(() => seen.push('b'));
    l.emit();
    expect(seen).toEqual(['a', 'b']);
  });

  it('a throwing listener neither stops the others nor reaches the emitter', () => {
    const l = createListeners();
    let after = 0;
    l.add(() => { throw new Error('boom'); });
    l.add(() => { after++; });
    expect(() => l.emit()).not.toThrow();
    expect(after).toBe(1);
  });

  it('unsubscribe removes the listener, and a second call is harmless', () => {
    const l = createListeners();
    let n = 0;
    const off = l.add(() => { n++; });
    l.emit();
    off();
    off();
    l.emit();
    expect(n).toBe(1);
    expect(l.size).toBe(0);
  });

  it('emit runs a snapshot: a listener added or removed while it runs changes the next emit only', () => {
    const l = createListeners();
    const seen: string[] = [];
    let offB = () => {};
    l.add(() => {
      seen.push('a');
      offB();
      l.add(() => seen.push('late'));
    });
    offB = l.add(() => seen.push('b'));
    l.emit();
    expect(seen).toEqual(['a', 'b']);
    seen.length = 0;
    l.emit();
    expect(seen).toEqual(['a', 'late']);
  });

  it('adding one function twice is one entry; clear drops every entry', () => {
    const l = createListeners();
    let n = 0;
    const f = () => { n++; };
    l.add(f);
    l.add(f);
    expect(l.size).toBe(1);
    l.emit();
    expect(n).toBe(1);
    l.clear();
    expect(l.size).toBe(0);
    l.emit();
    expect(n).toBe(1);
  });
});
