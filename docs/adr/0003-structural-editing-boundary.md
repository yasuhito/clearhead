---
status: accepted
---

# Free textual editing inside a preserved message structure

Allow text replacements and new non-authoritative context notes, including growing summaries, TODOs, and tables. Reject role changes, new system messages, and fabricated structured tool activity. A deterministic JSON context document provides editable text slots and read-only structural descriptors; original message objects retain non-text content and metadata in memory.

Preserve tool call IDs, names, arguments, images, and opaque thinking/signature metadata. Tool-result text is editable, but deletion/reordering operates only on complete tool exchanges, including all parallel calls and results. Reject incomplete exchanges atomically instead of silently repairing or flattening them. These restrictions prioritize inspectable, structurally consistent Pi inputs over the paper's unrestricted editing surface; they are project decisions, not paper requirements.

Validate at the next context boundary before publishing a new mirror, append intervening conversation activity, and reject stale baselines. Invalid candidates discard both draft and overlay and fall back to normal input with a visible reason, rather than retaining the previous overlay. This fail-open-to-Pi behavior can reintroduce much larger context and user intent previously omitted by the model; it does not guarantee successful inference or semantic fidelity.
