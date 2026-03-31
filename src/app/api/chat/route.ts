import { NextRequest, NextResponse } from "next/server";
import { getPersonality } from "@/lib/personalities";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODELS = [
  "deepseek/deepseek-v3.2",
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
  "meta-llama/llama-3.3-70b-instruct",
  "mistralai/mistral-small-3.1-24b-instruct",
];

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  attachments?: ChatAttachment[];
};

type ChatAttachment = {
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
};

type ChatRequestBody = {
  messages?: unknown;
  personality?: string;
};

type OpenRouterErrorPayload = {
  error?: {
    message?: string;
    code?: number | string;
  };
};

export const runtime = "nodejs";

function getModelCandidates() {
  const configuredModels = process.env.OPENROUTER_MODELS
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return configuredModels?.length ? configuredModels : DEFAULT_MODELS;
}

function getMultimodalModelCandidates() {
  const configuredModels = process.env.OPENROUTER_MULTIMODAL_MODELS
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  if (configuredModels?.length) {
    return configuredModels;
  }

  return [
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash-001",
    "meta-llama/llama-3.3-70b-instruct",
    "mistralai/mistral-small-3.1-24b-instruct",
    "deepseek/deepseek-v3.2",
  ];
}

function extractErrorMessage(errorText: string, model: string) {
  const fallbackMessage = errorText || `OpenRouter request failed for ${model}.`;

  try {
    const parsed = JSON.parse(errorText) as OpenRouterErrorPayload;
    const message = parsed.error?.message;

    return message ? `${model}: ${message}` : `${model}: ${fallbackMessage}`;
  } catch {
    return `${model}: ${fallbackMessage}`;
  }
}

function shouldRetryWithFallback(status: number, hasAttachments: boolean) {
  return hasAttachments ? ![401, 402].includes(status) : ![400, 401, 402].includes(status);
}

function createUpstreamBody(messages: ChatMessage[], model: string, systemPrompt: string) {
  return JSON.stringify({
    model,
    stream: true,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...messages.map((message) => ({
        role: message.role,
        content: createMessageContent(message),
      })),
    ],
  });
}

function createMessageContent(message: ChatMessage) {
  const contentParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];

  if (message.text.trim()) {
    contentParts.push({
      type: "text",
      text: message.text,
    });
  }

  for (const attachment of message.attachments ?? []) {
    contentParts.push({
      type: "image_url",
      image_url: {
        url: attachment.dataUrl,
      },
    });
  }

  if (!contentParts.length) {
    return "";
  }

  return contentParts.length === 1 && contentParts[0].type === "text" ? contentParts[0].text : contentParts;
}

function createStreamingResponse(upstreamResponse: Response, model: string) {
  if (!upstreamResponse.body) {
    return NextResponse.json(
      { error: `OpenRouter returned an empty response body for ${model}.` },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstreamResponse.body.getReader();
  let buffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

          while (buffer.includes("\n\n")) {
            const boundaryIndex = buffer.indexOf("\n\n");
            const eventBlock = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + 2);

            const dataLines = parseEventData(eventBlock);

            for (const dataLine of dataLines) {
              if (dataLine === "[DONE]") {
                controller.close();
                return;
              }

              const parsed = JSON.parse(dataLine) as {
                choices?: Array<{
                  delta?: {
                    content?: string;
                  };
                }>;
              };

              const content = parsed.choices?.[0]?.delta?.content;

              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            }
          }
        }

        const trailingData = parseEventData(buffer);

        for (const dataLine of trailingData) {
          if (dataLine === "[DONE]") {
            break;
          }

          const parsed = JSON.parse(dataLine) as {
            choices?: Array<{
              delta?: {
                content?: string;
              };
            }>;
          };

          const content = parsed.choices?.[0]?.delta?.content;

          if (content) {
            controller.enqueue(encoder.encode(content));
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    cancel() {
      reader.cancel().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Model": model,
    },
  });
}

function parseEventData(eventBlock: string) {
  return eventBlock
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ChatMessage>;

  if (candidate.attachments && (!Array.isArray(candidate.attachments) || !candidate.attachments.every(isChatAttachment))) {
    return false;
  }

  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.text === "string"
  );
}

function isChatAttachment(value: unknown): value is ChatAttachment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ChatAttachment>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.mimeType === "string" &&
    candidate.mimeType.startsWith("image/") &&
    typeof candidate.dataUrl === "string" &&
    candidate.dataUrl.startsWith("data:image/") &&
    typeof candidate.size === "number" &&
    Number.isFinite(candidate.size)
  );
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as ChatRequestBody | null;

  if (!body || !Array.isArray(body.messages) || !body.messages.every(isChatMessage)) {
    return NextResponse.json(
      { error: "Request body must include a valid messages array." },
      { status: 400 },
    );
  }

  const personality = getPersonality(body.personality);
  const hasAttachments = body.messages.some(
    (message) => message.attachments?.length,
  );
  const modelCandidates = hasAttachments ? getMultimodalModelCandidates() : getModelCandidates();

  const failures: string[] = [];
  let lastStatus = 502;

  for (const model of modelCandidates) {
    const upstreamResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: createUpstreamBody(body.messages, model, personality.prompt),
    });

    if (upstreamResponse.ok) {
      return createStreamingResponse(upstreamResponse, model);
    }

    lastStatus = upstreamResponse.status;

    const errorText = await upstreamResponse.text();
    failures.push(extractErrorMessage(errorText, model));

    if (!shouldRetryWithFallback(upstreamResponse.status, hasAttachments)) {
      return NextResponse.json(
        {
          error: failures[failures.length - 1],
          triedModels: failures.map((failure) => failure.split(":")[0]),
          personality: personality.id,
        },
        { status: upstreamResponse.status },
      );
    }
  }

  const privacyRestrictionFailure = failures.some((failure) =>
    failure.toLowerCase().includes("privacy"),
  );

  return NextResponse.json(
    {
      error: privacyRestrictionFailure
        ? "All configured fallback models were blocked by your current OpenRouter privacy settings. Update https://openrouter.ai/settings/privacy or use a key with broader provider access."
        : "All configured fallback models failed on OpenRouter.",
      triedModels: modelCandidates,
      details: failures,
      personality: personality.id,
    },
    { status: lastStatus },
  );
}
