// The API-key flows moved to @core's providers so the kit's provider setup runs the same C9
// rules; this page keeps its import path.
import { providers } from '@core';

export const { READ_WAITS, saveKey, saveEndpointKey, confirmKey, afterSave, testKey } = providers;
export type KeyState = providers.KeyState;
export type KeyResult = providers.KeyResult;
export type CheckResult = providers.CheckResult;
