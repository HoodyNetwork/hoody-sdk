// The page's string function, passed to each part (the parts never read strings on their own).
import type { useStrings } from '@kit';
import type strings from '../strings.en.json';

export type T = ReturnType<typeof useStrings<typeof strings>>;
