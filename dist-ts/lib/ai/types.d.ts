/**
 * Shared types for the ai/ transport layer and for chat/ consumers.
 *
 * This module exists so ai/openai-client.ts and chat/* can agree on the
 * message and tool-spec shapes without circular imports.
 */
export interface Msg {
    role: 'system' | 'user' | 'assistant' | 'tool';
    /** Assistant tool-call turns send content: null alongside tool_calls. All
     *  other turns use a string. */
    content: string | null;
    /** Present only on role='assistant' when the assistant is emitting tool
     *  calls to be executed by the client. Shape matches OpenAI Chat Completions. */
    tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
    /** Present only on role='tool' — must match the id from the assistant's tool_call. */
    tool_call_id?: string;
    /** Present only on role='tool' — name of the tool being responded to. */
    name?: string;
}
export interface ToolSpec {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}
