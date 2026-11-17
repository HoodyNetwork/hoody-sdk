// billing's browser-only part in the terminal: a provider's page opens in the person's browser when the host lent
// one (the kit's openOutside: opened, or copied and shown in a toast; the page keeps showing its pending state); another
// context's storage writes come from hostEnv().onExternalChange.
import { hostEnv } from '@core';
import type * as Web from './data.web';
import { openOutside } from '@kit';

export const leaveTo: typeof Web.leaveTo = (url) => { openOutside(url); };
export const onStorage: typeof Web.onStorage = (l) => hostEnv().onExternalChange(() => l());
