import type { IncomingMessage, ServerResponse } from "node:http";

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

export default function handler(request: IncomingMessage, response: ServerResponse) {
  sendJson(response, 200, {
    ok: true,
    method: request.method,
    node: process.version,
    hasEnvApiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
    timestamp: new Date().toISOString(),
  });
}
