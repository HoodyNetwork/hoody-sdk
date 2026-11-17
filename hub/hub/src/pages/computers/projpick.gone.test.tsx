// A picked destination that drops off the projects list owes a pick again; the sentence
// then must not blame the realm ("This computer's project is not in this realm") when the source's own project is not
// the reason. Both drawers (Copy, New computer from a snapshot) go through realmProject + ProjectPick.
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@app/testing';
import { ProjectPick, realmProject } from './parts/ProjectPick';
import strings from './strings.en.json';
import type { Project } from './types';

const P: Project = { id: 'pP', name: 'Source home' };
const Q: Project = { id: 'pQ', name: 'Picked' };
const R: Project = { id: 'pR', name: 'Other' };
const OUTSIDE = 'OUTSIDE-SENTENCE';

function Harness({ projects, realm, wanted }: { projects: Project[]; realm: string; wanted: string }) {
  const [, setW] = useState(wanted);
  const pick = realmProject(projects, undefined, false, wanted, realm, P.id);
  return <ProjectPick pick={pick} onChange={setW} outsideText={OUTSIDE} noneText="none" sameText="same" />;
}

describe('computers: an owed project pick says why', () => {
  it('realmProject marks outside only when the source\'s own project is what the realm lacks', () => {
    expect(realmProject([Q, R], undefined, false, P.id, 'rA', P.id).outside).toBe(true);
    // Q was picked, then a refresh dropped Q: a pick is owed, but not because of the source's project.
    expect(realmProject([P, R], undefined, false, Q.id, 'rA', P.id)).toMatchObject({ state: 'pick', outside: false });
    expect(realmProject([R], undefined, false, Q.id, 'rA', P.id)).toMatchObject({ state: 'pick', outside: false });
    expect(realmProject([P, R], undefined, false, P.id, 'rA', P.id)).toMatchObject({ state: 'ok', outside: false });
    // All realms has no realm rule: never outside.
    expect(realmProject([R], undefined, false, Q.id, 'all', P.id)).toMatchObject({ state: 'pick' });
    expect(realmProject([R], undefined, false, Q.id, 'all', P.id).outside).toBeFalsy();
  });

  it('in All realms, a picked project gone after a refresh gets the neutral sentence, never "not in this realm"', () => {
    const r = render(<Harness projects={[Q, R]} realm="all" wanted={Q.id} />);
    expect(screen.queryByText(strings['projpick.owed'])).toBeNull();
    r.rerender(<Harness projects={[R]} realm="all" wanted={Q.id} />);
    expect(screen.getByText(strings['projpick.owed'])).toBeInTheDocument();
    expect(screen.queryByText(OUTSIDE)).toBeNull();
  });

  it('inside a realm that lists the source\'s project, a vanished pick gets the neutral sentence', () => {
    const r = render(<Harness projects={[P, Q]} realm="rA" wanted={Q.id} />);
    expect(screen.queryByText(strings['projpick.owed'])).toBeNull();
    r.rerender(<Harness projects={[P, R]} realm="rA" wanted={Q.id} />);
    expect(screen.getByText(strings['projpick.owed'])).toBeInTheDocument();
    expect(screen.queryByText(OUTSIDE)).toBeNull();
  });

  it('the source\'s own project outside the shown realm still gets the realm sentence', () => {
    render(<Harness projects={[Q, R]} realm="rA" wanted={P.id} />);
    expect(screen.getByText(OUTSIDE)).toBeInTheDocument();
    expect(screen.queryByText(strings['projpick.owed'])).toBeNull();
  });
});
