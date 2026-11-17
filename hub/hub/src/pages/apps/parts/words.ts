// Words for apps values: strings go through t(), the rules stay in logic.ts.
import type { Tone, Translate } from '@kit';
import { agentById } from '../agents';
import { type Action, type LaunchTone, type OpenApp, type Opens, type Provider, rowView } from '../logic';
import type strings from '../strings.en.json';

export type T = Translate<typeof strings>;

export const TONE: Record<LaunchTone, Tone> = { busy: 'info', ok: 'ok', warn: 'warn', bad: 'danger', off: 'neutral' };

export const opensWord = (t: T, o: Opens | 'unknown'): string => t(`opens.short.${o}` as 'opens.short.web');

const SOURCES: Record<Provider, string> = { system: 'src.system', registry: 'src.registry', nix: 'src.nix', pkgx: 'src.pkgx', appimage: 'src.appimage', oci: 'src.oci', other: 'src.other' };
export const sourceWord = (t: T, p: Provider | null): string => (p ? t(SOURCES[p] as 'src.nix') : t('src.registry'));

/** The short state word of a launch view key ("st.ready" is "Ready"). */
export function shortState(t: T, key: string): string {
  const k = `short.${key}` as 'short.st.ready';
  const known = t(k);
  return known === k ? t('short.fail') : known;
}

export const ACTION_KEY: Record<Action, string> = {
  open: 'act.open', terminal: 'act.terminal', screen: 'act.screen', address: 'act.address', stop: 'act.stop', stopAgain: 'act.stopAgain', check: 'act.check', openAgain: 'act.openAgain',
  retry: 'act.retry', wait: 'act.retry', apps: 'act.apps', switch: 'act.switch', starters: 'act.starters', pick: 'act.pick', options: 'act.options', plain: 'act.plain',
  files: 'act.files', remove: 'act.remove',
};

/** The launch a row shows: a failed start shows its own reason, the rest its state. */
export function launchOf(r: OpenApp, rows: readonly OpenApp[]) {
  const twin = !!r.catalogId && rows.some((x) => x.key !== r.key && x.catalogId === r.catalogId && (x.state === 'running' || x.state === 'ready'));
  const v = rowView(r, twin);
  // A launch from a coding agent's card that the computer doesn't have: say it isn't installed (its install line is
  // beside), never "nothing found, open a ready app"; Try again once it is installed. Only the card's stamp counts:
  // an ordinary app or a Search row of the same name keeps its own words.
  return v.key === 'find.none' && agentById(r.agent) ? { ...v, key: 'agents.notInstalled', primary: 'retry' as const } : v;
}
