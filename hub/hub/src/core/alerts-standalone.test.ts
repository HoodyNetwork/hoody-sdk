// alerts.ts alertIcon: a browser alert never names a file the page's own origin does not have. The served Hub's alerts
// carry its /auth/ icon; the standalone Hub (one HTML file on any origin, or a file) has no /auth/ folder of its own.
import { describe, expect, it } from 'vitest';
import { alertIcon } from './alerts';

describe('alertIcon', () => {
  it('the served Hub: its own icon, as always', () => {
    expect(alertIcon(false, '')).toBe('/auth/favicon-96x96.png');
  });

  it('the standalone Hub: the chosen Hoody\'s icon, never a path on the page\'s own origin', () => {
    expect(alertIcon(true, 'https://hoody.test')).toBe('https://hoody.test/auth/favicon-96x96.png');
  });

  it('the standalone Hub with no https Hoody: no icon at all (the browser shows its own)', () => {
    for (const o of [null, '', 'http://127.0.0.1:8080']) expect(alertIcon(true, o)).toBeUndefined();
  });
});
