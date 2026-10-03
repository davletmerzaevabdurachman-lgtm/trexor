import type { NextApiRequest, NextApiResponse } from "next";
import { groqChat } from "../../lib/groq";

export const config = {
  api: {
    bodyParser: true,
    responseLimit: false
  }
};

type Message = {
  role: "user" | "assistant";
  content: string;
};

function errorText(value: unknown) {
  if (value instanceof Error) return value.message;
  return "Unbekannter Serverfehler.";
}

function sendJsonError(res: NextApiResponse, status: number, message: string) {
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJsonError(res, 405, "Nur POST wird unterstützt.");
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const think = Boolean(body?.think);

  const safeMessages: Message[] = messages.filter(
    (message: unknown): message is Message =>
      Boolean(message) &&
      typeof message === "object" &&
      (message as Message).role !== undefined &&
      ((message as Message).role === "user" ||
        (message as Message).role === "assistant") &&
      typeof (message as Message).content === "string"
  );

  if (!safeMessages.length) {
    return sendJsonError(res, 400, "Keine Nachrichten übergeben.");
  }

  const controller = new AbortController();
  const abort = () => controller.abort();

  req.once("aborted", abort);

  try {
    const upstream = await groqChat(
      [{ role: "system", content: SYSTEM_PROMPT }, ...safeMessages],
      think,
      controller.signal
    );

    if (!upstream.ok || !upstream.body) {
      let detail = "KI-Anfrage fehlgeschlagen.";
      try {
        const raw = await upstream.text();
        const parsed = JSON.parse(raw);
        detail = parsed?.error?.message || detail;
      } catch {}

      return sendJsonError(res, upstream.status || 502, detail);
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } finally {
      reader.releaseLock();
      if (!res.writableEnded) res.end();
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (!res.writableEnded) res.end();
      return;
    }

    sendJsonError(res, 500, errorText(error));
  } finally {
    req.off("aborted", abort);
  }
}
