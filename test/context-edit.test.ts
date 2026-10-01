import { expect, test } from "vitest";
import {
  conversation,
  document,
  mirrorPath,
  runtime,
  source,
} from "./runtime.ts";

test("same parent model replaces a slot using IDs without reproducing old text", async () => {
  const r = await runtime(async (context, request) => {
    if (request !== 1) return [{ type: "text", text: "done" }];
    const d = await document(mirrorPath(context));
    const u = source(d);
    const m = u.messages[0]!;
    return [
      {
        type: "toolCall",
        id: "edit-short",
        name: "context_edit",
        arguments: {
          generation: d.generation,
          operations: [
            {
              op: "replace",
              unit: u.id,
              message: m.id,
              slot: m.texts[0]!.slot,
              text: "brief evidence",
            },
          ],
        },
      },
    ];
  });
  try {
    await r.session.prompt("/context-tidy on");
    await r.session.prompt("verbose evidence ".repeat(100));
    expect(JSON.stringify(conversation(r.requests[1]!))).toContain(
      "brief evidence",
    );
    expect(JSON.stringify(conversation(r.requests[1]!))).not.toContain(
      "verbose evidence",
    );
    expect(JSON.stringify(r.manager.getEntries())).toContain(
      "verbose evidence",
    );
    expect(
      conversation(r.requests[1]!).some((m) => m.role === "assistant"),
    ).toBe(false);
    expect(JSON.stringify(conversation(r.requests[1]!))).toContain(
      "Context edit accepted",
    );
    expect(JSON.stringify(conversation(r.requests[1]!)).length).toBeLessThan(
      500,
    );
    expect(JSON.stringify(r.requests[1]!).length).toBeLessThan(
      JSON.stringify(r.requests[0]!).length,
    );
    expect(JSON.stringify(r.manager.getEntries())).toContain("edit-short");
  } finally {
    await r.close();
  }
});

test("consecutive edit-only receipts cannot induce a re-edit loop", async () => {
  const r = await runtime(async (context, request) => {
    if (request > 3) return [{ type: "text", text: "done" }];
    const d = await document(mirrorPath(context));
    const u = source(d);
    const m = u.messages[0]!;
    return [
      {
        type: "toolCall",
        id: `loop-${request}`,
        name: "context_edit",
        arguments: {
          generation: d.generation,
          operations: [
            {
              op: "replace",
              unit: u.id,
              message: m.id,
              slot: m.texts[0]!.slot,
              text: `edited-${request}`,
            },
          ],
        },
      },
    ];
  });
  try {
    await r.session.prompt("/context-tidy on");
    await r.session.prompt("original evidence");
    expect(JSON.stringify(conversation(r.requests[2]!))).toContain(
      "original evidence",
    );
    expect(JSON.stringify(conversation(r.requests[2]!))).not.toContain(
      "Context edit accepted",
    );
    const results = r.manager
      .getEntries()
      .filter(
        (entry) =>
          entry.type === "message" && entry.message.role === "toolResult",
      );
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.objectContaining({
            toolCallId: "loop-2",
            isError: true,
          }),
        }),
        expect.objectContaining({
          message: expect.objectContaining({
            toolCallId: "loop-3",
            isError: true,
          }),
        }),
      ]),
    );
    expect(JSON.stringify(conversation(r.requests[3]!))).toContain(
      "original evidence",
    );
    expect(JSON.stringify(conversation(r.requests[3]!))).not.toContain(
      "Context edit accepted",
    );
  } finally {
    await r.close();
  }
});

test("schema-invalid dedicated calls discard a previously accepted overlay", async () => {
  const r = await runtime(async (context, request) => {
    if (request !== 1 && request !== 3) return [{ type: "text", text: "done" }];
    const d = await document(mirrorPath(context));
    const u = source(d);
    const m = u.messages[0]!;
    return [
      {
        type: "toolCall",
        id: `schema-${request}`,
        name: "context_edit",
        arguments: {
          generation: d.generation,
          operations: [
            {
              op: "replace",
              unit: u.id,
              message: m.id,
              slot: m.texts[0]!.slot,
              text: "short",
              ...(request === 3 ? { role: "system" } : {}),
            },
          ],
        },
      },
    ];
  });
  try {
    await r.session.prompt("/context-tidy on");
    await r.session.prompt("original intent");
    await r.session.prompt("new user activity");
    const input = JSON.stringify(conversation(r.requests[3]!));
    expect(input).toContain("original intent");
    expect(input).not.toContain("Context edit accepted");
  } finally {
    await r.close();
  }
});
