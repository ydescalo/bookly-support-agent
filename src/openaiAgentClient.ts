import type { AgentResult, Memory, Message } from "./types";

export async function respondWithOpenAI(
  input: string,
  memory: Memory,
  model: string,
  apiKey: string,
  messages: Message[],
): Promise<AgentResult> {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input,
      memory,
      model,
      apiKey,
      messages: messages.map((message) => ({
        sender: message.sender,
        text: message.text,
      })),
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error ?? `Agent request failed with status ${response.status}.`);
  }

  return payload as AgentResult;
}
