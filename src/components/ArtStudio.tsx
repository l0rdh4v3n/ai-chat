"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";

type ArtCard = {
  id: string;
  prompt: string;
  title: string;
  height: number;
  imageUrl?: string;
  palette: {
    background: string;
    glow: string;
    accent: string;
  };
};

type Tone = ArtCard["palette"];

const STARTER_CARDS: ArtCard[] = [
  {
    id: "fox-dawn",
    prompt: "A neon fox running through a chrome desert at sunrise",
    title: "Chrome Run",
    height: 300,
    palette: {
      background: "from-rose-500 via-orange-400 to-amber-200",
      glow: "bg-rose-400/35",
      accent:
        "bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.44),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.16),_transparent_34%)]",
    },
  },
  {
    id: "glass-garden",
    prompt: "Floating glass flowers over a moonlit city skyline",
    title: "Sky Garden",
    height: 390,
    palette: {
      background: "from-cyan-400 via-sky-500 to-indigo-950",
      glow: "bg-cyan-300/30",
      accent:
        "bg-[radial-gradient(circle_at_25%_20%,_rgba(255,255,255,0.28),_transparent_32%),radial-gradient(circle_at_80%_30%,_rgba(255,255,255,0.14),_transparent_26%)]",
    },
  },
  {
    id: "atelier",
    prompt: "A surreal artist studio with holographic paint and star maps",
    title: "Hologram Atelier",
    height: 330,
    palette: {
      background: "from-fuchsia-500 via-violet-500 to-slate-950",
      glow: "bg-fuchsia-400/30",
      accent:
        "bg-[radial-gradient(circle_at_40%_30%,_rgba(255,255,255,0.28),_transparent_28%),radial-gradient(circle_at_70%_75%,_rgba(255,255,255,0.16),_transparent_24%)]",
    },
  },
  {
    id: "reef",
    prompt: "Bioluminescent coral rendered as abstract sculpture",
    title: "Midnight Reef",
    height: 360,
    palette: {
      background: "from-emerald-400 via-teal-500 to-slate-950",
      glow: "bg-emerald-300/28",
      accent:
        "bg-[radial-gradient(circle_at_20%_20%,_rgba(255,255,255,0.3),_transparent_28%),radial-gradient(circle_at_85%_70%,_rgba(255,255,255,0.12),_transparent_24%)]",
    },
  },
];

const TONES: Tone[] = [
  {
    background: "from-amber-300 via-rose-400 to-slate-950",
    glow: "bg-amber-300/30",
    accent:
      "bg-[radial-gradient(circle_at_18%_30%,_rgba(255,255,255,0.26),_transparent_30%),radial-gradient(circle_at_76%_76%,_rgba(255,255,255,0.14),_transparent_24%)]",
  },
  {
    background: "from-cyan-400 via-sky-500 to-indigo-900",
    glow: "bg-cyan-300/35",
    accent:
      "bg-[radial-gradient(circle_at_25%_20%,_rgba(255,255,255,0.3),_transparent_32%),radial-gradient(circle_at_80%_30%,_rgba(255,255,255,0.14),_transparent_26%)]",
  },
  {
    background: "from-fuchsia-500 via-violet-500 to-slate-950",
    glow: "bg-fuchsia-400/35",
    accent:
      "bg-[radial-gradient(circle_at_40%_30%,_rgba(255,255,255,0.3),_transparent_28%),radial-gradient(circle_at_70%_75%,_rgba(255,255,255,0.16),_transparent_24%)]",
  },
  {
    background: "from-emerald-400 via-teal-500 to-slate-950",
    glow: "bg-emerald-300/30",
    accent:
      "bg-[radial-gradient(circle_at_20%_20%,_rgba(255,255,255,0.3),_transparent_28%),radial-gradient(circle_at_85%_70%,_rgba(255,255,255,0.12),_transparent_24%)]",
  },
  {
    background: "from-indigo-500 via-sky-600 to-slate-950",
    glow: "bg-indigo-300/30",
    accent:
      "bg-[radial-gradient(circle_at_18%_24%,_rgba(255,255,255,0.26),_transparent_30%),radial-gradient(circle_at_78%_72%,_rgba(255,255,255,0.14),_transparent_24%)]",
  },
];

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function selectTone(index: number) {
  return TONES[index % TONES.length];
}

