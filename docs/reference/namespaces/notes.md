# `notes` — 74 methods

**Version:** 1.0.0-beta.15
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

**CLI:** `hoody notes avatars download`

---

### `upload`

**POST** `/api/v1/notes/avatars`

Upload an avatar image

```typescript
client.notes.avatars.upload(data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string): Promise<NotesAvatarsUploadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt; \| string` | Yes | body |  |

**Returns:** `NotesAvatarsUploadResponse`

**CLI:** `hoody notes avatars upload`

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

**CLI:** `hoody notes collaborators add`

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

**CLI:** `hoody notes collaborators list`

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

**CLI:** `hoody notes collaborators remove`

---

### `setRole`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}`

Update collaborator role

```typescript
client.notes.collaborators.setRole(notebookId: string, nodeId: string, collaboratorId: string, data: NotesCollaboratorsSetRoleRequest): Promise<NotesCollaboratorsSetRoleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `collaboratorId` | `string` | Yes | path |  |
| `data` | `NotesCollaboratorsSetRoleRequest` | Yes | body |  |

**Returns:** `NotesCollaboratorsSetRoleResponse`

**CLI:** `hoody notes collaborators role set`

---

## `client.notes.comments` (11 methods)

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

**CLI:** `hoody notes comments create`

---

### `delete`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`

Delete a comment

```typescript
client.notes.comments.delete(notebookId: string, nodeId: string, commentId: string, options?: { expectedVersion?: number; cache?: boolean | number }): Promise<NotesCommentsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `commentId` | `string` | Yes | path |  |
| `expectedVersion` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `NotesCommentsDeleteResponse`

**CLI:** `hoody notes comments delete`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`

List comments

