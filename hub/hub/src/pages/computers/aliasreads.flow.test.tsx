// One test of the whole path from a Computers alias
// create to the alias list Programs shows. The create goes through Computers' own change (useCreateAlias: the computers
// source's aliasCreate, its send, hold and read-back), while core's aliasList, the read Programs' useAliases holds
// (pages/programs/data.ts; a page test may not import another page's data, so it is read here through core), is
// mounted beside it. Once the create is proved (a done answer, or an unknown outcome a later read-back proves applied),
// core's list is read again and shows the new alias; a read-back that proves nothing leaves it as it was. A remove
// proved done reads it again too, and the alias leaves the list.
// eslint-disable-next-line no-restricted-imports -- a test harness for the two pages' hooks side by side, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aliasList, aliasRoutes, answers, bootFixtureCore, queryClient, reply, useCurrentComputer, type FixtureAnswer } from '@core';
import { useAliases, useCreateAlias, useRemoveAlias } from './data';

const at = '2026-10-20T10:00:00Z';
const was = { id: 'al-was', alias: 'shop', url: 'https://shop.custom-domain.example.test/', index: 8080, program: 'http', created_at: at };
const made = { id: 'al-made', alias: 'shop-front', url: 'https://shop-front.custom-domain.example.test/', index: 3000, program: 'http', created_at: at };

/** Whether the proxy holds the new alias now: every alias list read after it turns true shows it. */
let landed = false;
function rules(create: FixtureAnswer, landsAtSend: boolean) {
  return [
    reply(aliasRoutes.create, () => { if (landsAtSend) landed = true; return create; }),
    reply(aliasRoutes.remove, () => { landed = false; return answers.ok({}); }),
    reply(aliasRoutes.list, () => answers.ok({ data: { aliases: landed ? [was, made] : [was] } })),
  ];
}

type Create = ReturnType<typeof useCreateAlias>;
let create!: Create;
let remove!: ReturnType<typeof useRemoveAlias>;
let computer = '';
function Probe() {
  const id = useCurrentComputer()?.container.id ?? '';
  computer = id;
  // Computers: the alias drawer's read of this computer's aliases (the read its create reads back) and the create.
  useAliases(id || undefined);
  create = useCreateAlias();
  remove = useRemoveAlias();
  // Programs: core's alias list of the same computer, the read its port rows list.
  const programs = aliasList.use(id, { enabled: id !== '' });
  return <p data-testid="programs" data-at={programs.dataUpdatedAt}>{programs.data ? programs.data.map((a) => a.name).join(',') : 'loading'}</p>;
}
const mount = () => render(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>);
const programs = () => screen.getByTestId('programs');
const send = async () => {
  let r!: Awaited<ReturnType<Create['mutateAsync']>>;
  await act(async () => { r = await create.mutateAsync({ id: computer, port: 3000, name: 'shop-front' }); });
  return r;
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 150)); });

describe('a Computers alias create reaches the alias list Programs shows', () => {
  beforeEach(() => { landed = false; queryClient.clear(); });
  afterEach(() => cleanup());

  it('a done answer: core\'s alias list is read again and lists the new alias', async () => {
    bootFixtureCore({ rules: rules(answers.ok({ data: made }), true) });
    mount();
    await waitFor(() => expect(programs()).toHaveTextContent(/^shop$/));
    expect((await send()).outcome).toBe('done');
    await waitFor(() => expect(programs()).toHaveTextContent(/^shop,shop-front$/), { timeout: 3000 });
  });

  it('an unknown outcome later proved applied by the read-back: core\'s alias list is read again then, not before', async () => {
    bootFixtureCore({ rules: rules(answers.pending5xx(502), false) });
    mount();
    await waitFor(() => expect(programs()).toHaveTextContent(/^shop$/));
    const before = programs().getAttribute('data-at');
    expect((await send()).outcome).toBe('pending');
    // The read-back taken at once finds no new alias: nothing is proved, so core's list is not read again.
    await settle();
    expect(create.pending).toBe(true);
    expect(programs().getAttribute('data-at')).toBe(before);
    // The alias shows up later (it had gone through); Check again reads it back and proves the create applied.
    landed = true;
    let proved: boolean | undefined;
    await act(async () => { proved = await create.readBack(); });
    expect(proved).toBe(true);
    await waitFor(() => expect(programs()).toHaveTextContent(/^shop,shop-front$/), { timeout: 3000 });
  });

  it('a remove proved done: core\'s alias list is read again and the alias leaves it', async () => {
    landed = true;
    bootFixtureCore({ rules: rules(answers.ok({ data: made }), true) });
    mount();
    await waitFor(() => expect(programs()).toHaveTextContent(/^shop,shop-front$/));
    let r!: Awaited<ReturnType<typeof remove.mutateAsync>>;
    await act(async () => { r = await remove.mutateAsync({ id: computer, alias: made.id }); });
    expect(r.outcome).toBe('done');
    await waitFor(() => expect(programs()).toHaveTextContent(/^shop$/), { timeout: 3000 });
  });
});
