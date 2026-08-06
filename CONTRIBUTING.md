# Contributing

Read this before opening a pull request. This repository does not accept code changes, and the reason is structural rather than a policy preference.

## This repository is a published mirror

`hoody-sdk` is generated. The client in `generated/` is built from the OpenAPI documents of every Hoody service, `docs/` and `SKILLS/` are emitted by generators, and `dist/`, `dist-ts/` and `cli/dist/` are build output. Each release replaces the entire tree here with a freshly built, audited one and force-updates `main`.

A merged pull request would therefore survive until the next release and then disappear. That is true of every path in the repository, including hand-written files, because the release publishes one sealed tree rather than a diff. Pull requests are closed with a pointer to this page, not because the change was unwelcome.

Issues are read and acted on. That is the channel that works.

## What to open instead

**A bug.** Anything where the documented behavior and the real behavior disagree. Use the bug form: it asks which surface you were on, because the same fault reads differently from the CLI, the SDK, and a raw HTTP call, and the fix usually lands in a different place for each.

**A documentation problem.** Examples in the documentation are meant to run as written. One that does not is worth its own issue.

**A feature request.** Describe the task you cannot finish. A proposed method signature is welcome but optional, and it is the task that survives a redesign.

**A security vulnerability.** Not here. See [SECURITY.md](./SECURITY.md).

## Before you open one

Check the version. `hoody --version` for the CLI, or `hoody-sdk` in your `package.json`. Fixes ship often, and the current version is on [npm](https://www.npmjs.com/package/hoody-sdk).

Check the reference for the call you are making. Every SDK method, CLI command, and endpoint is listed under [`docs/reference/`](./docs/reference/), generated from the same specification the client is built from, so it cannot drift from the implementation.

Ask the documentation assistant. `hoody chat "how do I mount an S3 bucket"` answers from the documentation and links the pages it used. It needs no API key.

## Redacting an issue

Two of the three things worth redacting are not obvious.

A container URL is a credential. The project and container IDs in the hostname are what authorize the request, so anyone holding the URL can reach that service. Replace both with placeholders.

Tokens appear in more places than the obvious one. `-o json` output can carry them, as can a `--print-token` login and anything read out of `~/.hoody/config.json`.

Everything under `/api/v1/agent/` can carry your prompts and file contents in request and response bodies. Read what you paste.

## Working from a clone

You can run the CLI and the SDK straight from a checkout without publishing anything. [AGENTS.md](./AGENTS.md) covers driving the SDK from a clone, including with an agent, and [README.md](./README.md) covers installation and the two client scopes.
