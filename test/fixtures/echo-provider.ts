import {
  type AssistantMessage,
  createAssistantMessageEventStream,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
      const message: AssistantMessage = {
        role: "assistant",
        api: model.api,
        provider: model.provider,
        model: model.id,
        content: [
          {
            type: "text",
            text: JSON.stringify(
              context.messages.filter((m) => m.role === "user"),
            ),
          },
        ],
        timestamp: Date.now(),
        stopReason: "stop",
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
      stream.push({ type: "done", reason: "stop", message });
      stream.end();
      return stream;
    },
  });
}
