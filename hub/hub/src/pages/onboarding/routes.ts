// The onboarding page's own routes: the optional questions a new account is asked while its first computer is set up.
// Both are the account's own: the base host in every realm view, refused unsent in a token session (core/api.ts
// BASE_ONLY). Nothing here is a secret. The write is a PUT of the whole answer of one question: sent twice it changes
// nothing the second time.
import { defineRoute } from '@core';

export interface AnswersWire {
  data?: { questions?: unknown; answers?: unknown };
}

/** An answer (`options`) or a skip (`skipped: true`): one of the two, with the question's version. */
export type AnswerBody = { version: number; options: readonly string[] } | { version: number; skipped: true };

export const routes = {
  answers: defineRoute<AnswersWire>({ method: 'GET', path: '/users/me/onboarding/answers', scope: 'base', baseOnly: true }),
  answer: defineRoute<unknown, AnswerBody>({
    method: 'PUT',
    path: '/users/me/onboarding/answers/:question',
    scope: 'base',
    baseOnly: true,
    body: ['version', 'options', 'skipped'],
    codes: ['ONBOARDING_QUESTION_NOT_FOUND', 'ONBOARDING_QUESTION_CHANGED', 'ONBOARDING_ANSWER_INVALID', 'ONBOARDING_FIELD_INVALID'],
  }),
} as const;
