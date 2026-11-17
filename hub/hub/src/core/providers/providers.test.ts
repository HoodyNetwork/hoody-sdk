// core/providers: the lifted catalogue keeps no words of its own but Hoody's (the caller's names fill a nameless
// provider and model), the layer stays free of @kit, and the AI page's routes are core's objects.
// Hoody AI's names: the provider row reads as the Hub's own words, and a model under it shows a name or id only in
// Hoody's own form. Every other provider's names and ids show as the agent gives them.
import { describe, expect, it } from 'vitest';
import { routes as aiRoutes } from '../../pages/ai/routes';
import { catalogue, HOODY_NAME, idText, labelOf, list, modelNameOf, ownedByHoody, publicId, publicName, type Names } from './catalogue';
import { providerRoutes } from './routes';

const NAMES: Names = { model: 'MODEL-WORD', provider: 'PROVIDER-WORD' };

/** Qualifiers an agent could put on a Hoody AI name: a word in each place and separator a name can carry one. */
const QUALIFIED_PROVIDER_NAMES = [
  'Hoody AI (Upstream)', 'Hoody AI [Upstream]', 'Hoody AI via Upstream', 'Hoody AI on Upstream', 'Hoody AI - Upstream', 'Hoody AI: Upstream',
  'Hoody AI / Upstream', 'Hoody AI · Upstream', 'Upstream', 'Up Stream EU', 'UpUpstreamstream', 'Hoody AI powered by Upstream', 'hoody-ai upstream',
];
/** Model rows under Hoody AI that are not in Hoody's own form: [spec, display name]. */
const QUALIFIED_MODELS: Array<[string, string | undefined]> = [
  ['hoody-ai/up-auto', 'Upstream: Auto'], ['hoody-ai/upstream', 'Upstream'], ['hoody-ai/upstream', undefined], ['hoody-ai/up-stream', 'Up-Stream'],
  ['hoody-ai/upstream-fast', 'hoody-ai/upstream-fast'], ['hoody-ai/fast-upstream', 'Fast'], ['hoody-ai/upstream/auto', 'Auto'], ['hoody-ai/UPSTREAM-auto', undefined],
  ['hoody-ai/x1', 'UpUpstreamstream'], ['hoody-ai/x2', 'Up Upstream stream'], ['hoody-ai/hoody-free', 'Hoody Free (Upstream)'], ['hoody-ai/hoody-free', 'Hoody Free via Upstream'],
  ['hoody-ai/hoody-free', 'Upstream Free'], ['hoody-ai/hoody-fast', 'Hoody Upstream'], ['hoody-ai/hoody-up-stream', 'Hoody Up Stream'], ['hoody-ai/hoody-', 'Hoody '],
  ['hoody-ai/hoody-upstream', 'Hoody Upstream'], ['hoody-ai/hoody-upstream', undefined], ['hoody-ai/hoody-freeupstream', 'Hoody Freeupstream'], ['hoody-ai/hoody-0', 'Hoody 0'],
  ['hoody-ai/Hoody-Free', 'Hoody Free'], ['hoody-ai/hoody-free/upstream', 'Hoody Free'], ['hoody-ai/hoody_free', 'Hoody Free'], ['hoody-ai/plain', 'Plain'],
];

