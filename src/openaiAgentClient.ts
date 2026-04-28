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

  const responseText = await response.text();
  let payload: AgentResult | { error?: string } | null = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error(responseText || `Agent request failed with status ${response.status}.`);
  }

  if (!response.ok) {
    const errorMessage = payload && "error" in payload ? payload.error : undefined;
    throw new Error(errorMessage ?? `Agent request failed with status ${response.status}.`);
  }

  return payload as AgentResult;
}
