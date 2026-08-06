# `agent` — 222 methods

**Version:** 1.0.0-beta.12
**Accessor:** `client.agent`

```typescript
import * as agent from 'hoody-sdk/agent';
```

---

## `client.agent` (1 method)

### `exportLogs`

**GET** `/api/v1/agent/logs/export`

Export logs as a downloadable file.

```typescript
client.agent.exportLogs(options?: { source?: string; min_level?: string; comp?: string; session_id?: string; text?: string; since?: string; until?: string; event?: string; tool?: string; model?: string; status?: string; method?: string; min_status?: number; max_status?: number; errors_only?: boolean; event_type?: string; resource_type?: string; container?: string; kind?: string; host?: string; since_seq?: number; limit?: number; format?: string; filename?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source` | `string` | No | query | Log source to export (see logsSources; one local source, one platform source, or omitted for all local sources). |
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
| `container` | `string` | No | query | Container filter (proxy source; empty = all running realm containers). Maps to the daemon's container_id filter. |
| `kind` | `string` | No | query | Proxy row kind: request\|response\|event (proxy source). |
| `host` | `string` | No | query | Proxy URL host filter (exact or dot-aligned suffix). |
| `since_seq` | `number` | No | query | Exclusive lower seq bound for incremental exports (local sources). |
| `limit` | `number` | No | query | TOTAL row cap across the export (default: everything the snapshot matches; platform default 2000). |
| `format` | `string` | No | query | Export format: jsonl (default) or txt. |
| `filename` | `string` | No | query | Download filename override (reduced to a safe basename). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `ApiResponse<unknown>`

---

## `client.agent.agents` (14 methods)

### `copyAgent`

**POST** `/api/v1/agent/agents/{name}/copy`

Copy a chat agent.

```typescript
client.agent.agents.copyAgent(name: string, data: AgentCopyAgentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCopyAgentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentCopyAgentRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCopyAgentResponse`

**CLI:** `hoody agent agents copy`

---

### `createAgent`

**POST** `/api/v1/agent/agents`

Create a chat-agent definition.

```typescript
client.agent.agents.createAgent(data: AgentCreateAgentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCreateAgentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentCreateAgentRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCreateAgentResponse`

**CLI:** `hoody agent agents create`

---

### `deleteAgent`

**DELETE** `/api/v1/agent/agents/{name}`

Delete a custom chat agent.

```typescript
client.agent.agents.deleteAgent(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDeleteAgentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDeleteAgentResponse`

**CLI:** `hoody agent agents delete`

---

### `getAgentSource`

**GET** `/api/v1/agent/agents/{name}/source`

Read a chat agent's source.

```typescript
client.agent.agents.getAgentSource(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetAgentSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetAgentSourceResponse`

**CLI:** `hoody agent agents get-source`

---

### `listAgents`

**GET** `/api/v1/agent/agents`

List chat-agent definitions.

```typescript
client.agent.agents.listAgents(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListAgentsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListAgentsResponse`

**CLI:** `hoody agent agents list`

---

### `listAgentsAll`

**GET** `/api/v1/agent/agents`

List chat-agent definitions. (collect all pages)

```typescript
client.agent.agents.listAgentsAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent agents list`

---

### `listAgentsIterator`

**GET** `/api/v1/agent/agents`

List chat-agent definitions. (async iterator)

```typescript
client.agent.agents.listAgentsIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent agents list`

---

### `putAgentSource`

**PUT** `/api/v1/agent/agents/{name}/source`

Write a chat agent's source.

```typescript
client.agent.agents.putAgentSource(name: string, data: AgentPutAgentSourceRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentPutAgentSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentPutAgentSourceRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentPutAgentSourceResponse`

**CLI:** `hoody agent agents put-source`

---

### `renameAgent`

**POST** `/api/v1/agent/agents/{name}/rename`

Rename a chat agent.

```typescript
client.agent.agents.renameAgent(name: string, data: AgentRenameAgentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentRenameAgentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentRenameAgentRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentRenameAgentResponse`

**CLI:** `hoody agent agents rename`

---

### `resetAgentToShipped`

**POST** `/api/v1/agent/agents/{name}/reset-to-shipped`

Reset an agent to its shipped default.

```typescript
client.agent.agents.resetAgentToShipped(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentResetAgentToShippedResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentResetAgentToShippedResponse`

**CLI:** `hoody agent agents reset-to-shipped`

---

### `setAgentModel`

**PATCH** `/api/v1/agent/agents/{name}/model`

Set an agent's model.

```typescript
client.agent.agents.setAgentModel(name: string, data?: AgentSetAgentModelRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetAgentModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetAgentModelRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetAgentModelResponse`

**CLI:** `hoody agent agents set-model`

---

### `setAgentTools`

**PATCH** `/api/v1/agent/agents/{name}/tools`

Set an agent's tool allow-list.

```typescript
client.agent.agents.setAgentTools(name: string, data?: AgentSetAgentToolsRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetAgentToolsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetAgentToolsRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetAgentToolsResponse`

**CLI:** `hoody agent agents set-tools`

---

### `setAgentTurns`

**PATCH** `/api/v1/agent/agents/{name}/turns`

Set an agent's max-turns.

```typescript
client.agent.agents.setAgentTurns(name: string, data?: AgentSetAgentTurnsRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetAgentTurnsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetAgentTurnsRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetAgentTurnsResponse`

**CLI:** `hoody agent agents set-turns`

---

### `toggleAgentTool`

**POST** `/api/v1/agent/agents/{name}/tools/{tool}/toggle`

Toggle a single tool for an agent.

