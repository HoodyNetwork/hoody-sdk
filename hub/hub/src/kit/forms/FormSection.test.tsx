// Vitest: FormSection, the group of fields in a form. Its title is a heading (never a field label), its description
// is the next line and comes before the fields, the section is a named group, and the kinds are marked for the CSS
// (a rule before every section but the first; the summary stays above the footer).
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { TextField } from './fields';
import f from './fields.module.css';
import { FormSection } from './FormSection';
import s from './FormSection.module.css';

beforeEach(() => {
  boot();
});

describe('FormSection', () => {
  it('draws the title as a heading, not with the field label look, and names the group by it', () => {
    render(
      <FormSection title="Access" description="Who may use the key.">
        <TextField label="Allowed addresses" />
      </FormSection>,
    );
    const group = screen.getByRole('group', { name: 'Access' });
    const heading = within(group).getByRole('heading', { name: 'Access' });
    expect(heading).toHaveAttribute('data-hub-heading');
    expect(heading.className).not.toContain(f.label ?? 'label');
    expect(group).toHaveAccessibleDescription('Who may use the key.');
  });

  it('puts the description directly under the title, before the fields', () => {
    render(
      <FormSection title="Access" description="Who may use the key.">
        <TextField label="Allowed addresses" description="Empty means any address." />
      </FormSection>,
    );
    const group = screen.getByRole('group', { name: 'Access' });
    const order = [screen.getByRole('heading', { name: 'Access' }), screen.getByText('Who may use the key.'), screen.getByRole('textbox', { name: 'Allowed addresses' })];
    for (let i = 0; i + 1 < order.length; i++) expect(order[i]!.compareDocumentPosition(order[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the head holds the title and the description only; the field sits in the body
    const head = group.firstElementChild!;
    expect(head.children).toHaveLength(2);
    expect(head.contains(screen.getByRole('textbox', { name: 'Allowed addresses' }))).toBe(false);
  });

  it('an untitled section is the leading group: no heading, named only by a label', () => {
    const { rerender } = render(
      <FormSection>
        <TextField label="Name" />
      </FormSection>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    rerender(
      <FormSection label="Key">
        <TextField label="Name" />
      </FormSection>,
    );
    expect(screen.getByRole('group', { name: 'Key' })).toBeInTheDocument();
  });

  it('marks its kind: a group by default, the closing summary on request', () => {
    render(
      <>
        <FormSection title="Notes">
          <TextField label="Note" />
        </FormSection>
        <FormSection kind="summary" label="This link">
          <span>3 of 20 keys</span>
        </FormSection>
      </>,
    );
    expect(screen.getByRole('group', { name: 'Notes' })).toHaveAttribute('data-form-section', 'group');
    const summary = screen.getByRole('group', { name: 'This link' });
    expect(summary).toHaveAttribute('data-form-section', 'summary');
    expect(summary.className).toContain(s.summary ?? 'summary');
  });
});
