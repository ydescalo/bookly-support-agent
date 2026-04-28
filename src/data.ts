import type { Order, ReturnCase, SupportCase } from "./types";

export const verificationCodes = ["123456", "121212"];

export const orders: Order[] = [
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

export const returnPolicy = {
  returnWindowDays: 30,
  highValueEscalationThreshold: 250,
};

export const supportCaseSlas = {
  standard: "Response within 1 business day",
  escalated: "Response within 4 business hours",
};

export const supportCases: SupportCase[] = [
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

export const returnCases: ReturnCase[] = [
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
