# `notes` — 64 methods

**Version:** 1.0.0-beta.6
**Accessor:** `client.notes`

```typescript
import * as notes from 'hoody-sdk/notes';
```

---

## `client.notes.avatars` (2 methods)

### `download`

**GET** `/api/v1/notes/avatars/{avatarId}`

Download an avatar image

```typescript
client.notes.avatars.download(avatarId: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `avatarId` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

---

### `upload`

**POST** `/api/v1/notes/avatars`

Upload an avatar image

```typescript
client.notes.avatars.upload(): Promise<NotesAvatarsUploadResponse>
```

**Returns:** `NotesAvatarsUploadResponse`

---

## `client.notes.collaborators` (4 methods)

### `add`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators`

Add a collaborator

```typescript
client.notes.collaborators.add(notebookId: string, nodeId: string, data: NotesCollaboratorsAddRequest): Promise<NotesCollaboratorsAddResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesCollaboratorsAddRequest` | Yes | body |  |

**Returns:** `NotesCollaboratorsAddResponse`

**CLI:** `hoody notes collab add`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators`

List collaborators

```typescript
client.notes.collaborators.list(notebookId: string, nodeId: string): Promise<NotesCollaboratorsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |

**Returns:** `NotesCollaboratorsListResponse`

**CLI:** `hoody notes collab list`

---

### `remove`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}`

Remove a collaborator

```typescript
client.notes.collaborators.remove(notebookId: string, nodeId: string, collaboratorId: string): Promise<NotesCollaboratorsRemoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `collaboratorId` | `string` | Yes | path |  |

**Returns:** `NotesCollaboratorsRemoveResponse`

**CLI:** `hoody notes collab remove`

---

### `update`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}`

Update collaborator role

```typescript
client.notes.collaborators.update(notebookId: string, nodeId: string, collaboratorId: string, data: NotesCollaboratorsUpdateRequest): Promise<NotesCollaboratorsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `collaboratorId` | `string` | Yes | path |  |
| `data` | `NotesCollaboratorsUpdateRequest` | Yes | body |  |

**Returns:** `NotesCollaboratorsUpdateResponse`

**CLI:** `hoody notes collab update`

---

## `client.notes.comments` (7 methods)

### `create`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`

Create a comment

```typescript
client.notes.comments.create(notebookId: string, nodeId: string, data: NotesCommentsCreateRequest): Promise<NotesCommentsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesCommentsCreateRequest` | Yes | body |  |

**Returns:** `NotesCommentsCreateResponse`

**CLI:** `hoody notes comment create`

---

### `delete`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`

Delete a comment

```typescript
client.notes.comments.delete(notebookId: string, nodeId: string, commentId: string, options?: { expectedVersion?: number }): Promise<NotesCommentsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `commentId` | `string` | Yes | path |  |
| `expectedVersion` | `number` | No | query |  |

**Returns:** `NotesCommentsDeleteResponse`

**CLI:** `hoody notes comment delete`

---

### `edit`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`

Edit a comment

```typescript
client.notes.comments.edit(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsEditRequest): Promise<NotesCommentsEditResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `commentId` | `string` | Yes | path |  |
| `data` | `NotesCommentsEditRequest` | Yes | body |  |

**Returns:** `NotesCommentsEditResponse`

**CLI:** `hoody notes comment edit`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`

List comments

```typescript
client.notes.comments.list(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string }): Promise<NotesCommentsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query |  |

**Returns:** `NotesCommentsListResponse`

**CLI:** `hoody notes comment list`

---

### `listAnchors`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`

List comment anchors

```typescript
client.notes.comments.listAnchors(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string }): Promise<NotesCommentsListAnchorsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query |  |

**Returns:** `NotesCommentsListAnchorsResponse`

**CLI:** `hoody notes comment anchors`

---

### `reanchor`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor`

Re-anchor a comment thread

```typescript
client.notes.comments.reanchor(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsReanchorRequest): Promise<NotesCommentsReanchorResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `commentId` | `string` | Yes | path |  |
| `data` | `NotesCommentsReanchorRequest` | Yes | body |  |

**Returns:** `NotesCommentsReanchorResponse`

---

### `resolve`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve`

