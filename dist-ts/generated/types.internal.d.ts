/**
 * Types the SDK needs and does not publish: the shapes behind composite methods, numbered schema
 * names (use the `<Ns><Schema>` alias), and shapes of removed operations that another type still uses.
 * No barrel re-exports this file; a public method or type that uses one of these names its own alias.
 */
import type { ArchiveContents, Base64ImageData, ChmodRequest, ChownRequest, CopyResponse, CurlRequest, DownloadResult, ExtractionResult, FileBase64Response, FileHashResponse, FileInfo, FileListing, FileStatResponse, GlobResults, GrepResults, HealthCacheSnapshot, JobKind, JobResultType, LastRun, MoveResponse, OverviewProgram, Program, RenameRequest, ResponseHeader, ResponseMetadata, ResponseTiming, ScreenshotInfo } from './types.js';
export interface AddProgramResponse2 {
    success: boolean;
    /** Not sent by this endpoint. `id` is omitted from the add response (the field is skipped when absent), so read the new id from `program.id`. It is carried by the responses that have no `program` to put it in, such as remove. */
    id?: number;
    program: Program;
}
/** The error codes agent_bootstrapHoodyToken documents (x-error-codes); see isApiErrorCode. */
export type AgentBootstrapHoodyTokenErrorCode = "bad_request" | "realm_scope_unsupported" | "token_rejected" | "login_not_for_this_box" | "login_grant_insufficient" | "login_expiring" | "admin_login_refused" | "forbidden" | "not_found" | "credential_present" | "agent_login_conflict" | "bootstrap_in_progress" | "login_changed" | "payload_too_large" | "rate_limited" | "internal_error" | "commit_failed" | "service_unavailable" | "platform_starting" | "platform_unavailable";
export interface AgentBootstrapHoodyTokenRequest {
    /** The raw Hoody platform token to install. Write-only; validated via the sidecar before install and never echoed. */
    token: string;
    /** The operator bootstrap capability, required only on deployments configured with one; a mismatch is answered 404. */
    capability?: string;
}
export type AgentBootstrapHoodyTokenResponse = {
    statusCode: number;
    message: string;
    data: Record<string, unknown>;
} | {
    statusCode: number;
    message: string;
    data: Record<string, unknown>;
};
/** The error codes agent_confirmGate documents (x-error-codes); see isApiErrorCode. */
export type AgentConfirmGateErrorCode = "bad_request" | "realm_scope_unsupported" | "approved_required" | "upgrade_required" | "invalid_realm" | "forbidden" | "not_found" | "gate_decision_pending" | "gate_already_resolved" | "no_pending_gate" | "stale_gate" | "gate_type_mismatch" | "decision_incomplete" | "approver_lease_required" | "approver_lease_invalid" | "approver_lease_expired" | "payload_too_large" | "rate_limited" | "internal_error" | "service_unavailable";
export interface AgentConfirmGateRequest {
    /** Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /api/v1/agent/sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives: a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409). Required on a session that requires approval on every action: a confirm without it is rejected 400. */
    gate_id?: string;
    /**
     * Echo of the parked gate generation. It restarts when the session is re-attached, so it is not an identity on its own: send gate_id. Optional on a default-policy session; required, and non-zero, on a session that requires approval on every action.
     * @minimum 0
     * @maximum 9007199254740991
     */
    generation?: number;
    /** Required: true to approve, false to deny. There is no default; a missing, null or non-boolean value is rejected 400. */
    approved: boolean;
    /**
     * Optional, with approved false only: why the action is refused. The agent reads it in the refused call's result, flattened to one line, together with the instruction not to reach the same effect another way. At most 500 characters; sent with approved true, or longer, it is rejected 400 bad_request.
     * @maxLength 500
     */
    reason?: string;
    /** Persist an approved directory grant to settings.json (WS↔REST parity). */
    persist_dirs?: boolean;
    /** With approved true: false approves this call only. Omitted or true, approving a file change also lets later changes to that file run without asking for the rest of the session, and persist_dirs is honoured; false asks again for the next change and saves nothing to settings.json (persist_dirs is ignored). */
    remember?: boolean;
    /** With approved false only, and no reason or session_scope: the call is declined because the user sent a new message instead of answering. The agent reads that the call was not run and that the new message decides what to do; it does not read a refusal, so it may still do the same thing if the new message asks for it, and the tool is not denied for the session. Sent with approved true, a reason or session_scope, it is rejected 400 bad_request. */
    superseded?: boolean;
    /** Remember this decision for the rest of the session (the Allow/Deny for session answer): with approved true the tool stops asking, with approved false it is refused without asking. Offer allow-for-session only when the gate's event.confirm_request carried offer_session_allow. Under a locked approval policy the wider grant is refused, but the one-shot decision still applies and the reply says so (session_scope_applied false, note). */
    session_scope?: boolean;
    /** With approved true, accept the gate's exec_trust offer (event.confirm_request): the call runs and exec cards on that computer in this realm stop until the grant is revoked (POST /api/v1/agent/hooks/rules exec_trust). Ignored when the gate carried no offer or the approval policy is locked. */
    trust_computer?: boolean;
    /**
     * Optional: the caller's own id for this decision, at most 64 characters from A-Z, a-z, 0-9, '.', '_' and '-' (anything else is 400 bad_request). When this decision is the one the gate consumed, a later 409 gate_already_resolved for the gate echoes it as details.request_id, so a caller that lost the 200 knows the recorded decision is its own.
     * @pattern ^[A-Za-z0-9._-]{0,64}$
     */
    request_id?: string;
    /**
     * The approver-lease generation the decision was made under: the generation of the gate's event.confirm_request, of a later event.decision_requirements, pending_gate.lease_generation on GET /api/v1/agent/sessions/{id}, /api/v1/agent/sessions/{id}/replay and prompt:sync, or pending_gate.generation on GET /api/v1/agent/sessions/{id}/state (the daemon's gate). Forwarded as is; omitted or 0 sends none. A decision carrying the lease capability (X-Hoody-Approver-Lease) is checked against the current lease whatever it sends; without one, a stale generation is refused. Not the gate generation above.
     * @minimum 0
     * @maximum 9007199254740991
     */
    lease_generation?: number;
}
/**
 * Gateway acknowledgement that the agent consumed this decision. Composed by the gateway, not the daemon's own reply: the success signal is status "ok", and the gate id, the generation and the approved flag are NOT echoed back at the top level.
 */
export interface AgentConfirmGateResponse {
    statusCode: number;
    message: string;
    data: {
        status?: string;
        resolved?: Record<string, unknown>;
        session_scope_applied?: boolean;
        note?: string;
    };
}
/** The error codes agent_createCompletion documents (x-error-codes); see isApiErrorCode. */
export type AgentCreateCompletionErrorCode = "bad_request" | "unsupported_setting" | "realm_scope_unsupported" | "forbidden" | "payload_too_large" | "model_unavailable" | "rate_limited" | "internal_error" | "upstream_error" | "service_unavailable" | "timeout";
export interface AgentCreateCompletionRequest {
    /** A provider/model spec, e.g. hoody-ai/hoody-free. The same policy as a session's model: the provider prefix must be catalogued, the model name after it need not be (an uncatalogued name is sent to the provider, which may reject it as upstream_error). An unknown provider or an empty model name is 422 model_unavailable (reason unknown_model); a fusion/ composite is 422 model_unavailable (reason fusion). */
    model: string;
    /** Optional system prompt. */
    system?: string;
    /** 1 to 1000 turns, oldest first; the last must be a user turn. */
    messages: ({
        role: "user" | "assistant";
        content: string;
    })[];
    /** Optional per-call model settings. A setting the model cannot honour is 400 unsupported_setting, never dropped. */
    settings?: {
        thinking?: {
            type: "enabled" | "disabled";
            effort?: "low" | "medium" | "high" | "xhigh" | "max";
        };
        temperature?: number;
        max_tokens?: number;
        response_format?: {
            type: "json_object" | "json_schema";
            schema?: Record<string, unknown>;
            name?: string;
            strict?: boolean;
        };
    };
    /** Deadline for the whole call, 1 to 600000 ms (default 120000). Reaching it is 504 timeout (an error frame once streaming). */
    timeout_ms?: number;
    /** Alias of settings.max_tokens (output-token cap, 1 to 1000000), accepted at the top level as most chat-completion APIs take it. Sending both with different values is 400 bad_request (details.field max_tokens). */
    max_tokens?: number;
}
/**
 * The finished completion, composed by the gateway from the daemon's llm.complete result.
 */
export interface AgentCreateCompletionResponse {
    statusCode: number;
    message: string;
    data: {
        status: string;
        model: string;
        text: string;
        stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "content_filter" | "refusal" | "pause_turn" | "model_context_window_exceeded" | "other";
        json_valid?: boolean;
        usage: {
            input_tokens: number;
            output_tokens: number;
            cache_read_tokens: number;
            cache_write_tokens: number;
            reasoning_tokens?: number;
        };
        cost_usd: number | null;
        cost_source: string | null;
        applied: {
            thinking: "enabled" | "disabled" | "provider_default";
            effort?: string;
            temperature?: number;
            max_tokens: number | null;
            response_format?: string;
        };
        duration_ms: number;
    };
}
/** The error codes agent_createHeadlessRun documents (x-error-codes); see isApiErrorCode. */
export type AgentCreateHeadlessRunErrorCode = "bad_request" | "invalid_realm" | "realm_scope_unsupported" | "forbidden" | "payload_too_large" | "rate_limited" | "internal_error" | "service_unavailable";
/**
 * The event payloads of agent_createHeadlessRun's stream, keyed by message title
 * (the message name when it has none), from the operation's x-async-api messages.
 */
export interface AgentCreateHeadlessRunEvents {
    /** Stream opened. The payload is the fixed marker {"format":"stream-json"}. It does NOT echo the prompt, workflow, model or any other request field, so there is nothing here to correlate against; it only tells you the SSE stream is live and the run has been dispatched. */
    "start": Record<string, unknown>;
    /** The captured headless run. The output TEXT is the `result` field; there is no `text` field. `status` is ok, or cancelled when the run's turn was cancelled (a cancelled run is not a success: its partial output is kept). A failed run is sent as the `error` frame, not this one. `outcome` is the turn's terminal outcome. Also carries session_id (the only handle on the run afterwards), model, agent, is_error, error, error_code (the typed code when the run's own input or workflow was refused before any turn, e.g. realm_not_allowed or restriction_unknown, or the code the run's turn ended with; a failed run is sent as the error frame), num_turns, duration_ms, a `steps` list, and `usage` with input_tokens, output_tokens, cache_creation_tokens and cache_read_tokens. usage is NOT keyed tokens.input/tokens.output. */
    "result": {
        status?: "ok" | "cancelled";
        outcome?: "completed" | "failed" | "cancelled" | "";
    };
    /** The run failed/timed out; carries {code,message}. A failure after the stream opened arrives here, for example code:"timeout" when the run exceeds its bound, or code:"admin_unauthorized" when the agent was started with a separate administrator token, which an HTTP request cannot supply. These are NOT HTTP statuses on this operation: the run starts after the 200 SSE response. A run that ran and failed also ends here: code is its error_code when it has one (e.g. spend_cap or realm_not_allowed), else run_failed, and `result` carries the captured Result (status:"failed", is_error, error, outcome, session_id, usage). */
    "error": Record<string, unknown>;
    /** Stream complete (always last). The payload is an empty object {}. It carries no status and no summary; read the outcome from the result or error frame. */
    "end": Record<string, unknown>;
}
/** The frames agent_createHeadlessRun's event stream types, by SSE event name: each frame's `data`; see ITypedStreamEvent. */
export interface AgentCreateHeadlessRunFrames {
    /** Stream opened. The payload is the fixed marker {"format":"stream-json"}. It does NOT echo the prompt, workflow, model or any other request field, so there is nothing here to correlate against; it only tells you the SSE stream is live and the run has been dispatched. */
    "start": Record<string, unknown>;
    /** The captured headless run. The output TEXT is the `result` field; there is no `text` field. `status` is ok, or cancelled when the run's turn was cancelled (a cancelled run is not a success: its partial output is kept). A failed run is sent as the `error` frame, not this one. `outcome` is the turn's terminal outcome. Also carries session_id (the only handle on the run afterwards), model, agent, is_error, error, error_code (the typed code when the run's own input or workflow was refused before any turn, e.g. realm_not_allowed or restriction_unknown, or the code the run's turn ended with; a failed run is sent as the error frame), num_turns, duration_ms, a `steps` list, and `usage` with input_tokens, output_tokens, cache_creation_tokens and cache_read_tokens. usage is NOT keyed tokens.input/tokens.output. */
    "result": {
        status?: "ok" | "cancelled";
        outcome?: "completed" | "failed" | "cancelled" | "";
    };
    /** The run failed/timed out; carries {code,message}. A failure after the stream opened arrives here, for example code:"timeout" when the run exceeds its bound, or code:"admin_unauthorized" when the agent was started with a separate administrator token, which an HTTP request cannot supply. These are NOT HTTP statuses on this operation: the run starts after the 200 SSE response. A run that ran and failed also ends here: code is its error_code when it has one (e.g. spend_cap or realm_not_allowed), else run_failed, and `result` carries the captured Result (status:"failed", is_error, error, outcome, session_id, usage). */
    "error": Record<string, unknown>;
    /** Stream complete (always last). The payload is an empty object {}. It carries no status and no summary; read the outcome from the result or error frame. */
    "end": Record<string, unknown>;
}
export interface AgentCreateHeadlessRunRequest {
    /** The prompt to drive the ephemeral session. Required unless workflow is set; with a workflow it is the optional $(workflow.prompt) text. */
    prompt?: string;
    /** Optional workflow name to run instead of a plain prompt turn. */
    workflow?: string;
    /** Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). Only accepted with workflow. A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400. */
    inputs?: Record<string, string>;
    /** Optional model spec for the run. */
    model?: string;
    /** Output rendering: text | json | stream-json. stream-json (or stream:true) streams the run over SSE; otherwise the run is an async job. */
    format?: string;
    /** Force SSE streaming (equivalent to format:stream-json). */
    stream?: boolean;
    /** Optional run timeout in milliseconds (clamped to the hard ceiling). */
    timeout_ms?: number;
}
/** The error codes agent_createSpeech documents (x-error-codes); see isApiErrorCode. */
export type AgentCreateSpeechErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "input_too_long" | "forbidden" | "not_found" | "realm_blocked" | "payload_too_large" | "model_unavailable" | "speech_not_configured" | "provider_refused" | "rate_limited" | "speech_quota_exceeded" | "internal_error" | "provider_auth" | "provider_error" | "service_unavailable" | "restriction_unknown" | "speech_unavailable" | "speech_busy" | "admission_write_failed" | "provider_timeout";
export interface AgentCreateSpeechRequest {
    /** A speech model spec (GET /api/v1/agent/audio/models?capability=tts). Omitted: settings audio.tts_model, else the Hoody AI relay model (hoody-ai/hoody-tts) unless settings audio.relay_default is false; with that off and no model set the call is 422 speech_not_configured. */
    model?: string;
    /** The text to speak (at most 4096 characters; less for some models). */
    input: string;
    /** A voice of the model (GET /api/v1/agent/audio/voices). Omitted, the model's first voice. */
    voice?: string;
    /** How to speak (tone, pace), for models that take it; a model that does not is 400. */
    instructions?: string;
    /** The audio format. pcm is 16-bit little-endian mono with no header (X-Hoody-Audio-Rate gives the rate). Omitted: wav when the model gives pcm or wav, else mp3. */
    response_format?: "mp3" | "wav" | "pcm";
    /** Speaking speed, for models that take it. */
    speed?: number;
    /** Not read here. Only an empty string is accepted; any other value is 400 bad_request (details.field stream_format). For a stream, use POST /api/v1/agent/audio/speech/stream. */
    stream_format?: "";
}
/** The error codes agent_createSpeechStream documents (x-error-codes); see isApiErrorCode. */
export type AgentCreateSpeechStreamErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "input_too_long" | "forbidden" | "not_found" | "realm_blocked" | "payload_too_large" | "model_unavailable" | "speech_not_configured" | "provider_refused" | "rate_limited" | "speech_quota_exceeded" | "internal_error" | "provider_auth" | "provider_error" | "service_unavailable" | "restriction_unknown" | "speech_unavailable" | "speech_busy" | "admission_write_failed" | "provider_timeout";
/**
 * The event payloads of agent_createSpeechStream's stream, keyed by message title
 * (the message name when it has none), from the operation's x-async-api messages.
 */
export interface AgentCreateSpeechStreamEvents {
    /** A piece of audio; carries {type, audio (base64), format, rate?}. */
    "speech.audio.delta": {
        type?: "speech.audio.delta";
        audio?: string;
        format?: "pcm" | "mp3";
        rate?: number;
    };
    /** The audio is complete; carries {type, usage}. Always last on success. */
    "speech.audio.done": {
        type?: "speech.audio.done";
        usage?: Record<string, unknown>;
    };
    /** The call failed after the first frame; carries {code, message, details?}. */
    "error": Record<string, unknown>;
}
/** The frames agent_createSpeechStream's event stream types, by SSE event name: each frame's `data`; see ITypedStreamEvent. */
export interface AgentCreateSpeechStreamFrames {
    /** A piece of audio; carries {type, audio (base64), format, rate?}. */
    "speech.audio.delta": {
        type?: "speech.audio.delta";
        audio?: string;
        format?: "pcm" | "mp3";
        rate?: number;
    };
    /** The audio is complete; carries {type, usage}. Always last on success. */
    "speech.audio.done": {
        type?: "speech.audio.done";
        usage?: Record<string, unknown>;
    };
    /** The call failed after the first frame; carries {code, message, details?}. */
    "error": Record<string, unknown>;
}
export interface AgentCreateSpeechStreamRequest {
    /** A speech model spec (GET /api/v1/agent/audio/models?capability=tts). Omitted: settings audio.tts_model, else the Hoody AI relay model (hoody-ai/hoody-tts) unless settings audio.relay_default is false; with that off and no model set the call is 422 speech_not_configured. */
    model?: string;
    /** The text to speak (at most 4096 characters; less for some models). */
    input: string;
    /** A voice of the model (GET /api/v1/agent/audio/voices). Omitted, the model's first voice. */
    voice?: string;
    /** How to speak (tone, pace), for models that take it; a model that does not is 400. */
    instructions?: string;
    /** The audio format of the stream: pcm or mp3 (wav is 400). pcm is 16-bit little-endian mono with no header (X-Hoody-Audio-Rate gives the rate). Omitted: pcm, else mp3 when the model gives no pcm. */
    response_format?: "pcm" | "mp3";
    /** Speaking speed, for models that take it. */
    speed?: number;
    /** Not read here: this route always streams. Only an empty string is accepted; any other value is 400 bad_request (details.field stream_format). */
    stream_format?: "";
}
/** The error codes agent_createTranscription documents (x-error-codes); see isApiErrorCode. */
export type AgentCreateTranscriptionErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "realm_blocked" | "payload_too_large" | "audio_too_long" | "unsupported_audio" | "model_unavailable" | "speech_not_configured" | "provider_refused" | "stt_suspect" | "rate_limited" | "speech_quota_exceeded" | "internal_error" | "provider_auth" | "provider_error" | "service_unavailable" | "restriction_unknown" | "speech_unavailable" | "speech_busy" | "admission_write_failed" | "provider_timeout";
/**
 * The transcript.
 */
