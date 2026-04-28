# Bookly Support Agent

Bookly Support Agent is a customer support AI agent demo for Bookly, a fictional online bookstore.

Hosted app: https://bookly-support-agent-gamma.vercel.app/

The demo focuses on the following flows:

- Order status workflow
- Return/refund workflow
- Multi-turn clarification
- Mocked one-time-code verification
- Mocked tool calls and policy checks
- Mocked support case status and SLA tracking
- Safe escalation instead of invented answers

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

To use `AI agent` mode locally, either enter an OpenAI API key in the app or start the backend with an OpenAI API key:

```bash
OPENAI_API_KEY="your_api_key_here" npm run dev
```

## Agent Modes

The app has two modes:

- `Workflow`: the default deterministic local orchestrator. It routes intent, tracks memory, calls mocked Bookly tools, and returns grounded responses without an LLM.
- `AI agent`: a model-driven path that calls the local backend route at `/api/agent`. The backend uses the OpenAI Responses API, executes the same mocked Bookly tools server-side, and returns the final customer-facing answer to the UI.

For hosted evaluation, enter your OpenAI API key in `AI agent` mode. The key is held only in the browser's current React state, is not saved to local storage, and is sent over HTTPS to `/api/agent` only when you send an AI-mode message. The backend uses that key for the request and does not store it. If a backend `OPENAI_API_KEY` is configured, the backend can use that instead.

## AI Agent Instructions and Guardrails

Current AI agent instructions:

- Act as Bookly's customer support agent for a fictional online bookstore.
- Help with order status, return requests, support cases, and return case status.
- Be concise and ask one focused follow-up question when required information is missing.
- Do not repeat a sentence or paragraph in the same response.
- Put each item on its own line when listing multiple orders, cases, steps, or facts.
- Format book names as `book title ("Title")`.
- Never invent order details, refund approvals, tracking numbers, case statuses, or policy exceptions.
- Do not provide order status, order lists, tracking numbers, return eligibility, or return creation from memory or guesses; use tool results for that data.
- If a return is escalated because it is high-value, clearly say it is because the order amount is above Bookly's high-value threshold.
- For order-specific information, collect order ID and email, send a verification code, and require a valid six-digit code before looking up orders, listing orders, creating returns, or sending return instructions.
- Support case and return case status lookups are allowed without order verification.

Additional backend guardrails:

- The backend enriches memory from the latest input and recent chat history so short follow-ups like `return`, `changed my mind`, or an email address stay attached to the active order.
- Return requests with an order ID but no reason are intercepted before the model call and ask for a return reason.
- Order-specific tools are blocked until verification succeeds.
- Exact duplicate sentences are removed from model responses.
- Multi-order responses are post-processed to keep each `BK-####` item on its own line.
- Tool calls remain visible only in the right-side Tool trace panel; chat bubbles stay customer-facing.

## Demo Script

Use the seeded prompt buttons in the app, or type these manually.

1. Ask: `Where is my order?`
2. Provide: `My order is BK-1001 and my email is yael.descalo@example.com`
3. Enter one of the mock verification codes shown in the side panel.
4. Ask: `I want to return BK-1002 because I changed my mind. My email is yael.descalo@example.com`
5. Ask: `Check support case CASE-2048`

Other useful scenarios:

- List all orders: `List my orders and their statuses for account yaeldescalo@demo.com`
- Ineligible return: `I want to return BK-1003 because it arrived late. My email is yaeldescalo@demo.com`
- Arriving soon: `Where is order BK-1004?`
- Return instructions before arrival: `Send return instructions for BK-1004. My email is yaeldescalo@demo.com`
- Return case lookup: `Check return case RET-1002`
- High-value escalation: `I want to return BK-9001 because I changed my mind. My email is yaeldescalo@demo.com`
- Invalid code: enter a six-digit code that is not listed in the side panel.

## Mock Orders


| Order ID  | Email                      | Book title                | Status                            |
| --------- | -------------------------- | ------------------------- | --------------------------------- |
| `BK-1001` | `yael.descalo@example.com` | `Please Hold`             | Shipped with UPS                  |
| `BK-1002` | `yael.descalo@example.com` | `From Hold Music to AOPs` | Delivered 12 days ago             |
| `BK-1003` | `yaeldescalo@demo.com`     | `The Concierge Standard`  | Delivered 45 days ago             |
| `BK-1004` | `yaeldescalo@demo.com`     | `Faster Resolutions`      | Arriving within 3-5 business days |
| `BK-9001` | `yaeldescalo@demo.com`     | `Always Available`        | Delivered 6 days ago, high-value  |


## Capability Mapping

- Multi-turn interaction: the agent asks for missing order ID, email, return reason, and verification code.
- Tool/action: the agent calls mocked tools such as `lookupOrder`, `checkReturnEligibility`, `createReturn`, and `createEscalation`.
- Clarifying question: the agent refuses to answer order-specific questions until it has the required fields and verification.
- Support case tracking: the agent can look up mocked support cases and show SLA commitments.
- Return case tracking: the agent can look up mocked return IDs such as `RET-1002`.
- Architecture and prompt design: see [docs/agent-design.md](docs/agent-design.md).

## Design Tradeoff

The prototype supports both deterministic orchestration and an OpenAI-backed agent mode. The workflow mode is more predictable for demos and tests. The AI agent mode is more flexible for natural follow-ups, but it is still constrained by backend tool execution, verification checks, response cleanup, and mocked Bookly data.
