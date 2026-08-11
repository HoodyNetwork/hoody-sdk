# Index of `/SKILLS/`

Hoody agent-skill bundle. Sizes are approximate token counts — an agent choosing what to read should note that the FULL variants are an order of magnitude larger than the basic ones.

## Install

install the skill:

```
npx skills add https://hoody.com/SKILLS/SKILL.md
```

or, an offline copy of every file:

```
curl -O https://hoody.com/SKILLS/HOODY_SKILLS.zip
```

## Start here

- [`SKILL.md`](SKILL.md) — mode-blend skill (chooser + SDK/HTTP/CLI side-by-side) · ~11,480 tokens
- [`SKILL.lite.md`](SKILL.lite.md) — compact tier-0 skill (always-loaded by agents) · ~4,154 tokens
- [`ONBOARDING.md`](ONBOARDING.md) — guided onboarding skill (agent-directed) · ~6,383 tokens

## One surface, in depth

- [`SKILL-HTTP.md`](SKILL-HTTP.md) — HTTP skill (basic) · ~16,228 tokens
- [`SKILL-HTTP-FULL.md`](SKILL-HTTP-FULL.md) — HTTP skill (FULL — basic + all 20 namespaces) · ~216,227 tokens
- [`SKILL-SDK.md`](SKILL-SDK.md) — SDK skill (basic) · ~17,317 tokens
- [`SKILL-SDK-FULL.md`](SKILL-SDK-FULL.md) — SDK skill (FULL — basic + all 20 namespaces) · ~348,278 tokens
- [`SKILL-CLI.md`](SKILL-CLI.md) — CLI skill (basic) · ~17,095 tokens
- [`SKILL-CLI-FULL.md`](SKILL-CLI-FULL.md) — CLI skill (FULL — basic + all 20 namespaces) · ~158,244 tokens

## Per-namespace reference

- [`SKILL-HTTP/`](SKILL-HTTP/) — HTTP skill, one file per namespace · 20 files
- [`SKILL-SDK/`](SKILL-SDK/) — SDK skill, one file per namespace · 20 files
- [`SKILL-CLI/`](SKILL-CLI/) — CLI skill, one file per namespace · 20 files

## Routing manifest

- [`INDEX.md`](INDEX.md) — routing manifest (full INDEX with routing-hints appendix; ~7k tokens, on-demand) · ~7,926 tokens

## Whole bundle

- [`HOODY_SKILLS.zip`](HOODY_SKILLS.zip) — every file above, one download — for offline use or grepping the corpus