Resolve a comment

```typescript
client.notes.comments.resolve(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsResolveRequest): Promise<NotesCommentsResolveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `commentId` | `string` | Yes | path |  |
| `data` | `NotesCommentsResolveRequest` | Yes | body |  |

**Returns:** `NotesCommentsResolveResponse`

**CLI:** `hoody notes comment resolve`

---

## `client.notes.databases` (8 methods)

### `create`

**POST** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`

Create a database record

```typescript
client.notes.databases.create(notebookId: string, databaseId: string, data: NotesDatabasesCreateRequest): Promise<NotesDatabasesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `data` | `NotesDatabasesCreateRequest` | Yes | body |  |

**Returns:** `NotesDatabasesCreateResponse`

**CLI:** `hoody notes db create`

---

### `delete`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`

Delete a database record

```typescript
client.notes.databases.delete(notebookId: string, databaseId: string, recordId: string): Promise<NotesDatabasesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `recordId` | `string` | Yes | path |  |

**Returns:** `NotesDatabasesDeleteResponse`

**CLI:** `hoody notes db delete`

---

### `get`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`

Get a database record

```typescript
client.notes.databases.get(notebookId: string, databaseId: string, recordId: string): Promise<NotesDatabasesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `recordId` | `string` | Yes | path |  |

**Returns:** `NotesDatabasesGetResponse`

**CLI:** `hoody notes db get`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`

List database records

