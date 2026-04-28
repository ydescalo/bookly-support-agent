import { orders, returnCases, returnPolicy, supportCases, supportCaseSlas, verificationCodes } from "./data";
import type { Order, ToolCall } from "./types";

const toolCall = (name: string, input: string, output: string): ToolCall => ({
  name,
  input,
  output,
});

export function sendVerificationCode(email: string) {
  return {
    sent: true,
    call: toolCall(
      "sendVerificationCode",
      email,
      `Sent one-time code to ${email} (mocked)`,
    ),
  };
}

export function verifyCode(inputCode: string) {
  const valid = verificationCodes.includes(inputCode.trim());
  return {
    valid,
    call: toolCall("verifyCode", inputCode, valid ? "Verified" : "Invalid code"),
  };
}

export function lookupOrder(orderId: string, email?: string) {
  const order = orders.find((item) => {
    const idMatches = item.id.toLowerCase() === orderId.toLowerCase();
    const emailMatches = email ? item.email.toLowerCase() === email.toLowerCase() : true;
    return idMatches && emailMatches;
  });
  return {
    order,
    call: toolCall(
      "lookupOrder",
      email ? `${orderId}, ${email}` : orderId,
      order ? `${order.status}: ${order.title}` : "No matching order found",
    ),
  };
}

export function lookupOrdersByEmail(email: string) {
  const matchingOrders = orders.filter((item) => item.email.toLowerCase() === email.toLowerCase());
  return {
    orders: matchingOrders,
    call: toolCall(
      "lookupOrdersByEmail",
      email,
      matchingOrders.length ? `${matchingOrders.length} orders found` : "No matching orders found",
    ),
  };
}

export function checkReturnEligibility(order: Order, reason: string) {
  const days = order.deliveredDaysAgo;
  const withinWindow = typeof days === "number" && days <= returnPolicy.returnWindowDays;
  const delivered = order.status === "delivered";
  const highValue = order.highValue || order.total >= returnPolicy.highValueEscalationThreshold;

  if (!delivered) {
    return {
      eligible: false,
      escalates: false,
      reason:
        order.status === "arriving_soon"
          ? "Return is possible only after the book has arrived."
          : "Order has not been delivered yet, so a return cannot be started.",
      call: toolCall("checkReturnEligibility", `${order.id}, ${reason}`, "Ineligible: not delivered"),
    };
  }

  if (highValue) {
    return {
      eligible: false,
      escalates: true,
      reason: `This order total is $${order.total.toFixed(2)}, which is above Bookly's $${returnPolicy.highValueEscalationThreshold.toFixed(2)} high-value threshold. High-value returns require support specialist review before approval.`,
      call: toolCall("checkReturnEligibility", `${order.id}, ${reason}`, "Escalate: high-value order"),
    };
  }

  if (!withinWindow) {
    return {
      eligible: false,
      escalates: true,
      reason: `This order was delivered ${days} days ago, outside Bookly's ${returnPolicy.returnWindowDays}-day return window.`,
      call: toolCall("checkReturnEligibility", `${order.id}, ${reason}`, "Escalate: outside return window"),
    };
  }

  return {
    eligible: true,
    escalates: false,
    reason: "Order is delivered and within the return window.",
    call: toolCall("checkReturnEligibility", `${order.id}, ${reason}`, "Eligible"),
  };
}

export function createReturn(orderId: string, reason: string) {
  const returnId = `RET-${orderId.replace("BK-", "")}`;
  return {
    returnId,
    call: toolCall("createReturn", `${orderId}, ${reason}`, `Created return ${returnId}`),
  };
}

export function createEscalation(summary: string, reason: string) {
  const caseId = reason.toLowerCase().includes("high-value") ? "CASE-2052" : "CASE-2048";
  const sla = reason.toLowerCase().includes("return") || reason.toLowerCase().includes("high-value")
    ? supportCaseSlas.escalated
    : supportCaseSlas.standard;
  return {
    caseId,
    sla,
    call: toolCall("createEscalation", reason, `${caseId}: ${summary}. SLA: ${sla}`),
  };
}

export function sendReturnInstructions(email: string, orderId: string) {
  return {
    call: toolCall("sendReturnInstructions", `${orderId}, ${email}`, `Sent return instructions to ${email}`),
  };
}

export function lookupSupportCase(caseId: string) {
  const supportCase = supportCases.find((item) => item.id.toLowerCase() === caseId.toLowerCase());
  return {
    supportCase,
    call: toolCall(
      "lookupSupportCase",
      caseId,
      supportCase ? `${supportCase.status}: ${supportCase.sla}` : "No matching support case found",
    ),
  };
}

export function lookupReturnCase(returnId: string) {
  const returnCase = returnCases.find((item) => item.id.toLowerCase() === returnId.toLowerCase());
  return {
    returnCase,
    call: toolCall(
      "lookupReturnCase",
      returnId,
      returnCase ? `${returnCase.status}: ${returnCase.nextStep}` : "No matching return case found",
    ),
  };
}
