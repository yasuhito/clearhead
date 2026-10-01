import { writeFile } from "node:fs/promises";
import { expect, test } from "vitest";
import type { ContextDocument } from "../src/document.ts";
import {
  conversation,
  document,
  done,
  mirrorPath,
  reportsDuring,
  runtime,
  source,
  sources,
} from "./runtime.ts";

test("writing back an older revision deletes only units the writer saw and keeps later ones", async () => {
  let seen: ContextDocument | undefined;
  const rt = await runtime(async (context, request) => {
    const path = mirrorPath(context);
    if (request === 2 || request === 3) {
      // Read at the first revision; both read exchanges are published after it.
      seen ??= await document(path);
      return [
        {
          type: "toolCall",
          id: `peek-${request}`,
          name: "read",
          arguments: { path },
        },
      ];
    }
    if (request === 4) {
      const current = await document(path);
      expect(current.revision).toBeGreaterThan(seen!.revision);
      expect(sources(current).length).toBe(sources(seen!).length + 2);
      const stale = structuredClone(seen!);
      stale.units.splice(0, 1); // Delete the first exchange, which the writer did see.
      return [
        {
          type: "toolCall",
          id: "stale-write",
          name: "write",
          arguments: { path, content: JSON.stringify(stale) },
        },
      ];
    }
    return done;
  });
  try {
    await rt.session.prompt("/clearhead");
    await rt.session.prompt("obsolete first");
    await rt.session.prompt("second with peek");
    const input = conversation(rt.requests[4]!);
    // The deleted exchange is gone as a unit; its text may still appear
    // inside the retained read result, which quotes the whole document.
    expect(input.filter((m) => m.role === "user")).toEqual([
      expect.objectContaining({
        content: [{ type: "text", text: "second with peek" }],
      }),
    ]);
    // Unseen units follow everything the writer arranged, in original order.
    const ids = input
      .filter((m) => m.role === "toolResult")
      .map((m) => m.toolCallId);
    expect(ids).toEqual(["peek-2", "peek-3", "stale-write"]);
  } finally {
    await rt.close();
  }
});

test("a revision the extension never published is rejected atomically", async () => {
  const rt = await runtime();
  try {
    await rt.session.prompt("/clearhead");
    await rt.session.prompt("original intent");
    const path = mirrorPath(rt.requests[0]!);
    const d = await document(path);
    expect(d.revision).toBe(1);
    source(d).messages[0]!.texts[0]!.text = "edited intent";
    d.revision = 99;
    await writeFile(path, JSON.stringify(d));
    await rt.session.prompt("append");
    expect(conversation(rt.requests[1]!)[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "original intent" }],
    });
    const republished = await document(mirrorPath(rt.requests[1]!));
    expect(republished.revision).toBe(1);
    expect(republished.generation).not.toBe(d.generation);
  } finally {
    await rt.close();
  }
});

test("append-only inferences advance the revision while keeping the generation", async () => {
  const published: ContextDocument[] = [];
  const rt = await runtime(async (context) => {
    published.push(await document(mirrorPath(context)));
    return done;
  });
  try {
    await rt.session.prompt("/clearhead");
    await rt.session.prompt("first");
    await rt.session.prompt("second");
    const [first, second] = published;
    expect(second!.generation).toBe(first!.generation);
    expect(second!.revision).toBe(first!.revision + 1);
  } finally {
    await rt.close();
  }
});

test("an older revision that writes no units at all is still an empty edit and is rejected", async () => {
  let seen: ContextDocument | undefined;
  const rt = await runtime(async (context, request) => {
    const path = mirrorPath(context);
    if (request === 2) {
      seen = await document(path);
      return [
        { type: "toolCall", id: "peek", name: "read", arguments: { path } },
      ];
    }
    if (request === 3)
      return [
        {
          type: "toolCall",
          id: "wipe",
          name: "write",
          arguments: {
            path,
            content: JSON.stringify({ ...seen!, units: [] }),
          },
        },
      ];
    return done;
  });
  try {
    await rt.session.prompt("/clearhead");
    await rt.session.prompt("first");
    const reports = await reportsDuring(() => rt.session.prompt("second"));
    expect(reports).toContain("rejected: empty effective context");
    expect(conversation(rt.requests[3]!)[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "first" }],
    });
  } finally {
    await rt.close();
  }
});
