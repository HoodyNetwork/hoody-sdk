// FormSection (terminal): the title is a line of its own above the description and the fields, a titled section and
// the summary draw a rule above themselves, and the section is a group named by its title (or its label).
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { FormSection } from './FormSection';
import { TextField } from './fields';

test('title, description, then the fields; a rule above a titled section', async () => {
  const t = await drawTest(
    <FocusRoot>
      <FormSection label="Key">
        <TextField label="Name" />
      </FormSection>
      <FormSection title="Access" description="Who may use the key.">
        <TextField label="Allowed addresses" />
      </FormSection>
    </FocusRoot>,
    { width: 60, height: 20 },
  );
  const f = await t.settle();
  const lines = f.split('\n');
  const at = (text: string) => lines.findIndex((l) => l.includes(text));
  expect(at('Name')).toBeGreaterThanOrEqual(0);
  expect(at('Access')).toBeGreaterThan(at('Name'));
  expect(at('Who may use the key.')).toBe(at('Access') + 1);
  expect(at('Allowed addresses')).toBeGreaterThan(at('Who may use the key.'));
  // the rule: a line of box-drawing dashes between the two sections
  const rule = lines.findIndex((l, i) => i > at('Name') && i < at('Access') && /─{10,}/.test(l));
  expect(rule).toBeGreaterThan(at('Name'));
});

test('the summary is ruled and named by its label', async () => {
  const t = await drawTest(
    <FocusRoot>
      <FormSection kind="summary" label="This link">
        <TextField label="Saved in" />
      </FormSection>
    </FocusRoot>,
    { width: 60, height: 10 },
  );
  const f = await t.settle();
  expect(/─{10,}/.test(f.split('\n')[0] ?? '')).toBe(true);
  expect(f).toContain('Saved in');
});
