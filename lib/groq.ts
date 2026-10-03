// Serverseitig: Key-Rotation mit Fallback (Key 1 -> 2 -> 3). Keys verlassen nie den Server.
let start = 0;
const keys = () =>
  [process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3].filter(Boolean) as string[];

export async function groqChat(messages: unknown[], think = false, signal?: AbortSignal): Promise<Response> {
  const list = keys();
  if (!list.length) throw new Error("Kein GROQ_API_KEY_* gesetzt.");
  const body: Record<string, unknown> = {
    model: think ? process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b" : process.env.GROQ_MODEL_FAST || "llama-3.3-70b-versatile",
    messages, stream: true,
  };
  if (think) { body.reasoning_effort = "medium"; body.include_reasoning = false; }
  let last: Response | null = null;
  for (let i = 0; i < list.length; i++) {
    const idx = (start + i) % list.length;
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${list[idx]}` },
        body: JSON.stringify(body),
      });
      if (res.ok) { start = idx; return res; }
      last = res;
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) { if ((e as Error).name === "AbortError") throw e; }
  }
  start = (start + 1) % list.length;
  return last ?? new Response("Groq nicht erreichbar", { status: 502 });
}