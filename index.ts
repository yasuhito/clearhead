import { isDeepStrictEqual } from "node:util";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  apply,
  type Message,
  RejectedEdit,
  type Snapshot,
  snapshot,
} from "./src/document.ts";
import { Mirror } from "./src/mirror.ts";

export default function contextTidy(pi: ExtensionAPI) {
  const mirror = new Mirror();
  let enabled = false;
  let baseline: Message[] | undefined;
  let current: Snapshot | undefined;
  let overlay = false;
  let outcome = "normal input";
  function discardOverlay() {
    baseline = undefined;
    current = undefined;
    overlay = false;
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
        `Context document: ${mirror.path}\nEdit this private JSON using existing read/edit/write/bash tools. Keep format, generation, IDs, roles, descriptors and text slots intact. Delete/reorder whole units, replace only text values, or insert {kind: "note", id: "new:unique-label", text: "..."}. Edits apply to the next inference and accumulate until reset. Tool exchanges must stay complete. Latest user instructions are editable with risk of losing intent. Invalid edits discard the overlay and restore normal input.`,
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
        const next = apply(await mirror.read(), current);
        changed = !isDeepStrictEqual(
          next,
          [...current.originals.values()].flat(),
        );
        effective = [...next, ...event.messages.slice(baseline.length)];
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
      discardOverlay();
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