```typescript
client.agent.agents.toggleAgentTool(name: string, tool: string, data?: AgentToggleAgentToolRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentToggleAgentToolResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `tool` | `string` | Yes | path | Path identifier. |
| `data` | `AgentToggleAgentToolRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentToggleAgentToolResponse`

**CLI:** `hoody agent agents toggle-tool`

---

## `client.agent.discovery` (6 methods)

### `listContainers`

**GET** `/api/v1/agent/containers`

List containers in a realm (for binding).

```typescript
client.agent.discovery.listContainers(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListContainersResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListContainersResponse`

**CLI:** `hoody agent discovery list-containers`

---

### `listContainersAll`

**GET** `/api/v1/agent/containers`

List containers in a realm (for binding). (collect all pages)

```typescript
client.agent.discovery.listContainersAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent discovery list-containers`

---

### `listContainersIterator`

**GET** `/api/v1/agent/containers`

List containers in a realm (for binding). (async iterator)

```typescript
client.agent.discovery.listContainersIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent discovery list-containers`

---

### `listRealms`

**GET** `/api/v1/agent/realms`

List realms (for binding).

```typescript
client.agent.discovery.listRealms(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListRealmsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListRealmsResponse`

**CLI:** `hoody agent discovery list-realms`

---

### `listRealmsAll`

**GET** `/api/v1/agent/realms`

List realms (for binding). (collect all pages)

```typescript
client.agent.discovery.listRealmsAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent discovery list-realms`

---

### `listRealmsIterator`

**GET** `/api/v1/agent/realms`

List realms (for binding). (async iterator)

```typescript
client.agent.discovery.listRealmsIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent discovery list-realms`

---

## `client.agent.github` (12 methods)

### `githubAuthStatus`

**GET** `/api/v1/agent/github/auth/status`

GitHub auth status.

```typescript
client.agent.github.githubAuthStatus(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGithubAuthStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGithubAuthStatusResponse`

**CLI:** `hoody agent github auth-status`

---

### `githubBranches`

**GET** `/api/v1/agent/github/branches`

List GitHub branches.

```typescript
client.agent.github.githubBranches(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGithubBranchesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGithubBranchesResponse`

**CLI:** `hoody agent github branches`

---

### `githubClone`

**POST** `/api/v1/agent/github/clone`

Clone a GitHub repository.

```typescript
client.agent.github.githubClone(data?: AgentGithubCloneRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGithubCloneResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubCloneRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGithubCloneResponse`

**CLI:** `hoody agent github clone`

---

### `githubCommit`

**POST** `/api/v1/agent/github/commit`

Stage all and commit.

```typescript
client.agent.github.githubCommit(data: AgentGithubCommitRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGithubCommitResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubCommitRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGithubCommitResponse`

**CLI:** `hoody agent github commit`

---

### `githubLogin`

**POST** `/api/v1/agent/github/auth/login`

Start a GitHub device-flow login (or add a PAT).

```typescript
client.agent.github.githubLogin(data?: AgentGithubLoginRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGithubLoginResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubLoginRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGithubLoginResponse`

**CLI:** `hoody agent github login`

---

### `githubLoginPoll`

**POST** `/api/v1/agent/github/auth/login/poll`

Poll a GitHub device-flow login to completion.

```typescript
client.agent.github.githubLoginPoll(data: AgentGithubLoginPollRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGithubLoginPollResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubLoginPollRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGithubLoginPollResponse`

**CLI:** `hoody agent github login-poll`

---

### `githubLogout`

**POST** `/api/v1/agent/github/auth/logout`

Remove a linked GitHub account.

```typescript
client.agent.github.githubLogout(data: AgentGithubLogoutRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGithubLogoutResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubLogoutRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGithubLogoutResponse`

---

### `githubPullRequest`

**POST** `/api/v1/agent/github/pr`

Open a pull request.

```typescript
client.agent.github.githubPullRequest(data: AgentGithubPullRequestRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGithubPullRequestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubPullRequestRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGithubPullRequestResponse`

**CLI:** `hoody agent github pull-request`

---

### `githubRepos`

**GET** `/api/v1/agent/github/repos`

List GitHub repos.

```typescript
client.agent.github.githubRepos(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGithubReposResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGithubReposResponse`

**CLI:** `hoody agent github repos`

---

### `githubSetActiveAccount`

**POST** `/api/v1/agent/github/auth/active`

Switch the active GitHub account.

```typescript
client.agent.github.githubSetActiveAccount(data: AgentGithubSetActiveAccountRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGithubSetActiveAccountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubSetActiveAccountRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGithubSetActiveAccountResponse`

---

### `githubStatus`

**GET** `/api/v1/agent/github/status`

GitHub working-tree status.

```typescript
client.agent.github.githubStatus(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGithubStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGithubStatusResponse`

**CLI:** `hoody agent github status`

---

### `githubSync`

**POST** `/api/v1/agent/github/sync`

Sync (fetch → pull → push).

```typescript
client.agent.github.githubSync(data?: AgentGithubSyncRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGithubSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubSyncRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGithubSyncResponse`

**CLI:** `hoody agent github sync`

---

## `client.agent.headless` (1 method)

### `createHeadlessRun`

**POST** `/api/v1/agent/headless/runs`

Create a headless one-shot run.

```typescript
client.agent.headless.createHeadlessRun(data: AgentCreateHeadlessRunRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCreateHeadlessRunWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentCreateHeadlessRunRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCreateHeadlessRunWebSocket`

**CLI:** `hoody agent headless create-run`

---

## `client.agent.hoody` (1 method)

### `bootstrapHoodyToken`

**POST** `/api/v1/agent/hoody/auth/bootstrap`

Bootstrap the Hoody platform credential (install-if-absent).

```typescript
client.agent.hoody.bootstrapHoodyToken(data: AgentBootstrapHoodyTokenRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentBootstrapHoodyTokenResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentBootstrapHoodyTokenRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentBootstrapHoodyTokenResponse`

---

## `client.agent.hooks` (9 methods)

### `ackHookTrust`

**POST** `/api/v1/agent/hooks/trust/ack`

Acknowledge hook trust.

```typescript
client.agent.hooks.ackHookTrust(data?: AgentAckHookTrustRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentAckHookTrustResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentAckHookTrustRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentAckHookTrustResponse`

**CLI:** `hoody agent hooks ack-trust`

---

### `beginHookWrite`

**POST** `/api/v1/agent/hooks/begin-write`

Begin a hook write (nonce).

```typescript
client.agent.hooks.beginHookWrite(data: AgentBeginHookWriteRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentBeginHookWriteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentBeginHookWriteRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentBeginHookWriteResponse`

**CLI:** `hoody agent hooks begin-write`

---

### `deleteHook`

**DELETE** `/api/v1/agent/hooks`

Delete a hook.

```typescript
client.agent.hooks.deleteHook(data: AgentDeleteHookRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDeleteHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentDeleteHookRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDeleteHookResponse`

**CLI:** `hoody agent hooks delete`

---

### `disableAllHooks`

**POST** `/api/v1/agent/hooks/disable-all`

Disable all hooks.

```typescript
client.agent.hooks.disableAllHooks(data: AgentDisableAllHooksRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDisableAllHooksResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentDisableAllHooksRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDisableAllHooksResponse`

**CLI:** `hoody agent hooks disable-all`

---

### `listHooks`

**GET** `/api/v1/agent/hooks`

List hooks.

```typescript
client.agent.hooks.listHooks(data?: AgentListHooksRequest, options?: { session_id?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListHooksResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentListHooksRequest` | No | body |  |
| `session_id` | `string` | No | query | Live session id (hooks are session-scoped; required by the daemon RPC). Query alias of the body session_id (the body value wins). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListHooksResponse`

**CLI:** `hoody agent hooks list`

---

### `reloadHooks`

**POST** `/api/v1/agent/hooks/reload`

Reload hooks from disk.

```typescript
client.agent.hooks.reloadHooks(data?: AgentReloadHooksRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentReloadHooksResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentReloadHooksRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentReloadHooksResponse`

**CLI:** `hoody agent hooks reload`

---

### `testHook`

**POST** `/api/v1/agent/hooks/test`

Test-fire a hook.

```typescript
client.agent.hooks.testHook(data?: AgentTestHookRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentTestHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentTestHookRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentTestHookResponse`

**CLI:** `hoody agent hooks test`

---

### `toggleHook`

**POST** `/api/v1/agent/hooks/toggle`

Toggle a hook.

```typescript
client.agent.hooks.toggleHook(data: AgentToggleHookRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentToggleHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentToggleHookRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentToggleHookResponse`

**CLI:** `hoody agent hooks toggle`

---

### `upsertHook`

**PUT** `/api/v1/agent/hooks`

Upsert a hook.

```typescript
client.agent.hooks.upsertHook(data: AgentUpsertHookRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentUpsertHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentUpsertHookRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentUpsertHookResponse`

**CLI:** `hoody agent hooks upsert`

---

## `client.agent.jobs` (3 methods)

### `deleteJob`

**DELETE** `/api/v1/agent/jobs/{id}`

Cancel a pending/running job, or delete a finished record.

```typescript
client.agent.jobs.deleteJob(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDeleteJobResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDeleteJobResponse`

**CLI:** `hoody agent jobs delete`

---

### `getJob`

**GET** `/api/v1/agent/jobs/{id}`

Get an async job's status.

```typescript
client.agent.jobs.getJob(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetJobResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetJobResponse`

**CLI:** `hoody agent jobs get`

---

### `getJobResult`

**GET** `/api/v1/agent/jobs/{id}/result`

Get an async job's result.

```typescript
client.agent.jobs.getJobResult(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetJobResultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetJobResultResponse`

**CLI:** `hoody agent jobs get-result`

---

## `client.agent.logs` (5 methods)

### `logsSources`

**GET** `/api/v1/agent/logs/sources`

Log sources.

```typescript
client.agent.logs.logsSources(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentLogsSourcesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentLogsSourcesResponse`

**CLI:** `hoody agent logs logs-sources`

---

### `logsStats`

**GET** `/api/v1/agent/logs/stats`

Log statistics.

```typescript
client.agent.logs.logsStats(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentLogsStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentLogsStatsResponse`

**CLI:** `hoody agent logs logs-stats`

---

### `queryLogs`

**GET** `/api/v1/agent/logs`

Query logs.

```typescript
client.agent.logs.queryLogs(options?: { source?: string; level?: string; host?: string; since?: string; until?: string; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentQueryLogsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source` | `string` | No | query | Filter to a log source/facet (see logsSources). |
| `level` | `string` | No | query | Filter to a minimum log level. |
| `host` | `string` | No | query | Filter to a host. |
| `since` | `string` | No | query | Lower time/cursor bound (since_seq cursor passes through verbatim). |
| `until` | `string` | No | query | Upper time bound. |
| `limit` | `number` | No | query | Caps the result set (daemon default 200). A non-numeric value is rejected 400. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentQueryLogsResponse`

**CLI:** `hoody agent logs query-logs`

---

### `readLogEntry`

**GET** `/api/v1/agent/logs/entries/{ref}`

Read a log entry.

```typescript
client.agent.logs.readLogEntry(ref: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentReadLogEntryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `ref` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentReadLogEntryResponse`

**CLI:** `hoody agent logs read-log-entry`

---

### `streamLogs`

**GET** `/api/v1/agent/logs/stream`

Stream the log tail (SSE).

```typescript
client.agent.logs.streamLogs(options?: { source?: string; level?: string; host?: string; since_seq?: number; limit?: number; realm?: string; LastEventID?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentStreamLogsWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source` | `string` | No | query | Filter the tail to a log source/facet. |
| `level` | `string` | No | query | Filter to a minimum log level. |
| `host` | `string` | No | query | Filter to a host. |
| `since_seq` | `number` | No | query | Initial resume cursor (the Last-Event-ID header overrides it). A non-numeric value is rejected 400. |
| `limit` | `number` | No | query | Caps each poll batch. A non-numeric value is rejected 400. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `LastEventID` | `string` | No | header | SSE resume cursor — the gateway int64 seq to resume from; OVERRIDES the ?since_seq query param. Sent automatically by an SSE client on reconnect. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentStreamLogsWebSocket`

**CLI:** `hoody agent logs stream-logs`

---

## `client.agent.loops` (7 methods)

### `createLoop`

**POST** `/api/v1/agent/sessions/{id}/loops`

Create a loop.

```typescript
client.agent.loops.createLoop(id: string, data: AgentCreateLoopRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCreateLoopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentCreateLoopRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCreateLoopResponse`

**CLI:** `hoody agent loops create`

---

### `deleteLoop`

**DELETE** `/api/v1/agent/sessions/{id}/loops/{loopId}`

Delete a loop.

```typescript
client.agent.loops.deleteLoop(id: string, loopId: string, data?: AgentDeleteLoopRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDeleteLoopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `loopId` | `string` | Yes | path | Path identifier. |
| `data` | `AgentDeleteLoopRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDeleteLoopResponse`

**CLI:** `hoody agent loops delete`

---

### `listLoops`

**GET** `/api/v1/agent/sessions/{id}/loops`

List a session's loops.

```typescript
client.agent.loops.listLoops(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListLoopsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListLoopsResponse`

**CLI:** `hoody agent loops list`

---

### `listLoopsAll`

**GET** `/api/v1/agent/sessions/{id}/loops`

List a session's loops. (collect all pages)

```typescript
client.agent.loops.listLoopsAll(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent loops list`

---

### `listLoopsIterator`

**GET** `/api/v1/agent/sessions/{id}/loops`

List a session's loops. (async iterator)

```typescript
client.agent.loops.listLoopsIterator(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent loops list`

---

### `runLoopNow`

**POST** `/api/v1/agent/sessions/{id}/loops/{loopId}/run-now`

Run a loop immediately.

```typescript
client.agent.loops.runLoopNow(id: string, loopId: string, data?: AgentRunLoopNowRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentRunLoopNowResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `loopId` | `string` | Yes | path | Path identifier. |
| `data` | `AgentRunLoopNowRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentRunLoopNowResponse`

**CLI:** `hoody agent loops run-now`

---

### `updateLoop`

**PATCH** `/api/v1/agent/sessions/{id}/loops/{loopId}`

Update a loop.

```typescript
client.agent.loops.updateLoop(id: string, loopId: string, data?: AgentUpdateLoopRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentUpdateLoopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `loopId` | `string` | Yes | path | Path identifier. |
| `data` | `AgentUpdateLoopRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentUpdateLoopResponse`

**CLI:** `hoody agent loops update`

---

## `client.agent.mcp` (9 methods)

### `beginMCPWrite`

**POST** `/api/v1/agent/mcp/write-intents`

Begin an MCP config write.

```typescript
client.agent.mcp.beginMCPWrite(data: AgentBeginMCPWriteRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentBeginMCPWriteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentBeginMCPWriteRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentBeginMCPWriteResponse`

**CLI:** `hoody agent mcp begin-write`

---

### `deleteMCPServer`

**DELETE** `/api/v1/agent/mcp/servers`

Delete an MCP server.

```typescript
client.agent.mcp.deleteMCPServer(data: AgentDeleteMCPServerRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDeleteMCPServerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentDeleteMCPServerRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDeleteMCPServerResponse`

**CLI:** `hoody agent mcp delete`

---

### `importMCPServers`

**POST** `/api/v1/agent/mcp/import`

Import MCP servers from another tool's config.

```typescript
client.agent.mcp.importMCPServers(data: AgentImportMCPServersRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentImportMCPServersResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentImportMCPServersRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentImportMCPServersResponse`

**CLI:** `hoody agent mcp import`

---

### `listMCPServers`

**GET** `/api/v1/agent/mcp/servers`

List configured MCP servers.

```typescript
client.agent.mcp.listMCPServers(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListMCPServersResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListMCPServersResponse`

**CLI:** `hoody agent mcp list`

---

### `parseMCPImport`

**POST** `/api/v1/agent/mcp/parse`

Preview an MCP config import.

```typescript
client.agent.mcp.parseMCPImport(data: AgentParseMCPImportRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentParseMCPImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentParseMCPImportRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentParseMCPImportResponse`

**CLI:** `hoody agent mcp parse`

---

### `probeMCPServer`

**POST** `/api/v1/agent/mcp/probe`

Probe an MCP server without saving it.

```typescript
client.agent.mcp.probeMCPServer(data: AgentProbeMCPServerRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentProbeMCPServerRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody agent mcp probe`

---

### `reconnectMCP`

**POST** `/api/v1/agent/mcp/reconnect`

Reload MCP config and reconnect.

```typescript
client.agent.mcp.reconnectMCP(data: AgentReconnectMCPRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentReconnectMCPResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentReconnectMCPRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentReconnectMCPResponse`

**CLI:** `hoody agent mcp reconnect`

---

### `setMCPServerEnabled`

**POST** `/api/v1/agent/mcp/servers/enable`

Enable or disable an MCP server.

```typescript
client.agent.mcp.setMCPServerEnabled(data: AgentSetMCPServerEnabledRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetMCPServerEnabledResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSetMCPServerEnabledRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetMCPServerEnabledResponse`

**CLI:** `hoody agent mcp set-enabled`

---

### `upsertMCPServer`

**PUT** `/api/v1/agent/mcp/servers`

Create or update an MCP server.

```typescript
client.agent.mcp.upsertMCPServer(data: AgentUpsertMCPServerRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentUpsertMCPServerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentUpsertMCPServerRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentUpsertMCPServerResponse`

**CLI:** `hoody agent mcp upsert`

---

## `client.agent.memory` (15 methods)

### `consolidateMemory`

**POST** `/api/v1/agent/memory/consolidate`

Trigger a memory consolidation pass (human-only).

```typescript
client.agent.memory.consolidateMemory(data: AgentConsolidateMemoryRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentConsolidateMemoryRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody agent memory consolidate`

---

### `deleteMemoryItem`

**DELETE** `/api/v1/agent/memory/items`

Delete a memory item.

```typescript
client.agent.memory.deleteMemoryItem(data: AgentDeleteMemoryItemRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDeleteMemoryItemResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentDeleteMemoryItemRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDeleteMemoryItemResponse`

**CLI:** `hoody agent memory delete-item`

---

### `editMemoryItem`

**PATCH** `/api/v1/agent/memory/items/{id}`

Edit a memory item.

```typescript
client.agent.memory.editMemoryItem(id: string, data?: AgentEditMemoryItemRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentEditMemoryItemResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentEditMemoryItemRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentEditMemoryItemResponse`

**CLI:** `hoody agent memory edit-item`

---

### `flushMemory`

**POST** `/api/v1/agent/memory/flush`

Flush the memory store.

```typescript
client.agent.memory.flushMemory(data?: AgentFlushMemoryRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentFlushMemoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentFlushMemoryRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentFlushMemoryResponse`

**CLI:** `hoody agent memory flush`

---

### `getMemoryGraph`

**GET** `/api/v1/agent/memory/graph`

Read a project's memory relation graph.

```typescript
client.agent.memory.getMemoryGraph(options?: { project?: string; node_type?: string; limit?: number; offset?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetMemoryGraphResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key whose graph to read. |
| `node_type` | `string` | No | query | Optional node-type filter. |
| `limit` | `number` | No | query | Maximum nodes/edges to return. |
| `offset` | `number` | No | query | Pagination offset into the graph. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetMemoryGraphResponse`

**CLI:** `hoody agent memory get-graph`

---

### `getMemoryItem`

**GET** `/api/v1/agent/memory/items/{id}`

Read a memory item.

```typescript
client.agent.memory.getMemoryItem(id: string, options?: { project?: string; kind?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetMemoryItemResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `project` | `string` | No | query | Project key the memory belongs to. |
| `kind` | `string` | No | query | Memory kind/store the record lives in. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetMemoryItemResponse`

**CLI:** `hoody agent memory get-item`

---

### `listMemoryItems`

**GET** `/api/v1/agent/memory/items`

List memory items.

```typescript
client.agent.memory.listMemoryItems(options?: { project?: string; kind?: string; type?: string; query?: string; page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListMemoryItemsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key to scope the listing to. |
| `kind` | `string` | No | query | Memory kind/store to filter by. |
| `type` | `string` | No | query | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | No | query | Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | No | query | 1-based page number. |
| `limit` | `number` | No | query | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListMemoryItemsResponse`

**CLI:** `hoody agent memory list-items`

---

### `listMemoryItemsAll`

**GET** `/api/v1/agent/memory/items`

List memory items. (collect all pages)

```typescript
client.agent.memory.listMemoryItemsAll(options?: { project?: string; kind?: string; type?: string; query?: string; page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key to scope the listing to. |
| `kind` | `string` | No | query | Memory kind/store to filter by. |
| `type` | `string` | No | query | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | No | query | Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | No | query | 1-based page number. |
| `limit` | `number` | No | query | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent memory list-items`

---

### `listMemoryItemsIterator`

**GET** `/api/v1/agent/memory/items`

List memory items. (async iterator)

```typescript
client.agent.memory.listMemoryItemsIterator(options?: { project?: string; kind?: string; type?: string; query?: string; page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key to scope the listing to. |
| `kind` | `string` | No | query | Memory kind/store to filter by. |
| `type` | `string` | No | query | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | No | query | Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | No | query | 1-based page number. |
| `limit` | `number` | No | query | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent memory list-items`

---

### `listMemoryProjects`

**GET** `/api/v1/agent/memory/projects`

List memory projects.

```typescript
client.agent.memory.listMemoryProjects(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListMemoryProjectsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListMemoryProjectsResponse`

**CLI:** `hoody agent memory list-projects`

---

### `listMemoryProjectsAll`

**GET** `/api/v1/agent/memory/projects`

List memory projects. (collect all pages)

```typescript
client.agent.memory.listMemoryProjectsAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent memory list-projects`

---

### `listMemoryProjectsIterator`

**GET** `/api/v1/agent/memory/projects`

List memory projects. (async iterator)

```typescript
client.agent.memory.listMemoryProjectsIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent memory list-projects`

---

### `saveMemoryItem`

**POST** `/api/v1/agent/memory/items`

Save a memory item.

```typescript
client.agent.memory.saveMemoryItem(data: AgentSaveMemoryItemRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSaveMemoryItemResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSaveMemoryItemRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSaveMemoryItemResponse`

**CLI:** `hoody agent memory save-item`

---

### `searchMemory`

**POST** `/api/v1/agent/memory/search`

Search memory (hybrid recall).

```typescript
client.agent.memory.searchMemory(data?: AgentSearchMemoryRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSearchMemoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSearchMemoryRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSearchMemoryResponse`

**CLI:** `hoody agent memory search`

---

### `setMemoryEnabled`

**PUT** `/api/v1/agent/memory/enabled`

Toggle memory capture.

```typescript
client.agent.memory.setMemoryEnabled(data?: AgentSetMemoryEnabledRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetMemoryEnabledResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSetMemoryEnabledRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetMemoryEnabledResponse`

**CLI:** `hoody agent memory set-enabled`

---

## `client.agent.models` (22 methods)

### `addProviderAccount`

**POST** `/api/v1/agent/providers/{id}/auth/accounts`

Add an OAuth account to a provider's pool.

```typescript
client.agent.models.addProviderAccount(id: string, data?: AgentAddProviderAccountRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentAddProviderAccountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentAddProviderAccountRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentAddProviderAccountResponse`

**CLI:** `hoody agent models add-provider-account`

---

### `deleteProviderAPIKey`

**DELETE** `/api/v1/agent/providers/{id}/auth/api-key`

Delete a provider API key.

```typescript
client.agent.models.deleteProviderAPIKey(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDeleteProviderAPIKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDeleteProviderAPIKeyResponse`

**CLI:** `hoody agent models delete-provider-api-key`

---

### `getModel`

**GET** `/api/v1/agent/models/{spec}`

Get a model by spec.

```typescript
client.agent.models.getModel(spec: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `spec` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetModelResponse`

**CLI:** `hoody agent models get`

---

### `getProvider`

**GET** `/api/v1/agent/providers/{id}`

Get a provider.

```typescript
client.agent.models.getProvider(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetProviderResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetProviderResponse`

**CLI:** `hoody agent models get-provider`

---

### `getProviderAuth`

**GET** `/api/v1/agent/providers/{id}/auth`

Get a provider's auth status.

```typescript
client.agent.models.getProviderAuth(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetProviderAuthResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetProviderAuthResponse`

**CLI:** `hoody agent models get-provider-auth`

---

### `listModels`

**GET** `/api/v1/agent/models`

List models.

```typescript
client.agent.models.listModels(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListModelsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListModelsResponse`

**CLI:** `hoody agent models list`

---

### `listModelsAll`

**GET** `/api/v1/agent/models`

List models. (collect all pages)

```typescript
client.agent.models.listModelsAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent models list`

---

### `listModelsIterator`

**GET** `/api/v1/agent/models`

List models. (async iterator)

```typescript
client.agent.models.listModelsIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent models list`

---

### `listProviderAccounts`

**GET** `/api/v1/agent/providers/{id}/auth/accounts`

List a provider's OAuth account pool.

```typescript
client.agent.models.listProviderAccounts(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListProviderAccountsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListProviderAccountsResponse`

**CLI:** `hoody agent models list-provider-accounts`

---

### `listProviderAccountsAll`

**GET** `/api/v1/agent/providers/{id}/auth/accounts`

List a provider's OAuth account pool. (collect all pages)

```typescript
client.agent.models.listProviderAccountsAll(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent models list-provider-accounts`

---

### `listProviderAccountsIterator`

**GET** `/api/v1/agent/providers/{id}/auth/accounts`

List a provider's OAuth account pool. (async iterator)

```typescript
client.agent.models.listProviderAccountsIterator(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent models list-provider-accounts`

---

### `listProviders`

**GET** `/api/v1/agent/providers`

List LLM providers.

```typescript
client.agent.models.listProviders(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListProvidersResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListProvidersResponse`

**CLI:** `hoody agent models list-providers`

---

### `listProvidersAll`

**GET** `/api/v1/agent/providers`

List LLM providers. (collect all pages)

```typescript
client.agent.models.listProvidersAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent models list-providers`

---

### `listProvidersIterator`

**GET** `/api/v1/agent/providers`

List LLM providers. (async iterator)

```typescript
client.agent.models.listProvidersIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent models list-providers`

---

### `logoutProviderOAuth`

**DELETE** `/api/v1/agent/providers/{id}/auth/oauth`

Remove a provider's OAuth login.

```typescript
client.agent.models.logoutProviderOAuth(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentLogoutProviderOAuthResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentLogoutProviderOAuthResponse`

**CLI:** `hoody agent models logout-provider-o-auth`

---

### `pollProviderOAuth`

**GET** `/api/v1/agent/providers/{id}/auth/oauth/{job}`

Poll a provider OAuth login.

```typescript
client.agent.models.pollProviderOAuth(id: string, job: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentPollProviderOAuthResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `job` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentPollProviderOAuthResponse`

**CLI:** `hoody agent models poll-provider-o-auth`

---

### `removeProviderAccount`

**DELETE** `/api/v1/agent/providers/{id}/auth/accounts/{key}`

Remove a pooled OAuth account.

```typescript
client.agent.models.removeProviderAccount(id: string, key: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentRemoveProviderAccountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `key` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentRemoveProviderAccountResponse`

**CLI:** `hoody agent models remove-provider-account`

---

### `setProviderAccountActive`

**PUT** `/api/v1/agent/providers/{id}/auth/accounts/{key}/active`

Make a pooled OAuth account active.

```typescript
client.agent.models.setProviderAccountActive(id: string, key: string, data?: AgentSetProviderAccountActiveRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetProviderAccountActiveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `key` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetProviderAccountActiveRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetProviderAccountActiveResponse`

**CLI:** `hoody agent models set-provider-account-active`

---

### `setProviderAPIKey`

**PUT** `/api/v1/agent/providers/{id}/auth/api-key`

Store a provider API key.

```typescript
client.agent.models.setProviderAPIKey(id: string, data: AgentSetProviderAPIKeyRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetProviderAPIKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetProviderAPIKeyRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetProviderAPIKeyResponse`

**CLI:** `hoody agent models set-provider-api-key`

---

### `setProviderDefault`

**PUT** `/api/v1/agent/providers/{id}/auth/default`

Set a provider's default credential method.

```typescript
client.agent.models.setProviderDefault(id: string, data: AgentSetProviderDefaultRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetProviderDefaultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetProviderDefaultRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetProviderDefaultResponse`

**CLI:** `hoody agent models set-provider-default`

---

### `startProviderOAuth`

**POST** `/api/v1/agent/providers/{id}/auth/oauth`

Start a provider OAuth login.

```typescript
client.agent.models.startProviderOAuth(id: string, data?: AgentStartProviderOAuthRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentStartProviderOAuthResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentStartProviderOAuthRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentStartProviderOAuthResponse`

**CLI:** `hoody agent models start-provider-o-auth`

---

### `submitProviderOAuthCode`

**POST** `/api/v1/agent/providers/{id}/auth/oauth/{job}/code`

Submit a provider OAuth authorization code.

```typescript
client.agent.models.submitProviderOAuthCode(id: string, job: string, data: AgentSubmitProviderOAuthCodeRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSubmitProviderOAuthCodeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `job` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSubmitProviderOAuthCodeRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSubmitProviderOAuthCodeResponse`

**CLI:** `hoody agent models submit-provider-o-auth-code`

---

## `client.agent.sessions` (27 methods)

### `answerAssist`

**POST** `/api/v1/agent/sessions/{id}/answer:assist`

Propose answers for a parked question (helper model).

```typescript
client.agent.sessions.answerAssist(id: string, data?: AgentAnswerAssistRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentAnswerAssistResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentAnswerAssistRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentAnswerAssistResponse`

**CLI:** `hoody agent sessions answer-assist`

---

### `answerQuestion`

**POST** `/api/v1/agent/sessions/{id}/answer`

Answer a parked question gate.

```typescript
client.agent.sessions.answerQuestion(id: string, data?: AgentAnswerQuestionRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentAnswerQuestionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentAnswerQuestionRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentAnswerQuestionResponse`

**CLI:** `hoody agent sessions answer-question`

---

### `cancelSession`

**POST** `/api/v1/agent/sessions/{id}/cancel`

Cancel the active turn (Esc).

```typescript
client.agent.sessions.cancelSession(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCancelSessionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCancelSessionResponse`

**CLI:** `hoody agent sessions cancel`

---

### `closeSession`

**POST** `/api/v1/agent/sessions/{id}/close`

Close the session (teardown).

```typescript
client.agent.sessions.closeSession(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCloseSessionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCloseSessionResponse`

**CLI:** `hoody agent sessions close`

---

### `confirmGate`

**POST** `/api/v1/agent/sessions/{id}/confirm`

Answer a parked confirm gate.

```typescript
client.agent.sessions.confirmGate(id: string, data?: AgentConfirmGateRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentConfirmGateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentConfirmGateRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentConfirmGateResponse`

**CLI:** `hoody agent sessions confirm-gate`

---

### `createSession`

**POST** `/api/v1/agent/sessions`

Create, fork, or attach a session.

```typescript
client.agent.sessions.createSession(data?: AgentCreateSessionRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCreateSessionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentCreateSessionRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCreateSessionResponse`

**CLI:** `hoody agent sessions create`

---

### `deleteSession`

**DELETE** `/api/v1/agent/sessions/{id}`

Close (and optionally hard-delete) a session.

```typescript
client.agent.sessions.deleteSession(id: string, options?: { hard?: boolean; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDeleteSessionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `hard` | `boolean` | No | query | When true, also remove the persisted session record (not just the live connection). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDeleteSessionResponse`

**CLI:** `hoody agent sessions delete`

---

### `getSession`

**GET** `/api/v1/agent/sessions/{id}`

Get a session summary.

```typescript
client.agent.sessions.getSession(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetSessionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetSessionResponse`

**CLI:** `hoody agent sessions get`

---

### `getSessionTranscript`

**GET** `/api/v1/agent/sessions/{id}/transcript`

Read a session's transcript without attaching.

```typescript
client.agent.sessions.getSessionTranscript(id: string, options?: { after_turn?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetSessionTranscriptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `after_turn` | `number` | No | query | Exclusive completed-turn skip cursor: return content strictly after completed turn N (0 = full transcript; values past the end clamp; negative/non-integer = 400). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetSessionTranscriptResponse`

---

### `listSessionCwds`

**GET** `/api/v1/agent/sessions/cwds`

List distinct session working directories.

```typescript
client.agent.sessions.listSessionCwds(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListSessionCwdsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListSessionCwdsResponse`

**CLI:** `hoody agent sessions list-cwds`

---

### `listSessions`

**GET** `/api/v1/agent/sessions`

List sessions.

```typescript
client.agent.sessions.listSessions(options?: { include_system?: boolean; page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListSessionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also include daemon-owned system/resident sessions in the listing. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListSessionsResponse`

**CLI:** `hoody agent sessions list`

---

### `listSessionsAll`

**GET** `/api/v1/agent/sessions`

List sessions. (collect all pages)

```typescript
client.agent.sessions.listSessionsAll(options?: { include_system?: boolean; page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also include daemon-owned system/resident sessions in the listing. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent sessions list`

---

### `listSessionsIterator`

**GET** `/api/v1/agent/sessions`

List sessions. (async iterator)

```typescript
client.agent.sessions.listSessionsIterator(options?: { include_system?: boolean; page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also include daemon-owned system/resident sessions in the listing. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent sessions list`

---

### `postSessionMessage`

**POST** `/api/v1/agent/sessions/{id}/messages`

Dispatch a turn (fire-and-observe).

```typescript
client.agent.sessions.postSessionMessage(id: string, data?: AgentPostSessionMessageRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentPostSessionMessageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentPostSessionMessageRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentPostSessionMessageResponse`

**CLI:** `hoody agent sessions post-message`

---

### `postWorkflowMessage`

**POST** `/api/v1/agent/sessions/{id}/workflow/messages`

Send a message to a running workflow.

```typescript
client.agent.sessions.postWorkflowMessage(id: string, data?: AgentPostWorkflowMessageRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentPostWorkflowMessageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentPostWorkflowMessageRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentPostWorkflowMessageResponse`

**CLI:** `hoody agent sessions post-workflow-message`

---

### `promptStream`

**POST** `/api/v1/agent/sessions/{id}/prompt:stream`

Dispatch a turn and stream the response.

```typescript
client.agent.sessions.promptStream(id: string, data?: AgentPromptStreamRequest, options?: { policy?: string; realm?: string; XHoodyGatePolicy?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentPromptStreamWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentPromptStreamRequest` | No | body |  |
| `policy` | `string` | No | query | auto_approve auto-answers confirm gates for the life of the stream (alias of the X-Hoody-Gate-Policy header); off by default. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyGatePolicy` | `string` | No | header | Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture (off by default; the in:query alias is ?policy=). Any other value is rejected 400. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentPromptStreamWebSocket`

**CLI:** `hoody agent sessions prompt-stream`

---

### `promptSync`

**POST** `/api/v1/agent/sessions/{id}/prompt:sync`

Dispatch a turn and block to completion.

```typescript
client.agent.sessions.promptSync(id: string, data?: AgentPromptSyncRequest, options?: { policy?: string; realm?: string; XHoodyGatePolicy?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentPromptSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentPromptSyncRequest` | No | body |  |
| `policy` | `string` | No | query | auto_approve adopts the headless auto-answer posture (alias of the X-Hoody-Gate-Policy header); off by default. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyGatePolicy` | `string` | No | header | Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture (off by default; the in:query alias is ?policy=). Any other value is rejected 400. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentPromptSyncResponse`

**CLI:** `hoody agent sessions prompt-sync`

---

### `replaySession`

**GET** `/api/v1/agent/sessions/{id}/replay`

Replay a live session's buffered events.

```typescript
client.agent.sessions.replaySession(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentReplaySessionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentReplaySessionResponse`

**CLI:** `hoody agent sessions replay`

---

### `setSessionAgent`

**PATCH** `/api/v1/agent/sessions/{id}/agent`

Switch the chat agent.

```typescript
client.agent.sessions.setSessionAgent(id: string, data?: AgentSetSessionAgentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetSessionAgentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetSessionAgentRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetSessionAgentResponse`

**CLI:** `hoody agent sessions set-chat-agent`

---

### `setSessionAutoReply`

**PATCH** `/api/v1/agent/sessions/{id}/auto-reply`

Arm/disarm the auto-reply loop.

```typescript
client.agent.sessions.setSessionAutoReply(id: string, data?: AgentSetSessionAutoReplyRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetSessionAutoReplyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetSessionAutoReplyRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetSessionAutoReplyResponse`

**CLI:** `hoody agent sessions set-auto-reply`

---

### `setSessionAutoReplyWrites`

**PATCH** `/api/v1/agent/sessions/{id}/auto-reply/writes`

Flip the auto-reply write opt-in.

```typescript
client.agent.sessions.setSessionAutoReplyWrites(id: string, data?: AgentSetSessionAutoReplyWritesRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetSessionAutoReplyWritesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetSessionAutoReplyWritesRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetSessionAutoReplyWritesResponse`

**CLI:** `hoody agent sessions set-auto-reply-writes`

---

### `setSessionEffort`

**PATCH** `/api/v1/agent/sessions/{id}/effort`

Set reasoning effort.

```typescript
client.agent.sessions.setSessionEffort(id: string, data?: AgentSetSessionEffortRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetSessionEffortResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetSessionEffortRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetSessionEffortResponse`

**CLI:** `hoody agent sessions set-effort`

---

### `setSessionHoodyEnv`

**PATCH** `/api/v1/agent/sessions/{id}/hoody-env`

Toggle Hoody shell-env injection.

```typescript
client.agent.sessions.setSessionHoodyEnv(id: string, data?: AgentSetSessionHoodyEnvRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetSessionHoodyEnvResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetSessionHoodyEnvRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetSessionHoodyEnvResponse`

**CLI:** `hoody agent sessions set-hoody-env`

---

### `setSessionModel`

**PATCH** `/api/v1/agent/sessions/{id}/model`

Switch the session model.

```typescript
client.agent.sessions.setSessionModel(id: string, data: AgentSetSessionModelRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetSessionModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetSessionModelRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetSessionModelResponse`

**CLI:** `hoody agent sessions set-model`

---

### `setSessionVerbosity`

**PATCH** `/api/v1/agent/sessions/{id}/verbosity`

Set response verbosity.

```typescript
client.agent.sessions.setSessionVerbosity(id: string, data?: AgentSetSessionVerbosityRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetSessionVerbosityResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetSessionVerbosityRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetSessionVerbosityResponse`

**CLI:** `hoody agent sessions set-verbosity`

---

### `streamSession`

**GET** `/api/v1/agent/sessions/{id}/stream`

Attach to a session's event stream (WebSocket / SSE).

```typescript
client.agent.sessions.streamSession(id: string, options?: { since?: number; realm?: string; LastEventID?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentStreamSessionWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `since` | `number` | No | query | Resume from this gateway int64 seq (also accepted as the Last-Event-ID header). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `LastEventID` | `string` | No | header | SSE resume cursor — the gateway int64 seq to resume from (the in:header alias of ?since); sent automatically by an SSE client on reconnect. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentStreamSessionWebSocket`

**CLI:** `hoody agent sessions stream`

---

### `trimSession`

**POST** `/api/v1/agent/sessions/{id}/trim`

Trim session history to a turn index.

```typescript
client.agent.sessions.trimSession(id: string, data?: AgentTrimSessionRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentTrimSessionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentTrimSessionRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentTrimSessionResponse`

**CLI:** `hoody agent sessions trim`

---

## `client.agent.settings` (11 methods)

### `deleteFusion`

**DELETE** `/api/v1/agent/settings/fusion/{slug}`

Delete a fusion composite.

```typescript
client.agent.settings.deleteFusion(slug: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDeleteFusionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `slug` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDeleteFusionResponse`

**CLI:** `hoody agent settings delete-fusion`

---

### `getACPStatus`

**GET** `/api/v1/agent/acp/agents`

Get BYOA ACP backend status.

```typescript
client.agent.settings.getACPStatus(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetACPStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetACPStatusResponse`

**CLI:** `hoody agent settings get-acp-status`

---

### `getSettings`

**GET** `/api/v1/agent/settings`

Get settings.

```typescript
client.agent.settings.getSettings(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetSettingsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetSettingsResponse`

**CLI:** `hoody agent settings get`

---

### `listFusion`

**GET** `/api/v1/agent/settings/fusion`

List fusion composites.

```typescript
client.agent.settings.listFusion(options?: { include_invalid?: boolean; page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListFusionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_invalid` | `boolean` | No | query | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is editable/deletable. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListFusionResponse`

**CLI:** `hoody agent settings list-fusion`

---

### `listFusionAll`

**GET** `/api/v1/agent/settings/fusion`

List fusion composites. (collect all pages)

```typescript
client.agent.settings.listFusionAll(options?: { include_invalid?: boolean; page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_invalid` | `boolean` | No | query | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is editable/deletable. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent settings list-fusion`

---

### `listFusionIterator`

**GET** `/api/v1/agent/settings/fusion`

List fusion composites. (async iterator)

```typescript
client.agent.settings.listFusionIterator(options?: { include_invalid?: boolean; page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_invalid` | `boolean` | No | query | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is editable/deletable. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent settings list-fusion`

---

### `patchSettings`

**PATCH** `/api/v1/agent/settings`

Patch settings.

```typescript
client.agent.settings.patchSettings(data: AgentPatchSettingsRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentPatchSettingsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentPatchSettingsRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentPatchSettingsResponse`

**CLI:** `hoody agent settings patch`

---

### `setACPAgentModel`

**PUT** `/api/v1/agent/acp/agents/{agent}/model`

Set a BYOA backend's default model and effort.

```typescript
client.agent.settings.setACPAgentModel(agent: string, data?: AgentSetACPAgentModelRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetACPAgentModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetACPAgentModelRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetACPAgentModelResponse`

---

### `setACPEnabled`

**PUT** `/api/v1/agent/acp/agents/{agent}/enabled`

Enable or disable a BYOA ACP backend.

```typescript
client.agent.settings.setACPEnabled(agent: string, data?: AgentSetACPEnabledRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetACPEnabledResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetACPEnabledRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetACPEnabledResponse`

---

### `setACPSecret`

**PUT** `/api/v1/agent/acp/agents/{agent}/secrets/{key}`

Store an ACP per-agent secret value.

```typescript
client.agent.settings.setACPSecret(agent: string, key: string, data?: AgentSetACPSecretRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSetACPSecretResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | Path identifier. |
| `key` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSetACPSecretRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSetACPSecretResponse`

**CLI:** `hoody agent settings set-acp-secret`

---

### `upsertFusion`

**PUT** `/api/v1/agent/settings/fusion/{slug}`

Create or update a fusion composite.

```typescript
client.agent.settings.upsertFusion(slug: string, data: AgentUpsertFusionRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentUpsertFusionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `slug` | `string` | Yes | path | Path identifier. |
| `data` | `AgentUpsertFusionRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentUpsertFusionResponse`

**CLI:** `hoody agent settings upsert-fusion`

---

## `client.agent.skills` (17 methods)

### `applySkillImport`

**POST** `/api/v1/agent/skills/import/apply`

Apply a skill import.

```typescript
client.agent.skills.applySkillImport(data?: AgentApplySkillImportRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentApplySkillImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentApplySkillImportRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentApplySkillImportResponse`

**CLI:** `hoody agent skills apply-import`

---

### `clearSkillHubCache`

**DELETE** `/api/v1/agent/skills/hub/cache`

Clear the skill hub cache.

```typescript
client.agent.skills.clearSkillHubCache(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentClearSkillHubCacheResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentClearSkillHubCacheResponse`

**CLI:** `hoody agent skills clear-hub-cache`

---

### `createSkill`

**POST** `/api/v1/agent/skills`

Create a skill.

```typescript
client.agent.skills.createSkill(data: AgentCreateSkillRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCreateSkillResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentCreateSkillRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCreateSkillResponse`

**CLI:** `hoody agent skills create`

---

### `deleteSkill`

**POST** `/api/v1/agent/skills/delete`

Delete a skill.

```typescript
client.agent.skills.deleteSkill(data: AgentDeleteSkillRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDeleteSkillResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentDeleteSkillRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDeleteSkillResponse`

**CLI:** `hoody agent skills delete`

---

### `getSkillHubCache`

**GET** `/api/v1/agent/skills/hub/cache`

Skill hub cache stats.

```typescript
client.agent.skills.getSkillHubCache(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetSkillHubCacheResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetSkillHubCacheResponse`

**CLI:** `hoody agent skills get-hub-cache`

---

### `getSkillSource`

**GET** `/api/v1/agent/skills/source`

Read a skill's source.

```typescript
client.agent.skills.getSkillSource(options?: { root_dir?: string; rel_dir?: string; root?: string; rel?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetSkillSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `root_dir` | `string` | No | query | Skill root directory (identity; alias: root). |
| `rel_dir` | `string` | No | query | Skill relative directory (identity; alias: rel). |
| `root` | `string` | No | query | Friendly alias of root_dir (translated to root_dir server-side). |
| `rel` | `string` | No | query | Friendly alias of rel_dir (translated to rel_dir server-side). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetSkillSourceResponse`

**CLI:** `hoody agent skills get-source`

---

### `installSkillHub`

**POST** `/api/v1/agent/skills/hub/install`

Install a hub skill.

```typescript
client.agent.skills.installSkillHub(data: AgentInstallSkillHubRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentInstallSkillHubResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentInstallSkillHubRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentInstallSkillHubResponse`

**CLI:** `hoody agent skills install-hub`

---

### `listSkills`

**GET** `/api/v1/agent/skills`

List skills.

```typescript
client.agent.skills.listSkills(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListSkillsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListSkillsResponse`

**CLI:** `hoody agent skills list`

---

### `listSkillsAll`

**GET** `/api/v1/agent/skills`

List skills. (collect all pages)

```typescript
client.agent.skills.listSkillsAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent skills list`

---

### `listSkillsIterator`

**GET** `/api/v1/agent/skills`

List skills. (async iterator)

```typescript
client.agent.skills.listSkillsIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent skills list`

---

### `previewSkillHub`

**GET** `/api/v1/agent/skills/hub/preview`

Preview a hub skill.

```typescript
client.agent.skills.previewSkillHub(options?: { id?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentPreviewSkillHubResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | No | query | Hub skill identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentPreviewSkillHubResponse`

**CLI:** `hoody agent skills preview-hub`

---

### `putSkillSource`

**PUT** `/api/v1/agent/skills/source`

Write a skill's source.

```typescript
client.agent.skills.putSkillSource(data: AgentPutSkillSourceRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentPutSkillSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentPutSkillSourceRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentPutSkillSourceResponse`

**CLI:** `hoody agent skills put-source`

---

### `renameSkill`

**POST** `/api/v1/agent/skills/rename`

Rename a skill.

```typescript
client.agent.skills.renameSkill(data: AgentRenameSkillRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentRenameSkillResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentRenameSkillRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentRenameSkillResponse`

**CLI:** `hoody agent skills rename`

---

### `scanSkillImport`

**GET** `/api/v1/agent/skills/import/scan`

Scan for importable skills.

```typescript
client.agent.skills.scanSkillImport(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentScanSkillImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentScanSkillImportResponse`

**CLI:** `hoody agent skills scan-import`

---

### `searchSkillHub`

**GET** `/api/v1/agent/skills/hub/search`

Search the skill hub.

```typescript
client.agent.skills.searchSkillHub(options?: { q?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSearchSkillHubResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `q` | `string` | No | query | Search query. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSearchSkillHubResponse`

**CLI:** `hoody agent skills search-hub`

---

### `toggleSkill`

**POST** `/api/v1/agent/skills/toggle`

Enable/disable a skill.

```typescript
client.agent.skills.toggleSkill(data: AgentToggleSkillRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentToggleSkillResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentToggleSkillRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentToggleSkillResponse`

**CLI:** `hoody agent skills toggle`

---

### `trustSkill`

**POST** `/api/v1/agent/skills/trust`

Set a skill's trust state.

```typescript
client.agent.skills.trustSkill(data: AgentTrustSkillRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentTrustSkillResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentTrustSkillRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentTrustSkillResponse`

**CLI:** `hoody agent skills trust`

---

## `client.agent.statistics` (3 methods)

### `getStatistics`

**GET** `/api/v1/agent/statistics`

Cross-session statistics.

```typescript
client.agent.statistics.getStatistics(options?: { scope?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetStatisticsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `scope` | `string` | No | query | cwd (default) rolls up the current working directory; all rolls up every session. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetStatisticsResponse`

**CLI:** `hoody agent statistics get`

---

### `usageByAccount`

**GET** `/api/v1/agent/usage/by-account`

Usage rollup by account.

```typescript
client.agent.statistics.usageByAccount(options?: { since?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentUsageByAccountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `since` | `number` | No | query | Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentUsageByAccountResponse`

**CLI:** `hoody agent statistics usage-by-account`

---

### `usageByModel`

**GET** `/api/v1/agent/usage/by-model`

Usage rollup by model.

```typescript
client.agent.statistics.usageByModel(options?: { since?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentUsageByModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `since` | `number` | No | query | Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentUsageByModelResponse`

**CLI:** `hoody agent statistics usage-by-model`

---

## `client.agent.system` (5 methods)

### `docs`

**GET** `/api/v1/agent/docs`

API documentation UI.

```typescript
client.agent.system.docs(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody agent system docs`

---

### `healthCheck`

**GET** `/api/v1/agent/health`

Standardized health check.

```typescript
client.agent.system.healthCheck(): Promise<AgentHealthCheckResponse>
```

**Returns:** `AgentHealthCheckResponse`

**CLI:** `hoody agent system health-check`

---

### `metrics`

**GET** `/api/v1/agent/metrics`

Prometheus metrics.

```typescript
client.agent.system.metrics(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody agent system metrics`

---

### `openapiJSON`

**GET** `/api/v1/agent/openapi.json`

OpenAPI spec (JSON).

```typescript
client.agent.system.openapiJSON(): Promise<AgentOpenapiJSONResponse>
```

**Returns:** `AgentOpenapiJSONResponse`

**CLI:** `hoody agent system openapi-json`

---

### `openapiYAML`

**GET** `/api/v1/agent/openapi.yaml`

OpenAPI spec (YAML).

```typescript
client.agent.system.openapiYAML(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody agent system openapi-yaml`

---

## `client.agent.tasks` (4 methods)

### `cancelAllTasks`

**POST** `/api/v1/agent/sessions/{id}/tasks/cancel`

Cancel all background tasks.

```typescript
client.agent.tasks.cancelAllTasks(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCancelAllTasksResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCancelAllTasksResponse`

**CLI:** `hoody agent tasks cancel-all`

---

### `cancelTask`

**POST** `/api/v1/agent/sessions/{id}/tasks/{tid}/cancel`

Cancel a background task.

```typescript
client.agent.tasks.cancelTask(id: string, tid: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCancelTaskResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `tid` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCancelTaskResponse`

**CLI:** `hoody agent tasks cancel`

---

### `listTasks`

**GET** `/api/v1/agent/sessions/{id}/tasks`

Request the session's task snapshot.

```typescript
client.agent.tasks.listTasks(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListTasksResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListTasksResponse`

**CLI:** `hoody agent tasks list`

---

### `requestTaskTranscript`

**GET** `/api/v1/agent/sessions/{id}/tasks/{tid}/transcript`

Request a task's transcript (upsert-poll).

```typescript
client.agent.tasks.requestTaskTranscript(id: string, tid: string, options?: { after_seq?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentRequestTaskTranscriptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `tid` | `string` | Yes | path | Path identifier. |
| `after_seq` | `number` | No | query | int64 upsert-poll cursor; entries at/below it are re-sent (default 0). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentRequestTaskTranscriptResponse`

**CLI:** `hoody agent tasks request-transcript`

---

## `client.agent.todos` (19 methods)

### `approveTodoProposal`

**POST** `/api/v1/agent/todos/{id}/proposals/{pid}/approve`

Approve a todo proposal.

```typescript
client.agent.todos.approveTodoProposal(id: string, pid: string, data?: AgentApproveTodoProposalRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentApproveTodoProposalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `pid` | `string` | Yes | path | Path identifier. |
| `data` | `AgentApproveTodoProposalRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentApproveTodoProposalResponse`

**CLI:** `hoody agent todos approve-proposal`

---

### `archiveTodo`

**POST** `/api/v1/agent/todos/{id}/archive`

Archive a todo.

```typescript
client.agent.todos.archiveTodo(id: string, data: AgentArchiveTodoRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentArchiveTodoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentArchiveTodoRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentArchiveTodoResponse`

**CLI:** `hoody agent todos archive`

---

### `cancelTodoRun`

**POST** `/api/v1/agent/todos/{id}/cancel-run`

Cancel a todo's run.

```typescript
client.agent.todos.cancelTodoRun(id: string, data?: AgentCancelTodoRunRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCancelTodoRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentCancelTodoRunRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCancelTodoRunResponse`

**CLI:** `hoody agent todos cancel-run`

---

### `claimTodo`

**POST** `/api/v1/agent/todos/{id}/claim`

Claim a todo.

```typescript
client.agent.todos.claimTodo(id: string, data?: AgentClaimTodoRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentClaimTodoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentClaimTodoRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentClaimTodoResponse`

**CLI:** `hoody agent todos claim`

---

### `createTodo`

**POST** `/api/v1/agent/todos`

File a todo.

```typescript
client.agent.todos.createTodo(data: AgentCreateTodoRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCreateTodoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentCreateTodoRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCreateTodoResponse`

**CLI:** `hoody agent todos create`

---

### `denyTodoProposal`

**POST** `/api/v1/agent/todos/{id}/proposals/{pid}/deny`

Deny a todo proposal.

```typescript
client.agent.todos.denyTodoProposal(id: string, pid: string, data?: AgentDenyTodoProposalRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDenyTodoProposalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `pid` | `string` | Yes | path | Path identifier. |
| `data` | `AgentDenyTodoProposalRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDenyTodoProposalResponse`

**CLI:** `hoody agent todos deny-proposal`

---

### `getTodo`

**GET** `/api/v1/agent/todos/{id}`

Read a todo.

```typescript
client.agent.todos.getTodo(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetTodoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetTodoResponse`

**CLI:** `hoody agent todos get`

---

### `getTodosRevision`

**GET** `/api/v1/agent/todos/revision`

Get the todos store revision.

```typescript
client.agent.todos.getTodosRevision(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetTodosRevisionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetTodosRevisionResponse`

**CLI:** `hoody agent todos get-revision`

---

### `listTodos`

**GET** `/api/v1/agent/todos`

List todos.

```typescript
client.agent.todos.listTodos(data?: AgentListTodosRequest, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListTodosResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentListTodosRequest` | No | body |  |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListTodosResponse`

**CLI:** `hoody agent todos list`

---

### `listTodosAll`

**GET** `/api/v1/agent/todos`

List todos. (collect all pages)

```typescript
client.agent.todos.listTodosAll(data?: AgentListTodosRequest, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentListTodosRequest` | No | body |  |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent todos list`

---

### `listTodosIterator`

**GET** `/api/v1/agent/todos`

List todos. (async iterator)

```typescript
client.agent.todos.listTodosIterator(data?: AgentListTodosRequest, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentListTodosRequest` | No | body |  |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent todos list`

---

### `messageTodo`

**POST** `/api/v1/agent/todos/{id}/message`

Comment + run an orchestrator turn.

```typescript
client.agent.todos.messageTodo(id: string, data: AgentMessageTodoRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentMessageTodoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentMessageTodoRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentMessageTodoResponse`

**CLI:** `hoody agent todos message`

---

### `postTodoComment`

**POST** `/api/v1/agent/todos/{id}/messages`

Comment on a todo.

```typescript
client.agent.todos.postTodoComment(id: string, data: AgentPostTodoCommentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentPostTodoCommentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentPostTodoCommentRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentPostTodoCommentResponse`

**CLI:** `hoody agent todos post-comment`

---

### `purgeTodos`

**POST** `/api/v1/agent/todos/purge`

Purge archived todos.

```typescript
client.agent.todos.purgeTodos(data?: AgentPurgeTodosRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentPurgeTodosResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentPurgeTodosRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentPurgeTodosResponse`

**CLI:** `hoody agent todos purge`

---

### `releaseTodo`

**POST** `/api/v1/agent/todos/{id}/release`

Release a todo.

```typescript
client.agent.todos.releaseTodo(id: string, data?: AgentReleaseTodoRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentReleaseTodoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentReleaseTodoRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentReleaseTodoResponse`

**CLI:** `hoody agent todos release`

---

### `runTodo`

**POST** `/api/v1/agent/todos/{id}/run`

Run a todo's orchestrator.

```typescript
client.agent.todos.runTodo(id: string, data?: AgentRunTodoRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentRunTodoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentRunTodoRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentRunTodoResponse`

**CLI:** `hoody agent todos run`

---

### `snoozeTodo`

**POST** `/api/v1/agent/todos/{id}/snooze`

Snooze a todo.

```typescript
client.agent.todos.snoozeTodo(id: string, data: AgentSnoozeTodoRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentSnoozeTodoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentSnoozeTodoRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentSnoozeTodoResponse`

**CLI:** `hoody agent todos snooze`

---

### `triageTodos`

**POST** `/api/v1/agent/todos/triage`

Run an LLM triage pass.

```typescript
client.agent.todos.triageTodos(data?: AgentTriageTodosRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentTriageTodosResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentTriageTodosRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentTriageTodosResponse`

**CLI:** `hoody agent todos triage`

---

### `updateTodo`

**PATCH** `/api/v1/agent/todos/{id}`

Update a todo (CAS).

```typescript
client.agent.todos.updateTodo(id: string, data: AgentUpdateTodoRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentUpdateTodoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentUpdateTodoRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentUpdateTodoResponse`

**CLI:** `hoody agent todos update`

---

## `client.agent.tools` (17 methods)

### `getTool`

**GET** `/api/v1/agent/tools/{name}`

Get one tool schema.

```typescript
client.agent.tools.getTool(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetToolResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetToolResponse`

**CLI:** `hoody agent tools get`

---

### `listReadOnlyTools`

**GET** `/api/v1/agent/tools/read-only`

List the read-only tool subset.

```typescript
client.agent.tools.listReadOnlyTools(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListReadOnlyToolsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListReadOnlyToolsResponse`

**CLI:** `hoody agent tools list-read-only`

---

### `listReadOnlyToolsAll`

**GET** `/api/v1/agent/tools/read-only`

List the read-only tool subset. (collect all pages)

```typescript
client.agent.tools.listReadOnlyToolsAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent tools list-read-only`

---

### `listReadOnlyToolsIterator`

**GET** `/api/v1/agent/tools/read-only`

List the read-only tool subset. (async iterator)

```typescript
client.agent.tools.listReadOnlyToolsIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent tools list-read-only`

---

### `listSessionMCPTools`

**GET** `/api/v1/agent/sessions/{id}/tools/mcp`

List a session's MCP tools.

```typescript
client.agent.tools.listSessionMCPTools(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListSessionMCPToolsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListSessionMCPToolsResponse`

**CLI:** `hoody agent tools list-session-mcp`

---

### `listSessionMCPToolsAll`

**GET** `/api/v1/agent/sessions/{id}/tools/mcp`

List a session's MCP tools. (collect all pages)

```typescript
client.agent.tools.listSessionMCPToolsAll(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent tools list-session-mcp`

---

### `listSessionMCPToolsIterator`

**GET** `/api/v1/agent/sessions/{id}/tools/mcp`

List a session's MCP tools. (async iterator)

```typescript
client.agent.tools.listSessionMCPToolsIterator(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent tools list-session-mcp`

---

### `listSessionTools`

**GET** `/api/v1/agent/sessions/{id}/tools`

List a session's effective tool set.

```typescript
client.agent.tools.listSessionTools(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListSessionToolsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListSessionToolsResponse`

**CLI:** `hoody agent tools list-session`

---

### `listSessionToolsAll`

**GET** `/api/v1/agent/sessions/{id}/tools`

List a session's effective tool set. (collect all pages)

```typescript
client.agent.tools.listSessionToolsAll(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent tools list-session`

---

### `listSessionToolsIterator`

**GET** `/api/v1/agent/sessions/{id}/tools`

List a session's effective tool set. (async iterator)

```typescript
client.agent.tools.listSessionToolsIterator(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent tools list-session`

---

### `listTools`

**GET** `/api/v1/agent/tools`

List the tool catalogue.

```typescript
client.agent.tools.listTools(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListToolsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListToolsResponse`

**CLI:** `hoody agent tools list`

---

### `listToolsAll`

**GET** `/api/v1/agent/tools`

List the tool catalogue. (collect all pages)

```typescript
client.agent.tools.listToolsAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent tools list`

---

### `listToolsIterator`

**GET** `/api/v1/agent/tools`

List the tool catalogue. (async iterator)

```typescript
client.agent.tools.listToolsIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent tools list`

---

### `runSessionTool`

**POST** `/api/v1/agent/sessions/{id}/tools/{name}/run`

Run a tool inside a live session (gated).

```typescript
client.agent.tools.runSessionTool(id: string, name: string, data?: AgentRunSessionToolRequest, options?: { confirm?: boolean; confirm_token?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentRunSessionToolResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentRunSessionToolRequest` | No | body |  |
| `confirm` | `boolean` | No | query | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | No | query | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentRunSessionToolResponse`

**CLI:** `hoody agent tools run-session`

---

### `runTool`

**POST** `/api/v1/agent/tools/{name}/run`

Run a tool (sessionless, gated).

```typescript
client.agent.tools.runTool(name: string, data?: AgentRunToolRequest, options?: { confirm?: boolean; confirm_token?: string; realm?: string; XHoodyToolMode?: string; XHoodyDirScope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentRunToolResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentRunToolRequest` | No | body |  |
| `confirm` | `boolean` | No | query | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | No | query | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyToolMode` | `string` | No | header | Sessionless tool-mode for the ephemeral session (e.g. read_only / full); default per the daemon. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `XHoodyDirScope` | `string` | No | header | Sessionless directory-access scope for the ephemeral session (e.g. home / full); default home. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentRunToolResponse`

**CLI:** `hoody agent tools run`

---

### `runToolAsync`

**POST** `/api/v1/agent/tools/{name}/runAsync`

Run a tool asynchronously (sessionless, gated).

```typescript
client.agent.tools.runToolAsync(name: string, data?: AgentRunToolAsyncRequest, options?: { confirm?: boolean; confirm_token?: string; realm?: string; XHoodyToolMode?: string; XHoodyDirScope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentRunToolAsyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentRunToolAsyncRequest` | No | body |  |
| `confirm` | `boolean` | No | query | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | No | query | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyToolMode` | `string` | No | header | Sessionless tool-mode for the ephemeral session (e.g. read_only / full); default per the daemon. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `XHoodyDirScope` | `string` | No | header | Sessionless directory-access scope for the ephemeral session (e.g. home / full); default home. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentRunToolAsyncResponse`

**CLI:** `hoody agent tools run-async`

---

### `streamTool`

**POST** `/api/v1/agent/tools/{name}/stream`

Run a tool with a streamed result (sessionless, gated).

```typescript
client.agent.tools.streamTool(name: string, data?: AgentStreamToolRequest, options?: { confirm?: boolean; confirm_token?: string; realm?: string; XHoodyToolMode?: string; XHoodyDirScope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentStreamToolWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentStreamToolRequest` | No | body |  |
| `confirm` | `boolean` | No | query | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | No | query | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyToolMode` | `string` | No | header | Sessionless tool-mode for the ephemeral session (e.g. read_only / full); default per the daemon. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `XHoodyDirScope` | `string` | No | header | Sessionless directory-access scope for the ephemeral session (e.g. home / full); default home. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentStreamToolWebSocket`

**CLI:** `hoody agent tools stream`

---

## `client.agent.workflows` (14 methods)

### `cancelWorkflowRun`

**POST** `/api/v1/agent/workflows/runs/{run_id}/cancel`

Cancel a workflow run.

```typescript
client.agent.workflows.cancelWorkflowRun(run_id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentCancelWorkflowRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `run_id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentCancelWorkflowRunResponse`

**CLI:** `hoody agent workflows cancel-run`

---

### `deleteWorkflow`

**DELETE** `/api/v1/agent/workflows/{name}`

Delete a workflow definition.

```typescript
client.agent.workflows.deleteWorkflow(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentDeleteWorkflowResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentDeleteWorkflowResponse`

**CLI:** `hoody agent workflows delete`

---

### `getWorkflow`

**GET** `/api/v1/agent/workflows/{name}`

Read one workflow definition.

```typescript
client.agent.workflows.getWorkflow(name: string, options?: { include_revision?: boolean; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetWorkflowResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `include_revision` | `boolean` | No | query | If "true", the tool output's first line is `revision: &lt;opaque&gt;` — pass that value as putWorkflow's expected_revision to guard against concurrent edits; the JSON below it is unchanged. Strictly parsed: exactly one value, "true" or "false"; anything else (empty, "TRUE", "1", repeated) is a 400 bad_request. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetWorkflowResponse`

**CLI:** `hoody agent workflows get`

---

### `getWorkflowRun`

**GET** `/api/v1/agent/workflows/runs/{run_id}`

Get one workflow run by id.

```typescript
client.agent.workflows.getWorkflowRun(run_id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentGetWorkflowRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `run_id` | `string` | Yes | path | Path identifier. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentGetWorkflowRunResponse`

**CLI:** `hoody agent workflows get-run`

---

### `hideWorkflow`

**POST** `/api/v1/agent/workflows/{name}/hide`

Hide or un-hide a workflow.

```typescript
client.agent.workflows.hideWorkflow(name: string, data?: AgentHideWorkflowRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentHideWorkflowResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentHideWorkflowRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentHideWorkflowResponse`

**CLI:** `hoody agent workflows hide`

---

### `listWorkflowRuns`

**GET** `/api/v1/agent/workflows/runs`

Snapshot in-flight and recent workflow runs.

```typescript
client.agent.workflows.listWorkflowRuns(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListWorkflowRunsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListWorkflowRunsResponse`

**CLI:** `hoody agent workflows list-runs`

---

### `listWorkflowRunsAll`

**GET** `/api/v1/agent/workflows/runs`

Snapshot in-flight and recent workflow runs. (collect all pages)

```typescript
client.agent.workflows.listWorkflowRunsAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent workflows list-runs`

---

### `listWorkflowRunsIterator`

**GET** `/api/v1/agent/workflows/runs`

Snapshot in-flight and recent workflow runs. (async iterator)

```typescript
client.agent.workflows.listWorkflowRunsIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent workflows list-runs`

---

### `listWorkflows`

**GET** `/api/v1/agent/workflows`

List workflow definitions.

```typescript
client.agent.workflows.listWorkflows(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentListWorkflowsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentListWorkflowsResponse`

**CLI:** `hoody agent workflows list`

---

### `listWorkflowsAll`

**GET** `/api/v1/agent/workflows`

List workflow definitions. (collect all pages)

```typescript
client.agent.workflows.listWorkflowsAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `unknown[]`

**CLI:** `hoody agent workflows list`

---

### `listWorkflowsIterator`

**GET** `/api/v1/agent/workflows`

List workflow definitions. (async iterator)

```typescript
client.agent.workflows.listWorkflowsIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody agent workflows list`

---

### `putWorkflow`

**PUT** `/api/v1/agent/workflows/{name}`

Create or replace a workflow definition.

```typescript
client.agent.workflows.putWorkflow(name: string, data: AgentPutWorkflowRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentPutWorkflowResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentPutWorkflowRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentPutWorkflowResponse`

**CLI:** `hoody agent workflows put`

---

### `resumeWorkflowRun`

**POST** `/api/v1/agent/workflows/runs/{run_id}/resume`

Resume a failed or cancelled workflow run.

```typescript
client.agent.workflows.resumeWorkflowRun(run_id: string, data: AgentResumeWorkflowRunRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentResumeWorkflowRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `run_id` | `string` | Yes | path | Path identifier. |
| `data` | `AgentResumeWorkflowRunRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentResumeWorkflowRunResponse`

---

### `runSessionWorkflow`

**POST** `/api/v1/agent/sessions/{id}/workflows/{name}/runs`

Run a workflow onto an existing session.

```typescript
client.agent.workflows.runSessionWorkflow(id: string, name: string, data?: AgentRunSessionWorkflowRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string }): Promise<AgentRunSessionWorkflowResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Path identifier. |
| `name` | `string` | Yes | path | Path identifier. |
| `data` | `AgentRunSessionWorkflowRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AgentRunSessionWorkflowResponse`

**CLI:** `hoody agent workflows run-session`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
