"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
};

const IDEAS = [
  "Baue mir eine moderne Gaming-Website",
  "Erkläre mir Quantencomputer einfach",
  "Schreibe einen Lernplan für Mathe",
  "Programmiere einen Taschenrechner"
];

function makeId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function extractHtml(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "assistant") continue;

    const match = message.content.match(
      /\`\`\`(?:html|HTML)\\s*\\n?([\\s\\S]*?)(?:\`\`\`|$)/
    );

    if (match?.[1]) return match[1];
  }

  return "";
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

function CodeBlock({
  lang,
  code
}: {
  lang: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await copyText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  }

  return (
    <div className="code">
      <div className="codebar">
        <span>{lang || "text"}</span>
        <button className="mini" onClick={copy}>
          {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

function renderInline(text: string) {
  return text.split(/(\`[^\`]+\`|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("\`") && part.endsWith("\`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    return part;
  });
}

function MessageView({ message }: { message: Message }) {
  const parts = message.content.split(/(\`\`\`[\\s\\S]*?(?:\`\`\`|$))/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("\`\`\`")) {
          const match = part.match(/^\`\`\`(\\w*)\\s*\\n?([\\s\\S]*?)(?:\`\`\`)?$/);
          const lang = match?.[1] || "";
          const code = (match?.[2] || "").replace(/\\n$/, "");

          if (lang.toLowerCase() === "html") {
            return (
              <div className="filecard" key={index}>
                <div>
                  <b>index.html</b>
                  <small>Website-Code</small>
                </div>
              </div>
            );
          }

          return <CodeBlock key={index} lang={lang} code={code} />;
        }

        return part
          .trim()
          ? part
              .trim()
              .split(/\\n{2,}/)
              .map((paragraph, paragraphIndex) => (
                <p key={`${index}-${paragraphIndex}`}>
                  {renderInline(paragraph)}
                </p>
              ))
          : null;
      })}
    </>
  );
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [think, setThink] = useState(true);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [mobile, setMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("trexor.chats.v3");
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;

        if (Array.isArray(parsed)) {
          const safe = parsed.filter(
            (chat): chat is Chat =>
              Boolean(chat) &&
              typeof chat === "object" &&
              typeof (chat as Chat).id === "string" &&
              typeof (chat as Chat).title === "string" &&
              Array.isArray((chat as Chat).messages) &&
              (chat as Chat).messages.every(
                (message) =>
                  Boolean(message) &&
                  (message.role === "user" || message.role === "assistant") &&
                  typeof message.content === "string"
              )
          );

          setChats(safe.slice(0, 40));
          setActiveId(safe[0]?.id || null);
        }
      }
    } catch {
      localStorage.removeItem("trexor.chats.v3");
    } finally {
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || busy) return;

    try {
      localStorage.setItem(
        "trexor.chats.v3",
        JSON.stringify(chats.slice(0, 40))
      );
    } catch {}
  }, [chats, busy]);

  const activeChat = chats.find((chat) => chat.id === activeId);
  const messages = activeChat?.messages || [];
  const html = extractHtml(messages);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, messages[messages.length - 1]?.content.length]);

  async function runChat(chatId: string, history: Message[]) {
    setBusy(true);
    const assistantIndex = history.length;

    setChats((current) =>
      current.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                { role: "assistant", content: "" }
              ]
            }
          : chat
      )
    );

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, think })
      });

      if (!response.ok || !response.body) {
        let message = "Die KI-Anfrage ist fehlgeschlagen.";

        try {
          const data = await response.json();
          message = data?.error || message;
        } catch {}

        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;

          try {
            const data = JSON.parse(payload);
            const delta = data?.choices?.[0]?.delta?.content;

            if (typeof delta !== "string" || !delta) continue;

            setChats((current) =>
              current.map((chat) => {
                if (chat.id !== chatId) return chat;

                const next = [...chat.messages];
                const target = next[assistantIndex];

                if (!target) return chat;

                next[assistantIndex] = {
                  role: "assistant",
                  content: target.content + delta
                };

                return { ...chat, messages: next };
              })
            );
          } catch {}
        }
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        const message =
          error instanceof Error ? error.message : "Unbekannter Fehler.";

        setChats((current) =>
          current.map((chat) => {
            if (chat.id !== chatId) return chat;

            const next = [...chat.messages];
            next[assistantIndex] = {
              role: "assistant",
              content: `**Fehler:** ${message}`
            };

            return { ...chat, messages: next };
          })
        );
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function send(value?: string) {
    const text = (value ?? input).trim();
    if (!text || busy) return;

    const chatId = activeId || makeId();
    const currentMessages = activeChat?.messages || [];
    const history: Message[] = [
      ...currentMessages,
      { role: "user", content: text }
    ];

    if (!activeId) {
      setChats((current) => [
        {
          id: chatId,
          title: text.slice(0, 40),
          messages: [{ role: "user", content: text }]
        },
        ...current
      ]);
      setActiveId(chatId);
    } else {
      setChats((current) =>
        current.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: history }
            : chat
        )
      );
    }

    setInput("");
    setTab("preview");
    runChat(chatId, history);
  }

  function newChat() {
    abortRef.current?.abort();
    setBusy(false);
    setActiveId(null);
    setInput("");
    setSidebarOpen(false);
  }

  function deleteChat(chatId: string) {
    setChats((current) => current.filter((chat) => chat.id !== chatId));
    if (chatId === activeId) setActiveId(null);
  }

  function downloadHtml() {
    if (!html) return;

    const url = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" })
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = "index.html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={`app ${html ? "work" : ""}`}>
      <aside className={`side panel ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <Mark />
          <span>TREXOR</span>
        </div>

        <button className="new" onClick={newChat}>
          + Neuer Chat
        </button>

        <nav className="hist">
          {chats.map((chat) => (
            <div className={`item ${chat.id === activeId ? "on" : ""}`} key={chat.id}>
              <button
                className="t"
                onClick={() => {
                  setActiveId(chat.id);
                  setSidebarOpen(false);
                }}
              >
                {chat.title}
              </button>

              <button
                className="x"
                aria-label="Chat löschen"
                onClick={() => deleteChat(chat.id)}
              >
                ×
              </button>
            </div>
          ))}
        </nav>
      </aside>

      <section className="chat panel">
        <header className="top">
          <button
            className="icon burger"
            aria-label="Menü öffnen"
            onClick={() => setSidebarOpen((open) => !open)}
          >
            ☰
          </button>
          <span className="title">{activeChat?.title || "Neuer Chat"}</span>
        </header>

        <div className="msgs">
          {!messages.length ? (
            <div className="hero">
              <Mark s={60} />
              <h1>Wie kann ich helfen?</h1>
              <p>
                Frag TREXOR alles — erklären, rechnen, schreiben oder
                programmieren. Websites können direkt live angezeigt werden.
              </p>

              <div className="chips">
                {IDEAS.map((idea) => (
                  <button key={idea} onClick={() => send(idea)}>
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div className={`row ${message.role}`} key={index}>
                {message.role === "user" ? (
                  <div className="bubble">{message.content}</div>
                ) : (
                  <div className="ai">
                    {!message.content && busy && (
                      <div className="status">
                        <i />
                        <i />
                        <i />
                        {think ? "TREXOR denkt …" : "TREXOR schreibt …"}
                      </div>
                    )}

                    <MessageView message={message} />

                    {message.content && index === messages.length - 1 && !busy && (
                      <div className="acts">
                        <button
                          className="mini"
                          onClick={() => copyText(message.content)}
                        >
                          Kopieren
                        </button>

                        <button
                          className="mini"
                          onClick={() =>
                            runChat(activeId!, messages.slice(0, -1))
                          }
                        >
                          Neu generieren
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          <div ref={endRef} />
        </div>

        <div className="composer">
          <button
            className={`think ${think ? "on" : ""}`}
            aria-pressed={think}
            onClick={() => setThink((value) => !value)}
          >
            Denken
          </button>

          <textarea
            rows={1}
            value={input}
            placeholder="Nachricht an TREXOR …"
            aria-label="Nachricht"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />

          {busy ? (
            <button
              className="send"
              onClick={() => abortRef.current?.abort()}
            >
              Stop
            </button>
          ) : (
            <button
              className="send"
              disabled={!input.trim()}
              onClick={() => send()}
            >
              Senden
            </button>
          )}
        </div>
      </section>

      {html && (
        <section className="panel workp">
          <div className="tabs">
            <button
              className={`tab ${tab === "preview" ? "on" : ""}`}
              onClick={() => setTab("preview")}
            >
              Preview
            </button>

            <button
              className={`tab ${tab === "code" ? "on" : ""}`}
              onClick={() => setTab("code")}
            >
              Code
            </button>

            <span className="sp" />

            {tab === "preview" && (
              <>
                <button className="mini" onClick={() => setMobile((value) => !value)}>
                  {mobile ? "Desktop" : "Mobil"}
                </button>
                <button className="mini" onClick={() => setReload((value) => value + 1)}>
                  Neu laden
                </button>
              </>
            )}

            <button className="mini" onClick={downloadHtml}>
              Download
            </button>
          </div>

          {tab === "preview" ? (
            <div className="stage">
              <iframe
                key={reload}
                title="TREXOR Live Preview"
                className={mobile ? "mob" : ""}
                sandbox="allow-scripts"
                srcDoc={html}
              />
            </div>
          ) : (
            <div className="codewrap">
              <CodeBlock lang="html" code={html} />
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Mark({ s = 26 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 26 26" aria-hidden="true">
      <rect width="26" height="26" rx="8" fill="#ff2e93" />
      <path
        d="M7 8h12v3h-4.5v8h-3v-8H7z"
        fill="#000"
      />
    </svg>
  );
}