export interface AgentCreateTranscriptionResponse {
    statusCode: number;
    message: string;
    data: {
        text: string;
        language?: string;
        duration?: number;
        segments?: Record<string, unknown>[];
        usage?: Record<string, unknown>;
    };
}
/** The error codes agent_createTranscriptionStream documents (x-error-codes); see isApiErrorCode. */
export type AgentCreateTranscriptionStreamErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "realm_blocked" | "payload_too_large" | "audio_too_long" | "unsupported_audio" | "model_unavailable" | "speech_not_configured" | "provider_refused" | "stt_suspect" | "rate_limited" | "speech_quota_exceeded" | "internal_error" | "provider_auth" | "provider_error" | "service_unavailable" | "restriction_unknown" | "speech_unavailable" | "speech_busy" | "admission_write_failed" | "provider_timeout";
/**
 * The event payloads of agent_createTranscriptionStream's stream, keyed by message title
 * (the message name when it has none), from the operation's x-async-api messages.
 */
export interface AgentCreateTranscriptionStreamEvents {
    /** New transcript text; carries {type, delta}. */
    "transcript.text.delta": {
        type?: "transcript.text.delta";
        delta?: string;
    };
    /** The whole transcript; carries {type, text, usage}. Always last on success. */
    "transcript.text.done": {
        type?: "transcript.text.done";
        text?: string;
        usage?: Record<string, unknown>;
    };
    /** The call failed after the first frame; carries {code, message, details?}. */
    "error": Record<string, unknown>;
}
/** The frames agent_createTranscriptionStream's event stream types, by SSE event name: each frame's `data`; see ITypedStreamEvent. */
export interface AgentCreateTranscriptionStreamFrames {
    /** New transcript text; carries {type, delta}. */
    "transcript.text.delta": {
        type?: "transcript.text.delta";
        delta?: string;
    };
    /** The whole transcript; carries {type, text, usage}. Always last on success. */
    "transcript.text.done": {
        type?: "transcript.text.done";
        text?: string;
        usage?: Record<string, unknown>;
    };
    /** The call failed after the first frame; carries {code, message, details?}. */
    "error": Record<string, unknown>;
}
/** The error codes agent_deleteSession documents (x-error-codes); see isApiErrorCode. */
export type AgentDeleteSessionErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "session_live" | "rate_limited" | "internal_error" | "store_failed" | "service_unavailable" | "session_terminating" | "restriction_unknown";
/**
 * Gateway acknowledgement of the delete. Composed by the gateway, not a daemon reply.
 */
export interface AgentDeleteSessionResponse {
    statusCode: number;
    message: string;
    data: {
        status?: string;
        closed?: boolean;
        hard?: boolean;
    };
}
/** The error codes agent_disableAllHooks documents (x-error-codes); see isApiErrorCode. */
export type AgentDisableAllHooksErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "write_intent_invalid" | "settings_key_ambiguous" | "payload_too_large" | "rate_limited" | "internal_error" | "store_failed" | "service_unavailable" | "restriction_unknown";
export interface AgentDisableAllHooksRequest {
    /** Live session id (hooks are session-scoped). Required, either here or as the `session_id` query parameter; a non-empty value here wins over the query. */
    session_id: string;
    /** The single-use write nonce from POST /api/v1/agent/hooks/begin-write minted for op:set_disabled + this scope; the RPC fails closed without it. */
    nonce: string;
    /** Scope of the settings file to write: user, project or local. It must match the nonce's scope. A shipped-hook toggle (shipped_id) does not need it: it always writes the first settings layer. */
    scope: "user" | "project" | "local";
    /** New kill-switch state: true disables all hooks in this scope, false clears the setting and re-enables them. Required: a missing or non-boolean value is refused with 400 bad_request and nothing is written. */
    value: boolean;
}
/**
 * The operation's JSON reply, passed through verbatim. The reply is {status, sessions, summary}.
 */
export interface AgentDisableAllHooksResponse {
    statusCode: number;
    message: string;
    data: Record<string, unknown>;
}
/** The error codes agent_githubCommit documents (x-error-codes); see isApiErrorCode. */
export type AgentGithubCommitErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "admin_unauthorized" | "forbidden" | "not_found" | "unresolved_conflicts" | "nothing_to_commit" | "github_not_linked" | "github_store_corrupt" | "payload_too_large" | "rate_limited" | "internal_error" | "git_command_failed" | "service_unavailable" | "github_store_unavailable" | "restriction_unknown";
/** The error codes agent_githubCommitPush documents (x-error-codes); see isApiErrorCode. */
export type AgentGithubCommitPushErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "github_token_forbidden" | "forbidden" | "not_found" | "unresolved_conflicts" | "unsafe_transport_config" | "unsafe_push_config" | "detached_head" | "invalid_branch" | "invalid_remote" | "no_remote" | "ambiguous_remote" | "unsafe_push_destination" | "upstream_exists" | "github_not_linked" | "github_store_corrupt" | "github_token_invalid" | "payload_too_large" | "rate_limited" | "internal_error" | "git_command_failed" | "push_failed" | "service_unavailable" | "github_store_unavailable" | "restriction_unknown";
export interface AgentGithubCommitPushRequest {
    /** The commit message (required, non-blank). */
    message: string;
    /** Optional, default false: publish the current branch: push it and make it track the same-named branch on its remote. Refused with 409 upstream_exists (details.committed when a commit landed) when the branch already tracks a DIFFERENT remote branch. */
    set_upstream?: boolean;
    /** Optional, default false. Force-pushes with `git push --force-with-lease`, OVERWRITING the remote branch's history: remote commits the local branch lacks are discarded. No confirmation round. Must be a JSON boolean. */
    force?: boolean;
}
/**
 * The commit+push outcome.
 */
export interface AgentGithubCommitPushResponse {
    statusCode: number;
    message: string;
    data: {
        status?: string;
        success?: boolean;
        committed?: boolean;
    };
}
export interface AgentGithubCommitRequest {
    /** The commit message. */
    message: string;
}
/**
 * The verbatim reply.
 */
export interface AgentGithubCommitResponse {
    statusCode: number;
    message: string;
    data: Record<string, unknown>;
}
/** The error codes agent_githubLogin documents (x-error-codes); see isApiErrorCode. */
export type AgentGithubLoginErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "admin_unauthorized" | "forbidden" | "not_found" | "payload_too_large" | "github_token_rejected" | "rate_limited" | "internal_error" | "service_unavailable" | "github_store_unavailable" | "restriction_unknown";
export interface AgentGithubLoginRequest {
    /** Optional PAT. When present the login validates + persists this token (no device flow); never returned. */
    token?: string;
    /** GitHub host for GitHub Enterprise (GHES); defaults to github.com. On the device flow it must match the host on the subsequent poll call; a login with a `token` completes in this one call. */
    host?: string;
    /** Whether the linked account becomes the ACTIVE one. Defaults to FALSE: linking stores the credential without changing which account is in use, because activation decides the identity your next push authenticates as. WHICH BRANCH: on the PAT branch (a `token` in this body) the account is linked and activated in this one call, so no follow-up POST /api/v1/agent/github/auth/active is needed. On the DEVICE branch there is no account yet to activate (this call only hands back a verification URL), so the flag is not consumed here; send it on POST /api/v1/agent/github/auth/login/poll instead, which is where the account is created and where activation is applied. The first account ever linked becomes active regardless, since none was. A non-boolean value is rejected. */
    activate?: boolean;
}
/**
 * The login-start reply, with status "ok": a device flow {device_code, user_code, verification_uri, interval, expires_in}, or for a PAT {key, login, host}.
 */
export interface AgentGithubLoginResponse {
    statusCode: number;
    message: string;
    data: Record<string, unknown>;
}
/** The error codes agent_hideWorkflow documents (x-error-codes); see isApiErrorCode. */
export type AgentHideWorkflowErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "payload_too_large" | "rate_limited" | "internal_error" | "store_failed" | "service_unavailable" | "restriction_unknown";
export interface AgentHideWorkflowRequest {
    /** true (default, when omitted) to hide the workflow; false to un-hide it. A value that is not a boolean is refused 400 bad_request and nothing is written. */
    hidden?: boolean;
}
/**
 * The operation's JSON reply, passed through verbatim.
 */
export interface AgentHideWorkflowResponse {
    statusCode: number;
    message: string;
    data: Record<string, unknown>;
}
/** The error codes agent_postSessionMessage documents (x-error-codes); see isApiErrorCode. */
export type AgentPostSessionMessageErrorCode = "bad_request" | "realm_scope_unsupported" | "empty_prompt" | "invalid_tool_mode" | "invalid_dir_scope" | "invalid_realm" | "realm_not_allowed" | "forbidden" | "not_found" | "gate_parked" | "turn_in_flight" | "turn_key_retired" | "payload_too_large" | "idempotency_key_reused" | "rate_limited" | "internal_error" | "service_unavailable" | "admission_unconfirmed" | "admission_write_failed" | "restriction_unknown" | "session_terminating";
export interface AgentPostSessionMessageRequest {
    /** Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs. */
    text: string;
    /** Optional tool mode: standard or orchestrator. It is not a per-turn override: the session's first turn applies it and fixes it for the session's lifetime (tool_mode_locked). On a later turn, one queued before the first turn ran included, the same value is accepted and a different one is refused 400 invalid_tool_mode; any other value is refused 400 invalid_tool_mode too. */
    tool_mode?: "standard" | "orchestrator";
    /** Optional directory-access scope: home or full. It is not a per-turn override: the session's first turn applies it and fixes it for the session's lifetime (dir_scope_locked). On a later turn, one queued before the first turn ran included, the same value is accepted and a different one is refused 400 invalid_dir_scope; any other value is refused 400 invalid_dir_scope too. */
    dir_scope?: "home" | "full";
    /** Optional images for this turn, as INLINE base64 bytes. At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted: nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, so an attachment with a non-empty path refuses the whole request with 400 bad_request before a turn is accepted. If the active model cannot accept images the daemon reports that on the session stream. */
    attachments?: {
        type: "image";
        media_type: string;
        data: string;
        name?: string;
    }[];
}
/**
 * The dispatch ack. The turn itself runs asynchronously: nothing here reports its outcome.
 */
export interface AgentPostSessionMessageResponse {
    statusCode: number;
    message: string;
    data: {
        job_id?: string;
        session_id?: string;
        turn_id?: string;
    };
}
/** The error codes agent_promptStream documents (x-error-codes); see isApiErrorCode. */
export type AgentPromptStreamErrorCode = "bad_request" | "realm_scope_unsupported" | "empty_prompt" | "invalid_tool_mode" | "invalid_dir_scope" | "invalid_realm" | "realm_not_allowed" | "forbidden" | "not_found" | "gate_parked" | "turn_in_flight" | "approval_policy_active" | "replay_unavailable" | "turn_key_retired" | "payload_too_large" | "idempotency_key_reused" | "rate_limited" | "internal_error" | "service_unavailable" | "admission_unconfirmed" | "admission_write_failed" | "restriction_unknown" | "session_terminating";
/**
 * The event payloads of agent_promptStream's stream, keyed by message title
 * (the message name when it has none), from the operation's x-async-api messages.
 */
