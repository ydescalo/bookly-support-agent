import { respondWithOpenAI } from "../server/agentHandler";
import type { Memory, Sender } from "../src/types";

type AgentRequest = {
  input?: string;
  memory?: Memory;
  model?: string;
  apiKey?: string;
  messages?: Array<{
    sender: Sender;
    text: string;
  }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AgentRequest;
    const input = body.input?.trim();
    const model = body.model?.trim() || "gpt-5.4-mini";
    const apiKey = body.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();

    if (!input || !body.memory) {
      return Response.json({ error: "Request must include input and memory." }, { status: 400 });
    }

    if (!apiKey) {
      return Response.json(
        { error: "Enter an OpenAI API key in AI agent mode, or set OPENAI_API_KEY on the backend." },
        { status: 400 },
      );
    }

    const result = await respondWithOpenAI(input, body.memory, apiKey, model, body.messages);
    return Response.json(result);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Agent request failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
