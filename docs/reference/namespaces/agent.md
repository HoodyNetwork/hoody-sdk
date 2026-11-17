# `agent` — 403 methods

**Version:** 1.0.1
**Accessor:** `client.agent`

```typescript
import * as agent from 'hoody-sdk/agent';
```

---

## `client.agent.acp` (11 methods)

### `applyCredentialImport`

**POST** `/api/v1/agent/acp/agents/{agent}/credential-imports/apply`

Copy Claude Code's login to another computer, as previewed.

```typescript
client.agent.acp.applyCredentialImport(agent: string, data: AgentAcpApplyCredentialImportRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentAcpApplyCredentialImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | The agent. |
| `data` | `AgentAcpApplyCredentialImportRequest` | Yes | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentAcpApplyCredentialImportResponse`

**CLI:** `hoody agent acp credentialimports apply`

---

### `applyFileSync`

**POST** `/api/v1/agent/acp/agents/{agent}/file-syncs/apply`

Copy Claude Code files to another computer, as previewed.

```typescript
client.agent.acp.applyFileSync(agent: string, data: AgentAcpApplyFileSyncRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentAcpApplyFileSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | The agent. |
| `data` | `AgentAcpApplyFileSyncRequest` | Yes | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentAcpApplyFileSyncResponse`

**CLI:** `hoody agent acp filesyncs apply`

---

### `disable`

**PUT** `/api/v1/agent/acp/agents/{agent}/enabled`

Enable or disable a BYOA ACP backend.

```typescript
client.agent.acp.disable(agent: string, data?: object, options?: { agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | The agent. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent acp disable`

---

### `enable`

**PUT** `/api/v1/agent/acp/agents/{agent}/enabled`

Enable or disable a BYOA ACP backend.

```typescript
client.agent.acp.enable(agent: string, data?: object, options?: { agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | The agent. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent acp enable`

---

### `getDefault`

**GET** `/api/v1/agent/acp/default`

Get the realm's default delegated agent.

```typescript
client.agent.acp.getDefault(options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentAcpGetDefaultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentAcpGetDefaultResponse`

---

### `getStatus`

**GET** `/api/v1/agent/acp/agents`

Get BYOA ACP backend status.

```typescript
client.agent.acp.getStatus(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentAcpGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentAcpGetStatusResponse`

**CLI:** `hoody agent acp status`

---

### `previewCredentialImport`

**POST** `/api/v1/agent/acp/agents/{agent}/credential-imports`

Preview copying Claude Code's login to another computer.

```typescript
client.agent.acp.previewCredentialImport(agent: string, data: AgentAcpPreviewCredentialImportRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentAcpPreviewCredentialImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | The agent. |
| `data` | `AgentAcpPreviewCredentialImportRequest` | Yes | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentAcpPreviewCredentialImportResponse`

**CLI:** `hoody agent acp credentialimports preview`

---

### `previewFileSync`

**POST** `/api/v1/agent/acp/agents/{agent}/file-syncs`

Preview copying Claude Code files to another computer.

```typescript
client.agent.acp.previewFileSync(agent: string, data: AgentAcpPreviewFileSyncRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentAcpPreviewFileSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | The agent. |
| `data` | `AgentAcpPreviewFileSyncRequest` | Yes | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentAcpPreviewFileSyncResponse`

**CLI:** `hoody agent acp filesyncs preview`

---

### `setDefault`

**PUT** `/api/v1/agent/acp/default`

Set the realm's default delegated agent.