```typescript
client.notes.comments.list(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string; cache?: boolean | number }): Promise<NotesCommentsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `NotesCommentsListResponse`

**CLI:** `hoody notes comments list`

---

### `listAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`

List comments (collect all pages)

```typescript
client.notes.comments.listAll(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listAnchors`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`

List comment anchors

```typescript
client.notes.comments.listAnchors(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string; cache?: boolean | number }): Promise<NotesCommentsListAnchorsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `NotesCommentsListAnchorsResponse`

**CLI:** `hoody notes comments anchors list`

---

### `listAnchorsAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`

List comment anchors (collect all pages)

```typescript
client.notes.comments.listAnchorsAll(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listAnchorsIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`

List comment anchors (async iterator)

```typescript
client.notes.comments.listAnchorsIterator(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`

List comments (async iterator)

```typescript
client.notes.comments.listIterator(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

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

**CLI:** `hoody notes comments resolve`

---

### `setAnchor`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor`

Re-anchor a comment thread

```typescript
client.notes.comments.setAnchor(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsSetAnchorRequest): Promise<NotesCommentsSetAnchorResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `commentId` | `string` | Yes | path |  |
| `data` | `NotesCommentsSetAnchorRequest` | Yes | body |  |

**Returns:** `NotesCommentsSetAnchorResponse`

**CLI:** `hoody notes comments anchor set`

---

### `update`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`

Edit a comment

```typescript
client.notes.comments.update(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsUpdateRequest): Promise<NotesCommentsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `commentId` | `string` | Yes | path |  |
| `data` | `NotesCommentsUpdateRequest` | Yes | body |  |

**Returns:** `NotesCommentsUpdateResponse`

**CLI:** `hoody notes comments update`

---

## `client.notes.document` (6 methods)

### `append`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`

Append blocks to a document

```typescript
client.notes.document.append(notebookId: string, nodeId: string, data: NotesDocumentAppendRequest, options?: { XIdempotencyKey?: string; cache?: boolean | number }): Promise<NotesDocumentAppendResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesDocumentAppendRequest` | Yes | body |  |
| `XIdempotencyKey` | `string` | No | header | Optional idempotency key (max 256 chars). Reusing the same key with an identical request body and node replays the original response; reusing it with a different body or node returns 409. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `NotesDocumentAppendResponse`

**CLI:** `hoody notes document append`

---

### `createExportTicket`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket`

Create secure HTML export ticket

```typescript
client.notes.document.createExportTicket(notebookId: string, nodeId: string, data: NotesDocumentCreateExportTicketRequest): Promise<NotesDocumentCreateExportTicketResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesDocumentCreateExportTicketRequest` | Yes | body |  |

**Returns:** `NotesDocumentCreateExportTicketResponse`

**CLI:** `hoody notes document tickets create`

---

### `exportBlock`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg`

Export drawing block as SVG

```typescript
client.notes.document.exportBlock(notebookId: string, nodeId: string, blockId: string, options?: { bg?: string; scale?: number; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `blockId` | `string` | Yes | path |  |
| `bg` | `string` | No | query |  |
| `scale` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody notes document blocks export`

---

### `get`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`

Get document content

```typescript
client.notes.document.get(notebookId: string, nodeId: string, options?: { blockIds?: string; lines?: string; output?: "json" | "md" | "html"; includeComments?: "none" | "appendix"; ticket?: string; cache?: boolean | number }): Promise<NotesDocumentGetResponse>
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
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `NotesDocumentGetResponse`

**CLI:** `hoody notes document get`

---

### `set`

**PUT** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`

Create or replace document

```typescript
client.notes.document.set(notebookId: string, nodeId: string, data: NotesDocumentSetRequest): Promise<NotesDocumentSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesDocumentSetRequest` | Yes | body |  |

**Returns:** `NotesDocumentSetResponse`

**CLI:** `hoody notes document set`

---

### `update`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`

Merge document content

```typescript
client.notes.document.update(notebookId: string, nodeId: string, data: NotesDocumentUpdateRequest): Promise<NotesDocumentUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesDocumentUpdateRequest` | Yes | body |  |

**Returns:** `NotesDocumentUpdateResponse`

**CLI:** `hoody notes document update`

---

## `client.notes.files` (4 methods)

### `download`

**GET** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}`

Download a file

```typescript
client.notes.files.download(notebookId: string, fileId: string): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody notes files download`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/files`

List all uploaded files

```typescript
client.notes.files.list(notebookId: string, options?: { limit?: number; offset?: number; cache?: boolean | number }): Promise<NotesFilesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `NotesFilesListResponse`

**CLI:** `hoody notes files list`

---

### `listAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/files`

List all uploaded files (collect all pages)

```typescript
client.notes.files.listAll(notebookId: string, options?: { limit?: number; offset?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/files`

List all uploaded files (async iterator)

```typescript
client.notes.files.listIterator(notebookId: string, options?: { limit?: number; offset?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.notes.files.uploads` (4 methods)

### `cancel`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

Abort a TUS upload

```typescript
client.notes.files.uploads.cancel(notebookId: string, fileId: string, options: { TusResumable: "1.0.0"; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |
| `TusResumable` | `"1.0.0"` | Yes | header | TUS protocol version. Every TUS request must send `1.0.0`; anything else is refused with 412. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

---

### `create`

**POST** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

Create a resumable (TUS) upload

```typescript
client.notes.files.uploads.create(notebookId: string, fileId: string, options: { TusResumable: "1.0.0"; UploadLength: number; UploadMetadata?: string; cache?: boolean | number }): Promise<NotesFilesUploadsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |
| `TusResumable` | `"1.0.0"` | Yes | header | TUS protocol version. Every TUS request must send `1.0.0`; anything else is refused with 412. |
| `UploadLength` | `number` | Yes | header | Total size of the file in bytes. Must equal the file node's `size` (set when the node was created), which must not exceed the notebook's maximum file size. Upload-Defer-Length is not supported. |
| `UploadMetadata` | `string` | No | header | Optional TUS metadata: comma-separated `key base64(value)` pairs. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `NotesFilesUploadsCreateResponse`

---

### `getOffset`

**HEAD** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

Check a TUS upload's offset (for resuming)

```typescript
client.notes.files.uploads.getOffset(options: { notebookId: string; fileId: string; TusResumable: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |
| `TusResumable` | `string` | Yes | header | TUS protocol version. Every TUS request must send `1.0.0`; anything else is refused with 412. |

**Returns:** `any`

---

### `writeChunk`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

Upload a chunk to a TUS upload

```typescript
client.notes.files.uploads.writeChunk(notebookId: string, fileId: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options: { TusResumable: "1.0.0"; UploadOffset: number; cache?: boolean | number; contentType?: 'application/offset+octet-stream' }): Promise<NotesFilesUploadsWriteChunkResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt; \| string` | Yes | body |  |
| `TusResumable` | `"1.0.0"` | Yes | header | TUS protocol version. Every TUS request must send `1.0.0`; anything else is refused with 412. |
| `UploadOffset` | `number` | Yes | header | Offset this chunk starts at — the value the HEAD check (or the previous chunk) returned. |
| `cache` | `boolean \| number` | No | query |  |
| `contentType` | `'application/offset+octet-stream'` | No | query |  |

**Returns:** `NotesFilesUploadsWriteChunkResponse`

---

## `client.notes.kit` (1 method)

### `getHealth`

**GET** `/api/v1/notes/health`

Service health and runtime info

```typescript
client.notes.kit.getHealth(): Promise<NotesKitGetHealthResponse>
```

**Returns:** `NotesKitGetHealthResponse`

**CLI:** `hoody notes health`

---

## `client.notes.members` (2 methods)

### `invite`

**POST** `/api/v1/notes/notebooks/{notebookId}/users`

Invite users to notebook

```typescript
client.notes.members.invite(notebookId: string, data: NotesMembersInviteRequest): Promise<NotesMembersInviteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `data` | `NotesMembersInviteRequest` | Yes | body |  |

**Returns:** `NotesMembersInviteResponse`

**CLI:** `hoody notes members invite`

---

### `setRole`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/users/{userId}/role`

Update user role

```typescript
client.notes.members.setRole(notebookId: string, userId: string, data: NotesMembersSetRoleRequest): Promise<NotesMembersSetRoleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `userId` | `string` | Yes | path |  |
| `data` | `NotesMembersSetRoleRequest` | Yes | body |  |

**Returns:** `NotesMembersSetRoleResponse`

**CLI:** `hoody notes members role set`

---

## `client.notes.mutations` (1 method)

### `sync`

**POST** `/api/v1/notes/notebooks/{notebookId}/mutations`

Sync client mutations

```typescript
client.notes.mutations.sync(notebookId: string, data: NotesMutationsSyncRequest): Promise<NotesMutationsSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `data` | `NotesMutationsSyncRequest` | Yes | body |  |

**Returns:** `NotesMutationsSyncResponse`

---

## `client.notes.nodes` (13 methods)

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

**CLI:** `hoody notes nodes create`

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

**CLI:** `hoody notes nodes delete`

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

**CLI:** `hoody notes nodes get`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes`

List nodes

```typescript
client.notes.nodes.list(notebookId: string, options?: { type?: string; parentId?: string; rootId?: string; limit?: number; offset?: number; cache?: boolean | number }): Promise<NotesNodesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `type` | `string` | No | query |  |
| `parentId` | `string` | No | query |  |
| `rootId` | `string` | No | query |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `NotesNodesListResponse`

**CLI:** `hoody notes nodes list`

---

### `listAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes`

List nodes (collect all pages)

```typescript
client.notes.nodes.listAll(notebookId: string, options?: { type?: string; parentId?: string; rootId?: string; limit?: number; offset?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `type` | `string` | No | query |  |
| `parentId` | `string` | No | query |  |
| `rootId` | `string` | No | query |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listChildren`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`

List child nodes

```typescript
client.notes.nodes.listChildren(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cache?: boolean | number }): Promise<NotesNodesListChildrenResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `NotesNodesListChildrenResponse`

**CLI:** `hoody notes nodes children list`

---

### `listChildrenAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`

List child nodes (collect all pages)

```typescript
client.notes.nodes.listChildrenAll(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listChildrenIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`

List child nodes (async iterator)

```typescript
client.notes.nodes.listChildrenIterator(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes`

List nodes (async iterator)

```typescript
client.notes.nodes.listIterator(notebookId: string, options?: { type?: string; parentId?: string; rootId?: string; limit?: number; offset?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `type` | `string` | No | query |  |
| `parentId` | `string` | No | query |  |
| `rootId` | `string` | No | query |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `markOpened`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened`

Mark node as opened

```typescript
client.notes.nodes.markOpened(notebookId: string, nodeId: string, data: NotesNodesMarkOpenedRequest): Promise<NotesNodesMarkOpenedResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesNodesMarkOpenedRequest` | Yes | body |  |

**Returns:** `NotesNodesMarkOpenedResponse`

**CLI:** `hoody notes nodes mark opened`

---

### `markSeen`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen`

Mark node as seen

```typescript
client.notes.nodes.markSeen(notebookId: string, nodeId: string, data: NotesNodesMarkSeenRequest): Promise<NotesNodesMarkSeenResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesNodesMarkSeenRequest` | Yes | body |  |

**Returns:** `NotesNodesMarkSeenResponse`

**CLI:** `hoody notes nodes mark seen`

---

### `resolve`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}`

Resolve page by alias

```typescript
client.notes.nodes.resolve(notebookId: string, alias: string): Promise<NotesNodesResolveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `alias` | `string` | Yes | path |  |

**Returns:** `NotesNodesResolveResponse`

**CLI:** `hoody notes nodes resolve`

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

**CLI:** `hoody notes nodes update`

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

**CLI:** `hoody notes notebooks create`

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

**CLI:** `hoody notes notebooks delete`

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

**CLI:** `hoody notes notebooks get`

---

### `list`

**GET** `/api/v1/notes/notebooks`

List notebooks

```typescript
client.notes.notebooks.list(): Promise<NotesNotebooksListResponse>
```

**Returns:** `NotesNotebooksListResponse`

**CLI:** `hoody notes notebooks list`

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

**CLI:** `hoody notes notebooks update`

---

## `client.notes` (1 method)

### `whoami`

**GET** `/api/v1/notes/me`

Get current identity

```typescript
client.notes.whoami(): Promise<NotesWhoamiResponse>
```

**Returns:** `NotesWhoamiResponse`

**CLI:** `hoody notes whoami`

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

**CLI:** `hoody notes reactions add`

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

**CLI:** `hoody notes reactions list`

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

**CLI:** `hoody notes reactions remove`

---

## `client.notes.records` (8 methods)

### `create`

**POST** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`

Create a database record

```typescript
client.notes.records.create(notebookId: string, databaseId: string, data: NotesRecordsCreateRequest): Promise<NotesRecordsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `data` | `NotesRecordsCreateRequest` | Yes | body |  |

**Returns:** `NotesRecordsCreateResponse`

**CLI:** `hoody notes records create`

---

### `delete`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`

Delete a database record

```typescript
client.notes.records.delete(notebookId: string, databaseId: string, recordId: string): Promise<NotesRecordsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `recordId` | `string` | Yes | path |  |

**Returns:** `NotesRecordsDeleteResponse`

**CLI:** `hoody notes records delete`

---

### `get`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`

Get a database record

```typescript
client.notes.records.get(notebookId: string, databaseId: string, recordId: string): Promise<NotesRecordsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `recordId` | `string` | Yes | path |  |

**Returns:** `NotesRecordsGetResponse`

**CLI:** `hoody notes records get`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`

List database records

```typescript
client.notes.records.list(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number; cache?: boolean | number }): Promise<NotesRecordsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `filters` | `string` | No | query |  |
| `sorts` | `string` | No | query |  |
| `page` | `number` | No | query |  |
| `count` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `NotesRecordsListResponse`

**CLI:** `hoody notes records list`

---

### `listAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`

List database records (collect all pages)

```typescript
client.notes.records.listAll(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `filters` | `string` | No | query |  |
| `sorts` | `string` | No | query |  |
| `page` | `number` | No | query |  |
| `count` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`

List database records (async iterator)

```typescript
client.notes.records.listIterator(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `filters` | `string` | No | query |  |
| `sorts` | `string` | No | query |  |
| `page` | `number` | No | query |  |
| `count` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `search`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search`

Search database records

```typescript
client.notes.records.search(notebookId: string, databaseId: string, options?: { q?: string; exclude?: string; cache?: boolean | number }): Promise<NotesRecordsSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `q` | `string` | No | query |  |
| `exclude` | `string` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `NotesRecordsSearchResponse`

**CLI:** `hoody notes records search`

---

### `update`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`

Update a database record

```typescript
client.notes.records.update(notebookId: string, databaseId: string, recordId: string, data: NotesRecordsUpdateRequest): Promise<NotesRecordsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `recordId` | `string` | Yes | path |  |
| `data` | `NotesRecordsUpdateRequest` | Yes | body |  |

**Returns:** `NotesRecordsUpdateResponse`

**CLI:** `hoody notes records update`

---

## `client.notes.sockets` (2 methods)

### `connect`

**GET** `/api/v1/notes/sockets/{socketId}`

Open a WebSocket connection

```typescript
client.notes.sockets.connect(socketId: string): Promise<NotesOpenSocketWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `socketId` | `string` | Yes | path |  |

**Returns:** `NotesOpenSocketWebSocket`

---

### `create`

**POST** `/api/v1/notes/sockets`

Initialize a WebSocket session

```typescript
client.notes.sockets.create(): Promise<NotesSocketsCreateResponse>
```

**Returns:** `NotesSocketsCreateResponse`

---

## `client.notes.versions` (7 methods)

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

**CLI:** `hoody notes versions create`

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

**CLI:** `hoody notes versions delete`

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

**CLI:** `hoody notes versions get`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`

List document versions

```typescript
client.notes.versions.list(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cache?: boolean | number }): Promise<NotesVersionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `NotesVersionsListResponse`

**CLI:** `hoody notes versions list`

---

### `listAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`

List document versions (collect all pages)

```typescript
client.notes.versions.listAll(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`

List document versions (async iterator)

```typescript
client.notes.versions.listIterator(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

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

**CLI:** `hoody notes versions restore`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
