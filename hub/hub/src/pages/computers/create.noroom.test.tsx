// Get a computer when a server is the thing missing. The plate names which way it is missing and points at what the
// form really offers: with one server full the form picks another and the Server row offers more room; with every
// server full the plate says so and points at that offer; with no server at all it never says "pick another".
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const T = 20000;
const plate = (d: HTMLElement) => within(d).getByRole('group', { name: strings['create.sum.label'] });
const go = (d: HTMLElement) => within(d).getByRole('button', { name: strings['create.go'] });
const off = (el: HTMLElement) => el.matches(':disabled, [aria-disabled="true"]');

async function open(state: string, path = '/computers') {
  await renderPage(page, { path, state });
  if (!path.includes('get=')) await userEvent.click((await screen.findAllByRole('button', { name: strings['action.get'] }, { timeout: T }))[0] as HTMLElement);
  return screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: T });
}

describe('Get a computer: a server is missing', () => {
  it('one server full: the form picks one with room, stays ready, and the Server row offers more room', async () => {
    const d = await open('slotsFull');
    await within(d).findByRole('link', { name: new RegExp(strings['srv.upgrade']) }, { timeout: T });
    expect(plate(d)).toHaveTextContent(/^.*A new computer on .+\./);
    expect(plate(d).querySelector('[data-verdict-mark]')).toBeNull();
    expect(off(go(d))).toBe(false);
  }, 60000);

  it('every server full: the plate says no server has room and points at the more-room offer under Server', async () => {
    const d = await open('createNoRoom');
    const link = await within(d).findByRole('link', { name: new RegExp(strings['srv.upgrade']) }, { timeout: T });
    const marks = plate(d).querySelectorAll('[data-verdict-mark]');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent(strings['create.sum.noServer']);
    expect(within(plate(d)).getByText(strings['create.sum.fixRoom'])).toBeInTheDocument();
    // The offer sits in the Server row, where the plate points.
    expect(link.closest('[data-sg-row]')).toContainElement(within(d).getByRole('button', { name: new RegExp(`${strings['field.server']}$`) }));
    expect(within(d).getByText(strings['field.noRoom'])).toBeInTheDocument();
    // Get computer is off: the plate above is the reason.
    expect(off(go(d))).toBe(true);
  }, 60000);

  it('no server at all: the plate says so and never asks to pick another', async () => {
    const d = await open('emptyReinstalled', '/computers?get=1');
    await within(plate(d)).findByText(strings['create.sum.noneServer'], {}, { timeout: T });
    expect(plate(d)).not.toHaveTextContent(strings['create.sum.noServer']);
    expect(within(plate(d)).queryByText(strings['create.sum.fixServer'])).toBeNull();
    expect(within(plate(d)).queryByText(strings['create.sum.fixRoom'])).toBeNull();
    // The Server field agrees: no server, not "no room left".
    expect(within(d).getByText(strings['create.noServers'])).toBeInTheDocument();
    expect(within(d).queryByText(strings['field.noRoom'])).toBeNull();
    expect(off(go(d))).toBe(true);
  }, 60000);
});

describe('Get a computer: a create that may have gone through', () => {
  it('the header no longer says everything is filled in: the band is the only thing to read', async () => {
    const d = await open('pendingOps');
    expect(d).toHaveTextContent(strings['create.lede']);
    await userEvent.click(go(d));
    await within(d).findByRole('button', { name: /^Stop tracking/ }, { timeout: T });
    expect(d).not.toHaveTextContent(strings['create.lede']);
    expect(d).not.toHaveTextContent(strings['create.ledeMissing']);
  }, 60000);
});
