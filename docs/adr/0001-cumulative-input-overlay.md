---
status: accepted
---

# Cumulative input overlay without log rewriting

Accepted self-edits persist in a working-context overlay across inference calls, with new conversation activity appended. This is our interpretation of next-input editing, not permission to alter original session messages or tool records. One-shot filtering would immediately reintroduce deleted material and frustrate long-horizon experiments.

Use Pi's conversation-only `context` hook so system prompts and tool declarations remain Pi-owned. Latest user instructions are editable: accidental or injection-induced loss of user intent is an explicitly accepted risk, and retaining the original log does not prevent it. This scope boundary and the non-destructive overlay are project design decisions, not requirements attributed to the paper.
