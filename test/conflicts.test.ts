import { writeFile } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  conversation,
  document,
  done,
  mirrorPath,
  contextEditCall as replaceCall,
  reportsDuring,
  runtime,
  source,
  toolResults,
} from "./runtime.ts";

test("a dedicated call yields to a pending file edit, which is validated and applied later", async () => {
  const r = await runtime(async (context, request) => {
    if (request !== 1) return done;
    const path = mirrorPath(context);
    const d = await document(path);
    const draft = structuredClone(d);
    source(draft).messages[0]!.texts[0]!.text = "file edited intent";
    await writeFile(path, JSON.stringify(draft));
    return [replaceCall("tool-after-file", d, "tool edited intent")];
  });
  try {
    await r.session.prompt("/context-tidy on");
    await r.session.prompt("original intent");
    const rejected = toolResults(r).find(
      (m) => m.toolCallId === "tool-after-file",
    );
    expect(rejected).toMatchObject({ isError: true });
    expect(JSON.stringify(rejected)).toContain("file edit pending");
    const input = JSON.stringify(conversation(r.requests[1]!));
    expect(conversation(r.requests[1]!)[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "file edited intent" }],
    });
    // The rejected call stays in raw history as a whole exchange; only the
    // user unit shows which edit won.
    expect(input).not.toContain("Context edit accepted");
    expect(input).toContain("tool-after-file");
  } finally {
    await r.close();
  }
});

test("a second dedicated call in one response is rejected alone while the first stays staged", async () => {
  const r = await runtime(async (context, request) => {
    if (request !== 1) return done;
    const d = await document(mirrorPath(context));
    return [
      replaceCall("first-proposal", d, "first proposal"),
      replaceCall("second-proposal", d, "second proposal"),
    ];
  });
  try {
    await r.session.prompt("/context-tidy on");
    await r.session.prompt("original intent");
    const first = toolResults(r).find((m) => m.toolCallId === "first-proposal");
    const second = toolResults(r).find(
      (m) => m.toolCallId === "second-proposal",
    );
    expect(first).toMatchObject({ isError: false });
    expect(JSON.stringify(first)).toContain("not yet applied");
    expect(second).toMatchObject({ isError: true });
    expect(JSON.stringify(second)).toContain("proposal already pending");
    const messages = conversation(r.requests[1]!);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "first proposal" }],
    });
    expect(JSON.stringify(messages)).not.toContain("Context edit accepted");
    expect(
      messages
        .filter((m) => m.role === "toolResult")
        .map((m) => m.toolCallId)
        .sort(),
    ).toEqual(["first-proposal", "second-proposal"]);
  } finally {
    await r.close();
  }
});

test("a rejected dedicated call leaves a previously accepted overlay in place", async () => {
  const r = await runtime(async (context, request) => {
    if (request !== 1 && request !== 3) return done;
    const d = await document(mirrorPath(context));
    return [
      replaceCall(
        `attempt-${request}`,
        request === 3 ? { ...d, generation: "stale" } : d,
        "short",
      ),
    ];
  });
  try {
    await r.session.prompt("/context-tidy on");
    await r.session.prompt("original intent");
    await r.session.prompt("new user activity");
    expect(
      toolResults(r).find((m) => m.toolCallId === "attempt-3"),
    ).toMatchObject({
      isError: true,
    });
    const input = JSON.stringify(conversation(r.requests[3]!));
    expect(input).toContain("short");
    expect(input).not.toContain("original intent");
    expect(input).toContain("attempt-3");
  } finally {
    await r.close();
  }
});

test("a boundary rejection republishes a readable normal-input document for the same inference", async () => {
  let observed = "";
  const r = await runtime(async (context, request) => {
    if (request === 2) {
      const d = await document(mirrorPath(context));
      observed = JSON.stringify(d);
      expect(d.units.length).toBeGreaterThan(0);
    }
    return done;
  });
  try {
    await r.session.prompt("/context-tidy on");
    await r.session.prompt("original intent");
    await writeFile(mirrorPath(r.requests[0]!), "not json");
    await r.session.prompt("after rejection");
    expect(observed).toContain("original intent");
    expect(observed).toContain("after rejection");
    expect(JSON.stringify(conversation(r.requests[1]!))).toContain(
      "original intent",
    );
  } finally {
    await r.close();
  }
});

test("a later acceptance replaces the earlier overlay receipt instead of accumulating receipts", async () => {
  const r = await runtime(async (context, request) => {
    if (request !== 1 && request !== 3) return done;
    const d = await document(mirrorPath(context));
    return [replaceCall(`edit-${request}`, d, `edited-${request}`)];
  });
  try {
    await r.session.prompt("/context-tidy on");
    await r.session.prompt("original intent");
    await r.session.prompt("new user activity");
    const input = JSON.stringify(conversation(r.requests[3]!));
    expect(input).toContain("edited-3");
    expect(input.split("Context edit accepted").length - 1).toBe(1);
  } finally {
    await r.close();
  }
});

test("a staged proposal rejected at the next inference reports its reason in the status", async () => {
  let path = "";
  const r = await runtime(
    async (context, request) => {
      if (request !== 1) return done;
      path = mirrorPath(context);
      const d = await document(path);
      return [replaceCall("doomed", d, "staged text")];
    },
    [
      (pi) => {
        pi.on("tool_result", async (event) => {
          if (event.toolName === "context_edit") {
            const d = await document(path);
            source(d).messages[0]!.texts[0]!.text = "tampered after staging";
            await writeFile(path, JSON.stringify(d));
          }
        });
      },
    ],
  );
  try {
    await r.session.prompt("/context-tidy on");
    const reports = await reportsDuring(() =>
      r.session.prompt("original intent"),
    );
    expect(reports).toContain("rejected: staged proposal changed");
    expect(reports).toContain("restored normal input");
    expect(JSON.stringify(toolResults(r))).toContain("not yet applied");
    expect(conversation(r.requests[1]!)[0]).toMatchObject({
      content: [{ type: "text", text: "original intent" }],
    });
  } finally {
    await r.close();
  }
});
