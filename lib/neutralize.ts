import { callAI, parseJSON } from "./ai";

const SINGLE_NEUTRALIZE_SYSTEM_PROMPT = `You are a neutralization interpreter for a marital dispute resolution system.

Rewrite the given text so that:
1. ALL names → "Person A" or "Person B" (the narrator is the personLabel given)
2. ALL pronouns (he, she, him, her, his, hers, himself, herself) → "they/them/their/themself"
3. ALL gendered words:
   - husband/wife → "partner"
   - man/woman → "person"
   - boyfriend/girlfriend → "partner"
   - son/daughter → "child"
   - brother/sister → "sibling"
4. Emotional/dramatic language → factual statements
5. ALL facts and events preserved completely (never summarize)

CRITICAL: Judges must never know anyone's gender. You are the firewall.

Respond ONLY with valid JSON: { "neutralized": "rewritten text here" }`;

export async function neutralizeText(
  text: string,
  personLabel: "A" | "B" = "A"
): Promise<string> {
  if (!text || !text.trim()) return "";

  const userPrompt = `The narrator of this text is Person ${personLabel}. Neutralize completely:\n\n${text}\n\nRespond only with JSON.`;

  const raw = await callAI(SINGLE_NEUTRALIZE_SYSTEM_PROMPT, userPrompt);
  const result = parseJSON<{ neutralized: string }>(raw);
  return result.neutralized;
}

// ============================================================
// Dual neutralization (more efficient when both stories present)
// ============================================================
const DUAL_NEUTRALIZE_SYSTEM_PROMPT = `You are a neutralization interpreter for a marital dispute resolution system.

Rewrite BOTH stories so that:
1. All names → "Person A" or "Person B"
2. All pronouns → "they/them/their"
3. All gendered words → neutral equivalents
4. Emotional/dramatic language → factual statements
5. ALL facts and events preserved (never summarize)

If one story is more than 3x longer than the other, set wordCountWarning to true.

CRITICAL: Judges must never know anyone's gender.

Respond ONLY with valid JSON:
{
  "neutralizedA": "Person A's story rewritten",
  "neutralizedB": "Person B's story rewritten",
  "wordCountWarning": true or false
}`;

export async function neutralizeBothStories(
  storyA: string,
  storyB: string
): Promise<{ neutralizedA: string; neutralizedB: string; wordCountWarning: boolean }> {
  const userPrompt = `Neutralize both:\n\nPERSON A:\n${storyA}\n\nPERSON B:\n${storyB}\n\nRespond only with JSON.`;
  const raw = await callAI(DUAL_NEUTRALIZE_SYSTEM_PROMPT, userPrompt);
  return parseJSON(raw);
}
