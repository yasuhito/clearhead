import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { RpcClient } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { document, source } from "./runtime.ts";

async function cliFixture() {
  const dir = await mkdtemp(join(tmpdir(), "tidy-cli-"));
  const client = new RpcClient({
    cliPath: resolve(
      "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js",
    ),
    cwd: dir,
    env: { PI_CODING_AGENT_DIR: join(dir, "agent"), PI_OFFLINE: "1" },
    provider: "tidy-echo",
    model: "echo",
    args: [
      "--no-session",
      "--no-extensions",
      "--no-context-files",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "-e",
      resolve("index.ts"),
      "-e",
      resolve("test/fixtures/echo-provider.ts"),
    ],
  });
  let notification = "";
  client.onEvent((event) => {
    if (
      "method" in event &&
      event.method === "notify" &&
      "message" in event &&
      typeof event.message === "string"
    )
      notification = event.message;
  });
  return {
    client,
    dir,
    get notification() {
      return notification;
    },
    async close() {
      await client.stop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("the shipped Pi CLI loads the extension and exposes edited input over RPC without authentication", async () => {
  const fixture = await cliFixture();
  const { client } = fixture;
  try {
    await client.start();
    expect(
      (await client.getCommands()).some((c) => c.name === "context-tidy"),
    ).toBe(true);
    expect(await client.prompt("/context-tidy on")).toBe("handled");
    await client.promptAndWait("original CLI input");
    await client.prompt("/context-tidy status");
    const mirror = fixture.notification.match(/document: (.+)/)?.[1];
    expect(mirror).toBeTruthy();
    const d = await document(mirror!);
    source(d).messages[0]!.texts[0]!.text = "edited CLI input";
    await writeFile(mirror!, JSON.stringify(d));
    await client.promptAndWait("next inference");
    const response = await client.getLastAssistantText();
    expect(response).toContain("edited CLI input");
    expect(response).not.toContain("original CLI input");
    await client.prompt("/context-tidy on");
    await client.prompt("/context-tidy status");
    expect(fixture.notification).toContain("ON; overlay; accepted");
    expect(fixture.notification).toContain(mirror);
    await client.promptAndWait("idempotent ON");
    expect(await client.getLastAssistantText()).toContain("edited CLI input");
    expect(JSON.stringify(await client.getMessages())).toContain(
      "original CLI input",
    );
    expect(await readdir(dirname(mirror!))).toEqual(["CONTEXT.json"]);
    const restored = await document(mirror!);
    source(restored).messages[0]!.texts[0]!.text = "original CLI input";
    await writeFile(mirror!, JSON.stringify(restored));
    await client.promptAndWait("restore original text");
    await client.prompt("/context-tidy status");
    expect(fixture.notification).toContain("ON; normal input; accepted");
    await writeFile(mirror!, "PRIVATE_PAYLOAD_MARKER");
    await client.promptAndWait("invalid candidate");
    await client.prompt("/context-tidy status");
    expect(fixture.notification).toContain(
      "ON; normal input; rejected: malformed JSON",
    );
    expect(fixture.notification).not.toContain("PRIVATE_PAYLOAD_MARKER");
    expect(await client.getLastAssistantText()).toContain("original CLI input");
    await client.promptAndWait("fresh baseline");
    await client.prompt("/context-tidy status");
    expect(fixture.notification).toContain("rejected: malformed JSON");
    await client.prompt("/context-tidy off");
    await expect(access(mirror!)).rejects.toThrow();
  } finally {
    await fixture.close();
  }
}, 20000);

test("packaged CLI executes short dedicated edits and exposes acceptance without losing raw calls", async () => {
  const fixture = await cliFixture();
  const { client } = fixture;
  try {
    await client.start();
    await client.prompt("/context-tidy on");
    await client.promptAndWait("TIDY_EDIT_ME verbose CLI evidence");
    expect(await client.getLastAssistantText()).toContain("CLI brief evidence");
    expect(await client.getLastAssistantText()).toContain(
      "Context edit accepted",
    );
    await client.prompt("/context-tidy status");
    expect(fixture.notification).toContain("ON; overlay; accepted self-edit");
    const raw = JSON.stringify(await client.getMessages());
    expect(raw).toContain("TIDY_EDIT_ME verbose CLI evidence");
    expect(raw).toContain("context_edit");
    expect(
      (await client.getMessages()).some((message) => message.role === "custom"),
    ).toBe(false);
  } finally {
    await fixture.close();
  }
}, 20000);

test("OFF detaches replaced mirror ownership and ON creates usable private storage without touching the replacement", async () => {
  const fixture = await cliFixture();
  const { client, dir } = fixture;
  let replacedDirectory: string | undefined;
  try {
    await client.start();
    await client.prompt("/context-tidy on");
    await client.promptAndWait("before directory replacement");
    await client.prompt("/context-tidy status");
    const oldMirror = fixture.notification.match(/document: (.+)/)![1]!;
    replacedDirectory = dirname(oldMirror);
    // Preserve the original inode so inode reuse cannot hide the mismatch.
    await rename(replacedDirectory, join(dir, "abandoned-owned-directory"));
    await mkdir(replacedDirectory, { mode: 0o700 });
    const sentinel = join(replacedDirectory, "sentinel.txt");
    await writeFile(sentinel, "replacement must remain untouched");
    await writeFile(oldMirror, "replacement document must not be adopted");
    const replacementIdentity = await stat(replacedDirectory);
    await client.prompt("/context-tidy off");
    expect(fixture.notification).toContain(
      "OFF; normal input; reset: OFF; mirror cleanup failed",
    );
    await client.prompt("/context-tidy on");
    const freshMirror = fixture.notification.match(/document: (.+)/)![1]!;
    expect(dirname(freshMirror)).not.toBe(replacedDirectory);
    expect((await stat(dirname(freshMirror))).mode & 0o777).toBe(0o700);
    await client.promptAndWait("fresh usable directory");
    expect((await stat(freshMirror)).mode & 0o777).toBe(0o600);
    const fresh = await document(freshMirror);
    source(fresh).messages[0]!.texts[0]!.text = "fresh edited input";
    await writeFile(freshMirror, JSON.stringify(fresh));
    await client.promptAndWait("verify recovered self-edit");
    expect(await client.getLastAssistantText()).toContain("fresh edited input");
    await client.prompt("/context-tidy status");
    expect(fixture.notification).toContain("ON; overlay; accepted");
    await client.stop();
    await expect(access(dirname(freshMirror))).rejects.toThrow();
    expect(await readdir(replacedDirectory)).toEqual([
      "CONTEXT.json",
      "sentinel.txt",
    ]);
    expect(await stat(replacedDirectory)).toMatchObject({
      dev: replacementIdentity.dev,
      ino: replacementIdentity.ino,
      mode: replacementIdentity.mode,
    });
    expect(await readFile(sentinel, "utf8")).toBe(
      "replacement must remain untouched",
    );
    expect(await readFile(oldMirror, "utf8")).toBe(
      "replacement document must not be adopted",
    );
  } finally {
    await fixture.close();
    // Only the test removes its replacement fixture, never the extension.
    if (replacedDirectory)
      await rm(replacedDirectory, { recursive: true, force: true });
  }
}, 20000);
