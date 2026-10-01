# V1 verification

Implementation scope: [spec #1](https://github.com/yasuhito/pi-context-tidy/issues/1), with vertical slices [#2](https://github.com/yasuhito/pi-context-tidy/issues/2), [#3](https://github.com/yasuhito/pi-context-tidy/issues/3), and [#4](https://github.com/yasuhito/pi-context-tidy/issues/4). The parent spec remains open; remote code push/publication is not authorized.

## Executed checks

Environment: Linux, Node.js 26.10.0, Pi 0.99.2, TypeScript 5.9, Vitest 4.1.11. The advertised Node minimum follows Pi's requirement; Node 22 itself was not exercised.

- A clean `npm ci --ignore-scripts --offline` followed by `npm run check`: strict source/test typecheck, Biome formatting/lint, **38 tests across 12 files passed**.
- Real resource-loader extension loading, Pi SDK/session runtime, local filesystem, ordinary tools, and deterministic provider streams are used, not a mocked ExtensionAPI.
- The packaged Pi CLI was exercised as an RPC subprocess with explicit extension paths, isolated settings, offline mode, and a deterministic provider. It demonstrated command registration, ON/OFF/status, next-input updates, idempotent ON, normal-input restoration, sanitized rejection notifications, persistent last reason, and cleanup. A separate regression replaces the owned directory, verifies visible OFF cleanup refusal, then verifies ON creates fresh usable 0700/0600 storage, applies a self-edit, and leaves the replacement's identity, permissions, files, and contents untouched through shutdown.
- Interactive packaged CLI was exercised through a pseudo-terminal at 60 and 120 columns. ON/OFF command feedback and the compact footer indicator were inspected in the terminal stream. No custom TUI component or dashboard is implemented.
- Tests use in-memory test credential storage or an isolated CLI agent directory. No user credentials were read or printed, and no live model/network service was used.

## Acceptance evidence

| Behavior | Evidence |
| --- | --- |
| Model edits next input using ordinary tools | Provider-issued Bash and separate read/write calls rewrite the mirror; the same run's automatic next inference receives edits plus the editing exchange |
| Cumulative overlay and appended activity | Later inference calls retain edits while new user/tool activity arrives |
| Original history preservation | Persisted JSONL retains original messages/results; a saved byte prefix remains unchanged; no extension context-edit entries or overlay checkpoints are appended |
| Notes, growth, latest-user editing | Growing notes reach the provider as user-role text rather than system authority; latest user intent is editable; accepted notes can be edited as source units on the next generation |
| Opaque content | User images, tool-result images, thinking signatures, tool-call signatures, IDs, names, and arguments survive textual edits in deterministic provider transcripts |
| Complete parallel exchanges | Parallel calls plus all results form one source unit; complete exchanges can be reordered/deleted; incomplete exchange candidates are rejected without repair/flattening or re-execution |
| Atomic invalid-edit fallback | Role changes, duplicate IDs, unknown IDs, stale generations, unknown fields, wrong versions, changed slots/descriptors, fabricated note roles, malformed JSON, and duplicate decoded JSON keys restore normal input without partial activation |
| Host baseline changes | Pi-native context edits invalidate the overlay and return host normal input |
| OFF and lifecycle resets | OFF waits for idle; branch navigation, reload, resume, fork, and new-session replacement discard drafts/overlay; shutdown removes private storage |
| Native compaction | Actual manual and threshold compaction remain functional, use original canonical history, and reset the overlay; cancellation and failed summarization alone preserve a valid overlay |
| Unchanged input and retries | Unchanged documents preserve Pi's system/tool transitions; an actual provider-error retry retains the overlay without duplicating new activity |
| Local filesystem failures | Missing files/directories, symlinks, non-regular files, and failed mirror publication fall back; a missing owned directory can regain a fresh baseline; private mode bits and staging cleanup are checked |

## Standards review

Fixed point: accepted-design commit `d0658eb6145c46d130213c9f18bdcc7b83f1b8da`. Review covered the staged implementation/docs diff against that point and the final follow-up fixes. Sources: repository AGENTS instructions, inherited global instructions, accepted ADRs, and the code-review skill's Fowler smell baseline. Review was performed directly under the user's approved fallback, not represented as independent subagent review.

One judgement-call finding: repeated overlay-reset assignments (possible Duplicated Code). Consolidated into a small local reset helper. No outstanding documented-standard violations or baseline-smell findings after fixes. Tool-enforced formatting/type issues were corrected separately.

## Spec review

Five behavioral findings, all reproduced and fixed at the public Pi/provider or packaged CLI seam:

1. Unchanged snapshots returned previous request objects, which Pi interpreted as context changes and needlessly collapsed system/tool transitions. Semantically unchanged input now returns the current request's original objects.
2. Loss of the owned temporary directory prevented future baseline publication indefinitely. A later baseline publication can recreate the known missing private path; replacement directories are not adopted.
3. Status remained `overlay` after a self-edit restored the normal conversation. Status now reflects actual effective-versus-normal input equality.
4. Rotating generation on every inference made ordinary read-then-write proposals stale before use. Append-only calls now retain the generation and existing source IDs; accepted edits and resets rotate it. Whole-file replacement still deliberately deletes omitted source units, so retaining intervening units requires surgical edits or a current-file read/modify/write.
5. A replaced owned directory caused cleanup to throw before cached ownership was cleared, leaving OFF/ON permanently reusing the refused path. `remove()` now detaches path/directory/identity in `finally`, even when safe cleanup refuses. The CLI regression verifies recovery into fresh private storage without adopting or deleting the replacement.

Cleanup failures are reported without leaking raw exception/document content. Status keeps the last meaningful acceptance/rejection/reset reason. All requested v1 features have implemented paths and acceptance evidence above; no outstanding spec findings remain. Structural validity is not semantic correctness or universal provider acceptance.

## Practical limitations and unverified behavior

- Live vendor requests, signed replay acceptance, different Pi versions, other operating systems, and the minimum Node version remain unverified. Deterministic boundary-provider success demonstrates actual Pi API integration, not universal vendor compatibility.
- The tests preserve synthetic opaque signatures; they do not validate vendor cryptographic replay rules.
- Manual/automatic compaction mixes native summarization with self-editing and can reintroduce omitted facts. Reset/restart and invalid-edit fallback can also reintroduce original material.
- Latest-user editing risks loss of intent. Fallback can exceed the model window. There is no custom overflow guard, benchmark claim, or guarantee of token/compute savings.
- Local private storage is not a sandbox. Remote tools, downstream context-transforming extensions, crash cleanup, and malicious same-user filesystem races are not solved by v1.
- `npm audit --omit=dev` reports no production vulnerabilities. Full development audit reports one high-severity affected package, `brace-expansion` (multiple advisories), in Pi 0.99.2's shrinkwrapped dependency tree (installed 5.0.9, fixed upstream in 5.0.12). No upstream/generated files were hand-patched; this pinned development-toolchain limitation remains disclosed. The extension's direct runtime dependency is jsonc-parser.

No remote push, npm publication, global installation, new services, or authentication/permission expansion was performed.

## Editing UX verification (spec #5)

This section records the current amendment separately from the historical v1 evidence above. Scope: [spec #5](https://github.com/yasuhito/pi-context-tidy/issues/5), with explicit amendments to ADRs 0002 and 0003. Review baseline: `0db270da5af447a6f522e15ab4e736084f1c96c4`. Parent issue #1 was neither modified nor closed.

### Executed checks and evidence

- Final local `npm run check`: typecheck, Biome, **56 tests across 15 files passed**. The supervisor independently reported a full 54-test check, then a 55-test implementation state and the four targeted recovery/loop tests passing. The final additional test covers duplicate-key draft rejection.
- Real Pi SDK/session/provider tests issue generation-scoped replace/delete/move/note calls from the same deterministic parent provider. They observe actual shorter next provider input (both whole-request and conversation lengths), a compact non-system receipt, cumulative edits/new activity, and intact original messages/calls/results. No Python or full old-document reproduction is needed in the model-authored edit.
- Complete mixed parallel exchanges retain the original assistant message, opaque signatures, both calls with unchanged arguments and both results. No receipt replaces mixed activity. Failed exchanges remain whole. Existing exchange/image/metadata coverage remains green.
- Ordered operations, stale/unknown unit/message/slot/before IDs, no-ops, invalid notes, empty proposals, malformed tool schemas, staged-candidate tampering, and unsafe mirror I/O all have public-boundary coverage. Rejection restores normal input without a receipt or partially activated edits. Raw JSONL bytes saved before edits remain an unchanged prefix.
- The receipt/re-edit test observes accept/reject/reject without new substantive activity. Rejection preserves the loop lock; explicit reset semantics remain unchanged. A separate recovery test creates three real Bash exchanges, accepts an edit, omits two old exchanges using Pi-native context edits, observes source-prefix fallback, then verifies fresh user activity permits a new edit. The lock checkpoint uses a raw branch-entry ID rather than projected message counts.
- Direct Spec review additionally reproduced a duplicate-key legacy draft being overwritten by a dedicated call before strict validation. The tool now validates the existing draft before staging; that SDK regression passes with normal-input fallback.
- Packaged Pi CLI/RPC coverage executes the short dedicated tool, receives edited input and acceptance receipt, exposes accepted status, and retains raw original history and tool activity. Existing idle controls, OFF, lifecycle/reset, retry, manual/automatic native compaction and storage tests pass unchanged.
- Isolated packaged TUI runs at **60 and 120 columns** were inspected through pseudo-terminal output. The tool call is compact/collapsed by Pi's standard renderer, staged output is visible, accepted status and `tidy ON overlay` are visible, and OFF returns to `tidy OFF normal`. No clipping or broken extension layout was observed. ANSI captures were local temporary evidence, not committed artifacts. No other trial/comparison window was operated.

### Standards review

Parent-agent direct review of the staged/full working diff against the fixed baseline used repository/global instructions, domain docs/ADRs, and the code-review Fowler smell baseline. No outstanding must-fix standard violations or meaningful smell findings remain; formatting/type issues were handled by tooling. The two requested delegated reviews could not start in this Pi session because the harness lacked Herdr environment identifiers. This limitation is not presented as an independent review.

Separately, the Codex supervisor reports having actually run parallel **read-only Standards and Spec reviewers** following the code-review skill. Its Standards reviewer reported no must-fix findings. This independent report is distinct from the parent-agent direct review.

### Spec review

Parent-agent direct review used the existing v1 spec, editing UX spec #5, amended ADRs, and the requested boundary scenarios. Reproduced and fixed findings: schema failures bypassing tool execution must trigger fallback at the context hook; changed staged candidates must not earn receipts; rejection must preserve the loop lock; duplicate-key legacy drafts must be validated before staging. No outstanding findings remain in the direct review after regression checks.

Separately, the supervisor's independent Spec reviewer found the native-history-deletion checkpoint edge. It was reproduced RED at the real SDK seam and fixed GREEN, while retaining rejection-only loop protection. The supervisor subsequently reported the independent Spec recheck complete: the raw-entry-ID checkpoint fix is resolved, rejection still preserves the checkpoint/lock, and no remaining must-fix findings were found.

### Evidence limits

These results demonstrate deterministic real Pi 0.99.2 integration, not live vendor behavior. A separately authorized visible live-model smoke session will be opened and operated by Codex after implementation/review/checks; this development session did not launch it. No live vendor compatibility, signed replay acceptance, token billing reduction, or live-model measurements are claimed yet. No push, npm publication, global install, credential reading, other-repository changes, or permission expansion was performed.