function createGeneratedCard(prompt: string, index: number): ArtCard {
  const tone = selectTone(index);

  return {
    id: createId("art"),
    prompt,
    title: prompt.split(/\s+/).slice(0, 3).join(" ") || "Untitled",
    height: 280 + (index % 4) * 30,
    palette: tone,
  };
}

function LoadingCard({ prompt }: { prompt: string }) {
  return (
    <article className="break-inside-avoid overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5 shadow-[0_18px_70px_rgba(0,0,0,0.28)]">
      <div className="p-4">
        <div className="flex h-[320px] items-center justify-center rounded-[1.35rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.05))]">
          <div className="flex flex-col items-center gap-4 text-center text-white/70">
            <div className="flex gap-2">
              <span className="h-3 w-3 animate-pulse rounded-full bg-white/70" />
              <span className="h-3 w-3 animate-pulse rounded-full bg-white/45 [animation-delay:150ms]" />
              <span className="h-3 w-3 animate-pulse rounded-full bg-white/25 [animation-delay:300ms]" />
            </div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-100/80">Generating</p>
            <p className="max-w-[18rem] text-sm leading-6 text-white/65">{prompt}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="h-3 w-28 rounded-full bg-white/12" />
        <div className="mt-3 h-4 w-full rounded-full bg-white/8" />
        <div className="mt-2 h-4 w-3/4 rounded-full bg-white/8" />
      </div>
    </article>
  );
}

function ArtCardView({ card }: { card: ArtCard }) {
  return (
    <article className="break-inside-avoid overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5 shadow-[0_18px_70px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_24px_90px_rgba(0,0,0,0.35)]">
      <div className="p-4">
        <div
          className={`relative overflow-hidden rounded-[1.35rem] ${card.imageUrl ? "bg-[#090d18]" : `bg-gradient-to-br ${card.palette.background} ${card.palette.accent}`}`}
          style={{ height: card.height }}
        >
          {card.imageUrl ? (
            <>
              <Image
                alt={card.title}
                className="object-cover"
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                src={card.imageUrl}
                unoptimized
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,8,20,0.05),transparent_45%,rgba(0,0,0,0.28)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="max-w-[80%] rounded-2xl border border-white/15 bg-black/25 px-4 py-3 backdrop-blur-md">
                  <p className="text-xs uppercase tracking-[0.32em] text-white/65">Generated image</p>
                  <p className="mt-2 text-sm leading-6 text-white/88">{card.title}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={`absolute inset-0 ${card.palette.glow} blur-3xl`} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent_38%,rgba(0,0,0,0.25)_100%)]" />
              <div className="absolute left-5 top-5 h-12 w-12 rounded-full border border-white/20 bg-white/18 backdrop-blur-md" />
              <div className="absolute bottom-5 right-5 h-20 w-20 rounded-full border border-white/20 bg-black/10 backdrop-blur-md" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="max-w-[80%] rounded-2xl border border-white/15 bg-black/20 px-4 py-3 backdrop-blur-md">
                  <p className="text-xs uppercase tracking-[0.32em] text-white/65">Generated preview</p>
                  <p className="mt-2 text-sm leading-6 text-white/88">Visual palette for: {card.title}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 p-4">
        <p className="text-[0.7rem] uppercase tracking-[0.35em] text-cyan-200/70">Prompt</p>
        <p className="mt-2 text-sm leading-6 text-white/80">{card.prompt}</p>
      </div>
    </article>
  );
}

