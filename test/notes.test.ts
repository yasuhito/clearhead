import { writeFile } from "node:fs/promises";
import { getCurrentSystemPrompt } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import {
  conversation,
  document,
  mirrorPath,
  runtime,
  sources,
} from "./runtime.ts";

test("latest user intent is editable and growing notes are non-authoritative request-local memory", async () => {
  const rt = await runtime();
  try {
    await rt.session.prompt("/clearhead on");
    await rt.session.prompt("latest user intent");
    const path = mirrorPath(rt.requests[0]!);
    const d = await document(path);
    const user = sources(d).findLast((u) => u.messages[0]?.role === "user")!;
    user.messages[0]!.texts[0]!.text = "model-changed intent";
    const note = `TODO table: ${"working memory ".repeat(1000)}`;
    d.units.push({ kind: "note", id: "new:tracker", text: note });
    await writeFile(path, JSON.stringify(d));
    await rt.session.prompt("continue");
    expect(
      conversation(rt.requests[1]!).some(
        (m) => m.role === "user" && JSON.stringify(m.content).includes(note),
      ),
    ).toBe(true);
    expect(getCurrentSystemPrompt(rt.requests[1]!.messages)).not.toContain(
      note,
    );
    expect(JSON.stringify(conversation(rt.requests[1]!))).not.toContain(
      "latest user intent",
    );
    expect(JSON.stringify(rt.manager.getBranch())).toContain(
      "latest user intent",
    );
    expect(JSON.stringify(rt.manager.getBranch())).not.toContain(note);
    const next = await document(path);
    expect(next.units.every((u) => u.kind === "source")).toBe(true);
    const tracker = sources(next).find((u) =>
      u.messages.some((m) => m.texts.some((t) => t.text === note)),
    )!;
    tracker.messages[0]!.texts[0]!.text = "short tracker";
    await writeFile(path, JSON.stringify(next));
    await rt.session.prompt("continue again");
    expect(JSON.stringify(conversation(rt.requests[2]!))).toContain(
      "short tracker",
    );
    expect(JSON.stringify(conversation(rt.requests[2]!))).not.toContain(note);
  } finally {
    await rt.close();
  }
});
