import type { AgentResult, Intent, Memory, ToolCall } from "./types";
import {
  checkReturnEligibility,
  createEscalation,
  createReturn,
  lookupReturnCase,
  lookupSupportCase,
  lookupOrder,
  lookupOrdersByEmail,
  sendReturnInstructions,
  sendVerificationCode,
  verifyCode,
} from "./tools";

export const initialMemory: Memory = {
  intent: "unknown",
  verificationSent: false,
  verified: false,
  closed: false,
};

const orderPattern = /\bBK-\d{4}\b/i;
const casePattern = /\bCASE-\d{4}\b/i;
const returnCasePattern = /\bRET-\d{4}\b/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const codePattern = /\b\d{6}\b/;

function detectIntent(input: string, current: Intent): Intent {
  const text = input.toLowerCase();
  if (returnCasePattern.test(input) || /\b(return case|return status|return request)\b/.test(text)) return "support_case";
  if (/\b(case|ticket|support case|sla)\b/.test(text) || casePattern.test(input)) return "support_case";
  if (/\b(all|my orders|orders)\b/.test(text) && /\b(status|statuses|list|show|what are)\b/.test(text)) return "order_status";
  if (/\b(return|refund|send back|exchange)\b/.test(text)) return "return_request";
  if (/\b(where|status|tracking|shipped|delivery|order)\b/.test(text)) return "order_status";
  if (/\b(policy|shipping|password|reset)\b/.test(text)) return "policy_question";
  return current === "unknown" ? "unknown" : current;
}

function isAllOrdersRequest(input: string) {
  const text = input.toLowerCase();
  return /\b(all|my orders|orders)\b/.test(text) && /\b(status|statuses|list|show|what are)\b/.test(text);
}

function extractFields(input: string, memory: Memory): Memory {
  const orderId = input.match(orderPattern)?.[0].toUpperCase();
  const email = input.match(emailPattern)?.[0].toLowerCase();
  const orderChanged = Boolean(orderId && orderId !== memory.orderId);

  return {
    ...memory,
    orderId: orderId ?? memory.orderId,
    orderIdProvidedThisTurn: Boolean(orderId),
    email: orderChanged && !email ? undefined : email ?? memory.email,
    returnReason: orderChanged ? undefined : memory.returnReason,
  };
}

function extractReturnReason(input: string, memory: Memory): string | undefined {
  if (memory.returnReason) return memory.returnReason;
  const text = input.trim();
  if (/\b(damaged|wrong|duplicate|changed my mind|late|defective)\b/i.test(text)) return text;
  if (/\b(return instructions|instructions|send.*return)\b/i.test(text)) return "return instructions requested";
  return undefined;
}

function missingIdentity(memory: Memory) {
  if (!memory.orderId && !memory.email) return "Please share the order ID and email address on the order.";
  if (!memory.orderId) return "Please share the order ID, for example BK-1001.";
  if (!memory.email && !memory.verified) return "Please share the email address on the order.";
  return null;
}

function requireVerification(memory: Memory, toolCalls: ToolCall[]): AgentResult | null {
  if (!memory.orderId || memory.verified) return null;
  if (!memory.email) return null;

  if (!memory.verificationSent) {
    const sent = sendVerificationCode(memory.email);
    toolCalls.push(sent.call);
    return {
      text: `I found enough information to verify the account. I sent a one-time code to ${memory.email}. Please enter it here to continue.`,
      memory: { ...memory, verificationSent: true },
      toolCalls,
    };
  }

  return {
    text: "Please enter the six-digit verification code before I look up order details or start a return.",
    memory,
    toolCalls,
  };
}

function answerPolicyQuestion(memory: Memory): AgentResult {
  return {
    text:
      "Bookly's standard policy in this demo allows returns within 30 days of delivery. For order-specific decisions, I need to verify the order first so I do not expose or invent account information.",
    memory,
    toolCalls: [],
  };
}