export interface AgentPromptStreamEvents {
    /** Provider account rotated mid-turn. */
    "event.account_rotated": Record<string, unknown>;
    /** Turn complete: it ends a prompt turn. Carries the turn's typed outcome / error_code and notices [{code, message?, detail?}]. Notices are advisory, never an error: hook_skipped_by_policy when a configured user hook was skipped under the always policy, agent_compacts_itself when a Claude Code session's agent decides on its own when to compact its conversation, history_unsaved when a Claude Code session answered from a conversation Hoody could not save, spend_cap_warning when the session's spend file sets action warn and the turn ran over a spend cap (detail session_cap or turn_cap; one notice per cap) (open set). A turn a spend cap stopped fails with error_code spend_cap. */
    "event.agent_done": {
        turns?: number;
        outcome?: "completed" | "failed" | "cancelled";
        turn_id?: string;
        error_code?: string;
        notices?: {
            code: string;
            message?: string;
            detail?: string;
        }[];
        workflow_note?: {
            run_id: string;
            note: string;
            ack: string;
        };
    };
    /** The session's approval policy (mode / lock / rules) changed; carries the new revision. */
    "event.approval_policy_changed": Record<string, unknown>;
    /** Hoody platform auth state changed: login, token adopt, or logout (global broadcast; mirrors GET /api/v1/agent/hoody/auth/status). */
    "event.auth_changed": Record<string, unknown>;
    /** Auto-user composed the next user turn. */
    "event.auto_reply": Record<string, unknown>;
    /** Auto-user composition progress. */
    "event.auto_reply_progress": Record<string, unknown>;
    /** Background bash job list snapshot. */
    "event.bash_job_list": {
        jobs: {
            id: string;
            command?: string;
            running: boolean;
            interactive: boolean;
            exit?: string;
        }[] | null;
    };
    /** Background bash job output tail chunk. */
    "event.bash_job_output": {
        job_id: string;
        data?: string;
        next_offset?: number;
        gap?: boolean;
        eof?: boolean;
        exit?: string;
        err?: string;
    };
    /** Conversation cleared. */
    "event.clear": Record<string, unknown>;
    /** Commands sent with POST /api/v1/agent/sessions/{id}/commands reached the session: messages added to the conversation (how next_step inside the running turn, new_turn in a turn of their own, with turn_id), or a stop carried out (how stop, with what it stopped). Carries command_ids. */
    "event.command_committed": {
        command_ids: string[];
        turn_id?: string;
        how: "next_step" | "new_turn" | "stop";
        stopped?: ({
            kind: "session" | "task" | "workflow_run" | "bash_job" | "loop";
            id: string;
            outcome: "stopped" | "already_done" | "failed";
            detail?: string;
            cleanup?: "detached_may_survive";
        })[];
        cleanup?: "detached_may_survive";
    };
    /** Commands sent with POST /api/v1/agent/sessions/{id}/commands ended without reaching the session: superseded by a stop, refused (a hook blocked them, the session closed, or the session cannot take them) or failed (the session could not record them). Carries command_ids, state and reason. */
    "event.command_settled": {
        command_ids: string[];
        state: "superseded" | "refused" | "failed";
        reason?: "stop" | "order" | "hook" | "closed" | "unsupported" | "write_failed";
        detail?: string;
        superseded_by?: string;
    };
    /** A waiter this session owns (POST /api/v1/agent/sessions/{id}/waiters) ended: an outcome was found, or it timed out, was cancelled, or its target closed. Carries the waiter. */
    "event.waiter_done": {
        waiter: {
            waiter_id: string;
            label?: string;
            owner: string;
            target: string;
            outcomes: ({
                name: string;
                when?: string;
                match?: {
                    kind: "tool_result" | "tool_call" | "gate" | "turn_end";
                    tool?: string;
                    exit_code?: number;
                    is_error?: boolean;
                    text_contains?: string;
                    outcome?: "completed" | "failed" | "cancelled";
                };
            })[];
            from?: string;
            state: "waiting" | "done";
            outcome?: string;
            reason?: string;
            also_found?: string[];
            evidence?: {
                seq: number;
                turn_id?: string;
                kind: "tool_result" | "tool_call" | "gate" | "turn_end";
                tool?: string;
                exit_code?: number;
                is_error?: boolean;
                excerpt?: string;
                by: "match" | "judge";
                p?: number;
            };
            on_timeout?: "continue" | "stop" | "ask";
            created_at: string;
            deadline_at: string;
            ended_at?: string;
            elapsed_ms?: number;
            max_checks: number;
            checks: number;
            items_seen: number;
            gap?: boolean;
            cost_usd: number;
            cost_known: boolean;
            model?: string;
        };
    };
    /** Context window compacted. */
    "event.compacted": Record<string, unknown>;
    /** A delegated agent discarded its conversation and started a new one: the context meter no longer describes anything (clear it). */
    "event.context_reset": {
        reason?: string;
    };
    /** Context compaction started. */
    "event.compaction_started": Record<string, unknown>;
    /** Tool/plan confirmation requested (parks a gate). On a helper_gates session a helper's request carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. */
    "event.confirm_request": {
        tool_name: string;
        params: Record<string, unknown> | null;
        requested_dirs?: string[];
        detail?: string;
        offer_session_allow?: boolean;
        gate_id: number;
        gate_cause?: string;
        risk?: "read" | "write" | "destructive" | "high" | "credential_access" | "unknown";
        human_only: boolean;
        generation?: number;
        lease_required: boolean;
        task_id?: string;
        exec_trust?: {
            computer_id: string;
            computer_name?: string;
            realm: string;
            label: string;
        };
        rules?: {
            rule_ids: string[];
            outcome: "ask" | "unchecked";
            reason?: string;
        };
        helper_id?: string;
        parent_tool_call_id?: string;
    };
    /** The decision requirements of the PARKED gate changed (the approver lease was acquired, taken over, renewed past expiry or released while a gate is parked): {gate_id, generation, lease_required, helper_id?}. A client that captured the gate at park time refreshes what its decision must carry. On a helper_gates session each parked helper confirm is re-announced too, with its helper_id. */
    "event.decision_requirements": {
        gate_id: number;
        generation: number;
        lease_required: boolean;
        helper_id?: string;
    };
    /** Directory-access scope changed/locked. */
    "event.dir_scope": Record<string, unknown>;
    /** A peer client detached from this shared live session (multi-attach presence). */
    "event.client_left": Record<string, unknown>;
    /** A delegated turn went quiet past the stall window but is still running (not fatal, not an error). */
    "event.delegated_idle": {
        agent: string;
        idle_ms: number;
        message: string;
    };
    /** Session error (e.g. join_not_ready). */
    "event.error": {
        message: string;
        code?: string;
        diag?: {
            provider?: string;
            model?: string;
            base_url?: string;
            key_source?: string;
            key_prefix?: string;
            http_status?: number;
            retryable?: boolean;
            attempts?: number;
            req_id?: string;
            err_code?: "timeout" | "rate_limit" | "auth" | "network" | "provider" | "canceled" | "context_overflow" | "provider_incomplete_response" | "max_tokens" | "bad_tool_args" | "unknown";
            stop_reason?: string;
            last_error?: string;
        };
        max_steps?: number;
        reason?: string;
        retry_after_secs?: number;
        retry_at?: string;
        spend_cap_usd?: number;
        spent_usd?: number;
        resume_run_id?: string;
    };
    /** A parked confirm/question gate was resolved (possibly by another attached client). */
    "event.gate_resolved": {
        kind: "confirm" | "question";
        gate_id?: number;
        question_id?: number;
        outcome?: "answered" | "cancelled" | "yolo" | "timeout";
        provenance?: "decision" | "yolo" | "cancelled" | "closed" | "context_cancelled" | "timeout";
        holder?: string;
        generation?: number;
        request_id?: string;
        helper_id?: string;
        parent_tool_call_id?: string;
        task_id?: string;
        decision?: {
            approved?: boolean;
            persist_dirs?: boolean;
            session_scope?: boolean;
            trust_computer?: boolean;
            remember?: boolean;
            superseded?: boolean;
        };
        session_scope_applied?: boolean;
        note?: string;
    };
    /** Files-tab import progress. */
    "event.files_import_progress": Record<string, unknown>;
    /** Fusion configuration changed. */
    "event.fusion_changed": Record<string, unknown>;
    /** A Jev decision made for this session finished (success, error or invalid answer): {cost_usd (null when any attempt's spend is unknown), known_cost_usd, cost_unknown_attempts, attempts, latency_ms, model, request_id, input_tokens, output_tokens, error_code}. Produced by POST /api/v1/agent/sessions/{id}/jev/decide; the standalone /api/v1/agent/jev routes report usage only in their reply and in GET /api/v1/agent/jev/settings. */
    "event.jev_usage": Record<string, unknown>;
    /** Token usage of a turn that already ended, counted after its completion events went out (a Claude Code agent reported it after the turn closed). Add it to the session's lifetime totals only: it is not a response, and it belongs to no turn in progress, so it changes no turn's usage, timing or context use. turn_id names the ended turn. */
    "event.late_usage": {
        turn_id: string;
        input_tokens: number;
        output_tokens: number;
        cache_creation_tokens: number;
        cache_read_tokens: number;
    };
    /** Fusion member trajectory progress. Not sent while the fusion runs inside a silent workflow step. */
    "event.fusion_progress": Record<string, unknown>;
    /** Hoody concept mode toggled. */
    "event.hoody_mode": Record<string, unknown>;
    /** A hook executed. */
    "event.hook_run": Record<string, unknown>;
    /** Hook execution summary. */
    "event.hooks_summary": Record<string, unknown>;
    /** Initial session state snapshot. */
    "event.init_state": Record<string, unknown>;
    /** Available loops list updated. */
    "event.loops_available": Record<string, unknown>;
    /** A master TODO was filed. */
    "event.master_todo_filed": Record<string, unknown>;
    /** Memory subsystem notice. */
    "event.memory_notice": Record<string, unknown>;
    /** Orchestrator delegation finished. */
    "event.orchestrator_delegate_done": {
        delegate_id: string;
        agent_type: string;
        role: string;
        verdict?: string;
        is_error?: boolean;
        duration_ms?: number;
    };
    /** Orchestrator delegated a task to a subagent. */
    "event.orchestrator_delegate_start": {
        delegate_id: string;
        agent_type: string;
        role: string;
        prompt_preview?: string;
        background?: boolean;
        task_id?: string;
    };
    /** Orchestrator run complete. */
    "event.orchestrator_done": {
        run_id: string;
        files: number;
        bash_n: number;
        errors: number;
        duration_ms: number;
        success: boolean;
    };
    /** Orchestrator narration. */
    "event.orchestrator_narration": Record<string, unknown>;
    /** Orchestrator run started. */
    "event.orchestrator_start": Record<string, unknown>;
    /** Orchestrator step progress. */
    "event.orchestrator_step": Record<string, unknown>;
    /** On an outcome_claims session, the report the turn closes with, sent just before event.agent_done: the model's claims and, for each tool call it cited, whether it is this turn's own call and what it returned. The claims are the model's words; nothing here says they are true. */
    "event.outcome_claims": {
        turn_id?: string;
        tool_id?: string;
        claims?: ({
            text: string;
            evidence: ({
                tool_call_id: string;
                status: "linked" | "foreign" | "ambiguous" | "unknown";
                receipt?: {
                    tool_name: string;
                    is_error: boolean;
                    exit_code?: number;
                    truncated?: boolean;
                    after_last_write: boolean;
                };
            })[];
            evidence_status: "linked" | "none";
        })[];
        replaced?: boolean;
    };
    /** The agent was paused or resumed (PUT /api/v1/agent/pause, or the TUI's pause): sent to every attached session, since the pause covers every session of the agent. */
    "event.pause_state": {
        paused: boolean;
        since_ms?: number;
        gen: number;
    };
    /** A session permission rule auto-applied (first time). */
    "event.permission_auto": Record<string, unknown>;
    /** Session permission rules snapshot. */
    "event.permission_rules": Record<string, unknown>;
    /** Plan-mode planning complete. */
    "event.plan_complete": Record<string, unknown>;
    /** Question-assist suggestion. */
    "event.question_suggestion": {
        gen: number;
        mode: string;
        model: string;
        items?: {
            id: string;
            answer: string;
            text?: string;
            rationale?: string;
            confident: boolean;
        }[];
        error?: string;
        cost_usd?: number;
    };
    /** The agent is shutting down. */
    "event.quit": Record<string, unknown>;
    /** A delegated agent's subscription usage limits (session/weekly windows) changed. */
    "event.rate_limit": Record<string, unknown>;
    /** Active realm changed (global broadcast). */
    "event.realm_changed": Record<string, unknown>;
    /** Resolved default working dir of the bound computer (filetree/chip scope hint). */
    "event.remote_cwd": Record<string, unknown>;
    /** Full viewport snapshot after session_started. */
    "event.replay": Record<string, unknown>;
    /** Mid-turn join with an overflowed turn journal: the active turn's earlier output is elided (connection-local frame). */
    "event.replay_gap": Record<string, unknown>;
    /** A model call is retried: attempt of max_retries, after wait_secs, with the cause in reason. With attempt 0 and max_retries 0 it is a one-off notice instead, its whole text in reason, to show as a status line and not as a retry: a Claude Code session reconnecting, a previous Claude Code conversation that could not be resumed (a new one was started), a fork or trim whose Claude Code conversation starts fresh with the history passed in as text, or the model an auto-reply round uses on a Claude Code session. */
    "event.retry": Record<string, unknown>;
    /** The session was archived for every attached client. */
    "event.session_closed": Record<string, unknown>;
    /** The set of listable sessions (or a session's attach state) changed. Clients re-list. */
    "event.sessions_changed": {};
    /** Session title set or cleared by a person, or generated by the agent (name_auto true). */
    "event.session_renamed": {
        id?: string;
        name?: string;
        name_auto?: boolean;
    };
    /** Session attached. Its data is the same `started` object POST /api/v1/agent/sessions returns. It is the first frame (seq 1) of a fresh attach while the stream still retains seq 1. A resume with `since` does not repeat it, except when the cursor cannot be resumed: an invalid `since` (or Last-Event-ID), an `incarnation` that does not match the session's current one, or a cursor ahead of the stream is each answered with a `lagged` frame (code replay_gap) and the whole retained stream, which includes it if seq 1 is still retained. A late attach after the oldest frames were evicted starts with a `lagged` frame (code replay_gap) instead and does not carry it. In either case read the same object as `started` from GET /api/v1/agent/sessions/{id}, which carries it while the session is attached. */
    "event.session_started": Record<string, unknown>;
    /** Available skills list updated. */
    "event.skills_available": Record<string, unknown>;
    /** Skill enable/trust state changed. */
    "event.skills_changed": Record<string, unknown>;
    /** Assistant text stream chunk. */
    "event.stream_chunk": {
        text: string;
        helper_id?: string;
        parent_tool_call_id?: string;
    };
    /** Assistant text stream complete. */
    "event.stream_done": {
        input_tokens: number;
        output_tokens: number;
        cache_creation_tokens: number;
        cache_read_tokens: number;
        elapsed_ms: number;
        context_window?: number;
        context_estimated?: boolean;
        context_input_tokens?: number;
        cost_usd?: number;
        total_cost_usd?: number;
        background?: boolean;
        usage_only?: boolean;
        run_id?: string;
        helper_id?: string;
        parent_tool_call_id?: string;
    };
    /** Profile sync status. */
    "event.sync_status": Record<string, unknown>;
    /** Background task activity. */
    "event.task_activity": {
        task?: Record<string, unknown>;
        helper_id?: string;
        parent_tool_call_id?: string;
    };
    /** Background task finished. */
    "event.task_done": {
        task?: Record<string, unknown>;
        helper_id?: string;
        parent_tool_call_id?: string;
    };
    /** Background task started. */
    "event.task_started": {
        task?: Record<string, unknown>;
        helper_id?: string;
        parent_tool_call_id?: string;
    };
    /** Background task transcript entry (upsert-poll). */
    "event.task_transcript": Record<string, unknown>;
    /** Snapshot of background tasks. */
    "event.tasks_snapshot": {
        tasks?: Record<string, unknown>[];
        rev?: number;
    };
    /** Reasoning/thinking stream chunk. */
    "event.thinking_chunk": {
        text: string;
        helper_id?: string;
        parent_tool_call_id?: string;
    };
    /** Thinking stall warning. */
    "event.thinking_stall": Record<string, unknown>;
    /** TODO list updated. */
    "event.todo_list_updated": Record<string, unknown>;
    /** Tool invocation. */
    "event.tool_call": {
        tool_id: string;
        name: string;
        arguments?: Record<string, unknown>;
        summary: string;
        reason?: string;
        timeout_sec?: number;
        reason_not_read_file?: string;
        reason_not_edit_file?: string;
        reason_not_glob_files?: string;
        reason_to_increase_timeout?: string;
        helper_id?: string;
        parent_tool_call_id?: string;
    };
    /** Tool mode changed/locked. */
    "event.tool_mode": {
        tool_mode: string;
        locked: boolean;
    };
    /** Tool result. */
    "event.tool_result": {
        tool_id: string;
        name: string;
        output: string;
        is_error: boolean;
        detail?: string;
        error_code?: string;
        hint?: string;
        hint_cmd?: string;
        elapsed_ms?: number;
        exit_code?: number;
        truncated?: boolean;
        original_bytes?: number;
        helper_id?: string;
        parent_tool_call_id?: string;
        rules?: {
            rule_ids: string[];
            outcome: "deny" | "unchecked";
            reason?: string;
        };
    };
    /** The result of one trim, naming the request id the trim carried: done, refused (turn_in_flight, delegated_session or session_closed; nothing changed), failed (nothing was trimmed) or outcome_unknown (the trim may have been saved; the session sends nothing until it can save its state). Never an error event: another client's trim does not fail this client's turn. */
    "event.trim_result": {
        request_id?: string;
        turn_idx: number;
        outcome: "done" | "refused" | "failed" | "outcome_unknown";
        code?: string;
        message?: string;
    };
    /** A prompt or workflow dispatch was accepted but discarded without running, because it was queued while another client's turn waited on a confirmation or question. It closes that dispatch only (its turn_id); the waiting turn keeps running and no event.agent_done is sent for the discarded one. */
    "event.turn_discarded": {
        turn_id?: string;
        outcome?: "cancelled";
        error_code?: string;
    };
    /** Echo of the user's input. */
    "event.user_echo": {
        text?: string;
        echo_tag?: string;
        loop_id?: string;
        run?: number;
        task_ids?: string[];
        auto_model?: string;
        auto_round?: number;
        attachments?: {
            name: string;
            media_type?: string;
            size?: number;
            delivered: boolean;
        }[];
        turn_id?: string;
    };
    /** Question posed to the user (parks a gate). On a helper_gates session a helper's question carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. */
    "event.user_question": {
        question: string;
        options: string[] | null;
        rich_options?: {
            title: string;
            description: string;
            has_user_input?: boolean;
        }[];
        placeholder?: string;
        category?: string;
        frame_request?: {
            kind: "view" | "bot.dispatch" | "bot.message" | "bot.stop" | "bot.delegates" | "bot.answer_gate" | "bot.peek" | "bot.wait";
            request: string;
            id: string;
            tool_use_id?: string;
        };
        questions?: {
            id: string;
            category: string;
            question: string;
            options?: string[];
        }[];
        question_id?: number;
        task_id?: string;
        helper_id?: string;
        parent_tool_call_id?: string;
    };
    /** Verbosity setting changed. */
    "event.verbosity": Record<string, unknown>;
    /** Workflow run complete. */
    "event.workflow_complete": Record<string, unknown>;
    /** Workflow run started. */
    "event.workflow_start": Record<string, unknown>;
    /** Workflow step done. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. */
    "event.workflow_step_done": {
        step_id: string;
        step_idx: number;
        total: number;
        success: boolean;
        timed_out?: boolean;
        display?: string;
        command?: string;
        bash_output?: string;
        model?: string;
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_tokens?: number;
        cache_read_tokens?: number;
        cost?: number;
        tool_stats?: {
            name: string;
            calls: number;
            summary: string;
        }[];
        duration_ms?: number;
        depth?: number;
        replayed?: boolean;
    };
    /** Workflow step output. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. */
    "event.workflow_step_output": Record<string, unknown>;
    /** Workflow step start. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. */
    "event.workflow_step_start": Record<string, unknown>;
    /** The workflow-authoring tools became available or unavailable mid-session (the session's tool mode, standard or orchestrator, was applied by its first dispatch; the chat agent was switched; or the agent's `tools:` frontmatter was edited on disk). Not sent for the initial value, which the init state carries as workflow_tools_available. */
    "event.workflow_tools": {
        available: boolean;
    };
    /** Available workflows list updated. */
    "event.workflows_available": Record<string, unknown>;
    /** YOLO auto-approve mode toggled. */
    "event.yolo_mode": Record<string, unknown>;
    /** Control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring or belongs to another incarnation. Carries {code: lagged|replay_gap[, min_seq, max_seq, incarnation, resume]}; reconcile by reconnecting with ?since= and ?incarnation=. */
    "lagged": {
        code?: "lagged" | "replay_gap";
        min_seq?: number;
        max_seq?: number;
        incarnation?: string;
        resume?: string;
    };
    /** Control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq, incarnation, turn_id?, turn_since?}; turn_id names the turn being watched and turn_since the cursor before its first frame (see the payload). */
    "replay_boundary": {
        max_seq?: number;
        incarnation?: string;
        turn_id?: string;
        turn_since?: number;
    };
    /** Control frame: the stream is terminating because the session closed. Carries {reason}. */
    "end": {
        reason?: string;
    };
}
/** The frames agent_promptStream's event stream types, by SSE event name: each frame's `data`; see ITypedStreamEvent. */
export interface AgentPromptStreamFrames {
    /** Provider account rotated mid-turn. */
    "account_rotated": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.account_rotated";
            data: Record<string, unknown>;
        };
    };
    /** Turn complete: it ends a prompt turn. Carries the turn's typed outcome / error_code and notices [{code, message?, detail?}]. Notices are advisory, never an error: hook_skipped_by_policy when a configured user hook was skipped under the always policy, agent_compacts_itself when a Claude Code session's agent decides on its own when to compact its conversation, history_unsaved when a Claude Code session answered from a conversation Hoody could not save, spend_cap_warning when the session's spend file sets action warn and the turn ran over a spend cap (detail session_cap or turn_cap; one notice per cap) (open set). A turn a spend cap stopped fails with error_code spend_cap. */
    "agent_done": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.agent_done";
            data: {
                turns?: number;
                outcome?: "completed" | "failed" | "cancelled";
                turn_id?: string;
                error_code?: string;
                notices?: {
                    code: string;
                    message?: string;
                    detail?: string;
                }[];
                workflow_note?: {
                    run_id: string;
                    note: string;
                    ack: string;
                };
            };
        };
    };
    /** The session's approval policy (mode / lock / rules) changed; carries the new revision. */
    "approval_policy_changed": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.approval_policy_changed";
            data: Record<string, unknown>;
        };
    };
    /** Hoody platform auth state changed: login, token adopt, or logout (global broadcast; mirrors GET /api/v1/agent/hoody/auth/status). */
    "auth_changed": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.auth_changed";
            data: Record<string, unknown>;
        };
    };
    /** Auto-user composed the next user turn. */
    "auto_reply": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.auto_reply";
            data: Record<string, unknown>;
        };
    };
    /** Auto-user composition progress. */
    "auto_reply_progress": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.auto_reply_progress";
            data: Record<string, unknown>;
        };
    };
    /** Background bash job list snapshot. */
    "bash_job_list": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.bash_job_list";
            data: {
                jobs: {
                    id: string;
                    command?: string;
                    running: boolean;
                    interactive: boolean;
                    exit?: string;
                }[] | null;
            };
        };
    };
    /** Background bash job output tail chunk. */
    "bash_job_output": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.bash_job_output";
            data: {
                job_id: string;
                data?: string;
                next_offset?: number;
                gap?: boolean;
                eof?: boolean;
                exit?: string;
                err?: string;
            };
        };
    };
    /** Conversation cleared. */
    "clear": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.clear";
            data: Record<string, unknown>;
        };
    };
    /** Commands sent with POST /api/v1/agent/sessions/{id}/commands reached the session: messages added to the conversation (how next_step inside the running turn, new_turn in a turn of their own, with turn_id), or a stop carried out (how stop, with what it stopped). Carries command_ids. */
    "command_committed": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.command_committed";
            data: {
                command_ids: string[];
                turn_id?: string;
                how: "next_step" | "new_turn" | "stop";
                stopped?: ({
                    kind: "session" | "task" | "workflow_run" | "bash_job" | "loop";
                    id: string;
                    outcome: "stopped" | "already_done" | "failed";
                    detail?: string;
                    cleanup?: "detached_may_survive";
                })[];
                cleanup?: "detached_may_survive";
            };
        };
    };
    /** Commands sent with POST /api/v1/agent/sessions/{id}/commands ended without reaching the session: superseded by a stop, refused (a hook blocked them, the session closed, or the session cannot take them) or failed (the session could not record them). Carries command_ids, state and reason. */
    "command_settled": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.command_settled";
            data: {
                command_ids: string[];
                state: "superseded" | "refused" | "failed";
                reason?: "stop" | "order" | "hook" | "closed" | "unsupported" | "write_failed";
                detail?: string;
                superseded_by?: string;
            };
        };
    };
    /** A waiter this session owns (POST /api/v1/agent/sessions/{id}/waiters) ended: an outcome was found, or it timed out, was cancelled, or its target closed. Carries the waiter. */
    "waiter_done": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.waiter_done";
            data: {
                waiter: {
                    waiter_id: string;
                    label?: string;
                    owner: string;
                    target: string;
                    outcomes: ({
                        name: string;
                        when?: string;
                        match?: {
                            kind: "tool_result" | "tool_call" | "gate" | "turn_end";
                            tool?: string;
                            exit_code?: number;
                            is_error?: boolean;
                            text_contains?: string;
                            outcome?: "completed" | "failed" | "cancelled";
                        };
                    })[];
                    from?: string;
                    state: "waiting" | "done";
                    outcome?: string;
                    reason?: string;
                    also_found?: string[];
                    evidence?: {
                        seq: number;
                        turn_id?: string;
                        kind: "tool_result" | "tool_call" | "gate" | "turn_end";
                        tool?: string;
                        exit_code?: number;
                        is_error?: boolean;
                        excerpt?: string;
                        by: "match" | "judge";
                        p?: number;
                    };
                    on_timeout?: "continue" | "stop" | "ask";
                    created_at: string;
                    deadline_at: string;
                    ended_at?: string;
                    elapsed_ms?: number;
                    max_checks: number;
                    checks: number;
                    items_seen: number;
                    gap?: boolean;
                    cost_usd: number;
                    cost_known: boolean;
                    model?: string;
                };
            };
        };
    };
    /** Context window compacted. */
    "compacted": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.compacted";
            data: Record<string, unknown>;
        };
    };
    /** A delegated agent discarded its conversation and started a new one: the context meter no longer describes anything (clear it). */
    "context_reset": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.context_reset";
            data: {
                reason?: string;
            };
        };
    };
    /** Context compaction started. */
    "compaction_started": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.compaction_started";
            data: Record<string, unknown>;
        };
    };
    /** Tool/plan confirmation requested (parks a gate). On a helper_gates session a helper's request carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. */
    "confirm_request": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.confirm_request";
            data: {
                tool_name: string;
                params: Record<string, unknown> | null;
                requested_dirs?: string[];
                detail?: string;
                offer_session_allow?: boolean;
                gate_id: number;
                gate_cause?: string;
                risk?: "read" | "write" | "destructive" | "high" | "credential_access" | "unknown";
                human_only: boolean;
                generation?: number;
                lease_required: boolean;
                task_id?: string;
                exec_trust?: {
                    computer_id: string;
                    computer_name?: string;
                    realm: string;
                    label: string;
                };
                rules?: {
                    rule_ids: string[];
                    outcome: "ask" | "unchecked";
                    reason?: string;
                };
                helper_id?: string;
                parent_tool_call_id?: string;
            };
        };
    };
    /** The decision requirements of the PARKED gate changed (the approver lease was acquired, taken over, renewed past expiry or released while a gate is parked): {gate_id, generation, lease_required, helper_id?}. A client that captured the gate at park time refreshes what its decision must carry. On a helper_gates session each parked helper confirm is re-announced too, with its helper_id. */
    "decision_requirements": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.decision_requirements";
            data: {
                gate_id: number;
                generation: number;
                lease_required: boolean;
                helper_id?: string;
            };
        };
    };
    /** Directory-access scope changed/locked. */
    "dir_scope": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.dir_scope";
            data: Record<string, unknown>;
        };
    };
    /** A peer client detached from this shared live session (multi-attach presence). */
    "client_left": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.client_left";
            data: Record<string, unknown>;
        };
    };
    /** A delegated turn went quiet past the stall window but is still running (not fatal, not an error). */
    "delegated_idle": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.delegated_idle";
            data: {
                agent: string;
                idle_ms: number;
                message: string;
            };
        };
    };
    /** Session error (e.g. join_not_ready). */
    "error": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.error";
            data: {
                message: string;
                code?: string;
                diag?: {
                    provider?: string;
                    model?: string;
                    base_url?: string;
                    key_source?: string;
                    key_prefix?: string;
                    http_status?: number;
                    retryable?: boolean;
                    attempts?: number;
                    req_id?: string;
                    err_code?: "timeout" | "rate_limit" | "auth" | "network" | "provider" | "canceled" | "context_overflow" | "provider_incomplete_response" | "max_tokens" | "bad_tool_args" | "unknown";
                    stop_reason?: string;
                    last_error?: string;
                };
                max_steps?: number;
                reason?: string;
                retry_after_secs?: number;
                retry_at?: string;
                spend_cap_usd?: number;
                spent_usd?: number;
                resume_run_id?: string;
            };
        };
    };
    /** A parked confirm/question gate was resolved (possibly by another attached client). */
    "gate_resolved": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.gate_resolved";
            data: {
                kind: "confirm" | "question";
                gate_id?: number;
                question_id?: number;
                outcome?: "answered" | "cancelled" | "yolo" | "timeout";
                provenance?: "decision" | "yolo" | "cancelled" | "closed" | "context_cancelled" | "timeout";
                holder?: string;
                generation?: number;
                request_id?: string;
                helper_id?: string;
                parent_tool_call_id?: string;
                task_id?: string;
                decision?: {
                    approved?: boolean;
                    persist_dirs?: boolean;
                    session_scope?: boolean;
                    trust_computer?: boolean;
                    remember?: boolean;
                    superseded?: boolean;
                };
                session_scope_applied?: boolean;
                note?: string;
            };
        };
    };
    /** Files-tab import progress. */
    "files_import_progress": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.files_import_progress";
            data: Record<string, unknown>;
        };
    };
    /** Fusion configuration changed. */
    "fusion_changed": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.fusion_changed";
            data: Record<string, unknown>;
        };
    };
    /** A Jev decision made for this session finished (success, error or invalid answer): {cost_usd (null when any attempt's spend is unknown), known_cost_usd, cost_unknown_attempts, attempts, latency_ms, model, request_id, input_tokens, output_tokens, error_code}. Produced by POST /api/v1/agent/sessions/{id}/jev/decide; the standalone /api/v1/agent/jev routes report usage only in their reply and in GET /api/v1/agent/jev/settings. */
    "jev_usage": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.jev_usage";
            data: Record<string, unknown>;
        };
    };
    /** Token usage of a turn that already ended, counted after its completion events went out (a Claude Code agent reported it after the turn closed). Add it to the session's lifetime totals only: it is not a response, and it belongs to no turn in progress, so it changes no turn's usage, timing or context use. turn_id names the ended turn. */
    "late_usage": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.late_usage";
            data: {
                turn_id: string;
                input_tokens: number;
                output_tokens: number;
                cache_creation_tokens: number;
                cache_read_tokens: number;
            };
        };
    };
    /** Fusion member trajectory progress. Not sent while the fusion runs inside a silent workflow step. */
    "fusion_progress": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.fusion_progress";
            data: Record<string, unknown>;
        };
    };
    /** Hoody concept mode toggled. */
    "hoody_mode": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.hoody_mode";
            data: Record<string, unknown>;
        };
    };
    /** A hook executed. */
    "hook_run": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.hook_run";
            data: Record<string, unknown>;
        };
    };
    /** Hook execution summary. */
    "hooks_summary": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.hooks_summary";
            data: Record<string, unknown>;
        };
    };
    /** Initial session state snapshot. */
    "init_state": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.init_state";
            data: Record<string, unknown>;
        };
    };
    /** Available loops list updated. */
    "loops_available": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.loops_available";
            data: Record<string, unknown>;
        };
    };
    /** A master TODO was filed. */
    "master_todo_filed": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.master_todo_filed";
            data: Record<string, unknown>;
        };
    };
    /** Memory subsystem notice. */
    "memory_notice": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.memory_notice";
            data: Record<string, unknown>;
        };
    };
    /** Orchestrator delegation finished. */
    "orchestrator_delegate_done": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.orchestrator_delegate_done";
            data: {
                delegate_id: string;
                agent_type: string;
                role: string;
                verdict?: string;
                is_error?: boolean;
                duration_ms?: number;
            };
        };
    };
    /** Orchestrator delegated a task to a subagent. */
    "orchestrator_delegate_start": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.orchestrator_delegate_start";
            data: {
                delegate_id: string;
                agent_type: string;
                role: string;
                prompt_preview?: string;
                background?: boolean;
                task_id?: string;
            };
        };
    };
    /** Orchestrator run complete. */
    "orchestrator_done": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.orchestrator_done";
            data: {
                run_id: string;
                files: number;
                bash_n: number;
                errors: number;
                duration_ms: number;
                success: boolean;
            };
        };
    };
    /** Orchestrator narration. */
    "orchestrator_narration": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.orchestrator_narration";
            data: Record<string, unknown>;
        };
    };
    /** Orchestrator run started. */
    "orchestrator_start": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.orchestrator_start";
            data: Record<string, unknown>;
        };
    };
    /** Orchestrator step progress. */
    "orchestrator_step": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.orchestrator_step";
            data: Record<string, unknown>;
        };
    };
    /** On an outcome_claims session, the report the turn closes with, sent just before event.agent_done: the model's claims and, for each tool call it cited, whether it is this turn's own call and what it returned. The claims are the model's words; nothing here says they are true. */
    "outcome_claims": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.outcome_claims";
            data: {
                turn_id?: string;
                tool_id?: string;
                claims?: ({
                    text: string;
                    evidence: ({
                        tool_call_id: string;
                        status: "linked" | "foreign" | "ambiguous" | "unknown";
                        receipt?: {
                            tool_name: string;
                            is_error: boolean;
                            exit_code?: number;
                            truncated?: boolean;
                            after_last_write: boolean;
                        };
                    })[];
                    evidence_status: "linked" | "none";
                })[];
                replaced?: boolean;
            };
        };
    };
    /** The agent was paused or resumed (PUT /api/v1/agent/pause, or the TUI's pause): sent to every attached session, since the pause covers every session of the agent. */
    "pause_state": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.pause_state";
            data: {
                paused: boolean;
                since_ms?: number;
                gen: number;
            };
        };
    };
    /** A session permission rule auto-applied (first time). */
    "permission_auto": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.permission_auto";
            data: Record<string, unknown>;
        };
    };
    /** Session permission rules snapshot. */
    "permission_rules": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.permission_rules";
            data: Record<string, unknown>;
        };
    };
    /** Plan-mode planning complete. */
    "plan_complete": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.plan_complete";
            data: Record<string, unknown>;
        };
    };
    /** Question-assist suggestion. */
    "question_suggestion": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.question_suggestion";
            data: {
                gen: number;
                mode: string;
                model: string;
                items?: {
                    id: string;
                    answer: string;
                    text?: string;
                    rationale?: string;
                    confident: boolean;
                }[];
                error?: string;
                cost_usd?: number;
            };
        };
    };
    /** The agent is shutting down. */
    "quit": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.quit";
            data: Record<string, unknown>;
        };
    };
    /** A delegated agent's subscription usage limits (session/weekly windows) changed. */
    "rate_limit": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.rate_limit";
            data: Record<string, unknown>;
        };
    };
    /** Active realm changed (global broadcast). */
    "realm_changed": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.realm_changed";
            data: Record<string, unknown>;
        };
    };
    /** Resolved default working dir of the bound computer (filetree/chip scope hint). */
    "remote_cwd": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.remote_cwd";
            data: Record<string, unknown>;
        };
    };
    /** Full viewport snapshot after session_started. */
    "replay": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.replay";
            data: Record<string, unknown>;
        };
    };
    /** Mid-turn join with an overflowed turn journal: the active turn's earlier output is elided (connection-local frame). */
    "replay_gap": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.replay_gap";
            data: Record<string, unknown>;
        };
    };
    /** A model call is retried: attempt of max_retries, after wait_secs, with the cause in reason. With attempt 0 and max_retries 0 it is a one-off notice instead, its whole text in reason, to show as a status line and not as a retry: a Claude Code session reconnecting, a previous Claude Code conversation that could not be resumed (a new one was started), a fork or trim whose Claude Code conversation starts fresh with the history passed in as text, or the model an auto-reply round uses on a Claude Code session. */
    "retry": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.retry";
            data: Record<string, unknown>;
        };
    };
    /** The session was archived for every attached client. */
    "session_closed": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.session_closed";
            data: Record<string, unknown>;
        };
    };
    /** The set of listable sessions (or a session's attach state) changed. Clients re-list. */
    "sessions_changed": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.sessions_changed";
            data: {};
        };
    };
    /** Session title set or cleared by a person, or generated by the agent (name_auto true). */
    "session_renamed": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.session_renamed";
            data: {
                id?: string;
                name?: string;
                name_auto?: boolean;
            };
        };
    };
    /** Session attached. Its data is the same `started` object POST /api/v1/agent/sessions returns. It is the first frame (seq 1) of a fresh attach while the stream still retains seq 1. A resume with `since` does not repeat it, except when the cursor cannot be resumed: an invalid `since` (or Last-Event-ID), an `incarnation` that does not match the session's current one, or a cursor ahead of the stream is each answered with a `lagged` frame (code replay_gap) and the whole retained stream, which includes it if seq 1 is still retained. A late attach after the oldest frames were evicted starts with a `lagged` frame (code replay_gap) instead and does not carry it. In either case read the same object as `started` from GET /api/v1/agent/sessions/{id}, which carries it while the session is attached. */
    "session_started": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.session_started";
            data: Record<string, unknown>;
        };
    };
    /** Available skills list updated. */
    "skills_available": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.skills_available";
            data: Record<string, unknown>;
        };
    };
    /** Skill enable/trust state changed. */
    "skills_changed": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.skills_changed";
            data: Record<string, unknown>;
        };
    };
    /** Assistant text stream chunk. */
    "stream_chunk": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.stream_chunk";
            data: {
                text: string;
                helper_id?: string;
                parent_tool_call_id?: string;
            };
        };
    };
    /** Assistant text stream complete. */
    "stream_done": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.stream_done";
            data: {
                input_tokens: number;
                output_tokens: number;
                cache_creation_tokens: number;
                cache_read_tokens: number;
                elapsed_ms: number;
                context_window?: number;
                context_estimated?: boolean;
                context_input_tokens?: number;
                cost_usd?: number;
                total_cost_usd?: number;
                background?: boolean;
                usage_only?: boolean;
                run_id?: string;
                helper_id?: string;
                parent_tool_call_id?: string;
            };
        };
    };
    /** Profile sync status. */
    "sync_status": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.sync_status";
            data: Record<string, unknown>;
        };
    };
    /** Background task activity. */
    "task_activity": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.task_activity";
            data: {
                task?: Record<string, unknown>;
                helper_id?: string;
                parent_tool_call_id?: string;
            };
        };
    };
    /** Background task finished. */
    "task_done": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.task_done";
            data: {
                task?: Record<string, unknown>;
                helper_id?: string;
                parent_tool_call_id?: string;
            };
        };
    };
    /** Background task started. */
    "task_started": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.task_started";
            data: {
                task?: Record<string, unknown>;
                helper_id?: string;
                parent_tool_call_id?: string;
            };
        };
    };
    /** Background task transcript entry (upsert-poll). */
    "task_transcript": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.task_transcript";
            data: Record<string, unknown>;
        };
    };
    /** Snapshot of background tasks. */
    "tasks_snapshot": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.tasks_snapshot";
            data: {
                tasks?: Record<string, unknown>[];
                rev?: number;
            };
        };
    };
    /** Reasoning/thinking stream chunk. */
    "thinking_chunk": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.thinking_chunk";
            data: {
                text: string;
                helper_id?: string;
                parent_tool_call_id?: string;
            };
        };
    };
    /** Thinking stall warning. */
    "thinking_stall": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.thinking_stall";
            data: Record<string, unknown>;
        };
    };
    /** TODO list updated. */
    "todo_list_updated": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.todo_list_updated";
            data: Record<string, unknown>;
        };
    };
    /** Tool invocation. */
    "tool_call": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.tool_call";
            data: {
                tool_id: string;
                name: string;
                arguments?: Record<string, unknown>;
                summary: string;
                reason?: string;
                timeout_sec?: number;
                reason_not_read_file?: string;
                reason_not_edit_file?: string;
                reason_not_glob_files?: string;
                reason_to_increase_timeout?: string;
                helper_id?: string;
                parent_tool_call_id?: string;
            };
        };
    };
    /** Tool mode changed/locked. */
    "tool_mode": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.tool_mode";
            data: {
                tool_mode: string;
                locked: boolean;
            };
        };
    };
    /** Tool result. */
    "tool_result": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.tool_result";
            data: {
                tool_id: string;
                name: string;
                output: string;
                is_error: boolean;
                detail?: string;
                error_code?: string;
                hint?: string;
                hint_cmd?: string;
                elapsed_ms?: number;
                exit_code?: number;
                truncated?: boolean;
                original_bytes?: number;
                helper_id?: string;
                parent_tool_call_id?: string;
                rules?: {
                    rule_ids: string[];
                    outcome: "deny" | "unchecked";
                    reason?: string;
                };
            };
        };
    };
    /** The result of one trim, naming the request id the trim carried: done, refused (turn_in_flight, delegated_session or session_closed; nothing changed), failed (nothing was trimmed) or outcome_unknown (the trim may have been saved; the session sends nothing until it can save its state). Never an error event: another client's trim does not fail this client's turn. */
    "trim_result": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.trim_result";
            data: {
                request_id?: string;
                turn_idx: number;
                outcome: "done" | "refused" | "failed" | "outcome_unknown";
                code?: string;
                message?: string;
            };
        };
    };
    /** A prompt or workflow dispatch was accepted but discarded without running, because it was queued while another client's turn waited on a confirmation or question. It closes that dispatch only (its turn_id); the waiting turn keeps running and no event.agent_done is sent for the discarded one. */
    "turn_discarded": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.turn_discarded";
            data: {
                turn_id?: string;
                outcome?: "cancelled";
                error_code?: string;
            };
        };
    };
    /** Echo of the user's input. */
    "user_echo": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.user_echo";
            data: {
                text?: string;
                echo_tag?: string;
                loop_id?: string;
                run?: number;
                task_ids?: string[];
                auto_model?: string;
                auto_round?: number;
                attachments?: {
                    name: string;
                    media_type?: string;
                    size?: number;
                    delivered: boolean;
                }[];
                turn_id?: string;
            };
        };
    };
    /** Question posed to the user (parks a gate). On a helper_gates session a helper's question carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. */
    "user_question": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.user_question";
            data: {
                question: string;
                options: string[] | null;
                rich_options?: {
                    title: string;
                    description: string;
                    has_user_input?: boolean;
                }[];
                placeholder?: string;
                category?: string;
                frame_request?: {
                    kind: "view" | "bot.dispatch" | "bot.message" | "bot.stop" | "bot.delegates" | "bot.answer_gate" | "bot.peek" | "bot.wait";
                    request: string;
                    id: string;
                    tool_use_id?: string;
                };
                questions?: {
                    id: string;
                    category: string;
                    question: string;
                    options?: string[];
                }[];
                question_id?: number;
                task_id?: string;
                helper_id?: string;
                parent_tool_call_id?: string;
            };
        };
    };
    /** Verbosity setting changed. */
    "verbosity": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.verbosity";
            data: Record<string, unknown>;
        };
    };
    /** Workflow run complete. */
    "workflow_complete": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.workflow_complete";
            data: Record<string, unknown>;
        };
    };
    /** Workflow run started. */
    "workflow_start": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.workflow_start";
            data: Record<string, unknown>;
        };
    };
    /** Workflow step done. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. */
    "workflow_step_done": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.workflow_step_done";
            data: {
                step_id: string;
                step_idx: number;
                total: number;
                success: boolean;
                timed_out?: boolean;
                display?: string;
                command?: string;
                bash_output?: string;
                model?: string;
                input_tokens?: number;
                output_tokens?: number;
                cache_creation_tokens?: number;
                cache_read_tokens?: number;
                cost?: number;
                tool_stats?: {
                    name: string;
                    calls: number;
                    summary: string;
                }[];
                duration_ms?: number;
                depth?: number;
                replayed?: boolean;
            };
        };
    };
    /** Workflow step output. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. */
    "workflow_step_output": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.workflow_step_output";
            data: Record<string, unknown>;
        };
    };
    /** Workflow step start. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. */
    "workflow_step_start": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.workflow_step_start";
            data: Record<string, unknown>;
        };
    };
    /** The workflow-authoring tools became available or unavailable mid-session (the session's tool mode, standard or orchestrator, was applied by its first dispatch; the chat agent was switched; or the agent's `tools:` frontmatter was edited on disk). Not sent for the initial value, which the init state carries as workflow_tools_available. */
    "workflow_tools": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.workflow_tools";
            data: {
                available: boolean;
            };
        };
    };
    /** Available workflows list updated. */
    "workflows_available": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.workflows_available";
            data: Record<string, unknown>;
        };
    };
    /** YOLO auto-approve mode toggled. */
    "yolo_mode": {
        seq: number;
        incarnation: string;
        turn_id?: string;
        gate?: {
            id: string;
            generation: number;
            type: string;
            [key: string]: unknown;
        };
        event: {
            type: "event.yolo_mode";
            data: Record<string, unknown>;
        };
    };
    /** Control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring or belongs to another incarnation. Carries {code: lagged|replay_gap[, min_seq, max_seq, incarnation, resume]}; reconcile by reconnecting with ?since= and ?incarnation=. */
    "lagged": {
        code?: "lagged" | "replay_gap";
        min_seq?: number;
        max_seq?: number;
        incarnation?: string;
        resume?: string;
    };
    /** Control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq, incarnation, turn_id?, turn_since?}; turn_id names the turn being watched and turn_since the cursor before its first frame (see the payload). */
    "replay_boundary": {
        max_seq?: number;
        incarnation?: string;
        turn_id?: string;
        turn_since?: number;
    };
    /** Control frame: the stream is terminating because the session closed. Carries {reason}. */
    "end": {
        reason?: string;
    };
}
export interface AgentPromptStreamRequest {
    /** Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs. */
    text: string;
    /** Optional tool mode: standard or orchestrator. It is not a per-turn override: the session's first turn applies it and fixes it for the session's lifetime (tool_mode_locked). On a later turn, one queued before the first turn ran included, the same value is accepted and a different one is refused 400 invalid_tool_mode; any other value is refused 400 invalid_tool_mode too. */
    tool_mode?: "standard" | "orchestrator";
    /** Optional directory-access scope: home or full. It is not a per-turn override: the session's first turn applies it and fixes it for the session's lifetime (dir_scope_locked). On a later turn, one queued before the first turn ran included, the same value is accepted and a different one is refused 400 invalid_dir_scope; any other value is refused 400 invalid_dir_scope too. */
    dir_scope?: "home" | "full";
    /** Optional images for this turn, as INLINE base64 bytes. At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted: nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, so an attachment with a non-empty path refuses the whole request with 400 bad_request before a turn is accepted. If the active model cannot accept images the daemon reports that on the session stream. */
    attachments?: {
        type: "image";
        media_type: string;
        data: string;
        name?: string;
    }[];
}
/** The error codes agent_runTool documents (x-error-codes); see isApiErrorCode. */
export type AgentRunToolErrorCode = "bad_request" | "tool_mutation_refused" | "realm_scope_unsupported" | "invalid_tool_mode" | "invalid_dir_scope" | "invalid_realm" | "realm_not_allowed" | "forbidden" | "tool_not_found" | "not_found" | "tool_needs_confirmation" | "approver_lease_required" | "approver_lease_invalid" | "approver_lease_expired" | "payload_too_large" | "rate_limited" | "internal_error" | "restriction_unknown" | "daemon_paused";
export interface AgentRunToolRequest {
    /** The tool's input parameters (its JSON-Schema body). */
    params?: Record<string, unknown>;
    /** Re-issue a previously-parked confirmation. MUST be paired with the confirm_token of the parked run; a confirm:true with no valid token does NOT bypass the gate: the run is sent unconfirmed, so it parks again, except that a sessionless run of a non-read-only tool without allow_mutations is refused 400 tool_mutation_refused. A wire confirmed key in params is always scrubbed. */
    confirm?: boolean;
    /** The single-use token of the parked run: in the 409 tool_needs_confirmation details of POST /api/v1/agent/tools/{name}/run and POST /api/v1/agent/sessions/{id}/tools/{name}/run, in the polled job result of POST /api/v1/agent/tools/{name}/runAsync (whose own answer is a 202), and in the needs_confirmation frame of POST /api/v1/agent/tools/{name}/stream (whose own answer is a 200 stream). Bound to the tool/session/params it was minted for; present it with confirm:true and the params originally sent to approve the parked run (the echoed params may be redacted, and a redacted copy parks the run again). */
    confirm_token?: string;
    /** Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused). Set it on the first call; a confirm:true without a valid confirm_token does not stand in for it. */
    allow_mutations?: boolean;
}
/**
 * The tool result, in the gated tool-run envelope the gateway composes, not a daemon reply.
 */
