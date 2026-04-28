import type { IncomingMessage, ServerResponse } from "node:http";
import { respondWithOpenAI } from "../server/agentHandler";
import type { Memory, Sender } from "../src/types";

type VercelRequest = IncomingMessage & {
  body?: unknown;
};

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

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function parseBody(body: unknown): AgentRequest {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body) as AgentRequest;
  return body as AgentRequest;
}

export default async function handler(request: VercelRequest, response: ServerResponse) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = parseBody(request.body);
    const input = body.input?.trim();
    const model = body.model?.trim() || "gpt-5.4-mini";
    const apiKey = body.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();

    if (!input || !body.memory) {
      sendJson(response, 400, { error: "Request must include input and memory." });
      return;
    }

    if (!apiKey) {
      sendJson(response, 400, { error: "Enter an OpenAI API key in AI agent mode, or set OPENAI_API_KEY on the backend." });
      return;
    }

    const result = await respondWithOpenAI(input, body.memory, apiKey, model, body.messages);
    sendJson(response, 200, result);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Agent request failed.";
    sendJson(response, 500, { error: message });
  }
}