export default function ArtStudio() {
  const [prompt, setPrompt] = useState("");
  const [cards, setCards] = useState<ArtCard[]>(STARTER_CARDS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      pendingRequestRef.current?.abort();
    };
  }, []);

  function getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return "Image generation failed. Please try again.";
  }

  async function generateImage(promptText: string) {
    const response = await fetch("/api/generate-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: promptText }),
      signal: pendingRequestRef.current?.signal,
    });

    const responseBody = (await response.json().catch(() => null)) as
      | { imageDataUrl?: string; error?: string }
      | null;

    if (!response.ok || !responseBody?.imageDataUrl) {
      throw new Error(responseBody?.error || "Image generation failed. Please try again.");
    }

    setCards((currentCards) => [
      {
        ...createGeneratedCard(promptText, currentCards.length),
        imageUrl: responseBody.imageDataUrl,
      },
      ...currentCards,
    ]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextPrompt = prompt.trim();

    if (!nextPrompt || isGenerating) {
      return;
    }

    pendingRequestRef.current?.abort();
    const controller = new AbortController();
    pendingRequestRef.current = controller;

    setErrorMessage(null);
    setIsGenerating(true);

    void (async () => {
      try {
        await generateImage(nextPrompt);
        setPrompt("");
      } catch (error) {
        if ((error as { name?: string } | null)?.name !== "AbortError") {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (pendingRequestRef.current === controller) {
          pendingRequestRef.current = null;
        }

        setIsGenerating(false);
      }
    })();
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(217,70,239,0.16),_transparent_30%),linear-gradient(160deg,_#050816_0%,_#09111f_48%,_#03050a_100%)]" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float absolute left-[8%] top-[12%] h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl [--float-duration:18s]" />
        <div className="animate-float absolute right-[10%] top-[18%] h-72 w-72 rounded-full bg-fuchsia-400/10 blur-3xl [--float-duration:24s]" />
        <div className="animate-float absolute bottom-[8%] left-[28%] h-80 w-80 rounded-full bg-emerald-300/10 blur-3xl [--float-duration:28s]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-2xl sm:p-6">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.55em] text-cyan-200/80">AI Art Studio</p>
            <h1 className="mt-4 font-[family:var(--font-display)] text-4xl font-semibold uppercase tracking-[0.18em] sm:text-5xl">
              Prompt, render, collect.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">
              Sketch ideas in words, keep the composition preview-ready, and watch the gallery fill with mood boards and image concepts.
            </p>
          </div>

          <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="art-prompt">
              Image description
            </label>
            <input
              id="art-prompt"
              className="h-14 flex-1 rounded-2xl border border-white/10 bg-white/7 px-4 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-cyan-300/40 focus:bg-white/10"
              placeholder="Describe the scene you want to generate..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <button
              className="inline-flex h-14 items-center justify-center rounded-2xl border border-cyan-300/40 bg-[linear-gradient(135deg,#22d3ee_0%,#8b5cf6_55%,#f472b6_100%)] px-6 font-[family:var(--font-display)] text-sm font-semibold uppercase tracking-[0.22em] text-slate-950 transition duration-200 hover:scale-[1.01] hover:shadow-[0_20px_60px_rgba(34,211,238,0.18)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!prompt.trim() || isGenerating}
              type="submit"
            >
              {isGenerating ? "Generating" : "Generate"}
            </button>
          </form>

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
              {errorMessage}
            </div>
          ) : null}
        </header>

        <section className="flex-1 overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 p-4 backdrop-blur-2xl sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/45">Gallery</p>
              <p className="mt-2 text-sm text-white/60">{cards.length} previews ready</p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.25em] text-white/60">
              1 col mobile · 2 tablet · 3 desktop
            </div>
          </div>

          <div className="columns-1 gap-5 md:columns-2 lg:columns-3">
            {isGenerating ? (
              <div className="mb-5">
                <LoadingCard prompt={prompt || "Creating a new image concept..."} />
              </div>
            ) : null}
            {cards.map((card) => (
              <div key={card.id} className="mb-5">
                <ArtCardView card={card} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}