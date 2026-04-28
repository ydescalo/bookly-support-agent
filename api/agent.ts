import type { IncomingMessage, ServerResponse } from "node:http";

type Intent = "unknown" | "order_status" | "return_request" | "policy_question" | "support_case";
type Sender = "user" | "agent";

type Memory = {
  intent: Intent;
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

type ToolCall = {
  name: string;
  input: string;
  output: string;
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

type VercelRequest = IncomingMessage & {
  body?: unknown;
};

type OpenAIOutputItem = {
  type?: string;
  role?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  content?: Array<{ text?: string }>;
};

type OpenAIResponse = {
  id: string;
  output?: OpenAIOutputItem[];
  output_text?: string;
};

type ToolExecution = {
  output: unknown;
  call?: ToolCall;
  memory: Memory;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const verificationCodes = ["123456", "121212"];
const returnPolicy = {
  returnWindowDays: 30,
  highValueEscalationThreshold: 250,
};
const supportCaseSlas = {
  standard: "Response within 1 business day",
  escalated: "Response within 4 business hours",
};
const orderPattern = /\bBK-\d{4}\b/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const orders = [
  {
    id: "BK-1001",
    email: "yael.descalo@example.com",
    customerName: "Yael",
    title: "Please Hold",
    status: "shipped",
    carrier: "UPS",
    trackingNumber: "1Z-BOOKLY-1001",
    total: 48.5,
  },
  {
    id: "BK-1002",
    email: "yael.descalo@example.com",
    customerName: "Yael",
    title: "From Hold Music to AOPs",
    status: "delivered",
    deliveredDaysAgo: 12,
    total: 39.99,
  },
  {
    id: "BK-1003",
    email: "yaeldescalo@demo.com",
    customerName: "Yael",
    title: "The Concierge Standard",
    status: "delivered",
    deliveredDaysAgo: 45,
    total: 42.0,
  },
  {
    id: "BK-1004",
    email: "yaeldescalo@demo.com",
    customerName: "Yael",
    title: "Faster Resolutions",
    status: "arriving_soon",
    arrivalEstimate: "3-5 business days",
    total: 36.0,
  },
  {
    id: "BK-9001",
    email: "yaeldescalo@demo.com",
    customerName: "Yael",
    title: "Always Available",
    status: "delivered",
    deliveredDaysAgo: 6,
    total: 620.0,
    highValue: true,
  },
];

const supportCases = [
  {
    id: "CASE-2048",
    orderId: "BK-1003",
    email: "yaeldescalo@demo.com",
    status: "in_review",
    sla: supportCaseSlas.escalated,
    createdAt: "2026-04-24",
    summary: "Return exception review for an order outside the 30-day return window.",
  },
  {
    id: "CASE-2051",
    orderId: "BK-1004",
    email: "yaeldescalo@demo.com",
    status: "waiting_on_customer",
    sla: supportCaseSlas.standard,
    createdAt: "2026-04-25",
    summary: "Customer asked for return instructions before the book arrived.",
  },
  {
    id: "CASE-2052",
    orderId: "BK-9001",
    email: "yaeldescalo@demo.com",
    status: "open",
    sla: supportCaseSlas.escalated,
    createdAt: "2026-04-25",
    summary: "High-value order return request awaiting specialist review.",
  },
];

const returnCases = [
  {
    id: "RET-1002",
    orderId: "BK-1002",
    email: "yael.descalo@example.com",
    status: "instructions_sent",
    nextStep: "Use the emailed label and drop the package off within 14 days.",
    createdAt: "2026-04-25",
    summary: "Return approved for From Hold Music to AOPs.",
  },
  {
    id: "RET-1004",
    orderId: "BK-1004",
    email: "yaeldescalo@demo.com",
    status: "created",
    nextStep: "Return can be started after the book arrives.",
    createdAt: "2026-04-25",
    summary: "Return instructions requested before delivery.",
  },
];

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
      properties: { email: { type: "string" } },
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
      properties: { code: { type: "string" } },
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
      properties: { orderId: { type: "string" }, email: { type: "string" } },
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
      properties: { email: { type: "string" } },
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
      properties: { orderId: { type: "string" }, reason: { type: "string" } },
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
      properties: { summary: { type: "string" }, reason: { type: "string" } },
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
      properties: { email: { type: "string" }, orderId: { type: "string" } },
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
      properties: { caseId: { type: "string" } },
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
      properties: { returnId: { type: "string" } },
    },
  },
];

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