function handleSupportCase(input: string, memory: Memory): AgentResult {
  const caseId = input.match(casePattern)?.[0].toUpperCase();
  const returnId = input.match(returnCasePattern)?.[0].toUpperCase();
  const toolCalls: ToolCall[] = [];

  if (returnId) {
    const lookup = lookupReturnCase(returnId);
    toolCalls.push(lookup.call);

    if (!lookup.returnCase) {
      return {
        text: `I could not find return case ${returnId}. Please double-check the return ID, or share the order ID so I can help look it up another way.`,
        memory,
        toolCalls,
      };
    }

    const returnCase = lookup.returnCase;
    return {
      text: `${returnCase.id} for order ${returnCase.orderId} is ${returnCase.status.replaceAll("_", " ")}. Next step: ${returnCase.nextStep} Summary: ${returnCase.summary}`,
      memory,
      toolCalls,
    };
  }

  if (!caseId) {
    return {
      text: "Please share the support case ID, for example CASE-2048, or the return case ID, for example RET-1002.",
      memory,
      toolCalls,
    };
  }

  const lookup = lookupSupportCase(caseId);
  toolCalls.push(lookup.call);

  if (!lookup.supportCase) {
    return {
      text: `I could not find support case ${caseId}. Please double-check the case ID, or I can create a new support case if needed.`,
      memory,
      toolCalls,
    };
  }

  const supportCase = lookup.supportCase;
  return {
    text: `${supportCase.id} is ${supportCase.status.replaceAll("_", " ")}. SLA: ${supportCase.sla}. Summary: ${supportCase.summary}`,
    memory,
    toolCalls,
  };
}

function handleOrderStatus(memory: Memory): AgentResult {
  const toolCalls: ToolCall[] = [];

  if (memory.wantsAllOrders && memory.email) {
    const verification = requireVerification({ ...memory, orderId: "ALL_ORDERS" }, toolCalls);
    if (verification) return { ...verification, memory: { ...verification.memory, orderId: undefined, wantsAllOrders: true } };

    const lookup = lookupOrdersByEmail(memory.email);
    toolCalls.push(lookup.call);

    if (!lookup.orders.length) {
      return {
        text: `I could not find any orders for ${memory.email}. Please check the email address or share a specific order ID.`,
        memory: { ...memory, orderId: undefined },
        toolCalls,
      };
    }

    const summaries = lookup.orders
      .map((order) => {
        if (order.status === "shipped") return `${order.id} "${order.title}" has shipped with ${order.carrier}.`;
        if (order.status === "delivered") return `${order.id} "${order.title}" was delivered ${order.deliveredDaysAgo} days ago.`;
        if (order.status === "arriving_soon") return `${order.id} "${order.title}" should arrive within ${order.arrivalEstimate}.`;
        return `${order.id} "${order.title}" is still processing.`;
      })
      .join(" ");

    return {
      text: `Here are the orders I found for ${memory.email}: ${summaries}`,
      memory: { ...memory, orderId: undefined },
      toolCalls,
    };
  }

  if (memory.wantsAllOrders && !memory.email) {
    return {
      text: "Please share the email address on the account, and I can list your orders and statuses.",
      memory,
      toolCalls,
    };
  }

  const missing = missingIdentity(memory);
  if (missing) return { text: missing, memory, toolCalls };

  const verification = requireVerification(memory, toolCalls);
  if (verification) return verification;

  const lookup = lookupOrder(memory.orderId!, memory.email);
  toolCalls.push(lookup.call);

  if (!lookup.order) {
    const escalation = createEscalation(
      `Customer could not verify an order for ${memory.orderId} and ${memory.email}.`,
      "No matching order",
    );
    toolCalls.push(escalation.call);
    return {
      text: `I could not find a matching order for ${memory.orderId}. I created support case ${escalation.caseId} so a specialist can investigate further.`,
      memory,
      toolCalls,
    };
  }

  const order = lookup.order;
  const status =
    order.status === "shipped"
      ? `Your order ${order.id} for "${order.title}" has shipped with ${order.carrier}. Tracking number: ${order.trackingNumber}. Track it here: https://www.ups.com/track?tracknum=${order.trackingNumber}.`
      : order.status === "delivered"
        ? `Your order ${order.id} for "${order.title}" was delivered ${order.deliveredDaysAgo} days ago.`
        : order.status === "arriving_soon"
          ? `Your order ${order.id} for "${order.title}" should arrive within ${order.arrivalEstimate}.`
          : `Your order ${order.id} for "${order.title}" is still processing.`;

  return {
    text: `${status} Is there anything else you need help with?`,
    memory,
    toolCalls,
  };
}

