// The __ID__ page's data: its queries and mutations, declared in one place.
// The scaffold reads fixtures through fixtureSource. A live page moves these hooks onto @core (coreSource over
// its routes, or defineQuery/defineMutation) and keeps their names and types.
import { fixtureSource } from '@app/fixtures';

export type RecordStatus = 'active' | 'paused' | 'failed';

export interface ActivityEntry {
  id: string;
  /** What happened, already in plain words from the API ("Renamed by Ada"). */
  text: string;
  /** ISO time. */
  at: string;
}

export interface RecordDetail {
  /** A full 24-hex id: shown only through IdChip (Facts `id`), never as text. */
  id: string;
  name: string;
  status: RecordStatus;
  owner: string;
  realm: string;
  /** ISO time. */
  createdAt: string;
  sizeBytes: number;
  activity: ActivityEntry[];
}

const source = fixtureSource('__ID__');

export function useRecord() {
  return source.useQuery<RecordDetail>('record');
}

/** Rename the record. Its answer is a C9 outcome: `pending` means "may have gone through". */
export function useSaveRecord() {
  return source.useMutation<RecordDetail, { id: string; name: string }>('save');
}