function toolCall(name: string, input: string, output: string): ToolCall {
  return { name, input, output };
}

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
  if (/^(because|reason is|the reason is)\b/i.test(text)) return text;
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
    returnOrderId: intent === "return_request" && orderIdForTurn ? orderIdForTurn : priorMemory.returnOrderId,
    returnReason,
    wantsAllOrders:
      /\b(all|my orders|orders)\b/i.test(input) && /\b(status|statuses|list|show|what are)\b/i.test(input)
        ? true
        : priorMemory.wantsAllOrders,
  };
}

function returnReasonNeeded(memory: Memory) {
  if (memory.intent !== "return_request" || !memory.returnOrderId || memory.returnReason) return null;
  return {
    text: `I can help return order ${memory.returnOrderId}. Please share the reason for the return, such as damaged item, wrong book, duplicate order, or changed my mind.`,
    memory,
    toolCalls: [],
  };
}

function lookupOrder(orderId: string, email?: string) {
  const order = orders.find((item) => {
    const idMatches = item.id.toLowerCase() === orderId.toLowerCase();
    const emailMatches = email ? item.email.toLowerCase() === email.toLowerCase() : true;
    return idMatches && emailMatches;
  });
  return {
    order,
    call: toolCall("lookupOrder", email ? `${orderId}, ${email}` : orderId, order ? `${order.status}: ${order.title}` : "No matching order found"),
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
    const email = args.email ?? "";
    const call = toolCall("sendVerificationCode", email, `Sent one-time code to ${email} (mocked)`);
    return { output: { sent: true, message: call.output }, call, memory: { ...memory, email, verificationSent: true } };
  }

  if (name === "verifyCode") {
    const code = args.code ?? "";
    const valid = verificationCodes.includes(code.trim());
    const call = toolCall("verifyCode", code, valid ? "Verified" : "Invalid code");
    return { output: { valid, message: call.output }, call, memory: { ...memory, verified: valid } };
  }

  if (["lookupOrder", "lookupOrdersByEmail", "checkReturnEligibility", "createReturn", "sendReturnInstructions"].includes(name)) {
    const blocked = protectedToolBlocked(memory);
    if (blocked) return blocked;
  }

  if (name === "lookupOrder") {
    const result = lookupOrder(args.orderId ?? "", args.email);
    return { output: { order: result.order ?? null }, call: result.call, memory: { ...memory, orderId: args.orderId, email: args.email } };
  }

  if (name === "lookupOrdersByEmail") {
    const email = args.email ?? "";
    const matchingOrders = orders.filter((item) => item.email.toLowerCase() === email.toLowerCase());
    const call = toolCall("lookupOrdersByEmail", email, matchingOrders.length ? `${matchingOrders.length} orders found` : "No matching orders found");
    return { output: { orders: matchingOrders }, call, memory: { ...memory, email, wantsAllOrders: true } };
  }

  if (name === "checkReturnEligibility") {
    const lookup = lookupOrder(args.orderId ?? "", args.email);
    if (!lookup.order) return { output: { error: "No matching verified order found." }, call: lookup.call, memory };
    const order = lookup.order;
    const reason = args.reason ?? "";
    const days = order.deliveredDaysAgo;
    const delivered = order.status === "delivered";
    const highValue = order.highValue || order.total >= returnPolicy.highValueEscalationThreshold;
    const withinWindow = typeof days === "number" && days <= returnPolicy.returnWindowDays;

    if (!delivered) {
      const reasonText = order.status === "arriving_soon"
        ? "Return is possible only after the book has arrived."
        : "Order has not been delivered yet, so a return cannot be started.";
      return {
        output: { eligible: false, escalates: false, reason: reasonText },
        call: toolCall("checkReturnEligibility", `${order.id}, ${reason}`, "Ineligible: not delivered"),
        memory: { ...memory, orderId: args.orderId, email: args.email, returnReason: reason },
      };
    }

    if (highValue) {
      const reasonText = `This order total is $${order.total.toFixed(2)}, which is above Bookly's $${returnPolicy.highValueEscalationThreshold.toFixed(2)} high-value threshold. High-value returns require support specialist review before approval.`;
      return {
        output: { eligible: false, escalates: true, reason: reasonText },
        call: toolCall("checkReturnEligibility", `${order.id}, ${reason}`, "Escalate: high-value order"),
        memory: { ...memory, orderId: args.orderId, email: args.email, returnReason: reason },
      };
    }

    if (!withinWindow) {
      const reasonText = `This order was delivered ${days} days ago, outside Bookly's ${returnPolicy.returnWindowDays}-day return window.`;
      return {
        output: { eligible: false, escalates: true, reason: reasonText },
        call: toolCall("checkReturnEligibility", `${order.id}, ${reason}`, "Escalate: outside return window"),
        memory: { ...memory, orderId: args.orderId, email: args.email, returnReason: reason },
      };
    }

    return {
      output: { eligible: true, escalates: false, reason: "Order is delivered and within the return window." },
      call: toolCall("checkReturnEligibility", `${order.id}, ${reason}`, "Eligible"),
      memory: { ...memory, orderId: args.orderId, email: args.email, returnReason: reason },
    };
  }

  if (name === "createReturn") {
    const orderId = args.orderId ?? "";
    const returnId = `RET-${orderId.replace("BK-", "")}`;
    const call = toolCall("createReturn", `${orderId}, ${args.reason ?? ""}`, `Created return ${returnId}`);
    return { output: { returnId }, call, memory: { ...memory, returnOrderId: orderId, returnReason: args.reason } };
  }

  if (name === "createEscalation") {
    const reason = args.reason ?? "";
    const caseId = reason.toLowerCase().includes("high-value") ? "CASE-2052" : "CASE-2048";
    const sla = reason.toLowerCase().includes("return") || reason.toLowerCase().includes("high-value")
      ? supportCaseSlas.escalated
      : supportCaseSlas.standard;
    const call = toolCall("createEscalation", reason, `${caseId}: ${args.summary ?? ""}. SLA: ${sla}`);
    return { output: { caseId, sla }, call, memory };
  }

  if (name === "sendReturnInstructions") {
    const call = toolCall("sendReturnInstructions", `${args.orderId ?? ""}, ${args.email ?? ""}`, `Sent return instructions to ${args.email ?? ""}`);
    return { output: { sent: true, message: call.output }, call, memory };
  }

  if (name === "lookupSupportCase") {
    const supportCase = supportCases.find((item) => item.id.toLowerCase() === (args.caseId ?? "").toLowerCase());
    const call = toolCall("lookupSupportCase", args.caseId ?? "", supportCase ? `${supportCase.status}: ${supportCase.sla}` : "No matching support case found");
    return { output: { supportCase: supportCase ?? null }, call, memory };
  }

  if (name === "lookupReturnCase") {
    const returnCase = returnCases.find((item) => item.id.toLowerCase() === (args.returnId ?? "").toLowerCase());
    const call = toolCall("lookupReturnCase", args.returnId ?? "", returnCase ? `${returnCase.status}: ${returnCase.nextStep}` : "No matching return case found");
    return { output: { returnCase: returnCase ?? null }, call, memory };
  }

  return { output: { error: `Unknown tool: ${name}` }, memory };
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

function cleanResponse(text: string) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  const deduped = sentences
    ? sentences.filter((sentence, index) => {
        const normalized = normalizeSentence(sentence);
        const prior = index > 0 ? normalizeSentence(sentences[index - 1]) : "";
        return normalized !== prior && sentences.findIndex((item) => normalizeSentence(item) === normalized) === index;
      }).join("").trim()
    : text;
  return deduped.replace(/(:)\s+(?=BK-\d{4}\b)/g, "$1\n").replace(/(\.)\s+(?=BK-\d{4}\b)/g, "$1\n");
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? `OpenAI request failed with status ${response.status}.`);
  return payload as OpenAIResponse;
}

