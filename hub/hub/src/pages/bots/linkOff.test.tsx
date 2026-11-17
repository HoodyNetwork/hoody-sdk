// Vitest: Bot links switched off on the platform. The API's GET /bot-urls/suggest-label answers 503 BOTS_DISABLED, and
// the three link surfaces (Link tab, Give it a link, New Bot) then say "Bot links aren't available here" with no
// address line, and neither drawer can send a link. The refusal wins also over an answer the query still holds from
// before, and a later answer brings the address back. Every closed door value has its own string, so no value falls
// through to another's text. The page reads the suggestion through the real useLinkOffer; only the read under it is
// replaced here, answering in sequence and refusing with the source's own error (SourceError, status and code).
import { act } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a test harness for the read under the hook, not page code
import { useQuery } from '@tanstack/react-query';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import type * as Fixtures from '@app/fixtures';
import { SourceError } from '@core';
import { LINK_DOORS_CLOSED, linkOfferOf, type LinkOffer } from './data';
import page from './page';
import strings from './strings.en.json';

type Step = 'ok' | 'off' | 'failed';
const Q = vi.hoisted(() => ({ steps: [] as Step[], run: 0, refetch: undefined as undefined | (() => Promise<unknown>) }));
const ANSWER: LinkOffer = { door: 'ready', suggestedLabel: 'quiet-amber-heron-bot', zone: 'hoody.bot' };

vi.mock('@app/fixtures', async (orig) => {
  const fx = await orig<typeof Fixtures>();
  return {
    ...fx,
    fixtureSource: (pageId: string) => {
      const real = fx.fixtureSource(pageId);
      return {
        ...real,
        useQuery: <T,>(key: string) => {
          const on = pageId === 'bots' && key === 'linkOffer' && Q.steps.length > 0;
          const fixture = real.useQuery<T>(key);
          const steps = useSteps(on);
          return on ? steps : fixture;
        },
      };
    },
  };
});

/** The suggestion read answering Q.steps in turn (the last one repeats): an answer, BOTS_DISABLED or another refusal.
 *  Called for every read so hooks keep their order; it reads only for the suggestion while steps are set. */
function useSteps(on: boolean) {
  const r = useQuery({
    queryKey: ['linkOff', Q.run],
    enabled: on,
    retry: false,
    queryFn: async (): Promise<LinkOffer> => {
      const step = Q.steps.length > 1 ? (Q.steps.shift() as Step) : Q.steps[0];
      if (step === 'ok') return ANSWER;
      throw new SourceError('server', step === 'off' ? 'BOTS_DISABLED' : 'BOT_LABEL_GENERATION_FAILED', 503);
    },
  });
  if (on) Q.refetch = r.refetch;
  return r;
}

const OFF = { status: 503, code: 'BOTS_DISABLED' };
const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const offText = 'Bot links aren\'t available here';
// The address the empty Link tab says the link will have (in its line, after "It will look like:"), and Give it a link's preview.
const ADDRESS = /https:\/\/quiet-amber-heron-bot\.hoody\.bot$/;

describe('linkOfferOf: the suggestion route\'s refusal', () => {
  const platform = { zone: 'bots.example.test', zoneFrom: 'platform' as const };

  it('503 BOTS_DISABLED is the off door, with no label and no zone, even with a platform zone to fill', () => {
    expect(linkOfferOf({ data: undefined, error: OFF }, platform).data).toEqual({ door: 'off', suggestedLabel: '', zone: '' });
  });

  it('the source\'s own error class carries it', () => {
    expect(linkOfferOf({ data: undefined, error: new SourceError('server', 'BOTS_DISABLED', 503) }, platform).data?.door).toBe('off');
  });

  it('any other refusal keeps the offer as it was (BOT_LABEL_GENERATION_FAILED unchanged)', () => {
    for (const error of [{ status: 503, code: 'BOT_LABEL_GENERATION_FAILED' }, { status: 500, code: 'BOTS_DISABLED' }, { status: 503 }, 'server', null]) {
      expect(linkOfferOf({ data: undefined, error }, platform).data).toBeUndefined();
      expect(linkOfferOf({ data: ANSWER, error }, platform).data).toEqual(ANSWER);
    }
  });

  it('a current refusal wins over the answer the query still holds from before it', () => {
    expect(linkOfferOf({ data: ANSWER, error: OFF }, platform).data?.door).toBe('off');
  });

  it('an answer with no zone still takes the fill (unchanged)', () => {
    expect(linkOfferOf({ data: { ...ANSWER, zone: '' } }, platform).data).toEqual({ ...ANSWER, ...platform });
  });
});

describe('every closed door has its own words', () => {
  it.each(LINK_DOORS_CLOSED)('link.door.%s', (door) => {
    const all = strings as Record<string, string>;
    expect(all[`link.door.${door}`]).toBeTruthy();
    const others = LINK_DOORS_CLOSED.filter((d) => d !== door).map((d) => all[`link.door.${d}`]);
    expect(others).not.toContain(all[`link.door.${door}`]);
  });

  it('the door a refusal gives is one of them', () => {
    const door = linkOfferOf({ data: undefined, error: OFF }, { zone: '' }).data?.door;
    expect(LINK_DOORS_CLOSED as readonly unknown[]).toContain(door);
  });

  it('off says Bot links aren\'t available here', () => {
    expect((strings as Record<string, string>)['link.door.off']).toBe(offText);
  });
});

