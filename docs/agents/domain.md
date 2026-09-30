# Domain Docs

## Layout: single-context

- `CONTEXT.md` at the repository root contains the domain glossary and model.
- `docs/adr/` contains architectural decision records.

## Before exploring, read these

Read root `CONTEXT.md` and ADRs in `docs/adr/` that touch the area you are about to work in.

If these files do not exist, proceed silently. Do not flag their absence or suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When naming a domain concept in an issue, refactor proposal, hypothesis, or test, use the term defined in `CONTEXT.md`. Avoid synonyms the glossary explicitly excludes.

If a needed concept is absent, reconsider whether it belongs to the domain or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, identify the ADR explicitly and explain why the decision should be reopened rather than silently overriding it.
