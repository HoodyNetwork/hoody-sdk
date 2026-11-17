// Vitest: a Band about a whole setting group takes the group itself as its `attach` (no page wrapper): the group, a named
// role="group", is described by the band's sentence after its own description.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Band } from '../states/Band';
import { SettingGroup } from './SettingGroup';

describe('SettingGroup aria-describedby', () => {
  it('a Band attached to a group describes it', () => {
    render(
      <Band tone="warn" attach={<SettingGroup label="Helpers"><p>rows</p></SettingGroup>}>
        Allow at least one kind.
      </Band>,
    );
    expect(screen.getByRole('group', { name: 'Helpers' })).toHaveAccessibleDescription('Allow at least one kind.');
  });

  it('passes a given aria-describedby to the group', () => {
    render(
      <>
        <p id="why">Saving with this off removes the voice.</p>
        <SettingGroup label="Voice" aria-describedby="why">
          <p>rows</p>
        </SettingGroup>
      </>,
    );
    expect(screen.getByRole('group', { name: 'Voice' })).toHaveAccessibleDescription('Saving with this off removes the voice.');
  });
});
