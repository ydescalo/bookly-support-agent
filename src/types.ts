export type Intent = "unknown" | "order_status" | "return_request" | "policy_question" | "support_case";

export type Sender = "user" | "agent";

export type ToolCall = {
  name: string;
  input: string;
  output: string;
};

export type Message = {
  id: string;
  sender: Sender;
  text: string;
  toolCalls?: ToolCall[];
};

export type Order = {
  id: string;
  email: string;
  customerName: string;
  title: string;
  status: "processing" | "shipped" | "delivered" | "arriving_soon";
  carrier?: string;
  trackingNumber?: string;
  deliveredDaysAgo?: number;
  arrivalEstimate?: string;
  total: number;
  highValue?: boolean;
};

export type SupportCase = {
  id: string;
  orderId?: string;
  email: string;
  status: "open" | "in_review" | "waiting_on_customer" | "resolved";
  sla: string;
  createdAt: string;
  summary: string;
};

export type ReturnCase = {
  id: string;
  orderId: string;
  email: string;
  status: "created" | "instructions_sent" | "in_transit" | "refunded";
  nextStep: string;
  createdAt: string;
  summary: string;
};

export type Memory = {
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

export type AgentResult = {
  text: string;
  memory: Memory;
  toolCalls: ToolCall[];
};