async function respondWithOpenAI(input: string, priorMemory: Memory, apiKey: string, model: string, messages?: AgentRequest["messages"]) {
  let memory = enrichMemoryFromInput(input, priorMemory);
  const toolCalls: ToolCall[] = [];
  const missingReason = returnReasonNeeded(memory);
  if (missingReason) return missingReason;

  const conversationSummary = buildConversationSummary(messages);
  const inputItems: unknown[] = [{
    role: "user",
    content: conversationSummary ? `Recent conversation:\n${conversationSummary}\n\nLatest customer message: ${input}` : input,
  }];

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
    if (!functionCalls.length) return { text: cleanResponse(getFinalText(response)), memory, toolCalls };

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
      sendJson(response, 400, { error: "Enter an OpenAI API key in AI agent mode, or set OPENAI_API_KEY on the backend.", requestId });
      return;
    }

    const result = await respondWithOpenAI(input, body.memory, apiKey, model, body.messages);
    console.info("[bookly-agent]", { requestId, stage: "success", toolCallCount: result.toolCalls.length });
    sendJson(response, 200, { ...result, requestId });
  } catch (caught) {
    logError("agent-handler", caught, requestId);
    const message = caught instanceof Error ? caught.message : "Agent request failed.";
    sendJson(response, 500, { error: message, requestId });
  }
}
