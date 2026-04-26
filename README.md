# Bookly Support Agent

Bookly Support Agent is a customer support AI agent demo for Bookly, a fictional online bookstore.

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

## Demo Script

Use the seeded prompt buttons in the app, or type these manually.

1. Ask: `Where is my order?`
2. Provide: `My order is BK-1001 and my email is yael.descalo@example.com`
3. Enter one of the mock verification codes shown in the side panel.
4. Ask: `I want to return BK-1002 because I changed my mind. My email is yael.descalo@example.com`
5. Ask: `Check support case CASE-2048`

Other useful scenarios:

- Ineligible return: `I want to return BK-1003 because it arrived late. My email is yaeldescalo@demo.com`
- Arriving soon: `Where is order BK-1004?`
- Return instructions before arrival: `Send return instructions for BK-1004. My email is yaeldescalo@demo.com`
- Return case lookup: `Check return case RET-1002`
- High-value escalation: `I want to return BK-9001 because I changed my mind. My email is yaeldescalo@demo.com`
- Invalid code: enter a six-digit code that is not listed in the side panel.

## Mock Orders

| Order ID | Email | Book title | Status |
|---|---|---|---|
| `BK-1001` | `yael.descalo@example.com` | `Please Hold` | Shipped with UPS |
| `BK-1002` | `yael.descalo@example.com` | `From Hold Music to AOPs` | Delivered 12 days ago |
| `BK-1003` | `yaeldescalo@demo.com` | `The Concierge Standard` | Delivered 45 days ago |
| `BK-1004` | `yaeldescalo@demo.com` | `Faster Resolutions` | Arriving within 3-5 business days |
| `BK-9001` | `yaeldescalo@demo.com` | `Always Available` | Delivered 6 days ago, high-value |

## Capability Mapping

- Multi-turn interaction: the agent asks for missing order ID, email, return reason, and verification code.
- Tool/action: the agent calls mocked tools such as `lookupOrder`, `checkReturnEligibility`, `createReturn`, and `createEscalation`.
- Clarifying question: the agent refuses to answer order-specific questions until it has the required fields and verification.
- Support case tracking: the agent can look up mocked support cases and show SLA commitments.
- Return case tracking: the agent can look up mocked return IDs such as `RET-1002`.
- Architecture and prompt design: see [docs/agent-design.md](docs/agent-design.md).

## Design Tradeoff

The prototype uses deterministic orchestration and mocked tools rather than relying on an LLM. This keeps the demo reliable while showing how support requirements can be translated into safe, explainable workflows that can later be connected to production systems.
