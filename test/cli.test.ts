import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { RpcClient } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { document, source } from "./runtime.ts";

test("the shipped Pi CLI loads the extension and exposes edited input over RPC without authentication", async () => {
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
  let mirror: string | undefined;
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
  try {
    await client.start();
    expect(
      (await client.getCommands()).some((c) => c.name === "context-tidy"),
    ).toBe(true);
    expect(await client.prompt("/context-tidy on")).toBe("handled");
    await client.promptAndWait("original CLI input");
    await client.prompt("/context-tidy status");
    mirror = notification.match(/document: (.+)/)?.[1];
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
    expect(notification).toContain("ON; overlay; accepted");
    expect(notification).toContain(mirror);
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
    expect(notification).toContain("ON; normal input; accepted");
    await writeFile(mirror!, "PRIVATE_PAYLOAD_MARKER");
    await client.promptAndWait("invalid candidate");
    await client.prompt("/context-tidy status");
    expect(notification).toContain(
      "ON; normal input; rejected: malformed JSON",
    );
    expect(notification).not.toContain("PRIVATE_PAYLOAD_MARKER");
    expect(await client.getLastAssistantText()).toContain("original CLI input");
    await client.promptAndWait("fresh baseline");
    await client.prompt("/context-tidy status");
    expect(notification).toContain("rejected: malformed JSON");
    await client.prompt("/context-tidy off");
    await expect(access(mirror!)).rejects.toThrow();
  } finally {
    await client.stop();
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);
