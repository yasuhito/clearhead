import { access, writeFile } from "node:fs/promises";
import { getCurrentSystemPrompt } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import {
  conversation,
  document,
  mirrorPath,
  runtime,
  source,
} from "./runtime.ts";

async function overlay(
  extra: Parameters<typeof runtime>[1] = [],
  settings = {},
  reply?: Parameters<typeof runtime>[0],
) {
  const rt = await runtime(reply, extra, settings);
  await rt.session.prompt("/clearhead");
  await rt.session.prompt("original intent");
  const path = mirrorPath(rt.requests[0]!);
  const d = await document(path);
  source(d).messages[0]!.texts[0]!.text = "working intent";
  await writeFile(path, JSON.stringify(d));
  await rt.session.prompt("append");
  expect(JSON.stringify(conversation(rt.requests[1]!))).toContain(
    "working intent",
  );
  return { rt, path };
}

test("branch navigation discards overlay and pending draft without disabling ON", async () => {
  const { rt, path } = await overlay();
  try {
    const target = rt.manager
      .getBranch()
      .find((e) => e.type === "message" && e.message.role === "assistant");
    expect(target).toBeDefined();
    await rt.session.navigateTree(target!.id, { summarize: false });
    await expect(access(path)).rejects.toThrow();
    await rt.session.prompt("branch continuation");
    expect(JSON.stringify(conversation(rt.requests[2]!))).toContain(
      "original intent",
    );
    expect(JSON.stringify(conversation(rt.requests[2]!))).not.toContain(
      "working intent",
    );
    expect(getCurrentSystemPrompt(rt.requests[2]!.messages)).toContain(
      "Context document:",
    );
  } finally {
    await rt.close();
  }
});

test.each(["reload", "resume", "new", "fork"] as const)(
  "%s resets state to OFF and removes the mirror",
  async (action) => {
    const { rt, path } = await overlay();
    try {
      const sessionFile = rt.session.sessionFile!;
      if (action === "reload") await rt.session.reload();
      if (action === "resume") await rt.host.switchSession(sessionFile);
      if (action === "new") await rt.host.newSession();
      if (action === "fork") {
        const original = rt.manager
          .getBranch()
          .find((e) => e.type === "message" && e.message.role === "user");
        await rt.host.fork(original!.id, { position: "at" });
      }
      await expect(access(path)).rejects.toThrow();
      await rt.session.prompt("fresh request");
      expect(getCurrentSystemPrompt(rt.requests[2]!.messages)).not.toContain(
        "Context document:",
      );
      expect(JSON.stringify(conversation(rt.requests[2]!))).not.toContain(
        "working intent",
      );
      if (action !== "new")
        expect(JSON.stringify(conversation(rt.requests[2]!))).toContain(
          "original intent",
        );
    } finally {
      await rt.close();
    }
  },
);

test("successful native manual compaction summarizes normal history and immediately clears the mirror", async () => {
  const { rt, path } = await overlay([], {
    compaction: { enabled: false, keepRecentTokens: 0, reserveTokens: 2048 },
  });
  try {
    await rt.session.compact();
    expect(JSON.stringify(rt.requests[2])).toContain("original intent");
    expect(JSON.stringify(rt.requests[2])).not.toContain("working intent");
    expect(rt.manager.getBranch().some((e) => e.type === "compaction")).toBe(
      true,
    );
    await expect(access(path)).rejects.toThrow();
    await rt.session.prompt("after compaction");
    const request = rt.requests.at(-1)!;
    expect(getCurrentSystemPrompt(request.messages)).toContain(
      "Context document:",
    );
    expect(JSON.stringify(conversation(request))).not.toContain(
      "working intent",
    );
    expect((await document(mirrorPath(request))).generation).toBeTruthy();
  } finally {
    await rt.close();
  }
});

test("cancelled native compaction alone retains an otherwise valid overlay", async () => {
  const { rt, path } = await overlay(
    [
      (pi) => {
        pi.on("session_before_compact", () => ({ cancel: true }));
      },
    ],
    {
      compaction: { enabled: false, keepRecentTokens: 0, reserveTokens: 2048 },
    },
  );
  try {
    await expect(rt.session.compact()).rejects.toThrow("Compaction cancelled");
    await access(path);
    await rt.session.prompt("continue after cancellation");
    expect(JSON.stringify(conversation(rt.requests[2]!))).toContain(
      "working intent",
    );
  } finally {
    await rt.close();
  }
});

test("failed native summarization leaves a valid overlay intact", async () => {
  const { rt, path } = await overlay(
    [],
    {
      compaction: { enabled: false, keepRecentTokens: 0, reserveTokens: 2048 },
    },
    (_context, request) =>
      request === 3
        ? { error: "test summary failure" }
        : [{ type: "text", text: "done" }],
  );
  try {
    await expect(rt.session.compact()).rejects.toThrow();
    await access(path);
    expect(rt.manager.getBranch().some((e) => e.type === "compaction")).toBe(
      false,
    );
    await rt.session.prompt("continue after summary failure");
    expect(JSON.stringify(conversation(rt.requests.at(-1)!))).toContain(
      "working intent",
    );
  } finally {
    await rt.close();
  }
});

test("non-append Pi-native context edits invalidate the overlay", async () => {
  const { rt } = await overlay();
  try {
    const original = rt.manager
      .getBranch()
      .find((e) => e.type === "message" && e.message.role === "user");
    rt.manager.appendContextEdit(original!.id, { content: "host edit" });
    await rt.session.prompt("changed baseline");
    const input = JSON.stringify(conversation(rt.requests[2]!));
    expect(input).toContain("host edit");
    expect(input).not.toContain("working intent");
  } finally {
    await rt.close();
  }
});
