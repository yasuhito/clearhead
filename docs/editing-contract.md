# Editing contract and limitations

## Short edits

Read the context document for its `generation` and unit/message/slot IDs, then call `context_edit`:

```json
{
  "generation": "<snapshot generation>",
  "operations": [
    { "op": "replace", "unit": "u0", "message": "m0", "slot": "0", "text": "Concise evidence" },
    { "op": "delete", "unit": "u1" },
    { "op": "move", "unit": "u3", "before": "u2" },
    { "op": "note", "id": "new:tracker", "text": "TODO: verify", "before": null }
  ]
}
```

Use IDs actually present in your snapshot; slot names can also be `content`, `summary`, `command`, or `output`. Operations run in order; `before: null` means the end. One proposal is allowed per inference boundary. Unknown fields/IDs, stale generations, no-ops and an empty edited conversation are rejected atomically. Keep at least a note when replacing the whole conversation; a document whose own units are empty is rejected even if units it never saw would have been retained. Codemode and subagents are optional, not required.

The tool reports **staged, not yet applied**. Only after validation and next-snapshot publication succeed does the overlay activate; a staged edit that fails that validation is reported in `/clearhead-status` with its reason, and the next context document still holds the unedited content, so the model can verify the outcome by reading it. A `context_edit` call that conflicts with a pending file edit or with a proposal already staged in the same response is rejected by itself: the document, the pending edit and the overlay stay as they were, and the pending edit is validated normally at the next inference. Any rejected `context_edit` call changes nothing; a previously accepted overlay survives it. A complete successful edit-only exchange becomes one compact non-authoritative acceptance receipt in the next input, not in raw history. The receipt explicitly says the `context_edit` step is complete and already applied, and cues the model to continue its substantive task using the edited context without repeating the edit. Mixed parallel exchanges, failed calls, substantive assistant text, and nested calls remain whole; individual signed call arguments are never surgically changed. Later acceptances replace earlier overlay receipts.

Consecutive edit-only proposals are blocked until substantive user/assistant-text/unrelated-tool activity or an explicit reset. A candidate rejected at the next inference clears the overlay, republishes a normal-input document at once so the advertised path stays readable, and **does not clear this loop lock**; a third attempt cannot restart an accept/reject cycle. Explicit reset/session changes and successful native compaction clear it. The extension does not request extra inference calls.

## Editing contract

The UTF-8 JSON document is `CONTEXT.json` in a private temporary directory. It represents the editable conversation at this extension's hook, **not the complete provider request**.

- Keep `format`, `generation`, `revision`, source IDs, message roles, read-only descriptors, and text-slot structure unchanged. Generation and existing IDs remain stable through append-only calls, which advance `revision`; accepted document changes and resets rotate the generation and restart it.
- Replace text values freely, including the latest user instruction. Use an empty string to remove a slot's text.
- Delete/reorder whole source units. A tool exchange contains its assistant call message and **all** corresponding results, including parallel calls; keep its internal structure/order intact. Whole-document replacement deletes only omitted units that already existed at the written document's `revision`; units published since that revision were never seen by the writer and are kept after the written units, in their original order. So a document read in one call and written back in a later call cannot silently drop the activity that happened in between.
- Insert non-authoritative notes, for example `{ "kind": "note", "id": "new:tracker", "text": "TODO: verify the result" }`. IDs after `new:` use letters, digits, underscores, or dashes and must be unique.
- Notes become ordinary source units in the next snapshot. They reach the provider as user-role text, never as system authority.
- Context growth is allowed. Plain text without the document structure, role changes, invented tool activity, duplicate keys/IDs, old generations, revisions never published, and modified descriptors are rejected.

See [the accepted design](design.md) and [editing UX spec #5](https://github.com/yasuhito/clearhead/issues/5) for the complete contract. No code was copied from pi-clm.

At the **next context boundary**, the extension parses and validates the candidate, appends new conversation activity, and publishes the next snapshot before activating it. The tool exchange performing a file edit is newly appended activity; that candidate cannot retroactively remove it. The dedicated tool's complete edit-only exchange is eligible for the receipt projection described above. No tool is re-executed.

An invalid/stale/unreadable/unpublishable candidate discards **both draft and overlay** and sends normal input, with a visible reason. Self-editing remains active; subsequent boundaries attempt a fresh normal-input baseline. The last known reason remains visible in status until a new edit or reset supersedes it. Persistent filesystem failures can prevent further edits; Reset followed by `/clearhead`, or fixing local access may be necessary.

## Resets and limitations

- The overlay is not saved. Reload, resume, fork/new/session replacement, branch navigation, explicit reset, and shutdown discard it. Runtime replacement starts inactive; branch navigation and successful native compaction retain active editing with a fresh baseline.
- Pi's manual and automatic compaction stay enabled. They summarize Pi's canonical session context, **not this overlay**. Successful compaction resets it; failure/cancellation alone does not, unless the input baseline changed.
- Restart/reset/compaction can reintroduce deleted material. These experiments mix native summarization and self-editing; they are **not pure self-editing benchmarks**.
- Latest user instructions are editable. Accidental or injection-induced **loss of intent** is an accepted risk. Original logs are not a protection against forgetting or disobeying an omitted instruction.
- System prompts and tool declarations remain Pi-owned. Tool identities/arguments, images, and opaque thinking/signature metadata are preserved. Structural preservation does not imply universal vendor acceptance of edited signed histories.
- Fallback can restore a much larger input. There is no overflow manager or guarantee that input fits the model window. Smaller input can invalidate prefix caches and does not prove lower compute.
- Storage uses directory 0700/file 0600, no-follow regular-file checks, and atomic snapshot publication. These are Unix-local checks, not a sandbox against the model or same-user processes. Crash/forced termination can leave sensitive temporary files; no sweeper/archive is provided.
- Existing remote/container tools may not see the local document. No remote bridge exists. Subsequent context-changing extensions can alter the final provider input; no third-party coordination is supplied.
- Tested on Linux with Pi 0.99.2. Other Pi versions, platforms, and live vendor signed replay are unverified.

