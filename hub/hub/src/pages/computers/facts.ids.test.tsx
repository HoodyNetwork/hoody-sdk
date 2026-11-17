// The Overview facts: the project and the server, already named in the header, show their name with a copy-only id
// (no masked id a second time); every realm shows its masked id with a copy button (the same chip
// as the computer's own id).
import { describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { maskId } from '@kit';
import { renderPage, screen, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const COPY = 'Copy full reference';

async function fact(label: string): Promise<HTMLElement> {
  const dt = await screen.findByText(label, { selector: 'dt' }, { timeout: 8000 });
  return dt.nextElementSibling as HTMLElement;
}

describe('computers: Overview facts carry ids', () => {
  it('project and server: the name and a copy of the id, never the id shown; realms: each id with a copy button', async () => {
    const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas');
    expect(atlas).toBeDefined();
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });

    const project = await fact(strings['fact.project']);
    const name = fixtureWorld.projects.find((x) => x.id === atlas!.project_id)?.name;
    expect(name).toBeTruthy();
    expect(project).toHaveTextContent(name!);
    expect(project).not.toHaveTextContent(maskId(atlas!.project_id));
    expect(within(project).getByRole('button', { name: strings['copy.what'].replace('{{what}}', strings['fact.projectId']) })).toBeInTheDocument();
    expect(within(project).queryByRole('button', { name: COPY })).toBeNull();

    const server = await fact(strings['fact.server']);
    expect(server).toHaveTextContent(atlas!.server_name);
    expect(server).not.toHaveTextContent(maskId(atlas!.server_id));
    expect(within(server).getByRole('button', { name: strings['copy.what'].replace('{{what}}', strings['fact.serverId']) })).toBeInTheDocument();
    expect(within(server).queryByRole('button', { name: COPY })).toBeNull();

    const realms = await fact(strings['fact.realms']);
    expect(within(realms).getAllByRole('button', { name: COPY })).toHaveLength(atlas!.realm_ids.length);
    for (const id of atlas!.realm_ids) expect(realms).toHaveTextContent(maskId(id));
  });
});
