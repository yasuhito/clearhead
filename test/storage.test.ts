import {
  access,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import {
  conversation,
  document,
  mirrorPath,
  runtime,
  source,
} from "./runtime.ts";

test.each(["symlink", "directory", "missing", "publication"] as const)(
  "%s mirror failure discards the candidate and returns normal input",
  async (failure) => {
    const rt = await runtime();
    try {
      await rt.session.prompt("/clearhead");
      await rt.session.prompt("original");
      const path = mirrorPath(rt.requests[0]!);
      const d = await document(path);
      source(d).messages[0]!.texts[0]!.text = "edited";
      await writeFile(path, JSON.stringify(d));
      const external = join(rt.dir, "external.json");
      await writeFile(external, JSON.stringify(d));
      if (failure !== "publication") await rm(path);
      if (failure === "symlink") await symlink(external, path);
      if (failure === "directory") await mkdir(path);
      if (failure === "publication")
        await rm(dirname(path), { recursive: true });
      await rt.session.prompt("after failure");
      expect(JSON.stringify(conversation(rt.requests[1]!))).toContain(
        "original",
      );
      expect(JSON.stringify(conversation(rt.requests[1]!))).not.toContain(
        '"text":"edited"',
      );
      expect(await readFile(external, "utf8")).toBe(JSON.stringify(d));
      if (failure === "publication") {
        await rt.session.prompt("recover baseline");
        expect((await document(path)).format).toBe("clearhead/v1");
      }
    } finally {
      await rt.close();
    }
  },
);

test("mirror is private, atomic snapshots leave no staging data, and OFF/shutdown remove it", async () => {
  const rt = await runtime();
  let path: string;
  try {
    await rt.session.prompt("/clearhead");
    await rt.session.prompt("private data");
    path = mirrorPath(rt.requests[0]!);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
    await rt.session.prompt("/clearhead-reset");
    await expect(access(dirname(path))).rejects.toThrow();
    await rt.session.prompt("/clearhead");
    await rt.session.prompt("private again");
    path = mirrorPath(rt.requests[1]!);
  } finally {
    await rt.close();
  }
  await expect(access(dirname(path!))).rejects.toThrow();
});
