import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import type { ContextDocument } from "../src/document.ts";
import { conversation, mirrorPath, runtime, source } from "./runtime.ts";

test("ordinary read then write can edit the observed document across append-only inference boundaries", async () => {
  const rt = await runtime((context, request) => {
    const path = mirrorPath(context);
    if (request === 1)
      return [
        {
          type: "toolCall",
          id: "read-context",
          name: "read",
          arguments: { path },
        },
      ];
    if (request === 2) {
      const result = context.messages.find(
        (m) => m.role === "toolResult" && m.toolCallId === "read-context",
      );
      if (result?.role !== "toolResult" || result.content[0]?.type !== "text")
        throw new Error("Missing public read result");
      const d = JSON.parse(result.content[0].text) as ContextDocument;
      source(d).messages[0]!.texts[0]!.text = "read then write intent";
      return [
        {
          type: "toolCall",
          id: "write-context",
          name: "write",
          arguments: { path, content: JSON.stringify(d) },
        },
      ];
    }
    return [{ type: "text", text: "done" }];
  });
  try {
    await rt.session.prompt("/clearhead on");
    await rt.session.prompt("original read-write intent");
    expect(conversation(rt.requests[2]!)[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "read then write intent" }],
    });
    expect(JSON.stringify(conversation(rt.requests[2]!))).toContain(
      "write-context",
    );
    // The written document predates the read exchange: a unit the writer
    // never saw is retained rather than treated as a deletion.
    expect(JSON.stringify(conversation(rt.requests[2]!))).toContain(
      "read-context",
    );
    expect(await readFile(rt.session.sessionFile!, "utf8")).toContain(
      "original read-write intent",
    );
  } finally {
    await rt.close();
  }
});
