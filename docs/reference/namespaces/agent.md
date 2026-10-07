# `agent` — 294 methods

**Version:** 1.0.0-beta.16
**Accessor:** `client.agent`

```typescript
import * as agent from 'hoody-sdk/agent';
```

---

## `client.agent.acp` (5 methods)

### `disable`

**PUT** `/api/v1/agent/acp/agents/{agent}/enabled`

Enable or disable a BYOA ACP backend.

```typescript
client.agent.acp.disable(agent: string, data?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | The agent. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent acp disable`

---

### `enable`

**PUT** `/api/v1/agent/acp/agents/{agent}/enabled`

Enable or disable a BYOA ACP backend.

```typescript
client.agent.acp.enable(agent: string, data?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | The agent. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent acp enable`

---

### `getStatus`

**GET** `/api/v1/agent/acp/agents`

Get BYOA ACP backend status.

```typescript
client.agent.acp.getStatus(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentAcpGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentAcpGetStatusResponse`

**CLI:** `hoody agent acp status`

---

### `setModel`

**PUT** `/api/v1/agent/acp/agents/{agent}/model`

Set a BYOA backend's default model and effort.

```typescript
client.agent.acp.setModel(agent: string, data?: AgentAcpSetModelRequest): Promise<AgentAcpSetModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `agent` | `string` | Yes | path | The agent. |
| `data` | `AgentAcpSetModelRequest` | No | body |  |

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

## `client.agent` (3 methods)

### `signIn`

**POST** `/api/v1/agent/hoody/auth/bootstrap`

Sign this container's agent in to the Hoody platform with a token of the box's owner. Until then the agent's shell and file tools answer "not logged in".

```typescript
client.agent.signIn(data: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `object` | Yes | body |  |

**Returns:** `any`

---

### `stopAllWork`

**POST** `/api/v1/agent/stop`

Stop everything running in the realm.

```typescript
client.agent.stopAllWork(data?: AgentStopAllWorkRequest): Promise<AgentStopAllWorkResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentStopAllWorkRequest` | No | body |  |

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

## `client.agent.changes` (2 methods)

### `get`

**GET** `/api/v1/agent/changes`

Change tokens for the Work lists.

```typescript
client.agent.changes.get(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentChangesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentChangesGetResponse`

**CLI:** `hoody agent changes get`

---

### `stream`

**GET** `/api/v1/agent/changes/stream`

Stream the change tokens (SSE).

```typescript
client.agent.changes.stream(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<IEventStream>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `IEventStream`

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

## `client.agent.containers` (3 methods)

### `list`

**GET** `/api/v1/agent/containers`

List containers in a realm (for binding).

```typescript
client.agent.containers.list(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentContainersListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentContainersListResponse`

**CLI:** `hoody agent containers list`

---

### `listAll`

**GET** `/api/v1/agent/containers`

List containers in a realm (for binding). (collect all pages)

```typescript
client.agent.containers.listAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/containers`

List containers in a realm (for binding). (async iterator)

```typescript
client.agent.containers.listIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.agent.definitions` (14 methods)

### `copy`

**POST** `/api/v1/agent/agents/{name}/copy`

Copy a chat agent.

```typescript
client.agent.definitions.copy(name: string, data: AgentDefinitionsCopyRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentDefinitionsCopyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsCopyRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentDefinitionsCopyResponse`

**CLI:** `hoody agent definitions copy`

---

### `create`

**POST** `/api/v1/agent/agents`

Create a chat-agent definition.

```typescript
client.agent.definitions.create(data: AgentDefinitionsCreateRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentDefinitionsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentDefinitionsCreateRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentDefinitionsCreateResponse`

**CLI:** `hoody agent definitions create`

---

### `delete`

**DELETE** `/api/v1/agent/agents/{name}`

Delete a custom chat agent.

```typescript
client.agent.definitions.delete(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentDefinitionsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentDefinitionsDeleteResponse`

**CLI:** `hoody agent definitions delete`

---

### `getSource`

**GET** `/api/v1/agent/agents/{name}/source`

Read a chat agent's source.

```typescript
client.agent.definitions.getSource(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentDefinitionsGetSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentDefinitionsGetSourceResponse`

**CLI:** `hoody agent definitions source get`

---

### `list`

**GET** `/api/v1/agent/agents`

List chat-agent definitions.

```typescript
client.agent.definitions.list(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentDefinitionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentDefinitionsListResponse`

**CLI:** `hoody agent definitions list`

---

### `listAll`

**GET** `/api/v1/agent/agents`

List chat-agent definitions. (collect all pages)

```typescript
client.agent.definitions.listAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/agents`

List chat-agent definitions. (async iterator)

```typescript
client.agent.definitions.listIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `rename`

**POST** `/api/v1/agent/agents/{name}/rename`

Rename a chat agent.

```typescript
client.agent.definitions.rename(name: string, data: AgentDefinitionsRenameRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentDefinitionsRenameResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsRenameRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentDefinitionsRenameResponse`

**CLI:** `hoody agent definitions rename`

---

### `reset`

**POST** `/api/v1/agent/agents/{name}/reset-to-shipped`

Reset an agent to its shipped default.

```typescript
client.agent.definitions.reset(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentDefinitionsResetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentDefinitionsResetResponse`

**CLI:** `hoody agent definitions reset`

---

### `setModel`

**PATCH** `/api/v1/agent/agents/{name}/model`

Set an agent's model.

```typescript
client.agent.definitions.setModel(name: string, data?: AgentDefinitionsSetModelRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentDefinitionsSetModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsSetModelRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentDefinitionsSetModelResponse`

**CLI:** `hoody agent definitions model set`

---

### `setSource`

**PUT** `/api/v1/agent/agents/{name}/source`

Write a chat agent's source.

```typescript
client.agent.definitions.setSource(name: string, data: AgentDefinitionsSetSourceRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentDefinitionsSetSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsSetSourceRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentDefinitionsSetSourceResponse`

**CLI:** `hoody agent definitions source set`

---

### `setTools`

**PATCH** `/api/v1/agent/agents/{name}/tools`

Set an agent's tool allow-list.

```typescript
client.agent.definitions.setTools(name: string, data: AgentDefinitionsSetToolsRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentDefinitionsSetToolsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsSetToolsRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentDefinitionsSetToolsResponse`

**CLI:** `hoody agent definitions tools set`

---

### `setTurnLimit`

**PATCH** `/api/v1/agent/agents/{name}/turns`

Set an agent's max-turns.

```typescript
client.agent.definitions.setTurnLimit(name: string, data?: AgentDefinitionsSetTurnLimitRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentDefinitionsSetTurnLimitResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentDefinitionsSetTurnLimitRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentDefinitionsSetTurnLimitResponse`

**CLI:** `hoody agent definitions turns limit set`

---

### `toggleTool`

**POST** `/api/v1/agent/agents/{name}/tools/{tool}/toggle`

Toggle a single tool for an agent.

```typescript
client.agent.definitions.toggleTool(name: string, tool: string, data?: AgentDefinitionsToggleToolRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentDefinitionsToggleToolResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `tool` | `string` | Yes | path | The tool. |
| `data` | `AgentDefinitionsToggleToolRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentDefinitionsToggleToolResponse`

**CLI:** `hoody agent definitions tools toggle`

---

## `client.agent.files` (3 methods)

### `list`

**GET** `/api/v1/agent/agent-files`

List the files that shape the agents.

```typescript
client.agent.files.list(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentFilesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentFilesListResponse`

**CLI:** `hoody agent files list`

---

### `listAll`

**GET** `/api/v1/agent/agent-files`

List the files that shape the agents. (collect all pages)

```typescript
client.agent.files.listAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/agent-files`

List the files that shape the agents. (async iterator)

```typescript
client.agent.files.listIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.agent.fusions` (5 methods)

### `delete`

**DELETE** `/api/v1/agent/settings/fusion/{slug}`

Delete a fusion composite.

```typescript
client.agent.fusions.delete(slug: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentFusionsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `slug` | `string` | Yes | path | The slug. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentFusionsDeleteResponse`

**CLI:** `hoody agent fusions delete`

---

### `list`

**GET** `/api/v1/agent/settings/fusion`

List fusion composites.

```typescript
client.agent.fusions.list(options?: { include_invalid?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentFusionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_invalid` | `boolean` | No | query | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is diagnosable. An entry with no usable slug, or a duplicate slug, cannot be deleted through this API — see the operation description. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentFusionsListResponse`

**CLI:** `hoody agent fusions list`

---

### `listAll`

**GET** `/api/v1/agent/settings/fusion`

List fusion composites. (collect all pages)

```typescript
client.agent.fusions.listAll(options?: { include_invalid?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_invalid` | `boolean` | No | query | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is diagnosable. An entry with no usable slug, or a duplicate slug, cannot be deleted through this API — see the operation description. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/settings/fusion`

List fusion composites. (async iterator)

```typescript
client.agent.fusions.listIterator(options?: { include_invalid?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_invalid` | `boolean` | No | query | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is diagnosable. An entry with no usable slug, or a duplicate slug, cannot be deleted through this API — see the operation description. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `set`

**PUT** `/api/v1/agent/settings/fusion/{slug}`

Create or update a fusion composite.

```typescript
client.agent.fusions.set(slug: string, data: AgentFusionsSetRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentFusionsSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `slug` | `string` | Yes | path | The slug. |
| `data` | `AgentFusionsSetRequest` | Yes | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentFusionsSetResponse`

**CLI:** `hoody agent fusions set`

---

## `client.agent.gates` (7 methods)

### `answer`

**POST** `/api/v1/agent/sessions/{id}/answer`

Answer a parked question gate.

```typescript
client.agent.gates.answer(id: string, data: AgentGatesAnswerRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGatesAnswerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentGatesAnswerRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGatesAnswerResponse`

**CLI:** `hoody agent gates answer`

---

### `approve`

**POST** `/api/v1/agent/sessions/{id}/confirm`

Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease).

```typescript
client.agent.gates.approve(id: string, data?: object, options?: { XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `XHoodyApproverLease` | `string` | No | header | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent gates approve`

---

### `deny`

**POST** `/api/v1/agent/sessions/{id}/confirm`

Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease).

```typescript
client.agent.gates.deny(id: string, data?: object, options?: { XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `XHoodyApproverLease` | `string` | No | header | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent gates deny`

---

### `list`

**GET** `/api/v1/agent/gates`

List the gates waiting for a human.

```typescript
client.agent.gates.list(options?: { include_system?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentGatesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also list the gates of daemon-owned system/resident sessions (as listSessions does). |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGatesListResponse`

**CLI:** `hoody agent gates list`

---

### `listAll`

**GET** `/api/v1/agent/gates`

List the gates waiting for a human. (collect all pages)

```typescript
client.agent.gates.listAll(options?: { include_system?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also list the gates of daemon-owned system/resident sessions (as listSessions does). |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/gates`

List the gates waiting for a human. (async iterator)

```typescript
client.agent.gates.listIterator(options?: { include_system?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also list the gates of daemon-owned system/resident sessions (as listSessions does). |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `suggest`

**POST** `/api/v1/agent/sessions/{id}/answer:assist`

Propose answers for a parked question (helper model).

```typescript
client.agent.gates.suggest(id: string, data?: AgentGatesSuggestRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGatesSuggestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentGatesSuggestRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGatesSuggestResponse`

**CLI:** `hoody agent gates suggest`

---

## `client.agent.github` (30 methods)

### `checkoutPr`

**POST** `/api/v1/agent/github/pr/checkout`

Check out a pull request.

```typescript
client.agent.github.checkoutPr(data: AgentGithubCheckoutPrRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubCheckoutPrResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubCheckoutPrRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubCheckoutPrResponse`

**CLI:** `hoody agent github prs checkout`

---

### `clone`

**POST** `/api/v1/agent/github/clone`

Clone a GitHub repository.

```typescript
client.agent.github.clone(data?: AgentGithubCloneRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubCloneResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubCloneRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubCloneResponse`

**CLI:** `hoody agent github repos clone`

---

### `createBranch`

**POST** `/api/v1/agent/github/branch`

Create a branch.

```typescript
client.agent.github.createBranch(data: AgentGithubCreateBranchRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubCreateBranchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubCreateBranchRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubCreateBranchResponse`

**CLI:** `hoody agent github branches create`

---

### `createCommit`

**POST** `/api/v1/agent/github/commit`

Stage all and commit.

```typescript
client.agent.github.createCommit(data: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string; push?: boolean }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | Yes | body |  |
| `push` | `boolean` | No | option | Stage, commit and push in one call. |

**Returns:** `any`

**CLI:** `hoody agent github commits create`

---

### `createIssue`

**POST** `/api/v1/agent/github/issues`

Open an issue.

```typescript
client.agent.github.createIssue(data: AgentGithubCreateIssueRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubCreateIssueResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubCreateIssueRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubCreateIssueResponse`

**CLI:** `hoody agent github issues create`

---

### `createPr`

**POST** `/api/v1/agent/github/pr`

Open a pull request.

```typescript
client.agent.github.createPr(data: AgentGithubCreatePrRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubCreatePrResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubCreatePrRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubCreatePrResponse`

**CLI:** `hoody agent github prs create`

---

### `createWorktree`

**POST** `/api/v1/agent/github/worktrees`

Add a linked worktree.

```typescript
client.agent.github.createWorktree(data: AgentGithubCreateWorktreeRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubCreateWorktreeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubCreateWorktreeRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubCreateWorktreeResponse`

**CLI:** `hoody agent github worktrees create`

---

### `deleteBranch`

**POST** `/api/v1/agent/github/branch/delete`

Force-delete a local branch.

```typescript
client.agent.github.deleteBranch(data: AgentGithubDeleteBranchRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubDeleteBranchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubDeleteBranchRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubDeleteBranchResponse`

**CLI:** `hoody agent github branches delete`

---

### `deleteWorktree`

**POST** `/api/v1/agent/github/worktrees/remove`

Remove a linked worktree.

```typescript
client.agent.github.deleteWorktree(data: AgentGithubDeleteWorktreeRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubDeleteWorktreeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubDeleteWorktreeRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubDeleteWorktreeResponse`

**CLI:** `hoody agent github worktrees delete`

---

### `diff`

**GET** `/api/v1/agent/github/diff`

Read the working-tree diff.

```typescript
client.agent.github.diff(options?: { staged?: boolean; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; cache?: boolean | number }): Promise<AgentGithubDiffResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `staged` | `boolean` | No | query | When true, return the STAGED (index) diff — what a commit would record — instead of the unstaged working-tree diff. Defaults to false. Accepts true/1/yes/on; every other value, including an empty one, is false. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubDiffResponse`

**CLI:** `hoody agent github diff`

---

### `getAuth`

**GET** `/api/v1/agent/github/auth/status`

GitHub auth status.

```typescript
client.agent.github.getAuth(): Promise<AgentGithubGetAuthResponse>
```

**Returns:** `AgentGithubGetAuthResponse`

**CLI:** `hoody agent github auth status`

---

### `getStatus`

**GET** `/api/v1/agent/github/status`

GitHub working-tree status.

```typescript
client.agent.github.getStatus(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubGetStatusResponse`

**CLI:** `hoody agent github status`

---

### `listBranches`

**GET** `/api/v1/agent/github/branches`

List GitHub branches.

```typescript
client.agent.github.listBranches(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubListBranchesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubListBranchesResponse`

**CLI:** `hoody agent github branches list`

---

### `listCommits`

**GET** `/api/v1/agent/github/log`

Read recent commit history.

```typescript
client.agent.github.listCommits(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubListCommitsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubListCommitsResponse`

**CLI:** `hoody agent github commits list`

---

### `listIssues`

**GET** `/api/v1/agent/github/issues`

List issues.

```typescript
client.agent.github.listIssues(options: { owner: string; repo: string; state?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; cache?: boolean | number }): Promise<AgentGithubListIssuesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `owner` | `string` | Yes | query | Repository owner (user or org login). Required — not derived from the bound checkout; githubRepoIdentity returns it. |
| `repo` | `string` | Yes | query | Repository name without the owner. Required, same source as `owner`. |
| `state` | `string` | No | query | Which issues to return: open (the default when omitted), closed, or all. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubListIssuesResponse`

**CLI:** `hoody agent github issues list`

---

### `listPrs`

**GET** `/api/v1/agent/github/pr`

List pull requests.

```typescript
client.agent.github.listPrs(options: { owner: string; repo: string; state?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; cache?: boolean | number }): Promise<AgentGithubListPrsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `owner` | `string` | Yes | query | Repository owner (user or org login), e.g. "octocat". Required — it is NOT derived from the bound checkout; githubRepoIdentity returns it. |
| `repo` | `string` | Yes | query | Repository name without the owner, e.g. "Hello-World". Required, same source as `owner`. |
| `state` | `string` | No | query | Which pull requests to return: open (the default when omitted), closed, or all. An unrecognized value is passed through to GitHub, which rejects it. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubListPrsResponse`

**CLI:** `hoody agent github prs list`

---

### `listRepos`

**GET** `/api/v1/agent/github/repos`

List GitHub repos.

```typescript
client.agent.github.listRepos(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; cache?: boolean | number }): Promise<AgentGithubListReposResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubListReposResponse`

**CLI:** `hoody agent github repos list`

---

### `listWorktrees`

**GET** `/api/v1/agent/github/worktrees`

List linked worktrees.

```typescript
client.agent.github.listWorktrees(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubListWorktreesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubListWorktreesResponse`

**CLI:** `hoody agent github worktrees list`

---

### `login`

**POST** `/api/v1/agent/github/auth/login`

Start a GitHub device-flow login (or add a PAT).

```typescript
client.agent.github.login(data?: AgentGithubLoginRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubLoginResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubLoginRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubLoginResponse`

**CLI:** `hoody agent github auth login`

---

### `logout`

**POST** `/api/v1/agent/github/auth/logout`

Remove a linked GitHub account.

```typescript
client.agent.github.logout(data: AgentGithubLogoutRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubLogoutResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubLogoutRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubLogoutResponse`

**CLI:** `hoody agent github auth logout`

---

### `mergePr`

**POST** `/api/v1/agent/github/pr/merge`

Merge a pull request.

```typescript
client.agent.github.mergePr(data: AgentGithubMergePrRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubMergePrResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubMergePrRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubMergePrResponse`

**CLI:** `hoody agent github prs merge`

---

### `pollLogin`

**POST** `/api/v1/agent/github/auth/login/poll`

Poll a GitHub device-flow login to completion.

```typescript
client.agent.github.pollLogin(data: AgentGithubPollLoginRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubPollLoginResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubPollLoginRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubPollLoginResponse`

**CLI:** `hoody agent github auth poll`

---

### `popStash`

**POST** `/api/v1/agent/github/stash/pop`

Restore the most recent stash entry.

```typescript
client.agent.github.popStash(data?: AgentGithubPopStashRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubPopStashResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubPopStashRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubPopStashResponse`

**CLI:** `hoody agent github stash pop`

---

### `pushStash`

**POST** `/api/v1/agent/github/stash`

Stash the working tree.

```typescript
client.agent.github.pushStash(data?: AgentGithubPushStashRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubPushStashResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubPushStashRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubPushStashResponse`

**CLI:** `hoody agent github stash push`

---

### `resolveRepo`

**GET** `/api/v1/agent/github/identity`

Resolve the bound repository's owner/name.

```typescript
client.agent.github.resolveRepo(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubResolveRepoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubResolveRepoResponse`

**CLI:** `hoody agent github repos resolve`

---

### `setRepoCredentials`

**POST** `/api/v1/agent/github/repo/reconnect`

Re-write a checkout's GitHub credential.

```typescript
client.agent.github.setRepoCredentials(data?: AgentGithubSetRepoCredentialsRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubSetRepoCredentialsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubSetRepoCredentialsRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubSetRepoCredentialsResponse`

**CLI:** `hoody agent github repos credentials set`

---

### `suggestCommitMessage`

**POST** `/api/v1/agent/github/commit/suggest-message`

Draft a commit message with a model.

```typescript
client.agent.github.suggestCommitMessage(data: AgentGithubSuggestCommitMessageRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubSuggestCommitMessageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubSuggestCommitMessageRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubSuggestCommitMessageResponse`

**CLI:** `hoody agent github commits message suggest`

---

### `sync`

**POST** `/api/v1/agent/github/sync`

Sync (fetch → pull → push).

```typescript
client.agent.github.sync(data?: AgentGithubSyncRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubSyncRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubSyncResponse`

**CLI:** `hoody agent github sync`

---

### `useAccount`

**POST** `/api/v1/agent/github/auth/active`

Switch the active GitHub account.

```typescript
client.agent.github.useAccount(data: AgentGithubUseAccountRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubUseAccountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubUseAccountRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubUseAccountResponse`

**CLI:** `hoody agent github accounts use`

---

### `useBranch`

**POST** `/api/v1/agent/github/branch/switch`

Switch to an existing branch.

```typescript
client.agent.github.useBranch(data: AgentGithubUseBranchRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentGithubUseBranchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentGithubUseBranchRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentGithubUseBranchResponse`

**CLI:** `hoody agent github branches use`

---

## `client.agent.headless` (2 methods)

### `start`

**POST** `/api/v1/agent/headless/runs`

Create a headless one-shot run.

```typescript
client.agent.headless.start(data?: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent headless start`

---

### `stream`

**POST** `/api/v1/agent/headless/runs`

Create a headless one-shot run.

```typescript
client.agent.headless.stream(data?: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent headless stream`

---

## `client.agent.hooks` (14 methods)

### `createWriteIntent`

**POST** `/api/v1/agent/hooks/begin-write`

Begin a hook write (nonce).

```typescript
client.agent.hooks.createWriteIntent(data: AgentHooksCreateWriteIntentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentHooksCreateWriteIntentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentHooksCreateWriteIntentRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentHooksCreateWriteIntentResponse`

**CLI:** `hoody agent hooks intents create`

---

### `delete`

**DELETE** `/api/v1/agent/hooks`

Delete a hook.

```typescript
client.agent.hooks.delete(data: AgentHooksDeleteRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentHooksDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentHooksDeleteRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentHooksDeleteResponse`

**CLI:** `hoody agent hooks delete`

---

### `disable`

**POST** `/api/v1/agent/hooks/toggle`

Toggle a hook.

```typescript
client.agent.hooks.disable(data: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent hooks disable`

---

### `disableAll`

**POST** `/api/v1/agent/hooks/disable-all`

Disable all hooks.

```typescript
client.agent.hooks.disableAll(data: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent hooks disable`

---

### `enable`

**POST** `/api/v1/agent/hooks/toggle`

Toggle a hook.

```typescript
client.agent.hooks.enable(data: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent hooks enable`

---

### `enableAll`

**POST** `/api/v1/agent/hooks/disable-all`

Disable all hooks.

```typescript
client.agent.hooks.enableAll(data: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent hooks enable`

---

### `getRules`

**GET** `/api/v1/agent/hooks/rules`

Get the tool-call rules.

```typescript
client.agent.hooks.getRules(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentHooksGetRulesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentHooksGetRulesResponse`

**CLI:** `hoody agent hooks rules get`

---

### `list`

**GET** `/api/v1/agent/hooks`

List hooks.

```typescript
client.agent.hooks.list(options?: { session_id?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentHooksListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `session_id` | `string` | No | query | Live session id (hooks are session-scoped; required by the daemon RPC). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentHooksListResponse`

**CLI:** `hoody agent hooks list`

---

### `reload`

**POST** `/api/v1/agent/hooks/reload`

Reload hooks from disk.

```typescript
client.agent.hooks.reload(data?: AgentHooksReloadRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentHooksReloadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentHooksReloadRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentHooksReloadResponse`

**CLI:** `hoody agent hooks reload`

---

### `run`

**POST** `/api/v1/agent/hooks/test`

Test-fire a hook.

```typescript
client.agent.hooks.run(data: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent hooks run`

---

### `setRules`

**POST** `/api/v1/agent/hooks/rules`

Set the tool-call rules.

```typescript
client.agent.hooks.setRules(data: AgentHooksSetRulesRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentHooksSetRulesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentHooksSetRulesRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentHooksSetRulesResponse`

**CLI:** `hoody agent hooks rules set`

---

### `test`

**POST** `/api/v1/agent/hooks/test`

Test-fire a hook.

```typescript
client.agent.hooks.test(data: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent hooks test`

---

### `trust`

**POST** `/api/v1/agent/hooks/trust/ack`

Acknowledge hook trust.

```typescript
client.agent.hooks.trust(data: AgentHooksTrustRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentHooksTrustResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentHooksTrustRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentHooksTrustResponse`

**CLI:** `hoody agent hooks trust`

---

### `upsert`

**PUT** `/api/v1/agent/hooks`

Upsert a hook.

```typescript
client.agent.hooks.upsert(data: AgentHooksUpsertRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentHooksUpsertResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentHooksUpsertRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentHooksUpsertResponse`

**CLI:** `hoody agent hooks upsert`

---

## `client.agent.jev` (6 methods)

### `decide`

**POST** `/api/v1/agent/jev/decide`

Ask Jev to decide.

```typescript
client.agent.jev.decide(data: AgentJevDecideRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; cache?: boolean | number }): Promise<AgentJevDecideResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentJevDecideRequest` | Yes | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentJevDecideResponse`

---

### `decideForSession`

**POST** `/api/v1/agent/sessions/{id}/jev/decide`

Ask Jev to decide on behalf of a session.

```typescript
client.agent.jev.decideForSession(id: string, data: AgentJevDecideForSessionRequest): Promise<AgentJevDecideForSessionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentJevDecideForSessionRequest` | Yes | body |  |

**Returns:** `AgentJevDecideForSessionResponse`

---

### `getSettings`

**GET** `/api/v1/agent/jev/settings`

Read the Jev settings.

```typescript
client.agent.jev.getSettings(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; cache?: boolean | number }): Promise<AgentJevGetSettingsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentJevGetSettingsResponse`

**CLI:** `hoody agent jev settings get`

---

### `listModels`

**GET** `/api/v1/agent/jev/models`

List the models Jev can use.

```typescript
client.agent.jev.listModels(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; cache?: boolean | number }): Promise<AgentJevListModelsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentJevListModelsResponse`

**CLI:** `hoody agent jev models list`

---

### `test`

**POST** `/api/v1/agent/jev/test`

Test Jev with one tiny decision.

```typescript
client.agent.jev.test(data?: AgentJevTestRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; cache?: boolean | number }): Promise<AgentJevTestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentJevTestRequest` | No | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentJevTestResponse`

**CLI:** `hoody agent jev test`

---

### `updateSettings`

**PUT** `/api/v1/agent/jev/settings`

Change the Jev settings.

```typescript
client.agent.jev.updateSettings(data?: AgentJevUpdateSettingsRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; cache?: boolean | number }): Promise<AgentJevUpdateSettingsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentJevUpdateSettingsRequest` | No | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `cache` | `boolean \| number` | No | query |  |

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
client.agent.kit.getVersion(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentKitGetVersionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentKitGetVersionResponse`

**CLI:** `hoody agent version`

---

## `client.agent.logs` (6 methods)

### `export`

**GET** `/api/v1/agent/logs/export`

Export logs as a downloadable file.

```typescript
client.agent.logs.export(options?: { source?: string; min_level?: string; comp?: string; session_id?: string; text?: string; since?: string; until?: string; event?: string; tool?: string; model?: string; status?: string; method?: string; min_status?: number; max_status?: number; errors_only?: boolean; event_type?: string; resource_type?: string; container?: string; kind?: string; host?: string; since_seq?: number; limit?: number; format?: string; filename?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<ApiResponse<unknown>>
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
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody agent logs export`

---

### `get`

**GET** `/api/v1/agent/logs/entries/{ref}`

Read a log entry.

```typescript
client.agent.logs.get(ref: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentLogsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `ref` | `string` | Yes | path | The ref. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentLogsGetResponse`

**CLI:** `hoody agent logs get`

---

### `getStats`

**GET** `/api/v1/agent/logs/stats`

Log statistics.

```typescript
client.agent.logs.getStats(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentLogsGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentLogsGetStatsResponse`

**CLI:** `hoody agent logs stats`

---

### `list`

**GET** `/api/v1/agent/logs`

Query logs.

```typescript
client.agent.logs.list(options?: { source?: string; level?: string; host?: string; session_id?: string; run_id?: string; since?: string; until?: string; since_seq?: number; before_seq?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentLogsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source` | `string` | No | query | Filter to a log source/facet (see logsSources). One local source, or exactly ONE platform source (activity\|events\|proxy) — mixing them is rejected. |
| `level` | `string` | No | query | Filter to a minimum log level. |
| `host` | `string` | No | query | Filter to a host. |
| `session_id` | `string` | No | query | Only entries correlated with this session id (exact match on the entry's session_id). |
| `run_id` | `string` | No | query | Only entries correlated with this workflow/task run id (exact match on the entry's run_id). |
| `since` | `string` | No | query | Lower TIME bound: RFC3339, or a relative duration like "1h"/"30m"/"7d". This is NOT a cursor — a bare sequence number is rejected 400 (use since_seq). Unparseable values are rejected the same way. |
| `until` | `string` | No | query | Upper TIME bound, same forms as since. Paging BACKWARDS by repeatedly lowering until works, but it is coarse (rows sharing a timestamp repeat); before_seq is the exact backwards cursor. |
| `since_seq` | `number` | No | query | Forward cursor: return only entries NEWER than this gateway seq. Take it from the previous reply's latest_seq to poll incrementally without re-reading rows. A non-numeric value is rejected 400. |
| `before_seq` | `number` | No | query | Backward cursor: return only entries OLDER than this seq. Take it from the SEQ OF THE OLDEST ENTRY THIS PAGE RETURNED — not from oldest_seq, which is the oldest sequence still retained in the ring and is usually far older than the page you just read. Paging back from oldest_seq jumps past every entry in between and returns an empty page, which reads as "history exhausted" when it is not. A non-numeric value is rejected 400. |
| `limit` | `number` | No | query | Caps this page. Omitted it is the daemon default 200; ANY explicit value is clamped to the ring maximum of 500, and limit=0 means 500 rather than 200 — a caller that needs more than 500 rows pages with before_seq/since_seq. A non-numeric value is rejected 400. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentLogsListResponse`

**CLI:** `hoody agent logs list`

---

### `listSources`

**GET** `/api/v1/agent/logs/sources`

Log sources.

```typescript
client.agent.logs.listSources(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentLogsListSourcesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentLogsListSourcesResponse`

**CLI:** `hoody agent logs sources list`

---

### `stream`

**GET** `/api/v1/agent/logs/stream`

Stream the log tail (SSE).

```typescript
client.agent.logs.stream(options?: { source?: string; level?: string; host?: string; session_id?: string; run_id?: string; since_seq?: number; limit?: number; LastEventID?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<IEventStream>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source` | `string` | No | query | Filter the tail to a log source/facet. |
| `level` | `string` | No | query | Filter to a minimum log level. |
| `host` | `string` | No | query | Filter to a host. |
| `session_id` | `string` | No | query | Only entries correlated with this session id. |
| `run_id` | `string` | No | query | Only entries correlated with this workflow/task run id. |
| `since_seq` | `number` | No | query | Initial resume cursor (the Last-Event-ID header overrides it). A non-numeric value is rejected 400. |
| `limit` | `number` | No | query | Caps each poll batch. A non-numeric value is rejected 400. |
| `LastEventID` | `string` | No | header | SSE resume cursor — the gateway int64 seq to resume from; OVERRIDES the ?since_seq query param. Sent automatically by an SSE client on reconnect. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `IEventStream`

**CLI:** `hoody agent logs stream`

---

## `client.agent.loops` (7 methods)

### `create`

**POST** `/api/v1/agent/sessions/{id}/loops`

Create a loop.

```typescript
client.agent.loops.create(id: string, data: AgentLoopsCreateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentLoopsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentLoopsCreateRequest` | Yes | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentLoopsCreateResponse`

**CLI:** `hoody agent loops create`

---

### `delete`

**DELETE** `/api/v1/agent/sessions/{id}/loops/{loopId}`

Delete a loop.

```typescript
client.agent.loops.delete(id: string, loopId: string, data?: AgentLoopsDeleteRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentLoopsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `loopId` | `string` | Yes | path | The loop id. |
| `data` | `AgentLoopsDeleteRequest` | No | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentLoopsDeleteResponse`

**CLI:** `hoody agent loops delete`

---

### `list`

**GET** `/api/v1/agent/loops`

List loops across all sessions.

```typescript
client.agent.loops.list(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentLoopsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentLoopsListResponse`

**CLI:** `hoody agent loops list`

---

### `listAll`

**GET** `/api/v1/agent/loops`

List loops across all sessions. (collect all pages)

```typescript
client.agent.loops.listAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/loops`

List loops across all sessions. (async iterator)

```typescript
client.agent.loops.listIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `startRun`

**POST** `/api/v1/agent/sessions/{id}/loops/{loopId}/run-now`

Run a loop immediately.

```typescript
client.agent.loops.startRun(id: string, loopId: string, data?: AgentLoopsStartRunRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentLoopsStartRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `loopId` | `string` | Yes | path | The loop id. |
| `data` | `AgentLoopsStartRunRequest` | No | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentLoopsStartRunResponse`

**CLI:** `hoody agent loops runs start`

---

### `update`

**PATCH** `/api/v1/agent/sessions/{id}/loops/{loopId}`

Update a loop.

```typescript
client.agent.loops.update(id: string, loopId: string, data?: AgentLoopsUpdateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentLoopsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `loopId` | `string` | Yes | path | The loop id. |
| `data` | `AgentLoopsUpdateRequest` | No | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentLoopsUpdateResponse`

**CLI:** `hoody agent loops update`

---

## `client.agent.mcp` (10 methods)

### `createWriteIntent`

**POST** `/api/v1/agent/mcp/write-intents`

Begin an MCP config write.

```typescript
client.agent.mcp.createWriteIntent(data: AgentMcpCreateWriteIntentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentMcpCreateWriteIntentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpCreateWriteIntentRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMcpCreateWriteIntentResponse`

**CLI:** `hoody agent mcp intents create`

---

### `deleteServer`

**DELETE** `/api/v1/agent/mcp/servers`

Delete an MCP server.

```typescript
client.agent.mcp.deleteServer(data: AgentMcpDeleteServerRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentMcpDeleteServerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpDeleteServerRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMcpDeleteServerResponse`

**CLI:** `hoody agent mcp delete`

---

### `disableServer`

**POST** `/api/v1/agent/mcp/servers/enable`

Enable or disable an MCP server.

```typescript
client.agent.mcp.disableServer(data: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent mcp disable`

---

### `enableServer`

**POST** `/api/v1/agent/mcp/servers/enable`

Enable or disable an MCP server.

```typescript
client.agent.mcp.enableServer(data: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent mcp enable`

---

### `importServers`

**POST** `/api/v1/agent/mcp/import`

Import MCP servers from another tool's config.

```typescript
client.agent.mcp.importServers(data: AgentMcpImportServersRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentMcpImportServersResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpImportServersRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMcpImportServersResponse`

**CLI:** `hoody agent mcp import`

---

### `listServers`

**GET** `/api/v1/agent/mcp/servers`

List configured MCP servers.

```typescript
client.agent.mcp.listServers(options: { session_id: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentMcpListServersResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `session_id` | `string` | Yes | query | Live session id (MCP config is resolved against the session's settings layers). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMcpListServersResponse`

**CLI:** `hoody agent mcp list`

---

### `previewImport`

**POST** `/api/v1/agent/mcp/parse`

Preview an MCP config import.

```typescript
client.agent.mcp.previewImport(data: AgentMcpPreviewImportRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentMcpPreviewImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpPreviewImportRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMcpPreviewImportResponse`

**CLI:** `hoody agent mcp preview`

---

### `reconnect`

**POST** `/api/v1/agent/mcp/reconnect`

Reload MCP config and reconnect.

```typescript
client.agent.mcp.reconnect(data: AgentMcpReconnectRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentMcpReconnectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpReconnectRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMcpReconnectResponse`

**CLI:** `hoody agent mcp reconnect`

---

### `testServer`

**POST** `/api/v1/agent/mcp/probe`

Probe an MCP server without saving it.

```typescript
client.agent.mcp.testServer(data: AgentMcpTestServerRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpTestServerRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody agent mcp test`

---

### `upsertServer`

**PUT** `/api/v1/agent/mcp/servers`

Create or update an MCP server.

```typescript
client.agent.mcp.upsertServer(data: AgentMcpUpsertServerRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentMcpUpsertServerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMcpUpsertServerRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMcpUpsertServerResponse`

**CLI:** `hoody agent mcp upsert`

---

## `client.agent.memory` (21 methods)

### `claimDataHost`

**PUT** `/api/v1/agent/memory/datahost`

Assign this computer as the memory data host.

```typescript
client.agent.memory.claimDataHost(data: AgentMemoryClaimDataHostRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryClaimDataHostResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemoryClaimDataHostRequest` | Yes | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryClaimDataHostResponse`

**CLI:** `hoody agent memory datahost claim`

---

### `consolidate`

**POST** `/api/v1/agent/memory/consolidate`

Trigger a memory consolidation pass (human-only).

```typescript
client.agent.memory.consolidate(data: AgentMemoryConsolidateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemoryConsolidateRequest` | Yes | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody agent memory consolidate`

---

### `createItem`

**POST** `/api/v1/agent/memory/items`

Save a memory item.

```typescript
client.agent.memory.createItem(data: AgentMemoryCreateItemRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryCreateItemResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemoryCreateItemRequest` | Yes | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryCreateItemResponse`

**CLI:** `hoody agent memory items create`

---

### `createWriteIntent`

**POST** `/api/v1/agent/memory/write-intents`

Begin a guarded memory write (intent).

```typescript
client.agent.memory.createWriteIntent(data: AgentMemoryCreateWriteIntentRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryCreateWriteIntentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemoryCreateWriteIntentRequest` | Yes | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryCreateWriteIntentResponse`

**CLI:** `hoody agent memory intents create`

---

### `deleteItem`

**DELETE** `/api/v1/agent/memory/items`

Delete a memory item.

```typescript
client.agent.memory.deleteItem(data?: AgentMemoryDeleteItemRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryDeleteItemResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemoryDeleteItemRequest` | No | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryDeleteItemResponse`

**CLI:** `hoody agent memory items delete`

---

### `deleteProject`

**DELETE** `/api/v1/agent/memory/projects/{project}`

Erase a memory project.

```typescript
client.agent.memory.deleteProject(project: string, data: AgentMemoryDeleteProjectRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryDeleteProjectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | Yes | path | The project. |
| `data` | `AgentMemoryDeleteProjectRequest` | Yes | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryDeleteProjectResponse`

**CLI:** `hoody agent memory projects delete`

---

### `disable`

**PUT** `/api/v1/agent/memory/enabled`

Toggle memory capture.

```typescript
client.agent.memory.disable(data?: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent memory disable`

---

### `enable`

**PUT** `/api/v1/agent/memory/enabled`

Toggle memory capture.

```typescript
client.agent.memory.enable(data?: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody agent memory enable`

---

### `flush`

**POST** `/api/v1/agent/memory/flush`

Flush the memory store.

```typescript
client.agent.memory.flush(data?: AgentMemoryFlushRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryFlushResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemoryFlushRequest` | No | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryFlushResponse`

**CLI:** `hoody agent memory flush`

---

### `getDataHost`

**GET** `/api/v1/agent/memory/datahost`

Read the realm's memory data host.

```typescript
client.agent.memory.getDataHost(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryGetDataHostResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryGetDataHostResponse`

**CLI:** `hoody agent memory datahost get`

---

### `getGraph`

**GET** `/api/v1/agent/memory/graph`

Read a project's memory relation graph.

```typescript
client.agent.memory.getGraph(options?: { project?: string; node_type?: string; limit?: number; offset?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryGetGraphResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key whose graph to read. |
| `node_type` | `string` | No | query | Optional node-type filter. |
| `limit` | `number` | No | query | Maximum nodes/edges to return. |
| `offset` | `number` | No | query | Pagination offset into the graph. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryGetGraphResponse`

**CLI:** `hoody agent memory graph get`

---

### `getItem`

**GET** `/api/v1/agent/memory/items/{id}`

Read a memory item.

```typescript
client.agent.memory.getItem(id: string, options?: { project?: string; kind?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryGetItemResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The item id. |
| `project` | `string` | No | query | Project key the memory belongs to. |
| `kind` | `string` | No | query | Memory kind/store the record lives in. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryGetItemResponse`

**CLI:** `hoody agent memory items get`

---

### `getStatus`

**GET** `/api/v1/agent/memory/status`

Read memory subsystem status.

```typescript
client.agent.memory.getStatus(options?: { project?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key to report per-project counts, embedding coverage and last-consolidation for. Omitted: only the whole-store totals are returned. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryGetStatusResponse`

**CLI:** `hoody agent memory status`

---

### `listItems`

**GET** `/api/v1/agent/memory/items`

List memory items.

```typescript
client.agent.memory.listItems(options?: { project?: string; kind?: string; type?: string; query?: string; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryListItemsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key to scope the listing to. |
| `kind` | `string` | No | query | Memory kind/store to filter by. |
| `type` | `string` | No | query | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | No | query | Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | No | query | 1-based page number. |
| `limit` | `number` | No | query | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryListItemsResponse`

**CLI:** `hoody agent memory items list`

---

### `listItemsAll`

**GET** `/api/v1/agent/memory/items`

List memory items. (collect all pages)

```typescript
client.agent.memory.listItemsAll(options?: { project?: string; kind?: string; type?: string; query?: string; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key to scope the listing to. |
| `kind` | `string` | No | query | Memory kind/store to filter by. |
| `type` | `string` | No | query | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | No | query | Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | No | query | 1-based page number. |
| `limit` | `number` | No | query | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listItemsIterator`

**GET** `/api/v1/agent/memory/items`

List memory items. (async iterator)

```typescript
client.agent.memory.listItemsIterator(options?: { project?: string; kind?: string; type?: string; query?: string; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project` | `string` | No | query | Project key to scope the listing to. |
| `kind` | `string` | No | query | Memory kind/store to filter by. |
| `type` | `string` | No | query | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | No | query | Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | No | query | 1-based page number. |
| `limit` | `number` | No | query | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listProjects`

**GET** `/api/v1/agent/memory/projects`

List memory projects.

```typescript
client.agent.memory.listProjects(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryListProjectsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryListProjectsResponse`

**CLI:** `hoody agent memory projects list`

---

### `listProjectsAll`

**GET** `/api/v1/agent/memory/projects`

List memory projects. (collect all pages)

```typescript
client.agent.memory.listProjectsAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listProjectsIterator`

**GET** `/api/v1/agent/memory/projects`

List memory projects. (async iterator)

```typescript
client.agent.memory.listProjectsIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `search`

**POST** `/api/v1/agent/memory/search`

Search memory (hybrid recall).

```typescript
client.agent.memory.search(data?: AgentMemorySearchRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemorySearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentMemorySearchRequest` | No | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemorySearchResponse`

**CLI:** `hoody agent memory search`

---

### `updateItem`

**PATCH** `/api/v1/agent/memory/items/{id}`

Edit a memory item.

```typescript
client.agent.memory.updateItem(id: string, data?: AgentMemoryUpdateItemRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentMemoryUpdateItemResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The item id. |
| `data` | `AgentMemoryUpdateItemRequest` | No | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentMemoryUpdateItemResponse`

**CLI:** `hoody agent memory items update`

---

## `client.agent.models` (4 methods)

### `get`

**GET** `/api/v1/agent/models/{spec}`

Get a model by spec.

```typescript
client.agent.models.get(spec: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentModelsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `spec` | `string` | Yes | path | The spec. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentModelsGetResponse`

**CLI:** `hoody agent models get`

---

### `list`

**GET** `/api/v1/agent/models`

List models.

```typescript
client.agent.models.list(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentModelsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentModelsListResponse`

**CLI:** `hoody agent models list`

---

### `listAll`

**GET** `/api/v1/agent/models`

List models. (collect all pages)

```typescript
client.agent.models.listAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/models`

List models. (async iterator)

```typescript
client.agent.models.listIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.agent.platform` (1 method)

### `bootstrapToken`

**POST** `/api/v1/agent/hoody/auth/bootstrap`

Bootstrap the Hoody platform credential (install-if-absent).

```typescript
client.agent.platform.bootstrapToken(data: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `object` | Yes | body |  |

**Returns:** `any`

---

## `client.agent.providers` (18 methods)

### `addAccount`

**POST** `/api/v1/agent/providers/{id}/auth/accounts`

Add an OAuth account to a provider's pool.

```typescript
client.agent.providers.addAccount(id: string, data?: AgentProvidersAddAccountRequest): Promise<AgentProvidersAddAccountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `data` | `AgentProvidersAddAccountRequest` | No | body |  |

**Returns:** `AgentProvidersAddAccountResponse`

**CLI:** `hoody agent providers accounts add`

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

**CLI:** `hoody agent providers keys delete`

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

### `getAuth`

**GET** `/api/v1/agent/providers/{id}/auth`

Get a provider's auth status.

```typescript
client.agent.providers.getAuth(id: string): Promise<AgentProvidersGetAuthResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |

**Returns:** `AgentProvidersGetAuthResponse`

**CLI:** `hoody agent providers auth status`

---

### `list`

**GET** `/api/v1/agent/providers`

List LLM providers.

```typescript
client.agent.providers.list(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<AgentProvidersListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentProvidersListResponse`

**CLI:** `hoody agent providers list`

---

### `listAccounts`

**GET** `/api/v1/agent/providers/{id}/auth/accounts`

List a provider's OAuth account pool.

```typescript
client.agent.providers.listAccounts(id: string, options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<AgentProvidersListAccountsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentProvidersListAccountsResponse`

**CLI:** `hoody agent providers accounts list`

---

### `listAccountsAll`

**GET** `/api/v1/agent/providers/{id}/auth/accounts`

List a provider's OAuth account pool. (collect all pages)

```typescript
client.agent.providers.listAccountsAll(id: string, options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listAccountsIterator`

**GET** `/api/v1/agent/providers/{id}/auth/accounts`

List a provider's OAuth account pool. (async iterator)

```typescript
client.agent.providers.listAccountsIterator(id: string, options?: { page?: number; limit?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listAll`

**GET** `/api/v1/agent/providers`

List LLM providers. (collect all pages)

```typescript
client.agent.providers.listAll(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/providers`

List LLM providers. (async iterator)

```typescript
client.agent.providers.listIterator(options?: { page?: number; limit?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `logoutOauth`

**DELETE** `/api/v1/agent/providers/{id}/auth/oauth`

Remove a provider's OAuth login.

```typescript
client.agent.providers.logoutOauth(id: string): Promise<AgentProvidersLogoutOauthResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |

**Returns:** `AgentProvidersLogoutOauthResponse`

**CLI:** `hoody agent providers oauth logout`

---

### `pollOauth`

**GET** `/api/v1/agent/providers/{id}/auth/oauth/{job}`

Poll a provider OAuth login.

```typescript
client.agent.providers.pollOauth(id: string, job: string): Promise<AgentProvidersPollOauthResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `job` | `string` | Yes | path | The job. |

**Returns:** `AgentProvidersPollOauthResponse`

**CLI:** `hoody agent providers oauth poll`

---

### `removeAccount`

**DELETE** `/api/v1/agent/providers/{id}/auth/accounts/{key}`

Remove a pooled OAuth account.

```typescript
client.agent.providers.removeAccount(id: string, key: string): Promise<AgentProvidersRemoveAccountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `key` | `string` | Yes | path | The key. |

**Returns:** `AgentProvidersRemoveAccountResponse`

**CLI:** `hoody agent providers accounts remove`

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

**CLI:** `hoody agent providers keys set`

---

### `setDefaultAuth`

**PUT** `/api/v1/agent/providers/{id}/auth/default`

Set a provider's default credential method.

```typescript
client.agent.providers.setDefaultAuth(id: string, data: AgentProvidersSetDefaultAuthRequest): Promise<AgentProvidersSetDefaultAuthResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `data` | `AgentProvidersSetDefaultAuthRequest` | Yes | body |  |

**Returns:** `AgentProvidersSetDefaultAuthResponse`

**CLI:** `hoody agent providers auth default set`

---

### `startOauth`

**POST** `/api/v1/agent/providers/{id}/auth/oauth`

Start a provider OAuth login.

```typescript
client.agent.providers.startOauth(id: string, data?: AgentProvidersStartOauthRequest): Promise<AgentProvidersStartOauthResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `data` | `AgentProvidersStartOauthRequest` | No | body |  |

**Returns:** `AgentProvidersStartOauthResponse`

**CLI:** `hoody agent providers oauth start`

---

### `submitOauthCode`

**POST** `/api/v1/agent/providers/{id}/auth/oauth/{job}/code`

Submit a provider OAuth authorization code.

```typescript
client.agent.providers.submitOauthCode(id: string, job: string, data: AgentProvidersSubmitOauthCodeRequest): Promise<AgentProvidersSubmitOauthCodeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `job` | `string` | Yes | path | The job. |
| `data` | `AgentProvidersSubmitOauthCodeRequest` | Yes | body |  |

**Returns:** `AgentProvidersSubmitOauthCodeResponse`

**CLI:** `hoody agent providers oauth submit`

---

### `useAccount`

**PUT** `/api/v1/agent/providers/{id}/auth/accounts/{key}/active`

Make a pooled OAuth account active.

```typescript
client.agent.providers.useAccount(id: string, key: string, data?: AgentProvidersUseAccountRequest): Promise<AgentProvidersUseAccountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The provider id. |
| `key` | `string` | Yes | path | The key. |
| `data` | `AgentProvidersUseAccountRequest` | No | body |  |

**Returns:** `AgentProvidersUseAccountResponse`

**CLI:** `hoody agent providers accounts use`

---

## `client.agent.realms` (4 methods)

### `list`

**GET** `/api/v1/agent/realms`

List realms (for binding).

```typescript
client.agent.realms.list(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentRealmsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentRealmsListResponse`

**CLI:** `hoody agent realms list`

---

### `listAll`

**GET** `/api/v1/agent/realms`

List realms (for binding). (collect all pages)

```typescript
client.agent.realms.listAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/realms`

List realms (for binding). (async iterator)

```typescript
client.agent.realms.listIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

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

## `client.agent.sessions` (47 methods)

### `cancelTasks`

**POST** `/api/v1/agent/sessions/{id}/tasks/cancel`

Cancel all background tasks.

```typescript
client.agent.sessions.cancelTasks(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsCancelTasksResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsCancelTasksResponse`

**CLI:** `hoody agent sessions tasks cancel`

---

### `claimApproverLease`

**POST** `/api/v1/agent/sessions/{id}/approver-lease`

Acquire the right to answer this session's gates.

```typescript
client.agent.sessions.claimApproverLease(id: string, data: AgentSessionsClaimApproverLeaseRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsClaimApproverLeaseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsClaimApproverLeaseRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsClaimApproverLeaseResponse`

**CLI:** `hoody agent sessions approver lease claim`

---

### `claimAttachment`

**POST** `/api/v1/agent/sessions/{id}/attachments`

Hold a live session (and its parked gate) alive.

```typescript
client.agent.sessions.claimAttachment(id: string, data?: AgentSessionsClaimAttachmentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsClaimAttachmentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsClaimAttachmentRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsClaimAttachmentResponse`

**CLI:** `hoody agent sessions attachments claim`

---

### `close`

**POST** `/api/v1/agent/sessions/{id}/close`

Close the session (teardown).

```typescript
client.agent.sessions.close(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsCloseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsCloseResponse`

**CLI:** `hoody agent sessions close`

---

### `connect`

**GET** `/api/v1/agent/sessions/{id}/stream`

Attach to a session's event stream (WebSocket / SSE).

```typescript
client.agent.sessions.connect(id: string, options?: { since?: number; incarnation?: string; realm?: string; LastEventID?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentStreamSessionWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `since` | `number` | No | query | Resume from this gateway int64 seq (also accepted as the Last-Event-ID header). |
| `incarnation` | `string` | No | query | The incarnation the since cursor belongs to (from a frame, replay_boundary, or GET /sessions/{id}). When it differs from the live session's, the cursor is treated as invalid: a replay_gap frame, then the full retained ring. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `LastEventID` | `string` | No | header | SSE resume cursor — the gateway int64 seq to resume from (the in:header alias of ?since); sent automatically by an SSE client on reconnect. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentStreamSessionWebSocket`

**CLI:** `hoody agent sessions stream`

---

### `create`

**POST** `/api/v1/agent/sessions`

Create, fork, or attach a session.

```typescript
client.agent.sessions.create(data?: AgentSessionsCreateRequest, options?: { realm?: string; IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSessionsCreateRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `IdempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsCreateResponse`

**CLI:** `hoody agent sessions create`

---

### `delete`

**DELETE** `/api/v1/agent/sessions/{id}`

Close (and optionally hard-delete) a session.

```typescript
client.agent.sessions.delete(id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`

**CLI:** `hoody agent sessions delete`

---

### `deleteApprovalRule`

**DELETE** `/api/v1/agent/sessions/{id}/approval/rules/{tool}`

Remove one session permission rule.

```typescript
client.agent.sessions.deleteApprovalRule(id: string, tool: string, options?: { realm?: string; IfMatch?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsDeleteApprovalRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `tool` | `string` | Yes | path | The tool. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `IfMatch` | `string` | No | header | Conditional-request precondition: the ETag from GET /sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsDeleteApprovalRuleResponse`

**CLI:** `hoody agent sessions approval rules delete`

---

### `get`

**GET** `/api/v1/agent/sessions/{id}`

Get a session summary.

```typescript
client.agent.sessions.get(id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentSessionsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsGetResponse`

**CLI:** `hoody agent sessions get`

---

### `getApproval`

**GET** `/api/v1/agent/sessions/{id}/approval`

Read a session's approval policy.

```typescript
client.agent.sessions.getApproval(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsGetApprovalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsGetApprovalResponse`

**CLI:** `hoody agent sessions approval get`

---

### `getSnapshot`

**GET** `/api/v1/agent/sessions/{id}/state`

Read a session's recoverable state.

```typescript
client.agent.sessions.getSnapshot(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsGetSnapshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsGetSnapshotResponse`

**CLI:** `hoody agent sessions snapshot get`

---

### `getTranscript`

**GET** `/api/v1/agent/sessions/{id}/transcript`

Read a session's transcript without attaching.

```typescript
client.agent.sessions.getTranscript(id: string, options?: { after_turn?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentSessionsGetTranscriptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `after_turn` | `number` | No | query | Exclusive completed-turn skip cursor: return content strictly after completed turn N (0 = full transcript; values past the end clamp; negative/non-integer = 400). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsGetTranscriptResponse`

**CLI:** `hoody agent sessions transcript get`

---

### `list`

**GET** `/api/v1/agent/sessions`

List sessions.

```typescript
client.agent.sessions.list(options?: { include_system?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentSessionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also include daemon-owned system/resident sessions in the listing. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsListResponse`

**CLI:** `hoody agent sessions list`

---

### `listAll`

**GET** `/api/v1/agent/sessions`

List sessions. (collect all pages)

```typescript
client.agent.sessions.listAll(options?: { include_system?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also include daemon-owned system/resident sessions in the listing. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listApplicableRules`

**GET** `/api/v1/agent/sessions/{id}/rules/applies`

Which tool-call rules apply.

```typescript
client.agent.sessions.listApplicableRules(id: string, options?: { agent?: string; tool?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsListApplicableRulesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `agent` | `string` | No | query | Agent name to ask about (default: the session's own agent). |
| `tool` | `string` | No | query | Tool name to ask about (default: any tool). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsListApplicableRulesResponse`

**CLI:** `hoody agent sessions rules list`

---

### `listDirectories`

**GET** `/api/v1/agent/sessions/cwds`

List distinct session working directories.

```typescript
client.agent.sessions.listDirectories(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentSessionsListDirectoriesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsListDirectoriesResponse`

**CLI:** `hoody agent sessions directories list`

---

### `listIterator`

**GET** `/api/v1/agent/sessions`

List sessions. (async iterator)

```typescript
client.agent.sessions.listIterator(options?: { include_system?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_system` | `boolean` | No | query | When true, also include daemon-owned system/resident sessions in the listing. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listLoops`

**GET** `/api/v1/agent/sessions/{id}/loops`

List a session's loops.

```typescript
client.agent.sessions.listLoops(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentSessionsListLoopsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsListLoopsResponse`

**CLI:** `hoody agent sessions loops list`

---

### `listLoopsAll`

**GET** `/api/v1/agent/sessions/{id}/loops`

List a session's loops. (collect all pages)

```typescript
client.agent.sessions.listLoopsAll(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listLoopsIterator`

**GET** `/api/v1/agent/sessions/{id}/loops`

List a session's loops. (async iterator)

```typescript
client.agent.sessions.listLoopsIterator(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listMcpTools`

**GET** `/api/v1/agent/sessions/{id}/tools/mcp`

List a session's MCP tools.

```typescript
client.agent.sessions.listMcpTools(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsListMcpToolsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsListMcpToolsResponse`

**CLI:** `hoody agent sessions mcp tools list`

---

### `listMcpToolsAll`

**GET** `/api/v1/agent/sessions/{id}/tools/mcp`

List a session's MCP tools. (collect all pages)

```typescript
client.agent.sessions.listMcpToolsAll(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listMcpToolsIterator`

**GET** `/api/v1/agent/sessions/{id}/tools/mcp`

List a session's MCP tools. (async iterator)

```typescript
client.agent.sessions.listMcpToolsIterator(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listTools`

**GET** `/api/v1/agent/sessions/{id}/tools`

List a session's effective tool set.

```typescript
client.agent.sessions.listTools(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsListToolsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsListToolsResponse`

**CLI:** `hoody agent sessions tools list`

---

### `listToolsAll`

**GET** `/api/v1/agent/sessions/{id}/tools`

List a session's effective tool set. (collect all pages)

```typescript
client.agent.sessions.listToolsAll(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listToolsIterator`

**GET** `/api/v1/agent/sessions/{id}/tools`

List a session's effective tool set. (async iterator)

```typescript
client.agent.sessions.listToolsIterator(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `releaseApproverLease`

**DELETE** `/api/v1/agent/sessions/{id}/approver-lease`

Release the approver lease.

```typescript
client.agent.sessions.releaseApproverLease(id: string, options?: { realm?: string; XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsReleaseApproverLeaseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyApproverLease` | `string` | No | header | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsReleaseApproverLeaseResponse`

**CLI:** `hoody agent sessions approver lease release`

---

### `releaseAttachment`

**DELETE** `/api/v1/agent/sessions/{id}/attachments/{lease_id}`

Release an attachment lease.

```typescript
client.agent.sessions.releaseAttachment(id: string, lease_id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsReleaseAttachmentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `lease_id` | `string` | Yes | path | The lease id. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsReleaseAttachmentResponse`

**CLI:** `hoody agent sessions attachments release`

---

### `rename`

**PATCH** `/api/v1/agent/sessions/{id}`

Rename a session.

```typescript
client.agent.sessions.rename(id: string, data: AgentSessionsRenameRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentSessionsRenameResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsRenameRequest` | Yes | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsRenameResponse`

**CLI:** `hoody agent sessions rename`

---

### `renewApproverLease`

**PATCH** `/api/v1/agent/sessions/{id}/approver-lease`

Renew the approver lease.

```typescript
client.agent.sessions.renewApproverLease(id: string, data?: AgentSessionsRenewApproverLeaseRequest, options?: { realm?: string; XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsRenewApproverLeaseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsRenewApproverLeaseRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyApproverLease` | `string` | No | header | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsRenewApproverLeaseResponse`

**CLI:** `hoody agent sessions approver lease renew`

---

### `renewAttachment`

**PATCH** `/api/v1/agent/sessions/{id}/attachments/{lease_id}`

Renew an attachment lease.

```typescript
client.agent.sessions.renewAttachment(id: string, lease_id: string, data?: AgentSessionsRenewAttachmentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsRenewAttachmentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `lease_id` | `string` | Yes | path | The lease id. |
| `data` | `AgentSessionsRenewAttachmentRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsRenewAttachmentResponse`

**CLI:** `hoody agent sessions attachments renew`

---

### `replay`

**GET** `/api/v1/agent/sessions/{id}/replay`

Replay a live session's buffered events.

```typescript
client.agent.sessions.replay(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsReplayResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsReplayResponse`

**CLI:** `hoody agent sessions replay`

---

### `runTool`

**POST** `/api/v1/agent/sessions/{id}/tools/{name}/run`

Run a tool inside a live session (gated).

```typescript
client.agent.sessions.runTool(id: string, name: string, data?: AgentSessionsRunToolRequest, options?: { confirm?: boolean; confirm_token?: string; realm?: string; XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsRunToolResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentSessionsRunToolRequest` | No | body |  |
| `confirm` | `boolean` | No | query | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | No | query | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyApproverLease` | `string` | No | header | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsRunToolResponse`

**CLI:** `hoody agent sessions tools run`

---

### `setAgent`

**PATCH** `/api/v1/agent/sessions/{id}/agent`

Switch the chat agent.

```typescript
client.agent.sessions.setAgent(id: string, data?: AgentSessionsSetAgentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsSetAgentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetAgentRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsSetAgentResponse`

**CLI:** `hoody agent sessions agent set`

---

### `setApprovalRule`

**PUT** `/api/v1/agent/sessions/{id}/approval/rules/{tool}`

Set one session permission rule.

```typescript
client.agent.sessions.setApprovalRule(id: string, tool: string, data: AgentSessionsSetApprovalRuleRequest, options?: { realm?: string; IfMatch?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsSetApprovalRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `tool` | `string` | Yes | path | The tool. |
| `data` | `AgentSessionsSetApprovalRuleRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `IfMatch` | `string` | No | header | Conditional-request precondition: the ETag from GET /sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsSetApprovalRuleResponse`

**CLI:** `hoody agent sessions approval rules set`

---

### `setAutoReply`

**PATCH** `/api/v1/agent/sessions/{id}/auto-reply`

Arm/disarm the auto-reply loop.

```typescript
client.agent.sessions.setAutoReply(id: string, data?: AgentSessionsSetAutoReplyRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsSetAutoReplyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetAutoReplyRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsSetAutoReplyResponse`

**CLI:** `hoody agent sessions autoreply set`

---

### `setAutoReplyWrites`

**PATCH** `/api/v1/agent/sessions/{id}/auto-reply/writes`

Flip the auto-reply write opt-in.

```typescript
client.agent.sessions.setAutoReplyWrites(id: string, data?: AgentSessionsSetAutoReplyWritesRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsSetAutoReplyWritesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetAutoReplyWritesRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsSetAutoReplyWritesResponse`

**CLI:** `hoody agent sessions autoreply writes set`

---

### `setEffort`

**PATCH** `/api/v1/agent/sessions/{id}/effort`

Set reasoning effort.

```typescript
client.agent.sessions.setEffort(id: string, data?: AgentSessionsSetEffortRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsSetEffortResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetEffortRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsSetEffortResponse`

**CLI:** `hoody agent sessions effort set`

---

### `setHoodyEnv`

**PATCH** `/api/v1/agent/sessions/{id}/hoody-env`

Toggle Hoody shell-env injection.

```typescript
client.agent.sessions.setHoodyEnv(id: string, data?: AgentSessionsSetHoodyEnvRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsSetHoodyEnvResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetHoodyEnvRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsSetHoodyEnvResponse`

**CLI:** `hoody agent sessions env set`

---

### `setModel`

**PATCH** `/api/v1/agent/sessions/{id}/model`

Switch the session model.

```typescript
client.agent.sessions.setModel(id: string, data: AgentSessionsSetModelRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsSetModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetModelRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsSetModelResponse`

**CLI:** `hoody agent sessions model set`

---

### `setVerbosity`

**PATCH** `/api/v1/agent/sessions/{id}/verbosity`

Set response verbosity.

```typescript
client.agent.sessions.setVerbosity(id: string, data?: AgentSessionsSetVerbosityRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsSetVerbosityResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetVerbosityRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsSetVerbosityResponse`

**CLI:** `hoody agent sessions verbosity set`

---

### `setYolo`

**PATCH** `/api/v1/agent/sessions/{id}/yolo`

Arm or disarm YOLO auto-approve.

```typescript
client.agent.sessions.setYolo(id: string, data: AgentSessionsSetYoloRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsSetYoloResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsSetYoloRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsSetYoloResponse`

**CLI:** `hoody agent sessions yolo set`

---

### `startTurn`

**POST** `/api/v1/agent/sessions/{id}/messages`

Dispatch a turn (fire-and-observe).

```typescript
client.agent.sessions.startTurn(id: string, data: AgentSessionsStartTurnRequest, options?: { realm?: string; IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsStartTurnResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsStartTurnRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `IdempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsStartTurnResponse`

**CLI:** `hoody agent sessions turns start`

---

### `startTurnAndStream`

**POST** `/api/v1/agent/sessions/{id}/prompt:stream`

Dispatch a turn and stream the response.

```typescript
client.agent.sessions.startTurnAndStream(options: { id: string; policy?: string; XHoodyGatePolicy?: string; IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string; data: object }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `policy` | `string` | No | query | auto_approve auto-answers confirm gates for the life of the stream (alias of the X-Hoody-Gate-Policy header); off by default; the gateway asks for no separate credentials to use it; access is decided by the container's proxy permission policy. |
| `XHoodyGatePolicy` | `string` | No | header | Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture (off by default; the in:query alias is ?policy=). Any other value is rejected 400. |
| `IdempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). The turn runs at most once per key: a retry is 409 replay_unavailable with the turn's receipt (details.turn), never a re-run and never a second stream; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent sessions turns start`

---

### `startWorkflow`

**POST** `/api/v1/agent/sessions/{id}/workflows/{name}/runs`

Run a workflow onto an existing session.

```typescript
client.agent.sessions.startWorkflow(id: string, name: string, data?: AgentSessionsStartWorkflowRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsStartWorkflowResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentSessionsStartWorkflowRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsStartWorkflowResponse`

**CLI:** `hoody agent sessions workflows start`

---

### `trim`

**POST** `/api/v1/agent/sessions/{id}/trim`

Trim session history to a turn index.

```typescript
client.agent.sessions.trim(id: string, data?: AgentSessionsTrimRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsTrimResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsTrimRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsTrimResponse`

**CLI:** `hoody agent sessions trim`

---

### `updateApproval`

**PUT** `/api/v1/agent/sessions/{id}/approval`

Set a session's approval mode and lock.

```typescript
client.agent.sessions.updateApproval(id: string, data?: AgentSessionsUpdateApprovalRequest, options?: { realm?: string; IfMatch?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsUpdateApprovalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsUpdateApprovalRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `IfMatch` | `string` | No | header | Conditional-request precondition: the ETag from GET /sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsUpdateApprovalResponse`

**CLI:** `hoody agent sessions approval update`

---

## `client.agent.sessions.turns` (5 methods)

### `cancel`

**POST** `/api/v1/agent/sessions/{id}/cancel`

Cancel the active turn (Esc), or one named turn.

```typescript
client.agent.sessions.turns.cancel(id: string, data?: AgentSessionsTurnsCancelRequest, options?: { turn_id?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsTurnsCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsTurnsCancelRequest` | No | body |  |
| `turn_id` | `string` | No | query | Cancel only this turn (alternative to the body field). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsTurnsCancelResponse`

**CLI:** `hoody agent sessions turns cancel`

---

### `create`

**POST** `/api/v1/agent/sessions/{id}/turns`

Dispatch a turn (retry-safe).

```typescript
client.agent.sessions.turns.create(id: string, data: AgentSessionsTurnsCreateRequest, options?: { realm?: string; IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsTurnsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsTurnsCreateRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `IdempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsTurnsCreateResponse`

**CLI:** `hoody agent sessions turns create`

---

### `get`

**GET** `/api/v1/agent/sessions/{id}/turns/{turn_id}`

Get a turn's durable receipt.

```typescript
client.agent.sessions.turns.get(id: string, turn_id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsTurnsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `turn_id` | `string` | Yes | path | The turn id. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsTurnsGetResponse`

**CLI:** `hoody agent sessions turns get`

---

### `list`

**GET** `/api/v1/agent/sessions/{id}/turns`

List a session's durable turn receipts.

```typescript
client.agent.sessions.turns.list(id: string, options?: { limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsTurnsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `limit` | `number` | No | query | Return at most this many receipts, newest first (1–1000). A cap, not a page size: there is no next page. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsTurnsListResponse`

**CLI:** `hoody agent sessions turns list`

---

### `run`

**POST** `/api/v1/agent/sessions/{id}/prompt:sync`

Dispatch a turn and block until it ends (no reply text: read it from the transcript)

```typescript
client.agent.sessions.turns.run(id: string, data: AgentSessionsTurnsRunRequest, options?: { policy?: string; realm?: string; XHoodyGatePolicy?: string; IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSessionsTurnsRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentSessionsTurnsRunRequest` | Yes | body |  |
| `policy` | `string` | No | query | auto_approve adopts the headless auto-answer posture (alias of the X-Hoody-Gate-Policy header); off by default; the gateway asks for no separate credentials to use it; access is decided by the container's proxy permission policy. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyGatePolicy` | `string` | No | header | Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture (off by default; the in:query alias is ?policy=). Any other value is rejected 400. |
| `IdempotencyKey` | `string` | No | header | Opaque retry key (1–255 printable ASCII, no whitespace). The turn runs at most once per key: a retry answers 200 duplicate:true with the turn's outcome (or pending_turn while it still runs) and never re-runs it; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSessionsTurnsRunResponse`

**CLI:** `hoody agent sessions turns run`

---

## `client.agent.settings` (2 methods)

### `get`

**GET** `/api/v1/agent/settings`

Get settings.

```typescript
client.agent.settings.get(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentSettingsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSettingsGetResponse`

**CLI:** `hoody agent settings get`

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

## `client.agent.skills` (13 methods)

### `create`

**POST** `/api/v1/agent/skills`

Create a skill.

```typescript
client.agent.skills.create(data: AgentSkillsCreateRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsCreateRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsCreateResponse`

**CLI:** `hoody agent skills create`

---

### `delete`

**POST** `/api/v1/agent/skills/delete`

Delete a skill.

```typescript
client.agent.skills.delete(data: AgentSkillsDeleteRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsDeleteRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsDeleteResponse`

**CLI:** `hoody agent skills delete`

---

### `disable`

**POST** `/api/v1/agent/skills/toggle`

Enable/disable a skill.

```typescript
client.agent.skills.disable(data: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent skills disable`

---

### `enable`

**POST** `/api/v1/agent/skills/toggle`

Enable/disable a skill.

```typescript
client.agent.skills.enable(data: object, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody agent skills enable`

---

### `getSource`

**GET** `/api/v1/agent/skills/source`

Read a skill's source.

```typescript
client.agent.skills.getSource(options?: { root_dir?: string; rel_dir?: string; root?: string; rel?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsGetSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `root_dir` | `string` | No | query | Skill root directory (identity; alias: root). |
| `rel_dir` | `string` | No | query | Skill relative directory (identity; alias: rel). |
| `root` | `string` | No | query | Friendly alias of root_dir (translated to root_dir server-side). |
| `rel` | `string` | No | query | Friendly alias of rel_dir (translated to rel_dir server-side). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsGetSourceResponse`

**CLI:** `hoody agent skills source get`

---

### `import`

**POST** `/api/v1/agent/skills/import/apply`

Apply a skill import.

```typescript
client.agent.skills.import(data: AgentSkillsImportRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsImportRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsImportResponse`

**CLI:** `hoody agent skills import`

---

### `list`

**GET** `/api/v1/agent/skills`

List skills.

```typescript
client.agent.skills.list(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsListResponse`

**CLI:** `hoody agent skills list`

---

### `listAll`

**GET** `/api/v1/agent/skills`

List skills. (collect all pages)

```typescript
client.agent.skills.listAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/skills`

List skills. (async iterator)

```typescript
client.agent.skills.listIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `rename`

**POST** `/api/v1/agent/skills/rename`

Rename a skill.

```typescript
client.agent.skills.rename(data: AgentSkillsRenameRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsRenameResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsRenameRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsRenameResponse`

**CLI:** `hoody agent skills rename`

---

### `scan`

**GET** `/api/v1/agent/skills/import/scan`

Scan for importable skills.

```typescript
client.agent.skills.scan(options: { source: "claude" | "codex"; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsScanResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source` | `"claude" \| "codex"` | Yes | query | Which tool's skills to scan. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsScanResponse`

**CLI:** `hoody agent skills scan`

---

### `setSource`

**PUT** `/api/v1/agent/skills/source`

Write a skill's source.

```typescript
client.agent.skills.setSource(data: AgentSkillsSetSourceRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsSetSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsSetSourceRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsSetSourceResponse`

**CLI:** `hoody agent skills source set`

---

### `trust`

**POST** `/api/v1/agent/skills/trust`

Set a skill's trust state.

```typescript
client.agent.skills.trust(data: AgentSkillsTrustRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsTrustResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsTrustRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsTrustResponse`

**CLI:** `hoody agent skills trust`

---

## `client.agent.skills.hub` (5 methods)

### `clearCache`

**DELETE** `/api/v1/agent/skills/hub/cache`

Clear the skill hub cache.

```typescript
client.agent.skills.hub.clearCache(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsHubClearCacheResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsHubClearCacheResponse`

**CLI:** `hoody agent skills hub cache clear`

---

### `getCacheStats`

**GET** `/api/v1/agent/skills/hub/cache`

Skill hub cache stats.

```typescript
client.agent.skills.hub.getCacheStats(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsHubGetCacheStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsHubGetCacheStatsResponse`

**CLI:** `hoody agent skills hub cache stats`

---

### `install`

**POST** `/api/v1/agent/skills/hub/install`

Install a hub skill.

```typescript
client.agent.skills.hub.install(data: AgentSkillsHubInstallRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsHubInstallResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentSkillsHubInstallRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsHubInstallResponse`

**CLI:** `hoody agent skills hub install`

---

### `preview`

**GET** `/api/v1/agent/skills/hub/preview`

Preview a hub skill.

```typescript
client.agent.skills.hub.preview(options: { provider: string; source: string; skill_id: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsHubPreviewResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `provider` | `string` | Yes | query | Hub provider of the skill (a search result's ref.provider). |
| `source` | `string` | Yes | query | Source of the skill on the hub, such as owner/repo (a search result's ref.source). |
| `skill_id` | `string` | Yes | query | Hub skill id (a search result's ref.skill_id). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsHubPreviewResponse`

**CLI:** `hoody agent skills hub preview`

---

### `search`

**GET** `/api/v1/agent/skills/hub/search`

Search the skill hub.

```typescript
client.agent.skills.hub.search(options: { query: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentSkillsHubSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `query` | `string` | Yes | query | Search text. Required and non-empty. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentSkillsHubSearchResponse`

**CLI:** `hoody agent skills hub search`

---

## `client.agent.stats` (1 method)

### `get`

**GET** `/api/v1/agent/statistics`

Cross-session statistics.

```typescript
client.agent.stats.get(options?: { scope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentStatsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `scope` | `string` | No | query | cwd (default) rolls up the current working directory; all rolls up every session. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentStatsGetResponse`

**CLI:** `hoody agent stats`

---

## `client.agent.tasks` (3 methods)

### `cancel`

**POST** `/api/v1/agent/sessions/{id}/tasks/{tid}/cancel`

Cancel a background task.

```typescript
client.agent.tasks.cancel(id: string, tid: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTasksCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `tid` | `string` | Yes | path | The task id. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTasksCancelResponse`

**CLI:** `hoody agent tasks cancel`

---

### `getTranscript`

**GET** `/api/v1/agent/sessions/{id}/tasks/{tid}/transcript`

Read a background task's transcript.

```typescript
client.agent.tasks.getTranscript(id: string, tid: string, options?: { after_seq?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTasksGetTranscriptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `tid` | `string` | Yes | path | The task id. |
| `after_seq` | `number` | No | query | Exclusive int64 upsert-poll cursor: entries with seq strictly greater than it, plus any still-OPEN entry regardless of its seq. Omit for the whole transcript (distinct from 0, which skips a closed seq-0 entry). Negative/non-integer = 400. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTasksGetTranscriptResponse`

**CLI:** `hoody agent tasks transcript get`

---

### `list`

**GET** `/api/v1/agent/sessions/{id}/tasks`

List a session's background tasks.

```typescript
client.agent.tasks.list(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTasksListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTasksListResponse`

**CLI:** `hoody agent tasks list`

---

## `client.agent.todos` (19 methods)

### `approveProposal`

**POST** `/api/v1/agent/todos/{id}/proposals/{pid}/approve`

Approve a todo proposal.

```typescript
client.agent.todos.approveProposal(id: string, pid: string, data?: AgentTodosApproveProposalRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosApproveProposalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `pid` | `string` | Yes | path | The proposal id. |
| `data` | `AgentTodosApproveProposalRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosApproveProposalResponse`

**CLI:** `hoody agent todos proposals approve`

---

### `archive`

**POST** `/api/v1/agent/todos/{id}/archive`

Archive a todo.

```typescript
client.agent.todos.archive(id: string, data: AgentTodosArchiveRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosArchiveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosArchiveRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosArchiveResponse`

**CLI:** `hoody agent todos archive`

---

### `cancel`

**POST** `/api/v1/agent/todos/{id}/cancel-run`

Cancel a todo's run.

```typescript
client.agent.todos.cancel(id: string, data?: AgentTodosCancelRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosCancelRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosCancelResponse`

**CLI:** `hoody agent todos cancel`

---

### `claim`

**POST** `/api/v1/agent/todos/{id}/claim`

Claim a todo.

```typescript
client.agent.todos.claim(id: string, data: AgentTodosClaimRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosClaimResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosClaimRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosClaimResponse`

**CLI:** `hoody agent todos claim`

---

### `create`

**POST** `/api/v1/agent/todos`

File a todo.

```typescript
client.agent.todos.create(data: AgentTodosCreateRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentTodosCreateRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosCreateResponse`

**CLI:** `hoody agent todos create`

---

### `createComment`

**POST** `/api/v1/agent/todos/{id}/messages`

Comment on a todo.

```typescript
client.agent.todos.createComment(id: string, data: AgentTodosCreateCommentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosCreateCommentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosCreateCommentRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosCreateCommentResponse`

**CLI:** `hoody agent todos comments create`

---

### `denyProposal`

**POST** `/api/v1/agent/todos/{id}/proposals/{pid}/deny`

Deny a todo proposal.

```typescript
client.agent.todos.denyProposal(id: string, pid: string, data?: AgentTodosDenyProposalRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosDenyProposalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `pid` | `string` | Yes | path | The proposal id. |
| `data` | `AgentTodosDenyProposalRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosDenyProposalResponse`

**CLI:** `hoody agent todos proposals deny`

---

### `get`

**GET** `/api/v1/agent/todos/{id}`

Read a todo.

```typescript
client.agent.todos.get(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosGetResponse`

**CLI:** `hoody agent todos get`

---

### `getRevision`

**GET** `/api/v1/agent/todos/revision`

Get the todos store revision.

```typescript
client.agent.todos.getRevision(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentTodosGetRevisionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosGetRevisionResponse`

**CLI:** `hoody agent todos revision get`

---

### `list`

**GET** `/api/v1/agent/todos`

List todos.

```typescript
client.agent.todos.list(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentTodosListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | No | query | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | No | query | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | No | query | Free-text filter over title/body. |
| `open_only` | `boolean` | No | query | When true, only open (non-terminal) todos. |
| `all` | `boolean` | No | query | When true, include archived/closed todos. |
| `sort` | `"default" \| "closed_at"` | No | query | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosListResponse`

**CLI:** `hoody agent todos list`

---

### `listAll`

**GET** `/api/v1/agent/todos`

List todos. (collect all pages)

```typescript
client.agent.todos.listAll(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | No | query | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | No | query | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | No | query | Free-text filter over title/body. |
| `open_only` | `boolean` | No | query | When true, only open (non-terminal) todos. |
| `all` | `boolean` | No | query | When true, include archived/closed todos. |
| `sort` | `"default" \| "closed_at"` | No | query | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/todos`

List todos. (async iterator)

```typescript
client.agent.todos.listIterator(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | No | query | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | No | query | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | No | query | Free-text filter over title/body. |
| `open_only` | `boolean` | No | query | When true, only open (non-terminal) todos. |
| `all` | `boolean` | No | query | When true, include archived/closed todos. |
| `sort` | `"default" \| "closed_at"` | No | query | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `purgeArchived`

**POST** `/api/v1/agent/todos/purge`

Purge archived todos.

```typescript
client.agent.todos.purgeArchived(data?: AgentTodosPurgeArchivedRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosPurgeArchivedResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentTodosPurgeArchivedRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosPurgeArchivedResponse`

**CLI:** `hoody agent todos archived purge`

---

### `release`

**POST** `/api/v1/agent/todos/{id}/release`

Release a todo.

```typescript
client.agent.todos.release(id: string, data: AgentTodosReleaseRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosReleaseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosReleaseRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosReleaseResponse`

**CLI:** `hoody agent todos release`

---

### `sendMessage`

**POST** `/api/v1/agent/todos/{id}/message`

Comment + run an orchestrator turn.

```typescript
client.agent.todos.sendMessage(id: string, data: AgentTodosSendMessageRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosSendMessageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosSendMessageRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosSendMessageResponse`

**CLI:** `hoody agent todos messages send`

---

### `snooze`

**POST** `/api/v1/agent/todos/{id}/snooze`

Snooze a todo.

```typescript
client.agent.todos.snooze(id: string, data: AgentTodosSnoozeRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosSnoozeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosSnoozeRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosSnoozeResponse`

**CLI:** `hoody agent todos snooze`

---

### `start`

**POST** `/api/v1/agent/todos/{id}/run`

Run a todo's orchestrator.

```typescript
client.agent.todos.start(id: string, data?: AgentTodosStartRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosStartRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosStartResponse`

**CLI:** `hoody agent todos start`

---

### `triage`

**POST** `/api/v1/agent/todos/triage`

Run an LLM triage pass.

```typescript
client.agent.todos.triage(data?: AgentTodosTriageRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosTriageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AgentTodosTriageRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosTriageResponse`

**CLI:** `hoody agent todos triage`

---

### `update`

**PATCH** `/api/v1/agent/todos/{id}`

Update a todo (CAS).

```typescript
client.agent.todos.update(id: string, data: AgentTodosUpdateRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentTodosUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The todo id. |
| `data` | `AgentTodosUpdateRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentTodosUpdateResponse`

**CLI:** `hoody agent todos update`

---

## `client.agent.tools` (9 methods)

### `get`

**GET** `/api/v1/agent/tools/{name}`

Get one tool schema.

```typescript
client.agent.tools.get(name: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentToolsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentToolsGetResponse`

**CLI:** `hoody agent tools get`

---

### `list`

**GET** `/api/v1/agent/tools`

List the tool catalogue.

```typescript
client.agent.tools.list(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentToolsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentToolsListResponse`

**CLI:** `hoody agent tools list`

---

### `listAll`

**GET** `/api/v1/agent/tools`

List the tool catalogue. (collect all pages)

```typescript
client.agent.tools.listAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/tools`

List the tool catalogue. (async iterator)

```typescript
client.agent.tools.listIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listReadOnly`

**GET** `/api/v1/agent/tools/read-only`

List the read-only tool subset.

```typescript
client.agent.tools.listReadOnly(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentToolsListReadOnlyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentToolsListReadOnlyResponse`

**CLI:** `hoody agent tools readonly list`

---

### `listReadOnlyAll`

**GET** `/api/v1/agent/tools/read-only`

List the read-only tool subset. (collect all pages)

```typescript
client.agent.tools.listReadOnlyAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listReadOnlyIterator`

**GET** `/api/v1/agent/tools/read-only`

List the read-only tool subset. (async iterator)

```typescript
client.agent.tools.listReadOnlyIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `run`

**POST** `/api/v1/agent/tools/{name}/run`

Run a tool (sessionless, gated).

```typescript
client.agent.tools.run(name: string, data?: object, options?: { confirm?: boolean; confirm_token?: string; XHoodyToolMode?: string; XHoodyDirScope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; realm?: string; stream?: boolean }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `confirm` | `boolean` | No | query | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | No | query | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `XHoodyToolMode` | `string` | No | header | Sessionless tool-mode for the ephemeral session: `standard` (the default) or `orchestrator`. Any other value is refused 400 invalid_tool_mode. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `XHoodyDirScope` | `string` | No | header | Sessionless directory-access scope for the ephemeral session: home (the default) or full. Any other value is refused 400 invalid_dir_scope. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | No | body |  |
| `stream` | `boolean` | No | option | Stream the tool output as server-sent events. |

**Returns:** `any`

**CLI:** `hoody agent tools run`

---

### `start`

**POST** `/api/v1/agent/tools/{name}/runAsync`

Run a tool asynchronously (sessionless, gated).

```typescript
client.agent.tools.start(name: string, data?: AgentToolsStartRequest, options?: { confirm?: boolean; confirm_token?: string; realm?: string; XHoodyToolMode?: string; XHoodyDirScope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentToolsStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentToolsStartRequest` | No | body |  |
| `confirm` | `boolean` | No | query | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | No | query | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyToolMode` | `string` | No | header | Sessionless tool-mode for the ephemeral session: `standard` (the default) or `orchestrator`. Any other value is refused 400 invalid_tool_mode. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `XHoodyDirScope` | `string` | No | header | Sessionless directory-access scope for the ephemeral session: home (the default) or full. Any other value is refused 400 invalid_dir_scope. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentToolsStartResponse`

**CLI:** `hoody agent tools start`

---

## `client.agent.usage` (2 methods)

### `listByAccount`

**GET** `/api/v1/agent/usage/by-account`

Usage rollup by account.

```typescript
client.agent.usage.listByAccount(options?: { since?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentUsageListByAccountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `since` | `number` | No | query | Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentUsageListByAccountResponse`

**CLI:** `hoody agent usage accounts list`

---

### `listByModel`

**GET** `/api/v1/agent/usage/by-model`

Usage rollup by model.

```typescript
client.agent.usage.listByModel(options?: { since?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentUsageListByModelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `since` | `number` | No | query | Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentUsageListByModelResponse`

**CLI:** `hoody agent usage models list`

---

## `client.agent.workflows` (16 methods)

### `cancelRun`

**POST** `/api/v1/agent/workflows/runs/{run_id}/cancel`

Cancel a workflow run.

```typescript
client.agent.workflows.cancelRun(run_id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentWorkflowsCancelRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `run_id` | `string` | Yes | path | The run id. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentWorkflowsCancelRunResponse`

**CLI:** `hoody agent workflows runs cancel`

---

### `delete`

**DELETE** `/api/v1/agent/workflows/{name}`

Delete a workflow definition.

```typescript
client.agent.workflows.delete(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentWorkflowsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentWorkflowsDeleteResponse`

**CLI:** `hoody agent workflows delete`

---

### `get`

**GET** `/api/v1/agent/workflows/{name}`

Read one workflow definition.

```typescript
client.agent.workflows.get(name: string, options?: { include_revision?: boolean; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentWorkflowsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `include_revision` | `boolean` | No | query | If "true", the tool output's first line is `revision: &lt;opaque&gt;` — pass that value as putWorkflow's expected_revision to guard against concurrent edits; the JSON below it is unchanged. Strictly parsed: exactly one value, "true" or "false"; anything else (empty, "TRUE", "1", repeated) is a 400 bad_request. |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentWorkflowsGetResponse`

**CLI:** `hoody agent workflows get`

---

### `getRun`

**GET** `/api/v1/agent/workflows/runs/{run_id}`

Get one workflow run by id.

```typescript
client.agent.workflows.getRun(run_id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentWorkflowsGetRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `run_id` | `string` | Yes | path | The run id. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentWorkflowsGetRunResponse`

**CLI:** `hoody agent workflows runs get`

---

### `list`

**GET** `/api/v1/agent/workflows`

List workflow definitions.

```typescript
client.agent.workflows.list(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentWorkflowsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentWorkflowsListResponse`

**CLI:** `hoody agent workflows list`

---

### `listAll`

**GET** `/api/v1/agent/workflows`

List workflow definitions. (collect all pages)

```typescript
client.agent.workflows.listAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/agent/workflows`

List workflow definitions. (async iterator)

```typescript
client.agent.workflows.listIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listRuns`

**GET** `/api/v1/agent/workflows/runs`

Snapshot in-flight and recent workflow runs.

```typescript
client.agent.workflows.listRuns(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentWorkflowsListRunsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentWorkflowsListRunsResponse`

**CLI:** `hoody agent workflows runs list`

---

### `listRunsAll`

**GET** `/api/v1/agent/workflows/runs`

Snapshot in-flight and recent workflow runs. (collect all pages)

```typescript
client.agent.workflows.listRunsAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listRunsIterator`

**GET** `/api/v1/agent/workflows/runs`

Snapshot in-flight and recent workflow runs. (async iterator)

```typescript
client.agent.workflows.listRunsIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number for pagination. |
| `limit` | `number` | No | query | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `resumeRun`

**POST** `/api/v1/agent/workflows/runs/{run_id}/resume`

Resume a failed or cancelled workflow run.

```typescript
client.agent.workflows.resumeRun(run_id: string, data: AgentWorkflowsResumeRunRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; cache?: boolean | number }): Promise<AgentWorkflowsResumeRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `run_id` | `string` | Yes | path | The run id. |
| `data` | `AgentWorkflowsResumeRunRequest` | Yes | body |  |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentWorkflowsResumeRunResponse`

**CLI:** `hoody agent workflows runs resume`

---

### `sendMessage`

**POST** `/api/v1/agent/sessions/{id}/workflow/messages`

Send a message to a running workflow.

```typescript
client.agent.workflows.sendMessage(id: string, data?: AgentWorkflowsSendMessageRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentWorkflowsSendMessageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The session id. |
| `data` | `AgentWorkflowsSendMessageRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentWorkflowsSendMessageResponse`

**CLI:** `hoody agent workflows messages send`

---

### `set`

**PUT** `/api/v1/agent/workflows/{name}`

Create or replace a workflow definition.

```typescript
client.agent.workflows.set(name: string, data: AgentWorkflowsSetRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentWorkflowsSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentWorkflowsSetRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentWorkflowsSetResponse`

**CLI:** `hoody agent workflows set`

---

### `setHidden`

**POST** `/api/v1/agent/workflows/{name}/hide`

Hide or un-hide a workflow.

```typescript
client.agent.workflows.setHidden(name: string, data?: AgentWorkflowsSetHiddenRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentWorkflowsSetHiddenResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentWorkflowsSetHiddenRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentWorkflowsSetHiddenResponse`

**CLI:** `hoody agent workflows hidden set`

---

### `setSummary`

**PUT** `/api/v1/agent/workflows/{name}/summary`

Set or clear a workflow's summary.

```typescript
client.agent.workflows.setSummary(name: string, data: AgentWorkflowsSetSummaryRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentWorkflowsSetSummaryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentWorkflowsSetSummaryRequest` | Yes | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentWorkflowsSetSummaryResponse`

**CLI:** `hoody agent workflows summary set`

---

### `start`

**POST** `/api/v1/agent/workflows/{name}/runs`

Run a workflow in a new session.

```typescript
client.agent.workflows.start(name: string, data?: AgentWorkflowsStartRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string; cache?: boolean | number }): Promise<AgentWorkflowsStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The name. |
| `data` | `AgentWorkflowsStartRequest` | No | body |  |
| `realm` | `string` | No | query | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `XHoodyCwd` | `string` | No | header | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | No | header | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | No | header | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | No | header | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AgentWorkflowsStartResponse`

**CLI:** `hoody agent workflows start`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
