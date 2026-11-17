// An agent conversation's settings for every page and the kit: the value sets, the routes and their settled Api,
// read-back confirmation of each change, Claude Code's set on a computer, and the model rows. Reached as `agent`
// from @core; no words live here (callers pass their own).
export * from './types';
export * from './routes';
export * from './claude';
export * from './choices';
export { attachApi, attachRoutes, leaseOf, type AttachApi, type LeaseGrant } from './attach';
export { APPROVER_TTL_MS, approverApi, approverEpochOf, approverErrorOf, approverGenerationOf, approverGrantsOf, approverRoutes, blankApproverGrants, type ApproverApi } from './approver';
export { pauseApi, pauseOf, pauseOfEvent, pauseOfInit, pauseRoutes, type PauseApi, type PauseState } from './pause';
export { stopApi, stopPageOf, stopRoutes, type NotCovered, type StopApi, type StopItem, type StopOutcome, type StopPage, type StopRef } from './stop';
export { bashJobRoutes, bashJobsApi, jobListReplyOf, jobStopReplyOf, type BashJobsApi } from './bashJobs';
export { agentApi, applyDraft, confirmField, createFields, modelOf, readClaude, readSettings, saveField, sendField, settingsOf, type AgentApi, type FieldValue } from './api';
export { usageApi, usageRoutes, type UsageApi } from './usage';
export { closedOf, closeOf, deleteOf, loopsOf, presentOf, renameOf, sessionApi, sessionRoutes, sessionTitleOf, trimOf, turnsOf, type CloseResult, type DeleteResult, type LoopsRead, type RenameResult, type SessionApi, type TrimResult, type TurnsRead } from './session';
export { AGENT_LABELS, agentNamesOf, BUSY_CODES, liveApi, liveOf, PRODUCT_AGENTS, readLive, sendLive, type Fixed, type Live, type LiveApi, type LiveChange, type LiveSend } from './live';
export { APPROVAL_CODES, approvalApi, approvalOf, approvalRoutes, readApproval, sendApproval, shows as approvalShows, type Approval, type ApprovalApi, type ApprovalChange, type ApprovalMode, type ApprovalSend } from './approval';
