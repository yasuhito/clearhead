import { writeFile } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  conversation,
  document,
  mirrorPath,
  runtime,
  source,
} from "./runtime.ts";

test("native threshold compaction remains enabled and resets a cumulative overlay", async () => {
  const rt = await runtime(undefined, [], {
    compaction: { enabled: false, keepRecentTokens: 0, reserveTokens: 127999 },
  });
  try {
    await rt.session.prompt("/context-tidy on");
    await rt.session.prompt("original information");
    const path = mirrorPath(rt.requests[0]!);
    const d = await document(path);
    source(d).messages[0]!.texts[0]!.text = "overlay information";
    await writeFile(path, JSON.stringify(d));
    await rt.session.prompt("append");
    expect(JSON.stringify(conversation(rt.requests[1]!))).toContain(
      "overlay information",
    );
    rt.session.settingsManager.setCompactionEnabled(true);
    await rt.session.prompt("threshold check");
    expect(rt.manager.getBranch().some((e) => e.type === "compaction")).toBe(
      true,
    );
    expect(
      rt.requests
        .slice(2)
        .some((c) => JSON.stringify(c).includes("original information")),
    ).toBe(true);
    const finalInput = JSON.stringify(conversation(rt.requests.at(-1)!));
    expect(finalInput).not.toContain("overlay information");
    expect(finalInput).toContain("threshold check");
    expect(rt.session.settingsManager.getCompactionEnabled()).toBe(true);
  } finally {
    await rt.close();
  }
});
