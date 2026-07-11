/**
 * tool-dispatch — the model-initiated tool-call round-trip.
 *
 * Invariant: MAX_TOOL_CALLS_PER_TURN = 1.
 *
 * A "turn" = one user message → zero-or-more assistant messages with
 * tool_calls → one terminal assistant message without tool_calls. The
 * counter lives here, in the dispatcher, as `let toolCallsThisTurn = 0`
 * reset at turn start. openai-client.ts is pure transport and does not
 * count iterations.
 *
 * When the model emits a second `tool_calls` on the same turn, we refuse
 * with a synthetic tool message that tells it to answer from context.
 *
 * When the model emits `tool_calls` for a name OTHER than `hoody_docs_search`,
 * we drop it silently (the openai-client already filters delta-level noise;
 * this is the belt-and-suspenders check at orchestration time).
 */
import { streamCompletion } from '../ai/openai-client.js';
import { executeDocsSearch, validateToolArgs, HOODY_DOCS_SEARCH_TOOL, RollingRateLimiter, DEFAULT_CLIENT_RATE_LIMIT, } from './docs-search-tool.js';
export const MAX_TOOL_CALLS_PER_TURN = 1;
/**
 * Run one user turn. Returns when the model emits a terminal message
 * (no tool_calls) or when we've refused a second tool call on the same turn.
 */
