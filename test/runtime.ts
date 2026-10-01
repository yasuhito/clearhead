import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
  getCurrentSystemPrompt,
  InMemoryCredentialStore,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createAgentSessionRuntime,
  DefaultResourceLoader,
  type ExtensionFactory,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

import type { ContextDocument, SourceUnit } from "../src/document.ts";

export function sources(d: ContextDocument): SourceUnit[] {
  return d.units.filter((unit) => unit.kind === "source");
}
export function source(d: ContextDocument, index = 0): SourceUnit {
  const value = sources(d)[index];
  if (!value) throw new Error("Missing source unit");
  return value;
}

type BoundaryReply = AssistantMessage["content"] | { error: string };
export type Reply = (
  context: TranscriptContext,
  request: number,
) => BoundaryReply | Promise<BoundaryReply>;
export async function runtime(
  reply: Reply = () => [{ type: "text", text: "done" }],
  extra: ExtensionFactory[] = [],
  settings = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "tidy-test-"));
  const requests: TranscriptContext[] = [];
  const errors: string[] = [];
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
    ...settings,
  });
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    modelsStorePath: join(dir, "models-cache.json"),
    refreshOnCreate: false,
  });
  modelRuntime.registerProvider("tidy-test", {
    api: "tidy-test-api",
    baseUrl: "https://deterministic.invalid",
    apiKey: "test-only-not-a-secret",
    models: [
      {
        id: "deterministic",
        name: "Deterministic",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
    streamSimple: (model, context) => {
      const stream = createAssistantMessageEventStream();
      const request = requests.push(structuredClone(context));
      void (async () => {
        try {
          const response = await reply(context, request);
          const content = Array.isArray(response) ? response : [];
          const message: AssistantMessage = {
            role: "assistant",
            content,
            api: model.api,
            provider: model.provider,
            model: model.id,
            timestamp: Date.now(),
            stopReason: !Array.isArray(response)
              ? "error"
              : content.some((c) => c.type === "toolCall")
                ? "toolUse"
                : "stop",
            ...(!Array.isArray(response)
              ? { errorMessage: response.error }
              : {}),
            usage: {
              input: 10,
              output: 1,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 11,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
              },
            },
          };
          stream.push({
            type: "start",
            partial: { ...message, stopReason: "pending" },
          });
          if (message.stopReason === "error")
            stream.push({ type: "error", reason: "error", error: message });
          else
            stream.push({
              type: "done",
              reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
              message,
            });
          stream.end();
        } catch (error) {
          errors.push(String(error));
          const failure: AssistantMessage = {
            role: "assistant",
            content: [],
            api: model.api,
            provider: model.provider,
            model: model.id,
            timestamp: Date.now(),
            stopReason: "error",
            errorMessage: "test boundary failure",
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
              },
            },
          };
          stream.push({ type: "error", reason: "error", error: failure });
          stream.end();
        }
      })();
      return stream;
    },
  });
  const model = modelRuntime.getModel("tidy-test", "deterministic");
  if (!model) throw new Error("Missing test model");
  const host = await createAgentSessionRuntime(
    async (options) => {
      const loader = new DefaultResourceLoader({
        cwd: options.cwd,
        agentDir: options.agentDir,
        settingsManager,
        additionalExtensionPaths: [resolve("index.ts")],
        extensionFactories: extra,
        noSkills: true,
        noContextFiles: true,
        noPromptTemplates: true,
        noThemes: true,
      });
      await loader.reload();
      const loadErrors = loader.getExtensions().errors;
      if (loadErrors.length) throw new Error(JSON.stringify(loadErrors));
      const result = await createAgentSession({
        ...options,
        modelRuntime,
        model,
        settingsManager,
        resourceLoader: loader,
      });
      await result.session.bindExtensions({
        mode: "print",
        onError: (error) => errors.push(error.error),
      });
      return {
        ...result,
        services: {
          cwd: options.cwd,
          agentDir: options.agentDir,
          modelRuntime,
          settingsManager,
          resourceLoader: loader,
          diagnostics: [],
        },
        diagnostics: [],
      };
    },
    {
      cwd: dir,
      agentDir: join(dir, "agent"),
      sessionManager: SessionManager.create(dir, join(dir, "sessions")),
    },
  );
  return {
    get session() {
      return host.session;
    },
    get manager() {
      return host.session.sessionManager;
    },
    host,
    requests,
    errors,
    dir,
    async close() {
      await host.dispose();
      await rm(dir, { recursive: true, force: true });
      if (errors.length) throw new Error(errors.join("\n"));
    },
  };
}
export function mirrorPath(context: TranscriptContext): string {
  const match = getCurrentSystemPrompt(context.messages).match(
    /Context document: (.+)/,
  );
  if (!match?.[1]) throw new Error("No context document guideline");
  return match[1];
}
export async function document(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as ContextDocument;
}
export function conversation(context: TranscriptContext) {
  return context.messages.filter((m) => m.role !== "system");
}
export const done = [{ type: "text" as const, text: "done" }];
export function contextEditCall(
  id: string,
  d: ContextDocument,
  text: string,
): AssistantMessage["content"][number] {
  const u = source(d);
  const m = u.messages[0]!;
  return {
    type: "toolCall",
    id,
    name: "context_edit",
    arguments: {
      generation: d.generation,
      operations: [
        {
          op: "replace",
          unit: u.id,
          message: m.id,
          slot: m.texts[0]!.slot,
          text,
        },
      ],
    },
  };
}
export function toolResults(rt: { manager: SessionManager }) {
  return rt.manager
    .getEntries()
    .flatMap((entry) =>
      entry.type === "message" && entry.message.role === "toolResult"
        ? [entry.message]
        : [],
    );
}
// Print mode reports status on stderr; capture it around one action.
export async function reportsDuring(action: () => Promise<unknown>) {
  const lines: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    await action();
  } finally {
    process.stderr.write = original;
  }
  return lines.join("");
}
