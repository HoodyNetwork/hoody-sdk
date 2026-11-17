// Vitest (forms-required): a NEW key whose name the API refuses (409 BOT_KEY_NAME_TAKEN: the link already has a live key
// of that name) is named to the person. Key create is a secret route, which passes only its declared codes: before, the
// code was dropped and the form could only say "The key wasn't made". The mint is sent once and never again by itself.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@app/testing';
import { CoreQueryProvider, answers, api, bootFixtureCore, reply } from '@core';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ROUTES } from './data';
import { KeyDrawer } from './parts/LinkDrawers';
import strings from './strings.en.json';

afterEach(cleanup);

describe('New key: a name the API refuses', () => {
  it('the create route keeps the code of a 409 name-taken refusal, and the mint went out once', async () => {
    let sends = 0;
    bootFixtureCore({ rules: [reply(ROUTES.keyCreate, () => { sends += 1; return answers.refused(409, 'BOT_KEY_NAME_TAKEN'); })] });
    const caught = await api(ROUTES.keyCreate, { params: { id: 'bu_1' }, body: { name: 'default', ipv4_allow: [], notes: '' }, scrub: () => undefined }).then(
      () => null,
      (e: unknown) => e as { code?: unknown; kind?: unknown; message?: unknown },
    );
    expect(caught).not.toBeNull();
    expect(caught?.code).toBe('BOT_KEY_NAME_TAKEN');
    // A definite refusal (not pending), still without the API's own words: a secret route keeps safe fields only.
    expect(caught?.kind).not.toBe('pending');
    expect(caught?.message).toBeUndefined();
    expect(sends).toBe(1);
  });

  it('the key form says the name is taken, and sends nothing by itself', async () => {
    bootFixtureCore({ rules: [] });
    let runs = 0;
    const change = (outcome = 'idle', code?: string) =>
      ({ run: async () => { runs += 1; return { outcome: 'failed' as const, code }; }, outcome, data: undefined, code, details: undefined, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined }) as never;
    const ui: ReactNode = <KeyDrawer open onClose={() => undefined} editing={null} mint={change('failed', 'BOT_KEY_NAME_TAKEN')} edit={change()} />;
    const router = createRouter({ routeTree: createRootRoute({ component: () => <>{ui}</> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
    await act(async () => {
      render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
      await router.load();
    });
    expect(screen.getByText(strings['keyForm.failed'])).toBeVisible();
    expect(screen.getByText(strings['keyForm.nameTaken'])).toBeVisible();
    expect(runs).toBe(0);
  });
});
