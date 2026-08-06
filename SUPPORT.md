# Getting help

Three channels, split by who can actually answer.

## Your account, your bill, or one specific container

[hoody.com/support](https://hoody.com/support). Nobody reading the issue tracker can see your account, so a container that will not start, a charge you did not expect, or a server stuck in provisioning has to go through a channel that can look it up.

## How something works

Start with [docs.hoody.com](https://docs.hoody.com). Every service has a page covering the CLI, the SDK, and the HTTP API for the same operation.

`hoody chat "how do I forward a port from a container"` asks the documentation assistant from your terminal and answers with links to the pages it used. It needs no API key and no AI provider. Add `--private` and it reads and writes nothing on disk.

For an exact signature rather than an explanation, [`docs/reference/`](./docs/reference/) lists every SDK method, CLI command, and endpoint, generated from the same specification the client is built from.

If you are pointing an AI agent at Hoody, give it `https://hoody.com/SKILLS/SKILL.md` or run `npx skills add https://hoody.com/SKILLS/SKILL.md`. The same corpus ships inside the package under `SKILLS/`, so an agent working offline can read it from `node_modules`.

## Something is broken

[Open an issue](https://github.com/HoodyNetwork/hoody-sdk/issues/new/choose). The tracker covers the whole platform a user touches, not only the SDK: the CLI, the HTTP API, the Kit services, Hoody OS, and the documentation.

Redact before you paste. A container URL is a credential, since the IDs in the hostname are what authorize the request. Tokens turn up in `-o json` output and in `~/.hoody/config.json`.

For a vulnerability, use [SECURITY.md](./SECURITY.md) instead. Not the tracker.
