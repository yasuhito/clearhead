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
import { Mirror } from "./src/mirror.ts";
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
  function report(ctx: ExtensionContext, reason: string, warning = false) {
    outcome = reason;
    if (ctx.mode === "tui")
      ctx.ui.setStatus(
        "context-tidy",
        `tidy ${enabled ? "ON" : "OFF"}${overlay ? " overlay" : " normal"}`,
      );
    const text = `context-tidy ${enabled ? "ON" : "OFF"}; ${overlay ? "overlay" : "normal input"}; ${reason}${mirror.path ? `; document: ${mirror.path}` : ""}`;
    if (ctx.hasUI) ctx.ui.notify(text, warning ? "warning" : "info");
    else process.stderr.write(`${text}\n`);
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
        const raw = await mirror.read();
        apply(raw, current); // Validate legacy drafts before a dedicated tool can overwrite them.
        if (!isDeepStrictEqual(JSON.parse(raw), current.document))
          throw new RejectedEdit("document already modified");
        const candidate = proposal(params, current);
        snapshot(apply(JSON.stringify(candidate), current));
        await mirror.publish(candidate);
        pending = { callId: toolCallId, document: candidate };
        return {
          content: [
            {
              type: "text",
              text: "Context edit staged; acceptance pending next inference.",
            },
          ],
          details: undefined,
        };
      } catch (error) {
        discardOverlay(false);
        await mirror.clear().catch(() => undefined);
        report(
          ctx,
          `rejected: ${error instanceof RejectedEdit ? error.message : "mirror I/O or unsupported input"}; restored normal input`,
          true,
        );
        return {
          content: [
            {
              type: "text",
              text: "Context edit rejected; normal input restored. Read the next snapshot before retrying.",
            },
          ],
          details: undefined,
          isError: true,
        };
      }
    },
  });
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode === "tui") ctx.ui.setStatus("context-tidy", "tidy OFF normal");
  });
  pi.registerCommand("context-tidy", {
    description: "Context self-editing: on, off, status",
    handler: async (args, ctx) => {
      await ctx.waitForIdle();
      if (args.trim() === "on") {
        if (!enabled) {
          try {
            await mirror.create();
            enabled = true;
            outcome = "awaiting normal-input baseline";
          } catch {
            report(ctx, "cannot enable: mirror creation failed", true);
            return;
          }
        }
        report(ctx, outcome);
      } else if (args.trim() === "off") {
        enabled = false;
        discardOverlay();
        try {
          await mirror.remove();
          report(ctx, "reset: OFF");
        } catch {
          report(ctx, "reset: OFF; mirror cleanup failed", true);
        }
      } else
        report(
          ctx,
          args.trim() === "status"
            ? outcome
            : "usage: /context-tidy on|off|status",
        );
    },
  });
  pi.on("before_agent_start", (event) => {
    if (enabled && mirror.path)
      event.systemPromptOptions.promptGuidelines.push(
        `Context document: ${mirror.path}\nRead this snapshot for generation and unit/message/slot IDs. Prefer context_edit with short replace/delete/move/note operations; no old text, full document, Python or another model is needed. before:null means end; note IDs use new:unique-label. Submit one proposal per inference. Acceptance follows validation and publication at the next inference and accumulates until reset. A successful complete edit-only exchange becomes a non-authoritative receipt in effective context only; mixed/failed exchanges and raw logs stay whole. Do not re-edit a receipt: consecutive edit-only proposals remain blocked even after rejection until substantive activity or reset. Legacy JSON file edits remain supported: preserve format, generation, IDs, roles, descriptors and text slots; edit text or whole units only. Latest user instructions are editable with risk of losing intent. Invalid edits discard the overlay and restore normal input.`,
      );
  });
  pi.on("context", async (event, ctx) => {
    if (!enabled) return;
    try {
      let effective = event.messages;
      let changed = false;
      if (baseline && current) {
        if (
          event.messages
            .slice(baseline.length)
            .some(
              (message) =>
                message.role === "toolResult" &&
                message.toolName === "context_edit" &&
                message.isError,
            )
        )
          throw new RejectedEdit("dedicated edit tool failed");
        if (
          !isDeepStrictEqual(event.messages.slice(0, baseline.length), baseline)
        )
          throw new RejectedEdit("source prefix changed");
        const raw = await mirror.read();
        const next = apply(raw, current);
        if (pending && !isDeepStrictEqual(JSON.parse(raw), pending.document))
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
      const nextSnapshot = snapshot(effective);
      // Reading the document itself appends a tool exchange. Keep its generation
      // usable across append-only calls so an ordinary read -> write can work.
      if (current && !changed)
        nextSnapshot.document.generation = current.document.generation;
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
      if (ctx.mode === "tui")
        ctx.ui.setStatus(
          "context-tidy",
          `tidy ON ${overlay ? "overlay" : "normal"}`,
        );
      return { messages: effective };
    } catch (error) {
      discardOverlay(false);
      await mirror.clear().catch(() => undefined);
      const reason =
        error instanceof RejectedEdit
          ? error.message
          : "mirror I/O or unsupported input";
      report(ctx, `rejected: ${reason}; restored normal input`, true);
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
      process.stderr.write("context-tidy: shutdown mirror cleanup failed\n");
    }
  });
}
