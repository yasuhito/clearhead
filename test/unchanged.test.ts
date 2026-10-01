import { readFile, writeFile } from "node:fs/promises";
import { getCurrentTools } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import {
  conversation,
  document,
  mirrorPath,
  runtime,
  source,
} from "./runtime.ts";

test("unchanged documents preserve Pi system/tool transitions instead of forcing a checkpoint", async () => {
  const rt = await runtime();
  try {
    await rt.session.prompt("normal start");
    await rt.session.prompt("/clearhead");
    await rt.session.prompt("first ON request");
    const before = rt.requests[1]!;
    expect(
      before.messages.filter((m) => m.role === "system").length,
    ).toBeGreaterThan(1);
    await rt.session.prompt("unchanged document");
    expect(rt.requests[2]!.messages.filter((m) => m.role === "system")).toEqual(
      before.messages.filter((m) => m.role === "system"),
    );
    expect(
      getCurrentTools(rt.requests[2]!.messages).map((t) => t.name),
    ).toEqual(getCurrentTools(before.messages).map((t) => t.name));
  } finally {
    await rt.close();
  }
});

test("unchanged snapshots retain user images and empty text replacements without altering saved entries", async () => {
  const rt = await runtime();
  try {
    await rt.session.prompt("/clearhead");
    await rt.session.prompt("image instruction", {
      images: [
        {
          type: "image",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
          mimeType: "image/png",
        },
      ],
    });
    const saved = await readFile(rt.session.sessionFile!, "utf8");
    const path = mirrorPath(rt.requests[0]!);
    const d = await document(path);
    source(d).messages[0]!.texts[0]!.text = "";
    await writeFile(path, JSON.stringify(d));
    await rt.session.prompt("continue");
    expect(conversation(rt.requests[1]!)[0]).toMatchObject({
      content: [
        { type: "text", text: "" },
        {
          type: "image",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
          mimeType: "image/png",
        },
      ],
    });
    expect(
      (await readFile(rt.session.sessionFile!, "utf8")).startsWith(saved),
    ).toBe(true);
  } finally {
    await rt.close();
  }
});
