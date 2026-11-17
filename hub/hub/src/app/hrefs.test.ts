import { describe, expect, it, vi } from 'vitest';
import { hubHref, hubNavigate, isDocumentPath } from './hrefs';

describe('React Aria hrefs', () => {
  it('renders a Hub route as a hash path', () => {
    expect(hubHref('/bots?sel=x')).toBe('#/bots?sel=x');
  });

  it('keeps a classic /auth/ page as a full-document href', () => {
    expect(hubHref('/auth/home?view=computers')).toBe('/auth/home?view=computers');
    expect(hubHref('/auth/home')).toBe('/auth/home');
  });

  it('leaves absolute and relative hrefs alone', () => {
    expect(hubHref('https://example.com/a')).toBe('https://example.com/a');
    expect(hubHref('#/notes')).toBe('#/notes');
  });

  it('does not take a route that only starts with "auth" for a classic page', () => {
    expect(isDocumentPath('/authors')).toBe(false);
    expect(hubHref('/authors')).toBe('#/authors');
  });

  it('refuses any other href: only a same-origin path, a #/ route or an http(s) URL renders', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:void(0)', 'data:text/html,x', 'vbscript:x', 'notes', '#notes', ' /notes', '']) {
      expect(hubHref(bad)).toBe('#/');
    }
    expect(hubHref('//evil.example/x')).toBe('#//evil.example/x');
    expect(hubHref('http://example.com/a')).toBe('http://example.com/a');
  });

  it('never navigates to a refused href; a #/ route routes without its hash', () => {
    const route = vi.fn();
    const load = vi.fn();
    hubNavigate('javascript:alert(1)', route, load);
    hubNavigate('https://example.com/a', route, load);
    hubNavigate('//evil.example/x', route, load);
    expect(load).not.toHaveBeenCalled();
    expect(route).not.toHaveBeenCalled();
    hubNavigate('#/notes?sel=a', route, load);
    expect(route).toHaveBeenCalledWith('/notes?sel=a');
  });

  it('loads a classic page as a document and routes everything else', () => {
    const route = vi.fn();
    const load = vi.fn();
    hubNavigate('/auth/home?view=computers', route, load);
    hubNavigate('/notes', route, load);
    expect(load).toHaveBeenCalledWith('/auth/home?view=computers');
    expect(route).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledWith('/notes');
  });
});