export async function dispatchTurn(opts) {
    let toolCallsThisTurn = 0;
    // Mutable local copy — we append tool-call assistant messages and tool
    // results as the turn unfolds.
    const messages = [...opts.messages];
    while (true) {
        // Track whether this round delivered any user-visible prose so we can
        // detect a content-less tool-call-only response when tools are disabled.
        // Without this, a rogue provider that emits ONLY tool_calls produces a
        // silently empty turn.
        let contentDeliveredThisRound = false;
        const streamOpts = {
            url: opts.url,
            key: opts.key,
            model: opts.model,
            messages,
            maxTokens: opts.maxTokens,
            temperature: opts.temperature,
            tools: opts.toolsEnabled ? [HOODY_DOCS_SEARCH_TOOL] : undefined,
            signal: opts.signal,
            fetchImpl: opts.fetchImpl,
            onDelta: d => {
                if (d.content) {
                    contentDeliveredThisRound = true;
                    opts.onDelta(d.content);
                }
                // tool_calls deltas are handled in onDone's aggregatedToolCalls.
            },
            onDone: () => { },
        };
        const aggregated = await runStreamOnce(streamOpts);
        // Filter tool_calls by name — anything but `hoody_docs_search` is dropped.
        // AND: when `toolsEnabled` is false the schema was never advertised, so
        // any tool_calls returned are non-compliant provider emissions. Drop
        // them outright rather than executing — this is the --no-tools /
        // HOODY_CHAT_DOCS_TOOL=0 contract.
        const allowed = opts.toolsEnabled
            ? aggregated.toolCalls.filter(tc => tc.function?.name === 'hoody_docs_search')
            : [];
        if (allowed.length === 0) {
            // Silent-drop rescue: provider emitted tool_calls while toolsEnabled
            // was false AND streamed no prose. Without this fallback, the REPL
            // prints nothing and the user is left staring at an empty prompt
            // wondering if the model hung.
            if (!opts.toolsEnabled &&
                aggregated.toolCalls.length > 0 &&
                !contentDeliveredThisRound) {
                opts.onDelta('(The AI provider tried to call a tool while tools were disabled. ' +
                    'No text was returned — re-ask, or enable tools with `/tool on`.)');
            }
            return; // terminal message
        }
        // Build the assistant tool-call message in OpenAI Chat Completions shape:
        //   { role: "assistant", content: null, tool_calls: [...] }
        // Any tool call without a resolvable id is dropped (cannot follow up on it).
        const assistantToolCalls = allowed
            .filter(tc => tc.id && tc.function?.name)
            .map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
                name: tc.function.name,
                arguments: tc.function?.arguments ?? '{}',
            },
        }));
        if (assistantToolCalls.length === 0)
            return;
        if (toolCallsThisTurn >= MAX_TOOL_CALLS_PER_TURN) {
            // Refuse — inject tool-error responses for ALL calls the model tried
            // and hand the refusal back to the model as a FINAL round with tools
            // disabled. The model must then emit terminal text answering from the
            // prior tool result. Without this final call the refusal is never
            // actually delivered and the turn silently ends mid-conversation.
            messages.push({
                role: 'assistant',
                content: null,
                tool_calls: assistantToolCalls,
            });
            for (const tc of assistantToolCalls) {
                messages.push({
                    role: 'tool',
                    name: 'hoody_docs_search',
                    tool_call_id: tc.id,
                    content: JSON.stringify({
                        error: 'docs-search-max-iterations',
                        message: 'Tool was already invoked once this turn. Answer from the previously returned context.',
                    }),
                });
            }
            // Final terminal turn: tools disabled so the model cannot loop. Stream
            // the answer through the caller's onDelta like a normal completion.
            await streamCompletion({
                url: opts.url,
                key: opts.key,
                model: opts.model,
                messages,
                maxTokens: opts.maxTokens,
                temperature: opts.temperature,
                // tools: undefined → no tool schema advertised
                signal: opts.signal,
                fetchImpl: opts.fetchImpl,
                onDelta: d => { if (d.content)
                    opts.onDelta(d.content); },
                onDone: () => { },
            });
            return;
        }
        // Execute the (first and only allowed) tool call.
        toolCallsThisTurn++;
        const tc0 = assistantToolCalls[0];
        // Missing or non-string arguments → treat as empty object so validateToolArgs
        // returns a clean "bad args" tool-result instead of TypeError'ing on .slice.
        const argsJson = typeof tc0.function.arguments === 'string' && tc0.function.arguments.length > 0
            ? tc0.function.arguments
            : '{}';
        const parsed = validateToolArgs(argsJson);
        let result;
        if ('error' in parsed) {
            result = parsed;
        }
        else {
            result = await executeDocsSearch({
                query: parsed.query,
                limiter: opts.limiter ?? new RollingRateLimiter(DEFAULT_CLIENT_RATE_LIMIT),
                fetchImpl: opts.fetchImpl,
                sleepImpl: opts.sleepImpl,
                acceptEndpointFlag: opts.acceptEndpointFlag,
                acceptEndpointEnv: opts.acceptEndpointEnv,
                isTty: opts.isTty,
                onTtyPrompt: opts.onTtyPrompt,
                sessionOnly: opts.sessionOnly,
                signal: opts.signal,
            });
        }
        // Standard OpenAI loop: assistant-with-tool_calls → tool-response. Only
        // include the one call we executed; synthetic-refuse the rest so the
        // schema stays valid (the server rejects orphaned tool_calls otherwise).
        messages.push({
            role: 'assistant',
            content: null,
            tool_calls: assistantToolCalls,
        });
        messages.push({
            role: 'tool',
            name: 'hoody_docs_search',
            tool_call_id: tc0.id,
            content: JSON.stringify(result),
        });
        // Any additional tool_calls in the same assistant message must also
        // receive a tool response to keep the message sequence valid.
        for (const extra of assistantToolCalls.slice(1)) {
            messages.push({
                role: 'tool',
                name: 'hoody_docs_search',
                tool_call_id: extra.id,
                content: JSON.stringify({
                    error: 'docs-search-max-iterations',
                    message: 'Only the first tool call this turn was executed. Answer from that result.',
                }),
            });
        }
        // Loop back — model will now produce its final answer given the tool result.
    }
}
/** Thin wrapper that returns the aggregated info from one streamCompletion call. */
async function runStreamOnce(opts) {
    let aggregatedText = '';
    let aggregatedToolCalls = [];
    await streamCompletion({
        ...opts,
        onDelta: d => {
            if (d.content)
                aggregatedText += d.content;
            opts.onDelta(d);
        },
        onDone: info => {
            aggregatedText = info.aggregatedText;
            aggregatedToolCalls = info.aggregatedToolCalls;
        },
    });
    return { text: aggregatedText, toolCalls: aggregatedToolCalls };
}
