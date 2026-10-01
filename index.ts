import { isDeepStrictEqual } from "node:util";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  apply,
  type ContextDocument,
  type Message,
  RejectedEdit,
  type Snapshot,
  snapshot,
} from "./src/document.ts";
import { editParameters, proposal } from "./src/edits.ts";
import { Mirror, serialize } from "./src/mirror.ts";
import { acceptanceProjection, substantiveActivity } from "./src/receipt.ts";

export default function contextTidy(pi: ExtensionAPI) {
  const mirror = new Mirror();
  let enabled = false;
  let baseline: Message[] | undefined;
  let current: Snapshot | undefined;
  let overlay = false;
  let outcome = "normal input";
  let pending: { callId: string; document: ContextDocument } | undefined;
  let editOnlyLocked = false;
  let loopCheckpoint: string | undefined;
  function hasNewActivity(ctx: ExtensionContext) {
    if (!loopCheckpoint) return false;
    // Raw branch IDs survive Pi-native omissions; projected message counts do not.
    const branch = ctx.sessionManager.getBranch();
    const index = branch.findIndex((entry) => entry.id === loopCheckpoint);
    if (index < 0) return false;
    return substantiveActivity(
      branch
        .slice(index + 1)
        .flatMap((entry) => (entry.type === "message" ? [entry.message] : [])),
    );
  }
  function discardOverlay(resetLoop = true) {
    baseline = undefined;
    current = undefined;
    overlay = false;
    pending = undefined;
    if (resetLoop) {
      editOnlyLocked = false;
      loopCheckpoint = undefined;
    }
  }
  function showStatus(ctx: ExtensionContext) {
    if (ctx.mode === "tui")
      ctx.ui.setStatus(
        "clearhead",
        enabled ? `clearhead ${overlay ? "edited" : "ready"}` : undefined,
      );
  }
  function report(ctx: ExtensionContext, reason: string, warning = false) {
    outcome = reason;
    showStatus(ctx);
    const text = `clearhead ${enabled ? "active" : "inactive"}; ${overlay ? "overlay" : "normal input"}${reason === "normal input" ? "" : `; ${reason}`}${mirror.path ? `; document: ${mirror.path}` : ""}`;
    if (ctx.hasUI) ctx.ui.notify(text, warning ? "warning" : "info");
    else process.stderr.write(`${text}\n`);
  }
  function rejectionReason(error: unknown) {
    return error instanceof RejectedEdit
      ? error.message
      : "mirror I/O or unsupported input";
  }
  // An invalid candidate discards draft and overlay together. Normal input is
  // republished at once so the path already advertised for this inference
  // stays readable; only if that fails is the document withdrawn.
  async function fallbackToNormalInput(
    ctx: ExtensionContext,
    error: unknown,
    messages: Message[],
  ) {
    discardOverlay(false);
    let suffix = "";
    try {
      const fresh = snapshot(messages);
      await mirror.publish(fresh.document);
      baseline = structuredClone(messages);
      current = fresh;
    } catch {
      suffix = await mirror.clear().then(
        () => "; document unavailable until the next inference",
        () => "; document unavailable and mirror cleanup failed",
      );
    }
    report(
      ctx,
      `rejected: ${rejectionReason(error)}; restored normal input${suffix}`,
      true,
    );
  }
  pi.registerTool({
    name: "context_edit",
    label: "Context edit",
    description:
      "Stage short snapshot-scoped context edits using generation and unit/message/slot IDs from the context document. Replace text, delete/move whole units, or insert non-authoritative notes. before:null means end. Acceptance occurs at the next inference; raw history stays intact.",
    parameters: editParameters,
    executionMode: "sequential",
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        if (!enabled || !current) throw new RejectedEdit("no active snapshot");
        if (pending) throw new RejectedEdit("proposal already pending");
        if (editOnlyLocked && !hasNewActivity(ctx))
          throw new RejectedEdit("consecutive edit-only proposal");
        // A pending file edit owns the document until the next inference
        // validates it; the dedicated call yields rather than overwriting it.
        if ((await mirror.read()) !== serialize(current.document))
          throw new RejectedEdit("file edit pending");
        const candidate = proposal(params, current);
        snapshot(apply(JSON.stringify(candidate), current));
        await mirror.publish(candidate);
        pending = { callId: toolCallId, document: candidate };
        return {
          content: [
            {
              type: "text",
              text: "Context edit staged, not yet applied. It is validated at the next inference and takes effect only if it passes. The next context document shows the outcome: if it still holds the unedited content, the edit was rejected and the reason is in /clearhead-status.",
            },
          ],
          details: undefined,
        };
      } catch (error) {
        // A rejected call changes nothing: the document, any pending file
        // edit, a staged sibling proposal and the overlay all stay as they were.
        const reason = rejectionReason(error);
        report(ctx, `rejected context_edit: ${reason}; nothing changed`, true);
        return {
          content: [
            {
              type: "text",
              text: `Context edit rejected: ${reason}. The context document, pending edits and overlay are unchanged. Read the current snapshot before retrying.`,
            },
          ],
          details: undefined,
          isError: true,
        };
      }
    },
  });
  pi.on("session_start", (_event, ctx) => showStatus(ctx));
  pi.registerCommand("clearhead-status", {
    description: "Show context editing state and last outcome",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      report(ctx, outcome);
    },
  });
  pi.registerCommand("clearhead-reset", {
    description: "Discard context edits and restore normal Pi input",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      enabled = false;
      discardOverlay();
      try {
        await mirror.remove();
        report(ctx, "reset complete");
      } catch {
        report(ctx, "reset complete; mirror cleanup failed", true);
      }
    },
  });
  pi.registerCommand("clearhead", {
    description:
      "Shorten context now; optional instructions specify what to keep",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        report(ctx, "cannot compact: agent is busy; retry when idle", true);
        return;
      }
      if (!enabled) {
        try {
          await mirror.create();
          enabled = true;
          outcome = "awaiting normal-input baseline";
        } catch {
          report(ctx, "cannot compact: mirror creation failed", true);
          return;
        }
      }
      const instructions = args.trim();
      pi.sendUserMessage(
        `Shorten your effective context now. Read the current context document for its generation and IDs, then use context_edit with short operations. Keep the task, latest user intent, decisions, constraints, unresolved work and exact values still needed. Remove or summarize obsolete long text and tool output. Do not generate Python or reproduce the full JSON document. If nothing can safely be shortened, explain that without submitting a no-op edit. After the next inference applies the edit, use the acceptance receipt or reread the document to verify it, then briefly report what was kept. Do not repeat an already accepted edit. Do not claim a token reduction without measured evidence.${instructions ? `\nAdditional instructions: ${instructions}` : ""}`,
      );
    },
  });
  pi.on("before_agent_start", (event) => {
    if (enabled && mirror.path)
      event.systemPromptOptions.promptGuidelines.push(
        `Context document: ${mirror.path}\nRead this snapshot for generation and unit/message/slot IDs. Prefer context_edit with short replace/delete/move/note operations; no old text, full document, Python or another model is needed. before:null means end; note IDs use new:unique-label. Submit one proposal per inference. Acceptance follows validation and publication at the next inference and accumulates until reset. A successful complete edit-only exchange becomes a non-authoritative receipt in effective context only; mixed/failed exchanges and raw logs stay whole. An acceptance receipt means the context_edit step is complete and already applied: continue your substantive task using the edited context instead of repeating the removed call or reusing its old generation. Consecutive edit-only proposals remain blocked even after rejection until substantive activity or reset. Legacy JSON file edits remain supported: preserve format, generation, revision, IDs, roles, descriptors and text slots; edit text or whole units only. Writing back a document read earlier deletes only units that existed at its revision; units published since then are kept. A context_edit call that conflicts with a pending file edit or an already staged proposal is rejected by itself and changes nothing. Latest user instructions are editable with risk of losing intent. A staged edit is applied only if it passes validation at the next inference; an invalid edit discards the overlay, restores normal input and republishes the document.`,
      );
  });
  pi.on("context", async (event, ctx) => {
    if (!enabled) return;
    try {
      let effective = event.messages;
      let changed = false;
      if (baseline && current) {
        if (
          !isDeepStrictEqual(event.messages.slice(0, baseline.length), baseline)
        )
          throw new RejectedEdit("source prefix changed");
        const raw = await mirror.read();
        const next = apply(raw, current);
        if (pending && raw !== serialize(pending.document))
          throw new RejectedEdit("staged proposal changed");
        changed = !isDeepStrictEqual(
          next,
          [...current.originals.values()].flat(),
        );
        effective = [...next, ...event.messages.slice(baseline.length)];
      }
      let nextLocked = editOnlyLocked;
      if (hasNewActivity(ctx)) nextLocked = false;
      if (changed && pending) {
        const projected = acceptanceProjection(effective, pending.callId);
        effective = projected.messages;
        nextLocked = projected.replaced;
      }
      // Pi uses reference identity to keep its system/tool transitions intact.
      // An unchanged conversation should not force a prompt-cache checkpoint.
      overlay = !isDeepStrictEqual(effective, event.messages);
      if (!overlay) effective = event.messages;
      // Reading the document itself appends a tool exchange. Keep its generation
      // usable across append-only calls so an ordinary read -> write can work.
      const nextSnapshot = snapshot(
        effective,
        current && !changed ? current : undefined,
      );
      await mirror.publish(nextSnapshot.document);
      baseline = structuredClone(event.messages);
      current = nextSnapshot;
      pending = undefined;
      editOnlyLocked = nextLocked;
      if (changed && nextLocked)
        loopCheckpoint = ctx.sessionManager.getLeafId() ?? undefined;
      if (changed) outcome = "accepted self-edit";
      else if (outcome === "awaiting normal-input baseline")
        outcome = "normal-input baseline ready";
      showStatus(ctx);
      return { messages: effective };
    } catch (error) {
      await fallbackToNormalInput(ctx, error, event.messages);
      return { messages: event.messages };
    }
  });
  async function reset(ctx: ExtensionContext, reason: string) {
    discardOverlay();
    if (enabled) {
      try {
        await mirror.clear();
        report(ctx, `reset: ${reason}`);
      } catch {
        report(ctx, `reset: ${reason}; mirror cleanup failed`, true);
      }
    }
  }
  pi.on("session_tree", async (_event, ctx) => reset(ctx, "branch change"));
  pi.on("session_compact", async (_event, ctx) =>
    reset(ctx, "native compaction"),
  );
  pi.on("session_shutdown", async () => {
    enabled = false;
    discardOverlay();
    try {
      await mirror.remove();
    } catch {
      process.stderr.write("clearhead: shutdown mirror cleanup failed\n");
    }
  });
}
