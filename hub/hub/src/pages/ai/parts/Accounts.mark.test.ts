// Vitest (source): the AI accounts table names each provider after the kit's ProviderMark (the
// providers' own logos), keyed by the provider id, so the row shows the provider's logo, the Hoody icon for Hoody AI, or
// a Monogram for a provider without a logo; never a bare Monogram that skips the logo.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

it('the provider cell draws ProviderMark by the row\'s provider id', () => {
  const src = readFileSync(path.join(__dirname, 'Accounts.tsx'), 'utf8');
  expect(src).toMatch(/<ProviderMark id=\{c\.row\.original\.id\} name=\{c\.getValue\(\)\} \/>/);
  expect(src).not.toMatch(/<Monogram\b/);
});