function handleReturn(memory: Memory): AgentResult {
  const toolCalls: ToolCall[] = [];
  if (!memory.returnOrderId) {
    return {
      text: "Which book would you like to return? Please share the order ID for that book, for example BK-1002.",
      memory: { ...memory, orderId: undefined, returnReason: undefined },
      toolCalls,
    };
  }

  const returnMemory = { ...memory, orderId: memory.returnOrderId };
  const missing = missingIdentity(returnMemory);
  if (missing) return { text: missing, memory: returnMemory, toolCalls };
  if (!memory.returnReason) {
    return {
      text: "Please share the reason for the return, such as damaged item, wrong book, duplicate order, or changed my mind.",
      memory: returnMemory,
      toolCalls,
    };
  }

  const verification = requireVerification(returnMemory, toolCalls);
  if (verification) return verification;

  const lookup = lookupOrder(returnMemory.orderId!, returnMemory.email);
  toolCalls.push(lookup.call);

  if (!lookup.order) {
    const escalation = createEscalation(
      `Return requested for ${returnMemory.orderId}, but no matching verified order was found.`,
      "No matching order",
    );
    toolCalls.push(escalation.call);
    return {
      text: `I could not find a matching order for ${returnMemory.orderId}, so I created support case ${escalation.caseId} for manual review.`,
      memory: returnMemory,
      toolCalls,
    };
  }

  const eligibility = checkReturnEligibility(lookup.order, memory.returnReason);
  toolCalls.push(eligibility.call);

  if (lookup.order.status === "arriving_soon" && memory.returnReason === "return instructions requested") {
    const instructions = sendReturnInstructions(lookup.order.email, lookup.order.id);
    toolCalls.push(instructions.call);
    return {
      text: `${eligibility.reason} I sent return instructions to the email address on the order so you have them ready once the book arrives.`,
      memory: returnMemory,
      toolCalls,
    };
  }

  if (eligibility.eligible) {
    const created = createReturn(lookup.order.id, memory.returnReason);
    toolCalls.push(created.call);
    return {
      text: `You're eligible for a return. I created return ${created.returnId} for "${lookup.order.title}". You'll receive return instructions by email at ${lookup.order.email}.`,
      memory: returnMemory,
      toolCalls,
    };
  }

  const escalation = eligibility.escalates
    ? createEscalation(`Return exception for ${lookup.order.id}: ${eligibility.reason}`, "Return policy exception")
    : null;
  if (escalation) toolCalls.push(escalation.call);

  return {
    text: escalation
      ? `${eligibility.reason} I created support case ${escalation.caseId} so a specialist can review it. SLA: ${escalation.sla}.`
      : `${eligibility.reason} I can help check the order status or connect you with support if needed.`,
    memory: returnMemory,
    toolCalls,
  };
}

export function respond(input: string, priorMemory: Memory): AgentResult {
  let memory = extractFields(input, priorMemory);
  const toolCalls: ToolCall[] = [];
  const enteredCode = input.match(codePattern)?.[0];

  if (enteredCode && memory.verificationSent && !memory.verified) {
    const verification = verifyCode(enteredCode);
    toolCalls.push(verification.call);
    memory = { ...memory, verified: verification.valid };
    if (!verification.valid) {
      return {
        text: "That code does not match. Please try again, or I can escalate this to a support specialist.",
        memory,
        toolCalls,
      };
    }
  }

  const intent = detectIntent(input, memory.intent);
  memory = {
    ...memory,
    intent,
    wantsAllOrders: isAllOrdersRequest(input) ? true : memory.wantsAllOrders,
    returnOrderId: intent === "return_request" && memory.orderIdProvidedThisTurn ? memory.orderId : memory.returnOrderId,
    returnReason: intent === "return_request" ? extractReturnReason(input, memory) : memory.returnReason,
  };

  if (intent === "policy_question") return answerPolicyQuestion(memory);
  if (intent === "support_case") return handleSupportCase(input, memory);
  if (intent === "order_status") {
    const result = handleOrderStatus(memory);
    return { ...result, toolCalls: [...toolCalls, ...result.toolCalls] };
  }
  if (intent === "return_request") {
    const result = handleReturn(memory);
    return { ...result, toolCalls: [...toolCalls, ...result.toolCalls] };
  }

  return {
    text: "I can help with order status, returns, refunds, and Bookly policy questions. What would you like to do?",
    memory,
    toolCalls,
  };
}
