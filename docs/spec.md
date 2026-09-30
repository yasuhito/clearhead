## Problem Statement

A Pi user exploring Context Language Models cannot currently let the model edit its own next inference input while preserving original session history. Fixed compaction is not equivalent to model-authored deletion, shortening, reorganization, or working notes.

## Solution

Implement independent pi-context-tidy v1: explicit ON/OFF controls, a private editable JSON context document accessible to existing file/Bash tools, and a cumulative memory-only working-context overlay applied at the next Pi context boundary. Validate candidates atomically and fall back to normal input on invalid or stale edits.

## User Stories

1. As a Pi user, I want the extension OFF initially, so that loading it does not silently change context.
2. As a Pi user, I want explicit on/off/status commands, so that I control the experiment.
3. As a model, I want the context document path and protocol while ON, so that I can edit my input with ordinary tools.
4. As a model, I want to delete stale messages, so that irrelevant material stays absent across subsequent inference calls.
5. As a model, I want to shorten text in place, so that retained evidence can be concise.
6. As a model, I want to reorder complete source units, so that working context can be organized.
7. As a model, I want to insert notes, summaries, TODOs, and tables, so that I can maintain working memory.
8. As a researcher, I want edits that grow context accepted, so that exploration is not restricted to token reduction.
9. As a researcher, I want the latest user instruction editable, so that intent retention remains a model decision with explicit risk.
10. As a Pi user, I want system prompts and tool declarations Pi-owned, so that self-editing cannot fabricate authority.
11. As a Pi user, I want new conversation activity appended to accepted edits, so that ongoing tool results are not lost.
12. As a Pi user, I want original session messages and tool records unchanged, so that the original conversation remains auditable.
13. As a Pi user, I want unchanged images and opaque metadata preserved, so that context does not undergo a lossy text round trip.
14. As a model, I want tool-result text editable, so that verbose output can be shortened while calls remain structured.
15. As a Pi user, I want parallel calls and all results treated as one exchange, so that deletion/reordering preserves pairing.
16. As a Pi user, I want orphaned results, missing exchange members, role changes, and fabricated tool activity rejected, so that invalid inputs are not sent.
17. As a Pi user, I want malformed JSON, duplicate keys/IDs, wrong generations, unknown IDs, unexpected fields, and modified read-only data rejected, so that ambiguous candidates cannot partially apply.
18. As a Pi user, I want rejection to discard the candidate and overlay and restore normal input with a visible reason, so that failure is explicit.
19. As a Pi user, I want private temporary storage and cleanup, so that sensitive conversation data is not unnecessarily retained.
20. As a Pi user, I want symlink and non-regular mirror files rejected, so that the extension does not follow redirected paths.
21. As a Pi user, I want reload/resume, branch/session changes, and OFF to reset the overlay, so that ephemeral state does not leak across boundaries.
22. As a Pi user, I want native manual/automatic compaction retained and successful compaction to reset the overlay, so that standard Pi recovery still operates.
23. As a researcher, I want documented reappearance of original material and native summarization mixing, so that I do not mistake the experiment for pure self-editing benchmarking.
24. As a developer, I want real Pi runtime and deterministic provider tests, so that public API integration and next-input behavior are demonstrated without credentials.
25. As a Pi user, I want concise status/rejection diagnostics without conversation dumps, so that I can inspect state without exposing secrets.
26. As a Pi user, I want unchanged mirror retries to preserve cumulative edits, so that retries do not duplicate activity or erase working memory.

## Implementation Decisions

- Build a small extension adapter, context-document validation/overlay engine, and private mirror storage. No code copied from pi-clm.
- Use Pi 0.99.2 conversation-only context hooks and structured prompt guidelines. Do not rewrite session entries or persist overlay checkpoints.
- Commands wait for idle; ON is idempotent. OFF discards overlay and draft. Report state in TUI where supported and stderr otherwise.
- UTF-8 JSON contract: fixed format pi-context-tidy/v1, read-only generation, ordered units. Source units contain immutable IDs, roles, descriptors, and text slots. Only slot text may change. New note units contain kind, unique new-prefixed ID, and text; they receive source IDs on subsequent mirrors.
- A complete tool exchange contains its assistant calls and all results in original internal order. Preserve call identity, arguments, images, thinking/signature metadata; edit only text. Reject invalid structure rather than repairing or flattening it.
- Validate at the next context boundary before publishing the next generation. Require an unchanged normal-input prefix, append new activity, validate nonempty final input and exchange consistency, and activate only after successful mirror publication.
- Reject stale/non-append baselines and malformed/unreadable/unpublishable mirrors atomically; discard overlay and use normal input with a sanitized visible reason. Remain ON for further exploration.
- Private session-local temporary directory and file, atomic publication, reject symlinks/non-regular files, cleanup on OFF/shutdown/reset. No remote filesystem bridge or watchers.
- Native compaction summarizes Pi canonical context rather than the overlay; do not suppress it. Successful compaction resets; failure alone does not unless baseline changes.
- Latest user instructions may be edited; explicit loss-of-intent risk is accepted. Token reduction is optional. These are project decisions, not paper requirements.

## Testing Decisions

- Highest public seam: load the real extension in the real Pi SDK/runtime with a deterministic provider at the external model boundary, real local filesystem/tools, and session-manager public inspection. Observe provider-facing transcripts, status, context documents, and preserved session history rather than private implementation calls.
- Test controls, cumulative next-inference updates, new suffix activity, notes/growth, invalid/stale proposals, metadata, tool exchanges, lifecycle resets, native compaction, and private storage failures at this seam.
- Include a model-issued ordinary file/Bash edit followed by automatic inference, not only direct test-side file writes.
- No existing tests or code provide prior art in this empty repo; use installed Pi public SDK contracts and examples.
- Typecheck all source and tests. Keep tests deterministic and isolated, without accessing credentials or using network services.
- Provider compatibility claims must distinguish real Pi SDK compatibility from live vendor support, especially signed replay. Acceptance scenarios become verified only when actually executed.

## Out of Scope

Durable checkpoints, additional training, automatic editing model calls, dashboards, custom overflow management, payload rewriting, swarms, remote mirror bridges, third-party extension coordination, guaranteed token/compute reduction, pure self-editing benchmark claims, npm publication, global installation, remote push, and authentication/permission changes.

## Further Notes

The accepted domain glossary and ADRs govern terminology and trade-offs. Restart/reset and native compaction can reintroduce deleted material. Fallback can restore a larger input and trigger ordinary Pi overflow recovery. Private permissions are not a sandbox. Live vendor compatibility remains limited to evidence actually collected. The user authorized local dependencies, implementation, tests, review, documentation, and local commits on main; no push.
