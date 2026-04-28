import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAgentRequest } from "../server/agentHandler";

export default function handler(request: IncomingMessage, response: ServerResponse) {
  void handleAgentRequest(request, response);
}
