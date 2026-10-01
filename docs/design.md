# Clearhead design

Status: accepted. Shared understanding is confirmed under user-authorized delegated design decisions. The behavioral frontier is resolved. Implementation was subsequently authorized separately under [spec #1](https://github.com/yasuhito/clearhead/issues/1); verification evidence is maintained in [verification.md](verification.md).

## Purpose

An independent Pi extension for learning about and exploring CLM-style context self-editing. The model chooses what to delete, shorten, and reorganize; the extension validates proposed edits and applies them to inference input. No additional training.

## Confirmed decisions

### Cumulative input overlay

Accepted edits persist in a memory-only working-context overlay across inference calls. New conversation activity is appended. Original session messages and tool records are never rewritten. This is our interpretation of next-input editing, not an alteration of the log. See [ADR-0001](adr/0001-cumulative-input-overlay.md).

### Private editable document

Mirror the working context into a private editable document. The editing UX amendment adds a short generation-scoped `context_edit` tool for replacement, deletion, movement and notes; existing read/edit/write/bash editing remains compatible. This is free textual editing, not a semantic compaction strategy. Parse and validate the complete candidate atomically before using it; no partial acceptance. No code copied from pi-clm. ADR 0002 explicitly records the changed interface choice; [spec #5](editing-ux-spec.md) defines the amendment.

### Lifetime and controls

V1 has no durable checkpoints. Reset overlay and pending edits on reload/resume, branch change, session replacement, and OFF. Starting again reintroduces original material from Pi's current normal input. The overlay is cumulative during an uninterrupted active session, not across these reset boundaries.

Expose clear explicit ON/OFF. Selected operational defaults: OFF on fresh extension load; `/clearhead on|off|status`; a small TUI status indicator when available. OFF returns to normal Pi input and discards edits, not merely pauses them. No custom dashboard. ON is idempotent while already ON; it does not clear an active overlay. Control changes wait until the agent is idle to avoid changing the mode midway through an active tool batch.

### Native compaction

Retain Pi's manual and automatic compaction. Successful compaction resets the overlay and pending edits to Pi's new input baseline. Failed or cancelled compaction does not itself reset the overlay, although a changed baseline must still invalidate it.

Compaction uses Pi's canonical session context derived from session history, including Pi-native context edits and prior compactions, not this extension's working-context overlay. Deleted information can therefore reappear in the summary or retained messages. Experiments mix self-editing and native summarization; do not claim pure self-editing benchmarking.

### Editing authority and risk

Use the conversation-only `context` hook. Pi owns system prompts and tool declarations; neither is editable through the document. Latest user instructions are editable. Loss of user intent through accidental or injection-induced deletion/rewriting is an explicitly accepted risk. Preserving original history does not guarantee that the model retains or follows a removed instruction.

These boundaries are project decisions, not requirements attributed to the paper.

### Validity and size

Reject invalid candidates atomically and fall back to normal Pi input. Preserve tool-call/result consistency. Token reduction is optional: useful reorganization need not shrink context. Smaller input does not prove lower compute, because edits can invalidate prefix caches.

No custom overflow manager, automatic editing model calls, training loop, swarm, provider payload rewriting, or durable checkpoint machinery in v1.

## Verified inspiration and API facts

### Paper

[Context Language Models](https://arxiv.org/html/2609.37725v1), sections 4.1-4.3, delegates context transitions to the model. Its implementation mirrors live context into a file, accepts general Bash edits, and synchronizes them for continued generation. Examples include deletion, in-place shortening, notes, and model-defined editing functions. Zero-shot use is supported; training, skill evolution, multi-agent context files, and suffix-cache serving are additional research directions, not necessary components of this extension.

### Pi API

Installed version inspected: `@earendil-works/pi-coding-agent` 0.99.2. Paths below are relative to `/home/yasuhito/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/`.

- `dist/core/extensions/types.d.ts:645-663`: `context` runs before each model call and receives conversation messages excluding system messages. Pi restores prompt/tool state afterward. `context_with_system` instead owns the full transcript.
- `dist/core/extensions/runner.js:1000-1062`: input is structured-cloned; context handlers run sequentially, restore system state, and precede all context-with-system handlers. This is a request-local transformation, not a session rewrite. Subsequent handlers can change its output.
- `dist/core/sdk.js:266-271`: the agent's request-time context transform invokes the extension runner.
- `docs/extensions.md`: commands, active tool selection, lifecycle hooks, and non-context custom entries are available. Calls from one assistant message may execute in parallel. Request-local state must not assume that sibling results already exist during tool execution.
- `docs/message-types.md`: tool results reference `toolCallId`; assistant messages include structured calls and opaque thinking/signature metadata. Untouched messages should retain their original structured content rather than being recreated as text.
- `docs/session-format.md`: sessions are branch-aware. Native `context_edit` entries retain original history but replace/delete contributions to future context; they do not supply arbitrary reordering. V1 does not use these entries to persist its overlay.
- `docs/compaction.md` and `dist/core/agent-session.js:2267-2393`: native compaction operates on canonical session context, not this request-local overlay, and uses provider usage in some threshold paths. It can summarize material omitted by this extension.

### Reference-only repository

Read `/home/yasuhito/Work/oss/pi-clm/docs/architecture.md` and `docs/how-it-works.md` as reference. Its checkpoint, mirror, repair, overflow, settings, and panel mechanisms are observations, not a specification to reproduce. No code copied.

## Confirmed editing boundaries

Allow arbitrary text replacements and new non-authoritative notes, including summaries, TODOs, tables, and edits that grow context. Reject role changes, new system messages, and fabricated structured tool activity. Notes become request-local Pi custom messages, which Pi converts to user-role text; they do not acquire system authority. This permits authored memory but is not an arbitrary provider-role interface.

Tool-result text is editable. Preserve call IDs, names, arguments, images, and opaque thinking/signature metadata. Delete/reorder only complete tool exchanges, including all parallel calls and their corresponding results as one unit. Retain internal ordering and reject incomplete exchanges or orphaned results atomically; no repair or flattening.

These are deliberately stronger structural boundaries than the paper's unrestricted context editing, not paper requirements.

## Confirmed application mechanics

- Validate the final document at the next `context` boundary before overwriting the mirror. This avoids reading half-completed parallel tool writes and naturally applies changes to the next inference rather than the ongoing generation.
- Bind edits to the mirrored snapshot with a generation identifier and message IDs; retain original structured objects for unchanged blocks. Treat new activity since that snapshot as an appended suffix outside the candidate.
- Enforce well-formed document structure, known/unique IDs, supported note blocks, preserved metadata, consistent tool exchanges, and an unchanged source prefix. Reject unsupported edits instead of repairing or flattening them.
- On an invalid candidate or a baseline mismatch, discard candidate and overlay and use normal input, with an explicit reason. This interprets the agreed normal-input fallback literally rather than silently retaining the last overlay. Re-render a valid document for further exploration while ON.
- No hard pin on any user message; no required shrink threshold.
- Reject an empty final conversation after appending the new suffix, rather than relying on provider-specific system-only request support. An authored note can represent a whole-context rewrite while retaining the required document structure.

These application mechanics are confirmed. The deterministic document contract below remains the validation boundary for both file edits and dedicated operations.

## Deterministic document contract

Use UTF-8 JSON, `CONTEXT.json`, rather than inventing an ambiguous text delimiter language. Existing file/Bash tools can parse, edit, and generate it freely. Strictly validate the schema, including duplicate JSON object keys; reject malformed JSON, unexpected fields, wrong types, duplicate IDs, and unsupported versions. Array order is the proposed context order. Formatting and key ordering are insignificant.

Top-level fields:

- `format`: fixed `pi-context-tidy/v1`.
- `generation`: current working-context generation identifier, required and read-only. Append-only inference calls retain it and preserve existing source IDs, enabling separate read/write tool calls. Accepted document changes, resets, and invalidated baselines rotate it.
- `revision`: read-only publication counter within the generation. A written document may delete only units that existed at its revision; later units are retained. See ADR 0003.
- `units`: ordered source or note units.

A source unit has `kind: "source"`, a read-only `id`, and `messages`. Most units contain one message. A tool-exchange unit contains its assistant call message and every corresponding result in original order. Its message list cannot be edited structurally; omit or move the entire unit instead.

Each source message has a read-only `id`, `role`, `readOnly` descriptor, and `texts`: ordered `{ slot, text }` records. Slots identify original string content or text blocks. Only `text` values may change; slots cannot be added, removed, duplicated, or reordered. Use an empty string to remove an individual text slot's content. `readOnly` describes structured tool calls, tool-result identity, and non-text block positions/types, but never exposes image base64 or opaque signature bytes. Descriptors must match the baseline. The in-memory source objects retain the actual images, calls, signatures, and all other metadata.

A new note unit has exactly `kind: "note"`, `id: "new:<unique-label>"`, and `text`. IDs must be unique across all units. Once accepted, notes receive ordinary generated source IDs in the next mirror; they can then be edited/deleted/reordered like other textual units. No supplied role field is accepted for notes.

Known source IDs may be omitted for deletion or moved for reorganization. Source IDs may only refer to the current snapshot. Omitting a tool-result message within a retained exchange is invalid. Opaque messages with no text slots can be kept unchanged or removed/reordered as whole valid units, not converted to invented textual provider messages.

No header-free plain-text rewrite is accepted: a whole-context rewrite uses a structurally valid document containing authored notes and any retained source units. No arbitrary role names, fabricated message metadata, or tool structures are accepted.

This document mirrors the editable conversation at this hook, not the complete provider payload. System state, provider serialization, and later extension transformations are outside it. Preserve unmodified structured messages; for edited messages, replace only the selected text values while retaining other fields. This is structural preservation, not a promise that every provider accepts every signed replay combination; provider integration must be tested before implementation can claim compatibility.

## Snapshot and request lifecycle

1. While OFF, return input unmodified and keep no editable mirror.
2. On the first context boundary after ON, capture normal conversation input and publish its mirror. This request uses the same conversation, with no self-edit yet.
3. At the next boundary, read the existing mirror before replacing it. Verify generation and the exact normal-input source prefix captured by that snapshot. Normal input must equal that prefix plus a newly appended suffix; a non-append change invalidates the overlay.
4. If the mirror is semantically unchanged, retain the accepted overlay and append new activity. If changed, parse and validate the complete candidate, then append all new activity since the snapshot. A dedicated proposal must still match its staged candidate. File-editing exchanges are new activity and not retrospectively editable by that candidate. For the dedicated tool only, a complete successful edit-only exchange can be replaced by a compact non-authoritative overlay receipt. Mixed/failed exchanges remain whole; never rewrite an individual signed call. Keep only the latest overlay receipt.
5. Validate the complete resulting conversation, including exchange pairing and nonempty input. Publish the next generation's mirror before activating it for inference, including any receipt. Preserve unrelated new activity; never rerun tools or alter persisted results. Dedicated proposals also require a nonempty edited conversation before their exchange is appended.
6. On malformed, stale, inconsistent, unreadable, or unpublishable input, discard the candidate and overlay and return the incoming normal conversation. Remain ON, report the rejection/reset reason, and republish a fresh normal-input mirror at once under the same path so the advertised document stays readable. A failed mirror publication cannot leave a partially activated edit.

Use deterministic source IDs within each generation and a unique generation token. Append-only calls can extend the mirror without rotating the token and advance a read-only revision; a source unit omitted from a whole-document replacement is deleted only if it already existed at the written revision, so units added after an earlier read in the same generation are retained rather than silently dropped. Old accepted/reset generations remain invalid. Compare source prefix content and metadata, not object identity: Pi clones the request messages. Reset boundaries invalidate both generations and overlays. A retry with an unchanged normal prefix is valid; provider recovery omissions or native edits that change the prefix require fallback, even if no compaction completes.

Record no durable overlay state. A failure can restore a much larger normal input and provoke Pi's ordinary overflow recovery; v1 does not guarantee fitting within the model window or automatically salvage the draft.

## Local storage and visibility

Use a session-local private temporary directory (0700) and document (0600). Publish extension-generated snapshots with atomic replacement. Model-authored partial writes are still possible; malformed final content is rejected at the context boundary. Resolve only the extension-owned path, reject symlinks/non-regular files, and retain private permissions. Remove the mirror on OFF and session shutdown/reset; create a fresh generation/path on a later ON when needed. No background sweeper, file watcher, archive, or external service.

Expose the document path and concise protocol through a Pi-owned prompt guideline while ON; remove the guideline when OFF. This instruction describes the editing contract, not a fixed strategy or required compaction threshold. Prefer the dedicated `context_edit` tool for short operations using generation and unit/message/slot IDs. It stages one proposal per boundary and rejects no-ops. No automatic continuation or separate editing model is used. Consecutive edit-only proposals stay locked after rejection: failure discards draft/overlay but preserves the lock and its conversation checkpoint. Substantive user/assistant-text/unrelated-tool activity unlocks it; OFF/session reset and successful compaction clear it. This explicitly extends ADR 0003.

Status exposes ON/OFF, document path while available, active overlay versus normal-input baseline, and the latest acceptance/rejection/reset reason. Provide a notification for rejection/reset in supported UI modes and a concise stderr diagnostic in non-UI modes; never print conversation contents or credentials in diagnostics. No custom renderer or token-budget UI is needed.

The mirror contains sensitive conversation data. Private permissions reduce accidental exposure, not the model's or same-user processes' ability to read it. Existing remote/container-backed tools may not see a local mirror; v1 assumes file tools operate in the Pi process's filesystem. No remote mirror bridge.

Other context-changing extensions can alter the upstream baseline or downstream output. Fail back to normal input when the upstream source prefix changes. Do not claim that the mirror is the final provider input when another handler subsequently transforms it. V1 does not coordinate or reorder third-party extensions.

## Acceptance scenarios for later implementation

These are design acceptance scenarios, not evidence by themselves. Executed runtime tests and their coverage are recorded in [verification.md](verification.md). Live vendor compatibility, including signed replay behavior, remains unverified. API inspection alone establishes available interfaces, not working end-to-end behavior.

- Delete a long completed exchange, then append a new tool exchange: deleted material stays absent while ON, and raw log entries remain unchanged.
- Edit the latest user instruction or insert a growing tracker: accepted if structurally valid; no shrink requirement and no latest-user pin.
- Shorten a result in a parallel exchange: text changes, IDs/arguments/non-text metadata remain intact. Delete just one result: reject the entire candidate, clear the overlay, and send normal conversation.
- Reorder complete exchanges: preserve each exchange's internal sequence. Fabricate a call, change a role, duplicate IDs, or use an old generation: reject atomically.
- Reload/resume, branch/session change, OFF, or successful native compaction: discard overlay and drafts. Original material may reappear; failed compaction alone does not erase a still-valid overlay.
- Partial file writes, mirror I/O failure, or non-append recovery edits: normal-input fallback with a visible reason; no partial activation or tool re-execution.
- Unchanged mirror: no self-authored changes, only newly appended activity. Untouched images and opaque metadata survive without a lossy text round trip.

## Design completion

The design is accepted and no consequential questions remain within the agreed scope. The original design session ended without implementation. Subsequent authorization permits local development, specification/tickets, verification, and local commits; remote push and publication remain prohibited. The verified boundary is documented separately from unverified live vendor compatibility.
