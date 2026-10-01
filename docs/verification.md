# V1 verification

Implementation scope: [spec #1](https://github.com/yasuhito/clearhead/issues/1), with vertical slices [#2](https://github.com/yasuhito/clearhead/issues/2), [#3](https://github.com/yasuhito/clearhead/issues/3), and [#4](https://github.com/yasuhito/clearhead/issues/4). The parent spec remains open; remote code push/publication is not authorized.

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

This section records the current amendment separately from the historical v1 evidence above. Scope: [spec #5](https://github.com/yasuhito/clearhead/issues/5), with explicit amendments to ADRs 0002 and 0003. Review baseline: `0db270da5af447a6f522e15ab4e736084f1c96c4`. Parent issue #1 was neither modified nor closed.

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

At implementation commit `f723248`, these results demonstrated deterministic real Pi 0.99.2 integration, not live vendor behavior. The separately authorized visible live-model smoke was still pending; this development session did not launch it. No live vendor compatibility, signed replay acceptance, token billing reduction, or live-model measurements were claimed at that point. No push, npm publication, global install, credential reading, other-repository changes, or permission expansion was performed.

## Live smoke 1 and receipt continuation follow-up

### Supervisor-reported visible live-model evidence

Codex operated a separate visible Pi **0.99.2** session using **openai-codex / gpt-6.1-sol**. The user requested **one direct context_edit, then an answer without rereading**. This development agent did not operate that terminal or inspect credentials.

- The model read a public **26,557-character** source and used several short jq probes.
- It staged one **593-character** edit containing a **464-character** source summary.
- The actual next provider payload decreased from **48,106 to 21,757 JSON characters**. The old source marker was absent, the acceptance receipt was present, and the dedicated call/result were absent from that input.
- After the generic receipt, the model repeated the old-generation edit with **543-character** arguments. The safety guard rejected it and correctly restored normal input, producing a **49,936-character** provider payload.
- The model then answered the five requested facts from full normal context. **This is not a successful shortened final-answer run.** The first accepted projection demonstrates source replacement and input reduction; the later rejection demonstrates safety fallback, while also exposing a continuation usability failure.

These are supervisor-reported measurements from that one session, in serialized JSON characters, not token/billing measurements or a general live-vendor/signed-replay compatibility claim. No source URL or transcript artifact was supplied here, so none is invented.

### Bounded follow-up and verification

The receipt now states that the context_edit step is complete and already applied, and cues continuation of the substantive task using the edited context without repeating the edit. The Pi-owned guideline explains the same completion meaning and warns against replaying the removed call or its old generation. The receipt remains non-authoritative and overlay-only.

TDD at the existing real SDK/provider seam first failed on the missing completed-step cue, then passed after the wording change. The test observes both receipt and guideline in actual next provider input, preserved raw history, no retained dedicated exchange, and shorter whole-request/conversation input. Final `npm run check` passes typecheck, Biome, and **56 tests across 15 files**. The accept/reject/reject guard and native-deletion recovery tests remain green. No guard, fallback, tools, lifecycle timing or automatic inference behavior changed.

Focused parent-agent direct review against `f723248` found no outstanding Standards or Spec issues: the production diff changes only receipt/guideline wording, with tests and explanatory docs. The previously unavailable delegation harness was not represented as a new independent review. Separately, the supervisor reports a completed focused independent parallel re-review of the continuation-cue diff: **Standards and Spec both pass, with no must-fix findings**; non-authoritative receipt, publication timing, raw logs and guard behavior remain unchanged. Tests establish cue delivery, not live-model compliance. At receipt follow-up commit `e02eae7`, a fresh visible live-model smoke was still pending; the changed cue had not yet been shown to prevent repetition in a live run. Commit `45148c0` records the independent review. The subsequent successful recheck is recorded below without replacing the failed-trial history. No push or other publication was performed.

## Live smoke 2: successful completed-step continuation and OFF restoration

### Scope and evidence provenance

Codex operated a separate visible Ghostty window with native title `pi-context-tidy live smoke recheck` (supervisor-confirmed via `hyprctl`, client `0x5756f8efe920`), using actual Pi **0.99.2 / openai-codex / gpt-6.1-sol**, reasoning level **medium**. The local `index.ts` was explicitly loaded alongside a read-only observer recording only counts, presence flags, and usage, not authentication headers or payload contents. This docs-only completion inspected only the dedicated `/tmp/pi-context-tidy-smoke/session-recheck.jsonl` and `metrics-recheck.jsonl` evidence, not other sessions or authentication data. Visible UI status and mirror removal are supervisor-reported; the dedicated JSONL independently supports the tool sequence, usage, answer, and provider-input measurements below. Temporary evidence is not committed.

### SUCCESS: shortened-context final answer

- The source was the public v1 README from published commit `0db270d`, repeated to **26,557 source characters**. The model used `read`, one short jq metadata query via Bash, and exactly one direct `context_edit` with **541 serialized JSON argument characters**. It replaced the source result with **408 text characters**, then immediately completed the correct five-fact answer without more tools or a repeated edit: Node.js 22.19+, Pi 0.99.2, default OFF, original messages/tool activity preserved, and native compaction summarizing canonical history and resetting the overlay on success.
- The actual next effective-context conversation decreased from **30,708 to 4,493 serialized JSON characters**. The serialized provider payload decreased from **38,214 to 11,950 JSON characters**. These are separate measurements, not source-text lengths or token counts.
- Provider-reported input usage for the response issuing the edit was **413 uncached + 6,912 cached = 7,325 tokens**. For the final-answer response after acceptance it was **2,139 uncached + 0 cached = 2,139 tokens**. Cache behavior changed; these measurements do not establish billing savings.
- The full next effective context contained no old source marker and no dedicated edit call/result, with the compact acceptance receipt present. The provider payload likewise lacked the old marker and edit `function_call`, and contained the receipt.
- Visible status was **ON overlay**, with the self-edit accepted, the answer complete, and input idle. Raw session JSONL retained the entire original public source and successful dedicated call/result, with **zero durable `context_edit` entries**.

### SUCCESS: OFF restores normal input

Codex then issued `/context-tidy off` in the same visible smoke window. Status returned to **OFF normal** and the mirror was removed. The next actual provider payload measured **42,339 serialized JSON characters**: the original source marker and dedicated edit call/result were restored, and the receipt was absent. The model answered the required Node.js and Pi versions correctly without tools. The window was left **OFF, idle**.

### Final checks, review, and limits

The implementation at `f723248`, completed-step receipt at `e02eae7`, and independent-review record at `45148c0` remain unchanged by this documentation completion. The independently executed implementation `npm run check` passed typecheck, lint, and **56 tests across 15 files**. Independent parallel Standards/Spec review and the focused receipt follow-up both passed with no must-fix findings.

This docs-only completion reran `npm run check`: typecheck, Biome lint, and **56 tests across 15 files passed**; `git diff --check` also passed. Direct Standards and Spec review of the documentation diff against `45148c0` found no must-fix findings. New parallel delegated documentation reviews could not start because the Herdr environment was unavailable; the direct review is not represented as independent review.

This recheck is one measured successful live continuation and OFF restoration, not a benchmark, universal provider/Pi compatibility result, signed-replay validation, billing-savings claim, or guarantee that models deterministically obey continuation cues. The earlier failed run remains relevant evidence. No new implementation, push, publication, global installation, credential access, other-repository changes, or permission expansion was performed.

## Release review follow-up: conflict handling and documented-claim regressions

A whole-repository two-axis review (Standards and Spec, independent parallel sub-agents, baseline `2163bb3`) found no documented-standard violations and no missing user stories, but flagged untested conflict edges and README claims without supporting assertions. The user then fixed the conflict semantics: pending file edits and already staged proposals are retained, only the later conflicting `context_edit` call is rejected, a rejected call changes nothing, and a boundary rejection must not leave the advertised document path dangling.

Changes: `context_edit` detects a pending file edit by comparing the mirror bytes with the published serialization, so lenient JSON parsing can no longer hide a duplicate-key draft; tool-level rejection no longer touches the mirror, draft or overlay; the context hook no longer treats an errored `context_edit` result as a reason to discard the overlay (the failed exchange stays whole and earns no receipt); a boundary rejection republishes a fresh normal-input snapshot immediately and only withdraws the document if that publication fails; the staged tool result says "not yet applied". ADR 0003 and the README were amended accordingly. A MIT `LICENSE` was added, duplicated rejection/status/ENOENT code was extracted, and Biome now honours git ignore rules so plugin-generated local files cannot fail lint.

Regressions added at the real Pi SDK seam: file edit retained and applied when a dedicated call conflicts; second same-response call rejected alone while the first is applied without a receipt; stale and schema-invalid calls keep a previously accepted overlay; the document is readable with normal-input content during the inference right after a rejection; a later acceptance leaves exactly one receipt; whole-document replacement of a unit published since the earlier same-generation read (asserted as deletion at the time; the revision follow-up below reverses this to retention); threshold compaction reports `reset: native compaction` and no rejection. The loop-guard regression now asserts that locked re-edit attempts are rejected while the first accepted edit and its single receipt remain. `npm run check` passes typecheck, Biome lint, and **61 tests across 16 files**. Live-model evidence was not re-collected for this change.

## Stale whole-document writes: revision-scoped deletion

Follow-up to the release review: the user raised that a document read in one call and written back in a later call deleted every unit published in between, because the generation stays stable across append-only calls. The accepted mitigation gives each publication a read-only `revision` and records when each unit first appeared; a written document deletes only units that existed at its revision and keeps later ones after the written units. ADR 0003, the design notes, the README and the prompt guideline were amended; the earlier read-write regression now asserts the read exchange is retained.

Regressions at the real Pi SDK seam: an older-revision write deletes a seen unit while retaining the unseen read exchange in order; a revision never published is rejected with normal-input fallback and a rotated generation; append-only inferences advance the revision while keeping the generation. `npm run check` passes typecheck, Biome lint, and **64 tests across 17 files**.

## Second review round: review findings applied

A second two-axis review of the working tree (baseline `2163bb3`) found no documented-standard violations. Applied findings: an older-revision document whose own units are empty is now rejected as an empty effective context instead of being rescued by retained unseen units; the staged tool result tells the model to verify the outcome in the next document rather than relying on status it cannot read; a failed mirror cleanup during fallback is named in the status suffix; the pending-proposal check and the conflict check both compare published bytes; `describe` in the extension entry was renamed `rejectionReason` to avoid clashing with the descriptor builder; shared test helpers (`done`, `contextEditCall`, `toolResults`, `reportsDuring`) moved into `test/runtime.ts`. ADR 0003 now limits "rejection clears draft/overlay" to boundary rejections, and the design notes describe the immediate republish after fallback.

Decision recorded: a rejected `context_edit` call never discards a previously accepted overlay, whatever the reason; the loop guard is enforced by rejecting the call. Boundary rejections stay visible to the user through status and to the model through the unedited next document; no message is injected to announce them.

New regressions: two unseen units keep their original order after an older-revision write; the status names `rejected: staged proposal changed` when a staged proposal is tampered with before the boundary; an older-revision document with no units is rejected. `npm run check` passes typecheck, Biome lint, and **66 tests across 17 files**.
