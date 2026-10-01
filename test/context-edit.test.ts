import { getCurrentSystemPrompt } from "@earendil-works/pi-ai";
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
    await r.session.prompt("/clearhead on");
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
    const nextInput = JSON.stringify(conversation(r.requests[1]!));
    expect(nextInput).toContain("Context edit accepted");
    expect(nextInput).toContain(
      "context_edit step is complete and already applied",
    );
    expect(nextInput).toContain(
      "Continue your substantive task using the edited context",
    );
    expect(nextInput).toContain("do not repeat this edit");
    const guideline = getCurrentSystemPrompt(r.requests[1]!.messages);
    expect(guideline).toContain(
      "An acceptance receipt means the context_edit step is complete and already applied",
    );
    expect(guideline).toContain(
      "continue your substantive task using the edited context",
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
    await r.session.prompt("/clearhead on");
    await r.session.prompt("original evidence");
    // The locked re-edit attempts are rejected alone; the first accepted edit
    // and its single receipt remain, and no new receipt is minted.
    for (const index of [2, 3]) {
      const input = JSON.stringify(conversation(r.requests[index]!));
      expect(input).toContain("edited-1");
      expect(input).not.toContain("original evidence");
      expect(input.split("Context edit accepted").length - 1).toBe(1);
    }
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
  } finally {
    await r.close();
  }
});

test("schema-invalid dedicated calls are rejected alone and keep a previously accepted overlay", async () => {
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
    await r.session.prompt("/clearhead on");
    await r.session.prompt("original intent");
    await r.session.prompt("new user activity");
    const input = JSON.stringify(conversation(r.requests[3]!));
    expect(input).toContain("short");
    expect(input).not.toContain("original intent");
    expect(
      conversation(r.requests[3]!).find(
        (m) => m.role === "toolResult" && m.toolCallId === "schema-3",
      ),
    ).toMatchObject({ isError: true });
  } finally {
    await r.close();
  }
});