export interface AgentRunToolResponse {
    statusCode: number;
    message: string;
    data: {
        status?: string;
        output?: string;
        is_error?: boolean;
        error_code?: string;
        hint?: string;
        hint_cmd?: string;
        code?: string;
        current_revision?: string;
    };
}
/** The error codes agent_setACPEnabled documents (x-error-codes); see isApiErrorCode. */
export type AgentSetACPEnabledErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "admin_unauthorized" | "forbidden" | "not_found" | "unknown_agent" | "payload_too_large" | "rate_limited" | "internal_error" | "store_failed" | "service_unavailable" | "restriction_unknown";
export interface AgentSetACPEnabledRequest {
    /** True arms the backend; false disarms it. Defaults to true when omitted. */
    enabled?: boolean;
}
/**
 * Confirmation of the stored enablement.
 */
export interface AgentSetACPEnabledResponse {
    statusCode: number;
    message: string;
    data: {
        agent?: string;
        enabled?: boolean;
    };
}
/** The error codes agent_setMCPServerEnabled documents (x-error-codes); see isApiErrorCode. */
export type AgentSetMCPServerEnabledErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "mcp_conflict" | "settings_key_ambiguous" | "payload_too_large" | "rate_limited" | "internal_error" | "service_unavailable" | "restriction_unknown";
export interface AgentSetMCPServerEnabledRequest {
    /** Live session id. Required, either here or as the `session_id` query parameter; a non-empty value here wins over the query. */
    session_id: string;
    /** Single-use nonce from POST /api/v1/agent/mcp/write-intents minted for op:set_enabled and this scope. */
    nonce: string;
    /** Settings layer to write. Must match the scope the nonce was minted for. */
    scope?: "user" | "project" | "local";
    /** The server name. */
    name: string;
    /** true to enable, false to disable. */
    enabled: boolean;
    /** The mcp_servers hash you last read. */
    expect_hash: string;
}
/**
 * The operation's JSON reply, passed through verbatim.
 */
