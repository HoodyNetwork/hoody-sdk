// The __ID__ page's data: its queries and mutations, declared in one place.
// The scaffold reads fixtures through fixtureSource. A live page moves these hooks onto @core (coreSource over
// its routes, or defineQuery/defineMutation) and keeps their names and types.
import { fixtureSource } from '@app/fixtures';

export type Region = 'eu' | 'us' | 'asia';
export type ChannelKind = 'email' | 'webhook';

export interface Channel {
  id: string;
  name: string;
  kind: ChannelKind;
}

export interface Settings {
  name: string;
  region: Region;
  emailAlerts: boolean;
  channels: Channel[];
}

/** The part of the settings the save bar sends. */
export type SettingsDraft = Pick<Settings, 'name' | 'region' | 'emailAlerts'>;

const source = fixtureSource('__ID__');

export function useSettings() {
  return source.useQuery<Settings>('settings');
}

/** Save the form. Its answer is a C9 outcome: `pending` means "may have gone through". */
export function useSaveSettings() {
  return source.useMutation<Settings, SettingsDraft>('save');
}

/** Delete everything this page configures. A C9 outcome like any send. */
export function useDeleteAll() {
  return source.useMutation<null>('delete');
}
