import type { IncomingMessage, ServerResponse } from "node:http";

type VercelRequest = IncomingMessage & {
  body?: unknown;
};

type AgentRequest = {
  input?: string;
  memory?: {
    intent: "unknown" | "order_status" | "return_request" | "policy_question" | "support_case";
    orderId?: string;
    returnOrderId?: string;
    email?: string;
    returnReason?: string;
    orderIdProvidedThisTurn?: boolean;
    wantsAllOrders?: boolean;
    verificationSent: boolean;
    verified: boolean;
    closed: boolean;
  };
  model?: string;
  apiKey?: string;
  messages?: Array<{
    sender: "user" | "agent";
    text: string;
  }>;
};

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function logError(stage: string, caught: unknown, requestId: string) {
  const message = caught instanceof Error ? caught.message : String(caught);
  const stack = caught instanceof Error ? caught.stack : undefined;
  console.error("[bookly-agent]", { requestId, stage, message, stack });
}

function parseBody(body: unknown): AgentRequest {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body) as AgentRequest;
  return body as AgentRequest;
}

export default async function handler(request: VercelRequest, response: ServerResponse) {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.info("[bookly-agent]", { requestId, stage: "start", method: request.method });

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed.", requestId });
    return;
  }

  try {
    const body = parseBody(request.body);
    const input = body.input?.trim();
    const model = body.model?.trim() || "gpt-5.4-mini";
    const apiKey = body.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();

    console.info("[bookly-agent]", {
      requestId,
      stage: "parsed",
      hasInput: Boolean(input),
      hasMemory: Boolean(body.memory),
      hasSessionApiKey: Boolean(body.apiKey?.trim()),
      hasEnvApiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
      model,
      messageCount: body.messages?.length ?? 0,
    });

    if (!input || !body.memory) {
      sendJson(response, 400, { error: "Request must include input and memory.", requestId });
      return;
    }

    if (!apiKey) {
      sendJson(response, 400, {
        error: "Enter an OpenAI API key in AI agent mode, or set OPENAI_API_KEY on the backend.",
        requestId,
      });
      return;
    }

    let respondWithOpenAI: typeof import("../server/agentHandler").respondWithOpenAI;
    try {
      ({ respondWithOpenAI } = await import("../server/agentHandler"));
      console.info("[bookly-agent]", { requestId, stage: "imported-agent-handler" });
    } catch (caught) {
      logError("import-agent-handler", caught, requestId);
      sendJson(response, 500, {
        error: "Backend failed to load the agent handler. Check Vercel function logs for import-agent-handler.",
        requestId,
      });
      return;
    }

    try {
      const result = await respondWithOpenAI(input, body.memory, apiKey, model, body.messages);
      console.info("[bookly-agent]", { requestId, stage: "success", toolCallCount: result.toolCalls.length });
      sendJson(response, 200, { ...result, requestId });
    } catch (caught) {
      logError("respond-with-openai", caught, requestId);
      const message = caught instanceof Error ? caught.message : "Agent request failed.";
      sendJson(response, 500, { error: message, requestId });
    }
  } catch (caught) {
    logError("request-parse-or-validation", caught, requestId);
    const message = caught instanceof Error ? caught.message : "Agent request failed.";
    sendJson(response, 500, { error: message, requestId });
  }
}
