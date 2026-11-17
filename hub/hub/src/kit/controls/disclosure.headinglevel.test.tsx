// A kit Heading inside a Disclosure's body sits one level below the trigger's heading (the Script settings
// categories were once peers of the Disclosure, h3 beside h3).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnatomySection, SubSection } from '../layouts/anatomy/Section';
import { Disclosure } from './Disclosure';

describe('Disclosure body heading level', () => {
  it('a SubSection in an open Disclosure inside a Section is one level below the Disclosure heading', () => {
    render(
      <AnatomySection id="step" title="Write the code">
        <Disclosure title="Script settings" defaultExpanded>
          <SubSection title="Running">
            <p>Inside</p>
          </SubSection>
        </Disclosure>
      </AnatomySection>,
    );
    expect(screen.getByRole('heading', { name: 'Write the code' }).tagName).toBe('H2');
    expect(screen.getByRole('heading', { name: 'Script settings' }).tagName).toBe('H3');
    expect(screen.getByRole('heading', { name: 'Running' }).tagName).toBe('H4');
  });

  it('follows a Disclosure given its own level', () => {
    render(
      <Disclosure title="Advanced" level={4} defaultExpanded>
        <SubSection title="Limits">
          <p>Inside</p>
        </SubSection>
      </Disclosure>,
    );
    expect(screen.getByRole('heading', { name: 'Advanced' }).tagName).toBe('H4');
    expect(screen.getByRole('heading', { name: 'Limits' }).tagName).toBe('H5');
  });
});
