// The ChatGPT device-code and OpenRouter sign-ins live in @core's providers so the kit's provider setup runs the
// same flows; this page keeps its import path.
import { providers } from '@core';

export const { POLL_STEP, LIFE, HIDDEN_MAX, codeOf, linkFor, deviceStart, devicePoll, deviceCancel, jobEnd, checkHeldJob, readAuth, signedIn, setDefault } = providers;
// OpenRouter's sign-in (paste the address of the page that did not load).
export const { pkceLink, pkceStart, pkceInput, pkceSubmit, pkcePoll, pkceCancel, pkceJobEnd, signedInTo } = providers;
export type DeviceCode = providers.DeviceCode;
export type Plan = providers.Plan;
export type StartResult = providers.StartResult;
export type PollResult = providers.PollResult;
