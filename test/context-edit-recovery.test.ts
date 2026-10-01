import { expect, test } from "vitest";
import {
  conversation,
  document,
  mirrorPath,
  runtime,
  source,
} from "./runtime.ts";

test("native deletion of older exchanges cannot hide fresh user activity from the loop guard", async () => {
  const r = await runtime(async (context, request) => {
    if ([1, 3, 5].includes(request))
      return [
        {
          type: "toolCall",
          id: `old-${request}`,
          name: "bash",
          arguments: { command: "printf old-result" },
        },
      ];
    if (request === 7 || request === 10) {
      const d = await document(mirrorPath(context));
      const u = source(d);
      const m = u.messages[0]!;
      return [
        {
          type: "toolCall",
          id: `recovery-${request}`,
          name: "context_edit",
          arguments: {
            generation: d.generation,
            operations: [
              {
                op: "replace",
                unit: u.id,
                message: m.id,
                slot: m.texts[0]!.slot,
                text: request === 7 ? "accepted short" : "freshly edited",
              },
            ],
          },
        },
      ];
    }
    // No substantive text after acceptance: the lock must really be released by fresh user activity.
    return request === 8 || request === 9
      ? []
      : [{ type: "text", text: "done" }];
  });
  try {
    await r.session.prompt("/context-tidy on");
    for (const prompt of ["old first", "old second", "old third"])
      await r.session.prompt(prompt);
    await r.session.prompt("accept dedicated edit");
    expect(JSON.stringify(conversation(r.requests[7]!))).toContain(
      "Context edit accepted",
    );
    const old = r.manager
      .getEntries()
      .filter(
        (entry) => entry.type === "message" && entry.message.role !== "system",
      )
      .slice(0, 8);
    expect(old).toHaveLength(8);
    for (const entry of old) r.manager.appendContextEdit(entry.id, null);
    // This inference falls back on the changed prefix; the following one gets a fresh mirror.
    await r.session.prompt("fresh user after native deletion");
    expect(JSON.stringify(conversation(r.requests[8]!))).not.toContain(
      "Context edit accepted",
    );
    await r.session.prompt("edit fresh snapshot");
    expect(conversation(r.requests[10]!)[0]).toMatchObject({
      content: [{ type: "text", text: "freshly edited" }],
    });
    expect(JSON.stringify(conversation(r.requests[10]!))).toContain(
      "Context edit accepted",
    );
    expect(r.manager.getEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.objectContaining({
            toolCallId: "recovery-10",
            isError: false,
          }),
        }),
      ]),
    );
  } finally {
    await r.close();
  }
});
