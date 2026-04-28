import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentResult, Intent, Memory, Sender, ToolCall } from "../src/types";
import {
  checkReturnEligibility,
  createEscalation,
  createReturn,
  lookupOrder,
  lookupOrdersByEmail,
  lookupReturnCase,
  lookupSupportCase,
  sendReturnInstructions,
  sendVerificationCode,
  verifyCode,
} from "../src/tools";

type OpenAIContent = {
  type?: string;
  text?: string;
};

type OpenAIOutputItem = {
  type?: string;
  role?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  content?: OpenAIContent[];
};

type OpenAIResponse = {
  id: string;
  output?: OpenAIOutputItem[];
  output_text?: string;
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

type ToolExecution = {
  output: unknown;
  call?: ToolCall;
  memory: Memory;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const orderPattern = /\bBK-\d{4}\b/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const instructions = `You are Bookly's customer support agent for a fictional online bookstore.
Help customers with order status, return requests, support cases, and return case status.
Be concise and ask one focused follow-up question when required information is missing.
Do not repeat a sentence or paragraph in the same response.
When listing multiple orders, cases, steps, or facts, put each item on its own line.
When a response has an intro sentence plus multiple item sentences, put a line break after the intro sentence.
When mentioning a book, format it as book title ("Title") so it cannot be confused with the surrounding sentence.
Never invent order details, refund approvals, tracking numbers, case statuses, or policy exceptions.
Do not provide order status, order lists, tracking numbers, return eligibility, or return creation from memory or guesses. Use a tool result for that data.
If a return is escalated because it is high-value, clearly say it is because the order amount is above Bookly's high-value threshold.
Order-specific information is protected: collect order ID and email, send a verification code, and require a valid six-digit verification code before looking up orders, listing orders, creating returns, or sending return instructions.
Support case and return case status lookups are allowed without order verification.
Use tools whenever answering from Bookly data or taking an action.`;

const openAiTools = [
  {
    type: "function",
    name: "sendVerificationCode",
    description: "Send a mocked one-time verification code to the customer's email address.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["email"],
      properties: {
        email: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "verifyCode",
    description: "Verify a six-digit code entered by the customer.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["code"],
      properties: {
        code: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "lookupOrder",
    description: "Look up a specific order. This tool is blocked until verification succeeds.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["orderId", "email"],
      properties: {
        orderId: { type: "string" },
        email: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "lookupOrdersByEmail",
    description: "List orders for an email address. This tool is blocked until verification succeeds.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["email"],
      properties: {
        email: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "checkReturnEligibility",
    description: "Check whether a looked-up order is eligible for return.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["orderId", "email", "reason"],
      properties: {
        orderId: { type: "string" },
        email: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "createReturn",
    description: "Create a return for a verified, eligible order.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["orderId", "reason"],
      properties: {
        orderId: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "createEscalation",
    description: "Create a support escalation when a request requires manual review.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "reason"],
      properties: {
        summary: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "sendReturnInstructions",
    description: "Send return instructions for a verified order.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["email", "orderId"],
      properties: {
        email: { type: "string" },
        orderId: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "lookupSupportCase",
    description: "Look up a support case by case ID.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["caseId"],
      properties: {
        caseId: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "lookupReturnCase",
    description: "Look up a return case by return ID.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["returnId"],
      properties: {
        returnId: { type: "string" },
      },
    },
  },
];

function parseArguments(raw = "{}") {
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function detectIntent(input: string, current: Intent): Intent {
  const text = input.toLowerCase();
  if (/\b(return|refund|send back|exchange)\b/.test(text)) return "return_request";
  if (/\b(all|my orders|orders)\b/.test(text) && /\b(status|statuses|list|show|what are)\b/.test(text)) return "order_status";
  if (/\b(where|status|tracking|shipped|delivery|order)\b/.test(text)) return "order_status";
  if (/\b(policy|shipping|password|reset)\b/.test(text)) return "policy_question";
  return current;
}

function extractReturnReason(input: string, memory: Memory): string | undefined {
  if (memory.returnReason) return memory.returnReason;
  const text = input.trim();

  if (/\b(damaged|wrong|duplicate|changed my mind|late|defective|arrived late|no longer need|not needed)\b/i.test(text)) {
    return text;
  }

  if (/^(because|reason is|the reason is)\b/i.test(text)) {
    return text;
  }

  return undefined;
}

function enrichMemoryFromInput(input: string, priorMemory: Memory): Memory {
  const orderId = input.match(orderPattern)?.[0].toUpperCase();
  const email = input.match(emailPattern)?.[0].toLowerCase();
  const intent = detectIntent(input, priorMemory.intent);
  const orderIdForTurn = orderId ?? priorMemory.orderId;
  const orderChanged = Boolean(orderId && orderId !== priorMemory.returnOrderId);
  const memoryForReason = orderChanged ? { ...priorMemory, returnReason: undefined } : priorMemory;
  const returnReason = intent === "return_request" ? extractReturnReason(input, memoryForReason) : memoryForReason.returnReason;

  return {
    ...priorMemory,
    intent,
    orderId: orderIdForTurn,
    email: email ?? priorMemory.email,
    orderIdProvidedThisTurn: Boolean(orderId),
    returnOrderId:
      intent === "return_request" && orderIdForTurn
        ? orderIdForTurn
        : priorMemory.returnOrderId,
    returnReason,
    wantsAllOrders:
      /\b(all|my orders|orders)\b/i.test(input) && /\b(status|statuses|list|show|what are)\b/i.test(input)
        ? true
        : priorMemory.wantsAllOrders,
  };
}

function returnReasonNeeded(memory: Memory): AgentResult | null {
  if (memory.intent !== "return_request" || !memory.returnOrderId || memory.returnReason) return null;

  return {
    text: `I can help return order ${memory.returnOrderId}. Please share the reason for the return, such as damaged item, wrong book, duplicate order, or changed my mind.`,
    memory,
    toolCalls: [],
  };
}

function protectedToolBlocked(memory: Memory): ToolExecution | null {
  if (memory.verified) return null;
  return {
    output: {
      error: "Verification required before using this order-specific tool.",
      nextStep: "Ask for the order ID, email, and a valid six-digit verification code.",
    },
    memory,
  };
}

function executeTool(name: string, args: Record<string, string>, memory: Memory): ToolExecution {
  if (name === "sendVerificationCode") {
    const result = sendVerificationCode(args.email ?? "");
    return {
      output: { sent: result.sent, message: result.call.output },
      call: result.call,
      memory: { ...memory, email: args.email, verificationSent: true },
    };
  }

  if (name === "verifyCode") {
    const result = verifyCode(args.code ?? "");
    return {
      output: { valid: result.valid, message: result.call.output },
      call: result.call,
      memory: { ...memory, verified: result.valid },
    };
  }

  if (["lookupOrder", "lookupOrdersByEmail", "checkReturnEligibility", "createReturn", "sendReturnInstructions"].includes(name)) {
    const blocked = protectedToolBlocked(memory);
    if (blocked) return blocked;
  }

  if (name === "lookupOrder") {
    const result = lookupOrder(args.orderId ?? "", args.email);
    return {
      output: { order: result.order ?? null },
      call: result.call,
      memory: { ...memory, orderId: args.orderId, email: args.email },
    };
  }

  if (name === "lookupOrdersByEmail") {
    const result = lookupOrdersByEmail(args.email ?? "");
    return {
      output: { orders: result.orders },
      call: result.call,
      memory: { ...memory, email: args.email, wantsAllOrders: true },
    };
  }

  if (name === "checkReturnEligibility") {
    const lookup = lookupOrder(args.orderId ?? "", args.email);
    if (!lookup.order) {
      return {
        output: { error: "No matching verified order found." },
        call: lookup.call,
        memory,
      };
    }
    const result = checkReturnEligibility(lookup.order, args.reason ?? "");
    return {
      output: {
        eligible: result.eligible,
        escalates: result.escalates,
        reason: result.reason,
      },
      call: result.call,
      memory: { ...memory, orderId: args.orderId, email: args.email, returnReason: args.reason },
    };
  }

  if (name === "createReturn") {
    const result = createReturn(args.orderId ?? "", args.reason ?? "");
    return {
      output: { returnId: result.returnId },
      call: result.call,
      memory: { ...memory, returnOrderId: args.orderId, returnReason: args.reason },
    };
  }

  if (name === "createEscalation") {
    const result = createEscalation(args.summary ?? "", args.reason ?? "");
    return {
      output: { caseId: result.caseId, sla: result.sla },
      call: result.call,
      memory,
    };
  }

  if (name === "sendReturnInstructions") {
    const result = sendReturnInstructions(args.email ?? "", args.orderId ?? "");
    return {
      output: { sent: true, message: result.call.output },
      call: result.call,
      memory,
    };
  }

  if (name === "lookupSupportCase") {
    const result = lookupSupportCase(args.caseId ?? "");
    return {
      output: { supportCase: result.supportCase ?? null },
      call: result.call,
      memory,
    };
  }

  if (name === "lookupReturnCase") {
    const result = lookupReturnCase(args.returnId ?? "");
    return {
      output: { returnCase: result.returnCase ?? null },
      call: result.call,
      memory,
    };
  }

  return {
    output: { error: `Unknown tool: ${name}` },
    memory,
  };
}

function getFinalText(response: OpenAIResponse) {
  if (response.output_text) return response.output_text.trim();

  const text = response.output
    ?.filter((item) => item.type === "message" || item.role === "assistant")
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || "I could not generate a response. Please try again.";
}

function normalizeSentence(sentence: string) {
  return sentence.toLowerCase().replace(/\s+/g, " ").trim();
}

function removeAdjacentDuplicateSentences(text: string) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!sentences) return text;
  const seen = new Set<string>();

  return sentences
    .filter((sentence, index) => {
      const normalized = normalizeSentence(sentence);
      if (index > 0 && normalized === normalizeSentence(sentences[index - 1])) return false;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join("")
    .trim();
}

function addLineBreaksForOrderLists(text: string) {
  return text
    .replace(/(:)\s+(?=BK-\d{4}\b)/g, "$1\n")
    .replace(/(\.)\s+(?=BK-\d{4}\b)/g, "$1\n");
}

function buildConversationSummary(messages: AgentRequest["messages"]) {
  if (!messages?.length) return "";
  return messages
    .slice(-10)
    .map((message) => `${message.sender === "agent" ? "Agent" : "Customer"}: ${message.text}`)
    .join("\n");
}

async function createResponse(apiKey: string, body: unknown): Promise<OpenAIResponse> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message ?? `OpenAI request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload as OpenAIResponse;
}

export async function respondWithOpenAI(
  input: string,
  priorMemory: Memory,
  apiKey: string,
  model: string,
  messages?: AgentRequest["messages"],
): Promise<AgentResult> {
  let memory = enrichMemoryFromInput(input, priorMemory);
  const toolCalls: ToolCall[] = [];
  const conversationSummary = buildConversationSummary(messages);
  const missingReason = returnReasonNeeded(memory);
  if (missingReason) return missingReason;

  const inputItems: unknown[] = [
    {
      role: "user",
      content: conversationSummary
        ? `Recent conversation:\n${conversationSummary}\n\nLatest customer message: ${input}`
        : input,
    },
  ];

  for (let step = 0; step < 5; step += 1) {
    const response = await createResponse(apiKey, {
      model,
      instructions: `${instructions}\n\nCurrent verified session state: ${JSON.stringify({
        email: memory.email,
        orderId: memory.orderId,
        verificationSent: memory.verificationSent,
        verified: memory.verified,
        intent: memory.intent,
        returnOrderId: memory.returnOrderId,
        wantsAllOrders: memory.wantsAllOrders,
      })}`,
      input: inputItems,
      tools: openAiTools,
    });

    const functionCalls = response.output?.filter((item) => item.type === "function_call") ?? [];
    if (!functionCalls.length) {
      return {
        text: addLineBreaksForOrderLists(removeAdjacentDuplicateSentences(getFinalText(response))),
        memory,
        toolCalls,
      };
    }

    inputItems.push(...(response.output ?? []));

    for (const functionCall of functionCalls) {
      const result = executeTool(functionCall.name ?? "", parseArguments(functionCall.arguments), memory);
      memory = result.memory;
      if (result.call) toolCalls.push(result.call);
      inputItems.push({
        type: "function_call_output",
        call_id: functionCall.call_id,
        output: JSON.stringify(result.output),
      });
    }
  }

  return {
    text: "I reached the tool-use limit for this turn. Please send the last request again with any missing order ID, email, or verification code.",
    memory,
    toolCalls,
  };
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

export async function handleAgentRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = JSON.parse(await readBody(request)) as AgentRequest;
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
