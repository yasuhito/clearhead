# Clearhead

A Pi extension that lets the LLM edit its own context to keep the next prompt lean.

When a conversation fills up with long documents, tool output, and intermediate work, run `/clearhead`. The same model decides what to keep and what to shorten. Accepted edits are used in subsequent requests while the original session history stays intact.

## Install

Requires Node.js **22.19+** and Pi **0.99.2**. Other Pi versions are not yet verified.

```sh
pi install npm:@yasuhito/clearhead
```

If Pi is already running, use `/reload` afterward, or start a new session.

## Use

Work normally. When the conversation gets long, run:

```text
/clearhead
```

You can specify what to keep:

```text
/clearhead Keep decisions, constraints, file paths, and unfinished tasks.
```

No separate on/off step is needed. The command starts a normal model turn and asks the model to read its context and shorten it with the dedicated `context_edit` tool. You do not need to edit JSON or write a script yourself. Wait until Pi is idle before running it.

| Command | What it does |
| --- | --- |
| `/clearhead [instructions]` | Ask the model to shorten its context, optionally saying what to keep. |
| `/clearhead-status` | Show whether edits are active and the latest acceptance, rejection, or reset. |
| `/clearhead-reset` | Discard Clearhead edits and return to Pi's current normal input. |

The footer is hidden until you use Clearhead. `clearhead ready` means editing is active but no shortened context is applied; `clearhead edited` means accepted edits are applied. An edit can be staged before it is accepted: acceptance happens at the next model request. Check `/clearhead-status` for the outcome.

Reset restores content still present in Pi's current session context. It does not undo Pi's own compaction. You can use `/clearhead` again after a reset.

## Compared with `/compact`

Pi's `/compact` summarizes its session context. `/clearhead` asks the current model to edit the conversation it will receive on subsequent requests, keeping the original session log. Use `/clearhead` when you want to try model-directed shortening; it does not replace or disable Pi's automatic compaction.

## What to expect

- Shortening is a model decision. It may leave the context unchanged if there is nothing safe to remove. There is no automatic schedule or guaranteed token saving; the editing turn itself also costs tokens.
- Summaries can omit useful information, including user instructions. Review important answers and use reset if needed.
- Edits live in memory. Reload, restart, resume, session changes, and successful Pi compaction discard them. Deleted information can reappear afterward.
- Invalid edits fall back to Pi's normal input. This can be larger and exceed the model's context window; Clearhead has no overflow manager.
- Tested on Linux with Pi 0.99.2. Remote tools may not be able to access the local context file; signed-history compatibility across model providers is not guaranteed.

Clearhead is an experimental, independent implementation inspired by [Context Language Models](https://arxiv.org/html/2609.37725v1). See [editing contract and limitations](docs/editing-contract.md) for the protocol and [verification](docs/verification.md) for test evidence.

## Develop locally

```sh
git clone https://github.com/yasuhito/clearhead.git
cd clearhead
npm ci --ignore-scripts
npm run check
pi --extension ./index.ts
```

## License

[MIT](LICENSE).
