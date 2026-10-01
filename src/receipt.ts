import type { Message } from "./document.ts";

export function acceptanceProjection(
  messages: Message[],
  callId: string,
): { messages: Message[]; replaced: boolean } {
  const index = messages.findIndex(
    (message) =>
      message.role === "assistant" &&
      message.content.some(
        (block) => block.type === "toolCall" && block.id === callId,
      ),
  );
  const assistant = messages[index];
  if (assistant?.role !== "assistant") return { messages, replaced: false };
  const calls = assistant.content.filter((block) => block.type === "toolCall");
  const result = messages[index + 1];
  // Never remove a sibling call, signed argument, or substantive assistant text.
  if (
    calls.length !== 1 ||
    calls[0]!.name !== "context_edit" ||
    assistant.content.some(
      (block) => block.type === "text" && block.text.trim(),
    ) ||
    result?.role !== "toolResult" ||
    result.toolCallId !== callId ||
    result.toolName !== "context_edit" ||
    result.isError
  )
    return { messages, replaced: false };
  const receipt: Message = {
    role: "custom",
    customType: "context-tidy-receipt",
    content: "Context edit accepted.",
    display: false,
    timestamp: Date.now(),
  };
  return {
    messages: [
      ...messages.slice(0, index),
      receipt,
      ...messages.slice(index + 2),
    ].filter(
      (message) =>
        message === receipt ||
        message.role !== "custom" ||
        message.customType !== "context-tidy-receipt",
    ),
    replaced: true,
  };
}

export function substantiveActivity(messages: Message[]): boolean {
  return messages.some(
    (message) =>
      message.role === "user" ||
      (message.role === "assistant" &&
        message.content.some(
          (block) =>
            (block.type === "text" && !!block.text.trim()) ||
            (block.type === "toolCall" && block.name !== "context_edit"),
        )) ||
      (message.role === "toolResult" && message.toolName !== "context_edit"),
  );
}
