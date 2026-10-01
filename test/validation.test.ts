import { writeFile } from "node:fs/promises";
import { expect, test } from "vitest";
import type { ContextDocument } from "../src/document.ts";
import {
  conversation,
  document,
  mirrorPath,
  runtime,
  source,
} from "./runtime.ts";

test.each([
  [
    "role changes",
    (d: ContextDocument) => {
      source(d).messages[0]!.role = "system";
    },
  ],
  [
    "duplicate IDs",
    (d: ContextDocument) => {
      d.units.push(d.units[0]!);
    },
  ],
  [
    "unknown IDs",
    (d: ContextDocument) => {
      source(d).id = "u999";
    },
  ],
  [
    "stale generations",
    (d: ContextDocument) => {
      d.generation = "old";
    },
  ],
  [
    "unknown fields",
    (d: ContextDocument) => {
      Object.assign(d, { extra: "bad" });
    },
  ],
  [
    "wrong version",
    (d: ContextDocument) => {
      Object.assign(d, { format: "v2" });
    },
  ],
  [
    "legacy document format",
    (d: ContextDocument) => {
      Object.assign(d, { format: ["pi", "context", "tidy/v1"].join("-") });
    },
  ],
  [
    "changed slots",
    (d: ContextDocument) => {
      source(d).messages[0]!.texts[0]!.slot = "unknown";
    },
  ],
  [
    "changed descriptors",
    (d: ContextDocument) => {
      Object.assign(source(d).messages[0]!, { readOnly: {} });
    },
  ],
  [
    "fabricated note role",
    (d: ContextDocument) => {
      d.units.push(
        Object.assign(
          { kind: "note" as const, id: "new:fake", text: "x" },
          { role: "system" },
        ),
      );
    },
  ],
])(
  "rejects %s atomically and discards an existing overlay",
  async (_name, mutate) => {
    const rt = await runtime();
    try {
      await rt.session.prompt("/clearhead on");
      await rt.session.prompt("original");
      const path = mirrorPath(rt.requests[0]!);
      const d = await document(path);
      source(d).messages[0]!.texts[0]!.text = "overlay";
      await writeFile(path, JSON.stringify(d));
      await rt.session.prompt("append");
      expect(JSON.stringify(conversation(rt.requests[1]!))).not.toContain(
        "original",
      );
      const candidate = await document(path);
      source(candidate).messages[0]!.texts[0]!.text = "partial-invalid-change";
      mutate(candidate);
      await writeFile(path, JSON.stringify(candidate));
      await rt.session.prompt("after rejection");
      const input = JSON.stringify(conversation(rt.requests[2]!));
      expect(input).toContain("original");
      expect(input).not.toContain("overlay");
      expect(input).not.toContain("partial-invalid-change");
    } finally {
      await rt.close();
    }
  },
);

test.each(["{", '{"format":"clearhead/v1","format":"clearhead/v1"}'])(
  "rejects malformed or duplicate-key JSON: %s",
  async (bad) => {
    const rt = await runtime();
    try {
      await rt.session.prompt("/clearhead on");
      await rt.session.prompt("original");
      const path = mirrorPath(rt.requests[0]!);
      const d = await document(path);
      source(d).messages[0]!.texts[0]!.text = "invalid-duplicate-text";
      // Duplicate decoded keys including escaped spellings must not be last-key-wins.
      const raw = bad.startsWith('{"format')
        ? JSON.stringify(d).replace(
            '"format":',
            '"for\\u006dat":"wrong","format":',
          )
        : bad;
      await writeFile(path, raw);
      await rt.session.prompt("continue");
      expect(JSON.stringify(conversation(rt.requests[1]!))).toContain(
        "original",
      );
      expect(JSON.stringify(conversation(rt.requests[1]!))).not.toContain(
        "invalid-duplicate-text",
      );
      // A fresh baseline should be available after the rejected proposal.
      await rt.session.prompt("fresh baseline");
      expect((await document(path)).format).toBe("clearhead/v1");
    } finally {
      await rt.close();
    }
  },
);
