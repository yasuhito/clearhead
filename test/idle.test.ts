import { access } from "node:fs/promises";
import { getCurrentSystemPrompt } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { mirrorPath, runtime } from "./runtime.ts";

test("OFF waits for the active inference to settle before discarding its document", async () => {
  let enter: () => void = () => {};
  let release: () => void = () => {};
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const rt = await runtime(async (_context, request) => {
    if (request === 1) {
      enter();
      await released;
    }
    return [{ type: "text", text: "done" }];
  });
  try {
    await rt.session.prompt("/clearhead");
    const running = rt.session.prompt("slow inference");
    await entered;
    const path = mirrorPath(rt.requests[0]!);
    let offSettled = false;
    const off = rt.session.prompt("/clearhead-reset").then(() => {
      offSettled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(offSettled).toBe(false);
    await access(path);
    release();
    await running;
    await off;
    await expect(access(path)).rejects.toThrow();
    await rt.session.prompt("after OFF");
    expect(getCurrentSystemPrompt(rt.requests[1]!.messages)).not.toContain(
      "Context document:",
    );
  } finally {
    release();
    await rt.close();
  }
});

test("compact refuses an active inference without queuing another model request", async () => {
  let enter: () => void = () => {};
  let release: () => void = () => {};
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const rt = await runtime(async () => {
    enter();
    await released;
    return [{ type: "text", text: "done" }];
  });
  try {
    await rt.session.prompt("/clearhead");
    const running = rt.session.prompt("slow inference");
    await entered;
    await rt.session.prompt("/clearhead");
    release();
    await running;
    expect(rt.requests).toHaveLength(1);
    expect(rt.compactRequests).toHaveLength(1);
    expect(JSON.stringify(rt.manager.getBranch())).not.toContain(
      "Shorten your effective context now",
    );
  } finally {
    release();
    await rt.close();
  }
});