describe('the surfaces when Bot links are off', () => {
  beforeAll(async () => {
    await import('./view');
  }, 30000);
  beforeEach(() => {
    Q.run += 1;
    Q.steps = [];
    Q.refetch = undefined;
  });

  /** No address and no address line: no URL, no "isn't available yet", no "It will look like" / "The address will be". */
  const noAddress = (root: HTMLElement) => {
    const text = root.textContent ?? '';
    expect(text).not.toMatch(/https:\/\//);
    for (const k of ['link.noZone', 'link.exampleLead', 'giveLink.previewLabel'] as const) expect(text).not.toContain(strings[k]);
  };
  const linkTab = `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link`;

  it('the Link tab says so, keeps its Give button disabled and shows no address', async () => {
    Q.steps = ['off'];
    await renderPage(page, { state: 'zoneUnknown', path: linkTab });
    expect(await screen.findByText(offText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['link.give'] })).toBeDisabled();
    expect(screen.queryByText(strings['link.door.unsupported'])).toBeNull();
    noAddress(document.body);
  });

  it('Bot links turned off while the page holds an answer: the next read says so; turned on again, the address is back', async () => {
    Q.steps = ['ok', 'off', 'ok'];
    await renderPage(page, { state: 'noLink', path: linkTab });
    // The Link tab's Give button follows the door (the header leaves Give it a link to this tab; on the
    // other tabs it shows only while links can be made): a closed door leaves the tab's disabled button
    // and its reason.
    const gives = () => screen.getAllByRole('button', { name: strings['link.give'] });
    const disabledGives = () => gives().filter((b) => (b as HTMLButtonElement).disabled).length;
    expect(await screen.findByText(ADDRESS)).toBeInTheDocument();
    expect(disabledGives()).toBe(0);
    expect(gives()).toHaveLength(1);
    await act(async () => void (await Q.refetch?.()));
    expect(await screen.findByText(offText)).toBeInTheDocument();
    expect(disabledGives()).toBe(1);
    expect(gives()).toHaveLength(1);
    noAddress(document.body);
    await act(async () => void (await Q.refetch?.()));
    expect(await screen.findByText(ADDRESS)).toBeInTheDocument();
    expect(screen.queryByText(offText)).toBeNull();
    expect(gives()).toHaveLength(1);
    expect(disabledGives()).toBe(0);
  });

  it('another refusal is not the off door', async () => {
    Q.steps = ['failed'];
    await renderPage(page, { state: 'zoneUnknown', path: linkTab });
    expect(await screen.findByText(strings['link.none'])).toBeInTheDocument();
    expect(screen.queryByText(offText)).toBeNull();
  });

  it('Give it a link says so, shows no address and cannot be sent', async () => {
    Q.steps = ['off'];
    await renderPage(page, { state: 'zoneUnknown', path: `${linkTab}&drawer=link` });
    const dialog = await screen.findByRole('dialog', { name: strings['giveLink.title'] });
    expect(await within(dialog).findByText(offText)).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['link.door.unsupported'])).toBeNull();
    noAddress(dialog);
    await userEvent.type(within(dialog).getByLabelText(strings['giveLink.labelField']), 'my-bot-link');
    expect(within(dialog).getByRole('button', { name: strings['giveLink.create'] })).toBeDisabled();
  });

  it('Give it a link with an answer can be sent (control)', async () => {
    Q.steps = ['ok'];
    await renderPage(page, { state: 'zoneUnknown', path: `${linkTab}&drawer=link` });
    const dialog = await screen.findByRole('dialog', { name: strings['giveLink.title'] });
    await userEvent.type(within(dialog).getByLabelText(strings['giveLink.labelField']), 'my-bot-link');
    expect(within(dialog).getByRole('button', { name: strings['giveLink.create'] })).toBeEnabled();
  });

  it('New Bot with a link says so, shows no address and cannot be sent; without the link it can', async () => {
    Q.steps = ['off'];
    await renderPage(page, { state: 'zoneUnknown', path: '/bots?drawer=new&initial=c-atlas' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    const create = () => within(dialog).getByRole('button', { name: strings['newBot.create'] });
    expect(create()).toBeEnabled();
    await userEvent.click(within(dialog).getByRole('switch', { name: strings['newBot.link'] }));
    expect(await within(dialog).findByText(offText)).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['link.door.unsupported'])).toBeNull();
    noAddress(dialog);
    expect(create()).toBeDisabled();
  });

  it('New Bot with a link and an answer can be sent (control)', async () => {
    Q.steps = ['ok'];
    await renderPage(page, { state: 'zoneUnknown', path: '/bots?drawer=new&initial=c-atlas' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    await userEvent.click(within(dialog).getByRole('switch', { name: strings['newBot.link'] }));
    expect(within(dialog).getByRole('button', { name: strings['newBot.create'] })).toBeEnabled();
  });
});