```typescript
client.notes.databases.list(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number }): Promise<NotesDatabasesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `filters` | `string` | No | query |  |
| `sorts` | `string` | No | query |  |
| `page` | `number` | No | query |  |
| `count` | `number` | No | query |  |

**Returns:** `NotesDatabasesListResponse`

**CLI:** `hoody notes db list`

---

### `listAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`

List database records (collect all pages)

```typescript
client.notes.databases.listAll(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `filters` | `string` | No | query |  |
| `sorts` | `string` | No | query |  |
| `page` | `number` | No | query |  |
| `count` | `number` | No | query |  |

**Returns:** `unknown[]`

**CLI:** `hoody notes db list`

---

### `listIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`

List database records (async iterator)

```typescript
client.notes.databases.listIterator(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `filters` | `string` | No | query |  |
| `sorts` | `string` | No | query |  |
| `page` | `number` | No | query |  |
| `count` | `number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody notes db list`

---

### `search`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search`

Search database records

```typescript
client.notes.databases.search(notebookId: string, databaseId: string, options?: { q?: string; exclude?: string }): Promise<NotesDatabasesSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `q` | `string` | No | query |  |
| `exclude` | `string` | No | query |  |

**Returns:** `NotesDatabasesSearchResponse`

**CLI:** `hoody notes db search`

---

### `update`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`

Update a database record

```typescript
client.notes.databases.update(notebookId: string, databaseId: string, recordId: string, data: NotesDatabasesUpdateRequest): Promise<NotesDatabasesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `recordId` | `string` | Yes | path |  |
| `data` | `NotesDatabasesUpdateRequest` | Yes | body |  |

**Returns:** `NotesDatabasesUpdateResponse`

**CLI:** `hoody notes db update`

---

## `client.notes.documents` (6 methods)

### `appendDocument`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`

Append blocks to a document

```typescript
client.notes.documents.appendDocument(notebookId: string, nodeId: string, data: NotesAppendDocumentRequest, options?: { XIdempotencyKey?: string }): Promise<NotesAppendDocumentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesAppendDocumentRequest` | Yes | body |  |
| `XIdempotencyKey` | `string` | No | header | Optional idempotency key (max 256 chars). Reusing the same key with an identical request body and node replays the original response; reusing it with a different body or node returns 409. |

**Returns:** `NotesAppendDocumentResponse`

---

### `createExportTicket`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket`

Create secure HTML export ticket

```typescript
client.notes.documents.createExportTicket(notebookId: string, nodeId: string, data: NotesDocumentsCreateExportTicketRequest): Promise<NotesDocumentsCreateExportTicketResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesDocumentsCreateExportTicketRequest` | Yes | body |  |

**Returns:** `NotesDocumentsCreateExportTicketResponse`

---

### `exportBlockSvg`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg`

Export drawing block as SVG

```typescript
client.notes.documents.exportBlockSvg(notebookId: string, nodeId: string, blockId: string, options?: { bg?: string; scale?: number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `blockId` | `string` | Yes | path |  |
| `bg` | `string` | No | query |  |
| `scale` | `number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

---

### `get`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`

Get document content

```typescript
client.notes.documents.get(notebookId: string, nodeId: string, options?: { blockIds?: string; lines?: string; output?: "json" | "md" | "html"; includeComments?: "none" | "appendix"; ticket?: string }): Promise<NotesDocumentsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `blockIds` | `string` | No | query |  |
| `lines` | `string` | No | query |  |
| `output` | `"json" \| "md" \| "html"` | No | query |  |
| `includeComments` | `"none" \| "appendix"` | No | query |  |
| `ticket` | `string` | No | query |  |

**Returns:** `NotesDocumentsGetResponse`

**CLI:** `hoody notes doc get`

---

### `patch`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`

Merge document content

```typescript
client.notes.documents.patch(notebookId: string, nodeId: string, data: NotesDocumentsPatchRequest): Promise<NotesDocumentsPatchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesDocumentsPatchRequest` | Yes | body |  |

**Returns:** `NotesDocumentsPatchResponse`

**CLI:** `hoody notes doc patch`

---

### `put`

**PUT** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`

Create or replace document

```typescript
client.notes.documents.put(notebookId: string, nodeId: string, data: NotesDocumentsPutRequest): Promise<NotesDocumentsPutResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesDocumentsPutRequest` | Yes | body |  |

**Returns:** `NotesDocumentsPutResponse`

**CLI:** `hoody notes doc put`

---

## `client.notes.files` (8 methods)

### `download`

**GET** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}`

Download a file

```typescript
client.notes.files.download(fileId: string, notebookId: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `fileId` | `string` | Yes | path |  |
| `notebookId` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody notes file download`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/files`

List all uploaded files

```typescript
client.notes.files.list(notebookId: string, options?: { limit?: number; offset?: number }): Promise<NotesFilesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `NotesFilesListResponse`

**CLI:** `hoody notes file list`

---

### `listAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/files`

List all uploaded files (collect all pages)

```typescript
client.notes.files.listAll(notebookId: string, options?: { limit?: number; offset?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `unknown[]`

**CLI:** `hoody notes file list`

---

### `listIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/files`

List all uploaded files (async iterator)

```typescript
client.notes.files.listIterator(notebookId: string, options?: { limit?: number; offset?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody notes file list`

---

### `tusAbortUpload`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

Abort a TUS upload

```typescript
client.notes.files.tusAbortUpload(notebookId: string, fileId: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

---

### `tusCheckUpload`

**HEAD** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

Check a TUS upload's offset (for resuming)

```typescript
client.notes.files.tusCheckUpload(notebookId: string, fileId: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

---

### `tusCreateUpload`

**POST** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

Create a resumable (TUS) upload

```typescript
client.notes.files.tusCreateUpload(notebookId: string, fileId: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

---

### `tusUploadChunk`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

Upload a chunk to a TUS upload

```typescript
client.notes.files.tusUploadChunk(notebookId: string, fileId: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

---

## `client.notes.health` (1 method)

### `check`

**GET** `/api/v1/notes/health`

Service health and runtime info

```typescript
client.notes.health.check(): Promise<NotesHealthCheckResponse>
```

**Returns:** `NotesHealthCheckResponse`

---

## `client.notes.identity` (1 method)

### `get`

**GET** `/api/v1/notes/me`

Get current identity

```typescript
client.notes.identity.get(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody notes whoami`

---

## `client.notes.interactions` (2 methods)

### `markOpened`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened`

Mark node as opened

```typescript
client.notes.interactions.markOpened(notebookId: string, nodeId: string, data: NotesInteractionsMarkOpenedRequest): Promise<NotesInteractionsMarkOpenedResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesInteractionsMarkOpenedRequest` | Yes | body |  |

**Returns:** `NotesInteractionsMarkOpenedResponse`

---

### `markSeen`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen`

Mark node as seen

```typescript
client.notes.interactions.markSeen(notebookId: string, nodeId: string, data: NotesInteractionsMarkSeenRequest): Promise<NotesInteractionsMarkSeenResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesInteractionsMarkSeenRequest` | Yes | body |  |

**Returns:** `NotesInteractionsMarkSeenResponse`

---

## `client.notes.mutations` (1 method)

### `sync`

**POST** `/api/v1/notes/notebooks/{notebookId}/mutations`

Sync client mutations

```typescript
client.notes.mutations.sync(notebookId: string, data: NotesMutationsSyncRequest): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `data` | `NotesMutationsSyncRequest` | Yes | body |  |

**Returns:** `ApiResponse<unknown>`

---

## `client.notes.nodes` (7 methods)

### `create`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes`

Create a node

```typescript
client.notes.nodes.create(notebookId: string, data: NotesNodesCreateRequest): Promise<NotesNodesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `data` | `NotesNodesCreateRequest` | Yes | body |  |

**Returns:** `NotesNodesCreateResponse`

**CLI:** `hoody notes node create`

---

### `delete`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`

Delete a node

```typescript
client.notes.nodes.delete(notebookId: string, nodeId: string): Promise<NotesNodesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |

**Returns:** `NotesNodesDeleteResponse`

**CLI:** `hoody notes node delete`

---

### `get`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`

Get a node

```typescript
client.notes.nodes.get(notebookId: string, nodeId: string): Promise<NotesNodesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |

**Returns:** `NotesNodesGetResponse`

**CLI:** `hoody notes node get`

---

### `getByAlias`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}`

Resolve page by alias

```typescript
client.notes.nodes.getByAlias(notebookId: string, alias: string): Promise<NotesNodesGetByAliasResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `alias` | `string` | Yes | path |  |

**Returns:** `NotesNodesGetByAliasResponse`

**CLI:** `hoody notes node get-by-alias`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes`

List nodes

```typescript
client.notes.nodes.list(notebookId: string, options?: { type?: string; parentId?: string; rootId?: string; limit?: number; offset?: number }): Promise<NotesNodesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `type` | `string` | No | query |  |
| `parentId` | `string` | No | query |  |
| `rootId` | `string` | No | query |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `NotesNodesListResponse`

**CLI:** `hoody notes node list`

---

### `listChildren`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`

List child nodes

```typescript
client.notes.nodes.listChildren(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number }): Promise<NotesNodesListChildrenResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `NotesNodesListChildrenResponse`

**CLI:** `hoody notes node children`

---

### `update`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`

Update a node

```typescript
client.notes.nodes.update(notebookId: string, nodeId: string, data: NotesNodesUpdateRequest): Promise<NotesNodesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesNodesUpdateRequest` | Yes | body |  |

**Returns:** `NotesNodesUpdateResponse`

**CLI:** `hoody notes node update`

---

## `client.notes.notebooks` (5 methods)

### `create`

**POST** `/api/v1/notes/notebooks`

Create a notebook

```typescript
client.notes.notebooks.create(data: NotesNotebooksCreateRequest): Promise<NotesNotebooksCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `NotesNotebooksCreateRequest` | Yes | body |  |

**Returns:** `NotesNotebooksCreateResponse`

**CLI:** `hoody notes notebook create`

---

### `delete`

**DELETE** `/api/v1/notes/notebooks/{notebookId}`

Delete a notebook

```typescript
client.notes.notebooks.delete(notebookId: string): Promise<NotesNotebooksDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |

**Returns:** `NotesNotebooksDeleteResponse`

**CLI:** `hoody notes notebook delete`

---

### `get`

**GET** `/api/v1/notes/notebooks/{notebookId}`

Get notebook details

```typescript
client.notes.notebooks.get(notebookId: string): Promise<NotesNotebooksGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |

**Returns:** `NotesNotebooksGetResponse`

**CLI:** `hoody notes notebook get`

---

### `listNotebooks`

**GET** `/api/v1/notes/notebooks`

List notebooks

```typescript
client.notes.notebooks.listNotebooks(): Promise<NotesListNotebooksResponse>
```

**Returns:** `NotesListNotebooksResponse`

**CLI:** `hoody notes notebook list`

---

### `update`

**PATCH** `/api/v1/notes/notebooks/{notebookId}`

Update notebook settings

```typescript
client.notes.notebooks.update(notebookId: string, data: NotesNotebooksUpdateRequest): Promise<NotesNotebooksUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `data` | `NotesNotebooksUpdateRequest` | Yes | body |  |

**Returns:** `NotesNotebooksUpdateResponse`

**CLI:** `hoody notes notebook update`

---

## `client.notes.reactions` (3 methods)

### `add`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions`

Add a reaction

```typescript
client.notes.reactions.add(notebookId: string, nodeId: string, data: NotesReactionsAddRequest): Promise<NotesReactionsAddResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesReactionsAddRequest` | Yes | body |  |

**Returns:** `NotesReactionsAddResponse`

**CLI:** `hoody notes reaction add`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions`

List reactions

```typescript
client.notes.reactions.list(notebookId: string, nodeId: string): Promise<NotesReactionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |

**Returns:** `NotesReactionsListResponse`

**CLI:** `hoody notes reaction list`

---

### `remove`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions/{reaction}`

Remove a reaction

```typescript
client.notes.reactions.remove(notebookId: string, nodeId: string, reaction: string): Promise<NotesReactionsRemoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `reaction` | `string` | Yes | path |  |

**Returns:** `NotesReactionsRemoveResponse`

**CLI:** `hoody notes reaction remove`

---

## `client.notes.sockets` (2 methods)

### `init`

**POST** `/api/v1/notes/sockets`

Initialize a WebSocket session

```typescript
client.notes.sockets.init(): Promise<NotesSocketsInitResponse>
```

**Returns:** `NotesSocketsInitResponse`

---

### `open`

**GET** `/api/v1/notes/sockets/{socketId}`

Open a WebSocket connection

```typescript
client.notes.sockets.open(socketId: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `socketId` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

---

## `client.notes.users` (2 methods)

### `invite`

**POST** `/api/v1/notes/notebooks/{notebookId}/users`

Invite users to notebook

```typescript
client.notes.users.invite(notebookId: string, data: NotesUsersInviteRequest): Promise<NotesUsersInviteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `data` | `NotesUsersInviteRequest` | Yes | body |  |

**Returns:** `NotesUsersInviteResponse`

---

### `updateRole`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/users/{userId}/role`

Update user role

```typescript
client.notes.users.updateRole(notebookId: string, userId: string, data: NotesUsersUpdateRoleRequest): Promise<NotesUsersUpdateRoleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `userId` | `string` | Yes | path |  |
| `data` | `NotesUsersUpdateRoleRequest` | Yes | body |  |

**Returns:** `NotesUsersUpdateRoleResponse`

**CLI:** `hoody notes user set-role`

---

## `client.notes.versions` (5 methods)

### `create`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`

Create a document version snapshot

```typescript
client.notes.versions.create(notebookId: string, nodeId: string): Promise<NotesVersionsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |

**Returns:** `NotesVersionsCreateResponse`

**CLI:** `hoody notes version create`

---

### `delete`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}`

Delete a document version

```typescript
client.notes.versions.delete(notebookId: string, nodeId: string, versionId: string): Promise<NotesVersionsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `versionId` | `string` | Yes | path |  |

**Returns:** `NotesVersionsDeleteResponse`

**CLI:** `hoody notes version delete`

---

### `get`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}`

Get a specific document version

```typescript
client.notes.versions.get(notebookId: string, nodeId: string, versionId: string): Promise<NotesVersionsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `versionId` | `string` | Yes | path |  |

**Returns:** `NotesVersionsGetResponse`

**CLI:** `hoody notes version get`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`

List document versions

```typescript
client.notes.versions.list(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number }): Promise<NotesVersionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `NotesVersionsListResponse`

**CLI:** `hoody notes version list`

---

### `restore`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore`

Restore a document version

```typescript
client.notes.versions.restore(notebookId: string, nodeId: string, versionId: string): Promise<NotesVersionsRestoreResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `versionId` | `string` | Yes | path |  |

**Returns:** `NotesVersionsRestoreResponse`

**CLI:** `hoody notes version restore`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
