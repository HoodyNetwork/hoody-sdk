# Quick Reference: Writing Hoody SDK API Calls

## Fast Checklist

```bash
# 1. Find the operation in the merged spec
rg -n '"operationId": ".*createProjectContainer"|"/api/v1/projects/.*/containers"' generated/openapi.public.json

# 2. Check the generated method signature
rg -n "async create" generated/api/*.service.generated.ts

# 3. Check named request/response types
rg -n "ApiContainersCreate(Request|Response)" generated/types.ts
```

## Default Pattern

Generated service methods are already typed. Prefer using the inferred return
type directly.

```typescript
const response = await client.api.containers.create(projectId, {
  server_id: serverId,
  name: containerName,
  container_image: imageName,
});

const containerId = response.data?.id;
```

Request types aren't exported individually, so when you need to annotate a
reusable value, derive the type from the method rather than importing an
internal path:

```typescript
import type { HoodyClient } from '@hoody-ai/hoody-sdk';

// create(id, data, …) — the request body is the second argument
type ApiContainersCreateRequest =
  Parameters<HoodyClient['api']['containers']['create']>[1];

const request: ApiContainersCreateRequest = {
  server_id: serverId,
  container_image: 'debian/13',
};
```

## Realm Notes

- `_realm` is the host-scope override used by generated service methods.
- `realm_id` is only a normal query parameter on operations that explicitly
  define it in OpenAPI.

## Signing Notes

- `X-Hoody-Signature` is a response header, not part of `response.data`.
- Verification metadata comes from `GET /api/v1/meta/public-key`.
- Empty responses, streams, and disabled-signing environments may omit the header.
- Hoody Kit routes do not automatically follow Hoody API signing rules.

## Red Flags

Stop and re-check the spec if you see:

- `as any`
- guessed field names like `{ image: 'debian' }` when the spec says `container_image`
- guessed optional parameters that do not exist in OpenAPI
- stale examples copied from older generated output

## Good Defaults

- start with `generated/openapi.public.json`
- confirm the generated service signature
- rely on the generated return type when possible
- use optional chaining on nested response fields
- add comments with operation path or `operationId` when the call is non-obvious
