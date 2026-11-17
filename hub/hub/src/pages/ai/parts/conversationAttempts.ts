// The open chat's send and Stop attempts and its draft: kept by the kit with the composer's send and Stop
// (kit/agent/convComposer.ts), so every surface that sends to a chat shares one record per chat. This page keeps its names.
// The raw writer and the test reset are not here (nor in the kit's index): a page writes the draft only (takeBackToDraft).
export { attemptTarget, attemptsOf, subscribeAttempts, takeBackToDraft, type ChatAttempts, type SendAttempt, type StopAttempt } from '@kit';
