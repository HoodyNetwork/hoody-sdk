# Security policy

## Reporting a vulnerability

Report it privately through [GitHub's advisory form](https://github.com/HoodyNetwork/hoody-sdk/security/advisories/new), which opens a channel visible only to you and the maintainers. If you cannot use GitHub, write to security@hoody.com.

Do not open a public issue for a vulnerability, and do not post it in a discussion or a pull request.

You will get a first response within three working days, an assessment with a severity and a rough timeline within ten, and an update at least every ten days until it closes. If you would like credit in the advisory, say so and give us the name to use.

## What is in scope

The published `hoody-sdk` package, the `hoody` CLI including its released binaries, and the client-side handling of credentials, tokens, and container URLs.

The Hoody platform behind the API is also in scope through the same channel, so report it here rather than hunting for another address. That includes the HTTP API, the Kit services, and Hoody OS.

Findings worth reporting even when they look small: a token or key reaching disk, a log, or a process argument list where it should not; a container URL or credential appearing in output that is meant to be shareable; a call reaching data belonging to another account; TLS or certificate verification that can be turned off without the caller asking; and a released binary whose signature or checksum does not verify.

## What is not in scope

Anything requiring an already-compromised machine, since the CLI stores credentials for the user who runs it and cannot defend against that user's own account being taken over.

A container being reachable by anyone holding its URL. That is the documented design: the two 24-character IDs in the hostname are the credential, which is what makes sharing a URL work. Set proxy permissions before sharing anything sensitive. A URL leaking somewhere it should not is in scope; the model itself is not.

Reports produced by a scanner with no demonstrated impact, missing hardening headers on documentation pages, and denial of service by volume.

## Verifying a release

Release binaries ship with `SHA256SUMS` and a minisign signature. Verify the signature first, then the hash. `install.sh` does both, and a release that fails either check should be reported through the channel above.
