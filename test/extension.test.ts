import { readFile } from "node:fs/promises";
import { getCurrentSystemPrompt } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { conversation, mirrorPath, runtime } from "./runtime.ts";

test("explicit ON lets ordinary Bash edits update the automatic next inference and keeps session history intact", async () => {
  const rt = await runtime((context, request) => {
    if (request === 2) {
      const path = mirrorPath(context);
      const program = `const fs=require('fs');const p=${JSON.stringify(path)};const d=JSON.parse(fs.readFileSync(p,'utf8'));d.units[0].messages[0].texts[0].text='short';d.units.push({kind:'note',id:'new:tracker',text:'TODO: verify'});fs.writeFileSync(p,JSON.stringify(d));`;
      return [
        {
          type: "toolCall",
          id: "edit-context",
          name: "bash",
          arguments: { command: `node -e ${JSON.stringify(program)}` },
        },
      ];
    }
    return [{ type: "text", text: "done" }];
  });
  try {
    await rt.session.prompt("original long instruction");
    expect(getCurrentSystemPrompt(rt.requests[0]!.messages)).not.toContain(
      "Context document:",
    );
    await rt.session.prompt("/clearhead on");
    await rt.session.prompt("edit now");
    expect(conversation(rt.requests[2]!)[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "short" }],
    });
    expect(JSON.stringify(conversation(rt.requests[2]!))).toContain(
      "TODO: verify",
    );
    expect(JSON.stringify(conversation(rt.requests[2]!))).toContain(
      "edit-context",
    );
    await rt.session.prompt("continue");
    expect(JSON.stringify(conversation(rt.requests[3]!))).toContain("short");
    expect(JSON.stringify(conversation(rt.requests[3]!))).not.toContain(
      "original long instruction",
    );
    expect(await readFile(rt.session.sessionFile!, "utf8")).toContain(
      "original long instruction",
    );
    expect(rt.manager.getBranch().some((e) => e.type === "context_edit")).toBe(
      false,
    );
    await rt.session.prompt("/clearhead off");
    await rt.session.prompt("after off");
    expect(JSON.stringify(conversation(rt.requests[4]!))).toContain(
      "original long instruction",
    );
    expect(getCurrentSystemPrompt(rt.requests[4]!.messages)).not.toContain(
      "Context document:",
    );
  } finally {
    await rt.close();
  }
});
