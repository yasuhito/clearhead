# Context Self-Editing

pi-context-tidy explores model-directed changes to the conversation the model receives, while retaining the original conversation record.

## Language

**Session history**:
The original record of messages and tool activity, including material no longer present in model input.
_Avoid_: Live context, edited transcript

**Normal input**:
The conversation Pi would supply for an inference without pi-context-tidy's edits.

**Effective context**:
The conversation supplied for inference after accepted self-edits, distinct from session history.
_Avoid_: Session history, compressed session

**Working-context overlay**:
The cumulative accepted edits used to derive effective context while incorporating new conversation activity. It changes what the model sees, not the original session history.
_Avoid_: Rewritten log, one-shot filter

**Self-edit**:
A model-authored change that deletes, shortens, or reorganizes material in its effective context.
_Avoid_: Native compaction, log rewrite

**Context document**:
The editable representation of the working context at a particular snapshot, distinct from both session history and the complete provider input.
_Avoid_: Session file, complete prompt

**Edit proposal**:
A model-authored change to a context document awaiting acceptance or rejection; it is not yet part of effective context.

**Context note**:
Model-authored working-memory text inserted into effective context, without system authority.
_Avoid_: System instruction, fabricated user request

**Tool exchange**:
An assistant's tool calls together with their corresponding results, including parallel calls in the same assistant message.