```typescript
client.agent.acp.setDefault(data: AgentAcpSetDefaultRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentAcpSetDefaultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentAcpSetDefaultRequest` | Yes | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentAcpSetDefaultResponse`

---

### `setModel`

**PUT** `/api/v1/agent/acp/agents/{agent}/model`

Set a BYOA backend's default model and effort.

```typescript
client.agent.acp.setModel(agent: string, data?: AgentAcpSetModelRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentAcpSetModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | The agent. |
| `data` | `AgentAcpSetModelRequest` | No | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentAcpSetModelResponse`

**CLI:** `hoody agent acp model set`

---

### `setSecret`

**PUT** `/api/v1/agent/acp/agents/{agent}/secrets/{key}`

Store an ACP per-agent secret value.

```typescript
client.agent.acp.setSecret(agent: string, key: string, data?: AgentAcpSetSecretRequest): Promise<AgentAcpSetSecretResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | The agent. |
| `key` | `string` | Yes | path | The key. |
| `data` | `AgentAcpSetSecretRequest` | No | body |  |

**Returns:** `AgentAcpSetSecretResponse`

**CLI:** `hoody agent acp secrets set`

---

## `client.agent` (6 methods)

### `getPauseState`

**GET** `/api/v1/agent/pause`

Get the pause state.

```typescript
client.agent.getPauseState(): Promise<AgentGetPauseStateResponse>
```

**Returns:** `AgentGetPauseStateResponse`

**CLI:** `hoody agent pausestate get`

---

### `login`

**POST** `/api/v1/agent/hoody/auth/bootstrap`

Sign this computer's agent in to the Hoody platform with a token of the box's owner. Until then the agent's shell and file tools answer "not logged in".

```typescript
client.agent.login(data: object, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `object` | Yes | body |  |

**Returns:** `any`

---

### `pause`

**PUT** `/api/v1/agent/pause`

Pause or resume the agent.

```typescript
client.agent.pause(options?: object): Promise<any>
```

**Returns:** `any`

**CLI:** `hoody agent pause`

---

### `resume`

**PUT** `/api/v1/agent/pause`

Pause or resume the agent.

```typescript
client.agent.resume(options?: object): Promise<any>
```

**Returns:** `any`

**CLI:** `hoody agent resume`

---

### `stopAllWork`

**POST** `/api/v1/agent/stop`

Stop the work running in the realm that the caller may see (at most 256 items per call; next_cursor continues).

```typescript
client.agent.stopAllWork(data?: AgentStopAllWorkRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentStopAllWorkResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentStopAllWorkRequest` | No | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentStopAllWorkResponse`

**CLI:** `hoody agent work stop`

---

### `whoami`

**GET** `/api/v1/agent/hoody/auth/status`

Hoody platform identity and realm scope.

```typescript
client.agent.whoami(): Promise<AgentWhoamiResponse>
```

**Returns:** `AgentWhoamiResponse`

**CLI:** `hoody agent whoami`

---

## `client.agent.audio` (4 methods)

### `createSpeech`

**POST** `/api/v1/agent/audio/speech`

Turn text into speech.

```typescript
client.agent.audio.createSpeech(data: object, options?: { agentRealm?: string; stream?: boolean }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |
| `stream` | `boolean` | No | option | Stream the audio as it is produced. |

**Returns:** `any`

**CLI:** `hoody agent audio speech create`

---

### `createTranscription`

**POST** `/api/v1/agent/audio/transcriptions`

Turn speech into text.

```typescript
client.agent.audio.createTranscription(data: object, options?: { agentRealm?: string; stream?: boolean }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |
| `stream` | `boolean` | No | option | Stream the transcript as it is produced. |

**Returns:** `any`

---

### `listModels`

**GET** `/api/v1/agent/audio/models`

List the speech models.

```typescript
client.agent.audio.listModels(options?: { capability?: "tts" | "stt"; agentRealm?: "global" | (string & {}) }): Promise<AgentAudioListModelsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `capability` | `"tts" \| "stt"` | No | query | Only models with this capability. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentAudioListModelsResponse`

**CLI:** `hoody agent audio models list`

---

### `listVoices`

**GET** `/api/v1/agent/audio/voices`

List the voices of the speech models.

```typescript
client.agent.audio.listVoices(options?: { model?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentAudioListVoicesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `model` | `string` | No | query | A speech model spec. Omitted, every available text-to-speech model except the Hoody AI relay models. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentAudioListVoicesResponse`

**CLI:** `hoody agent audio voices list`

---

## `client.agent.bots` (29 methods)

### `answerGate`

**POST** `/api/v1/agent/bots/{id}/gate`

Answer the approval or question the Bot itself waits on.

```typescript
client.agent.bots.answerGate(id: string, data: AgentBotsAnswerGateRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsAnswerGateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `data` | `AgentBotsAnswerGateRequest` | Yes | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsAnswerGateResponse`

---

### `cancelTurn`

**POST** `/api/v1/agent/bots/{id}/cancel`

Stop the Bot's running turn, and only that turn.

```typescript
client.agent.bots.cancelTurn(id: string, data: AgentBotsCancelTurnRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsCancelTurnResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `data` | `AgentBotsCancelTurnRequest` | Yes | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsCancelTurnResponse`

---

### `clearArchive`

**POST** `/api/v1/agent/bots/{id}/purge`

Delete a Bot's archive.

```typescript
client.agent.bots.clearArchive(id: string, options?: { expect_uid?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsClearArchiveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `expect_uid` | `string` | No | query | The uid of the Bot you read. When the id now names another Bot (the one you read was deleted and a new one created under the id), the request is refused 412 bot_changed and nothing changes. A Bot that is gone answers 404 not_found, as without it, and a request carrying it never creates chief. Omitted: no check. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsClearArchiveResponse`

**CLI:** `hoody agent bots archive clear`

---

### `clearConversation`

**POST** `/api/v1/agent/bots/{id}/forget`

Make a Bot forget its conversation.

```typescript
client.agent.bots.clearConversation(id: string, options?: { expect_uid?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsClearConversationResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `expect_uid` | `string` | No | query | The uid of the Bot you read. When the id now names another Bot (the one you read was deleted and a new one created under the id), the request is refused 412 bot_changed and nothing changes. A Bot that is gone answers 404 not_found, as without it, and a request carrying it never creates chief. Omitted: no check. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsClearConversationResponse`

**CLI:** `hoody agent bots conversation clear`

---

### `connectRealtime`

**GET** `/api/v1/agent/bots/{id}/realtime`

Talk to a Bot with an OpenAI Realtime client (WebSocket).

```typescript
client.agent.bots.connectRealtime(id: string, options?: { takeover?: boolean; agentRealm?: "global" | (string & {}) }, _templateVars?: object, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' }): Promise<AgentBotsConnectRealtimeWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `wsOptions` | `{ reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' \| 'ws' }` | No | path |  |
| `takeover` | `boolean` | No | query | true: take over from the connection that controls the Bot's voice now. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsConnectRealtimeWebSocket`

---

### `connectTwilio`

**GET** `/api/v1/agent/bots/{id}/twilio`

Connect a Twilio Media Stream to a Bot (WebSocket).

```typescript
client.agent.bots.connectTwilio(id: string, options?: { takeover?: boolean; agentRealm?: "global" | (string & {}) }, _templateVars?: object, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' }): Promise<AgentBotsConnectTwilioWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `wsOptions` | `{ reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' \| 'ws' }` | No | path |  |
| `takeover` | `boolean` | No | query | true: take over from the Bot's open voice controller. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsConnectTwilioWebSocket`

---

### `connectVoice`

**GET** `/api/v1/agent/bots/{id}/voice`

Talk to a Bot by voice (WebSocket).

```typescript
client.agent.bots.connectVoice(id: string, options?: { in_rate?: 8000 | 16000 | 24000 | 48000; out_rate?: 8000 | 16000 | 24000 | 48000; in_format?: "pcm16" | "pcmu" | "pcma"; mode?: "vad" | "ptt"; voice?: string; language?: string; speak_wakes?: boolean; takeover?: boolean; speak?: boolean; refuse?: "frame"; play_lead?: boolean; require?: string; agentRealm?: "global" | (string & {}) }, _templateVars?: object, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' }): Promise<AgentBotsConnectVoiceWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `wsOptions` | `{ reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' \| 'ws' }` | No | path |  |
| `in_rate` | `8000 \| 16000 \| 24000 \| 48000` | No | query | Input sample rate: 8000, 16000 (default), 24000 or 48000. |
| `out_rate` | `8000 \| 16000 \| 24000 \| 48000` | No | query | Output sample rate: 8000, 16000, 24000 (default) or 48000. |
| `in_format` | `"pcm16" \| "pcmu" \| "pcma"` | No | query | Input encoding: pcm16 (16-bit little-endian, default), pcmu or pcma. |
| `mode` | `"vad" \| "ptt"` | No | query | vad (default): the agent detects when the user starts and stops speaking. ptt (push to talk): the client sends ptt.down and ptt.up. |
| `voice` | `string` | No | query | The voice to speak in; omitted, the Bot's own. |
| `language` | `string` | No | query | The language the user speaks; omitted, the Bot's own. |
| `speak_wakes` | `boolean` | No | query | true: also speak replies the Bot gives on its own; omitted, the Bot's setting. |
| `takeover` | `boolean` | No | query | true: take over from the connection that controls the Bot's voice now. |
| `speak` | `boolean` | No | query | false: replies arrive as text only (reply.final); no speech is made and nothing is billed for speech synthesis. Speech-to-text still runs. Default true. |
| `refuse` | `"frame"` | No | query | frame: when the agent refuses the connection, accept the upgrade, send one refused frame with the code, message, details and retry_after_secs of the refusal, then close with 4000 plus its HTTP status (4400, 4404, 4409, 4500 or 4503), so a client that cannot read an HTTP refusal of a WebSocket, such as a browser, learns why. Omitted: refusals are HTTP answers. |
| `play_lead` | `boolean` | No | query | true: the agent keeps at most 8 seconds of reply audio ahead of what playback.mark says was played, and a reply whose audio waits 5 seconds with no mark moving on stops speaking (output.stop and reply.final reason no_marks, spoken unknown, or partial when whole segments were heard; the turn goes on). Send playback.mark at least every 500 ms while playing. Omitted or false: reply audio is sent as fast as the connection takes it. |
| `require` | `string` | No | query | stt, tts or stt,tts: check those speech settings before the upgrade and refuse it when they are not ready (400 bad_request for a voice or language the model does not offer, else 503 speech_unavailable). tts needs speak=true. Omitted: no check. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsConnectVoiceWebSocket`

---

### `create`

**POST** `/api/v1/agent/bots`

Create a Bot.

```typescript
client.agent.bots.create(data?: AgentBotsCreateRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentBotsCreateRequest` | No | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsCreateResponse`

**CLI:** `hoody agent bots create`

---

### `delete`

**DELETE** `/api/v1/agent/bots/{id}`

Delete a Bot.

```typescript
client.agent.bots.delete(id: string, options?: { expect_uid?: string; agentRealm?: "global" | (string & {}) }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `expect_uid` | `string` | No | query | The uid of the Bot you read. When the id now names another Bot (the one you read was deleted and a new one created under the id), the request is refused 412 bot_changed and nothing changes. A Bot that is gone answers 404 not_found, as without it, and a request carrying it never creates chief. Omitted: no check. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody agent bots delete`

---

### `get`

**GET** `/api/v1/agent/bots/{id}`

Get a Bot.

```typescript
client.agent.bots.get(id: string, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsGetResponse`

**CLI:** `hoody agent bots get`

---

### `getArchive`

**GET** `/api/v1/agent/bots/{id}/archive`

Read a Bot's archive.

```typescript
client.agent.bots.getArchive(id: string, options?: { since?: number; limit?: number; before?: number; tail?: boolean; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsGetArchiveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `since` | `number` | No | query | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | No | query | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `before` | `number` | No | query | Read back from the end: the newest rows whose seq is less than this, oldest first. Pass the answer's before back to read the page older than it. Not with since or tail. |
| `tail` | `boolean` | No | query | true: the newest rows of the log, oldest first, as before would give them for the next seq the log writes. The log only (on the archive, 400). Not with since or before. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsGetArchiveResponse`

**CLI:** `hoody agent bots archive get`

---

### `getArchiveAll`

**GET** `/api/v1/agent/bots/{id}/archive`

Read a Bot's archive. (collect all pages)

```typescript
client.agent.bots.getArchiveAll(id: string, options?: { since?: number; limit?: number; before?: number; tail?: boolean; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `since` | `number` | No | query | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | No | query | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `before` | `number` | No | query | Read back from the end: the newest rows whose seq is less than this, oldest first. Pass the answer's before back to read the page older than it. Not with since or tail. |
| `tail` | `boolean` | No | query | true: the newest rows of the log, oldest first, as before would give them for the next seq the log writes. The log only (on the archive, 400). Not with since or before. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `getArchiveIterator`

**GET** `/api/v1/agent/bots/{id}/archive`

Read a Bot's archive. (async iterator)

```typescript
client.agent.bots.getArchiveIterator(id: string, options?: { since?: number; limit?: number; before?: number; tail?: boolean; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `since` | `number` | No | query | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | No | query | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `before` | `number` | No | query | Read back from the end: the newest rows whose seq is less than this, oldest first. Pass the answer's before back to read the page older than it. Not with since or tail. |
| `tail` | `boolean` | No | query | true: the newest rows of the log, oldest first, as before would give them for the next seq the log writes. The log only (on the archive, 400). Not with since or before. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `getLogs`

**GET** `/api/v1/agent/bots/{id}/log`

Read a Bot's log.

```typescript
client.agent.bots.getLogs(id: string, options?: { since?: number; limit?: number; before?: number; tail?: boolean; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsGetLogsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `since` | `number` | No | query | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | No | query | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `before` | `number` | No | query | Read back from the end: the newest rows whose seq is less than this, oldest first. Pass the answer's before back to read the page older than it. Not with since or tail. |
| `tail` | `boolean` | No | query | true: the newest rows of the log, oldest first, as before would give them for the next seq the log writes. The log only (on the archive, 400). Not with since or before. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsGetLogsResponse`

**CLI:** `hoody agent bots logs get`

---

### `getLogsAll`

**GET** `/api/v1/agent/bots/{id}/log`

Read a Bot's log. (collect all pages)

```typescript
client.agent.bots.getLogsAll(id: string, options?: { since?: number; limit?: number; before?: number; tail?: boolean; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `since` | `number` | No | query | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | No | query | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `before` | `number` | No | query | Read back from the end: the newest rows whose seq is less than this, oldest first. Pass the answer's before back to read the page older than it. Not with since or tail. |
| `tail` | `boolean` | No | query | true: the newest rows of the log, oldest first, as before would give them for the next seq the log writes. The log only (on the archive, 400). Not with since or before. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `getLogsIterator`

**GET** `/api/v1/agent/bots/{id}/log`

Read a Bot's log. (async iterator)

```typescript
client.agent.bots.getLogsIterator(id: string, options?: { since?: number; limit?: number; before?: number; tail?: boolean; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `since` | `number` | No | query | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | No | query | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `before` | `number` | No | query | Read back from the end: the newest rows whose seq is less than this, oldest first. Pass the answer's before back to read the page older than it. Not with since or tail. |
| `tail` | `boolean` | No | query | true: the newest rows of the log, oldest first, as before would give them for the next seq the log writes. The log only (on the archive, 400). Not with since or before. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `getVoiceCheck`

**GET** `/api/v1/agent/bots/{id}/voice/check`

Check that a Bot can talk by voice.

```typescript
client.agent.bots.getVoiceCheck(id: string, options?: { in_rate?: 8000 | 16000 | 24000 | 48000; out_rate?: 8000 | 16000 | 24000 | 48000; in_format?: "pcm16" | "pcmu" | "pcma"; mode?: "vad" | "ptt"; voice?: string; language?: string; speak?: boolean; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsGetVoiceCheckResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `in_rate` | `8000 \| 16000 \| 24000 \| 48000` | No | query | Input sample rate: 8000, 16000 (default), 24000 or 48000. Checked for a valid value only (else 400 bad_request); it does not change the result. |
| `out_rate` | `8000 \| 16000 \| 24000 \| 48000` | No | query | Output sample rate: 8000, 16000, 24000 (default) or 48000. Checked for a valid value only (else 400 bad_request); it does not change the result. |
| `in_format` | `"pcm16" \| "pcmu" \| "pcma"` | No | query | Input encoding: pcm16 (16-bit little-endian, default), pcmu or pcma. Checked for a valid value only (else 400 bad_request); it does not change the result. |
| `mode` | `"vad" \| "ptt"` | No | query | vad (default): the agent detects when the user starts and stops speaking. ptt (push to talk): the client sends ptt.down and ptt.up. Checked for a valid value only (else 400 bad_request); it does not change the result. |
| `voice` | `string` | No | query | The voice to speak in; omitted, the Bot's own. |
| `language` | `string` | No | query | The language the user speaks; omitted, the Bot's own. |
| `speak` | `boolean` | No | query | false: check speech-to-text only, as for a voice connection opened with speak=false. Default true. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsGetVoiceCheckResponse`

---

### `list`

**GET** `/api/v1/agent/bots`

List the Bots.

```typescript
client.agent.bots.list(options?: { agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number }): Promise<AgentBotsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |

**Returns:** `AgentBotsListResponse`

**CLI:** `hoody agent bots list`

---

### `listAll`

**GET** `/api/v1/agent/bots`

List the Bots. (collect all pages)

```typescript
client.agent.bots.listAll(options?: { agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |

**Returns:** `unknown[]`

---

### `listDelegates`

**GET** `/api/v1/agent/bots/{id}/delegates`

List a Bot's delegates.

```typescript
client.agent.bots.listDelegates(id: string, options?: { state?: "open" | "closed"; page?: number; limit?: number; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsListDelegatesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `state` | `"open" \| "closed"` | No | query | open or closed: list only the delegates in that state. Omitted: both. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsListDelegatesResponse`

**CLI:** `hoody agent bots delegates list`

---

### `listDelegatesAll`

**GET** `/api/v1/agent/bots/{id}/delegates`

List a Bot's delegates. (collect all pages)

```typescript
client.agent.bots.listDelegatesAll(id: string, options?: { state?: "open" | "closed"; page?: number; limit?: number; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `state` | `"open" \| "closed"` | No | query | open or closed: list only the delegates in that state. Omitted: both. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listDelegatesIterator`

**GET** `/api/v1/agent/bots/{id}/delegates`

List a Bot's delegates. (async iterator)

```typescript
client.agent.bots.listDelegatesIterator(id: string, options?: { state?: "open" | "closed"; page?: number; limit?: number; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `state` | `"open" \| "closed"` | No | query | open or closed: list only the delegates in that state. Omitted: both. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/agent/bots`

List the Bots. (async iterator)

```typescript
client.agent.bots.listIterator(options?: { agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `reset`

**POST** `/api/v1/agent/bots/{id}/reset`

Give a Bot a new session.

```typescript
client.agent.bots.reset(id: string, options?: { expect_uid?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsResetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `expect_uid` | `string` | No | query | The uid of the Bot you read. When the id now names another Bot (the one you read was deleted and a new one created under the id), the request is refused 412 bot_changed and nothing changes. A Bot that is gone answers 404 not_found, as without it, and a request carrying it never creates chief. Omitted: no check. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsResetResponse`

**CLI:** `hoody agent bots reset`

---

### `resumeAll`

**POST** `/api/v1/agent/bots/resume`

Resume suspended Bots.

```typescript
client.agent.bots.resumeAll(options?: { agentRealm?: "global" | "all" | (string & {}) }): Promise<AgentBotsResumeAllResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsResumeAllResponse`

**CLI:** `hoody agent bots resume`

---

### `setGuardrails`

**PUT** `/api/v1/agent/bots/{id}/guardrails`

Replace a Bot's guardrails.

```typescript
client.agent.bots.setGuardrails(id: string, data: AgentBotsSetGuardrailsRequest, options?: { expect_uid?: string; expect_revision?: number; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsSetGuardrailsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `data` | `AgentBotsSetGuardrailsRequest` | Yes | body |  |
| `expect_uid` | `string` | No | query | The uid of the Bot you read. When the id now names another Bot (the one you read was deleted and a new one created under the id), the request is refused 412 bot_changed and nothing changes. A Bot that is gone answers 404 not_found, as without it, and a request carrying it never creates chief. Omitted: no check. |
| `expect_revision` | `number` | No | query | The revision of the Bot you read. When the Bot's settings or guardrails were written since, the request is refused 412 revision_mismatch and nothing changes. Omitted: no check. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsSetGuardrailsResponse`

**CLI:** `hoody agent bots guardrails set`

---

### `stopDelegate`

**POST** `/api/v1/agent/bots/{id}/delegates/{sid}/stop`

Stop one of a Bot's delegates now.

```typescript
client.agent.bots.stopDelegate(id: string, sid: string, data?: AgentBotsStopDelegateRequest, options?: { idempotencyKey?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsStopDelegateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `sid` | `string` | Yes | path | The delegate id. |
| `data` | `AgentBotsStopDelegateRequest` | No | body |  |
| `idempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). The same stop sent again with the same key returns its outcome; the same key with a different close is 422; a key starting with "chan:" is 400. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsStopDelegateResponse`

**CLI:** `hoody agent bots delegates stop`

---

### `streamLogs`

**GET** `/api/v1/agent/bots/{id}/stream`

Follow a Bot's log (SSE).

```typescript
client.agent.bots.streamLogs(id: string, options?: { since?: number; agentRealm?: "global" | (string & {}) }): Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentBotsStreamLogsFrames>>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `since` | `number` | No | query | Return only rows whose seq is greater than this. Default 0. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `IEventStream<Record<never, string>, ITypedStreamEvent<AgentBotsStreamLogsFrames>>`

**CLI:** `hoody agent bots logs stream`

---

### `update`

**PATCH** `/api/v1/agent/bots/{id}`

Change a Bot's settings.

```typescript
client.agent.bots.update(id: string, data?: AgentBotsUpdateRequest, options?: { expect_uid?: string; expect_revision?: number; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `data` | `AgentBotsUpdateRequest` | No | body |  |
| `expect_uid` | `string` | No | query | The uid of the Bot you read. When the id now names another Bot (the one you read was deleted and a new one created under the id), the request is refused 412 bot_changed and nothing changes. A Bot that is gone answers 404 not_found, as without it, and a request carrying it never creates chief. Omitted: no check. |
| `expect_revision` | `number` | No | query | The revision of the Bot you read. When the Bot's settings or guardrails were written since, the request is refused 412 revision_mismatch and nothing changes. Omitted: no check. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsUpdateResponse`

**CLI:** `hoody agent bots update`

---

## `client.agent.bots.channels` (18 methods)

### `addPrincipal`

**POST** `/api/v1/agent/bots/{id}/channels/{cid}/principals`

Pair a person with a channel by their user id in the chat app.

```typescript
client.agent.bots.channels.addPrincipal(id: string, cid: string, data: AgentBotsChannelsAddPrincipalRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsAddPrincipalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `cid` | `string` | Yes | path | The channel id. |
| `data` | `AgentBotsChannelsAddPrincipalRequest` | Yes | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsAddPrincipalResponse`

**CLI:** `hoody agent bots channels principals add`

---

### `cancelPairing`

**DELETE** `/api/v1/agent/bots/{id}/channels/{cid}/pairing`

Cancel a channel's pairing code.

```typescript
client.agent.bots.channels.cancelPairing(id: string, cid: string, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsCancelPairingResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `cid` | `string` | Yes | path | The channel id. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsCancelPairingResponse`

**CLI:** `hoody agent bots channels pairing cancel`

---

### `create`

**POST** `/api/v1/agent/bots/{id}/channels`

Connect a Bot to a chat app.

```typescript
client.agent.bots.channels.create(id: string, data: AgentBotsChannelsCreateRequest, options?: { idempotencyKey?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `data` | `AgentBotsChannelsCreateRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). The same create sent again with the same key returns its channel; the same key with a different body is 422. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsCreateResponse`

**CLI:** `hoody agent bots channels create`

---

### `createPairing`

**POST** `/api/v1/agent/bots/{id}/channels/{cid}/pairing`

Make a pairing code for a channel.

```typescript
client.agent.bots.channels.createPairing(id: string, cid: string, data?: AgentBotsChannelsCreatePairingRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsCreatePairingResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `cid` | `string` | Yes | path | The channel id. |
| `data` | `AgentBotsChannelsCreatePairingRequest` | No | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsCreatePairingResponse`

**CLI:** `hoody agent bots channels pairing create`

---

### `delete`

**DELETE** `/api/v1/agent/bots/{id}/channels/{cid}`

Delete one of a Bot's chat channels.

```typescript
client.agent.bots.channels.delete(id: string, cid: string, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `cid` | `string` | Yes | path | The channel id. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsDeleteResponse`

**CLI:** `hoody agent bots channels delete`

---

### `deleteChat`

**DELETE** `/api/v1/agent/bots/{id}/channels/{cid}/chats/{chat}`

Forget a chat.

```typescript
client.agent.bots.channels.deleteChat(id: string, cid: string, chat: string, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsDeleteChatResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `cid` | `string` | Yes | path | The channel id. |
| `chat` | `string` | Yes | path | The chat. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsDeleteChatResponse`

**CLI:** `hoody agent bots channels chats delete`

---

### `get`

**GET** `/api/v1/agent/bots/{id}/channels/{cid}`

Get one of a Bot's chat channels.

```typescript
client.agent.bots.channels.get(id: string, cid: string, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `cid` | `string` | Yes | path | The channel id. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsGetResponse`

**CLI:** `hoody agent bots channels get`

---

### `getSettings`

**GET** `/api/v1/agent/bots/{id}/channel-settings`

Get a Bot's channel-wide settings.

```typescript
client.agent.bots.channels.getSettings(id: string, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsGetSettingsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsGetSettingsResponse`

**CLI:** `hoody agent bots channels settings get`

---

### `getSetup`

**GET** `/api/v1/agent/bots/{id}/channels/setup`

How to get the credentials of a chat app.

```typescript
client.agent.bots.channels.getSetup(id: string, options: { kind: "discord" | "slack" | "telegram"; name?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsGetSetupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `kind` | `"discord" \| "slack" \| "telegram"` | Yes | query | The chat app. |
| `name` | `string` | No | query | Optional name of the bot account to be created, echoed back. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsGetSetupResponse`

**CLI:** `hoody agent bots channels setup get`

---

### `list`

**GET** `/api/v1/agent/bots/{id}/channels`

List a Bot's chat channels.

```typescript
client.agent.bots.channels.list(id: string, options?: { page?: number; limit?: number; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page, at most 8: 0 or omitted means 8, and a larger value is served as 8 (meta.limit echoes the value used). |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsListResponse`

**CLI:** `hoody agent bots channels list`

---

### `listAll`

**GET** `/api/v1/agent/bots/{id}/channels`

List a Bot's chat channels. (collect all pages)

```typescript
client.agent.bots.channels.listAll(id: string, options?: { page?: number; limit?: number; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page, at most 8: 0 or omitted means 8, and a larger value is served as 8 (meta.limit echoes the value used). |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/bots/{id}/channels`

List a Bot's chat channels. (async iterator)

```typescript
client.agent.bots.channels.listIterator(id: string, options?: { page?: number; limit?: number; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page, at most 8: 0 or omitted means 8, and a larger value is served as 8 (meta.limit echoes the value used). |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `removePrincipal`

**DELETE** `/api/v1/agent/bots/{id}/channels/{cid}/principals/{pid}`

Unpair a person.

```typescript
client.agent.bots.channels.removePrincipal(id: string, cid: string, pid: string, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsRemovePrincipalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `cid` | `string` | Yes | path | The channel id. |
| `pid` | `string` | Yes | path | The principal id. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsRemovePrincipalResponse`

**CLI:** `hoody agent bots channels principals remove`

---

### `setCredentials`

**PUT** `/api/v1/agent/bots/{id}/channels/{cid}/credentials`

Replace a channel's credentials.

```typescript
client.agent.bots.channels.setCredentials(id: string, cid: string, data: AgentBotsChannelsSetCredentialsRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsSetCredentialsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `cid` | `string` | Yes | path | The channel id. |
| `data` | `AgentBotsChannelsSetCredentialsRequest` | Yes | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsSetCredentialsResponse`

**CLI:** `hoody agent bots channels credentials set`

---

### `update`

**PATCH** `/api/v1/agent/bots/{id}/channels/{cid}`

Change one of a Bot's chat channels.

```typescript
client.agent.bots.channels.update(id: string, cid: string, data?: AgentBotsChannelsUpdateRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `cid` | `string` | Yes | path | The channel id. |
| `data` | `AgentBotsChannelsUpdateRequest` | No | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsUpdateResponse`

**CLI:** `hoody agent bots channels update`

---

### `updateChat`

**PATCH** `/api/v1/agent/bots/{id}/channels/{cid}/chats/{chat}`

Approve, mute or configure a chat.

```typescript
client.agent.bots.channels.updateChat(id: string, cid: string, chat: string, data?: AgentBotsChannelsUpdateChatRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsUpdateChatResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `cid` | `string` | Yes | path | The channel id. |
| `chat` | `string` | Yes | path | The chat. |
| `data` | `AgentBotsChannelsUpdateChatRequest` | No | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsUpdateChatResponse`

**CLI:** `hoody agent bots channels chats update`

---

### `updatePrincipal`

**PATCH** `/api/v1/agent/bots/{id}/channels/{cid}/principals/{pid}`

Change a paired person.

```typescript
client.agent.bots.channels.updatePrincipal(id: string, cid: string, pid: string, data?: AgentBotsChannelsUpdatePrincipalRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsUpdatePrincipalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `cid` | `string` | Yes | path | The channel id. |
| `pid` | `string` | Yes | path | The principal id. |
| `data` | `AgentBotsChannelsUpdatePrincipalRequest` | No | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsUpdatePrincipalResponse`

**CLI:** `hoody agent bots channels principals update`

---

### `updateSettings`

**PATCH** `/api/v1/agent/bots/{id}/channel-settings`

Change a Bot's channel-wide settings.

```typescript
client.agent.bots.channels.updateSettings(id: string, data?: AgentBotsChannelsUpdateSettingsRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsChannelsUpdateSettingsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `data` | `AgentBotsChannelsUpdateSettingsRequest` | No | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsChannelsUpdateSettingsResponse`

**CLI:** `hoody agent bots channels settings update`

---

## `client.agent.bots.messages` (3 methods)

### `getByKey`

**GET** `/api/v1/agent/bots/{id}/messages/by-key/{key}`

Read a Bot message by its idempotency key.

```typescript
client.agent.bots.messages.getByKey(id: string, key: string, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentBotsMessagesGetByKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `key` | `string` | Yes | path | The key. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsMessagesGetByKeyResponse`

**CLI:** `hoody agent bots messages keys get`

---

### `send`

**POST** `/api/v1/agent/bots/{id}/messages`

Post a message to a Bot.

```typescript
client.agent.bots.messages.send(id: string, data: AgentBotsMessagesSendRequest, options?: { idempotencyKey?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsMessagesSendResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `data` | `AgentBotsMessagesSendRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key and text returns the same message_id and the message's current state, and queues nothing again; the same key with a different text, or one used through another door of the Bot, is 422; a key starting with "compat:" or "chan:" is 400. A key is remembered while its message is queued and for at least 24 hours after it was accepted. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsMessagesSendResponse`

**CLI:** `hoody agent bots messages send`

---

### `sendAudio`

**POST** `/api/v1/agent/bots/{id}/messages/audio`

Post a spoken message to a Bot.

```typescript
client.agent.bots.messages.sendAudio(id: string, data: FormData, options?: { idempotencyKey?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentBotsMessagesSendAudioResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The bot id. |
| `data` | `FormData` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key and audio returns the same message_id and queues nothing again; the same key with other audio, or one used through another door of the Bot, is 422; a key starting with "compat:" or "chan:" is 400. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentBotsMessagesSendAudioResponse`

---

## `client.agent.changes` (2 methods)

### `get`

**GET** `/api/v1/agent/changes`

Change tokens for the Work lists.

```typescript
client.agent.changes.get(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentChangesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentChangesGetResponse`

**CLI:** `hoody agent changes get`

---

### `stream`

**GET** `/api/v1/agent/changes/stream`

Stream the change tokens (SSE).

```typescript
client.agent.changes.stream(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentChangesStreamFrames>>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `IEventStream<Record<never, string>, ITypedStreamEvent<AgentChangesStreamFrames>>`

**CLI:** `hoody agent changes stream`

---

## `client.agent.completions` (1 method)

### `create`

**POST** `/api/v1/agent/completions`

Run one tool-free model completion.

```typescript
client.agent.completions.create(data: object, options?: { stream?: boolean }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `object` | Yes | body |  |
| `stream` | `boolean` | No | option | Stream the completion as server-sent events. |

**Returns:** `any`

**CLI:** `hoody agent completions create`

---

## `client.agent.computers` (3 methods)

### `list`

**GET** `/api/v1/agent/computers`

List computers in a realm (for binding).

```typescript
client.agent.computers.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentComputersListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentComputersListResponse`

**CLI:** `hoody agent computers list`

---

### `listAll`

**GET** `/api/v1/agent/computers`

List computers in a realm (for binding). (collect all pages)

```typescript
client.agent.computers.listAll(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/computers`

List computers in a realm (for binding). (async iterator)

```typescript
client.agent.computers.listIterator(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.agent.definitions` (15 methods)

### `copy`

**POST** `/api/v1/agent/agents/{name}/copy`

Copy a chat agent.

```typescript
client.agent.definitions.copy(name: string, data: AgentDefinitionsCopyRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsCopyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsCopyRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsCopyResponse`

**CLI:** `hoody agent definitions copy`

---

### `create`

**POST** `/api/v1/agent/agents`

Create a chat-agent definition.

```typescript
client.agent.definitions.create(data: AgentDefinitionsCreateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentDefinitionsCreateRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsCreateResponse`

**CLI:** `hoody agent definitions create`

---

### `delete`

**DELETE** `/api/v1/agent/agents/{name}`

Delete a custom chat agent.

```typescript
client.agent.definitions.delete(name: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsDeleteResponse`

**CLI:** `hoody agent definitions delete`

---

### `getSource`

**GET** `/api/v1/agent/agents/{name}/source`

Read a chat agent's source.

```typescript
client.agent.definitions.getSource(name: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsGetSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsGetSourceResponse`

**CLI:** `hoody agent definitions source get`

---

### `list`

**GET** `/api/v1/agent/agents`

List chat-agent definitions.

```typescript
client.agent.definitions.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsListResponse`

**CLI:** `hoody agent definitions list`

---

### `listAll`

**GET** `/api/v1/agent/agents`

List chat-agent definitions. (collect all pages)

```typescript
client.agent.definitions.listAll(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/agents`

List chat-agent definitions. (async iterator)

```typescript
client.agent.definitions.listIterator(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `rename`

**POST** `/api/v1/agent/agents/{name}/rename`

Rename a chat agent.

```typescript
client.agent.definitions.rename(name: string, data: AgentDefinitionsRenameRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsRenameResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsRenameRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsRenameResponse`

**CLI:** `hoody agent definitions rename`

---

### `reset`

**POST** `/api/v1/agent/agents/{name}/reset-to-shipped`

Reset an agent to its shipped default.

```typescript
client.agent.definitions.reset(name: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsResetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsResetResponse`

**CLI:** `hoody agent definitions reset`

---

### `setEffort`

**PATCH** `/api/v1/agent/agents/{name}/effort`

Set an agent's reasoning effort.

```typescript
client.agent.definitions.setEffort(name: string, data: AgentDefinitionsSetEffortRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsSetEffortResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsSetEffortRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsSetEffortResponse`

**CLI:** `hoody agent definitions effort set`

---

### `setModel`

**PATCH** `/api/v1/agent/agents/{name}/model`

Set an agent's model.

```typescript
client.agent.definitions.setModel(name: string, data: AgentDefinitionsSetModelRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsSetModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsSetModelRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsSetModelResponse`

**CLI:** `hoody agent definitions model set`

---

### `setSource`

**PUT** `/api/v1/agent/agents/{name}/source`

Write a chat agent's source.

```typescript
client.agent.definitions.setSource(name: string, data: AgentDefinitionsSetSourceRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsSetSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsSetSourceRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsSetSourceResponse`

**CLI:** `hoody agent definitions source set`

---

### `setTools`

**PATCH** `/api/v1/agent/agents/{name}/tools`

Set an agent's tool allow-list.

```typescript
client.agent.definitions.setTools(name: string, data: AgentDefinitionsSetToolsRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsSetToolsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsSetToolsRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsSetToolsResponse`

**CLI:** `hoody agent definitions tools set`

---

### `setTurnLimit`

**PATCH** `/api/v1/agent/agents/{name}/turns`

Set an agent's max-turns.

```typescript
client.agent.definitions.setTurnLimit(name: string, data: AgentDefinitionsSetTurnLimitRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsSetTurnLimitResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsSetTurnLimitRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsSetTurnLimitResponse`

**CLI:** `hoody agent definitions turnlimit set`

---

### `toggleTool`

**POST** `/api/v1/agent/agents/{name}/tools/{tool}/toggle`

Toggle a single tool for an agent.

```typescript
client.agent.definitions.toggleTool(name: string, tool: string, data?: AgentDefinitionsToggleToolRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentDefinitionsToggleToolResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `tool` | `string` | Yes | path | The tool. |
| `data` | `AgentDefinitionsToggleToolRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentDefinitionsToggleToolResponse`

**CLI:** `hoody agent definitions tools toggle`

---

## `client.agent.files` (3 methods)

### `list`

**GET** `/api/v1/agent/agent-files`

List the files that shape the agents.

```typescript
client.agent.files.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentFilesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentFilesListResponse`

**CLI:** `hoody agent files list`

---

### `listAll`

**GET** `/api/v1/agent/agent-files`

List the files that shape the agents. (collect all pages)

```typescript
client.agent.files.listAll(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/agent-files`

List the files that shape the agents. (async iterator)

```typescript
client.agent.files.listIterator(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.agent.fusions` (5 methods)

### `delete`

**DELETE** `/api/v1/agent/settings/fusion/{slug}`

Delete a fusion composite.

```typescript
client.agent.fusions.delete(slug: string, options?: { cwd?: string; configDir?: string }): Promise<AgentFusionsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `slug` | `string` | Yes | path | The slug. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentFusionsDeleteResponse`

**CLI:** `hoody agent fusions delete`

---

### `list`

**GET** `/api/v1/agent/settings/fusion`

List fusion composites.

```typescript
client.agent.fusions.list(options?: { include_invalid?: boolean; page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<AgentFusionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_invalid` | `boolean` | No | query | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is diagnosable. An entry with no usable slug, or a duplicate slug, cannot be deleted through this API: see the operation description. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentFusionsListResponse`

**CLI:** `hoody agent fusions list`

---

### `listAll`

**GET** `/api/v1/agent/settings/fusion`

List fusion composites. (collect all pages)

```typescript
client.agent.fusions.listAll(options?: { include_invalid?: boolean; page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_invalid` | `boolean` | No | query | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is diagnosable. An entry with no usable slug, or a duplicate slug, cannot be deleted through this API: see the operation description. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/settings/fusion`

List fusion composites. (async iterator)

```typescript
client.agent.fusions.listIterator(options?: { include_invalid?: boolean; page?: number; limit?: number; cwd?: string; configDir?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_invalid` | `boolean` | No | query | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is diagnosable. An entry with no usable slug, or a duplicate slug, cannot be deleted through this API: see the operation description. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `set`

**PUT** `/api/v1/agent/settings/fusion/{slug}`

Create or update a fusion composite.

```typescript
client.agent.fusions.set(slug: string, data: AgentFusionsSetRequest, options?: { cwd?: string; configDir?: string }): Promise<AgentFusionsSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `slug` | `string` | Yes | path | The slug. |
| `data` | `AgentFusionsSetRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentFusionsSetResponse`

**CLI:** `hoody agent fusions set`

---

## `client.agent.gates` (7 methods)

### `answer`

**POST** `/api/v1/agent/sessions/{id}/answer`

Answer a parked question gate.

```typescript
client.agent.gates.answer(id: string, data?: AgentGatesAnswerRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGatesAnswerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentGatesAnswerRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGatesAnswerResponse`

**CLI:** `hoody agent gates answer`

---

### `approve`

**POST** `/api/v1/agent/sessions/{id}/confirm`

Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease).

```typescript
client.agent.gates.approve(id: string, data?: object, options?: { approverLease?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `approverLease` | `string` | No | header | The approver-lease capability returned by POST /api/v1/agent/sessions/{id}/approver-lease. Required on every decision (/api/v1/agent/sessions/{id}/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent gates approve`

---

### `deny`

**POST** `/api/v1/agent/sessions/{id}/confirm`

Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease).

```typescript
client.agent.gates.deny(id: string, data?: object, options?: { approverLease?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `approverLease` | `string` | No | header | The approver-lease capability returned by POST /api/v1/agent/sessions/{id}/approver-lease. Required on every decision (/api/v1/agent/sessions/{id}/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent gates deny`

---

### `list`

**GET** `/api/v1/agent/gates`

List the gates waiting for a human.

```typescript
client.agent.gates.list(options?: { include_system?: boolean; agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<AgentGatesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also list the gates of daemon-owned system/resident sessions (as GET /api/v1/agent/sessions does). |
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentGatesListResponse`

**CLI:** `hoody agent gates list`

---

### `listAll`

**GET** `/api/v1/agent/gates`

List the gates waiting for a human. (collect all pages)

```typescript
client.agent.gates.listAll(options?: { include_system?: boolean; agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also list the gates of daemon-owned system/resident sessions (as GET /api/v1/agent/sessions does). |
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/gates`

List the gates waiting for a human. (async iterator)

```typescript
client.agent.gates.listIterator(options?: { include_system?: boolean; agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also list the gates of daemon-owned system/resident sessions (as GET /api/v1/agent/sessions does). |
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `suggest`

**POST** `/api/v1/agent/sessions/{id}/answer:assist`

Propose answers for a parked question (helper model).

```typescript
client.agent.gates.suggest(id: string, data?: AgentGatesSuggestRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGatesSuggestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentGatesSuggestRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGatesSuggestResponse`

**CLI:** `hoody agent gates suggest`

---

## `client.agent.github` (8 methods)

### `createIssue`

**POST** `/api/v1/agent/github/issues`

Open an issue.

```typescript
client.agent.github.createIssue(data: AgentGithubCreateIssueRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubCreateIssueResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubCreateIssueRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubCreateIssueResponse`

**CLI:** `hoody agent github issues create`

---

### `getDiff`

**GET** `/api/v1/agent/github/diff`

Read the working-tree diff.

```typescript
client.agent.github.getDiff(options?: { staged?: boolean; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubGetDiffResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `staged` | `boolean` | No | query | When true, return the STAGED (index) diff (what a commit would record) instead of the unstaged working-tree diff. Defaults to false. Accepts true/1/yes/on; every other value, including an empty one, is false. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubGetDiffResponse`

**CLI:** `hoody agent github diff get`

---

### `getStatus`

**GET** `/api/v1/agent/github/status`

GitHub working-tree status.

```typescript
client.agent.github.getStatus(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubGetStatusResponse`

**CLI:** `hoody agent github status`

---

### `listIssues`

**GET** `/api/v1/agent/github/issues`

List issues.

```typescript
client.agent.github.listIssues(options: { owner: string; repo: string; state?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubListIssuesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `owner` | `string` | Yes | query | Repository owner (user or org login). Required: not derived from the bound checkout; GET /api/v1/agent/github/identity returns it. |
| `repo` | `string` | Yes | query | Repository name without the owner. Required, same source as `owner`. |
| `state` | `string` | No | query | Which issues to return: open (the default when omitted), closed, or all. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubListIssuesResponse`

**CLI:** `hoody agent github issues list`

---

### `popStash`

**POST** `/api/v1/agent/github/stash/pop`

Restore the most recent stash entry.

```typescript
client.agent.github.popStash(data?: AgentGithubPopStashRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubPopStashResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubPopStashRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubPopStashResponse`

**CLI:** `hoody agent github stash pop`

---

### `pushStash`

**POST** `/api/v1/agent/github/stash`

Stash the working tree.

```typescript
client.agent.github.pushStash(data?: AgentGithubPushStashRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubPushStashResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubPushStashRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubPushStashResponse`

**CLI:** `hoody agent github stash push`

---

### `sync`

**POST** `/api/v1/agent/github/sync`

Sync (fetch → pull → push).

```typescript
client.agent.github.sync(data?: AgentGithubSyncRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubSyncRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubSyncResponse`

**CLI:** `hoody agent github sync`

---

### `useAccount`

**POST** `/api/v1/agent/github/auth/active`

Switch the active GitHub account.

```typescript
client.agent.github.useAccount(data: AgentGithubUseAccountRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubUseAccountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubUseAccountRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubUseAccountResponse`

**CLI:** `hoody agent github accounts use`

---

## `client.agent.github.auth` (5 methods)

### `getStatus`

**GET** `/api/v1/agent/github/auth/status`

GitHub auth status.

```typescript
client.agent.github.auth.getStatus(options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentGithubAuthGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubAuthGetStatusResponse`

**CLI:** `hoody agent github auth status`

---

### `login`

**POST** `/api/v1/agent/github/auth/login`

Sign in to GitHub with a personal access token (body token, required); the call ends signed in.

```typescript
client.agent.github.auth.login(data?: object, options?: { agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent github auth login`

---

### `logout`

**POST** `/api/v1/agent/github/auth/logout`

Remove a linked GitHub account.

```typescript
client.agent.github.auth.logout(data: AgentGithubAuthLogoutRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubAuthLogoutResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubAuthLogoutRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubAuthLogoutResponse`

**CLI:** `hoody agent github auth logout`

---

### `poll`

**POST** `/api/v1/agent/github/auth/login/poll`

Poll a GitHub device-flow login to completion.

```typescript
client.agent.github.auth.poll(data: AgentGithubAuthPollRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentGithubAuthPollResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubAuthPollRequest` | Yes | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubAuthPollResponse`

**CLI:** `hoody agent github auth poll`

---

### `start`

**POST** `/api/v1/agent/github/auth/login`

Start a GitHub device-flow login: answers the user code and verification URL; finish with auth.poll().

```typescript
client.agent.github.auth.start(data?: object, options?: { agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent github auth start`

---

## `client.agent.github.branches` (5 methods)

### `create`

**POST** `/api/v1/agent/github/branch`

Create a branch.

```typescript
client.agent.github.branches.create(data: AgentGithubBranchesCreateRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubBranchesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubBranchesCreateRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubBranchesCreateResponse`

**CLI:** `hoody agent github branches create`

---

### `delete`

**POST** `/api/v1/agent/github/branch/delete`

Force-delete a local branch.

```typescript
client.agent.github.branches.delete(data: AgentGithubBranchesDeleteRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubBranchesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubBranchesDeleteRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubBranchesDeleteResponse`

**CLI:** `hoody agent github branches delete`

---

### `getRemote`

**GET** `/api/v1/agent/github/remote-branch`

Read a branch's head on GitHub.

```typescript
client.agent.github.branches.getRemote(options: { owner: string; repo: string; branch: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubBranchesGetRemoteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `owner` | `string` | Yes | query | Repository owner (user or org login), e.g. "octocat". Required: it is NOT derived from the bound checkout; GET /api/v1/agent/github/identity returns it. |
| `repo` | `string` | Yes | query | Repository name without the owner, e.g. "Hello-World". Required, same source as `owner`. |
| `branch` | `string` | Yes | query | Branch name without refs/heads/, e.g. "feature/login". Required; matched exactly, never as a prefix. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubBranchesGetRemoteResponse`

**CLI:** `hoody agent github branches remote get`

---

### `list`

**GET** `/api/v1/agent/github/branches`

List GitHub branches.

```typescript
client.agent.github.branches.list(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubBranchesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubBranchesListResponse`

**CLI:** `hoody agent github branches list`

---

### `use`

**POST** `/api/v1/agent/github/branch/switch`

Switch to an existing branch.

```typescript
client.agent.github.branches.use(data: AgentGithubBranchesUseRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubBranchesUseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubBranchesUseRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubBranchesUseResponse`

**CLI:** `hoody agent github branches use`

---

## `client.agent.github.commits` (3 methods)

### `create`

**POST** `/api/v1/agent/github/commit`

Stage all and commit.

```typescript
client.agent.github.commits.create(data: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string; push?: boolean }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |
| `push` | `boolean` | No | option | Stage, commit and push in one call. |

**Returns:** `any`

**CLI:** `hoody agent github commits create`

---

### `list`

**GET** `/api/v1/agent/github/log`

Read recent commit history.

```typescript
client.agent.github.commits.list(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubCommitsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubCommitsListResponse`

**CLI:** `hoody agent github commits list`

---

### `suggestMessage`

**POST** `/api/v1/agent/github/commit/suggest-message`

Draft a commit message with a model.

```typescript
client.agent.github.commits.suggestMessage(data: AgentGithubCommitsSuggestMessageRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubCommitsSuggestMessageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubCommitsSuggestMessageRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubCommitsSuggestMessageResponse`

**CLI:** `hoody agent github commits message suggest`

---

## `client.agent.github.prs` (4 methods)

### `checkout`

**POST** `/api/v1/agent/github/pr/checkout`

Check out a pull request.

```typescript
client.agent.github.prs.checkout(data: AgentGithubPrsCheckoutRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubPrsCheckoutResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubPrsCheckoutRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubPrsCheckoutResponse`

**CLI:** `hoody agent github prs checkout`

---

### `create`

**POST** `/api/v1/agent/github/pr`

Open a pull request.

```typescript
client.agent.github.prs.create(data: AgentGithubPrsCreateRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubPrsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubPrsCreateRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubPrsCreateResponse`

**CLI:** `hoody agent github prs create`

---

### `list`

**GET** `/api/v1/agent/github/pr`

List pull requests.

```typescript
client.agent.github.prs.list(options: { owner: string; repo: string; state?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubPrsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `owner` | `string` | Yes | query | Repository owner (user or org login), e.g. "octocat". Required: it is NOT derived from the bound checkout; GET /api/v1/agent/github/identity returns it. |
| `repo` | `string` | Yes | query | Repository name without the owner, e.g. "Hello-World". Required, same source as `owner`. |
| `state` | `string` | No | query | Which pull requests to return: open (the default when omitted), closed, or all. An unrecognized value is passed through to GitHub, which rejects it. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubPrsListResponse`

**CLI:** `hoody agent github prs list`

---

### `merge`

**POST** `/api/v1/agent/github/pr/merge`

Merge a pull request.

```typescript
client.agent.github.prs.merge(data: AgentGithubPrsMergeRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubPrsMergeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubPrsMergeRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubPrsMergeResponse`

**CLI:** `hoody agent github prs merge`

---

## `client.agent.github.repos` (4 methods)

### `clone`

**POST** `/api/v1/agent/github/clone`

Clone a GitHub repository.

```typescript
client.agent.github.repos.clone(data?: AgentGithubReposCloneRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubReposCloneResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubReposCloneRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubReposCloneResponse`

**CLI:** `hoody agent github repos clone`

---

### `list`

**GET** `/api/v1/agent/github/repos`

List GitHub repos.

```typescript
client.agent.github.repos.list(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubReposListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubReposListResponse`

**CLI:** `hoody agent github repos list`

---

### `resolve`

**GET** `/api/v1/agent/github/identity`

Resolve the bound repository's owner/name.

```typescript
client.agent.github.repos.resolve(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubReposResolveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubReposResolveResponse`

**CLI:** `hoody agent github repos resolve`

---

### `setCredentials`

**POST** `/api/v1/agent/github/repo/reconnect`

Re-write a checkout's GitHub credential.

```typescript
client.agent.github.repos.setCredentials(data?: AgentGithubReposSetCredentialsRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubReposSetCredentialsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubReposSetCredentialsRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubReposSetCredentialsResponse`

**CLI:** `hoody agent github repos credentials set`

---

## `client.agent.github.worktrees` (3 methods)

### `create`

**POST** `/api/v1/agent/github/worktrees`

Add a linked worktree.

```typescript
client.agent.github.worktrees.create(data: AgentGithubWorktreesCreateRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubWorktreesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubWorktreesCreateRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubWorktreesCreateResponse`

**CLI:** `hoody agent github worktrees create`

---

### `delete`

**POST** `/api/v1/agent/github/worktrees/remove`

Remove a linked worktree.

```typescript
client.agent.github.worktrees.delete(data: AgentGithubWorktreesDeleteRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubWorktreesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubWorktreesDeleteRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubWorktreesDeleteResponse`

**CLI:** `hoody agent github worktrees delete`

---

### `list`

**GET** `/api/v1/agent/github/worktrees`

List linked worktrees.

```typescript
client.agent.github.worktrees.list(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentGithubWorktreesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentGithubWorktreesListResponse`

**CLI:** `hoody agent github worktrees list`

---

## `client.agent.headless` (1 method)

### `start`

**POST** `/api/v1/agent/headless/runs`

Create a headless one-shot run.

```typescript
client.agent.headless.start(data?: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string; stream?: boolean }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |
| `stream` | `boolean` | No | option | Stream the run as server-sent events instead of answering its handle (202). |

**Returns:** `any`

**CLI:** `hoody agent headless start`

---

## `client.agent.hooks` (14 methods)

### `createWriteIntent`

**POST** `/api/v1/agent/hooks/begin-write`

Begin a hook write (nonce).

```typescript
client.agent.hooks.createWriteIntent(data: AgentHooksCreateWriteIntentRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentHooksCreateWriteIntentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentHooksCreateWriteIntentRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentHooksCreateWriteIntentResponse`

**CLI:** `hoody agent hooks writeintents create`

---

### `delete`

**DELETE** `/api/v1/agent/hooks`

Delete a hook.

```typescript
client.agent.hooks.delete(data: AgentHooksDeleteRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentHooksDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentHooksDeleteRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentHooksDeleteResponse`

**CLI:** `hoody agent hooks delete`

---

### `disable`

**POST** `/api/v1/agent/hooks/toggle`

Toggle a hook.

```typescript
client.agent.hooks.disable(data: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent hooks disable`

---

### `disableAll`

**POST** `/api/v1/agent/hooks/disable-all`

Disable all hooks.

```typescript
client.agent.hooks.disableAll(data: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent hooks disable`

---

### `enable`

**POST** `/api/v1/agent/hooks/toggle`

Toggle a hook.

```typescript
client.agent.hooks.enable(data: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent hooks enable`

---

### `enableAll`

**POST** `/api/v1/agent/hooks/disable-all`

Resume hooks: clear the hook suspension in the selected scope. Hooks stay suspended when another settings layer still sets it.

```typescript
client.agent.hooks.enableAll(data: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent hooks enable`

---

### `getRules`

**GET** `/api/v1/agent/hooks/rules`

Get the tool-call rules.

```typescript
client.agent.hooks.getRules(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentHooksGetRulesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentHooksGetRulesResponse`

**CLI:** `hoody agent hooks rules get`

---

### `list`

**GET** `/api/v1/agent/hooks`

List hooks.

```typescript
client.agent.hooks.list(options: { session_id: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentHooksListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `session_id` | `string` | Yes | query | Live session id (hooks are session-scoped). Without one the call is refused. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentHooksListResponse`

**CLI:** `hoody agent hooks list`

---

### `reload`

**POST** `/api/v1/agent/hooks/reload`

Reload hooks from disk.

```typescript
client.agent.hooks.reload(data?: AgentHooksReloadRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentHooksReloadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentHooksReloadRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentHooksReloadResponse`

**CLI:** `hoody agent hooks reload`

---

### `run`

**POST** `/api/v1/agent/hooks/test`

Run hooks now. With `command` it executes that unsaved command inline; without it, it executes the saved hooks matching `event` and `match_value`. This executes commands; use `hooks.test` to dry-run a shipped hook.

```typescript
client.agent.hooks.run(data: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent hooks run`

---

### `setRules`

**POST** `/api/v1/agent/hooks/rules`

Set the tool-call rules.

```typescript
client.agent.hooks.setRules(data: AgentHooksSetRulesRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentHooksSetRulesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentHooksSetRulesRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentHooksSetRulesResponse`

**CLI:** `hoody agent hooks rules set`

---

### `test`

**POST** `/api/v1/agent/hooks/test`

Dry-run a shipped hook, chosen by `shipped_id`. Nothing is executed.

```typescript
client.agent.hooks.test(data: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent hooks test`

---

### `trust`

**POST** `/api/v1/agent/hooks/trust/ack`

Acknowledge hook trust.

```typescript
client.agent.hooks.trust(data: AgentHooksTrustRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentHooksTrustResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentHooksTrustRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentHooksTrustResponse`

**CLI:** `hoody agent hooks trust`

---

### `upsert`

**PUT** `/api/v1/agent/hooks`

Upsert a hook.

```typescript
client.agent.hooks.upsert(data: AgentHooksUpsertRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentHooksUpsertResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentHooksUpsertRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentHooksUpsertResponse`

**CLI:** `hoody agent hooks upsert`

---

## `client.agent.jev` (6 methods)

### `decide`

**POST** `/api/v1/agent/jev/decide`

Ask Jev to decide.

```typescript
client.agent.jev.decide(data: AgentJevDecideRequest, options?: { cwd?: string; configDir?: string }): Promise<AgentJevDecideResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentJevDecideRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentJevDecideResponse`

---

### `decideForSession`

**POST** `/api/v1/agent/sessions/{id}/jev/decide`

Ask Jev to decide on behalf of a session.

```typescript
client.agent.jev.decideForSession(id: string, data: AgentJevDecideForSessionRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentJevDecideForSessionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentJevDecideForSessionRequest` | Yes | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentJevDecideForSessionResponse`

---

### `getSettings`

**GET** `/api/v1/agent/jev/settings`

Read the Jev settings.

```typescript
client.agent.jev.getSettings(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentJevGetSettingsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentJevGetSettingsResponse`

**CLI:** `hoody agent jev settings get`

---

### `listModels`

**GET** `/api/v1/agent/jev/models`

List the models Jev can use.

```typescript
client.agent.jev.listModels(options?: { cwd?: string; configDir?: string }): Promise<AgentJevListModelsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentJevListModelsResponse`

**CLI:** `hoody agent jev models list`

---

### `test`

**POST** `/api/v1/agent/jev/test`

Test Jev with one tiny decision.

```typescript
client.agent.jev.test(data?: AgentJevTestRequest, options?: { cwd?: string; configDir?: string }): Promise<AgentJevTestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentJevTestRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentJevTestResponse`

**CLI:** `hoody agent jev test`

---

### `updateSettings`

**PUT** `/api/v1/agent/jev/settings`

Change the Jev settings.

```typescript
client.agent.jev.updateSettings(data?: AgentJevUpdateSettingsRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentJevUpdateSettingsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentJevUpdateSettingsRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentJevUpdateSettingsResponse`

**CLI:** `hoody agent jev settings update`

---

## `client.agent.jobs` (3 methods)

### `delete`

**DELETE** `/api/v1/agent/jobs/{id}`

Cancel a pending/running job, or delete a finished record.

```typescript
client.agent.jobs.delete(id: string): Promise<AgentJobsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The job id. |

**Returns:** `AgentJobsDeleteResponse`

**CLI:** `hoody agent jobs delete`

---

### `get`

**GET** `/api/v1/agent/jobs/{id}`

Get an async job's status.

```typescript
client.agent.jobs.get(id: string): Promise<AgentJobsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The job id. |

**Returns:** `AgentJobsGetResponse`

**CLI:** `hoody agent jobs get`

---

### `getResult`

**GET** `/api/v1/agent/jobs/{id}/result`

Get an async job's result.

```typescript
client.agent.jobs.getResult(id: string): Promise<AgentJobsGetResultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The job id. |

**Returns:** `AgentJobsGetResultResponse`

**CLI:** `hoody agent jobs result get`

---

## `client.agent.kit` (3 methods)

### `getHealth`

**GET** `/api/v1/agent/health`

Standardized health check.

```typescript
client.agent.kit.getHealth(): Promise<AgentKitGetHealthResponse>
```

**Returns:** `AgentKitGetHealthResponse`

**CLI:** `hoody agent health`

---

### `getMetrics`

**GET** `/api/v1/agent/metrics`

Prometheus metrics.

```typescript
client.agent.kit.getMetrics(): Promise<ApiResponse<string>>
```

**Returns:** `ApiResponse<string>`

**CLI:** `hoody agent metrics`

---

### `getVersion`

**GET** `/api/v1/agent/version`

Agent API version and capabilities.

```typescript
client.agent.kit.getVersion(): Promise<AgentKitGetVersionResponse>
```

**Returns:** `AgentKitGetVersionResponse`

**CLI:** `hoody agent version`

---

## `client.agent.logs` (6 methods)

### `export`

**GET** `/api/v1/agent/logs/export`

Export logs as a downloadable file.

```typescript
client.agent.logs.export(options?: { source?: string; min_level?: string; comp?: string; session_id?: string; text?: string; since?: string; until?: string; event?: string; tool?: string; model?: string; status?: string; method?: string; min_status?: number; max_status?: number; errors_only?: boolean; event_type?: string; resource_type?: string; computer?: string; kind?: string; host?: string; since_seq?: number; limit?: number; format?: string; filename?: string; cwd?: string; configDir?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source` | `string` | No | query | Log source to export (see GET /api/v1/agent/logs/sources; one local source, one platform source, or omitted for all local sources). |
| `min_level` | `string` | No | query | Minimum log level (debug\|info\|warn\|error). |
| `comp` | `string` | No | query | Component filter (daemon source). |
| `session_id` | `string` | No | query | Session id filter. |
| `text` | `string` | No | query | Case-insensitive substring filter over message+attrs. |
| `since` | `string` | No | query | Lower time bound (RFC3339 or relative like 1h/7d). |
| `until` | `string` | No | query | Upper time bound (RFC3339 or relative). |
| `event` | `string` | No | query | Session lifecycle event filter (session source). |
| `tool` | `string` | No | query | Tool name filter (tool source). |
| `model` | `string` | No | query | Model filter (llm source). |
| `status` | `string` | No | query | Tool outcome filter: ok\|error\|cancelled (tool source). |
| `method` | `string` | No | query | HTTP method filter (activity source). |
| `min_status` | `number` | No | query | Minimum HTTP status (activity source). |
| `max_status` | `number` | No | query | Maximum HTTP status (activity source). |
| `errors_only` | `boolean` | No | query | Only error rows (activity source; true/false). |
| `event_type` | `string` | No | query | Event type filter (events source). |
| `resource_type` | `string` | No | query | Resource type filter (events source). |
| `computer` | `string` | No | query | Computer filter (proxy source; empty = all running realm computers). Maps to the daemon's computer_id filter. |
| `kind` | `string` | No | query | Proxy row kind: request\|response\|event (proxy source). |
| `host` | `string` | No | query | Proxy URL host filter (exact or dot-aligned suffix). |
| `since_seq` | `number` | No | query | Exclusive lower seq bound for incremental exports (local sources). |
| `limit` | `number` | No | query | TOTAL row cap across the export (local sources default: everything the snapshot matches). A platform source exports one query page: it asks for this many rows (2000 when omitted) and gets at most the source's own page maximum (activity 100, events 500); proxy with no computer merges the running computers' pages up to this cap. |
| `format` | `string` | No | query | Export format: jsonl (default) or txt. |
| `filename` | `string` | No | query | Download filename override (reduced to a safe basename). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody agent logs export`

---

### `get`

**GET** `/api/v1/agent/logs/entries/{ref}`

Read a log entry.

```typescript
client.agent.logs.get(ref: string, options?: { cwd?: string; configDir?: string }): Promise<AgentLogsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `ref` | `string` | Yes | path | The ref. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentLogsGetResponse`

**CLI:** `hoody agent logs get`

---

### `getStats`

**GET** `/api/v1/agent/logs/stats`

Log statistics.

```typescript
client.agent.logs.getStats(options?: { source?: string; level?: string; run_id?: string; bucket?: string; min_level?: string; comp?: string; session_id?: string; text?: string; since?: string; until?: string; event?: string; tool?: string; model?: string; status?: string; cwd?: string; configDir?: string }): Promise<AgentLogsGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source` | `string` | No | query | Count one local source (daemon\|tool\|session\|llm); omitted, every local source. A platform source is rejected 400. |
| `level` | `string` | No | query | Filter to a minimum log level (debug\|info\|warn\|error); the same filter as min_level. |
| `run_id` | `string` | No | query | Only entries correlated with this workflow/task run id. |
| `bucket` | `string` | No | query | Histogram step: minute (the default) or hour. |
| `min_level` | `string` | No | query | Minimum log level (debug\|info\|warn\|error). |
| `comp` | `string` | No | query | Component filter (daemon source). |
| `session_id` | `string` | No | query | Session id filter. |
| `text` | `string` | No | query | Case-insensitive substring filter over message+attrs. |
| `since` | `string` | No | query | Lower time bound (RFC3339 or relative like 1h/7d). |
| `until` | `string` | No | query | Upper time bound (RFC3339 or relative). |
| `event` | `string` | No | query | Session lifecycle event filter (session source). |
| `tool` | `string` | No | query | Tool name filter (tool source). |
| `model` | `string` | No | query | Model filter (llm source). |
| `status` | `string` | No | query | Tool outcome filter: ok\|error\|cancelled (tool source). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentLogsGetStatsResponse`

**CLI:** `hoody agent logs stats`

---

### `list`

**GET** `/api/v1/agent/logs`

Query logs.

```typescript
client.agent.logs.list(options?: { source?: string; level?: string; session_id?: string; run_id?: string; since?: string; until?: string; since_seq?: number; before_seq?: number; limit?: number; min_level?: string; comp?: string; text?: string; event?: string; tool?: string; model?: string; status?: string; method?: string; min_status?: number; max_status?: number; errors_only?: boolean; event_type?: string; resource_type?: string; computer?: string; kind?: string; host?: string; cwd?: string; configDir?: string }): Promise<AgentLogsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source` | `string` | No | query | Filter to a log source/facet (see GET /api/v1/agent/logs/sources). One local source, or exactly ONE platform source (activity\|events\|proxy); mixing them is rejected. |
| `level` | `string` | No | query | Filter to a minimum log level (debug\|info\|warn\|error); the same filter as min_level. |
| `session_id` | `string` | No | query | Only entries correlated with this session id (exact match on the entry's session_id). |
| `run_id` | `string` | No | query | Only entries correlated with this workflow/task run id (exact match on the entry's run_id). |
| `since` | `string` | No | query | Lower TIME bound: RFC3339, or a relative duration like "1h"/"30m"/"7d". This is NOT a cursor: a bare non-zero number is rejected 400 (use since_seq); 0, +0 and -0 mean now. Unparseable values are rejected the same way. |
| `until` | `string` | No | query | Upper TIME bound, same forms as since. Paging BACKWARDS by repeatedly lowering until works, but it is coarse (rows sharing a timestamp repeat); before_seq is the exact backwards cursor. |
| `since_seq` | `number` | No | query | Forward cursor: return only entries NEWER than this gateway seq. A page holds the NEWEST matches up to limit: when more than limit rows matched since the cursor, the older ones are not returned and latest_seq moves past them. To follow the log use GET /api/v1/agent/logs/stream (it resumes from since_seq, oldest first, and sends a `lagged` event with `replay_gap` when entries were evicted before it could read them: reconcile from the `min_seq` it carries); to read history, page backwards with before_seq. A non-numeric value is rejected 400. |
| `before_seq` | `number` | No | query | Backward cursor: return only entries OLDER than this seq. Take it from the SEQ OF THE OLDEST ENTRY THIS PAGE RETURNED, not from oldest_seq, which is the oldest sequence still retained in the ring and is usually far older than the page you just read. Paging back from oldest_seq jumps past every entry in between and returns an empty page, which reads as "history exhausted" when it is not. A non-numeric value is rejected 400. |
| `limit` | `number` | No | query | Caps this page. Local sources: omitted it is 200; ANY explicit value is clamped to the ring maximum of 500, and limit=0 means 500 rather than 200: a caller that needs more than 500 rows pages backwards with before_seq. activity takes at most 100 (default 50) and events at most 500 (default 100). A non-numeric value is rejected 400. |
| `min_level` | `string` | No | query | Minimum log level (debug\|info\|warn\|error). |
| `comp` | `string` | No | query | Component filter (daemon source). |
| `text` | `string` | No | query | Case-insensitive substring filter over message+attrs. |
| `event` | `string` | No | query | Session lifecycle event filter (session source). |
| `tool` | `string` | No | query | Tool name filter (tool source). |
| `model` | `string` | No | query | Model filter (llm source). |
| `status` | `string` | No | query | Tool outcome filter: ok\|error\|cancelled (tool source). |
| `method` | `string` | No | query | HTTP method filter (activity source). |
| `min_status` | `number` | No | query | Minimum HTTP status (activity source). |
| `max_status` | `number` | No | query | Maximum HTTP status (activity source). |
| `errors_only` | `boolean` | No | query | Only error rows (activity source; true/false). |
| `event_type` | `string` | No | query | Event type filter (events source). |
| `resource_type` | `string` | No | query | Resource type filter (events source). |
| `computer` | `string` | No | query | Computer filter (proxy source; empty = all running realm computers). Maps to the daemon's computer_id filter. |
| `kind` | `string` | No | query | Proxy row kind: request\|response\|event (proxy source). |
| `host` | `string` | No | query | Proxy URL host filter (exact or dot-aligned suffix). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentLogsListResponse`

**CLI:** `hoody agent logs list`

---

### `listSources`

**GET** `/api/v1/agent/logs/sources`

Log sources.

```typescript
client.agent.logs.listSources(options?: { cwd?: string; configDir?: string }): Promise<AgentLogsListSourcesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentLogsListSourcesResponse`

**CLI:** `hoody agent logs sources list`

---

### `stream`

**GET** `/api/v1/agent/logs/stream`

Stream the log tail (SSE).

```typescript
client.agent.logs.stream(options?: { source?: string; level?: string; session_id?: string; run_id?: string; since_seq?: number; limit?: number; min_level?: string; comp?: string; text?: string; event?: string; tool?: string; model?: string; status?: string; cwd?: string; configDir?: string }): Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentLogsStreamFrames>>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source` | `string` | No | query | Filter the tail to one local source (daemon\|tool\|session\|llm). A platform source is rejected 400. |
| `level` | `string` | No | query | Filter to a minimum log level (debug\|info\|warn\|error); the same filter as min_level. |
| `session_id` | `string` | No | query | Only entries correlated with this session id. |
| `run_id` | `string` | No | query | Only entries correlated with this workflow/task run id. |
| `since_seq` | `number` | No | query | Initial resume cursor (the Last-Event-ID header overrides it). A non-numeric value is rejected 400. |
| `limit` | `number` | No | query | Caps each poll batch. A non-numeric value is rejected 400. |
| `min_level` | `string` | No | query | Minimum log level (debug\|info\|warn\|error). |
| `comp` | `string` | No | query | Component filter (daemon source). |
| `text` | `string` | No | query | Case-insensitive substring filter over message+attrs. |
| `event` | `string` | No | query | Session lifecycle event filter (session source). |
| `tool` | `string` | No | query | Tool name filter (tool source). |
| `model` | `string` | No | query | Model filter (llm source). |
| `status` | `string` | No | query | Tool outcome filter: ok\|error\|cancelled (tool source). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `IEventStream<Record<never, string>, ITypedStreamEvent<AgentLogsStreamFrames>>`

**CLI:** `hoody agent logs stream`

---

## `client.agent.loops` (7 methods)

### `create`

**POST** `/api/v1/agent/sessions/{id}/loops`

Create a loop.

```typescript
client.agent.loops.create(id: string, data: AgentLoopsCreateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentLoopsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentLoopsCreateRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentLoopsCreateResponse`

**CLI:** `hoody agent loops create`

---

### `delete`

**DELETE** `/api/v1/agent/sessions/{id}/loops/{loopId}`

Delete a loop.

```typescript
client.agent.loops.delete(id: string, loopId: string, data?: AgentLoopsDeleteRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentLoopsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `loopId` | `string` | Yes | path | The loop id. |
| `data` | `AgentLoopsDeleteRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentLoopsDeleteResponse`

**CLI:** `hoody agent loops delete`

---

### `list`

**GET** `/api/v1/agent/loops`

List loops across all sessions.

```typescript
client.agent.loops.list(options?: { agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<AgentLoopsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentLoopsListResponse`

**CLI:** `hoody agent loops list`

---

### `listAll`

**GET** `/api/v1/agent/loops`

List loops across all sessions. (collect all pages)

```typescript
client.agent.loops.listAll(options?: { agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/loops`

List loops across all sessions. (async iterator)

```typescript
client.agent.loops.listIterator(options?: { agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `startRun`

**POST** `/api/v1/agent/sessions/{id}/loops/{loopId}/run-now`

Run a loop immediately.

```typescript
client.agent.loops.startRun(id: string, loopId: string, data?: AgentLoopsStartRunRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentLoopsStartRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `loopId` | `string` | Yes | path | The loop id. |
| `data` | `AgentLoopsStartRunRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentLoopsStartRunResponse`

**CLI:** `hoody agent loops runs start`

---

### `update`

**PATCH** `/api/v1/agent/sessions/{id}/loops/{loopId}`

Update a loop.

```typescript
client.agent.loops.update(id: string, loopId: string, data?: AgentLoopsUpdateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentLoopsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `loopId` | `string` | Yes | path | The loop id. |
| `data` | `AgentLoopsUpdateRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentLoopsUpdateResponse`

**CLI:** `hoody agent loops update`

---

## `client.agent.mcp` (10 methods)

### `createWriteIntent`

**POST** `/api/v1/agent/mcp/write-intents`

Begin an MCP config write.

```typescript
client.agent.mcp.createWriteIntent(data: AgentMcpCreateWriteIntentRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMcpCreateWriteIntentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpCreateWriteIntentRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMcpCreateWriteIntentResponse`

**CLI:** `hoody agent mcp writeintents create`

---

### `delete`

**DELETE** `/api/v1/agent/mcp/servers`

Delete an MCP server.

```typescript
client.agent.mcp.delete(data: AgentMcpDeleteRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMcpDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpDeleteRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMcpDeleteResponse`

**CLI:** `hoody agent mcp delete`

---

### `disable`

**POST** `/api/v1/agent/mcp/servers/enable`

Enable or disable an MCP server.

```typescript
client.agent.mcp.disable(data: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent mcp disable`

---

### `enable`

**POST** `/api/v1/agent/mcp/servers/enable`

Enable or disable an MCP server.

```typescript
client.agent.mcp.enable(data: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent mcp enable`

---

### `import`

**POST** `/api/v1/agent/mcp/import`

Import MCP servers from another tool's config.

```typescript
client.agent.mcp.import(data: AgentMcpImportRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMcpImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpImportRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMcpImportResponse`

**CLI:** `hoody agent mcp import`

---

### `list`

**GET** `/api/v1/agent/mcp/servers`

List configured MCP servers.

```typescript
client.agent.mcp.list(options: { session_id: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMcpListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `session_id` | `string` | Yes | query | Live session id (MCP config is resolved against the session's settings layers). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMcpListResponse`

**CLI:** `hoody agent mcp list`

---

### `previewImport`

**POST** `/api/v1/agent/mcp/parse`

Preview an MCP config import.

```typescript
client.agent.mcp.previewImport(data: AgentMcpPreviewImportRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMcpPreviewImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpPreviewImportRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMcpPreviewImportResponse`

**CLI:** `hoody agent mcp import`

---

### `reconnect`

**POST** `/api/v1/agent/mcp/reconnect`

Reload MCP config and reconnect.

```typescript
client.agent.mcp.reconnect(data: AgentMcpReconnectRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMcpReconnectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpReconnectRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMcpReconnectResponse`

**CLI:** `hoody agent mcp reconnect`

---

### `test`

**POST** `/api/v1/agent/mcp/probe`

Probe an MCP server without saving it.

```typescript
client.agent.mcp.test(data: AgentMcpTestRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpTestRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody agent mcp test`

---

### `upsert`

**PUT** `/api/v1/agent/mcp/servers`

Create or update an MCP server.

```typescript
client.agent.mcp.upsert(data: AgentMcpUpsertRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMcpUpsertResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpUpsertRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMcpUpsertResponse`

**CLI:** `hoody agent mcp upsert`

---

## `client.agent.memory` (14 methods)

### `claimDataHost`

**PUT** `/api/v1/agent/memory/datahost`

Assign this computer as the memory data host.

```typescript
client.agent.memory.claimDataHost(data: AgentMemoryClaimDataHostRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryClaimDataHostResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemoryClaimDataHostRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryClaimDataHostResponse`

**CLI:** `hoody agent memory datahost claim`

---

### `consolidate`

**POST** `/api/v1/agent/memory/consolidate`

Trigger a memory consolidation pass.

```typescript
client.agent.memory.consolidate(data: AgentMemoryConsolidateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryConsolidateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemoryConsolidateRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryConsolidateResponse`

**CLI:** `hoody agent memory consolidate`

---

### `createWriteIntent`

**POST** `/api/v1/agent/memory/write-intents`

Begin a guarded memory write (intent).

```typescript
client.agent.memory.createWriteIntent(data: AgentMemoryCreateWriteIntentRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryCreateWriteIntentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemoryCreateWriteIntentRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryCreateWriteIntentResponse`

**CLI:** `hoody agent memory writeintents create`

---

### `deleteProject`

**DELETE** `/api/v1/agent/memory/projects/{project}`

Erase a memory project.

```typescript
client.agent.memory.deleteProject(project: string, data: AgentMemoryDeleteProjectRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryDeleteProjectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | Yes | path | The project. |
| `data` | `AgentMemoryDeleteProjectRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryDeleteProjectResponse`

**CLI:** `hoody agent memory projects delete`

---

### `disable`

**PUT** `/api/v1/agent/memory/enabled`

Toggle memory capture.

```typescript
client.agent.memory.disable(data?: object, options?: { cwd?: string; configDir?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent memory disable`

---

### `enable`

**PUT** `/api/v1/agent/memory/enabled`

Toggle memory capture.

```typescript
client.agent.memory.enable(data?: object, options?: { cwd?: string; configDir?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent memory enable`

---

### `flush`

**POST** `/api/v1/agent/memory/flush`

Flush the memory store.

```typescript
client.agent.memory.flush(data?: AgentMemoryFlushRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryFlushResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemoryFlushRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryFlushResponse`

**CLI:** `hoody agent memory flush`

---

### `getDataHost`

**GET** `/api/v1/agent/memory/datahost`

Read the realm's memory data host.

```typescript
client.agent.memory.getDataHost(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryGetDataHostResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryGetDataHostResponse`

**CLI:** `hoody agent memory datahost get`

---

### `getGraph`

**GET** `/api/v1/agent/memory/graph`

Read a project's memory relation graph.

```typescript
client.agent.memory.getGraph(options?: { project?: string; node_type?: string; limit?: number; offset?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryGetGraphResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key whose graph to read. |
| `node_type` | `string` | No | query | Optional node-type filter. |
| `limit` | `number` | No | query | Maximum nodes/edges to return. |
| `offset` | `number` | No | query | Pagination offset into the graph. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryGetGraphResponse`

**CLI:** `hoody agent memory graph get`

---

### `getStatus`

**GET** `/api/v1/agent/memory/status`

Read memory subsystem status.

```typescript
client.agent.memory.getStatus(options?: { project?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key to report per-project counts, embedding coverage and last-consolidation for. Omitted: only the whole-store totals are returned. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryGetStatusResponse`

**CLI:** `hoody agent memory status`

---

### `listProjects`

**GET** `/api/v1/agent/memory/projects`

List memory projects.

```typescript
client.agent.memory.listProjects(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryListProjectsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryListProjectsResponse`

**CLI:** `hoody agent memory projects list`

---

### `listProjectsAll`

**GET** `/api/v1/agent/memory/projects`

List memory projects. (collect all pages)

```typescript
client.agent.memory.listProjectsAll(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listProjectsIterator`

**GET** `/api/v1/agent/memory/projects`

List memory projects. (async iterator)

```typescript
client.agent.memory.listProjectsIterator(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `search`

**POST** `/api/v1/agent/memory/search`

Search memory (hybrid recall).

```typescript
client.agent.memory.search(data?: AgentMemorySearchRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemorySearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemorySearchRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemorySearchResponse`

**CLI:** `hoody agent memory search`

---

## `client.agent.memory.items` (7 methods)

### `create`

**POST** `/api/v1/agent/memory/items`

Save a memory item.

```typescript
client.agent.memory.items.create(data: AgentMemoryItemsCreateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryItemsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemoryItemsCreateRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryItemsCreateResponse`

**CLI:** `hoody agent memory items create`

---

### `delete`

**DELETE** `/api/v1/agent/memory/items`

Delete a memory item.

```typescript
client.agent.memory.items.delete(data?: AgentMemoryItemsDeleteRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryItemsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemoryItemsDeleteRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryItemsDeleteResponse`

**CLI:** `hoody agent memory items delete`

---

### `get`

**GET** `/api/v1/agent/memory/items/{id}`

Read a memory item.

```typescript
client.agent.memory.items.get(id: string, options?: { project?: string; kind?: "memory" | "lesson" | "slot" | "observation"; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryItemsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The item id. |
| `project` | `string` | No | query | Project key the memory belongs to. |
| `kind` | `"memory" \| "lesson" \| "slot" \| "observation"` | No | query | The store the record lives in: memory (the default), lesson, slot or observation. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryItemsGetResponse`

**CLI:** `hoody agent memory items get`

---

### `list`

**GET** `/api/v1/agent/memory/items`

List memory items.

```typescript
client.agent.memory.items.list(options?: { project?: string; kind?: "memory" | "lesson" | "slot" | "observation"; type?: string; query?: string; page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryItemsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key to scope the listing to. |
| `kind` | `"memory" \| "lesson" \| "slot" \| "observation"` | No | query | The store to list: memory (the default), lesson, slot or observation. Each answers its own row shape (see items). |
| `type` | `string` | No | query | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY: rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | No | query | Free-text filter over the records. kind=memory ONLY: rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | No | query | 1-based page number. |
| `limit` | `number` | No | query | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination": the daemon never returns an unbounded set. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryItemsListResponse`

**CLI:** `hoody agent memory items list`

---

### `listAll`

**GET** `/api/v1/agent/memory/items`

List memory items. (collect all pages)

```typescript
client.agent.memory.items.listAll(options?: { project?: string; kind?: "memory" | "lesson" | "slot" | "observation"; type?: string; query?: string; page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key to scope the listing to. |
| `kind` | `"memory" \| "lesson" \| "slot" \| "observation"` | No | query | The store to list: memory (the default), lesson, slot or observation. Each answers its own row shape (see items). |
| `type` | `string` | No | query | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY: rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | No | query | Free-text filter over the records. kind=memory ONLY: rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | No | query | 1-based page number. |
| `limit` | `number` | No | query | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination": the daemon never returns an unbounded set. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/memory/items`

List memory items. (async iterator)

```typescript
client.agent.memory.items.listIterator(options?: { project?: string; kind?: "memory" | "lesson" | "slot" | "observation"; type?: string; query?: string; page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key to scope the listing to. |
| `kind` | `"memory" \| "lesson" \| "slot" \| "observation"` | No | query | The store to list: memory (the default), lesson, slot or observation. Each answers its own row shape (see items). |
| `type` | `string` | No | query | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY: rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | No | query | Free-text filter over the records. kind=memory ONLY: rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | No | query | 1-based page number. |
| `limit` | `number` | No | query | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination": the daemon never returns an unbounded set. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `update`

**PATCH** `/api/v1/agent/memory/items/{id}`

Edit a memory item.

```typescript
client.agent.memory.items.update(id: string, data?: AgentMemoryItemsUpdateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentMemoryItemsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The item id. |
| `data` | `AgentMemoryItemsUpdateRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentMemoryItemsUpdateResponse`

**CLI:** `hoody agent memory items update`

---

## `client.agent.models` (4 methods)

### `get`

**GET** `/api/v1/agent/models/{spec}`

Get a model by spec.

```typescript
client.agent.models.get(spec: string, options?: { cwd?: string; configDir?: string }): Promise<AgentModelsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `spec` | `string` | Yes | path | The spec. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentModelsGetResponse`

**CLI:** `hoody agent models get`

---

### `list`

**GET** `/api/v1/agent/models`

List models.

```typescript
client.agent.models.list(options?: { ready?: boolean; provider?: string; page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<AgentModelsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `ready` | `boolean` | No | query | When true, list only the models that can run now: the provider is ready (see GET /api/v1/agent/providers status), an OpenAI model used through the ChatGPT sign-in is one that sign-in serves, and a fusion composite appears only when every member qualifies. Any value other than true or false returns 400 bad_request. |
| `provider` | `string` | No | query | List only this provider's models (its id). fusion lists only the fusion composites. An id that matches no provider returns an empty list. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentModelsListResponse`

**CLI:** `hoody agent models list`

---

### `listAll`

**GET** `/api/v1/agent/models`

List models. (collect all pages)

```typescript
client.agent.models.listAll(options?: { ready?: boolean; provider?: string; page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `ready` | `boolean` | No | query | When true, list only the models that can run now: the provider is ready (see GET /api/v1/agent/providers status), an OpenAI model used through the ChatGPT sign-in is one that sign-in serves, and a fusion composite appears only when every member qualifies. Any value other than true or false returns 400 bad_request. |
| `provider` | `string` | No | query | List only this provider's models (its id). fusion lists only the fusion composites. An id that matches no provider returns an empty list. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/models`

List models. (async iterator)

```typescript
client.agent.models.listIterator(options?: { ready?: boolean; provider?: string; page?: number; limit?: number; cwd?: string; configDir?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `ready` | `boolean` | No | query | When true, list only the models that can run now: the provider is ready (see GET /api/v1/agent/providers status), an OpenAI model used through the ChatGPT sign-in is one that sign-in serves, and a fusion composite appears only when every member qualifies. Any value other than true or false returns 400 bad_request. |
| `provider` | `string` | No | query | List only this provider's models (its id). fusion lists only the fusion composites. An id that matches no provider returns an empty list. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.agent.providers` (9 methods)

### `create`

**POST** `/api/v1/agent/providers`

Create a custom provider.

```typescript
client.agent.providers.create(data: AgentProvidersCreateRequest, options?: { idempotencyKey?: string }): Promise<AgentProvidersCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentProvidersCreateRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Opaque retry key (1-255 printable ASCII, no whitespace). A retry with the same key and body answers 201 with the provider the first try created; the same key with another body is 422 idempotency_key_reused. Keys are remembered for 24 hours, until the agent restarts. |

**Returns:** `AgentProvidersCreateResponse`

**CLI:** `hoody agent providers create`

---

### `delete`

**DELETE** `/api/v1/agent/providers/{id}`

Delete a custom provider.

```typescript
client.agent.providers.delete(id: string): Promise<AgentProvidersDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |

**Returns:** `AgentProvidersDeleteResponse`

**CLI:** `hoody agent providers delete`

---

### `deleteApiKey`

**DELETE** `/api/v1/agent/providers/{id}/auth/api-key`

Delete a provider API key.

```typescript
client.agent.providers.deleteApiKey(id: string): Promise<AgentProvidersDeleteApiKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |

**Returns:** `AgentProvidersDeleteApiKeyResponse`

**CLI:** `hoody agent providers apikey delete`

---

### `get`

**GET** `/api/v1/agent/providers/{id}`

Get a provider.

```typescript
client.agent.providers.get(id: string): Promise<AgentProvidersGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |

**Returns:** `AgentProvidersGetResponse`

**CLI:** `hoody agent providers get`

---

### `list`

**GET** `/api/v1/agent/providers`

List LLM providers.

```typescript
client.agent.providers.list(options?: { page?: number; limit?: number }): Promise<AgentProvidersListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |

**Returns:** `AgentProvidersListResponse`

**CLI:** `hoody agent providers list`

---

### `listAll`

**GET** `/api/v1/agent/providers`

List LLM providers. (collect all pages)

```typescript
client.agent.providers.listAll(options?: { page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/providers`

List LLM providers. (async iterator)

```typescript
client.agent.providers.listIterator(options?: { page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `setApiKey`

**PUT** `/api/v1/agent/providers/{id}/auth/api-key`

Store a provider API key.

```typescript
client.agent.providers.setApiKey(id: string, data: AgentProvidersSetApiKeyRequest): Promise<AgentProvidersSetApiKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `data` | `AgentProvidersSetApiKeyRequest` | Yes | body |  |

**Returns:** `AgentProvidersSetApiKeyResponse`

**CLI:** `hoody agent providers apikey set`

---

### `update`

**PATCH** `/api/v1/agent/providers/{id}`

Change a custom provider.

```typescript
client.agent.providers.update(id: string, data?: AgentProvidersUpdateRequest): Promise<AgentProvidersUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `data` | `AgentProvidersUpdateRequest` | No | body |  |

**Returns:** `AgentProvidersUpdateResponse`

**CLI:** `hoody agent providers update`

---

## `client.agent.providers.accounts` (6 methods)

### `add`

**POST** `/api/v1/agent/providers/{id}/auth/accounts`

Add an OAuth account to a provider's pool.

```typescript
client.agent.providers.accounts.add(id: string, data?: AgentProvidersAccountsAddRequest, options?: { idempotencyKey?: string }): Promise<AgentProvidersAccountsAddResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `data` | `AgentProvidersAccountsAddRequest` | No | body |  |
| `idempotencyKey` | `string` | No | header | Opaque retry key (1-255 printable ASCII, no whitespace), minted once per click. A retry with the same key answers the job the first try started, whatever its state, for as long as the agent keeps that job (15 minutes after its last activity, until the agent restarts). |

**Returns:** `AgentProvidersAccountsAddResponse`

**CLI:** `hoody agent providers accounts add`

---

### `list`

**GET** `/api/v1/agent/providers/{id}/auth/accounts`

List a provider's OAuth account pool.

```typescript
client.agent.providers.accounts.list(id: string, options?: { page?: number; limit?: number }): Promise<AgentProvidersAccountsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |

**Returns:** `AgentProvidersAccountsListResponse`

**CLI:** `hoody agent providers accounts list`

---

### `listAll`

**GET** `/api/v1/agent/providers/{id}/auth/accounts`

List a provider's OAuth account pool. (collect all pages)

```typescript
client.agent.providers.accounts.listAll(id: string, options?: { page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/providers/{id}/auth/accounts`

List a provider's OAuth account pool. (async iterator)

```typescript
client.agent.providers.accounts.listIterator(id: string, options?: { page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `remove`

**DELETE** `/api/v1/agent/providers/{id}/auth/accounts/{key}`

Remove a pooled OAuth account.

```typescript
client.agent.providers.accounts.remove(id: string, key: string): Promise<AgentProvidersAccountsRemoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `key` | `string` | Yes | path | The key. |

**Returns:** `AgentProvidersAccountsRemoveResponse`

**CLI:** `hoody agent providers accounts remove`

---

### `use`

**PUT** `/api/v1/agent/providers/{id}/auth/accounts/{key}/active`

Make a pooled OAuth account active.

```typescript
client.agent.providers.accounts.use(id: string, key: string, data?: AgentProvidersAccountsUseRequest): Promise<AgentProvidersAccountsUseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `key` | `string` | Yes | path | The key. |
| `data` | `AgentProvidersAccountsUseRequest` | No | body |  |

**Returns:** `AgentProvidersAccountsUseResponse`

**CLI:** `hoody agent providers accounts use`

---

## `client.agent.providers.auth` (3 methods)

### `getStatus`

**GET** `/api/v1/agent/providers/{id}/auth`

Get a provider's auth status.

```typescript
client.agent.providers.auth.getStatus(id: string): Promise<AgentProvidersAuthGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |

**Returns:** `AgentProvidersAuthGetStatusResponse`

**CLI:** `hoody agent providers auth status`

---

### `setDefault`

**PUT** `/api/v1/agent/providers/{id}/auth/default`

Set a provider's default credential method.

```typescript
client.agent.providers.auth.setDefault(id: string, data: AgentProvidersAuthSetDefaultRequest): Promise<AgentProvidersAuthSetDefaultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `data` | `AgentProvidersAuthSetDefaultRequest` | Yes | body |  |

**Returns:** `AgentProvidersAuthSetDefaultResponse`

**CLI:** `hoody agent providers auth default set`

---

### `test`

**POST** `/api/v1/agent/providers/{id}/auth/test`

Try a provider's stored API key.

```typescript
client.agent.providers.auth.test(id: string): Promise<AgentProvidersAuthTestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |

**Returns:** `AgentProvidersAuthTestResponse`

---

## `client.agent.providers.oauth` (5 methods)

### `cancel`

**DELETE** `/api/v1/agent/providers/{id}/auth/oauth/{job}`

Cancel a provider OAuth login.

```typescript
client.agent.providers.oauth.cancel(id: string, job: string): Promise<AgentProvidersOauthCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `job` | `string` | Yes | path | The job. |

**Returns:** `AgentProvidersOauthCancelResponse`

---

### `logout`

**DELETE** `/api/v1/agent/providers/{id}/auth/oauth`

Remove a provider's OAuth login.

```typescript
client.agent.providers.oauth.logout(id: string): Promise<AgentProvidersOauthLogoutResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |

**Returns:** `AgentProvidersOauthLogoutResponse`

**CLI:** `hoody agent providers oauth logout`

---

### `poll`

**GET** `/api/v1/agent/providers/{id}/auth/oauth/{job}`

Poll a provider OAuth login.

```typescript
client.agent.providers.oauth.poll(id: string, job: string): Promise<AgentProvidersOauthPollResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `job` | `string` | Yes | path | The job. |

**Returns:** `AgentProvidersOauthPollResponse`

**CLI:** `hoody agent providers oauth poll`

---

### `start`

**POST** `/api/v1/agent/providers/{id}/auth/oauth`

Start a provider OAuth login.

```typescript
client.agent.providers.oauth.start(id: string, data?: AgentProvidersOauthStartRequest, options?: { idempotencyKey?: string }): Promise<AgentProvidersOauthStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `data` | `AgentProvidersOauthStartRequest` | No | body |  |
| `idempotencyKey` | `string` | No | header | Opaque retry key (1-255 printable ASCII, no whitespace), minted once per click. A retry with the same key answers the job the first try started, whatever its state, for as long as the agent keeps that job (15 minutes after its last activity, until the agent restarts). |

**Returns:** `AgentProvidersOauthStartResponse`

**CLI:** `hoody agent providers oauth start`

---

### `submitCode`

**POST** `/api/v1/agent/providers/{id}/auth/oauth/{job}/code`

Submit a provider OAuth authorization code.

```typescript
client.agent.providers.oauth.submitCode(id: string, job: string, data: AgentProvidersOauthSubmitCodeRequest): Promise<AgentProvidersOauthSubmitCodeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `job` | `string` | Yes | path | The job. |
| `data` | `AgentProvidersOauthSubmitCodeRequest` | Yes | body |  |

**Returns:** `AgentProvidersOauthSubmitCodeResponse`

**CLI:** `hoody agent providers oauth code submit`

---

## `client.agent.realms` (4 methods)

### `list`

**GET** `/api/v1/agent/realms`

List realms (for binding).

```typescript
client.agent.realms.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<AgentRealmsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentRealmsListResponse`

**CLI:** `hoody agent realms list`

---

### `listAll`

**GET** `/api/v1/agent/realms`

List realms (for binding). (collect all pages)

```typescript
client.agent.realms.listAll(options?: { page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/realms`

List realms (for binding). (async iterator)

```typescript
client.agent.realms.listIterator(options?: { page?: number; limit?: number; cwd?: string; configDir?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `use`

**PUT** `/api/v1/agent/hoody/realm`

Switch the agent's active realm.

```typescript
client.agent.realms.use(data: AgentRealmsUseRequest): Promise<AgentRealmsUseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentRealmsUseRequest` | Yes | body |  |

**Returns:** `AgentRealmsUseResponse`

**CLI:** `hoody agent realms use`

---

## `client.agent.scripts` (2 methods)

### `deleteInstance`

**POST** `/api/v1/agent/script-instances/delete`

Delete a managed script.

```typescript
client.agent.scripts.deleteInstance(data: AgentScriptsDeleteInstanceRequest, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentScriptsDeleteInstanceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentScriptsDeleteInstanceRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Retry key, required. 1–255 printable ASCII, no whitespace. The same key with the same body returns the first answer with replayed true and does nothing again; the same key with another body is 422 idempotency_key_reused; while the first request still runs it is 409 in_progress. A key whose request was answered, or whose outcome is unknown, is remembered for 24 hours after its last answer or replay; a key whose request is still running is remembered until it ends. When many keys are held, the oldest answered keys are forgotten first; a key whose outcome is unknown is not. Every key is forgotten when the agent restarts. A retry of a remembered unknown outcome, and a request whose key is no longer remembered, are settled from the computer: the first answer comes back, with replayed true, only when the computer shows the request took effect. Otherwise the answer is 503 outcome_unknown, or a definite refusal such as 409 script_exists or path_reserved, because the computer now shows the path held by a script it cannot prove came from this request; that script may still be this request's own earlier effect. While too many keyed requests are unsettled, a new key is 429 idempotency_keys_exhausted and nothing is done. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentScriptsDeleteInstanceResponse`

---

### `listInstances`

**GET** `/api/v1/agent/script-instances`

List a computer's managed scripts.

```typescript
client.agent.scripts.listInstances(options: { computer_id: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentScriptsListInstancesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `computer_id` | `string` | Yes | query | The computer (24-hex computer id). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentScriptsListInstancesResponse`

---

## `client.agent.scripts.templates` (3 methods)

### `get`

**GET** `/api/v1/agent/script-templates/{name}`

Get one script template.

```typescript
client.agent.scripts.templates.get(name: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentScriptsTemplatesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentScriptsTemplatesGetResponse`

---

### `instantiate`

**POST** `/api/v1/agent/script-templates/{name}/instantiate`

Make a script from a template.

```typescript
client.agent.scripts.templates.instantiate(name: string, data: AgentScriptsTemplatesInstantiateRequest, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentScriptsTemplatesInstantiateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentScriptsTemplatesInstantiateRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Retry key, required. 1–255 printable ASCII, no whitespace. The same key with the same body returns the first answer with replayed true and does nothing again; the same key with another body is 422 idempotency_key_reused; while the first request still runs it is 409 in_progress. A key whose request was answered, or whose outcome is unknown, is remembered for 24 hours after its last answer or replay; a key whose request is still running is remembered until it ends. When many keys are held, the oldest answered keys are forgotten first; a key whose outcome is unknown is not. Every key is forgotten when the agent restarts. A retry of a remembered unknown outcome, and a request whose key is no longer remembered, are settled from the computer: the first answer comes back, with replayed true, only when the computer shows the request took effect. Otherwise the answer is 503 outcome_unknown, or a definite refusal such as 409 script_exists or path_reserved, because the computer now shows the path held by a script it cannot prove came from this request; that script may still be this request's own earlier effect. While too many keyed requests are unsettled, a new key is 429 idempotency_keys_exhausted and nothing is done. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentScriptsTemplatesInstantiateResponse`

---

### `list`

**GET** `/api/v1/agent/script-templates`

List script templates.

```typescript
client.agent.scripts.templates.list(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentScriptsTemplatesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentScriptsTemplatesListResponse`

---

## `client.agent.sessions` (40 methods)

### `close`

**POST** `/api/v1/agent/sessions/{id}/close`

Close the session (teardown).

```typescript
client.agent.sessions.close(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsCloseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsCloseResponse`

**CLI:** `hoody agent sessions close`

---

### `connect`

**GET** `/api/v1/agent/sessions/{id}/stream`

Attach to a session's event stream (WebSocket / SSE).

```typescript
client.agent.sessions.connect(id: string, options?: { since?: number; incarnation?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }, _templateVars?: object, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' }): Promise<AgentSessionsConnectWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `wsOptions` | `{ reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' \| 'ws' }` | No | path |  |
| `since` | `number` | No | query | Resume from this gateway int64 seq (also accepted as the Last-Event-ID header). |
| `incarnation` | `string` | No | query | The incarnation the since cursor belongs to (from a frame, replay_boundary, or GET /api/v1/agent/sessions/{id}). When it differs from the live session's, the cursor is treated as invalid: a replay_gap frame, then the full retained ring. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsConnectWebSocket`

**CLI:** `hoody agent sessions stream`

---

### `create`

**POST** `/api/v1/agent/sessions`

Create, fork, or attach a session.

```typescript
client.agent.sessions.create(data?: AgentSessionsCreateRequest, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSessionsCreateRequest` | No | body |  |
| `idempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key after the first try started a session re-joins that session (replayed true); a first try that never started one answers 409 creation_interrupted and the key cannot create again, so use a new key. The same key with a different request body is 422. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsCreateResponse`

**CLI:** `hoody agent sessions create`

---

### `delete`

**DELETE** `/api/v1/agent/sessions/{id}`

Close a session and hard-delete it: the persisted record is removed too, not only the live connection.

```typescript
client.agent.sessions.delete(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `any`

**CLI:** `hoody agent sessions delete`

---

### `disableHoodyEnv`

**PATCH** `/api/v1/agent/sessions/{id}/hoody-env`

Toggle Hoody shell-env injection.

```typescript
client.agent.sessions.disableHoodyEnv(id: string, data?: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent sessions hoodyenv disable`

---

### `disableYolo`

**PATCH** `/api/v1/agent/sessions/{id}/yolo`

Turn Allow everything on or off for this chat.

```typescript
client.agent.sessions.disableYolo(id: string, data?: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent sessions yolo disable`

---

### `enableHoodyEnv`

**PATCH** `/api/v1/agent/sessions/{id}/hoody-env`

Toggle Hoody shell-env injection.

```typescript
client.agent.sessions.enableHoodyEnv(id: string, data?: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent sessions hoodyenv enable`

---

### `enableYolo`

**PATCH** `/api/v1/agent/sessions/{id}/yolo`

Turn Allow everything on or off for this chat.

```typescript
client.agent.sessions.enableYolo(id: string, data?: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent sessions yolo enable`

---

### `get`

**GET** `/api/v1/agent/sessions/{id}`

Get a session summary.

```typescript
client.agent.sessions.get(id: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsGetResponse`

**CLI:** `hoody agent sessions get`

---

### `getCreateKey`

**GET** `/api/v1/agent/session-create-keys/{key}`

Read what a keyed session create became.

```typescript
client.agent.sessions.getCreateKey(key: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsGetCreateKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | The key. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsGetCreateKeyResponse`

**CLI:** `hoody agent sessions createkeys get`

---

### `getImage`

**GET** `/api/v1/agent/sessions/{id}/images/{image_id}`

Read an image attached to a session message.

```typescript
client.agent.sessions.getImage(id: string, image_id: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `image_id` | `string` | Yes | path | The image id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody agent sessions images get`

---

### `getSnapshot`

**GET** `/api/v1/agent/sessions/{id}/state`

Read a session's recoverable state.

```typescript
client.agent.sessions.getSnapshot(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsGetSnapshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsGetSnapshotResponse`

**CLI:** `hoody agent sessions snapshot get`

---

### `getTranscript`

**GET** `/api/v1/agent/sessions/{id}/transcript`

Read a session's transcript without attaching.

```typescript
client.agent.sessions.getTranscript(id: string, options?: { after_turn?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsGetTranscriptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `after_turn` | `number` | No | query | Exclusive completed-turn skip cursor: return content strictly after completed turn N (0 = full transcript; values past the end clamp; negative/non-integer = 400). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsGetTranscriptResponse`

**CLI:** `hoody agent sessions transcript get`

---

### `getUsage`

**GET** `/api/v1/agent/sessions/{id}/usage`

Read a session's per-call LLM usage.

```typescript
client.agent.sessions.getUsage(id: string, options?: { after_id?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsGetUsageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `after_id` | `number` | No | query | Exclusive cursor: return rows whose id is greater than this. Omit (or 0) to start from the session's first row. Negative or non-integer = 400. |
| `limit` | `number` | No | query | Return at most this many rows (1 to 5000, default 500). Out of range or non-integer = 400. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsGetUsageResponse`

**CLI:** `hoody agent sessions usage get`

---

### `getUsageAll`

**GET** `/api/v1/agent/sessions/{id}/usage`

Read a session's per-call LLM usage. (collect all pages)

```typescript
client.agent.sessions.getUsageAll(id: string, options?: { after_id?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `after_id` | `number` | No | query | Exclusive cursor: return rows whose id is greater than this. Omit (or 0) to start from the session's first row. Negative or non-integer = 400. |
| `limit` | `number` | No | query | Return at most this many rows (1 to 5000, default 500). Out of range or non-integer = 400. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `getUsageIterator`

**GET** `/api/v1/agent/sessions/{id}/usage`

Read a session's per-call LLM usage. (async iterator)

```typescript
client.agent.sessions.getUsageIterator(id: string, options?: { after_id?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `after_id` | `number` | No | query | Exclusive cursor: return rows whose id is greater than this. Omit (or 0) to start from the session's first row. Negative or non-integer = 400. |
| `limit` | `number` | No | query | Return at most this many rows (1 to 5000, default 500). Out of range or non-integer = 400. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `list`

**GET** `/api/v1/agent/sessions`

List sessions.

```typescript
client.agent.sessions.list(options?: { include_system?: boolean; order?: "started" | "last_active"; agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<AgentSessionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also include daemon-owned system/resident sessions in the listing. |
| `order` | `"started" \| "last_active"` | No | query | started (newest started first) or last_active (most recently active first). Omitted: started when limit is given, else last_active. Another value is 400 bad_request. |
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentSessionsListResponse`

**CLI:** `hoody agent sessions list`

---

### `listAll`

**GET** `/api/v1/agent/sessions`

List sessions. (collect all pages)

```typescript
client.agent.sessions.listAll(options?: { include_system?: boolean; order?: "started" | "last_active"; agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also include daemon-owned system/resident sessions in the listing. |
| `order` | `"started" \| "last_active"` | No | query | started (newest started first) or last_active (most recently active first). Omitted: started when limit is given, else last_active. Another value is 400 bad_request. |
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `unknown[]`

---

### `listApplicableRules`

**GET** `/api/v1/agent/sessions/{id}/rules/applies`

Which tool-call rules apply.

```typescript
client.agent.sessions.listApplicableRules(id: string, options?: { agent?: string; tool?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsListApplicableRulesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `agent` | `string` | No | query | Agent name to ask about (default: the session's own agent). |
| `tool` | `string` | No | query | Tool name to ask about (default: any tool). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsListApplicableRulesResponse`

**CLI:** `hoody agent sessions rules applicable list`

---

### `listDirectories`

**GET** `/api/v1/agent/sessions/cwds`

List distinct session working directories.

```typescript
client.agent.sessions.listDirectories(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsListDirectoriesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsListDirectoriesResponse`

**CLI:** `hoody agent sessions directories list`

---

### `listIterator`

**GET** `/api/v1/agent/sessions`

List sessions. (async iterator)

```typescript
client.agent.sessions.listIterator(options?: { include_system?: boolean; order?: "started" | "last_active"; agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also include daemon-owned system/resident sessions in the listing. |
| `order` | `"started" \| "last_active"` | No | query | started (newest started first) or last_active (most recently active first). Omitted: started when limit is given, else last_active. Another value is 400 bad_request. |
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listLoops`

**GET** `/api/v1/agent/sessions/{id}/loops`

List a session's loops.

```typescript
client.agent.sessions.listLoops(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsListLoopsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsListLoopsResponse`

**CLI:** `hoody agent sessions loops list`

---

### `listLoopsAll`

**GET** `/api/v1/agent/sessions/{id}/loops`

List a session's loops. (collect all pages)

```typescript
client.agent.sessions.listLoopsAll(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listLoopsIterator`

**GET** `/api/v1/agent/sessions/{id}/loops`

List a session's loops. (async iterator)

```typescript
client.agent.sessions.listLoopsIterator(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listShells`

**GET** `/api/v1/agent/sessions/{id}/bash-jobs`

List a session's background shells.

```typescript
client.agent.sessions.listShells(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsListShellsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsListShellsResponse`

**CLI:** `hoody agent sessions shells list`

---

### `listSlashCommands`

**GET** `/api/v1/agent/sessions/{id}/slash-commands`

List the slash commands a session's chat offers.

```typescript
client.agent.sessions.listSlashCommands(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsListSlashCommandsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsListSlashCommandsResponse`

**CLI:** `hoody agent sessions slashcommands list`

---

### `listSlashCommandsAll`

**GET** `/api/v1/agent/sessions/{id}/slash-commands`

List the slash commands a session's chat offers. (collect all pages)

```typescript
client.agent.sessions.listSlashCommandsAll(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listSlashCommandsIterator`

**GET** `/api/v1/agent/sessions/{id}/slash-commands`

List the slash commands a session's chat offers. (async iterator)

```typescript
client.agent.sessions.listSlashCommandsIterator(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `rename`

**PATCH** `/api/v1/agent/sessions/{id}`

Rename a session.

```typescript
client.agent.sessions.rename(id: string, data: AgentSessionsRenameRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsRenameResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsRenameRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsRenameResponse`

**CLI:** `hoody agent sessions rename`

---

### `replay`

**GET** `/api/v1/agent/sessions/{id}/replay`

Replay a live session's buffered events.

```typescript
client.agent.sessions.replay(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsReplayResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsReplayResponse`

**CLI:** `hoody agent sessions replay`

---

### `retireCreateKey`

**POST** `/api/v1/agent/session-create-keys/{key}/retire`

Retire a session create key no read found.

```typescript
client.agent.sessions.retireCreateKey(key: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsRetireCreateKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | The key. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsRetireCreateKeyResponse`

**CLI:** `hoody agent sessions createkeys retire`

---

### `setAfterCompaction`

**PUT** `/api/v1/agent/sessions/{id}/after-compaction`

Set the message re-added after every compaction.

```typescript
client.agent.sessions.setAfterCompaction(id: string, data: AgentSessionsSetAfterCompactionRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsSetAfterCompactionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetAfterCompactionRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsSetAfterCompactionResponse`

**CLI:** `hoody agent sessions aftercompaction set`

---

### `setAgent`

**PATCH** `/api/v1/agent/sessions/{id}/agent`

Switch the chat agent.

```typescript
client.agent.sessions.setAgent(id: string, data?: AgentSessionsSetAgentRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsSetAgentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetAgentRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsSetAgentResponse`

**CLI:** `hoody agent sessions agent set`

---

### `setEffort`

**PATCH** `/api/v1/agent/sessions/{id}/effort`

Set reasoning effort.

```typescript
client.agent.sessions.setEffort(id: string, data?: AgentSessionsSetEffortRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsSetEffortResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetEffortRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsSetEffortResponse`

**CLI:** `hoody agent sessions effort set`

---

### `setModel`

**PATCH** `/api/v1/agent/sessions/{id}/model`

Switch the session model.

```typescript
client.agent.sessions.setModel(id: string, data: AgentSessionsSetModelRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsSetModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetModelRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsSetModelResponse`

**CLI:** `hoody agent sessions model set`

---

### `setVerbosity`

**PATCH** `/api/v1/agent/sessions/{id}/verbosity`

Set response verbosity.

```typescript
client.agent.sessions.setVerbosity(id: string, data?: AgentSessionsSetVerbosityRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsSetVerbosityResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetVerbosityRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsSetVerbosityResponse`

**CLI:** `hoody agent sessions verbosity set`

---

### `startWorkflow`

**POST** `/api/v1/agent/sessions/{id}/workflows/{name}/runs`

Run a workflow onto an existing session.

```typescript
client.agent.sessions.startWorkflow(id: string, name: string, data?: AgentSessionsStartWorkflowRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsStartWorkflowResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentSessionsStartWorkflowRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsStartWorkflowResponse`

**CLI:** `hoody agent sessions workflows start`

---

### `stopShell`

**POST** `/api/v1/agent/sessions/{id}/bash-jobs/{job_id}/stop`

Stop one of a session's background shells.

```typescript
client.agent.sessions.stopShell(id: string, job_id: string, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsStopShellResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `job_id` | `string` | Yes | path | The job id. |
| `idempotencyKey` | `string` | No | header | Retry key, 1-255 printable ASCII without whitespace, minted once per stop: a retry with the same key answers the first call's outcome. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsStopShellResponse`

**CLI:** `hoody agent sessions shells stop`

---

### `streamMany`

**GET** `/api/v1/agent/sessions:events`

Watch up to 32 live sessions' events on one stream (SSE).

```typescript
client.agent.sessions.streamMany(options: { ids: string; since?: string; incarnation?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentSessionsStreamManyFrames>>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `ids` | `string` | Yes | query | Comma list of 1 to 32 distinct session ids. Required. |
| `since` | `string` | No | query | Comma list of &lt;session id&gt;:&lt;seq&gt;, the last gateway seq applied per session; ids not listed start from their whole retained ring. |
| `incarnation` | `string` | No | query | Comma list of &lt;session id&gt;:&lt;incarnation&gt;, the incarnation each since cursor belongs to; a session whose incarnation differs gets replay_gap and its full retained ring. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `IEventStream<Record<never, string>, ITypedStreamEvent<AgentSessionsStreamManyFrames>>`

**CLI:** `hoody agent sessions batch stream`

---

### `trim`

**POST** `/api/v1/agent/sessions/{id}/trim`

Trim session history to a turn index.

```typescript
client.agent.sessions.trim(id: string, data?: AgentSessionsTrimRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsTrimResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsTrimRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsTrimResponse`

**CLI:** `hoody agent sessions trim`

---

## `client.agent.sessions.approval` (4 methods)

### `deleteRule`

**DELETE** `/api/v1/agent/sessions/{id}/approval/rules/{tool}`

Remove one session permission rule.

```typescript
client.agent.sessions.approval.deleteRule(id: string, tool: string, options?: { ifMatch?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsApprovalDeleteRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `tool` | `string` | Yes | path | The tool. |
| `ifMatch` | `string` | No | header | Conditional-request precondition: the ETag from GET /api/v1/agent/sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsApprovalDeleteRuleResponse`

**CLI:** `hoody agent sessions approval rules delete`

---

### `get`

**GET** `/api/v1/agent/sessions/{id}/approval`

Read a session's approval policy.

```typescript
client.agent.sessions.approval.get(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsApprovalGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsApprovalGetResponse`

**CLI:** `hoody agent sessions approval get`

---

### `setRule`

**PUT** `/api/v1/agent/sessions/{id}/approval/rules/{tool}`

Set one session permission rule.

```typescript
client.agent.sessions.approval.setRule(id: string, tool: string, data: AgentSessionsApprovalSetRuleRequest, options?: { ifMatch?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsApprovalSetRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `tool` | `string` | Yes | path | The tool. |
| `data` | `AgentSessionsApprovalSetRuleRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | Conditional-request precondition: the ETag from GET /api/v1/agent/sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsApprovalSetRuleResponse`

**CLI:** `hoody agent sessions approval rules set`

---

### `update`

**PUT** `/api/v1/agent/sessions/{id}/approval`

Set a session's approval mode and lock.

```typescript
client.agent.sessions.approval.update(id: string, data?: AgentSessionsApprovalUpdateRequest, options?: { ifMatch?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsApprovalUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsApprovalUpdateRequest` | No | body |  |
| `ifMatch` | `string` | No | header | Conditional-request precondition: the ETag from GET /api/v1/agent/sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsApprovalUpdateResponse`

**CLI:** `hoody agent sessions approval update`

---

## `client.agent.sessions.approverLease` (3 methods)

### `claim`

**POST** `/api/v1/agent/sessions/{id}/approver-lease`

Acquire the right to answer this session's gates.

```typescript
client.agent.sessions.approverLease.claim(id: string, data: AgentSessionsApproverLeaseClaimRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsApproverLeaseClaimResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsApproverLeaseClaimRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsApproverLeaseClaimResponse`

**CLI:** `hoody agent sessions approverlease claim`

---

### `release`

**DELETE** `/api/v1/agent/sessions/{id}/approver-lease`

Release the approver lease.

```typescript
client.agent.sessions.approverLease.release(id: string, options?: { approverLease?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsApproverLeaseReleaseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `approverLease` | `string` | No | header | The approver-lease capability returned by POST /api/v1/agent/sessions/{id}/approver-lease. Required on every decision (/api/v1/agent/sessions/{id}/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsApproverLeaseReleaseResponse`

**CLI:** `hoody agent sessions approverlease release`

---

### `renew`

**PATCH** `/api/v1/agent/sessions/{id}/approver-lease`

Renew the approver lease.

```typescript
client.agent.sessions.approverLease.renew(id: string, data?: AgentSessionsApproverLeaseRenewRequest, options?: { approverLease?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsApproverLeaseRenewResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsApproverLeaseRenewRequest` | No | body |  |
| `approverLease` | `string` | No | header | The approver-lease capability returned by POST /api/v1/agent/sessions/{id}/approver-lease. Required on every decision (/api/v1/agent/sessions/{id}/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsApproverLeaseRenewResponse`

**CLI:** `hoody agent sessions approverlease renew`

---

## `client.agent.sessions.attachments` (3 methods)

### `claim`

**POST** `/api/v1/agent/sessions/{id}/attachments`

Hold a live session (and its parked gate) alive.

```typescript
client.agent.sessions.attachments.claim(id: string, data?: AgentSessionsAttachmentsClaimRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsAttachmentsClaimResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsAttachmentsClaimRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsAttachmentsClaimResponse`

**CLI:** `hoody agent sessions attachments claim`

---

### `release`

**DELETE** `/api/v1/agent/sessions/{id}/attachments/{lease_id}`

Release an attachment lease.

```typescript
client.agent.sessions.attachments.release(id: string, lease_id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsAttachmentsReleaseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `lease_id` | `string` | Yes | path | The lease id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsAttachmentsReleaseResponse`

**CLI:** `hoody agent sessions attachments release`

---

### `renew`

**PATCH** `/api/v1/agent/sessions/{id}/attachments/{lease_id}`

Renew an attachment lease.

```typescript
client.agent.sessions.attachments.renew(id: string, lease_id: string, data?: AgentSessionsAttachmentsRenewRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsAttachmentsRenewResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `lease_id` | `string` | Yes | path | The lease id. |
| `data` | `AgentSessionsAttachmentsRenewRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsAttachmentsRenewResponse`

**CLI:** `hoody agent sessions attachments renew`

---

## `client.agent.sessions.autoReply` (3 methods)

### `disableWrites`

**PATCH** `/api/v1/agent/sessions/{id}/auto-reply/writes`

Flip the auto-reply write opt-in.

```typescript
client.agent.sessions.autoReply.disableWrites(id: string, data?: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent sessions autoreply writes disable`

---

### `enableWrites`

**PATCH** `/api/v1/agent/sessions/{id}/auto-reply/writes`

Flip the auto-reply write opt-in.

```typescript
client.agent.sessions.autoReply.enableWrites(id: string, data?: object, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent sessions autoreply writes enable`

---

### `update`

**PATCH** `/api/v1/agent/sessions/{id}/auto-reply`

Arm/disarm the auto-reply loop.

```typescript
client.agent.sessions.autoReply.update(id: string, data?: AgentSessionsAutoReplyUpdateRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsAutoReplyUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsAutoReplyUpdateRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsAutoReplyUpdateResponse`

**CLI:** `hoody agent sessions autoreply update`

---

## `client.agent.sessions.commands` (5 methods)

### `get`

**GET** `/api/v1/agent/sessions/{id}/commands/{command_id}`

Get a command's receipt.

```typescript
client.agent.sessions.commands.get(id: string, command_id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsCommandsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `command_id` | `string` | Yes | path | The command id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsCommandsGetResponse`

**CLI:** `hoody agent sessions commands get`

---

### `getByKey`

**GET** `/api/v1/agent/sessions/{id}/commands/by-key/{key}`

Read a command by its idempotency key.

```typescript
client.agent.sessions.commands.getByKey(id: string, key: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsCommandsGetByKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `key` | `string` | Yes | path | The key. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsCommandsGetByKeyResponse`

**CLI:** `hoody agent sessions commands keys get`

---

### `retireKey`

**POST** `/api/v1/agent/sessions/{id}/commands/by-key/{key}/retire`

Retire a command key no read found.

```typescript
client.agent.sessions.commands.retireKey(id: string, key: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsCommandsRetireKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `key` | `string` | Yes | path | The key. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsCommandsRetireKeyResponse`

**CLI:** `hoody agent sessions commands keys retire`

---

### `send`

**POST** `/api/v1/agent/sessions/{id}/commands`

Send a message, an interrupt or a stop to a session.

```typescript
client.agent.sessions.commands.send(id: string, data: AgentSessionsCommandsSendRequest, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsCommandsSendResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsCommandsSendRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Retry key, required on this route; the SDK and CLI send one automatically. 1–255 printable ASCII, no whitespace. A retry with the same key and command returns the stored receipt and admits nothing; the same key with a different command is 422. The key is remembered while the command waits and for 24 hours after it settled. Past 4096 remembered keys a new key is 429 idempotency_keys_exhausted; a stop is never refused because of the remembered-key limit. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsCommandsSendResponse`

**CLI:** `hoody agent sessions commands send`

---

### `withdraw`

**POST** `/api/v1/agent/sessions/{id}/commands/{command_id}/withdraw`

Take back a queued message.

```typescript
client.agent.sessions.commands.withdraw(id: string, command_id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsCommandsWithdrawResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `command_id` | `string` | Yes | path | The command id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsCommandsWithdrawResponse`

**CLI:** `hoody agent sessions commands withdraw`

---

## `client.agent.sessions.tasks` (4 methods)

### `cancel`

**POST** `/api/v1/agent/sessions/{id}/tasks/{tid}/cancel`

Cancel a background task.

```typescript
client.agent.sessions.tasks.cancel(id: string, tid: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsTasksCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `tid` | `string` | Yes | path | The task id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsTasksCancelResponse`

**CLI:** `hoody agent sessions tasks cancel`

---

### `cancelAll`

**POST** `/api/v1/agent/sessions/{id}/tasks/cancel`

Cancel all background tasks.

```typescript
client.agent.sessions.tasks.cancelAll(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsTasksCancelAllResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsTasksCancelAllResponse`

**CLI:** `hoody agent sessions tasks cancel`

---

### `getTranscript`

**GET** `/api/v1/agent/sessions/{id}/tasks/{tid}/transcript`

Read a background task's transcript.

```typescript
client.agent.sessions.tasks.getTranscript(id: string, tid: string, options?: { after_seq?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsTasksGetTranscriptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `tid` | `string` | Yes | path | The task id. |
| `after_seq` | `number` | No | query | Exclusive int64 upsert-poll cursor: entries with seq strictly greater than it, plus any still-OPEN entry regardless of its seq. Omit for the whole transcript (distinct from 0, which skips a closed seq-0 entry). Negative/non-integer = 400. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsTasksGetTranscriptResponse`

**CLI:** `hoody agent sessions tasks transcript get`

---

### `list`

**GET** `/api/v1/agent/sessions/{id}/tasks`

List a session's background tasks.

```typescript
client.agent.sessions.tasks.list(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsTasksListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsTasksListResponse`

**CLI:** `hoody agent sessions tasks list`

---

## `client.agent.sessions.tools` (7 methods)

### `list`

**GET** `/api/v1/agent/sessions/{id}/tools`

List a session's effective tool set.

```typescript
client.agent.sessions.tools.list(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsToolsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsToolsListResponse`

**CLI:** `hoody agent sessions tools list`

---

### `listAll`

**GET** `/api/v1/agent/sessions/{id}/tools`

List a session's effective tool set. (collect all pages)

```typescript
client.agent.sessions.tools.listAll(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/sessions/{id}/tools`

List a session's effective tool set. (async iterator)

```typescript
client.agent.sessions.tools.listIterator(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listMcp`

**GET** `/api/v1/agent/sessions/{id}/tools/mcp`

List a session's MCP tools.

```typescript
client.agent.sessions.tools.listMcp(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsToolsListMcpResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsToolsListMcpResponse`

**CLI:** `hoody agent sessions tools mcp list`

---

### `listMcpAll`

**GET** `/api/v1/agent/sessions/{id}/tools/mcp`

List a session's MCP tools. (collect all pages)

```typescript
client.agent.sessions.tools.listMcpAll(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listMcpIterator`

**GET** `/api/v1/agent/sessions/{id}/tools/mcp`

List a session's MCP tools. (async iterator)

```typescript
client.agent.sessions.tools.listMcpIterator(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `run`

**POST** `/api/v1/agent/sessions/{id}/tools/{name}/run`

Run a tool inside a live session (gated).

```typescript
client.agent.sessions.tools.run(id: string, name: string, data?: AgentSessionsToolsRunRequest, options?: { confirm?: boolean; confirm_token?: string; approverLease?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsToolsRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentSessionsToolsRunRequest` | No | body |  |
| `confirm` | `boolean` | No | query | Query alias of the body `confirm` field: re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | No | query | Query alias of the body `confirm_token` field: the single-use token of the parked run (see the body field). |
| `approverLease` | `string` | No | header | The approver-lease capability returned by POST /api/v1/agent/sessions/{id}/approver-lease. Required on every decision (/api/v1/agent/sessions/{id}/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsToolsRunResponse`

**CLI:** `hoody agent sessions tools run`

---

## `client.agent.sessions.turns` (8 methods)

### `cancel`

**POST** `/api/v1/agent/sessions/{id}/cancel`

Cancel the active turn (Esc), or one named turn.

```typescript
client.agent.sessions.turns.cancel(id: string, data?: AgentSessionsTurnsCancelRequest, options?: { turn_id?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsTurnsCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsTurnsCancelRequest` | No | body |  |
| `turn_id` | `string` | No | query | Cancel only this turn (alternative to the body field). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsTurnsCancelResponse`

**CLI:** `hoody agent sessions turns cancel`

---

### `create`

**POST** `/api/v1/agent/sessions/{id}/turns`

Dispatch a turn (retry-safe).

```typescript
client.agent.sessions.turns.create(id: string, data: AgentSessionsTurnsCreateRequest, options?: { gatePolicy?: string; idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsTurnsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsTurnsCreateRequest` | Yes | body |  |
| `gatePolicy` | `string` | No | header | Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture: it approves approval cards for their one call, and denies a card a tool-call rule raised and a destructive-shape card (static_stakes: a recursive force delete, curl piped to a shell, sudo, a force push...), as a headless run refuses those (off by default; the in:query alias is ?policy=). Any other value is rejected 400. |
| `idempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsTurnsCreateResponse`

**CLI:** `hoody agent sessions turns create`

---

### `get`

**GET** `/api/v1/agent/sessions/{id}/turns/{turn_id}`

Get a turn's durable receipt.

```typescript
client.agent.sessions.turns.get(id: string, turn_id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsTurnsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `turn_id` | `string` | Yes | path | The turn id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsTurnsGetResponse`

**CLI:** `hoody agent sessions turns get`

---

### `getByKey`

**GET** `/api/v1/agent/sessions/{id}/turns/by-key/{key}`

Read a turn by its idempotency key.

```typescript
client.agent.sessions.turns.getByKey(id: string, key: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsTurnsGetByKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `key` | `string` | Yes | path | The key. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsTurnsGetByKeyResponse`

**CLI:** `hoody agent sessions turns keys get`

---

### `list`

**GET** `/api/v1/agent/sessions/{id}/turns`

List a session's durable turn receipts.

```typescript
client.agent.sessions.turns.list(id: string, options?: { limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsTurnsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `limit` | `number` | No | query | Return at most this many receipts, newest first (1–1000). A cap, not a page size: there is no next page. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsTurnsListResponse`

**CLI:** `hoody agent sessions turns list`

---

### `retireKey`

**POST** `/api/v1/agent/sessions/{id}/turns/by-key/{key}/retire`

Retire a turn key no read found.

```typescript
client.agent.sessions.turns.retireKey(id: string, key: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsTurnsRetireKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `key` | `string` | Yes | path | The key. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsTurnsRetireKeyResponse`

**CLI:** `hoody agent sessions turns keys retire`

---

### `run`

**POST** `/api/v1/agent/sessions/{id}/prompt:sync`

Dispatch a turn and block until it ends (no reply text: read it from the transcript)

```typescript
client.agent.sessions.turns.run(id: string, data: AgentSessionsTurnsRunRequest, options?: { gatePolicy?: string; idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsTurnsRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsTurnsRunRequest` | Yes | body |  |
| `gatePolicy` | `string` | No | header | Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture: it approves approval cards for their one call, and denies a card a tool-call rule raised and a destructive-shape card (static_stakes: a recursive force delete, curl piped to a shell, sudo, a force push...), as a headless run refuses those (off by default; the in:query alias is ?policy=). Any other value is rejected 400. |
| `idempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). The turn runs at most once per key: a retry answers 200 duplicate:true with the turn's outcome (or pending_turn while it still runs) and never re-runs it; the same key with a different request body is 422. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsTurnsRunResponse`

**CLI:** `hoody agent sessions turns run`

---

### `start`

**POST** `/api/v1/agent/sessions/{id}/messages`

Dispatch a turn (fire-and-observe).

```typescript
client.agent.sessions.turns.start(id: string, data: object, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string; stream?: boolean; gatePolicy?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `idempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |
| `stream` | `boolean` | No | option | Stream the turn as server-sent events instead of answering its handle. |
| `gatePolicy` | `string` | No | header | Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture: it approves approval cards for their one call, and denies a card a tool-call rule raised and a destructive-shape card (static_stakes: a recursive force delete, curl piped to a shell, sudo, a force push...), as a headless run refuses those (off by default; the in:query alias is ?policy=). Any other value is rejected 400. |

**Returns:** `any`

**CLI:** `hoody agent sessions turns start`

---

## `client.agent.sessions.waiters` (4 methods)

### `cancel`

**DELETE** `/api/v1/agent/sessions/{id}/waiters/{waiter_id}`

Cancel a waiter.

```typescript
client.agent.sessions.waiters.cancel(id: string, waiter_id: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsWaitersCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `waiter_id` | `string` | Yes | path | The waiter id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsWaitersCancelResponse`

**CLI:** `hoody agent sessions waiters cancel`

---

### `create`

**POST** `/api/v1/agent/sessions/{id}/waiters`

Wait for an outcome in another session's work.

```typescript
client.agent.sessions.waiters.create(id: string, data: AgentSessionsWaitersCreateRequest, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsWaitersCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsWaitersCreateRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Optional retry key, 1–255 printable ASCII: the same key and body answers the waiter it created. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsWaitersCreateResponse`

**CLI:** `hoody agent sessions waiters create`

---

### `get`

**GET** `/api/v1/agent/sessions/{id}/waiters/{waiter_id}`

Get a waiter.

```typescript
client.agent.sessions.waiters.get(id: string, waiter_id: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsWaitersGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `waiter_id` | `string` | Yes | path | The waiter id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsWaitersGetResponse`

**CLI:** `hoody agent sessions waiters get`

---

### `list`

**GET** `/api/v1/agent/sessions/{id}/waiters`

List a session's waiters.

```typescript
client.agent.sessions.waiters.list(id: string, options?: { state?: "waiting" | "done"; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSessionsWaitersListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `state` | `"waiting" \| "done"` | No | query | Only waiters in this state. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSessionsWaitersListResponse`

**CLI:** `hoody agent sessions waiters list`

---

## `client.agent.settings` (9 methods)

### `get`

**GET** `/api/v1/agent/settings`

Get settings.

```typescript
client.agent.settings.get(options?: { cwd?: string; configDir?: string }): Promise<AgentSettingsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentSettingsGetResponse`

**CLI:** `hoody agent settings get`

---

### `getInstructions`

**GET** `/api/v1/agent/settings/agent-instructions`

Get a realm's agent instructions.

```typescript
client.agent.settings.getInstructions(options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentSettingsGetInstructionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSettingsGetInstructionsResponse`

**CLI:** `hoody agent settings instructions get`

---

### `getSpendCaps`

**GET** `/api/v1/agent/settings/spend-caps`

Read the spend caps.

```typescript
client.agent.settings.getSpendCaps(): Promise<AgentSettingsGetSpendCapsResponse>
```

**Returns:** `AgentSettingsGetSpendCapsResponse`

**CLI:** `hoody agent settings spendcaps get`

---

### `getWhereAgentsWork`

**GET** `/api/v1/agent/settings/where-agents-work`

Read where agents may work.

```typescript
client.agent.settings.getWhereAgentsWork(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSettingsGetWhereAgentsWorkResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSettingsGetWhereAgentsWorkResponse`

**CLI:** `hoody agent settings whereagentswork get`

---

### `listFeatures`

**GET** `/api/v1/agent/settings/features`

List the agent features.

```typescript
client.agent.settings.listFeatures(): Promise<AgentSettingsListFeaturesResponse>
```

**Returns:** `AgentSettingsListFeaturesResponse`

**CLI:** `hoody agent settings features list`

---

### `setInstructions`

**PUT** `/api/v1/agent/settings/agent-instructions`

Set a realm's agent instructions.

```typescript
client.agent.settings.setInstructions(data: AgentSettingsSetInstructionsRequest, options?: { agentRealm?: "global" | (string & {}) }): Promise<AgentSettingsSetInstructionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSettingsSetInstructionsRequest` | Yes | body |  |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSettingsSetInstructionsResponse`

**CLI:** `hoody agent settings instructions set`

---

### `setSpendCaps`

**PUT** `/api/v1/agent/settings/spend-caps`

Set the spend caps.

```typescript
client.agent.settings.setSpendCaps(data: AgentSettingsSetSpendCapsRequest): Promise<AgentSettingsSetSpendCapsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSettingsSetSpendCapsRequest` | Yes | body |  |

**Returns:** `AgentSettingsSetSpendCapsResponse`

**CLI:** `hoody agent settings spendcaps set`

---

### `update`

**PATCH** `/api/v1/agent/settings`

Patch settings.

```typescript
client.agent.settings.update(data: AgentSettingsUpdateRequest): Promise<AgentSettingsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSettingsUpdateRequest` | Yes | body |  |

**Returns:** `AgentSettingsUpdateResponse`

**CLI:** `hoody agent settings update`

---

### `updateFeatures`

**PATCH** `/api/v1/agent/settings/features`

Change agent features.

```typescript
client.agent.settings.updateFeatures(data: AgentSettingsUpdateFeaturesRequest): Promise<AgentSettingsUpdateFeaturesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSettingsUpdateFeaturesRequest` | Yes | body |  |

**Returns:** `AgentSettingsUpdateFeaturesResponse`

**CLI:** `hoody agent settings features update`

---

## `client.agent.skills` (14 methods)

### `create`

**POST** `/api/v1/agent/skills`

Create a skill.

```typescript
client.agent.skills.create(data: AgentSkillsCreateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSkillsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsCreateRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSkillsCreateResponse`

**CLI:** `hoody agent skills create`

---

### `delete`

**POST** `/api/v1/agent/skills/delete`

Delete a skill.

```typescript
client.agent.skills.delete(data: AgentSkillsDeleteRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSkillsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsDeleteRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSkillsDeleteResponse`

**CLI:** `hoody agent skills delete`

---

### `disable`

**POST** `/api/v1/agent/skills/toggle`

Enable/disable a skill.

```typescript
client.agent.skills.disable(data: object, options?: { cwd?: string; configDir?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent skills disable`

---

### `enable`

**POST** `/api/v1/agent/skills/toggle`

Enable/disable a skill.

```typescript
client.agent.skills.enable(data: object, options?: { cwd?: string; configDir?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent skills enable`

---

### `getSource`

**GET** `/api/v1/agent/skills/source`

Read a skill's source.

```typescript
client.agent.skills.getSource(options?: { root_dir?: string; rel_dir?: string; root?: string; rel?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSkillsGetSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `root_dir` | `string` | No | query | Skill root directory (identity; alias: root). |
| `rel_dir` | `string` | No | query | Skill relative directory (identity; alias: rel). |
| `root` | `string` | No | query | Friendly alias of root_dir (translated to root_dir server-side). |
| `rel` | `string` | No | query | Friendly alias of rel_dir (translated to rel_dir server-side). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSkillsGetSourceResponse`

**CLI:** `hoody agent skills source get`

---

### `import`

**POST** `/api/v1/agent/skills/import/apply`

Apply a skill import.

```typescript
client.agent.skills.import(data: AgentSkillsImportRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSkillsImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsImportRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSkillsImportResponse`

**CLI:** `hoody agent skills import`

---

### `list`

**GET** `/api/v1/agent/skills`

List skills.

```typescript
client.agent.skills.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSkillsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSkillsListResponse`

**CLI:** `hoody agent skills list`

---

### `listAll`

**GET** `/api/v1/agent/skills`

List skills. (collect all pages)

```typescript
client.agent.skills.listAll(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/skills`

List skills. (async iterator)

```typescript
client.agent.skills.listIterator(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `rename`

**POST** `/api/v1/agent/skills/rename`

Rename a skill.

```typescript
client.agent.skills.rename(data: AgentSkillsRenameRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSkillsRenameResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsRenameRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSkillsRenameResponse`

**CLI:** `hoody agent skills rename`

---

### `scan`

**GET** `/api/v1/agent/skills/import/scan`

Scan for importable skills.

```typescript
client.agent.skills.scan(options: { source: "claude" | "codex"; cwd?: string; configDir?: string }): Promise<AgentSkillsScanResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source` | `"claude" \| "codex"` | Yes | query | Which tool's skills to scan. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentSkillsScanResponse`

**CLI:** `hoody agent skills scan`

---

### `setSource`

**PUT** `/api/v1/agent/skills/source`

Write a skill's source.

```typescript
client.agent.skills.setSource(data: AgentSkillsSetSourceRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSkillsSetSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsSetSourceRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSkillsSetSourceResponse`

**CLI:** `hoody agent skills source set`

---

### `trust`

**POST** `/api/v1/agent/skills/trust`

Set a skill's trust state.

```typescript
client.agent.skills.trust(data: object, options?: { cwd?: string; configDir?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent skills trust`

---

### `untrust`

**POST** `/api/v1/agent/skills/trust`

Set a skill's trust state.

```typescript
client.agent.skills.untrust(data: object, options?: { cwd?: string; configDir?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent skills untrust`

---

## `client.agent.skills.hub` (5 methods)

### `clearCache`

**DELETE** `/api/v1/agent/skills/hub/cache`

Clear the skill hub cache.

```typescript
client.agent.skills.hub.clearCache(options?: { cwd?: string; configDir?: string }): Promise<AgentSkillsHubClearCacheResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentSkillsHubClearCacheResponse`

**CLI:** `hoody agent skills hub cache clear`

---

### `getCacheStats`

**GET** `/api/v1/agent/skills/hub/cache`

Skill hub cache stats.

```typescript
client.agent.skills.hub.getCacheStats(options?: { cwd?: string; configDir?: string }): Promise<AgentSkillsHubGetCacheStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentSkillsHubGetCacheStatsResponse`

**CLI:** `hoody agent skills hub cache stats`

---

### `install`

**POST** `/api/v1/agent/skills/hub/install`

Install a hub skill.

```typescript
client.agent.skills.hub.install(data: AgentSkillsHubInstallRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentSkillsHubInstallResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsHubInstallRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentSkillsHubInstallResponse`

**CLI:** `hoody agent skills hub install`

---

### `preview`

**GET** `/api/v1/agent/skills/hub/preview`

Preview a hub skill.

```typescript
client.agent.skills.hub.preview(options: { provider: string; source: string; skill_id: string; cwd?: string; configDir?: string }): Promise<AgentSkillsHubPreviewResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `provider` | `string` | Yes | query | Hub provider of the skill (a search result's ref.provider). |
| `source` | `string` | Yes | query | Source of the skill on the hub, such as owner/repo (a search result's ref.source). |
| `skill_id` | `string` | Yes | query | Hub skill id (a search result's ref.skill_id). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentSkillsHubPreviewResponse`

**CLI:** `hoody agent skills hub preview`

---

### `search`

**GET** `/api/v1/agent/skills/hub/search`

Search the skill hub.

```typescript
client.agent.skills.hub.search(options: { query: string; cwd?: string; configDir?: string }): Promise<AgentSkillsHubSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `query` | `string` | Yes | query | Search text. Required and non-empty. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentSkillsHubSearchResponse`

**CLI:** `hoody agent skills hub search`

---

## `client.agent.todos` (19 methods)

### `approveProposal`

**POST** `/api/v1/agent/todos/{id}/proposals/{pid}/approve`

Approve a todo proposal.

```typescript
client.agent.todos.approveProposal(id: string, pid: string, data?: AgentTodosApproveProposalRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosApproveProposalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `pid` | `string` | Yes | path | The proposal id. |
| `data` | `AgentTodosApproveProposalRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosApproveProposalResponse`

**CLI:** `hoody agent todos proposals approve`

---

### `archive`

**POST** `/api/v1/agent/todos/{id}/archive`

Archive a todo.

```typescript
client.agent.todos.archive(id: string, data: AgentTodosArchiveRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosArchiveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosArchiveRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosArchiveResponse`

**CLI:** `hoody agent todos archive`

---

### `cancel`

**POST** `/api/v1/agent/todos/{id}/cancel-run`

Cancel a todo's run.

```typescript
client.agent.todos.cancel(id: string, data?: AgentTodosCancelRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosCancelRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosCancelResponse`

**CLI:** `hoody agent todos cancel`

---

### `claim`

**POST** `/api/v1/agent/todos/{id}/claim`

Claim a todo.

```typescript
client.agent.todos.claim(id: string, data: AgentTodosClaimRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosClaimResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosClaimRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosClaimResponse`

**CLI:** `hoody agent todos claim`

---

### `create`

**POST** `/api/v1/agent/todos`

File a todo.

```typescript
client.agent.todos.create(data: AgentTodosCreateRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentTodosCreateRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosCreateResponse`

**CLI:** `hoody agent todos create`

---

### `createComment`

**POST** `/api/v1/agent/todos/{id}/messages`

Comment on a todo.

```typescript
client.agent.todos.createComment(id: string, data: AgentTodosCreateCommentRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosCreateCommentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosCreateCommentRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosCreateCommentResponse`

**CLI:** `hoody agent todos comments create`

---

### `denyProposal`

**POST** `/api/v1/agent/todos/{id}/proposals/{pid}/deny`

Deny a todo proposal.

```typescript
client.agent.todos.denyProposal(id: string, pid: string, data?: AgentTodosDenyProposalRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosDenyProposalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `pid` | `string` | Yes | path | The proposal id. |
| `data` | `AgentTodosDenyProposalRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosDenyProposalResponse`

**CLI:** `hoody agent todos proposals deny`

---

### `get`

**GET** `/api/v1/agent/todos/{id}`

Read a todo.

```typescript
client.agent.todos.get(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosGetResponse`

**CLI:** `hoody agent todos get`

---

### `getRevision`

**GET** `/api/v1/agent/todos/revision`

Get the todos store revision.

```typescript
client.agent.todos.getRevision(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosGetRevisionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosGetRevisionResponse`

**CLI:** `hoody agent todos revision get`

---

### `list`

**GET** `/api/v1/agent/todos`

List todos.

```typescript
client.agent.todos.list(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<AgentTodosListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | No | query | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | No | query | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | No | query | Free-text filter over title/body. |
| `open_only` | `boolean` | No | query | When true, only open (non-terminal) todos. |
| `all` | `boolean` | No | query | When true, include archived todos. Closed todos are listed without it. |
| `sort` | `"default" \| "closed_at"` | No | query | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentTodosListResponse`

**CLI:** `hoody agent todos list`

---

### `listAll`

**GET** `/api/v1/agent/todos`

List todos. (collect all pages)

```typescript
client.agent.todos.listAll(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | No | query | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | No | query | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | No | query | Free-text filter over title/body. |
| `open_only` | `boolean` | No | query | When true, only open (non-terminal) todos. |
| `all` | `boolean` | No | query | When true, include archived todos. Closed todos are listed without it. |
| `sort` | `"default" \| "closed_at"` | No | query | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/todos`

List todos. (async iterator)

```typescript
client.agent.todos.listIterator(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | No | query | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | No | query | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | No | query | Free-text filter over title/body. |
| `open_only` | `boolean` | No | query | When true, only open (non-terminal) todos. |
| `all` | `boolean` | No | query | When true, include archived todos. Closed todos are listed without it. |
| `sort` | `"default" \| "closed_at"` | No | query | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `purgeArchived`

**POST** `/api/v1/agent/todos/purge`

Purge archived todos.

```typescript
client.agent.todos.purgeArchived(data?: AgentTodosPurgeArchivedRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosPurgeArchivedResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentTodosPurgeArchivedRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosPurgeArchivedResponse`

**CLI:** `hoody agent todos archived purge`

---

### `release`

**POST** `/api/v1/agent/todos/{id}/release`

Release a todo.

```typescript
client.agent.todos.release(id: string, data: AgentTodosReleaseRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosReleaseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosReleaseRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosReleaseResponse`

**CLI:** `hoody agent todos release`

---

### `sendMessage`

**POST** `/api/v1/agent/todos/{id}/message`

Comment + run an orchestrator turn.

```typescript
client.agent.todos.sendMessage(id: string, data: AgentTodosSendMessageRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosSendMessageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosSendMessageRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosSendMessageResponse`

**CLI:** `hoody agent todos messages send`

---

### `snooze`

**POST** `/api/v1/agent/todos/{id}/snooze`

Snooze a todo.

```typescript
client.agent.todos.snooze(id: string, data: AgentTodosSnoozeRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosSnoozeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosSnoozeRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosSnoozeResponse`

**CLI:** `hoody agent todos snooze`

---

### `start`

**POST** `/api/v1/agent/todos/{id}/run`

Run a todo's orchestrator.

```typescript
client.agent.todos.start(id: string, data?: AgentTodosStartRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosStartRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosStartResponse`

**CLI:** `hoody agent todos start`

---

### `triage`

**POST** `/api/v1/agent/todos/triage`

Run an LLM triage pass.

```typescript
client.agent.todos.triage(data?: AgentTodosTriageRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosTriageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentTodosTriageRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosTriageResponse`

**CLI:** `hoody agent todos triage`

---

### `update`

**PATCH** `/api/v1/agent/todos/{id}`

Update a todo (CAS).

```typescript
client.agent.todos.update(id: string, data: AgentTodosUpdateRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentTodosUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosUpdateRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentTodosUpdateResponse`

**CLI:** `hoody agent todos update`

---

## `client.agent.tools` (9 methods)

### `get`

**GET** `/api/v1/agent/tools/{name}`

Get one tool schema.

```typescript
client.agent.tools.get(name: string, options?: { cwd?: string; configDir?: string }): Promise<AgentToolsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentToolsGetResponse`

**CLI:** `hoody agent tools get`

---

### `list`

**GET** `/api/v1/agent/tools`

List the tool catalogue.

```typescript
client.agent.tools.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<AgentToolsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentToolsListResponse`

**CLI:** `hoody agent tools list`

---

### `listAll`

**GET** `/api/v1/agent/tools`

List the tool catalogue. (collect all pages)

```typescript
client.agent.tools.listAll(options?: { page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/tools`

List the tool catalogue. (async iterator)

```typescript
client.agent.tools.listIterator(options?: { page?: number; limit?: number; cwd?: string; configDir?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listReadOnly`

**GET** `/api/v1/agent/tools/read-only`

List the read-only tool subset.

```typescript
client.agent.tools.listReadOnly(options?: { page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<AgentToolsListReadOnlyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentToolsListReadOnlyResponse`

**CLI:** `hoody agent tools readonly list`

---

### `listReadOnlyAll`

**GET** `/api/v1/agent/tools/read-only`

List the read-only tool subset. (collect all pages)

```typescript
client.agent.tools.listReadOnlyAll(options?: { page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `unknown[]`

---

### `listReadOnlyIterator`

**GET** `/api/v1/agent/tools/read-only`

List the read-only tool subset. (async iterator)

```typescript
client.agent.tools.listReadOnlyIterator(options?: { page?: number; limit?: number; cwd?: string; configDir?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `run`

**POST** `/api/v1/agent/tools/{name}/run`

Run a tool (sessionless, gated).

```typescript
client.agent.tools.run(name: string, data?: object, options?: { confirm?: boolean; confirm_token?: string; toolMode?: string; dirScope?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: string; stream?: boolean }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `confirm` | `boolean` | No | query | Query alias of the body `confirm` field: re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | No | query | Query alias of the body `confirm_token` field: the single-use token of the parked run (see the body field). |
| `toolMode` | `string` | No | header | Sessionless tool-mode for the ephemeral session: `standard` (the default) or `orchestrator`. Any other value is refused 400 invalid_tool_mode. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `dirScope` | `string` | No | header | Sessionless directory-access scope for the ephemeral session: home (the default) or full. Any other value is refused 400 invalid_dir_scope. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |
| `stream` | `boolean` | No | option | Stream the tool output as server-sent events. |

**Returns:** `any`

**CLI:** `hoody agent tools run`

---

### `start`

**POST** `/api/v1/agent/tools/{name}/runAsync`

Run a tool asynchronously (sessionless, gated).

```typescript
client.agent.tools.start(name: string, data?: AgentToolsStartRequest, options?: { confirm?: boolean; confirm_token?: string; toolMode?: string; dirScope?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentToolsStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentToolsStartRequest` | No | body |  |
| `confirm` | `boolean` | No | query | Query alias of the body `confirm` field: re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | No | query | Query alias of the body `confirm_token` field: the single-use token of the parked run (see the body field). |
| `toolMode` | `string` | No | header | Sessionless tool-mode for the ephemeral session: `standard` (the default) or `orchestrator`. Any other value is refused 400 invalid_tool_mode. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `dirScope` | `string` | No | header | Sessionless directory-access scope for the ephemeral session: home (the default) or full. Any other value is refused 400 invalid_dir_scope. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentToolsStartResponse`

**CLI:** `hoody agent tools start`

---

## `client.agent.usage` (3 methods)

### `getStats`

**GET** `/api/v1/agent/statistics`

Cross-session statistics.

```typescript
client.agent.usage.getStats(options?: { scope?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentUsageGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `scope` | `string` | No | query | cwd (default) rolls up the current working directory; all rolls up the sessions of every working directory in the selected realm that the signed-in account can see. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentUsageGetStatsResponse`

**CLI:** `hoody agent usage stats`

---

### `listByAccount`

**GET** `/api/v1/agent/usage/by-account`

Usage rollup by account.

```typescript
client.agent.usage.listByAccount(options?: { since?: number; cwd?: string; configDir?: string }): Promise<AgentUsageListByAccountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `since` | `number` | No | query | Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentUsageListByAccountResponse`

**CLI:** `hoody agent usage accounts list`

---

### `listByModel`

**GET** `/api/v1/agent/usage/by-model`

Usage rollup by model.

```typescript
client.agent.usage.listByModel(options?: { since?: number; cwd?: string; configDir?: string }): Promise<AgentUsageListByModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `since` | `number` | No | query | Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentUsageListByModelResponse`

**CLI:** `hoody agent usage models list`

---

## `client.agent.workflows` (11 methods)

### `delete`

**DELETE** `/api/v1/agent/workflows/{name}`

Delete a workflow definition.

```typescript
client.agent.workflows.delete(name: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentWorkflowsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentWorkflowsDeleteResponse`

**CLI:** `hoody agent workflows delete`

---

### `get`

**GET** `/api/v1/agent/workflows/{name}`

Read one workflow definition.

```typescript
client.agent.workflows.get(name: string, options?: { include_revision?: boolean; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentWorkflowsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `include_revision` | `boolean` | No | query | If "true", the tool output's first line is `revision: &lt;opaque&gt;`: pass that value as the PUT /api/v1/agent/workflows/{name} expected_revision to guard against concurrent edits; the JSON below it is unchanged. Strictly parsed: exactly one value, "true" or "false"; anything else (empty, "TRUE", "1", repeated) is a 400 bad_request. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentWorkflowsGetResponse`

**CLI:** `hoody agent workflows get`

---

### `hide`

**POST** `/api/v1/agent/workflows/{name}/hide`

Hide or un-hide a workflow.

```typescript
client.agent.workflows.hide(name: string, data?: object, options?: { cwd?: string; configDir?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent workflows hide`

---

### `list`

**GET** `/api/v1/agent/workflows`

List workflow definitions.

```typescript
client.agent.workflows.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentWorkflowsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentWorkflowsListResponse`

**CLI:** `hoody agent workflows list`

---

### `listAll`

**GET** `/api/v1/agent/workflows`

List workflow definitions. (collect all pages)

```typescript
client.agent.workflows.listAll(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/workflows`

List workflow definitions. (async iterator)

```typescript
client.agent.workflows.listIterator(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `sendMessage`

**POST** `/api/v1/agent/sessions/{id}/workflow/messages`

Send a message to a running workflow.

```typescript
client.agent.workflows.sendMessage(id: string, data?: AgentWorkflowsSendMessageRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentWorkflowsSendMessageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentWorkflowsSendMessageRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentWorkflowsSendMessageResponse`

**CLI:** `hoody agent workflows messages send`

---

### `set`

**PUT** `/api/v1/agent/workflows/{name}`

Create or replace a workflow definition.

```typescript
client.agent.workflows.set(name: string, data: AgentWorkflowsSetRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentWorkflowsSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentWorkflowsSetRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentWorkflowsSetResponse`

**CLI:** `hoody agent workflows set`

---

### `setSummary`

**PUT** `/api/v1/agent/workflows/{name}/summary`

Set or clear a workflow's summary.

```typescript
client.agent.workflows.setSummary(name: string, data: AgentWorkflowsSetSummaryRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentWorkflowsSetSummaryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentWorkflowsSetSummaryRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentWorkflowsSetSummaryResponse`

**CLI:** `hoody agent workflows summary set`

---

### `start`

**POST** `/api/v1/agent/workflows/{name}/runs`

Run a workflow in a new session.

```typescript
client.agent.workflows.start(name: string, data?: AgentWorkflowsStartRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentWorkflowsStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentWorkflowsStartRequest` | No | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | No | header | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentWorkflowsStartResponse`

**CLI:** `hoody agent workflows start`

---

### `unhide`

**POST** `/api/v1/agent/workflows/{name}/hide`

Hide or un-hide a workflow.

```typescript
client.agent.workflows.unhide(name: string, data?: object, options?: { cwd?: string; configDir?: string; agentRealm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `string` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent workflows unhide`

---

## `client.agent.workflows.runs` (6 methods)

### `cancel`

**POST** `/api/v1/agent/workflows/runs/{run_id}/cancel`

Cancel a workflow run.

```typescript
client.agent.workflows.runs.cancel(run_id: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentWorkflowsRunsCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `run_id` | `string` | Yes | path | The run id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentWorkflowsRunsCancelResponse`

**CLI:** `hoody agent workflows runs cancel`

---

### `get`

**GET** `/api/v1/agent/workflows/runs/{run_id}`

Get one workflow run by id.

```typescript
client.agent.workflows.runs.get(run_id: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentWorkflowsRunsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `run_id` | `string` | Yes | path | The run id. |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentWorkflowsRunsGetResponse`

**CLI:** `hoody agent workflows runs get`

---

### `list`

**GET** `/api/v1/agent/workflows/runs`

Snapshot in-flight and recent workflow runs.

```typescript
client.agent.workflows.runs.list(options?: { agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<AgentWorkflowsRunsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AgentWorkflowsRunsListResponse`

**CLI:** `hoody agent workflows runs list`

---

### `listAll`

**GET** `/api/v1/agent/workflows/runs`

Snapshot in-flight and recent workflow runs. (collect all pages)

```typescript
client.agent.workflows.runs.listAll(options?: { agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/workflows/runs`

Snapshot in-flight and recent workflow runs. (async iterator)

```typescript
client.agent.workflows.runs.listIterator(options?: { agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `resume`

**POST** `/api/v1/agent/workflows/runs/{run_id}/resume`

Resume a failed or cancelled workflow run.

```typescript
client.agent.workflows.runs.resume(run_id: string, data: AgentWorkflowsRunsResumeRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) }): Promise<AgentWorkflowsRunsResumeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `run_id` | `string` | Yes | path | The run id. |
| `data` | `AgentWorkflowsRunsResumeRequest` | Yes | body |  |
| `cwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `agentRealm` | `"global" \| (string & {})` | No | header | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AgentWorkflowsRunsResumeResponse`

**CLI:** `hoody agent workflows runs resume`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
