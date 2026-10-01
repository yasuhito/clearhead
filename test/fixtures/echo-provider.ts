import { readFileSync } from "node:fs";
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
  getCurrentSystemPrompt,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ContextDocument } from "../../src/document.ts";

// Deterministic boundary provider. No network or credential access.
export default function echoProvider(pi: ExtensionAPI) {
  pi.registerProvider("tidy-echo", {
    api: "tidy-echo-api",
    baseUrl: "https://deterministic.invalid",
    apiKey: "test-only-not-a-secret",
    models: [
      {
        id: "echo",
        name: "Echo",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
    streamSimple(model, context) {
      const stream = createAssistantMessageEventStream();
      let content: AssistantMessage["content"] = [
        {
          type: "text",
          text: JSON.stringify(
            context.messages.filter((m) => m.role === "user"),
          ),
        },
      ];
      const latest = context.messages.findLast((m) => m.role === "user");
      if (JSON.stringify(latest).includes("TIDY_EDIT_ME")) {
        const path = getCurrentSystemPrompt(context.messages).match(
          /Context document: (.+)/,
        )?.[1];
        if (!path) throw new Error("Missing mirror guideline");
        const d: ContextDocument = JSON.parse(readFileSync(path, "utf8"));
        const unit = d.units.findLast(
          (u) =>
            u.kind === "source" && u.messages.some((m) => m.role === "user"),
        );
        if (unit?.kind !== "source")
          throw new Error("Missing editable user unit");
        const message = unit.messages[0]!;
        content = [
          {
            type: "toolCall",
            id: "cli-context-edit",
            name: "context_edit",
            arguments: {
              generation: d.generation,
              operations: [
                {
                  op: "replace",
                  unit: unit.id,
                  message: message.id,
                  slot: message.texts[0]!.slot,
                  text: "CLI brief evidence",
                },
              ],
            },
          },
        ];
      }
      const message: AssistantMessage = {
        role: "assistant",
        api: model.api,
        provider: model.provider,
        model: model.id,
        content,
        timestamp: Date.now(),
        stopReason: content.some((block) => block.type === "toolCall")
          ? "toolUse"
          : "stop",
        usage: {
          input: 10,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 11,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      stream.push({
        type: "start",
        partial: { ...message, stopReason: "pending" },
      });
      stream.push({
        type: "done",
        reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
        message,
      });
      stream.end();
      return stream;
    },
  });
}
