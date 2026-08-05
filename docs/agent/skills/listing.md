# Index of `/SKILLS/`

Hoody agent-skill bundle. Sizes are approximate token counts — an agent choosing what to read should note that the FULL variants are an order of magnitude larger than the basic ones.

## Install

install the skill:

```
npx skills add https://hoody.com/SKILLS/SKILL.md
```

or, an offline copy of every file:

```
curl -O https://hoody.com/SKILLS/ALL_SKILLS.zip
```

## Start here

- [`SKILL.md`](SKILL.md) — mode-blend skill (chooser + SDK/HTTP/CLI side-by-side) · ~11,438 tokens
- [`SKILL.lite.md`](SKILL.lite.md) — compact tier-0 skill (always-loaded by agents) · ~4,083 tokens
- [`ONBOARDING.md`](ONBOARDING.md) — guided onboarding skill (agent-directed) · ~6,385 tokens

## One surface, in depth

- [`SKILL-HTTP.md`](SKILL-HTTP.md) — HTTP skill (basic) · ~15,790 tokens
- [`SKILL-HTTP-FULL.md`](SKILL-HTTP-FULL.md) — HTTP skill (FULL — basic + all 19 namespaces) · ~210,085 tokens
- [`SKILL-SDK.md`](SKILL-SDK.md) — SDK skill (basic) · ~17,182 tokens
- [`SKILL-SDK-FULL.md`](SKILL-SDK-FULL.md) — SDK skill (FULL — basic + all 19 namespaces) · ~335,993 tokens
- [`SKILL-CLI.md`](SKILL-CLI.md) — CLI skill (basic) · ~16,919 tokens
- [`SKILL-CLI-FULL.md`](SKILL-CLI-FULL.md) — CLI skill (FULL — basic + all 19 namespaces) · ~153,080 tokens

## Per-namespace reference

- [`SKILL-HTTP/`](SKILL-HTTP/) — HTTP skill, one file per namespace · 19 files
- [`SKILL-SDK/`](SKILL-SDK/) — SDK skill, one file per namespace · 19 files
- [`SKILL-CLI/`](SKILL-CLI/) — CLI skill, one file per namespace · 19 files

## Routing manifest

- [`INDEX.md`](INDEX.md) — routing manifest (full INDEX with routing-hints appendix; ~7k tokens, on-demand) · ~7,629 tokens

## Whole bundle

- [`ALL_SKILLS.zip`](ALL_SKILLS.zip) — every file above, one download — for offline use or grepping the corpus
