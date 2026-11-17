// The computer's AI providers and models, for every page and the kit: the catalogue projection,
// the provider routes and their settled Api, and the API-key, ChatGPT and OpenRouter sign-in flows. Reached as
// `providers` from @core; no words live here (callers pass their own).
export * from './types';
export * from './catalogue';
export * from './api';
export * from './routes';
export { call, providersApi } from './call';
// A key save whose answer is unknown, held on the provider's credential lock (the AI page and the kit's KeySetup alike).
export * from './keySave';
export * from './flows-key';
export * from './flows-oauth';
export { browserEnv } from './env';
// The model choice contract: evidence reads, readiness, and the judgement at submit.
export * from './read';
export * from './readiness';
export * from './choice';
// The catalogue as one bundle per computer (one query, one run of readCatalogue).
export * from './bundle';
// The model picker's provider directory.
export * from './directory';
