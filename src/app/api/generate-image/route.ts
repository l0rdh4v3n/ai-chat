import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_ID = "google/gemini-2.5-flash-image";

type GenerateImageBody = {
  prompt?: unknown;
};

type OpenRouterImageResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

function extractImageDataUrl(content: unknown): string | null {
  const stringCandidates: string[] = [];

  function collect(value: unknown) {
    if (!value) {
      return;
    }

    if (typeof value === "string") {
      stringCandidates.push(value);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collect(item);
      }
      return;
    }

    if (typeof value === "object") {
      const candidate = value as Record<string, unknown>;
      collect(candidate.url);
      collect(candidate.image_url);
      collect(candidate.image);
      collect(candidate.content);
      collect(candidate.data);
      collect(candidate.base64);
    }
  }

  collect(content);

  for (const candidate of stringCandidates) {
    const dataUrlMatch = candidate.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);

    if (dataUrlMatch) {
      return dataUrlMatch[0];
    }

    const base64Like = candidate.match(/^[A-Za-z0-9+/=\n\r]+$/);

    if (base64Like) {
      return `data:image/png;base64,${candidate.replace(/\s+/g, "")}`;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as GenerateImageBody | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const upstreamResponse = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "AI Chat + Art Studio",
    },
    body: JSON.stringify({
      model: MODEL_ID,
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: `Generate an image matching this description: ${prompt}`,
        },
      ],
    }),
  });

  const responseText = await upstreamResponse.text();

  if (!upstreamResponse.ok) {
    return NextResponse.json(
      {
        error: responseText || `OpenRouter request failed with status ${upstreamResponse.status}.`,
      },
      { status: upstreamResponse.status },
    );
  }

  let parsedResponse: OpenRouterImageResponse | null = null;

  try {
    parsedResponse = JSON.parse(responseText) as OpenRouterImageResponse;
  } catch {
    parsedResponse = null;
  }

  const content = parsedResponse?.choices?.[0]?.message?.content;
  const imageDataUrl = extractImageDataUrl(content) ?? extractImageDataUrl(responseText);

  if (!imageDataUrl) {
    return NextResponse.json(
      {
        error: "OpenRouter responded but no image data URL could be extracted.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ imageDataUrl, prompt });
}