# Bookly AI Support Agent Design

## Architecture Overview

Bookly Support Agent is a web chat for order status, returns, support case tracking, and return case tracking. It now supports two execution modes:

`Workflow mode: Chat UI -> Deterministic Agent Orchestrator -> Memory -> Mock Tools -> Customer Response`

`AI agent mode: Chat UI -> /api/agent Backend Route -> OpenAI Responses API -> Backend Tool Execution -> Customer Response`

The browser never calls OpenAI directly. In AI agent mode, the UI posts the customer message, current workflow memory, recent chat history, selected model, and an optional user-provided OpenAI API key to `/api/agent`. Locally, Vite mounts this route through `server/agentHandler.ts`. On Vercel, `api/agent.ts` serves the same route as a Vercel Function and reuses the same shared backend logic. The backend uses the provided key for that request, or falls back to `OPENAI_API_KEY` from its environment when configured. It then calls the OpenAI Responses API, executes mocked Bookly tools on behalf of the model, and returns a final response.

For hosted evaluation, the API key entered in the UI is held only in the browser's current React state. It is not saved to local storage. It is sent over HTTPS to the backend only with AI-mode requests, used for that request, and not persisted by the app.

## Mode Behavior

`Workflow` is the default mode. It uses deterministic TypeScript logic to detect intent, collect missing fields, verify the customer, call mocked Bookly tools, and return predictable responses. It is best for repeatable demos, testable workflow behavior, and showing explicit support-policy orchestration.

`AI agent` uses a model for natural-language reasoning and follow-up handling, but keeps business actions behind backend tool calls. Recent chat history is sent to the backend so short follow-ups like an email address, `changed my mind`, or `return` remain connected to the active order and intent. The backend also enriches memory from the latest message before calling the model.

## Conversation and Decision Design

For order-specific requests, the agent requires order ID and email, sends a mocked one-time code, and only exposes order details after verification. Mock verification codes are `123456` and `121212`.

For returns, the agent must collect a return reason before checking eligibility or creating a return. If the user says `I want to return BK-1002`, the backend preserves `BK-1002` in memory and asks for the reason. A follow-up like `changed my mind` stays attached to that order. After the reason is collected, the agent verifies the customer, looks up the order, checks the return policy, and either creates a return or escalates to a support case.

For high-value returns, such as `BK-9001`, the response must clearly explain that escalation is due to the order amount being above Bookly's high-value threshold. Out-of-window returns and high-value returns are escalated instead of approved automatically.

Support case and return case status lookups can be answered from mocked case tools without order verification.

## Current AI Instructions

The AI agent currently receives these instructions:

- You are Bookly's customer support agent for a fictional online bookstore.
- Help customers with order status, return requests, support cases, and return case status.
- Be concise and ask one focused follow-up question when required information is missing.
- Do not repeat a sentence or paragraph in the same response.
- When listing multiple orders, cases, steps, or facts, put each item on its own line.
- When a response has an intro sentence plus multiple item sentences, put a line break after the intro sentence.
- When mentioning a book, format it as `book title ("Title")`.
- Never invent order details, refund approvals, tracking numbers, case statuses, or policy exceptions.
- Do not provide order status, order lists, tracking numbers, return eligibility, or return creation from memory or guesses. Use a tool result for that data.
- If a return is escalated because it is high-value, clearly say it is because the order amount is above Bookly's high-value threshold.
- Order-specific information is protected: collect order ID and email, send a verification code, and require a valid six-digit verification code before looking up orders, listing orders, creating returns, or sending return instructions.
- Support case and return case status lookups are allowed without order verification.
- Use tools whenever answering from Bookly data or taking an action.

## Guardrails

The backend enforces additional guardrails outside the model:

- The browser never calls OpenAI directly; OpenAI requests are made from the backend route.
- User-provided API keys are session-only in the browser and request-scoped on the backend. A backend `OPENAI_API_KEY` can be used as a fallback for local or managed deployments.
- Order-specific tools are blocked until verification succeeds.
- Return requests with an order ID but no return reason are intercepted before a model call and ask for the reason.
- Memory is enriched from user input so order ID, email, return intent, return reason, and all-orders intent persist across short follow-ups.
- If the customer changes to a different return order, stale return reason state is cleared.
- Exact duplicate sentences are removed from model responses before they reach the chat UI.
- Multi-order responses are post-processed so each `BK-####` item appears on its own line.
- Tool traces are visible only in the right-side Tool trace panel. Customer chat bubbles do not show debug/tool-call blocks.
- The agent only answers order and return facts from mock tool results, not from model guesses.

## Mock Tools

The same mocked Bookly tools back both modes:

- `sendVerificationCode`
- `verifyCode`
- `lookupOrder`
- `lookupOrdersByEmail`
- `checkReturnEligibility`
- `createReturn`
- `createEscalation`
- `sendReturnInstructions`
- `lookupSupportCase`
- `lookupReturnCase`

## Production Readiness

The backend route is intentionally lightweight. For local development, it runs through Vite middleware. For hosted deployment, `api/agent.ts` runs as a Vercel Function. In production, I would keep `OPENAI_API_KEY` in managed secrets, add rate limiting and request validation, and connect tools to real order, returns, shipping, CRM, helpdesk, and authentication systems.

I would also save chat history, tool calls, outcomes, and summaries so support teams can review past conversations. I would add simple status handling for resolved, escalated, and abandoned chats; support multilingual detection and response; and add human handoff for failed authentication, angry sentiment, high-value refunds, VIP customers, policy exceptions, or repeated failed attempts.

Operationally, I would add QA and observability for resolution rate, escalation rate, abandonment rate, CSAT, latency, tool failures, and hallucination or grounding issues.
