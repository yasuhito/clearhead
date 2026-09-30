import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ContextEvent } from "@earendil-works/pi-coding-agent";
import { type Node, type ParseError, parseTree } from "jsonc-parser";

export type Message = ContextEvent["messages"][number];
export interface TextSlot {
  slot: string;
  text: string;
}
export interface ReadOnlyDescriptor {
  blocks: {
    index: number;
    type: string;
    id?: string;
    name?: string;
    arguments?: unknown;
  }[];
  toolCallId?: string;
  toolName?: string;
}
export interface SourceMessage {
  id: string;
  role: string;
  readOnly: ReadOnlyDescriptor;
  texts: TextSlot[];
}
export interface SourceUnit {
  kind: "source";
  id: string;
  messages: SourceMessage[];
}
export interface NoteUnit {
  kind: "note";
  id: string;
  text: string;
}
export interface ContextDocument {
  format: "pi-context-tidy/v1";
  generation: string;
  units: (SourceUnit | NoteUnit)[];
}
export interface Snapshot {
  document: ContextDocument;
  originals: Map<string, Message[]>;
}

function texts(message: Message): TextSlot[] {
  if ("content" in message) {
    if (typeof message.content === "string")
      return [{ slot: "content", text: message.content }];
    return message.content.flatMap((block, index) =>
      block.type === "text" ? [{ slot: String(index), text: block.text }] : [],
    );
  }
  if ("summary" in message) return [{ slot: "summary", text: message.summary }];
  if (message.role === "bashExecution")
    return [
      { slot: "command", text: message.command },
      { slot: "output", text: message.output },
    ];
  return [];
}
function describe(message: Message): ReadOnlyDescriptor {
  const blocks =
    "content" in message && Array.isArray(message.content)
      ? message.content.map((block, index) => {
          if (block.type === "toolCall")
            return {
              index,
              type: block.type,
              id: block.id,
              name: block.name,
              arguments: block.arguments,
            };
          return { index, type: block.type };
        })
      : [];
  return message.role === "toolResult"
    ? { blocks, toolCallId: message.toolCallId, toolName: message.toolName }
    : { blocks };
}
function exchanges(messages: Message[]): Message[][] {
  if (!messages.length) reject("empty effective context");
  const groups: Message[][] = [];
  const seen = new Set<string>();
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    if (message.role === "toolResult") reject("orphaned tool result");
    if (message.role === "system") reject("system message in editable context");
    const calls =
      message.role === "assistant"
        ? message.content.filter((block) => block.type === "toolCall")
        : [];
    const group: Message[] = [message];
    const pending = new Map(calls.map((call) => [call.id, call.name]));
    if (pending.size !== calls.length) reject("duplicate tool calls");
    for (const call of calls) {
      if (seen.has(call.id)) reject("duplicate tool calls");
      seen.add(call.id);
    }
    for (let resultIndex = 0; resultIndex < calls.length; resultIndex++) {
      const result = messages[++index];
      if (
        result?.role !== "toolResult" ||
        pending.get(result.toolCallId) !== result.toolName
      )
        reject("incomplete tool exchange");
      pending.delete(result.toolCallId);
      group.push(result);
    }
    groups.push(group);
  }
  return groups;
}
export function snapshot(messages: Message[]): Snapshot {
  const originals = new Map<string, Message[]>();
  let messageIndex = 0;
  const units: SourceUnit[] = exchanges(messages).map((group, index) => {
    const id = `u${index}`;
    originals.set(id, group);
    return {
      kind: "source",
      id,
      messages: group.map((message) => ({
        id: `m${messageIndex++}`,
        role: message.role,
        readOnly: describe(message),
        texts: texts(message),
      })),
    };
  });
  return {
    document: { format: "pi-context-tidy/v1", generation: randomUUID(), units },
    originals,
  };
}
function replaceTexts(original: Message, slots: TextSlot[]): Message {
  const message = structuredClone(original);
  for (const { slot, text } of slots) {
    if ("content" in message) {
      if (typeof message.content === "string") message.content = text;
      else {
        const block = message.content[Number(slot)];
        if (block?.type === "text") block.text = text;
      }
    } else if ("summary" in message) message.summary = text;
    else if (message.role === "bashExecution") {
      if (slot === "command") message.command = text;
      if (slot === "output") message.output = text;
    }
  }
  return message;
}
export class RejectedEdit extends Error {}
function reject(reason: string): never {
  throw new RejectedEdit(reason);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    reject("invalid document structure");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (!isDeepStrictEqual(Object.keys(value).sort(), keys.sort()))
    reject("unexpected document fields");
}
function uniqueKeys(node: Node) {
  if (node.type === "object") {
    const seen = new Set<string>();
    for (const property of node.children ?? []) {
      const name = property.children?.[0]?.value;
      if (seen.has(name)) reject("duplicate JSON keys");
      seen.add(name);
    }
  }
  for (const child of node.children ?? []) uniqueKeys(child);
}
function parse(raw: string): unknown {
  const errors: ParseError[] = [];
  const tree = parseTree(raw, errors, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false,
  });
  if (!tree || errors.length) reject("malformed JSON");
  uniqueKeys(tree);
  return JSON.parse(raw);
}
export function apply(raw: string, baseline: Snapshot): Message[] {
  const candidate = record(parse(raw));
  exactKeys(candidate, ["format", "generation", "units"]);
  if (candidate.format !== baseline.document.format)
    reject("unsupported document format");
  if (candidate.generation !== baseline.document.generation)
    reject("stale generation");
  if (!Array.isArray(candidate.units)) reject("invalid units");
  const known = new Map(baseline.document.units.map((unit) => [unit.id, unit]));
  const seen = new Set<string>();
  return candidate.units.flatMap((value) => {
    const unit = record(value);
    if (typeof unit.id !== "string" || seen.has(unit.id))
      reject("invalid or duplicate unit ID");
    seen.add(unit.id);
    if (unit.kind === "note") {
      exactKeys(unit, ["kind", "id", "text"]);
      if (
        !/^new:[A-Za-z0-9_-]+$/.test(unit.id) ||
        typeof unit.text !== "string"
      )
        reject("invalid context note");
      return [
        {
          role: "custom",
          customType: "context-tidy-note",
          content: unit.text,
          display: false,
          timestamp: Date.now(),
        } satisfies Message,
      ];
    }
    const expected = known.get(unit.id);
    const originals = baseline.originals.get(unit.id);
    if (expected?.kind !== "source" || !originals) reject("unknown source ID");
    if (
      !Array.isArray(unit.messages) ||
      unit.messages.length !== expected.messages.length
    )
      reject("incomplete source unit");
    const messages = unit.messages.map((value, index) => {
      const message = record(value);
      const original = expected.messages[index]!;
      if (
        !Array.isArray(message.texts) ||
        message.texts.length !== original.texts.length
      )
        reject("changed text slots");
      const slots = message.texts.map((value, slotIndex) => {
        const slot = record(value);
        exactKeys(slot, ["slot", "text"]);
        if (
          slot.slot !== original.texts[slotIndex]!.slot ||
          typeof slot.text !== "string"
        )
          reject("changed text slots");
        return { slot: slot.slot as string, text: slot.text };
      });
      if (!isDeepStrictEqual({ ...message, texts: original.texts }, original))
        reject("changed source metadata");
      return { ...original, texts: slots };
    });
    if (!isDeepStrictEqual({ ...unit, messages: expected.messages }, expected))
      reject("changed source unit");
    return messages.map((message, index) =>
      isDeepStrictEqual(message.texts, expected.messages[index]!.texts)
        ? originals[index]!
        : replaceTexts(originals[index]!, message.texts),
    );
  });
}
