## Problem Statement

Self-editing currently requires long scripts or copying a full context document, and those edits themselves remain in the next input. Users need short same-parent-model edits without losing audit history or tool structure.

## Solution

Provide a dedicated generation-scoped context_edit tool for text replacement, whole-unit deletion/reordering, and notes. At the next context boundary validate and publish atomically, then replace a complete edit-only exchange with a compact non-authoritative acceptance receipt in effective context only.

## User Stories

1. As a model, I want snapshot generation and unit/message/slot IDs, so that I submit short edits without reproducing old text or descriptors.
2. As a model, I want text replacement, so that verbose evidence can be shortened freely.
3. As a model, I want whole-unit deletion, so that irrelevant context stays absent.
4. As a model, I want whole-unit movement, so that evidence can be organized without splitting exchanges.
5. As a model, I want notes, so that working memory is non-authoritative.
6. As a user, I want the same parent model to author edits, so that another model is not required.
7. As a user, I want a shorter actual next provider input, so that edit payloads do not defeat the benefit.
8. As a user, I want raw logs intact, so that original calls, results and arguments remain auditable.
9. As a user, I want mixed parallel exchanges retained whole, so that unrelated work is never lost.
10. As a user, I want strict stale/invalid/I/O rejection and normal-input fallback, so that proposals cannot partially activate.
11. As a user, I want receipts only after publication, so that they do not claim unaccepted changes.
12. As a user, I want loop guards, so that receipts do not induce endless re-editing.
13. As a user, I want OFF, idle controls, reset and native compaction preserved, so that ordinary Pi recovery works.
14. As a user, I want concise visible TUI status and tool results, so that acceptance and rejection are inspectable without context dumps.
15. As a user, I want legacy file edits retained, so that existing experiments remain usable.

## Implementation Decisions

- Keep the conversation-only context hook and ephemeral cumulative overlay. Do not use persistent native context-edit entries, mutate raw messages, or add model requests.
- Dedicated tool accepts generation plus nonempty ordered operations: replace (unit/message/slot/text), delete (unit), move (unit/before unit or null for end), note (new-prefixed ID/text/before unit or null). Unknown fields and IDs are rejected. All operations stage atomically; replacement never changes structural descriptors or arguments.
- One pending proposal per context boundary. Tool returns a short staged acknowledgment; final acceptance occurs only after the next mirror publication succeeds. Validate against the existing strict document contract, preserve intervening new activity, and reject stale source prefixes.
- Complete edit-only exchange means every assistant call is a successfully staged dedicated edit, every result is successful, and no substantive assistant text is present. Keep mixed exchanges whole, including opaque metadata. Receipt is a custom, non-authoritative message in the overlay, not a new session entry.
- Reject no-ops and consecutive edit-only proposals until new substantive user/assistant/unrelated tool activity. No automatic continuation requested by this extension. Pending work resets with the overlay; rejection preserves the loop lock and its activity checkpoint so a third edit-only attempt cannot reopen the cycle. Explicit OFF/session resets and successful compaction clear the lock.
- Existing file editing remains supported, but automatic receipt eligibility is exclusive to the dedicated direct tool, not nested codemode or arbitrary file tools.
- Explicitly amend existing ADRs 0002 and 0003 rather than silently overriding them.

## Testing Decisions

Use existing real Pi 0.99.2 SDK/session/provider and packaged CLI public seams. Observe actual next provider input, intact raw session history, complete mixed parallel calls/results, errors, idle controls, lifecycle resets/native compaction, and visible terminal output. Work red-green vertical slices. Do not mock internal modules or claim live vendor signature compatibility from deterministic tests.

## Out of Scope

Push, npm publication, global install, credentials, other repositories/windows, durable overlay, autonomous editor models, required codemode/subagents, new permission machinery, semantic intent guarantees or token-reduction requirements.

## Further Notes

User delegated routine seam and breakdown choices. The installed docs and runtime are authoritative for 0.99.2; official upstream is github.com/earendil-works/pi. Parent issue #1 must not be modified or closed. Review baseline: 0db270da5af447a6f522e15ab4e736084f1c96c4.
