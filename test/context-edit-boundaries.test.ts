import { readFile, symlink, unlink, writeFile } from "node:fs/promises";
import {
  type AssistantMessage,
  type JsonObject,
  Type,
} from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import {
  conversation,
  document,
  done,
  mirrorPath,
  runtime,
  source,
} from "./runtime.ts";

test("dedicated edits cannot overwrite duplicate-key legacy drafts before strict validation", async () => {
  const r = await runtime(async (context, request) => {
    if (request !== 1) return done;
    const path = mirrorPath(context);
    const d = await document(path);
    const u = source(d);
    await writeFile(
      path,
      JSON.stringify(d).replace(
        '{"format":',
        '{"format":"clearhead/v1","format":',
      ),
    );
    return [
      {
        type: "toolCall",
        id: "duplicate-draft",
        name: "context_edit",
        arguments: {
          generation: d.generation,
          operations: [
            {
              op: "replace",
              unit: u.id,
              message: u.messages[0]!.id,
              slot: u.messages[0]!.texts[0]!.slot,
              text: "must not overwrite invalid draft",
            },
          ],
        },
      },
    ];
  });
  try {
    await r.session.prompt("/clearhead on");
    await r.session.prompt("original evidence");
    expect(conversation(r.requests[1]!)[0]).toMatchObject({
      content: [{ type: "text", text: "original evidence" }],
    });
    expect(
      conversation(r.requests[1]!).find((m) => m.role === "toolResult"),
    ).toMatchObject({ isError: true });
    expect(JSON.stringify(conversation(r.requests[1]!))).not.toContain(
      "Context edit accepted",
    );
  } finally {
    await r.close();
  }
});

test("a staged proposal changed before acceptance cannot receive a receipt", async () => {
  let path = "";
  const r = await runtime(
    async (context, request) => {
      if (request !== 1) return done;
      path = mirrorPath(context);
      const d = await document(path);
      const u = source(d);
      return [
        {
          type: "toolCall",
          id: "tampered",
          name: "context_edit",
          arguments: {
            generation: d.generation,
            operations: [
              {
                op: "replace",
                unit: u.id,
                message: u.messages[0]!.id,
                slot: u.messages[0]!.texts[0]!.slot,
                text: "staged text",
              },
            ],
          },
        },
      ];
    },
    [
      (pi) => {
        pi.on("tool_result", async (event) => {
          if (event.toolName === "context_edit") {
            const d = await document(path);
            source(d).messages[0]!.texts[0]!.text = "different proposal";
            await writeFile(path, JSON.stringify(d));
          }
        });
      },
    ],
  );
  try {
    await r.session.prompt("/clearhead on");
    await r.session.prompt("original evidence");
    expect(conversation(r.requests[1]!)[0]).toMatchObject({
      content: [{ type: "text", text: "original evidence" }],
    });
    expect(JSON.stringify(conversation(r.requests[1]!))).not.toContain(
      "Context edit accepted",
    );
  } finally {
    await r.close();
  }
});

test("mixed parallel exchange keeps every signed call and result after accepting edits", async () => {
  const r = await runtime(
    async (context, request): Promise<AssistantMessage["content"]> => {
      if (request !== 1) return done;
      const d = await document(mirrorPath(context));
      const u = source(d);
      return [
        {
          type: "thinking",
          thinking: "opaque",
          thinkingSignature: "thinking-signature",
        },
        {
          type: "toolCall",
          id: "mixed-edit",
          name: "context_edit",
          thoughtSignature: "edit-signature",
          arguments: {
            generation: d.generation,
            operations: [
              {
                op: "replace",
                unit: u.id,
                message: u.messages[0]!.id,
                slot: u.messages[0]!.texts[0]!.slot,
                text: "short",
              },
            ],
          },
        },
        {
          type: "toolCall",
          id: "sibling",
          name: "probe",
          thoughtSignature: "sibling-signature",
          arguments: { evidence: "unchanged signed arguments" },
        },
      ];
    },
    [
      (pi) =>
        pi.registerTool({
          name: "probe",
          label: "Probe",
          description: "Boundary probe",
          parameters: Type.Object({ evidence: Type.String() }),
          async execute() {
            return {
              content: [{ type: "text", text: "unrelated result" }],
              details: undefined,
            };
          },
        }),
    ],
  );
  try {
    await r.session.prompt("/clearhead on");
    await r.session.prompt("long evidence");
    const messages = conversation(r.requests[1]!);
    const raw = r.manager
      .getEntries()
      .find(
        (entry) =>
          entry.type === "message" && entry.message.role === "assistant",
      );
    expect(
      raw?.type === "message" && messages.find((m) => m.role === "assistant"),
    ).toEqual(raw?.type === "message" ? raw.message : undefined);
    expect(
      messages
        .filter((m) => m.role === "toolResult")
        .map((m) => m.toolCallId)
        .sort(),
    ).toEqual(["mixed-edit", "sibling"]);
    expect(JSON.stringify(messages)).toContain("unrelated result");
    expect(JSON.stringify(messages)).not.toContain("Context edit accepted");
    expect(JSON.stringify(messages)).not.toContain("long evidence");
  } finally {
    await r.close();
  }
});

