let cursor = 0;

function getKeys() {
  return [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3
  ].filter((value): value is string => Boolean(value?.trim()));
}

export async function groqChat(
  messages: unknown[],
  think = false,
  signal?: AbortSignal
): Promise<Response> {
  const keys = getKeys();

  if (!keys.length) {
    throw new Error("Keine GROQ_API_KEY_* Variable in Vercel gesetzt.");
  }

  const model = think
    ? process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b"
    : process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b";

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true
  };

  if (think) {
    body.reasoning_effort = "medium";
    body.reasoning_format = "hidden";
  }

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const index = (cursor + attempt) % keys.length;

    try {
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keys[index]}`
          },
          body: JSON.stringify(body),
          signal
        }
      );

      if (response.ok) {
        cursor = index;
        return response;
      }

      lastResponse = response;

      if (response.status !== 429 && response.status < 500) {
        break;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
    }
  }

  cursor = (cursor + 1) % keys.length;
  return lastResponse || new Response("Groq nicht erreichbar.", { status: 502 });
}
