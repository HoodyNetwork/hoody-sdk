// storableParams must keep URL options the user typed.
import { describe, expect, it } from 'vitest';
import type { Catalog } from './catalog';
import catalog from './catalog.ui.json';
import { storableParams } from './options';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const CAT = catalog as unknown as Catalog;

describe('storableParams keeps the URLs the user typed', () => {
  const cases: Array<[string, 'terminal' | 'agent' | 'browser', string | undefined, string, string]> = [
    ['terminal panel, plain', 'terminal', undefined, 'panel', 'https://docs.example.com/guide'],
    ['terminal panel, user:pw@', 'terminal', undefined, 'panel', fake('https://ada:', 's3cret@intranet.example.com/wiki')],
    ['agent panel, user:pw@', 'agent', undefined, 'panel', 'https://ada:pw@dash.example.com/'],
    ['browser iframe_url, user:pw@', 'browser', 'display', 'iframe_url', 'https://ada:pw@cam.example.com/live'],
    ['browser iframe_url, a map embed with ?key=', 'browser', 'display', 'iframe_url', 'https://maps.example.com/embed?key=AIzaSyA1b2c3&q=Singapore'],
    ['terminal panel, a signed link with ?sig=', 'terminal', undefined, 'panel', 'https://files.example.com/report.pdf?sig=abc123'],
  ];
  for (const [name, program, view, id, url] of cases) {
    it(name, () => {
      expect(storableParams(CAT, program, view, { [id]: url })).toEqual({ [id]: url });
    });
  }
});