test("ordered delete, move and note operations accumulate and preserve the raw JSONL prefix", async () => {
  const r = await runtime(
    async (context, request): Promise<AssistantMessage["content"]> => {
      if (request !== 3) return done;
      const d = await document(mirrorPath(context));
      return [
        {
          type: "toolCall",
          id: "organize",
          name: "context_edit",
          arguments: {
            generation: d.generation,
            operations: [
              { op: "delete", unit: source(d, 0).id },
              { op: "move", unit: source(d, 2).id, before: source(d, 1).id },
              {
                op: "note",
                id: "new:memory",
                text: "working memory",
                before: null,
              },
            ],
          },
        },
      ];
    },
  );
  try {
    await r.session.prompt("/clearhead on");
    await r.session.prompt("obsolete evidence");
    await r.session.prompt("second evidence");
    const saved = await readFile(r.session.sessionFile!, "utf8");
    await r.session.prompt("organize evidence");
    const input = conversation(r.requests[3]!);
    expect(input[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "second evidence" }],
    });
    expect(input[1]).toMatchObject({ role: "assistant", content: done });
    expect(JSON.stringify(input)).not.toContain("obsolete evidence");
    expect(JSON.stringify(input)).toContain("working memory");
    expect(JSON.stringify(input)).toContain("Context edit accepted");
    expect(
      (await readFile(r.session.sessionFile!, "utf8")).startsWith(saved),
    ).toBe(true);
    await r.session.prompt("later activity");
    expect(JSON.stringify(conversation(r.requests[4]!))).toContain(
      "working memory",
    );
    expect(JSON.stringify(conversation(r.requests[4]!))).not.toContain(
      "obsolete evidence",
    );
    await r.session.prompt("/clearhead off");
    await r.session.prompt("reset activity");
    expect(JSON.stringify(conversation(r.requests[5]!))).toContain(
      "obsolete evidence",
    );
    expect(JSON.stringify(conversation(r.requests[5]!))).not.toContain(
      "Context edit accepted",
    );
  } finally {
    await r.close();
  }
});

test.each([
  "stale",
  "unit",
  "message",
  "slot",
  "before",
  "no-op",
  "empty",
  "note-id",
])(
  "%s proposals fail atomically and retain the failed complete exchange",
  async (failure) => {
    const r = await runtime(async (context, request) => {
      if (request !== 1) return done;
      const d = await document(mirrorPath(context));
      const u = source(d);
      const m = u.messages[0]!;
      const replace = {
        op: "replace",
        unit: u.id,
        message: m.id,
        slot: m.texts[0]!.slot,
        text: "partial change must not apply",
      };
      const bad: JsonObject =
        failure === "unit"
          ? { ...replace, unit: "unknown" }
          : failure === "message"
            ? { ...replace, message: "unknown" }
            : failure === "slot"
              ? { ...replace, slot: "unknown" }
              : failure === "before"
                ? { op: "move", unit: u.id, before: "unknown" }
                : failure === "no-op"
                  ? { ...replace, text: m.texts[0]!.text }
                  : failure === "empty"
                    ? { op: "delete", unit: u.id }
                    : failure === "note-id"
                      ? {
                          op: "note",
                          id: "invented-source",
                          text: "invalid authority",
                          before: null,
                        }
                      : replace;
      return [
        {
          type: "toolCall",
          id: "failed-edit",
          name: "context_edit",
          arguments: {
            generation: failure === "stale" ? "stale" : d.generation,
            operations:
              failure === "no-op" || failure === "empty"
                ? [bad]
                : [replace, bad],
          },
        },
      ];
    });
    try {
      await r.session.prompt("/clearhead on");
      await r.session.prompt("original evidence");
      const input = conversation(r.requests[1]!);
      expect(input[0]).toMatchObject({
        role: "user",
        content: [{ type: "text", text: "original evidence" }],
      });
      expect(input.find((m) => m.role === "toolResult")).toMatchObject({
        toolCallId: "failed-edit",
        isError: true,
      });
      expect(JSON.stringify(input)).not.toContain("Context edit accepted");
    } finally {
      await r.close();
    }
  },
);

test("publication failure after staging restores normal input without an acceptance receipt", async () => {
  let path = "";
  const r = await runtime(
    async (context, request) => {
      if (request !== 1) return done;
      path = mirrorPath(context);
      const d = await document(path);
      const u = source(d);
      return [
        {
          type: "toolCall",
          id: "publication-failure",
          name: "context_edit",
          arguments: {
            generation: d.generation,
            operations: [
              {
                op: "replace",
                unit: u.id,
                message: u.messages[0]!.id,
                slot: u.messages[0]!.texts[0]!.slot,
                text: "not activated",
              },
            ],
          },
        },
      ];
    },
    [
      (pi) => {
        pi.on("tool_result", async (event) => {
          if (event.toolName === "context_edit" && !event.isError) {
            await unlink(path);
            await symlink("missing-target", path);
          }
        });
      },
    ],
  );
  try {
    await r.session.prompt("/clearhead on");
    await r.session.prompt("original evidence");
    const input = conversation(r.requests[1]!);
    expect(input[0]).toMatchObject({
      content: [{ type: "text", text: "original evidence" }],
    });
    expect(JSON.stringify(input)).not.toContain("Context edit accepted");
    expect(input.find((m) => m.role === "toolResult")).toMatchObject({
      toolCallId: "publication-failure",
    });
  } finally {
    await r.close();
  }
});
