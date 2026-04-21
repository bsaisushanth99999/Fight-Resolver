// ============================================================
// PROVIDER SWITCH — change ONE line to swap
// ============================================================
export const AI_PROVIDER: "openai" | "anthropic" = "openai";

const MODELS = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
};

const API_URLS = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
};

// ============================================================
// callAI — provider agnostic
// ============================================================
export async function callAI(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3
): Promise<string> {
  const provider = AI_PROVIDER;
  const model = MODELS[provider];

  if (provider === "openai") {
    const res = await fetch(API_URLS.openai, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  if (provider === "anthropic") {
    const res = await fetch(API_URLS.anthropic, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${await res.text()}`);
    const data = await res.json();
    return data.content[0].text;
  }

  throw new Error("Invalid AI_PROVIDER");
}

// ============================================================
// JSON parser — strips markdown fences if present
// ============================================================
export function parseJSON<T>(raw: string): T {
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as T;
}
