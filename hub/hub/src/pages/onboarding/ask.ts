// The questions' data: one read of what the account still has to be asked, and the send of each answer or skip.
// The questions are optional and never in the way: a read that fails, a session that is not the account's own, a page
// shown inside another page: each shows no question and says nothing. An answer is sent once and the next question
// shows at once; nothing here waits for the answer or reports it. What the server kept is read on the next visit.
import { api, capture, defineQuery, isFramed, useCan } from '@core';
import { useCallback, useState } from 'react';
import { asSent, openQuestions, shuffled, suggestionOf, type Question, type Suggestion } from './questions';
import { routes, type AnswerBody } from './routes';

const answersRead = defineQuery(routes.answers, { select: (r) => openQuestions(r?.data) });

function send(q: Question, body: AnswerBody): void {
  // recovers: an unknown outcome needs no notice; the answer is the whole value, and the next read shows what was kept.
  api(routes.answer, { params: { question: q.key }, body, ctx: capture(), recovers: true }).catch(() => undefined);
}

export interface Asking {
  /** The question to show now; undefined when there is none (none left, or none may be shown). */
  question: Question | undefined;
  /** Its place among the questions of this visit, from 1. */
  at: number;
  total: number;
  /** Sends the picks and shows the next question. */
  answer: (picked: readonly string[]) => void;
  /** Sends a skip and shows the next question. */
  skip: () => void;
  /** After the last question: what the person's own AI answer suggests doing next. */
  suggestion: Suggestion | null;
}

export function useAsking(): Asking {
  const account = useCan('account');
  // In a page shown inside another page changes are refused unsent: an answer could not be kept, so nothing is asked.
  const read = answersRead.use(undefined, { enabled: account && !isFramed() });
  // The questions of this visit are the first read's: a later read never reorders or brings back a card.
  const [queue, setQueue] = useState<readonly Question[] | null>(null);
  const [done, setDone] = useState(0);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  if (queue === null && read.data) setQueue(read.data.map((q) => (q.shuffle ? { ...q, options: shuffled(q.options) } : q)));
  const list = account ? (queue ?? []) : [];
  const question = list[done];
  const answer = useCallback(
    (picked: readonly string[]) => {
      if (!question) return;
      const options = asSent(question, picked);
      if (options.length === 0) return;
      send(question, { version: question.version, options });
      if (question.key === 'ai_access') setSuggestion(suggestionOf(options));
      setDone((n) => n + 1);
    },
    [question],
  );
  const skip = useCallback(() => {
    if (!question) return;
    send(question, { version: question.version, skipped: true });
    setDone((n) => n + 1);
  }, [question]);
  return { question, at: done + 1, total: list.length, answer, skip, suggestion: question ? null : suggestion };
}