describe('core/providers', () => {
  it('names every other provider as the agent names it: provider, models, raw ids', () => {
    const cat = catalogue({
      providers: { providers: [{ id: 'acme', prefix: 'acme/', display_name: 'Acme (Upstream)' }, { id: 'hoody-ai', display_name: 'Hoody AI' }] },
      models: {
        models: [
          { spec: 'acme/auto', display_name: 'Upstream: Auto' },
          { spec: 'acme/acme', display_name: 'acme/acme' },
          { spec: 'acme/hoody-free', display_name: 'Anything at all' },
          { spec: 'acme/bare' },
        ],
      },
    });
    const by = Object.fromEntries(list(cat, 'worker', null, NAMES).map((m) => [m.spec, m]));
    expect(by['acme/auto']).toMatchObject({ providerLabel: 'Acme (Upstream)', label: 'Upstream: Auto' });
    expect(by['acme/acme']?.label).toBe('acme/acme');
    expect(by['acme/hoody-free']?.label).toBe('Anything at all');
    expect(by['acme/bare']?.label).toBe('acme/bare');
    expect(idText('acme', NAMES)).toBe('acme');
    expect(idText('acme/upstream/auto', NAMES)).toBe('acme/upstream/auto');
    expect(idText('', NAMES)).toBe('PROVIDER-WORD');
    expect(publicName('Upstream Auto', 'acme/a')).toBe('Upstream Auto');
    expect(publicName(undefined, 'acme/a')).toBe('');
    expect(publicId('acme/Any/Thing')).toBe('acme/Any/Thing');
    expect(modelNameOf('acme/upstream/auto', null, 'WORD')).toBe('acme/upstream/auto');
  });

  it('Hoody AI\'s provider row reads as the Hub\'s own words, whatever name the agent sends for it', () => {
    expect(HOODY_NAME).toBe('Hoody AI');
    for (const display_name of [...QUALIFIED_PROVIDER_NAMES, 'Hoody AI', '', undefined]) {
      const cat = catalogue({
        providers: { providers: [{ id: 'hoody-ai', display_name }, { id: 'up2', display_name: 'Up Stream EU' }] },
        models: { models: [{ spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free' }, { spec: 'up2/m', display_name: 'M' }] },
      });
      const by = Object.fromEntries(list(cat, 'worker', null, NAMES).map((m) => [m.spec, m]));
      expect(by['hoody-ai/hoody-free']?.providerLabel, String(display_name)).toBe('Hoody AI');
      expect(cat.byId['hoody-ai']?.label, String(display_name)).toBe('Hoody AI');
      expect(by['up2/m']?.providerLabel).toBe('Up Stream EU');
      if (display_name) expect(publicName(display_name, 'hoody-ai'), display_name).toBe('Hoody AI');
    }
    // A provider row that takes Hoody AI's prefix under another id is named the same way.
    const cat = catalogue({ providers: { providers: [{ id: 'other', prefix: 'hoody-ai/', display_name: 'Hoody AI (Upstream)' }] }, models: { models: [{ spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free' }] } });
    expect(list(cat, 'worker', null, NAMES)[0]?.providerLabel).toBe('Hoody AI');
  });

  it('a Hoody AI model in Hoody\'s own form keeps the agent\'s name and its id', () => {
    const own: Array<[string, string]> = [['hoody-ai/hoody-free', 'Hoody Free'], ['hoody-ai/hoody-decide', 'Hoody Decide'], ['hoody-ai/hoody-tts', 'Hoody TTS'], ['hoody-ai/hoody-stt', 'Hoody Stt'], ['hoody-ai/hoody-fast', 'Hoody Fast']];
    const cat = catalogue({ providers: { providers: [{ id: 'hoody-ai', display_name: 'Hoody AI' }] }, models: { models: own.map(([spec, display_name]) => ({ spec, display_name })) } });
    const by = Object.fromEntries(list(cat, 'worker', null, NAMES).map((m) => [m.spec, m]));
    for (const [spec, name] of own) {
      expect(by[spec]?.label, spec).toBe(name);
      expect(labelOf(spec, cat), spec).toBe(name);
      expect(publicName(name, spec), spec).toBe(name);
      expect(publicId(spec), spec).toBe(spec);
      expect(idText(spec, NAMES), spec).toBe(spec);
      expect(modelNameOf(spec, null, 'WORD'), spec).toBe(spec.slice('hoody-ai/'.length));
    }
    // Without a name of its own, an id in Hoody's own form shows as the id.
    const bare = catalogue({ providers: { providers: [{ id: 'hoody-ai' }] }, models: { models: [{ spec: 'hoody-ai/hoody-free' }] } });
    expect(list(bare, 'worker', null, NAMES)[0]?.label).toBe('hoody-ai/hoody-free');
    expect(idText('hoody-ai', NAMES)).toBe('hoody-ai');
  });

  it('any other name or id under Hoody AI is never shown: the caller\'s word, and the provider id alone for a raw id', () => {
    for (const [spec, display_name] of QUALIFIED_MODELS) {
      const at = `${spec} | ${String(display_name)}`;
      const cat = catalogue({ providers: { providers: [{ id: 'hoody-ai', display_name: 'Hoody AI' }] }, models: { models: [{ spec, display_name }] } });
      const row = list(cat, 'worker', null, NAMES)[0];
      const own = spec === 'hoody-ai/hoody-free' || spec === 'hoody-ai/hoody-fast';
      expect(publicId(spec), at).toBe(own ? spec : '');
      // A row never shows the agent's name; it shows its id only when the id is in Hoody's own form.
      expect(row?.label, at).toBe(own ? spec : 'MODEL-WORD');
      expect(labelOf(spec, cat), at).toBeNull();
      expect(publicName(display_name, spec), at).toBe('');
      expect(idText(spec, NAMES), at).toBe(own ? spec : 'hoody-ai');
      expect(modelNameOf(spec, cat, 'WORD'), at).toBe(own ? spec.slice('hoody-ai/'.length) : 'WORD');
      // Nothing a person reads repeats the qualifier.
      const shown = JSON.stringify([row?.label, row?.providerLabel, idText(spec, NAMES), modelNameOf(spec, cat, 'WORD')]);
      expect(shown, at).not.toMatch(/up[\W_]*stream/i);
    }
  });

  it('ownedByHoody: only Hoody AI\'s own provider id or a spec under it', () => {
    expect(ownedByHoody('hoody-ai')).toBe(true);
    expect(ownedByHoody('hoody-ai/x')).toBe(true);
    expect(ownedByHoody('hoody-aix/x')).toBe(false);
    expect(ownedByHoody('acme/hoody-ai')).toBe(false);
  });

  it('imports nothing from @kit or a page (core is below both)', () => {
    const files = import.meta.glob(['./*.ts', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(7);
    for (const [file, text] of Object.entries(files)) {
      expect(text, file).not.toMatch(/from '@kit'|from '@pages|\/pages\//);
    }
  });

  it('gives the AI page the very route objects core declares (fixture rules match by identity)', () => {
    for (const [name, route] of Object.entries(providerRoutes)) expect(aiRoutes[name as keyof typeof aiRoutes], name).toBe(route);
  });
});
