import { writeFile } from "node:fs/promises";
import { Type } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import {
  conversation,
  document,
  mirrorPath,
  runtime,
  source,
  sources,
} from "./runtime.ts";

async function exchanges() {
  const executed: string[] = [];
  const rt = await runtime(
    (_context, request) => {
      if (request === 1 || request === 2) {
        const labels = request === 1 ? ["A", "B"] : ["C"];
        return [
          {
            type: "thinking",
            thinking: "opaque reasoning",
            thinkingSignature: "opaque-signature",
          },
          ...labels.map((label) => ({
            type: "toolCall" as const,
            id: `call-${label}`,
            name: "probe",
            arguments: { label },
            thoughtSignature: "opaque-call-signature",
          })),
        ];
      }
      return [{ type: "text", text: "done" }];
    },
    [
      (pi) =>
        pi.registerTool({
          name: "probe",
          label: "Probe",
          description: "Test boundary",
          parameters: Type.Object({ label: Type.String() }),
          execute: async (_id, args) => {
            executed.push(args.label);
            return {
              content: [
                { type: "text", text: `long result ${args.label}` },
                { type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
              ],
              details: undefined,
            };
          },
        }),
    ],
  );
  await rt.session.prompt("/clearhead on");
  await rt.session.prompt("use probes");
  return { ...rt, executed, path: mirrorPath(rt.requests[2]!) };
}

test("shortens textual results in complete parallel exchanges while retaining opaque structured content", async () => {
  const rt = await exchanges();
  try {
    const d = await document(rt.path);
    const exchange = sources(d).find(
      (u) => u.messages[0]?.role === "assistant" && u.messages.length === 3,
    )!;
    expect(exchange).toBeDefined();
    expect(exchange.messages.map((m) => m.role)).toEqual([
      "assistant",
      "toolResult",
      "toolResult",
    ]);
    exchange.messages[1]!.texts[0]!.text = "short A";
    await writeFile(rt.path, JSON.stringify(d));
    await rt.session.prompt("continue");
    const messages = conversation(rt.requests[3]!);
    expect(
      messages.find(
        (m) => m.role === "toolResult" && m.toolCallId === "call-A",
      ),
    ).toMatchObject({
      content: [
        { type: "text", text: "short A" },
        { type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
      ],
    });
    expect(messages.find((m) => m.role === "assistant")).toMatchObject({
      content: [
        { type: "thinking", thinkingSignature: "opaque-signature" },
        {
          type: "toolCall",
          id: "call-A",
          name: "probe",
          arguments: { label: "A" },
          thoughtSignature: "opaque-call-signature",
        },
        { type: "toolCall", id: "call-B" },
      ],
    });
    expect(rt.executed.sort()).toEqual(["A", "B", "C"]);
    expect(JSON.stringify(rt.manager.getBranch())).toContain("long result A");
  } finally {
    await rt.close();
  }
});

test("reorders then deletes complete exchanges without losing new activity or rerunning tools", async () => {
  const rt = await exchanges();
  try {
    const d = await document(rt.path);
    const units = sources(d).filter((u) =>
      u.messages[0]?.readOnly.blocks.some((b) => b.type === "toolCall"),
    );
    expect(units).toHaveLength(2);
    d.units = [d.units[0]!, ...units.reverse()];
    await writeFile(rt.path, JSON.stringify(d));
    await rt.session.prompt("reordered");
    const calls = conversation(rt.requests[3]!)
      .filter((m) => m.role === "toolResult")
      .map((m) => m.toolCallId);
    expect(calls[0]).toBe("call-C");
    expect(new Set(calls)).toEqual(new Set(["call-A", "call-B", "call-C"]));
    const next = await document(rt.path);
    next.units = next.units.filter(
      (u) =>
        u.kind !== "source" ||
        !u.messages.some((m) => m.readOnly.toolCallId === "call-A"),
    );
    await writeFile(rt.path, JSON.stringify(next));
    await rt.session.prompt("new activity");
    const input = JSON.stringify(conversation(rt.requests[4]!));
    expect(input).not.toContain("call-A");
    expect(input).not.toContain("call-B");
    expect(input).toContain("call-C");
    expect(input).toContain("new activity");
    expect(rt.executed.sort()).toEqual(["A", "B", "C"]);
  } finally {
    await rt.close();
  }
});

test("rejects deletion of just one parallel result without repairing or flattening the exchange", async () => {
  const rt = await exchanges();
  try {
    const d = await document(rt.path);
    const unit = sources(d).find((u) => u.messages.length === 3)!;
    expect(unit).toBeDefined();
    unit.messages.pop();
    source(d).messages[0]!.texts[0]!.text = "invalid partial change";
    await writeFile(rt.path, JSON.stringify(d));
    await rt.session.prompt("continue");
    const input = JSON.stringify(conversation(rt.requests[3]!));
    expect(input).toContain("use probes");
    expect(input).toContain("call-A");
    expect(input).toContain("call-B");
    expect(input).not.toContain("invalid partial change");
  } finally {
    await rt.close();
  }
});