export interface AgentSetMCPServerEnabledResponse {
    statusCode: number;
    message: string;
    data: {
        status?: string;
        sessions?: number;
        partial_sessions?: number;
        revoked?: number;
        deferred_sessions?: number;
        deferred_started?: boolean;
        servers?: ({
            name?: string;
            scope?: string;
            transport?: "stdio" | "http" | "sse";
            enabled?: boolean;
            require_confirmation?: boolean;
            command?: string;
            args?: string[];
            url?: string;
            env_keys?: string[];
            header_keys?: string[];
            allowed_tools?: string[];
            connected?: boolean;
            protocol_version?: string;
            server_name?: string;
            server_version?: string;
            tool_count?: number;
            pid?: number;
            revoked?: boolean;
            revoked_reason?: string;
            stderr_tail?: string;
        })[];
        warnings?: string[];
        path?: string;
        hash?: string;
    };
}
/** The error codes agent_setMemoryEnabled documents (x-error-codes); see isApiErrorCode. */
export type AgentSetMemoryEnabledErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "settings_key_ambiguous" | "memory_setting_overridden" | "payload_too_large" | "rate_limited" | "internal_error" | "store_failed" | "service_unavailable" | "restriction_unknown";
export interface AgentSetMemoryEnabledRequest {
    /** Whether memory capture is enabled. */
    enabled: boolean;
}
/**
 * The operation's JSON reply, passed through verbatim.
 */
export interface AgentSetMemoryEnabledResponse {
    statusCode: number;
    message: string;
    data: Record<string, unknown>;
}
/** The error codes agent_setPauseState documents (x-error-codes); see isApiErrorCode. */
export type AgentSetPauseStateErrorCode = "bad_request" | "realm_scope_unsupported" | "forbidden" | "payload_too_large" | "rate_limited" | "internal_error";
export interface AgentSetPauseStateRequest {
    /** true to pause, false to resume. */
    paused: boolean;
}
/**
 * The pause state after the request, at the gen the request left it at. Composed by the gateway.
 */
export interface AgentSetPauseStateResponse {
    statusCode: number;
    message: string;
    data: {
        paused: boolean;
        since_ms: number;
        gen: number;
    };
}
/** The error codes agent_setSessionAutoReplyWrites documents (x-error-codes); see isApiErrorCode. */
export type AgentSetSessionAutoReplyWritesErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "payload_too_large" | "rate_limited" | "internal_error" | "service_unavailable";
export interface AgentSetSessionAutoReplyWritesRequest {
    /** New write-class opt-in state. */
    allow_writes?: boolean;
}
/**
 * Gateway acknowledgement that the setting was forwarded to the live session. Composed by the gateway, not a daemon reply. It applies while a gate is parked too.
 */
export interface AgentSetSessionAutoReplyWritesResponse {
    statusCode: number;
    message: string;
    data: {
        status?: string;
    };
}
/** The error codes agent_setSessionHoodyEnv documents (x-error-codes); see isApiErrorCode. */
export type AgentSetSessionHoodyEnvErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "payload_too_large" | "rate_limited" | "internal_error" | "service_unavailable";
export interface AgentSetSessionHoodyEnvRequest {
    /** Whether to inject the HOODY_* shell-env contract. */
    enabled?: boolean;
}
/**
 * Gateway acknowledgement that the setting was forwarded to the live session. Composed by the gateway, not a daemon reply. It applies while a gate is parked too.
 */
export interface AgentSetSessionHoodyEnvResponse {
    statusCode: number;
    message: string;
    data: {
        status?: string;
    };
}
/** The error codes agent_setSessionYolo documents (x-error-codes); see isApiErrorCode. */
export type AgentSetSessionYoloErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "approval_policy_locked" | "approval_policy_active" | "payload_too_large" | "rate_limited" | "internal_error" | "service_unavailable";
export interface AgentSetSessionYoloRequest {
    /** true to arm auto-approve, false to disarm. */
    enabled: boolean;
}
/**
 * The applied YOLO state (or forwarded:true when the daemon's echo did not arrive within the wait).
 */
export interface AgentSetSessionYoloResponse {
    statusCode: number;
    message: string;
    data: {
        status?: string;
        yolo?: boolean;
        forwarded?: boolean;
    };
}
/** The error codes agent_streamCompletion documents (x-error-codes); see isApiErrorCode. */
export type AgentStreamCompletionErrorCode = "bad_request" | "unsupported_setting" | "realm_scope_unsupported" | "forbidden" | "payload_too_large" | "model_unavailable" | "rate_limited" | "internal_error" | "service_unavailable" | "timeout";
/**
 * The event payloads of agent_streamCompletion's stream, keyed by message title
 * (the message name when it has none), from the operation's x-async-api messages.
 */
export interface AgentStreamCompletionEvents {
    /** The model call started; carries {model}. */
    "start": Record<string, unknown>;
    /** A piece of reply text; carries {text}. */
    "delta": Record<string, unknown>;
    /** A piece of reasoning text; carries {text}. Sent only by adapters that stream reasoning (Anthropic Messages, OpenAI Responses, Bedrock). */
    "thinking": Record<string, unknown>;
    /** The finished completion: the 200 body of POST /api/v1/agent/completions. */
    "result": Record<string, unknown>;
    /** The call failed after start; carries {code, message, details?} with code upstream_error, timeout or internal_error. */
    "error": Record<string, unknown>;
    /** Stream complete (always last). */
    "end": Record<string, unknown>;
}
/** The frames agent_streamCompletion's event stream types, by SSE event name: each frame's `data`; see ITypedStreamEvent. */
export interface AgentStreamCompletionFrames {
    /** The model call started; carries {model}. */
    "start": Record<string, unknown>;
    /** A piece of reply text; carries {text}. */
    "delta": Record<string, unknown>;
    /** A piece of reasoning text; carries {text}. Sent only by adapters that stream reasoning (Anthropic Messages, OpenAI Responses, Bedrock). */
    "thinking": Record<string, unknown>;
    /** The finished completion: the 200 body of POST /api/v1/agent/completions. */
    "result": Record<string, unknown>;
    /** The call failed after start; carries {code, message, details?} with code upstream_error, timeout or internal_error. */
    "error": Record<string, unknown>;
    /** Stream complete (always last). */
    "end": Record<string, unknown>;
}
export interface AgentStreamCompletionRequest {
    /** A provider/model spec, e.g. hoody-ai/hoody-free. The same policy as a session's model: the provider prefix must be catalogued, the model name after it need not be (an uncatalogued name is sent to the provider, which may reject it as upstream_error). An unknown provider or an empty model name is 422 model_unavailable (reason unknown_model); a fusion/ composite is 422 model_unavailable (reason fusion). */
    model: string;
    /** Optional system prompt. */
    system?: string;
    /** 1 to 1000 turns, oldest first; the last must be a user turn. */
    messages: ({
        role: "user" | "assistant";
        content: string;
    })[];
    /** Optional per-call model settings. A setting the model cannot honour is 400 unsupported_setting, never dropped. */
    settings?: {
        thinking?: {
            type: "enabled" | "disabled";
            effort?: "low" | "medium" | "high" | "xhigh" | "max";
        };
        temperature?: number;
        max_tokens?: number;
        response_format?: {
            type: "json_object" | "json_schema";
            schema?: Record<string, unknown>;
            name?: string;
            strict?: boolean;
        };
    };
    /** Deadline for the whole call, 1 to 600000 ms (default 120000). Reaching it is 504 timeout (an error frame once streaming). */
    timeout_ms?: number;
    /** Alias of settings.max_tokens (output-token cap, 1 to 1000000), accepted at the top level as most chat-completion APIs take it. Sending both with different values is 400 bad_request (details.field max_tokens). */
    max_tokens?: number;
}
/** The error codes agent_streamTool documents (x-error-codes); see isApiErrorCode. */
export type AgentStreamToolErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_tool_mode" | "invalid_dir_scope" | "invalid_realm" | "forbidden" | "not_found" | "payload_too_large" | "rate_limited" | "internal_error" | "service_unavailable" | "restriction_unknown";
/**
 * The event payloads of agent_streamTool's stream, keyed by message title
 * (the message name when it has none), from the operation's x-async-api messages.
 */
