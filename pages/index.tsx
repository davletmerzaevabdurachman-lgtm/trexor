import { useEffect, useRef, useState } from "react";
import Head from "next/head";

type Message = { role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; messages: Message[] };

const IDEAS = [
  "Baue mir eine moderne Gaming-Website",
  "Erkläre mir Quantencomputer einfach",
  "Schreibe einen Lernplan für Mathe",
  "Programmiere einen Taschenrechner"
];

const FENCE = String.fromCharCode(96, 96, 96);

function makeId() {
  return String(Date.now()) + "-" + Math.random().toString(36).slice(2);
}

function extractHtml(messages: Message[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const marker = FENCE + "html";
    const start = message.content.toLowerCase().indexOf(marker);
    if (start < 0) continue;
    const codeStart = message.content.indexOf("\n", start);
    if (codeStart < 0) continue;
    const end = message.content.indexOf(FENCE, codeStart + 1);
    return message.content.slice(
      codeStart + 1,
      end < 0 ? message.content.length : end
    );
  }
  return "";
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {}
}

function MessageView({ message }: { message: Message }) {
  const parts = message.content.split(FENCE);

  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          const lines = part.split("\n");
          const lang = (lines.shift() || "").trim();
          const code = lines.join("\n");

          if (lang.toLowerCase() === "html") {
            return (
              <div className="filecard" key={index}>
                <b>index.html</b>
                <small>Live-Preview verfügbar</small>
              </div>
            );
          }

          return <pre className="code" key={index}>{code}</pre>;
        }

        const trimmed = part.trim();
        if (!trimmed) return null;

        return trimmed.split(/\n{2,}/).map((paragraph, paragraphIndex) => (
          <p key={index + "-" + paragraphIndex}>{paragraph}</p>
        ));
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
  const [reload, setReload] = useState(0);
  const [menu, setMenu] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("trexor.chats.v5");
      const data = raw ? JSON.parse(raw) : [];
      if (Array.isArray(data)) {
        const safe = data.filter((chat: unknown): chat is Chat => {
          if (!chat || typeof chat !== "object") return false;
          const value = chat as Chat;
          return (
            typeof value.id === "string" &&
            typeof value.title === "string" &&
            Array.isArray(value.messages) &&
            value.messages.every(
              (message: unknown) =>
                Boolean(message) &&
                typeof message === "object" &&
                ((message as Message).role === "user" ||
                  (message as Message).role === "assistant") &&
                typeof (message as Message).content === "string"
            )
          );
        });

        setChats(safe.slice(0, 40));
        setActiveId(safe[0]?.id || null);
      }
    } catch {
      localStorage.removeItem("trexor.chats.v5");
    } finally {
      readyRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!readyRef.current || busy) return;
    try {
      localStorage.setItem(
        "trexor.chats.v5",
        JSON.stringify(chats.slice(0, 40))
      );
    } catch {}
  }, [chats, busy]);

  const chat = chats.find((value) => value.id === activeId);
  const messages = chat?.messages || [];
  const html = extractHtml(messages);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, messages[messages.length - 1]?.content.length]);

  async function run(chatId: string, history: Message[]) {
    setBusy(true);

    const assistantIndex = history.length;

    setChats((current) =>
      current.map((value) =>
        value.id === chatId
          ? {
              ...value,
              messages: [
                ...value.messages,
                { role: "assistant", content: "" }
              ]
            }
          : value
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
          message = data.error || message;
        } catch {}
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const result = await reader.read();
        if (result.done) break;

        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split("\n");
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
              current.map((value) => {
                if (value.id !== chatId) return value;

                const next = [...value.messages];
                const previous = next[assistantIndex]?.content || "";

                next[assistantIndex] = {
                  role: "assistant",
                  content: previous + delta
                };

                return { ...value, messages: next };
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
          current.map((value) => {
            if (value.id !== chatId) return value;

            const next = [...value.messages];
            next[assistantIndex] = {
              role: "assistant",
              content: "**Fehler:** " + message
            };

            return { ...value, messages: next };
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
    const history: Message[] = [
      ...(chat?.messages || []),
      { role: "user", content: text }
    ];

    setChats((current) => {
      if (current.some((value) => value.id === chatId)) {
        return current.map((value) =>
          value.id === chatId ? { ...value, messages: history } : value
        );
      }

      return [
        { id: chatId, title: text.slice(0, 40), messages: history },
        ...current
      ];
    });

    setActiveId(chatId);
    setInput("");
    setTab("preview");
    run(chatId, history);
  }

  function newChat() {
    abortRef.current?.abort();
    setBusy(false);
    setActiveId(null);
    setInput("");
    setMenu(false);
  }

  function deleteChat(chatId: string) {
    setChats((current) => current.filter((value) => value.id !== chatId));
    if (activeId === chatId) setActiveId(null);
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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <Head>
        <title>TREXOR</title>
        <meta name="theme-color" content="#000000" />
      </Head>

      <main className={"app " + (html ? "work" : "")}>
        <aside className={"side panel " + (menu ? "open" : "")}>
          <div className="brand">
            <Mark />
            <span>TREXOR</span>
          </div>

          <button className="new" onClick={newChat}>
            + Neuer Chat
          </button>

          <nav className="hist">
            {chats.map((value) => (
              <div
                className={"item " + (value.id === activeId ? "on" : "")}
                key={value.id}
              >
                <button
                  className="t"
                  onClick={() => {
                    setActiveId(value.id);
                    setMenu(false);
                  }}
                >
                  {value.title}
                </button>

                <button
                  className="x"
                  aria-label="Chat löschen"
                  onClick={() => deleteChat(value.id)}
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
              className="burger"
              onClick={() => setMenu((value) => !value)}
              aria-label="Menü"
            >
              ☰
            </button>
            <span className="title">
              {chat?.title || "Neuer Chat"}
            </span>
          </header>

          <div className="msgs">
            {!messages.length ? (
              <div className="hero">
                <Mark s={60} />
                <h1>Wie kann ich helfen?</h1>
                <p>
                  Frag TREXOR alles — erklären, rechnen, schreiben oder
                  programmieren.
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
                <div className={"row " + message.role} key={index}>
                  {message.role === "user" ? (
                    <div className="bubble">{message.content}</div>
                  ) : (
                    <div className="ai">
                      {!message.content && busy ? (
                        <div className="status">
                          <i />
                          <i />
                          <i />
                          {think
                            ? "TREXOR denkt …"
                            : "TREXOR schreibt …"}
                        </div>
                      ) : null}

                      <MessageView message={message} />

                      {message.content &&
                      index === messages.length - 1 &&
                      !busy ? (
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
                              run(activeId || "", messages.slice(0, -1))
                            }
                          >
                            Neu generieren
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))
            )}

            <div ref={endRef} />
          </div>

          <div className="composer">
            <button
              className={"think " + (think ? "on" : "")}
              onClick={() => setThink((value) => !value)}
            >
              {think ? "Denken an" : "Denken aus"}
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

        {html ? (
          <section className="panel workp">
            <div className="tabs">
              <button
                className={"tab " + (tab === "preview" ? "on" : "")}
                onClick={() => setTab("preview")}
              >
                Preview
              </button>

              <button
                className={"tab " + (tab === "code" ? "on" : "")}
                onClick={() => setTab("code")}
              >
                Code
              </button>

              <span className="sp" />

              {tab === "preview" ? (
                <>
                  <button
                    className="mini"
                    onClick={() => setMobile((value) => !value)}
                  >
                    {mobile ? "Desktop" : "Mobil"}
                  </button>

                  <button
                    className="mini"
                    onClick={() => setReload((value) => value + 1)}
                  >
                    Neu laden
                  </button>
                </>
              ) : null}

              <button className="mini" onClick={downloadHtml}>
                Download
              </button>
            </div>

            {tab === "preview" ? (
              <div className="stage">
                <iframe
                  key={reload}
                  title="TREXOR Preview"
                  className={mobile ? "mob" : ""}
                  sandbox="allow-scripts"
                  srcDoc={html}
                />
              </div>
            ) : (
              <div className="codewrap">
                <pre className="code">{html}</pre>
              </div>
            )}
          </section>
        ) : null}
      </main>
    </>
  );
}

function Mark({ s = 26 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 26 26" aria-hidden="true">
      <rect width="26" height="26" rx="8" fill="#ff2e93" />
      <path d="M7 8h12v3h-4.5v8h-3v-8H7z" fill="#000" />
    </svg>
  );
}
