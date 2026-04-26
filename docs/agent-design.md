# Bookly AI Support Agent Design

## Architecture Overview

The prototype is a web chat for Bookly support focused on order status, returns, support case tracking, and return case tracking. The flow is:

`Chat UI -> Agent Orchestrator -> Intent Router / AOP -> Memory -> Mock Tools -> Grounded Response`

The agent uses lightweight Agent Operating Procedure-style logic: identify the customer's intent, collect required fields, verify identity, call the right tool, and respond only from tool or policy results. I chose this structure because Decagon's value proposition is not just generating support text; it is safely orchestrating support workflows across business rules and systems.

## Conversation and Decision Design

The agent supports order status and returns deeply rather than covering many shallow intents. For order-specific requests, it requires order ID and email, sends a mocked one-time code, and only exposes order details after verification. If information is missing, it asks a targeted follow-up instead of guessing. For returns, it collects a reason, looks up the order, checks the policy, and either creates a return or escalates to a human. It can also look up support cases and return cases with grounded status information.

This design makes the agent predictable and explainable. The customer sees fast progress, while the system keeps clear boundaries around identity, policy, and tool execution.

## Example System Prompt

You are Bookly's customer support agent. Help customers with order status, return requests, support cases, and return case status. Be concise and friendly. Do not reveal order-specific information until the customer has provided order ID, email, and a valid verification code. Use tools for order lookups, return eligibility, return creation, case lookup, and escalations. Never invent order details, refund approvals, tracking numbers, case statuses, or policy exceptions. If required information is missing, ask one focused follow-up question. If the request is ambiguous, high-risk, outside policy, or cannot be verified, escalate with a clear summary for a human agent.

## Safety and Guardrails

The prototype blocks account-specific actions until verification succeeds. The agent only answers from mock order data and mock return policy results. It escalates invalid orders, high-value return requests, and out-of-window returns rather than inventing exceptions. Tool traces are visible in the UI to make the agent's decisions auditable during the demo.

## Production Readiness

To move quickly, I mocked customer data, tools, authentication, policy storage, observability, and handoff systems. In production, I would add verified customer authentication such as a one-time code sent to the email address on the order, real order/returns/shipping/CRM/helpdesk integrations, an API gateway and WAF for auth enforcement, rate limiting, abuse protection, and request validation, and persisted session transcripts, tool calls, outcomes, and summaries for historical memory.

I would also add multilingual detection and response, lifecycle rules for resolved, escalated, and abandoned chats, end-of-chat summaries, quick CSAT or thumbs-up feedback, and human handoff for failed authentication, angry sentiment, high-value refunds, VIP customers, policy exceptions, or repeated failed attempts. Operationally, I would add QA and observability for resolution rate, escalation rate, abandonment rate, CSAT, latency, tool failures, and hallucination or grounding issues, plus an evaluation suite for invalid orders, missing information, ineligible returns, prompt injection, unsupported languages, duplicate returns, and unclear intent.