export interface AgentStreamToolEvents {
    /** Stream opened; carries the tool name. */
    "start": Record<string, unknown>;
    /** The executed tool result {output,is_error,hint?}. */
    "result": Record<string, unknown>;
    /** The gate parked; carries the echoed tool+params for display (they may be redacted) and the confirm_token; the caller re-issues with confirm:true and the params it originally sent. */
    "needs_confirmation": Record<string, unknown>;
    /** The run failed; carries {code,message}. */
    "error": Record<string, unknown>;
    /** Stream complete (always last). */
    "end": Record<string, unknown>;
}
/** The frames agent_streamTool's event stream types, by SSE event name: each frame's `data`; see ITypedStreamEvent. */
export interface AgentStreamToolFrames {
    /** Stream opened; carries the tool name. */
    "start": Record<string, unknown>;
    /** The executed tool result {output,is_error,hint?}. */
    "result": Record<string, unknown>;
    /** The gate parked; carries the echoed tool+params for display (they may be redacted) and the confirm_token; the caller re-issues with confirm:true and the params it originally sent. */
    "needs_confirmation": Record<string, unknown>;
    /** The run failed; carries {code,message}. */
    "error": Record<string, unknown>;
    /** Stream complete (always last). */
    "end": Record<string, unknown>;
}
export interface AgentStreamToolRequest {
    /** The tool's input parameters (its JSON-Schema body). */
    params?: Record<string, unknown>;
    /** Re-issue a previously-parked confirmation. MUST be paired with the confirm_token of the parked run; a confirm:true with no valid token does NOT bypass the gate: the run is sent unconfirmed, so it parks again, except that a sessionless run of a non-read-only tool without allow_mutations is refused 400 tool_mutation_refused. A wire confirmed key in params is always scrubbed. */
    confirm?: boolean;
    /** The single-use token of the parked run: in the 409 tool_needs_confirmation details of POST /api/v1/agent/tools/{name}/run and POST /api/v1/agent/sessions/{id}/tools/{name}/run, in the polled job result of POST /api/v1/agent/tools/{name}/runAsync (whose own answer is a 202), and in the needs_confirmation frame of POST /api/v1/agent/tools/{name}/stream (whose own answer is a 200 stream). Bound to the tool/session/params it was minted for; present it with confirm:true and the params originally sent to approve the parked run (the echoed params may be redacted, and a redacted copy parks the run again). */
    confirm_token?: string;
    /** Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused). Set it on the first call; a confirm:true without a valid confirm_token does not stand in for it. */
    allow_mutations?: boolean;
}
/** The error codes agent_testHook documents (x-error-codes); see isApiErrorCode. */
export type AgentTestHookErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "approval_policy_unsatisfiable" | "payload_too_large" | "rate_limited" | "internal_error" | "service_unavailable" | "restriction_unknown";
export interface AgentTestHookRequest {
    /** Live session id (hooks are session-scoped). Required, either here or as the `session_id` query parameter; a non-empty value here wins over the query. */
    session_id: string;
    /** Id of a SHIPPED (catalogue) hook to DRY-RUN. Selects the predicate-only branch: nothing is executed and `event` is not consulted. */
    shipped_id?: string;
    /** Lifecycle event to fire. Required on every branch except the shipped dry-run; the daemon rejects any value outside the enum. */
    event?: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit";
    /** Value the saved hooks' matchers are evaluated against (e.g. the tool name for PreToolUse). Ignored when `command` supplies an inline hook. */
    match_value?: string;
    /** On the ordinary branch: an unsaved command to run INLINE now (this executes it) instead of the saved matching hooks. On the shipped branch: the sample command the trigger predicate is evaluated against (defaults to a representative failing invocation). */
    command?: string;
    /** Timeout in whole seconds for an inline `command` (positive integers only; a fractional or non-positive value is ignored rather than truncated). Hard-capped at 60s per command: a larger value, an ignored one, and a saved hook's own longer timeout are all clamped to the 60s test ceiling. A call that fires several saved hooks runs them one after another and ends after at most 120 seconds. */
    timeout?: number;
    /** Exit code of the sample command on the shipped dry-run branch (default 2). */
    exit_code?: number;
    /** Extra fields merged into the hook's stdin JSON. The daemon stamps session_id, cwd, hook_event_name and hook_test itself: values supplied here for those keys are overwritten. */
    payload?: Record<string, unknown>;
}
/**
 * The operation's JSON reply, passed through verbatim. A command test answers {status, rows, warnings}: one row per hook run, and warnings null when there are none. A shipped-hook dry run answers {status, shipped_id, enabled, would_dispatch, verdict, sample_command, sample_exit_code}, for example {"status":"ok","shipped_id":"hoody-cli-autofix","enabled":true,"would_dispatch":true,"verdict":"would dispatch a fix agent","sample_command":"hoody agnt lst","sample_exit_code":2}.
 */
export interface AgentTestHookResponse {
    statusCode: number;
    message: string;
    data: Record<string, unknown>;
}
/** The error codes agent_toggleHook documents (x-error-codes); see isApiErrorCode. */
export type AgentToggleHookErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "write_intent_invalid" | "settings_key_ambiguous" | "payload_too_large" | "rate_limited" | "internal_error" | "store_failed" | "service_unavailable" | "restriction_unknown";
export interface AgentToggleHookRequest {
    /** Live session id (hooks are session-scoped). Required, either here or as the `session_id` query parameter; a non-empty value here wins over the query. */
    session_id: string;
    /** The single-use write nonce from POST /api/v1/agent/hooks/begin-write minted for op:toggle + this scope; the RPC fails closed without it. */
    nonce: string;
    /** Scope of the settings file to write: user, project or local. It must match the nonce's scope. A shipped-hook toggle (shipped_id) does not need it: it always writes the first settings layer. */
    scope?: "user" | "project" | "local";
    /** Id of a SHIPPED (catalogue) hook to toggle. Selects the shipped branch: pair it with `enabled` and send no event/matcher/command. */
    shipped_id?: string;
    /** New state for the shipped hook named by `shipped_id` (true records it in the first settings layer; false removes the key, reverting to the catalogue default). Absent, or a value that is not a boolean, reads as false (disable). Ignored on the ordinary-hook branch: that branch uses `disabled`. */
    enabled?: boolean;
    /** Lifecycle event of the ordinary hook to toggle; required on that branch (with matcher + command). */
    event?: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit";
    /** Matcher of the ordinary hook to toggle, exactly as GET /api/v1/agent/hooks reports it (omit, or "*", for the wildcard group). */
    matcher?: string;
    /** Command text of the ordinary hook to toggle (exact match); required on that branch: a toggle must resolve to an existing entry. */
    command?: string;
    /** New state for the ordinary hook: true disables the entry, false enables it. Absent, or a value that is not a boolean, reads as false (enable). Ignored on the shipped branch: that branch uses `enabled`. */
    disabled?: boolean;
}
/**
 * The operation's JSON reply, passed through verbatim. The reply is {status, sessions, summary}. A shipped toggle answers {status, sessions, shipped_id, enabled} instead.
 */
export interface AgentToggleHookResponse {
    statusCode: number;
    message: string;
    data: Record<string, unknown>;
}
/** The error codes agent_toggleSkill documents (x-error-codes); see isApiErrorCode. */
export type AgentToggleSkillErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "payload_too_large" | "rate_limited" | "internal_error" | "store_failed" | "service_unavailable" | "restriction_unknown";
export interface AgentToggleSkillRequest {
    /** Effective skill name (NOT root/rel; toggle is name-scoped). */
    name: string;
    /** true to disable the skill, false to enable it. */
    disabled?: boolean;
}
/**
 * The operation's JSON reply, passed through verbatim.
 */
export interface AgentToggleSkillResponse {
    statusCode: number;
    message: string;
    data: Record<string, unknown>;
}
/** The error codes agent_trustSkill documents (x-error-codes); see isApiErrorCode. */
export type AgentTrustSkillErrorCode = "bad_request" | "realm_scope_unsupported" | "invalid_realm" | "forbidden" | "not_found" | "payload_too_large" | "rate_limited" | "internal_error" | "store_failed" | "service_unavailable" | "restriction_unknown";
export interface AgentTrustSkillRequest {
    /** Skill root directory (identity; alias: root). */
    root_dir: string;
    /** Skill relative directory (identity; alias: rel). */
    rel_dir: string;
    /** true to grant execution trust, false to revoke. */
    trusted: boolean;
}
/**
 * The operation's JSON reply, passed through verbatim.
 */
export interface AgentTrustSkillResponse {
    statusCode: number;
    message: string;
    data: Record<string, unknown>;
}
/** The error codes api_manageComputer documents (x-error-codes); see isApiErrorCode. */
export type ApiManageComputerErrorCode = "OPERATION_STATE_CONFLICT" | "MISSING_TOKEN" | "INVALID_TOKEN" | "TOKEN_EXPIRED" | "AUTH_TOKEN_LINEAGE_REVOKED" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "INVALID_OTP_CODE" | "INSUFFICIENT_PERMISSIONS" | "ACCOUNT_BANNED" | "ACCESS_SUSPENDED" | "COMPUTER_NOT_FOUND" | "COMPUTER_OPERATION_IN_PROGRESS" | "COMPUTER_EXPIRED" | "computer_finalizing" | "SUBSERVER_DORMANT" | "RATE_LIMIT_EXCEEDED" | "INTERNAL_SERVER_ERROR" | "COMPUTER_HOST_COMMAND_FAILED" | "COMPUTER_HOST_TIMEOUT";
/** The error codes api_setComputerKvmPatch documents (x-error-codes); see isApiErrorCode. */
export type ApiSetComputerKvmPatchErrorCode = "MISSING_TOKEN" | "INVALID_TOKEN" | "TOKEN_EXPIRED" | "AUTH_TOKEN_LINEAGE_REVOKED" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "INVALID_OTP_CODE" | "INSUFFICIENT_PERMISSIONS" | "ACCOUNT_BANNED" | "COMPUTER_NOT_FOUND" | "RESOURCE_NOT_FOUND" | "COMPUTER_OPERATION_IN_PROGRESS" | "OPERATION_STATE_CONFLICT" | "COMPUTER_EXPIRED" | "COMPUTER_CHANGED_DURING_REQUEST" | "KVM_HOST_UPGRADE_REQUIRED" | "KVM_NOT_AVAILABLE" | "KVM_HOST_STATE_UNKNOWN" | "KVM_CHANGE_IN_PROGRESS" | "KVM_CHANGE_TIMED_OUT" | "RATE_LIMIT_EXCEEDED";
/** The error codes api_setProxyAliasState documents (x-error-codes); see isApiErrorCode. */
export type ApiSetProxyAliasStateErrorCode = "MISSING_TOKEN" | "INVALID_TOKEN" | "TOKEN_EXPIRED" | "AUTH_TOKEN_LINEAGE_REVOKED" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "INVALID_OTP_CODE" | "INSUFFICIENT_PERMISSIONS" | "ACCOUNT_BANNED" | "ALIAS_NOT_FOUND" | "RATE_LIMIT_EXCEEDED" | "SERVICE_UNAVAILABLE";
/** The error codes api_setSubserverSubscriptionAutoRenewPatch documents (x-error-codes); see isApiErrorCode. */
export type ApiSetSubserverSubscriptionAutoRenewPatchErrorCode = "MISSING_TOKEN" | "INVALID_TOKEN" | "TOKEN_EXPIRED" | "AUTH_TOKEN_LINEAGE_REVOKED" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "INVALID_OTP_CODE" | "INSUFFICIENT_PERMISSIONS" | "ACCOUNT_BANNED" | "SUBSCRIPTION_NOT_FOUND" | "PLAN_NOT_AVAILABLE" | "PLAN_CHANGE_NOT_UPGRADE" | "SUBSCRIPTION_PERIOD_ENDED" | "SUBSCRIPTION_NOT_PAYABLE" | "SUBSERVER_WIPE_IN_PROGRESS" | "NO_PAID_CAPACITY" | "HOST_UNAVAILABLE" | "PAID_SUBSERVER_LIMIT_REACHED" | "SUBSERVER_DORMANT" | "IDEMPOTENCY_INTENT_MISMATCH" | "CHARGE_CONFIRMATION_REQUIRED" | "CHARGE_EXCEEDS_MAX" | "NO_PAID_CAPACITY_IN_REGION" | "SUBSCRIPTION_REGION_FIXED";
/** The error codes api_setTokenGatePatch documents (x-error-codes); see isApiErrorCode. */
export type ApiSetTokenGatePatchErrorCode = "OTP_REQUIRED" | "TWOFACTOR_NOT_ENABLED" | "MISSING_REQUIRED_FIELD" | "PASSWORD_NOT_SET" | "INVALID_OTP_CODE" | "INVALID_TOKEN" | "MISSING_TOKEN" | "TOKEN_EXPIRED" | "AUTH_TOKEN_LINEAGE_REVOKED" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "INSUFFICIENT_PERMISSIONS" | "ACCOUNT_BANNED" | "CREDENTIALS_CHANGED" | "TWOFACTOR_RATE_LIMIT" | "RATE_LIMIT_EXCEEDED";
/** The error codes api_toggleEgressRule documents (x-error-codes); see isApiErrorCode. */
export type ApiToggleEgressRuleErrorCode = "MISSING_TOKEN" | "INVALID_TOKEN" | "TOKEN_EXPIRED" | "AUTH_TOKEN_LINEAGE_REVOKED" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "INVALID_OTP_CODE" | "computer_quarantined" | "INSUFFICIENT_PERMISSIONS" | "ACCOUNT_BANNED" | "computer_finalizing" | "COMPUTER_EXPIRED" | "OPERATION_STATE_CONFLICT" | "SUBSERVER_DORMANT" | "RATE_LIMIT_EXCEEDED" | "INTERNAL_SERVER_ERROR" | "FIREWALL_HOST_UNAVAILABLE";
/** The error codes api_toggleIncomingShareMount documents (x-error-codes); see isApiErrorCode. */
export type ApiToggleIncomingShareMountErrorCode = "MISSING_TOKEN" | "INVALID_TOKEN" | "TOKEN_EXPIRED" | "AUTH_TOKEN_LINEAGE_REVOKED" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "INVALID_OTP_CODE" | "INSUFFICIENT_PERMISSIONS" | "ACCOUNT_BANNED" | "SHARE_NOT_FOUND" | "PENDING" | "SUBSERVER_DORMANT" | "PROJECT_DELETION_IN_PROGRESS" | "ACCOUNT_DELETION_IN_PROGRESS" | "SERVER_DELETION_IN_PROGRESS" | "RATE_LIMIT_EXCEEDED" | "INTERNAL_SERVER_ERROR";
/** The error codes api_toggleIngressRule documents (x-error-codes); see isApiErrorCode. */
export type ApiToggleIngressRuleErrorCode = "MISSING_TOKEN" | "INVALID_TOKEN" | "TOKEN_EXPIRED" | "AUTH_TOKEN_LINEAGE_REVOKED" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "INVALID_OTP_CODE" | "computer_quarantined" | "INSUFFICIENT_PERMISSIONS" | "ACCOUNT_BANNED" | "computer_finalizing" | "COMPUTER_EXPIRED" | "OPERATION_STATE_CONFLICT" | "SUBSERVER_DORMANT" | "RATE_LIMIT_EXCEEDED" | "INTERNAL_SERVER_ERROR" | "FIREWALL_HOST_UNAVAILABLE";
/** The error codes api_updateComputerProxyState documents (x-error-codes); see isApiErrorCode. */
export type ApiUpdateComputerProxyStateErrorCode = "MISSING_TOKEN" | "INVALID_TOKEN" | "TOKEN_EXPIRED" | "AUTH_TOKEN_LINEAGE_REVOKED" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "INVALID_OTP_CODE" | "INSUFFICIENT_PERMISSIONS" | "ACCOUNT_BANNED" | "COMPUTER_NOT_FOUND" | "PROJECT_NOT_FOUND" | "PRECONDITION_FAILED" | "PRECONDITION_REQUIRED" | "RATE_LIMIT_EXCEEDED";
/** The error codes api_updateProjectProxyState documents (x-error-codes); see isApiErrorCode. */
export type ApiUpdateProjectProxyStateErrorCode = "MISSING_TOKEN" | "INVALID_TOKEN" | "TOKEN_EXPIRED" | "AUTH_TOKEN_LINEAGE_REVOKED" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "INVALID_OTP_CODE" | "INSUFFICIENT_PERMISSIONS" | "ACCOUNT_BANNED" | "PROJECT_NOT_FOUND" | "PRECONDITION_FAILED" | "PRECONDITION_REQUIRED" | "RATE_LIMIT_EXCEEDED";
/**
 * Result of `DELETE /jobs/{id}` (cancel, or purge with `?purge=true`).
 */
export interface CancelJobResponse {
    statusCode: number;
    message: string;
    data: {
        message: string;
        purged: boolean;
        removed_files: number;
        success: boolean;
    };
}
export interface CaptureDisplayScreenshotMetadataResponse {
    statusCode: number;
    message: string;
    data: {
        timestamp: string;
        timestamp_human?: string;
        full: FileInfo;
        thumbnail?: FileInfo | null;
    };
}
export interface CaptureDisplayScreenshotResponse {
    statusCode: number;
    message: string;
    data: {
        info: ScreenshotInfo;
        image: Base64ImageData;
        cursor?: {
            x: number;
            y: number;
        };
    };
}
export interface CreateDatabaseResponse2 {
    /** The kv_table parameter (default kv_store). Present even when init_kv is false, in which case no KV table was created. */
    kv_table: string;
    /** Human-readable confirmation. */
    message: string;
    /** The path parameter as sent (the server-resolved path is not disclosed). */
    path: string;
    /** Size of the new database file in bytes. */
    size: number;
    /** Always true on a 201. */
    success: boolean;
    /** Tables created: always _query_history, plus the KV table and its _history table when init_kv is true. */
    tables: string[];
}
/**
 * Request to create a scheduled job
 */
