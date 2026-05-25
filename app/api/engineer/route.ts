import { streamText } from "ai";
import { TIPS } from "@/lib/engineer";

/**
 * The Engineer, but smarter.
 *
 * POST /api/engineer
 * Body: { state: EngineerState }
 *
 * Returns a streamed text response. Uses Vercel AI Gateway model strings -
 * no provider-specific SDK lock-in. Requires AI_GATEWAY_API_KEY at runtime
 * (auto-provisioned on Vercel when AI Gateway is enabled).
 *
 * Graceful degradation: if no key, returns 503 with a hint. The deterministic
 * engineer in the UI keeps working regardless.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "anthropic/claude-haiku-4-5";

function systemPrompt(): string {
  const tipSummary = TIPS.map((t) => `- ${t.title}: ${t.body}`).join("\n");
  return `You are a 30-year veteran sound engineer. You've worked in Kingston dub studios, Berlin techno bunkers, Bombay film orchestras, and a damp basement in Bristol. Plainspoken, technical when needed, but never jargon for its own sake. You reference global traditions only when they genuinely clarify - dub, ma, gnawa, raga, Berlin minimalism, Eno's generative work. Never as flexes.

You're looking at a user's current BrainMix configuration - a brainwave entrainment + DJ mixing app. Your job: give them 2-3 short sentences of opinionated, specific guidance about what to adjust or try next, based on what you see.

Hard rules:
- Pick ONE most impactful change. Don't enumerate everything.
- Name specific values the user should change. ("Pull noise to 0.08." not "Lower the noise.")
- Don't lecture about theory unless it explains the WHY of your specific suggestion.
- Don't restate their state back to them.
- If everything's balanced, say so in one sentence and let them be.
- 2-3 sentences total. Hard cap.

For grounding, here's the deterministic tip library the user has already seen (these will already have surfaced if relevant - go BEYOND them):

${tipSummary}

When you suggest a fix, also identify which UI control they'd touch (e.g., "drop slot A's filter to 800 Hz" or "turn off the gamma boost"). Be a colleague at the next mixer, not a tutorial.`;
}

export async function POST(req: Request): Promise<Response> {
  let body: { state?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!body.state) {
    return new Response("Missing state", { status: 400 });
  }

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL) {
    return new Response(
      "The LLM engineer needs AI_GATEWAY_API_KEY. On Vercel, enable AI Gateway in your project settings - the key is auto-provisioned. Locally, run `vercel env pull` after linking the project.",
      { status: 503 },
    );
  }

  try {
    const result = streamText({
      model: MODEL,
      system: systemPrompt(),
      prompt: `Current state:\n\n${JSON.stringify(body.state, null, 2)}\n\nWhat's the single most impactful change you'd make right now? Be specific about the value.`,
      temperature: 0.7,
    });

    return result.toTextStreamResponse();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return new Response(`Engineer is unreachable: ${msg}`, { status: 502 });
  }
}
