import { writeFile } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  conversation,
  document,
  mirrorPath,
  runtime,
  source,
} from "./runtime.ts";

test("a provider retry with the same source prefix preserves the overlay without duplicating new activity", async () => {
  const rt = await runtime(
    (_context, request) =>
      request === 3
        ? { error: "503 service unavailable" }
        : [{ type: "text", text: "done" }],
    [],
    { retry: { enabled: true, maxRetries: 1, baseDelayMs: 1 } },
  );
  try {
    await rt.session.prompt("/context-tidy on");
    await rt.session.prompt("original intent");
    const path = mirrorPath(rt.requests[0]!);
    const d = await document(path);
    source(d).messages[0]!.texts[0]!.text = "working intent";
    await writeFile(path, JSON.stringify(d));
    await rt.session.prompt("append");
    await rt.session.prompt("retry input");
    expect(rt.requests).toHaveLength(4);
    const users = conversation(rt.requests[3]!).filter(
      (m) => m.role === "user",
    );
    expect(JSON.stringify(users)).toContain("working intent");
    expect(JSON.stringify(users)).not.toContain("original intent");
    expect(
      users.filter((m) => JSON.stringify(m.content).includes("retry input")),
    ).toHaveLength(1);
  } finally {
    await rt.close();
  }
});