export interface CreateScheduleRequest2 {
    /** Cron expression with six fields, `second minute hour day month weekday`,
  and an optional seventh `year` field. */
    cron: string;
    /** `false` creates the schedule disabled: it never fires until it is
  enabled, and its expression need not have a future occurrence yet.
  Defaults to `true`. */
    enabled?: boolean | null;
    request: CurlRequest;
}
/** The error codes curl_cancelJob documents (x-error-codes); see isApiErrorCode. */
export type CurlCancelJobErrorCode = "INVALID_PARAMETER" | "ORIGIN_NOT_ALLOWED" | "JOB_NOT_FOUND" | "JOB_NOT_FINISHED" | "STORAGE_ERROR" | "INTERNAL_ERROR";
/** The error codes curl_executeCurlRequest documents (x-error-codes); see isApiErrorCode. */
export type CurlExecuteCurlRequestErrorCode = "INVALID_PARAMETER" | "INVALID_URL" | "ORIGIN_NOT_ALLOWED" | "SESSION_NOT_FOUND" | "PAYLOAD_TOO_LARGE" | "STORAGE_ERROR" | "INTERNAL_ERROR" | "UPSTREAM_ERROR" | "DNS_RESOLUTION_FAILED" | "RESPONSE_TOO_LARGE" | "QUEUE_FULL" | "SSE_CAPACITY_EXHAUSTED" | "UPSTREAM_TIMEOUT";
export interface DeleteDatabaseResponse2 {
    /** Number of files removed: the database itself plus any -wal, -shm or -journal file beside it. */
    files_removed: number;
    /** Human-readable confirmation. */
    message: string;
    /** The db parameter as sent (the server-resolved path is not disclosed). */
    path: string;
    /** Always true on a 200. */
    success: boolean;
}
/** The error codes display_captureDisplayScreenshot documents (x-error-codes); see isApiErrorCode. */
export type DisplayCaptureDisplayScreenshotErrorCode = "NO_DISPLAY_CONTEXT" | "VALIDATION_ERROR" | "QUEUE_FULL" | "SCREENSHOT_FAILED" | "INTERNAL_ERROR" | "DISPLAY_NOT_AVAILABLE";
/** The error codes display_captureDisplayScreenshotMetadata documents (x-error-codes); see isApiErrorCode. */
export type DisplayCaptureDisplayScreenshotMetadataErrorCode = "NO_DISPLAY_CONTEXT" | "SCREENSHOT_FAILED" | "INTERNAL_ERROR" | "DISPLAY_NOT_AVAILABLE";
/** The error codes display_getDisplayLatestScreenshot documents (x-error-codes); see isApiErrorCode. */
export type DisplayGetDisplayLatestScreenshotErrorCode = "NO_DISPLAY_CONTEXT" | "SCREENSHOT_NOT_FOUND" | "SCREENSHOT_FAILED" | "INTERNAL_ERROR" | "DISPLAY_NOT_AVAILABLE";
/** The error codes display_getDisplayLatestScreenshotMetadata documents (x-error-codes); see isApiErrorCode. */
export type DisplayGetDisplayLatestScreenshotMetadataErrorCode = "NO_DISPLAY_CONTEXT" | "SCREENSHOT_NOT_FOUND" | "SCREENSHOT_FAILED" | "INTERNAL_ERROR" | "DISPLAY_NOT_AVAILABLE";
/**
 * Result of a finished download from a remote URL
 */
export interface DownloadFromUrlResponse {
    statusCode: number;
    message: string;
    data: {
        download_id: string;
        filename: string;
        message: string;
        path: string;
        sha256?: string | null;
        size?: number;
        success: true;
    };
}
export interface Error2 {
    /** Human-readable error message */
    message: string;
}
export interface Error3 {
    /** Always false for error responses */
    success: boolean;
    /** Human-readable error message */
    error: string;
    /** Machine-readable error code, present on some errors. `INVALID_QUERY`: a list route was given a query parameter it does not accept. */
    code?: string;
}
export interface Error4 {
    /** Human-readable error message */
    error: string;
    /** Machine-readable error code. Every error body on this API has this
  shape: `error`, `code`, and `details` with `message` and `help`. */
    code: "NO_DISPLAY_CONTEXT" | "VALIDATION_ERROR" | "INVALID_JSON" | "PAYLOAD_TOO_LARGE" | "DISPLAY_NOT_AVAILABLE" | "WINDOW_NOT_FOUND" | "QUEUE_FULL" | "COMMAND_DEADLINE_EXCEEDED" | "NO_WINDOW_MANAGER" | "WINDOW_NOT_VIEWABLE" | "SYNC_TIMEOUT" | "INPUT_ACTION_FAILED" | "WINDOW_LIST_FAILED" | "WINDOW_PROPERTIES_FAILED" | "DISPLAY_INFO_FAILED" | "SCREENSHOT_FAILED" | "SCREENSHOT_NOT_FOUND" | "SCREENSHOTS_FAILED" | "THUMBNAIL_FAILED" | "THUMBNAIL_NOT_FOUND" | "CLIPBOARD_FAILED" | "INTERNAL_ERROR";
    details?: {
        message?: string;
        help?: string;
        reason?: "dependency_missing";
        state?: "x-live";
    };
}
export interface Error5 {
    /** Human-readable error message */
    error: string;
    /** Machine-readable error code (e.g. ERROR_400, ERROR_404, ERROR_500, ERROR_503). */
    code: string;
    /** ISO 8601 timestamp emitted by the server. */
    timestamp: string;
    /** Optional additional error details (shape varies per endpoint). */
    details?: Record<string, unknown>;
}
export interface Error6 {
    /** Detailed error message (especially in development mode) */
    details?: string;
    /** Error type or category */
    error: string;
    /** Stable machine-readable error code, when the error has one (see the response's `x-error-codes`) */
    code?: string;
    success: boolean;
    /** Human-readable explanation, when the error has one */
    message?: string;
}
export interface Error7 {
    error: {
        code: "NameInvalid" | "SpecInvalid" | "NotFound" | "AlreadyExists" | "BadState" | "OperationInProgress" | "SourceBusy" | "KvmUnavailable" | "KvmCapExceeded" | "MemoryExceedsCgroup" | "InsufficientSpace" | "QemuExecFailed" | "QemuExitedBeforeReady" | "QmpHandshakeFailed" | "StartupIndeterminate" | "StorageFailed" | "RunAbnormalExit" | "JournalFailed" | "Orphaned" | "DisplayUnavailable" | "MethodNotAllowed" | "SidecarUnavailable" | "PortForwardConflict" | "AudioBackendUnavailable" | "RequestBodyStalled" | "ConsoleUnavailable" | "ConsoleDeliveryIndeterminate" | "DownloadFailed" | "TpmStateMissing" | "DisplayRangeExhausted" | "DisplayNotConfigured" | "DisplayInUse" | "MonitorCommandIndeterminate";
        message: string;
        retryable: boolean;
    };
}
export interface ErrorResponse2 {
    /** Machine-readable error code. The codes each status can carry are listed in that response's x-error-codes. */
    code: string;
    /** Human-readable description of the failure. Not a contract: match on code. */
    error: string;
}
export interface ErrorResponse3 {
    code: string;
    details?: string | null;
    message: string;
}
export interface ErrorResponse4 {
    code: string;
    details?: string | null;
    message: string;
}
export type ExecuteCurlRequestRequest = CurlRequest;
export type ExecuteCurlRequestResponse = {
    statusCode: number;
    message: string;
    data: {
        body: string;
        headers: Record<string, string>;
        is_binary: boolean;
        job_id?: string | null;
        metadata: ResponseMetadata;
        raw_headers: ResponseHeader[];
        status_code: number;
        success: boolean;
        timing: ResponseTiming;
    };
} | {
    statusCode: number;
    message: string;
    data: {
        job_id: string;
        message: string;
        success: boolean;
    };
};
/**
 * Structured execution plan mode.
 */
export type ExecutionMode2 = "shell-inline" | "argv";
/**
 * Result of archive extraction operation
 */
export interface ExtractArchiveResponse {
    statusCode: number;
    message: string;
    data: {
        destination?: string;
        error?: string | null;
        extracted_bytes?: number;
        extracted_files?: number;
        extraction_id?: string;
        message?: string;
        replaced?: string[];
        replaced_count?: number;
        selective?: boolean;
        selective_path?: string | null;
        skipped?: {
            path: string;
            reason: string;
        }[];
        skipped_count?: number;
        success?: boolean;
    };
}
/** The error codes files_downloadDirectoryAsZip documents (x-error-codes); see isApiErrorCode. */
export type FilesDownloadDirectoryAsZipErrorCode = "INVALID_PATH" | "ACCESS_FORBIDDEN" | "RESOURCE_NOT_FOUND" | "ARCHIVE_TOO_LARGE";
/** The error codes files_downloadFromUrl documents (x-error-codes); see isApiErrorCode. */
export type FilesDownloadFromUrlErrorCode = "INVALID_PARAMETER" | "INVALID_PATH" | "ACCESS_FORBIDDEN" | "RESOURCE_NOT_FOUND" | "CONTAINS_SERVICE_STORAGE" | "FILE_PATH_BUSY" | "FILE_PATH_CHANGED" | "MOUNT_PATH_RESERVED" | "PATH_CONFLICT" | "JOB_COUNT_LIMIT";
/** The error codes files_extractArchive documents (x-error-codes); see isApiErrorCode. */
export type FilesExtractArchiveErrorCode = "INVALID_PARAMETER" | "INVALID_PATH" | "ACCESS_FORBIDDEN" | "RESOURCE_NOT_FOUND" | "CONTAINS_SERVICE_STORAGE" | "FILE_PATH_BUSY" | "FILE_PATH_CHANGED" | "MOUNT_PATH_RESERVED" | "JOB_COUNT_LIMIT";
/** The error codes files_getDownloadHistory documents (x-error-codes); see isApiErrorCode. */
export type FilesGetDownloadHistoryErrorCode = "INVALID_PATH" | "ACCESS_FORBIDDEN" | "RESOURCE_NOT_FOUND";
/** The error codes files_getExtractionHistory documents (x-error-codes); see isApiErrorCode. */
export type FilesGetExtractionHistoryErrorCode = "INVALID_PATH" | "ACCESS_FORBIDDEN" | "RESOURCE_NOT_FOUND";
/** The error codes files_getFile documents (x-error-codes); see isApiErrorCode. */
export type FilesGetFileErrorCode = "INVALID_PATH" | "ACCESS_FORBIDDEN" | "RESOURCE_NOT_FOUND" | "PATH_CONFLICT" | "ARCHIVE_TOO_LARGE" | "BACKEND_UNREACHABLE" | "MOUNT_STORAGE_UNAVAILABLE";
/** The error codes files_patchFile documents (x-error-codes); see isApiErrorCode. */
export type FilesPatchFileErrorCode = "INVALID_PARAMETER" | "INVALID_PATH" | "ACCESS_FORBIDDEN" | "RESOURCE_NOT_FOUND" | "CONTAINS_SERVICE_STORAGE" | "FILE_PATH_BUSY" | "FILE_PATH_CHANGED" | "MOUNT_PATH_RESERVED" | "OWNER_NOT_APPLIED" | "PATH_CONFLICT" | "PERMISSIONS_NOT_APPLIED" | "PRECONDITION_FAILED" | "PAYLOAD_TOO_LARGE";
/** The error codes files_postFileOperation documents (x-error-codes); see isApiErrorCode. */
export type FilesPostFileOperationErrorCode = "INVALID_PARAMETER" | "INVALID_PATH" | "ACCESS_FORBIDDEN" | "BACKEND_READ_ONLY" | "CONTAINS_SERVICE_STORAGE" | "FILE_PATH_BUSY" | "FILE_PATH_CHANGED" | "FILE_MOVE_CROSSES_DEVICES" | "MOUNT_PATH_RESERVED" | "COPY_INCOMPLETE" | "DESTINATION_EXISTS" | "DOWNLOAD_ID_EXISTS" | "PATH_CONFLICT" | "JOB_COUNT_LIMIT" | "MOUNT_STORAGE_UNAVAILABLE" | "SERVICE_STOPPING";
/** The error codes files_processImage documents (x-error-codes); see isApiErrorCode. */
export type FilesProcessImageErrorCode = "INVALID_PATH" | "ACCESS_FORBIDDEN" | "RESOURCE_NOT_FOUND";
/** The error codes files_touchFile documents (x-error-codes); see isApiErrorCode. */
export type FilesTouchFileErrorCode = "INVALID_PATH" | "ACCESS_FORBIDDEN" | "RESOURCE_NOT_FOUND" | "CONTAINS_SERVICE_STORAGE" | "FILE_PATH_CHANGED" | "MOUNT_PATH_RESERVED" | "PATH_CONFLICT" | "FILE_PATH_BUSY";
export interface GetDisplayLatestScreenshotMetadataResponse {
    statusCode: number;
    message: string;
    data: {
        timestamp: string;
        timestamp_human?: string;
        full: FileInfo;
        thumbnail?: FileInfo | null;
    };
}
export interface GetDisplayLatestScreenshotResponse {
    statusCode: number;
    message: string;
    data: {
        info: ScreenshotInfo;
        image: Base64ImageData;
        cursor?: {
            x: number;
            y: number;
        };
    };
}
/**
 * Historical record of completed and failed downloads
 */
export interface GetDownloadHistoryResponse {
    statusCode: number;
    message: string;
    data: {
        history?: ({
            directory?: string;
            duration?: number | null;
            end_time?: number | null;
            error_message?: string | null;
            file_path?: string;
            file_size?: number | null;
            filename?: string;
            id?: string;
            sha256?: string;
            start_time?: number;
            status?: "downloading" | "completed" | "failed" | "cancelled";
            url?: string;
        })[];
    };
}
/**
 * Historical record of completed and failed extractions
 */
export interface GetExtractionHistoryResponse {
    statusCode: number;
    message: string;
    data: {
        history?: ({
            archive_path?: string;
            dest_path?: string;
            end_time?: number | null;
            error?: string | null;
            extracted_bytes?: number;
            extracted_files?: number;
            id?: string;
            selective?: boolean;
            selective_path?: string | null;
            skipped?: {
                path: string;
                reason: string;
            }[];
            skipped_count?: number;
            start_time?: number;
            status?: "active" | "completed" | "failed" | "cancelled" | "interrupted";
            total_bytes?: number | null;
            total_files?: number | null;
        })[];
    };
}
export interface GetFileResponse {
    statusCode: number;
    message: string;
    data: FileListing | FileStatResponse | FileHashResponse | FileBase64Response | ArchiveContents | GrepResults | GlobResults;
}
export interface HealthMemory10 {
    /** Resident set size in bytes */
    rss: number;
    /** Language runtime heap in bytes (null for Rust) */
    heap?: number | null;
}
export interface HealthMemory2 {
    /** Resident set size in bytes */
    rss: number;
    /** V8 heap used in bytes */
    heap?: number | null;
}
export interface HealthMemory3 {
    /** Resident set size in bytes */
    rss: number;
    /** Language runtime heap in bytes (null for Rust) */
    heap?: number | null;
}
export interface HealthMemory4 {
    /** Always null: heap size is not measured. */
    heap: number | null;
    /** Resident set size in bytes. */
    rss: number;
}
export interface HealthMemory5 {
    heap?: number | null;
    /** @minimum 0 */
    rss: number;
}
export interface HealthMemory6 {
    heap?: number | null;
    /** @minimum 0 */
    rss: number;
}
export interface HealthMemory7 {
    /** Resident set size in bytes */
    rss: number;
    /** V8 heap used in bytes */
    heap?: number | null;
}
export interface HealthMemory8 {
    /** Always null: this service reports no separate heap figure. */
    heap?: number | null;
    /** @minimum 0 */
    rss: number;
}
export interface HealthMemory9 {
    /** Resident set size in bytes */
    rss: number;
    /** Always null: this service reports no separate heap figure. */
    heap?: number | null;
}
export interface HealthResponse10 {
    status: "ok";
    service: string;
    /** Executable mtime as RFC3339 string */
    built?: string | null;
    /** Process start time as RFC3339 string */
    started: string;
    memory?: HealthMemory10 | null;
    /** Count of open file descriptors */
    fds?: number | null;
    pid: number;
    ip: string;
    userAgent?: string | null;
}
export interface HealthResponse2 {
    status: "ok";
    service: string;
    built?: string | null;
    started: string;
    memory?: HealthMemory2 | null;
    fds?: number | null;
    pid: number;
    /** Address of the caller, as the service sees it. */
    ip: string;
    userAgent?: string | null;
}
export interface HealthResponse3 {
    status: "ok";
    service: string;
    /** Executable mtime as RFC3339 string */
    built?: string | null;
    /** Process start time as RFC3339 string */
    started: string;
    memory?: HealthMemory3 | null;
    /** Count of open file descriptors */
    fds?: number | null;
    pid: number;
    /** IP address of the connecting client, or `unknown`. */
    ip: string;
    userAgent?: string | null;
}
export interface HealthResponse4 {
    /** Modification time of the server binary (RFC 3339), or null when it cannot be read. Verbose only. */
    built?: string | null;
    /** Cache snapshot, the same object GET /health/cache returns. Verbose only. */
    cache?: HealthCacheSnapshot;
    /** Operational counters and gauges keyed by name. New names may be added. Verbose only. */
    counters?: Record<string, number>;
    /** Number of open file descriptors, or null when it cannot be read. Verbose only. */
    fds?: number | null;
    /** API features this server supports, for clients that talk to servers of different versions. New names may be added. Verbose only. kv_etag: ETags on KV reads and writes; kv_conditional_writes: If-Match / If-None-Match on KV writes and batch item conditions; kv_conditional_reads: If-None-Match (304) on KV reads; kv_entry: GET /kv/{key}/entry; kv_ttl_controls: POST /kv/{key}/expire and /persist; kv_idempotency: Idempotency-Key on KV writes; kv_changes: the change feed (/changes, /changes/stream); kv_list_cursor: after / next_after paging of GET /kv; retry_after: Retry-After on retryable failures. */
    features?: string[];
    /** The caller's IP address as the server sees it. Verbose only. */
    ip?: string;
    /** Process memory, or null when it cannot be read. Verbose only. */
    memory?: HealthMemory4 | null;
    /** Server process ID. Verbose only. */
    pid?: number;
    /** Service name, "hoody-sqlite". Verbose only. */
    service?: string;
    /** When the server started (RFC 3339). Verbose only. */
    started?: string;
    /** Always "ok" when the server answers. */
    status: string;
    /** The caller's User-Agent header, or null when none was sent. Verbose only. */
    userAgent?: string | null;
}
export interface HealthResponse5 {
    built?: string | null;
    fds?: number | null;
    ip: string;
    memory?: HealthMemory5 | null;
    /** @minimum 0 */
    pid: number;
    service: string;
    started: string;
    status: string;
    userAgent?: string | null;
}
export interface HealthResponse6 {
    built?: string | null;
    fds?: number | null;
    /** Address of the client connection that made this request, as the
  service sees it. */
    ip: string;
    memory?: null | HealthMemory6;
    /** @minimum 0 */
    pid: number;
    /** Always `hoody-cron`. */
    service: string;
    started: string;
    status: string;
    /** User-Agent header of this request; null when none was sent. */
    user_agent?: string | null;
}
export interface HealthResponse7 {
    status: "ok";
    service: string;
    /** When this build was made (ISO 8601); null when unknown */
    built: string | null;
    /** Process start time as ISO 8601 string */
    started: string;
    memory: HealthMemory7 | null;
    fds: number | null;
    pid: number;
    /** Address of the caller as the service sees it, or `unknown`. */
    ip: string;
    userAgent: string | null;
}
export interface HealthResponse8 {
    built?: string | null;
    fds?: number | null;
    ip: string;
    memory?: null | HealthMemory8;
    /** @minimum 0 */
    pid: number;
    service: string;
    started: string;
    status: string;
    /** The caller's User-Agent header, or an empty string when it is absent. */
    userAgent: string;
}
export interface HealthResponse9 {
    status: "ok";
    service: string;
    /** Executable mtime as RFC3339 string */
    built?: string | null;
    /** Process start time as RFC3339 string */
    started: string;
    memory?: HealthMemory9 | null;
    fds?: number | null;
    pid: number;
    ip: string;
    userAgent?: string | null;
}
/**
 * Represents an async background job (e.g. source sync).
 */
