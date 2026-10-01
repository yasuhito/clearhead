---
status: accepted
---

# Editable document with an ephemeral overlay

Use a private editable context document with a dedicated snapshot-scoped editing tool; retain existing file/Bash editing for compatibility. Validate the parsed candidate atomically before applying it; build independently without copying pi-clm code.

Amended for editing UX: the original ordinary-tools-only decision forced long scripts or reproduction of read-only document data. A small replace/delete/move/note vocabulary preserves free textual editing while reducing edit traffic. The same parent model authors the proposal; codemode and subagents are not prerequisites.

V1 keeps its cumulative overlay only in memory. Reload/resume, branch change, session replacement, and OFF discard it, so restarting can reintroduce original material. Durable branch-aware checkpoints would support interrupted experiments but add persistence and restoration machinery outside this version's scope.

Retain native manual/automatic compaction and reset the overlay after successful compaction. Pi summarizes its canonical session context rather than this overlay, so deleted information can reappear. This trades experimental purity for a smaller independent integration: experiments mix native summarization and self-editing and must not be described as pure self-editing benchmarks. Token reduction remains optional.
