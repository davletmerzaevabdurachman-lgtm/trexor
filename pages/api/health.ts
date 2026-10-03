import type { NextApiRequest, NextApiResponse } from "next";

type Health = {
  ok: boolean;
  groqConfigured: boolean;
  keysConfigured: number;
  modelFast: string;
  modelThink: string;
};

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse<Health>
) {
  const keys = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3
  ].filter((value) => Boolean(value));

  res.status(200).json({
    ok: true,
    groqConfigured: keys.length > 0,
    keysConfigured: keys.length,
    modelFast: process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b",
    modelThink: process.env.GROQ_MODEL_THINK || "openai/gpt-oss-120b"
  });
}