export interface Job2 {
    /** Unique job identifier */
    job_id: string;
    kind: JobKind;
    status: JobStatus2;
    /** ISO 8601 timestamp when the job was created */
    created_at: string;
    /** ISO 8601 timestamp of the last status change */
    updated_at: string;
    /** Error message (present when status=error) */
    error?: string;
    result_type?: JobResultType;
    /** Inline result when available. For a finished search job (result_type search-response) it is a SearchResponse object with set_id, candidates and warnings. */
    result?: Record<string, unknown>;
    /** Optional progress metadata for long-running jobs */
    progress?: Record<string, unknown>;
}
/**
 * Current status of an async background job. done, error and cancelled are final; cancelled is set by POST /api/v1/run/jobs/{job_id}/cancel.
 */
export type JobStatus2 = "queued" | "running" | "done" | "error" | "cancelled";
export interface LogResponse2 {
    name: string;
    source: "console" | "qemu" | "passt" | "swtpm" | "virtiofsd";
    lines: number;
    /** The returned lines, joined with newlines. For `source=console` each line is sanitised: escape sequences, C0/C1 control characters, bidirectional overrides and invisible characters are removed, while the text, line breaks and non-ASCII scripts are kept. The text is still chosen by the guest, so treat it as untrusted. For the unaltered console bytes (for example to watch a text-mode installer as a terminal would draw it), use `GET /vms/{name}/console`. */
    content: string;
}
export type ManageComputerRequest = {
    /**
     * For `stop` and `restart`: the time, in seconds, the computer is given to shut down cleanly; past it the computer is stopped forcibly (and, for `restart`, started again), so the operation itself may run up to 420 seconds longer. For the other operations: an upper bound, in seconds, on how long the operation may run before it is cut off. At most 600. Omit it for the defaults: a 60-second clean-shutdown deadline for `stop` and `restart`, no cut-off for the other operations.
     * @minimum 1
     * @maximum 600
     */
    timeout?: number;
} | null;
export interface ManageComputerResponse {
    statusCode: number;
    message: string;
    data: {
        error?: boolean;
        operation?: string;
        computer_id?: string;
        project_id?: string;
        message?: string;
        status?: string;
        operation_id?: string;
    };
}
/** The error codes notes_getDocument documents (x-error-codes); see isApiErrorCode. */
export type NotesGetDocumentErrorCode = "bad_request" | "validation_error" | "unauthorized" | "forbidden" | "notebook_no_access" | "not_found" | "notebook_not_found";
export interface NotesGetDocumentResponse {
    statusCode: number;
    message: string;
    data: {
        id: string;
        content: Record<string, unknown>;
        createdAt: string;
        createdBy: string;
        updatedAt: string | null;
        updatedBy: string | null;
    };
}
export type PatchFileRequest = ChmodRequest | ChownRequest | RenameRequest;
/**
 * One snapshot of a pipe name, from `GET /{path}?status`. Every key is always present; `null` where it does not apply.
 */
export interface PipeReceiveDataResponse {
    statusCode: number;
    message: string;
    data: {
        state: "idle" | "waiting" | "streaming" | "complete" | "failed";
        kind: "pipe" | "ws" | "live" | null;
        peers: number | null;
        transferId: string | null;
        hasSender: boolean | null;
        activeReceivers: number | null;
        totalReceivers: number | null;
        bytesTransferred: number;
        totalBytes: number | null;
        speed: number;
        eta: number | null;
        elapsed: number;
        reason: string | null;
        sha256: string | null;
    };
}
export type PostFileOperationResponse = {
    statusCode: number;
    message: string;
    data: MoveResponse | CopyResponse | ExtractionResult | DownloadResult;
} | {
    statusCode: number;
    message: string;
    data: {
        message?: string;
        success?: boolean;
    };
} | {
    statusCode: number;
    message: string;
    data: {
        directory?: string;
        download_id: string;
        message: string;
        status: "downloading";
        success: boolean;
    };
};
/**
 * Response from the quick-start endpoints. A success carries `temporary_id`, `name`, `status` and `created_at`; an error carries `error`, and `temporary_id` whenever the program was created.
 */
export interface QuickStartResponse2 {
    success: boolean;
    /** Unique temporary identifier for this ephemeral program */
    temporary_id?: string;
    /** Program name (auto-generated or custom) */
    name?: string;
    /** X11 DISPLAY number (normalized with ":" prefix) */
    display?: string | null;
    /** Current program status. A finished program answers the status it finished with (`exited`, `fatal`, `stopped`, or `failed` when its definition never loaded) for 10 minutes after it finished. */
    status?: "running" | "stopped" | "starting" | "stopping" | "backoff" | "exited" | "fatal" | "unknown" | "failed";
    /** Process ID (if wait=true and running) */
    pid?: number | null;
    /** Uptime as "H:MM:SS", or "N day(s), H:MM:SS" once the process has been up for more than a day. Omitted when not running. */
    uptime?: string | null;
    /** ISO timestamp when program was created */
    created_at?: string;
    /** The absolute execution deadline: the launch time plus `ttl`. A program still running then is stopped, and its `last_run.error` reads `ttl expired`. Absent without a TTL. */
    expires_at?: string | null;
    /** The underlying process state, present only when it differs from `status`: a program whose run has ended while the daemon is still finishing up after it is `exited` in `status` while this says `running` (or `starting`). */
    supervisor_state?: string;
    /** The program's last ended run. Present once it has finished, and on a launch error that has a result. */
    last_run?: LastRun;
    /** Present when `success` is false. Every error after the program is created comes with its `temporary_id`. */
    error?: string;
}
export interface RemoveProgramResponse2 {
    success: boolean;
    /** ID of the removed program */
    id: number;
}
export interface SetComputerKvmPatchRequest {
    /** Enable (true) or disable (false) /dev/kvm passthrough (run VMs in the computer). Rented/dedicated servers only; the computer must be stopped. */
    kvm?: boolean;
    /** Accepted alias of `kvm` on input (`kvm` wins if both are sent and they must agree). */
    dev_kvm?: boolean;
}
export interface SetComputerKvmPatchResponse {
    statusCode: number;
    message: string;
    data: {
        id?: string;
        name?: string;
        status?: string;
        kvm?: boolean;
    };
}
export interface SetProgramBootRequest {
    boot: boolean;
}
/**
 * Every field is always present. `error` is a fixed sentence per `code`.
 */
export interface SetProgramBootResponse {
    statusCode: number;
    message: string;
    data: {
        success: boolean;
        code: "NOT_FOUND" | "LAZY_PROGRAM" | "BOOT_REFUSED" | "INTERNAL" | null;
        error: string | null;
        row: OverviewProgram | null;
    };
}
export interface SetProxyAliasStateRequest {
    /** Set to true to enable, false to disable */
    enabled: boolean;
}
export interface SetProxyAliasStateResponse {
    statusCode: 200;
    message: string;
    data: {
        id?: string;
        user_id?: string;
        project_id?: string;
        computer_id?: string;
        alias?: string;
        program?: string;
        index?: number;
        target_path?: string | null;
        allow_path_override?: boolean;
        expires_at?: string | null;
        enabled?: boolean;
        created_at?: string;
        updated_at?: string;
        url?: string | null;
        server_id?: string | null;
        server_name?: string | null;
        subserver_name?: string;
    };
}
export interface SetSubserverSubscriptionAutoRenewPatchRequest {
    /** true renews the subscription from the wallet at the end of each paid period; false lets it stop when the current period ends. Only the account owner (signed in personally) or an auth token can turn it on. */
    auto_renew: boolean;
}
export interface SetSubserverSubscriptionAutoRenewPatchResponse {
    statusCode: number;
    message: string;
    data: {
        id?: string;
        plan_id?: string;
        state?: string;
        server_id?: string | null;
        server_name?: string | null;
        region?: {
            region?: string;
            country?: string;
            city?: string;
        } | null;
        anchor_day?: number;
        auto_renew?: boolean;
        paid_through?: string | null;
        active_operation_id?: string | null;
        delete_at?: string | null;
        plan?: {
            family_id?: string;
            title?: string;
            type_label?: string;
            price_cents_per_month?: number;
            hold_days?: number;
            resources?: {
                cpu_cores?: number;
                ram_gb?: number;
                disk_limit_gb?: number;
                disk_io_read_mib?: number;
                disk_io_write_mib?: number;
                network_limit_mbps?: number;
                max_computers?: number;
                snapshots_per_computer?: number;
                ai_multiplier?: number;
            };
            max_proxy_aliases?: number;
            max_bot_urls?: number;
            max_storage_shares?: number;
            ai_tier?: "free" | "plus" | "pro";
        } | null;
        created_at?: string | null;
        updated_at?: string | null;
    };
}
export interface SetTokenGatePatchRequest {
    /** true = require OTP for token mutations (default), false = skip OTP gate */
    enabled: boolean;
    /** Required from a signed-in session (JWT) setting enabled=false. A caller using HTTP Basic with the account password supplies the password and code through Basic authentication (username:password:otp) instead. */
    password?: string;
    /**
     * TOTP code or backup code. Required from a signed-in session (JWT) setting enabled=false. A caller using HTTP Basic with the account password supplies the password and code through Basic authentication (username:password:otp) instead.
     * @maxLength 12
     */
    otp_code?: string;
}
export interface SetTokenGatePatchResponse {
    statusCode: 200;
    message: string;
    data: {
        require_for_tokens?: boolean;
    };
}
export interface ToggleEgressRuleRequest {
    /** New state for the rule */
    state: "enabled" | "disabled";
    /** Action for matching traffic */
    action?: "allow" | "reject" | "drop";
    /** Protocol type */
    protocol?: "tcp" | "udp" | "icmp4";
    /**
     * Destination port, range (e.g., 80-90), or list (e.g., 80,443)
     * @maxLength 64
     */
    destination_port?: string;
    /**
     * Source port, range, or list
     * @maxLength 64
     */
    source_port?: string;
    /**
     * Destination IPv4/CIDR address(es)
     * @maxLength 512
     */
    destination?: string;
    /**
     * Rule description
     * @maxLength 255
     */
    description?: string;
    /**
     * ICMP type number for icmp4 protocol
     * @maxLength 8
     */
    icmp_type?: string;
    /**
     * ICMP code number for icmp4 protocol
     * @maxLength 8
     */
    icmp_code?: string;
}
export interface ToggleEgressRuleResponse {
    statusCode: number;
    message: string;
    data: {
        direction?: string;
        new_state?: string;
        updated?: {
            action?: "allow" | "reject" | "drop";
            protocol?: "tcp" | "udp" | "icmp4";
            description?: string;
            destination_port?: string;
            destination?: string;
            source_port?: string;
            state?: "enabled" | "disabled";
            icmp_type?: string;
            icmp_code?: string;
        };
    };
}
export interface ToggleIncomingShareMountRequest {
    /** Set to true to accept and mount the share, false to reject/unmount it */
    mount: boolean;
}
export interface ToggleIncomingShareMountResponse {
    statusCode: 200;
    message: string;
    data: {
        share?: {
            id: string;
            source_computer_id: string;
            mount_path?: string;
            source_path: string;
            target_computer_id?: string | null;
            target_project_id?: string | null;
            target_type: "computer" | "project";
            mode: "readonly" | "readwrite";
            enabled: boolean;
            status: "active" | "failed";
            status_message?: string | null;
            expires_at?: number | null;
            created_by: string;
            realm_ids?: string[];
            created_at: string;
            updated_at: string;
        };
        override?: {
            id?: string;
            share_id?: string;
            computer_id?: string;
            mount?: boolean;
            created_at?: string;
            updated_at?: string;
        };
    };
}
export interface ToggleIngressRuleRequest {
    /** New state for the rule */
    state: "enabled" | "disabled";
    /** Action for matching traffic */
    action?: "allow" | "reject" | "drop";
    /** Protocol type */
    protocol?: "tcp" | "udp" | "icmp4";
    /**
     * Destination port, range (e.g., 80-90), or list (e.g., 80,443)
     * @maxLength 64
     */
    destination_port?: string;
    /**
     * Source port, range, or list
     * @maxLength 64
     */
    source_port?: string;
    /**
     * Source IPv4/CIDR address(es)
     * @maxLength 512
     */
    source?: string;
    /**
     * Rule description
     * @maxLength 255
     */
    description?: string;
    /**
     * ICMP type number for icmp4 protocol
     * @maxLength 8
     */
    icmp_type?: string;
    /**
     * ICMP code number for icmp4 protocol
     * @maxLength 8
     */
    icmp_code?: string;
}
export interface ToggleIngressRuleResponse {
    statusCode: number;
    message: string;
    data: {
        direction?: string;
        new_state?: string;
        updated?: {
            action?: "allow" | "reject" | "drop";
            protocol?: "tcp" | "udp" | "icmp4";
            description?: string;
            destination_port?: string;
            source?: string;
            source_port?: string;
            state?: "enabled" | "disabled";
            icmp_type?: string;
            icmp_code?: string;
        };
    };
}
/**
 * Request to enable or disable a schedule
 */
export interface ToggleScheduleRequest2 {
    /** `true` enables the schedule, `false` disables it. */
    enabled: boolean;
}
export interface UpdateComputerProxyStateRequest {
    /** true or false switches the proxy on or off for this computer and overrides the project value. null removes the computer's own value, so the project value applies again (true when the project does not set it either). */
    enable_proxy: boolean | null;
}
export interface UpdateComputerProxyStateResponse {
    statusCode: number;
    message: string;
    data: {
        project?: string;
        computer?: string;
        groups?: Record<string, unknown>;
        permissions?: Record<string, unknown>;
        default?: "allow" | "deny" | "inherit";
        enable_proxy?: boolean;
        hooks?: Record<string, unknown>;
        schema_version?: number;
        file_version?: number;
        etag?: string;
    };
    /** Publication status of this setting. `applied` means publication completed; it does not confirm that the proxy already enforces it. Changes can take several seconds or longer to take effect. */
    propagation?: {
        committed?: boolean;
        complete?: boolean;
        state?: "pending" | "applied" | "failed" | "unknown" | "superseded";
        status_scope?: "current";
        generation?: number;
        action?: "upsert" | "delete" | "unknown";
        file_version?: number;
        succeeded_count?: number;
        failed_count?: number;
        pending_count?: number;
        target_count?: number;
        retained_count?: number;
    };
}
export interface UpdateProjectProxyStateRequest {
    /** Enable or disable the proxy entirely */
    enable_proxy: boolean;
}
export interface UpdateProjectProxyStateResponse {
    statusCode: number;
    message: string;
    data: {
        project?: string;
        computer?: string;
        groups?: Record<string, unknown>;
        permissions?: Record<string, unknown>;
        default?: "allow" | "deny" | "inherit";
        enable_proxy?: boolean;
        hooks?: Record<string, unknown>;
        schema_version?: number;
        file_version?: number;
        etag?: string;
    };
    /** Publication status of this setting. `applied` means publication completed; it does not confirm that the proxy already enforces it. Changes can take several seconds or longer to take effect. */
    propagation?: {
        committed?: boolean;
        complete?: boolean;
        state?: "pending" | "applied" | "failed" | "unknown" | "superseded";
        status_scope?: "current";
        generation?: number;
        action?: "upsert" | "delete" | "unknown";
        file_version?: number;
        succeeded_count?: number;
        failed_count?: number;
        pending_count?: number;
        target_count?: number;
        retained_count?: number;
    };
}
/**
 * Partial update of a schedule. Every field is optional, at least one is
required; absent fields keep their current value.
 */
export interface UpdateScheduleRequest2 {
    /** New cron expression with six fields, `second minute hour day month weekday`,
  and an optional seventh `year` field. */
    cron?: string | null;
    /** `true` enables the schedule, `false` disables it. */
    enabled?: boolean | null;
    request?: CurlRequest | null;
}
/** The error codes vm_getVmDisplay documents (x-error-codes); see isApiErrorCode. */
export type VmGetVmDisplayErrorCode = "NameInvalid" | "NotFound" | "OperationInProgress" | "BadState" | "Orphaned" | "SpecInvalid" | "DisplayNotConfigured" | "StorageFailed";
export interface VmGetVmDisplayResponse {
    statusCode: number;
    message: string;
    data: {
        name: string;
        display: number;
        url?: string;
    };
}
