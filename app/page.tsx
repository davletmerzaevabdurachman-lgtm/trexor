"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CodeBlock, Markdown } from "@/components/Markdown";

type Msg = { role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; msgs: Msg[] };
const STEPS = ["Analysiere Anfrage", "Plane Lösung", "Erstelle Code"];
const IDEAS = ["Erkläre mir Quantencomputer einfach", "Hilf mir, einen Lernplan für Mathe zu erstellen", "Moderne Gaming-Website mit pinken Buttons", "Portfolio-Seite für einen Designer", "Taschenrechner im Dark Design"];
const Mark = ({ s = 26 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 26 26" aria-hidden><rect width="26" height="26" rx="8" fill="#ff2e93" /><path d="M7 8h12v3h-4.5v8h-3v-8H7z" fill="#000" /></svg>
);

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [think, setThink] = useState(true);
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [mobile, setMobile] = useState(false);
  const [side, setSide] = useState(false);
  const [rev, setRev] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    try { const s = localStorage.getItem("trexor.chats"); if (s) { const c = JSON.parse(s); setChats(c); setActiveId(c[0]?.id ?? null); } } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current || busy) return;
    try { localStorage.setItem("trexor.chats", JSON.stringify(chats.slice(0, 40))); } catch {}
  }, [chats, busy]);

  const chat = chats.find(c => c.id === activeId);
  const msgs = chat?.msgs ?? [];
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs]);

  const html = useMemo(() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i].content.match(/\`\`\`html\n([\s\S]*?)(\`\`\`|$)/);
      if (msgs[i].role === "assistant" && m) return m[1];
    }
    return "";
  }, [msgs]);

  async function run(id: string, history: Msg[]) {
    setBusy(true); setStep(0); setTimeout(() => setStep(s => (s === 0 ? 1 : s)), 1100);
    const put = (f: (m: Msg[]) => Msg[]) => setChats(cs => cs.map(c => (c.id === id ? { ...c, msgs: f(c.msgs) } : c)));
    put(() => [...history, { role: "assistant", content: "" }]);
    ctrl.current = new AbortController();
    try {
      const res = await fetch("/api/chat", { method: "POST", signal: ctrl.current.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history, think }) });
      if (!res.ok || !res.body) throw new Error("Die KI-Anfrage ist fehlgeschlagen. Prüfe die GROQ_API_KEY-Variablen.");
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.startsWith("data: ") || l.includes("[DONE]")) continue;
          let d: string | undefined;
          try { d = JSON.parse(l.slice(6)).choices?.[0]?.delta?.content; } catch {}
          if (!d) continue;
          setStep(2);
          put(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: c[c.length - 1].content + d }; return c; });
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        put(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: (e as Error).message }; return c; });
    } finally { setBusy(false); }
  }

  function send(t?: string) {
    const text = (t ?? input).trim(); if (!text || busy) return;
    const id = activeId ?? crypto.randomUUID();
    if (!activeId) { setChats(cs => [{ id, title: text.slice(0, 36), msgs: [] }, ...cs]); setActiveId(id); }
    setInput(""); run(id, [...msgs, { role: "user", content: text }]);
  }
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html" })); a.download = "index.html"; a.click(); };

  return (
    <main className={`app ${html ? "work" : ""}`}>
      <aside className={`side panel ${side ? "open" : ""}`}>
        <div className="brand"><Mark /><span>TREXOR</span></div>
        <button className="new" onClick={() => { setActiveId(null); setSide(false); }}>+ Neuer Chat</button>
        <nav className="hist">
          {chats.map(c => (
            <div key={c.id} className={`item ${c.id === activeId ? "on" : ""}`}>
              <button className="t" onClick={() => { setActiveId(c.id); setSide(false); }}>{c.title}</button>
              <button className="x" aria-label="Chat löschen" onClick={() => { setChats(cs => cs.filter(x => x.id !== c.id)); if (c.id === activeId) setActiveId(null); }}>×</button>
            </div>
          ))}
        </nav>
      </aside>

      <section className="chat panel">
        <header className="top">
          <button className="icon burger" aria-label="Verlauf" onClick={() => setSide(s => !s)}>☰</button>
          <span className="title">{chat?.title ?? "Neuer Chat"}</span>
        </header>
        <div className="msgs">
          {!msgs.length ? (
            <div className="hero">
              <Mark s={56} />
              <h1>Wie kann ich helfen?</h1>
              <p>Frag mich alles: erklären, rechnen, schreiben, planen oder programmieren. Websites zeigt TREXOR sofort live.</p>
              <div className="chips">{IDEAS.map(i => <button key={i} onClick={() => send(i)}>{i}</button>)}</div>
            </div>
          ) : msgs.map((m, i) => (
            <div key={i} className={`row ${m.role}`}>
              {m.role === "user" ? <div className="bubble">{m.content}</div> : (
                <div className="ai">
                  {!m.content && busy && <div className="status"><i /><i /><i />{think && step < 2 ? "Überlege gründlich" : STEPS[step]} …</div>}
                  <Markdown text={m.content} onOpenCode={() => setTab("code")} />
                  {m.content && !(busy && i === msgs.length - 1) && (
                    <div className="acts">
                      <button className="mini" onClick={() => navigator.clipboard.writeText(m.content)}>Kopieren</button>
                      {i === msgs.length - 1 && <button className="mini" onClick={() => run(activeId!, msgs.slice(0, -1))}>Neu generieren</button>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
        <div className="composer">
          <button className={`think ${think ? "on" : ""}`} aria-pressed={think} title="Denkmodus: gründlicher, aber etwas langsamer" onClick={() => setThink(t => !t)}>Denken</button>
          <textarea rows={1} value={input} placeholder="Nachricht an TREXOR …" aria-label="Nachricht"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          {busy ? <button className="send" onClick={() => ctrl.current?.abort()}>Stop</button> : <button className="send" disabled={!input.trim()} onClick={() => send()}>Senden</button>}
        </div>
      </section>

      {html && (
        <section className="panel workp">
          <div className="tabs">
            {(["preview", "code"] as const).map(t => <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t === "preview" ? "Preview" : "Code"}</button>)}
            <span className="sp" />
            {tab === "preview" && <>
              <button className="mini" onClick={() => setMobile(m => !m)}>{mobile ? "Desktop" : "Mobil"}</button>
              <button className="mini" onClick={() => setRev(r => r + 1)}>Neu laden</button>
            </>}
            <button className="mini" onClick={download}>Download</button>
          </div>
          {tab === "preview"
            ? <div className="stage"><iframe key={rev} title="Preview" className={mobile ? "mob" : ""} sandbox="allow-scripts" srcDoc={html} /></div>
            : <div className="codewrap"><CodeBlock lang="html" code={html} /></div>}
        </section>
      )}
    </main>
  );
}