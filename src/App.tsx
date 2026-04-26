import { FormEvent, useMemo, useState } from "react";
import { initialMemory, respond } from "./agent";
import { supportCases } from "./data";
import type { Memory, Message } from "./types";

const demoPrompts = [
  "Where is my order?",
  "My order is BK-1001 and my email is yael.descalo@example.com",
  "I want to return BK-1002 because I changed my mind. My email is yael.descalo@example.com",
  "I want to return BK-1003 because it arrived late. My email is yaeldescalo@demo.com",
  "Check support case CASE-2048",
  "Send return instructions for BK-1004. My email is yaeldescalo@demo.com",
];

function newId() {
  return crypto.randomUUID();
}

function StatusPanel({ memory }: { memory: Memory }) {
  const fields = [
    ["Intent", memory.intent],
    ["Order ID", memory.orderId ?? "Needed"],
    ["Email", memory.email ?? "Needed"],
    ["Return reason", memory.returnReason ?? "Needed for returns"],
    ["Verification", memory.verified ? "Verified" : memory.verificationSent ? "Code sent" : "Not started"],
  ];

  return (
    <aside className="status-panel" aria-label="Agent state">
      <div>
        <p className="eyebrow">Agent state</p>
        <h2>Workflow checkpoint</h2>
      </div>
      <dl>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="note">
        Mock verification codes: <strong>123456</strong> or <strong>010101</strong>. Order-specific actions stay blocked until verification succeeds.
      </div>
    </aside>
  );
}

function SupportCasesPanel() {
  return (
    <aside className="status-panel" aria-label="Support cases">
      <div>
        <p className="eyebrow">Support cases</p>
        <h2>Status and SLA</h2>
      </div>
      <div className="case-list">
        {supportCases.map((supportCase) => (
          <div className="case-card" key={supportCase.id}>
            <div>
              <strong>{supportCase.id}</strong>
              <span>{supportCase.status.replaceAll("_", " ")}</span>
            </div>
            <p>{supportCase.summary}</p>
            <small>{supportCase.sla}</small>
          </div>
        ))}
      </div>
    </aside>
  );
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <article className={`message ${message.sender}`}>
      <div className="message-meta">{message.sender === "agent" ? "Bookly agent" : "Customer"}</div>
      <p>{message.text}</p>
      {message.toolCalls && message.toolCalls.length > 0 ? (
        <div className="tool-stack" aria-label="Tool calls">
          {message.toolCalls.map((call, index) => (
            <div className="tool-call" key={`${call.name}-${index}`}>
              <span>{call.name}</span>
              <small>
                {call.input} {"->"} {call.output}
              </small>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [memory, setMemory] = useState<Memory>(initialMemory);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: newId(),
      sender: "agent",
      text:
        "Hi, I'm Bookly's support agent. I can help with order status and returns. I will verify your email before showing order details or taking action.",
    },
  ]);

  const lastToolCalls = useMemo(() => messages.flatMap((message) => message.toolCalls ?? []).slice(-4), [messages]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage: Message = {
      id: newId(),
      sender: "user",
      text: trimmed,
    };
    const result = respond(trimmed, memory);
    const agentMessage: Message = {
      id: newId(),
      sender: "agent",
      text: result.text,
      toolCalls: result.toolCalls,
    };

    setMessages((current) => [...current, userMessage, agentMessage]);
    setMemory(result.memory);
    setInput("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(input);
  }

  function resetDemo() {
    setMemory(initialMemory);
    setMessages([
      {
        id: newId(),
        sender: "agent",
        text:
          "Hi, I'm Bookly's support agent. I can help with order status and returns. I will verify your email before showing order details or taking action.",
      },
    ]);
    setInput("");
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Bookly support prototype</p>
          <h1>AI agent for order status and returns</h1>
          <p>Support workflow Demo, by Yael Descalo</p>
        </div>
        <button className="secondary-button" onClick={resetDemo} type="button">
          Reset
        </button>
      </section>

      <section className="workspace">
        <div className="chat-card">
          <div className="prompt-row" aria-label="Demo prompts">
            {demoPrompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => send(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <div className="messages" aria-live="polite">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <input
              aria-label="Customer message"
              placeholder="Ask about an order or return..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button type="submit">Send</button>
          </form>
        </div>

        <div className="side-column">
          <StatusPanel memory={memory} />
          <SupportCasesPanel />
          <aside className="status-panel" aria-label="Recent tool calls">
            <div>
              <p className="eyebrow">Tool trace</p>
              <h2>Recent actions</h2>
            </div>
            {lastToolCalls.length ? (
              <div className="tool-list">
                {lastToolCalls.map((call, index) => (
                  <div className="tool-call" key={`${call.name}-recent-${index}`}>
                    <span>{call.name}</span>
                    <small>{call.output}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No tools called yet.</p>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
