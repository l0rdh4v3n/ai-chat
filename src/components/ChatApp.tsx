"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { getPersonality, personalities, type PersonalityId } from "@/lib/personalities";

type ThemeId = "dark" | "light";
type AvatarMode = "emoji" | "image";

type ChatAttachment = {
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
};

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  isStreaming?: boolean;
  senderName?: string;
  personalityId?: PersonalityId;
  attachments?: ChatAttachment[];
};

type UserProfile = {
  name: string;
  avatarMode: AvatarMode;
  avatarValue: string;
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  personality: PersonalityId;
  createdAt: number;
  updatedAt: number;
};

type StoredState = {
  sessions: ChatSession[];
  activeChatId: string;
  profile: UserProfile;
  theme: ThemeId;
};

type ShapeStyle = {
  left: string;
  top: string;
  width: string;
  height: string;
  animationDelay: string;
  animationDuration: string;
};

type LayoutTokens = {
  page: string;
  background: string;
  shell: string;
  sidebar: string;
  header: string;
  feed: string;
  footer: string;
  muted: string;
  panel: string;
  panelSoft: string;
  input: string;
  button: string;
  messageAssistant: string;
  messageUser: string;
  ghost: string;
};

const STORAGE_KEY = "ai-chat-state";
const SHAPE_COUNT = Math.max(1, Math.min(20, 12));
const MIN_TOKEN_ESTIMATE = 1;
const MAX_ATTACHMENT_FILES = 4;
const MAX_ATTACHMENT_BYTES = 2_500_000;
const DEFAULT_PERSONALITY_ID: PersonalityId = "default";

const WELCOME_SESSION: ChatSession = {
  id: makeId("chat"),
  title: "Welcome",
  messages: [
    {
      id: 1,
      role: "assistant",
      text: "Connected UI ready. Ask anything and I will reply through OpenRouter once you add your API key.",
      timestamp: "09:41",
      senderName: "Assistant",
      personalityId: DEFAULT_PERSONALITY_ID,
    },
  ],
  personality: DEFAULT_PERSONALITY_ID,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const DEFAULT_PROFILE: UserProfile = {
  name: "You",
  avatarMode: "emoji",
  avatarValue: "🧑‍🎤",
};

function makeId(prefix: string) {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${randomPart}`;
}

function buildShapes(count: number): ShapeStyle[] {
  return Array.from({ length: count }, (_, index) => {
    const seed = index + 1;

    return {
      left: `${(seed * 17) % 100}%`,
      top: `${(seed * 23) % 100}%`,
      width: `${140 + ((seed * 37) % 180)}px`,
      height: `${140 + ((seed * 29) % 180)}px`,
      animationDelay: `${(seed * -1.7).toFixed(1)}s`,
      animationDuration: `${16 + ((seed * 5) % 14)}s`,
    };
  });
}

function timestampLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function estimateTokens(text: string) {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return 0;
  }

  return Math.max(MIN_TOKEN_ESTIMATE, Math.round(normalizedText.length / 4));
}

function deriveChatTitle(text: string) {
  return text.length > 28 ? `${text.slice(0, 28).trim()}...` : text;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMessagePreviewText(message: Message | undefined) {
  if (!message) {
    return "No messages yet";
  }

  const trimmedText = message.text.trim();

  if (trimmedText) {
    return trimmedText.length > 80 ? `${trimmedText.slice(0, 80).trim()}...` : trimmedText;
  }

  if (message.attachments?.length) {
    const count = message.attachments.length;

    return `${count} image${count === 1 ? "" : "s"} attached`;
  }

  return "No messages yet";
}

function sanitizeAttachments(input: unknown): ChatAttachment[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .map((value) => {
      const dataUrl = typeof value.dataUrl === "string" && value.dataUrl.startsWith("data:image/") ? value.dataUrl : "";

      if (!dataUrl) {
        return null;
      }

      const name = typeof value.name === "string" && value.name.trim() ? value.name : "image";
      const mimeType = typeof value.mimeType === "string" && value.mimeType.startsWith("image/") ? value.mimeType : "image/png";
      const size = typeof value.size === "number" && Number.isFinite(value.size) ? value.size : 0;

      return {
        name,
        mimeType,
        dataUrl,
        size,
      } satisfies ChatAttachment;
    })
    .filter((value): value is ChatAttachment => Boolean(value));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function createBlankSession(personality: PersonalityId, index: number) {
  const now = Date.now();

  return {
    id: makeId("chat"),
    title: `New chat ${index}`,
    messages: [],
    personality,
    createdAt: now,
    updatedAt: now,
  } satisfies ChatSession;
}

function createWelcomeSession() {
  return {
    ...WELCOME_SESSION,
    messages: [...WELCOME_SESSION.messages],
  } satisfies ChatSession;
}

function splitCompleteWordChunks(text: string, flush = false) {
  if (!text) {
    return { chunks: [] as string[], rest: "" };
  }

  if (flush) {
    return {
      chunks: text.match(/\S+\s*|\s+/g) ?? [text],
      rest: "",
    };
  }

  const lastWhitespaceIndex = Array.from(text).findLastIndex((character) => /\s/.test(character));

  if (lastWhitespaceIndex === -1) {
    return { chunks: [] as string[], rest: text };
  }

  const completeText = text.slice(0, lastWhitespaceIndex + 1);

  return {
    chunks: completeText.match(/\S+\s*|\s+/g) ?? [],
    rest: text.slice(lastWhitespaceIndex + 1),
  };
}

function delay(duration: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function getUserAvatarLabel(profile: UserProfile) {
  if (profile.avatarMode === "emoji" && profile.avatarValue.trim()) {
    return profile.avatarValue.trim();
  }

  if (profile.avatarMode === "image") {
    return "";
  }

  return profile.name.trim().slice(0, 1).toUpperCase() || "Y";
}

function getAssistantAvatarLabel(personalityId: PersonalityId) {
  switch (personalityId) {
    case "pirate":
      return "🏴‍☠️";
    case "shakespeare":
      return "✒️";
    case "robot":
      return "🤖";
    case "study-buddy":
      return "📚";
    default:
      return "🤖";
  }
}

function getAvatarAccent(role: Message["role"], theme: ThemeId) {
  if (role === "user") {
    return theme === "dark"
      ? "border-blue-400/30 bg-blue-500/20 text-blue-100"
      : "border-blue-500/25 bg-blue-100 text-blue-700";
  }

  return theme === "dark"
    ? "border-[#7bffb0]/25 bg-[#09130d] text-[#a5ffd0]"
    : "border-emerald-500/20 bg-emerald-50 text-emerald-700";
}

function getLayoutTokens(theme: ThemeId): LayoutTokens {
  if (theme === "light") {
    return {
      page: "text-slate-900",
      background:
        "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_38%),radial-gradient(circle_at_bottom,_rgba(59,130,246,0.12),_transparent_32%),linear-gradient(160deg,_#f8fafc_0%,_#eef2ff_48%,_#f8fafc_100%)]",
      shell: "border-slate-200/70 bg-white/65 shadow-[0_25px_120px_rgba(15,23,42,0.08)]",
      sidebar: "border-slate-200/70 bg-white/70",
      header: "border-slate-200/70 bg-white/70",
      feed: "bg-white/35",
      footer: "border-slate-200/70 bg-white/70",
      muted: "text-slate-600",
      panel: "border-slate-200/80 bg-white/80",
      panelSoft: "border-slate-200/60 bg-slate-50/90",
      input:
        "bg-white/90 text-slate-900 placeholder:text-slate-400 border-slate-200/80 shadow-[0_12px_30px_rgba(15,23,42,0.06)]",
      button:
        "border-emerald-500/30 bg-[linear-gradient(135deg,_#0f766e_0%,_#10b981_52%,_#a7f3d0_100%)] text-slate-950",
      messageAssistant: "border-slate-200 bg-white text-slate-800",
      messageUser:
        "bg-[linear-gradient(135deg,_#2563eb_0%,_#3b82f6_55%,_#93c5fd_100%)] text-white shadow-[0_16px_40px_rgba(37,99,235,0.22)]",
      ghost: "text-slate-500",
    };
  }

  return {
    page: "text-white",
    background:
      "bg-[radial-gradient(circle_at_top,_rgba(87,255,161,0.18),_transparent_38%),radial-gradient(circle_at_bottom,_rgba(5,96,255,0.18),_transparent_32%),linear-gradient(160deg,_#020403_0%,_#07110c_48%,_#020303_100%)]",
    shell:
      "border-white/10 bg-black/35 shadow-[0_0_0_1px_rgba(123,255,176,0.06),0_25px_120px_rgba(14,255,145,0.16)]",
    sidebar: "border-white/8 bg-white/4",
    header: "border-white/8 bg-black/20",
    feed: "bg-black/20",
    footer: "border-white/8 bg-black/20",
    muted: "text-white/65",
    panel: "border-white/10 bg-[#08110d]/80",
    panelSoft: "border-white/8 bg-white/5",
    input:
      "bg-transparent text-white placeholder:text-white/30 border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
    button:
      "border-[#7bffb0]/40 bg-[linear-gradient(135deg,_#08381d_0%,_#11c76f_52%,_#7bffb0_100%)] text-[#02150a]",
    messageAssistant: "border-white/8 bg-[#22262b]/88 text-[#e5e7eb]",
    messageUser:
      "bg-[linear-gradient(135deg,_#0d6efd_0%,_#2f8fff_55%,_#83beff_100%)] text-white shadow-[0_16px_40px_rgba(17,125,255,0.28)]",
    ghost: "text-white/38",
  };
}

function AvatarBadge({
  role,
  theme,
  profile,
  personalityId,
}: {
  role: Message["role"];
  theme: ThemeId;
  profile: UserProfile;
  personalityId: PersonalityId;
}) {
  const isUser = role === "user";
  const accent = getAvatarAccent(role, theme);

  if (isUser && profile.avatarMode === "image" && profile.avatarValue.trim()) {
    return (
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border shadow-lg ${accent}`}>
        <img alt={profile.name} className="h-full w-full object-cover" src={profile.avatarValue} />
      </div>
    );
  }

  const label = isUser ? getUserAvatarLabel(profile) : getAssistantAvatarLabel(personalityId);

  return (
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-xl shadow-lg ${accent}`}>
      {label || "Y"}
    </div>
  );
}

function getPersonalityOptions() {
  return personalities;
}

function formatExportTimestamp(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function slugifyFilename(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "chat"
  );
}

function buildExportDocument(sessions: ChatSession[], profile: UserProfile, activeChatId: string, theme: ThemeId) {
  const exportedAt = formatExportTimestamp(Date.now());
  const orderedSessions = [...sessions].sort((leftSession, rightSession) => rightSession.updatedAt - leftSession.updatedAt);
  const activeSession = orderedSessions.find((session) => session.id === activeChatId);
  const lines: string[] = [
    "Neon Chat Export",
    `Exported: ${exportedAt}`,
    `Theme: ${theme}`,
    `Profile: ${profile.name}`,
    `Active Chat: ${activeSession?.title ?? "Chat"}`,
    "",
  ];

  for (const session of orderedSessions) {
    lines.push(`=== ${session.title} ===`);
    lines.push(`Personality: ${getPersonality(session.personality).label}`);
    lines.push(`Created: ${formatExportTimestamp(session.createdAt)}`);
    lines.push(`Updated: ${formatExportTimestamp(session.updatedAt)}`);
    lines.push("");

    if (!session.messages.length) {
      lines.push("(no messages)");
    } else {
      for (const message of session.messages) {
        const speaker =
          message.senderName ?? (message.role === "assistant" ? getPersonality(session.personality).label : profile.name);
        const suffix = message.isStreaming ? " [streaming]" : "";
        lines.push(`[${message.timestamp}] ${speaker}: ${message.text}${suffix}`);

        if (message.attachments?.length) {
          lines.push(
            `Attachments: ${message.attachments
              .map((attachment) => `${attachment.name} (${attachment.mimeType}, ${formatFileSize(attachment.size)})`)
              .join(", ")}`,
          );
        }
      }
    }

    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function downloadTextDocument(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sanitizeProfile(input: unknown): UserProfile {
  if (!input || typeof input !== "object") {
    return DEFAULT_PROFILE;
  }

  const candidate = input as Partial<UserProfile>;

  return {
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name : DEFAULT_PROFILE.name,
    avatarMode: candidate.avatarMode === "image" ? "image" : "emoji",
    avatarValue:
      typeof candidate.avatarValue === "string" && candidate.avatarValue.trim()
        ? candidate.avatarValue
        : DEFAULT_PROFILE.avatarValue,
  };
}

function sanitizeMessages(input: unknown): Message[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .map((value, index) => {
      const role = value.role === "assistant" ? "assistant" : "user";
      const personalityId = personalities.some((option) => option.id === value.personalityId)
        ? (value.personalityId as PersonalityId)
        : undefined;

      return {
        id: typeof value.id === "number" ? value.id : index + 1,
        role,
        text: typeof value.text === "string" ? value.text : "",
        timestamp: typeof value.timestamp === "string" ? value.timestamp : timestampLabel(new Date()),
        isStreaming: Boolean(value.isStreaming),
        senderName: typeof value.senderName === "string" ? value.senderName : undefined,
        personalityId,
        attachments: sanitizeAttachments(value.attachments),
      } satisfies Message;
    });
}

function sanitizeSessions(input: unknown): ChatSession[] {
  if (!Array.isArray(input)) {
    return [createWelcomeSession()];
  }

  const sessions = input
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .map((value, index) => {
      const personalityId = personalities.some((option) => option.id === value.personality)
        ? (value.personality as PersonalityId)
        : DEFAULT_PERSONALITY_ID;
      const messages = sanitizeMessages(value.messages);

      return {
        id: typeof value.id === "string" && value.id ? value.id : makeId(`chat-${index + 1}`),
        title: typeof value.title === "string" && value.title ? value.title : `Chat ${index + 1}`,
        messages,
        personality: personalityId,
        createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
        updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
      } satisfies ChatSession;
    });

  return sessions.length ? sessions : [createWelcomeSession()];
}

function loadStoredState(): StoredState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;

    if (Array.isArray(parsed.sessions)) {
      const sessions = sanitizeSessions(parsed.sessions);
      const activeChatId =
        typeof parsed.activeChatId === "string" && sessions.some((session) => session.id === parsed.activeChatId)
          ? parsed.activeChatId
          : sessions[0].id;

      return {
        sessions,
        activeChatId,
        profile: sanitizeProfile(parsed.profile),
        theme: parsed.theme === "light" ? "light" : "dark",
      };
    }

    if (Array.isArray(parsed.messages)) {
      const legacyMessages = sanitizeMessages(parsed.messages);
      const personality = personalities.some((option) => option.id === parsed.personality)
        ? (parsed.personality as PersonalityId)
        : DEFAULT_PERSONALITY_ID;
      const legacySession = {
        id: makeId("chat-legacy"),
        title: "Previous chat",
        messages: legacyMessages,
        personality,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } satisfies ChatSession;

      return {
        sessions: [legacySession],
        activeChatId: legacySession.id,
        profile: sanitizeProfile(parsed.profile),
        theme: parsed.theme === "light" ? "light" : "dark",
      };
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  return null;
}

function createRequestMessages(messages: Message[], nextMessage: Message) {
  return [...messages, nextMessage].map(({ role, text, attachments }) => ({ role, text, attachments }));
}

export default function ChatApp() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => [createWelcomeSession()]);
  const [activeChatId, setActiveChatId] = useState<string>(() => WELCOME_SESSION.id);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [theme, setTheme] = useState<ThemeId>("dark");
  const [draft, setDraft] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageIdRef = useRef<number>(2);
  const shapes = useMemo(() => buildShapes(SHAPE_COUNT), []);

  const activeSession = useMemo(() => {
    return sessions.find((session) => session.id === activeChatId) ?? sessions[0];
  }, [sessions, activeChatId]);

  const activePersonality = useMemo(() => {
    return getPersonality(activeSession?.personality ?? DEFAULT_PERSONALITY_ID);
  }, [activeSession?.personality]);

  const layout = useMemo(() => getLayoutTokens(theme), [theme]);

  useEffect(() => {
    const stored = loadStoredState();

    if (stored) {
      setSessions(stored.sessions);
      setActiveChatId(stored.activeChatId);
      setProfile(stored.profile);
      setTheme(stored.theme);
      messageIdRef.current =
        Math.max(
          1,
          ...stored.sessions.flatMap((session) => session.messages.map((message) => message.id)),
        ) + 1;
    } else {
      messageIdRef.current = 2;
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const state: StoredState = {
      sessions,
      activeChatId,
      profile,
      theme,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [activeChatId, isHydrated, profile, sessions, theme]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  }, [activeChatId, isHydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [sessions, activeChatId]);

  useEffect(() => {
    if (copiedMessageId === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopiedMessageId(null), 1500);

    return () => window.clearTimeout(timeoutId);
  }, [copiedMessageId]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  function updateActiveSession(updater: (session: ChatSession) => ChatSession) {
    setSessions((currentSessions) =>
      currentSessions.map((session) => (session.id === activeSession.id ? updater(session) : session)),
    );
  }

  function createNewChat() {
    const newSession = createBlankSession(activeSession.personality, sessions.length + 1);

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setDraft("");
    setDraftAttachments([]);
    setAttachmentError(null);
    setSessions((currentSessions) => [newSession, ...currentSessions]);
    setActiveChatId(newSession.id);
  }

  function openChat(chatId: string) {
    if (chatId === activeChatId) {
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setDraft("");
    setDraftAttachments([]);
    setAttachmentError(null);
    setActiveChatId(chatId);
  }

  function updatePersonality(personalityId: PersonalityId) {
    updateActiveSession((session) => ({
      ...session,
      personality: personalityId,
      updatedAt: Date.now(),
    }));
  }

  function resetComposer() {
    setDraft("");
    setDraftAttachments([]);
    setAttachmentError(null);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }

  function exportChats() {
    const exportContent = buildExportDocument(sessions, profile, activeChatId, theme);
    const safeName = slugifyFilename(activeSession?.title ?? "chat-history");
    const dateStamp = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()).replaceAll("/", "-");

    downloadTextDocument(`neon-chat-${safeName}-${dateStamp}.txt`, exportContent);
  }

  function appendToMessage(sessionId: string, messageId: number, chunk: string) {
    setSessions((currentSessions) =>
      currentSessions.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }

        return {
          ...session,
          updatedAt: Date.now(),
          messages: session.messages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  text: `${message.text}${chunk}`,
                }
              : message,
          ),
        };
      }),
    );
  }

  function finalizeMessage(sessionId: string, messageId: number, fallbackText?: string) {
    setSessions((currentSessions) =>
      currentSessions.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }

        return {
          ...session,
          updatedAt: Date.now(),
          messages: session.messages.map((message) => {
            if (message.id !== messageId) {
              return message;
            }

            return {
              ...message,
              text: message.text || fallbackText || message.text,
              isStreaming: false,
            };
          }),
        };
      }),
    );
  }

  async function copyMessage(messageText: string, messageId: number) {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopiedMessageId(messageId);
    } catch {
      setCopiedMessageId(null);
    }
  }

  async function streamAssistantReply(sessionId: string, response: Response, assistantId: number) {
    if (!response.body) {
      throw new Error("The response stream was empty.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pendingText = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      pendingText += decoder.decode(value, { stream: true });

      const { chunks, rest } = splitCompleteWordChunks(pendingText);
      pendingText = rest;

      for (const chunk of chunks) {
        appendToMessage(sessionId, assistantId, chunk);
        await delay(18);
      }
    }

    const tail = pendingText + decoder.decode();
    const { chunks } = splitCompleteWordChunks(tail, true);

    for (const chunk of chunks) {
      appendToMessage(sessionId, assistantId, chunk);
      await delay(18);
    }
  }

  async function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      event.target.value = "";
      return;
    }

    const fileDataUrl = await readFileAsDataUrl(file);

    setProfile((currentProfile) => ({
      ...currentProfile,
      avatarMode: "image",
      avatarValue: fileDataUrl,
    }));

    event.target.value = "";
  }

  async function handleAttachmentFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (!files.length) {
      return;
    }

    event.target.value = "";

    if (draftAttachments.length + files.length > MAX_ATTACHMENT_FILES) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENT_FILES} images per message.`);
      return;
    }

    const nonImageFile = files.find((file) => !file.type.startsWith("image/"));

    if (nonImageFile) {
      setAttachmentError(`${nonImageFile.name} is not an image file.`);
      return;
    }

    const oversizedFile = files.find((file) => file.size > MAX_ATTACHMENT_BYTES);

    if (oversizedFile) {
      setAttachmentError(`${oversizedFile.name} is too large. Keep images under ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`);
      return;
    }

    const attachments = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        mimeType: file.type || "image/png",
        dataUrl: await readFileAsDataUrl(file),
        size: file.size,
      } satisfies ChatAttachment)),
    );

    setDraftAttachments((currentAttachments) => [...currentAttachments, ...attachments]);
    setAttachmentError(null);
  }

  function removeDraftAttachment(index: number) {
    setDraftAttachments((currentAttachments) => currentAttachments.filter((_, attachmentIndex) => attachmentIndex !== index));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextText = draft.trim();

    if ((!nextText && !draftAttachments.length) || isLoading) {
      return;
    }

    const activeSessionSnapshot = activeSession;
    const sessionId = activeSessionSnapshot.id;
    const nextMessageId = messageIdRef.current;
    const userMessage: Message = {
      id: nextMessageId,
      role: "user",
      text: nextText,
      timestamp: timestampLabel(new Date()),
      senderName: profile.name,
      attachments: draftAttachments,
    };

    messageIdRef.current += 1;

    const assistantMessageId = messageIdRef.current;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      text: "",
      timestamp: timestampLabel(new Date()),
      senderName: activePersonality.label,
      personalityId: activeSessionSnapshot.personality,
      isStreaming: true,
    };

    messageIdRef.current += 1;

    const titleNeedsUpdate = activeSessionSnapshot.messages.length === 0 || activeSessionSnapshot.title.startsWith("New chat");

    setSessions((currentSessions) =>
      currentSessions.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }

        return {
          ...session,
          title: titleNeedsUpdate ? deriveChatTitle(nextText || draftAttachments[0]?.name || "Image chat") : session.title,
          updatedAt: Date.now(),
          messages: [...session.messages, userMessage, assistantMessage],
        };
      }),
    );

    resetComposer();

    const requestMessages = createRequestMessages(activeSessionSnapshot.messages, userMessage);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);

    void (async () => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages: requestMessages, personality: activeSessionSnapshot.personality }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;

          throw new Error(errorBody?.error || "The chat request failed.");
        }

        await streamAssistantReply(sessionId, response, assistantMessageId);
        finalizeMessage(sessionId, assistantMessageId, "No response returned.");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Something went wrong while contacting the AI.";

        finalizeMessage(sessionId, assistantMessageId, message);
      } finally {
        abortControllerRef.current = null;
        setIsLoading(false);
      }
    })();
  }

  const chats = [...sessions].sort((leftSession, rightSession) => rightSession.updatedAt - leftSession.updatedAt);
  const currentProfileAvatar =
    profile.avatarMode === "image" && profile.avatarValue.trim() ? profile.avatarValue : null;

  return (
    <main className={`relative min-h-screen overflow-hidden ${layout.page}`}>
      <div className={`absolute inset-0 transition-colors duration-300 ${layout.background}`} />

      <div className="pointer-events-none absolute inset-0">
        {shapes.map((shape, index) => (
          <span
            key={index}
            className={`absolute rounded-full blur-3xl animate-float ${
              theme === "light"
                ? "bg-[radial-gradient(circle,_rgba(16,185,129,0.26)_0%,_rgba(16,185,129,0.12)_38%,_transparent_72%)]"
                : "bg-[radial-gradient(circle,_rgba(74,255,154,0.42)_0%,_rgba(74,255,154,0.16)_38%,_transparent_72%)]"
            }`}
            style={shape}
          />
        ))}
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <section className={`grid h-[92vh] w-full max-w-6xl overflow-hidden rounded-[2rem] border backdrop-blur-3xl transition-colors duration-300 lg:grid-cols-[360px_minmax(0,1fr)] ${layout.shell}`}>
          <aside className={`flex max-h-[34vh] flex-col gap-4 overflow-y-auto border-b p-5 lg:max-h-none lg:border-b-0 lg:border-r lg:p-6 ${layout.sidebar}`}>
            <div className={`rounded-3xl border p-4 ${layout.panel}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-[family:var(--font-body)] text-xs uppercase tracking-[0.4em] text-[#7bffb0]">
                    Profile
                  </p>
                  <h1 className={`mt-3 font-[family:var(--font-display)] text-3xl font-semibold uppercase tracking-[0.16em] ${layout.page}`}>
                    Your Chat Identity
                  </h1>
                </div>

                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/8 text-2xl shadow-lg">
                  {currentProfileAvatar ? (
                    <img alt={profile.name} className="h-full w-full object-cover" src={currentProfileAvatar} />
                  ) : (
                    <span>{getUserAvatarLabel(profile)}</span>
                  )}
                </div>
              </div>

              <label className="mt-4 block font-[family:var(--font-body)] text-xs uppercase tracking-[0.24em] text-white/45">
                Name
                <input
                  className={`mt-2 w-full rounded-2xl border px-3 py-2 font-[family:var(--font-body)] text-sm outline-none transition ${layout.input}`}
                  value={profile.name}
                  onChange={(event) => setProfile((currentProfile) => ({ ...currentProfile, name: event.target.value }))}
                />
              </label>

              <div className="mt-4 flex gap-2">
                <button
                  className={`rounded-full border px-3 py-2 font-[family:var(--font-display)] text-xs uppercase tracking-[0.22em] transition ${theme === "light" ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-white/5 text-white/80"}`}
                  type="button"
                  onClick={() => setProfile((currentProfile) => ({ ...currentProfile, avatarMode: "emoji" }))}
                >
                  Emoji
                </button>
                <button
                  className={`rounded-full border px-3 py-2 font-[family:var(--font-display)] text-xs uppercase tracking-[0.22em] transition ${theme === "light" ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-white/5 text-white/80"}`}
                  type="button"
                  onClick={() => setProfile((currentProfile) => ({ ...currentProfile, avatarMode: "image" }))}
                >
                  PNG
                </button>
                <button
                  className={`ml-auto rounded-full border px-3 py-2 font-[family:var(--font-display)] text-xs uppercase tracking-[0.22em] transition ${theme === "light" ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-white/5 text-white/80"}`}
                  type="button"
                  onClick={() => setProfile(DEFAULT_PROFILE)}
                >
                  Reset
                </button>
              </div>

              {profile.avatarMode === "emoji" ? (
                <label className="mt-4 block font-[family:var(--font-body)] text-xs uppercase tracking-[0.24em] text-white/45">
                  Avatar Emoji
                  <input
                    className={`mt-2 w-full rounded-2xl border px-3 py-2 font-[family:var(--font-body)] text-sm outline-none transition ${layout.input}`}
                    maxLength={6}
                    placeholder="😀"
                    value={profile.avatarValue}
                    onChange={(event) =>
                      setProfile((currentProfile) => ({ ...currentProfile, avatarMode: "emoji", avatarValue: event.target.value }))
                    }
                  />
                </label>
              ) : (
                <label className="mt-4 block font-[family:var(--font-body)] text-xs uppercase tracking-[0.24em] text-white/45">
                  Avatar PNG
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    className={`mt-2 w-full rounded-2xl border px-3 py-2 font-[family:var(--font-body)] text-sm outline-none transition file:mr-3 file:rounded-full file:border-0 file:px-3 file:py-2 file:font-[family:var(--font-display)] file:text-[0.7rem] file:uppercase file:tracking-[0.2em] ${layout.input}`}
                    type="file"
                    onChange={(event) => void handleAvatarFileChange(event)}
                  />
                  <p className={`mt-2 text-[0.7rem] ${layout.ghost}`}>
                    Upload a PNG, JPG, or WebP. It will be saved locally.
                  </p>
                </label>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-[family:var(--font-body)] text-xs uppercase tracking-[0.35em] text-[#7bffb0]">
                  Chats
                </p>
                <p className={`mt-1 font-[family:var(--font-body)] text-xs ${layout.muted}`}>
                  {sessions.length} saved conversation{sessions.length === 1 ? "" : "s"}
                </p>
              </div>

              <button
                className={`rounded-full border px-4 py-2 font-[family:var(--font-display)] text-xs uppercase tracking-[0.24em] transition ${theme === "light" ? "border-emerald-500/30 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-[#7bffb0]/30 bg-[#08110d]/80 text-[#9bffc3] hover:bg-[#0b1a12]"}`}
                type="button"
                onClick={createNewChat}
              >
                New Chat
              </button>
            </div>

            <div className="space-y-2">
              {chats.map((session) => {
                const isActive = session.id === activeChatId;
                const lastMessage = session.messages.at(-1);
                const preview = getMessagePreviewText(lastMessage);

                return (
                  <button
                    key={session.id}
                    className={`w-full rounded-3xl border p-4 text-left transition duration-200 ${
                      isActive
                        ? theme === "light"
                          ? "border-emerald-500/35 bg-emerald-50 shadow-[0_0_24px_rgba(16,185,129,0.08)]"
                          : "border-[#7bffb0]/45 bg-[#0b1a12] shadow-[0_0_24px_rgba(123,255,176,0.12)]"
                        : theme === "light"
                          ? "border-slate-200 bg-white/75 hover:border-emerald-500/25 hover:bg-white"
                          : "border-white/10 bg-white/5 hover:border-[#7bffb0]/25 hover:bg-white/8"
                    }`}
                    type="button"
                    onClick={() => openChat(session.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`font-[family:var(--font-display)] text-sm font-semibold uppercase tracking-[0.22em] ${layout.page}`}>
                          {session.title}
                        </p>
                        <p className={`mt-1 text-[0.68rem] uppercase tracking-[0.22em] ${theme === "light" ? "text-slate-500" : "text-white/40"}`}>
                          {getPersonality(session.personality).label}
                        </p>
                      </div>

                      <span className={`rounded-full px-2 py-1 text-[0.65rem] uppercase tracking-[0.2em] ${theme === "light" ? "bg-slate-100 text-slate-600" : "bg-white/8 text-white/55"}`}>
                        {session.messages.length}
                      </span>
                    </div>

                    <p className={`mt-3 line-clamp-2 text-sm leading-6 ${layout.muted}`}>
                      {preview}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className={`flex min-h-0 flex-col ${layout.feed}`}>
            <header className={`border-b px-4 py-4 transition-colors duration-300 sm:px-6 ${layout.header}`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-[family:var(--font-body)] text-xs uppercase tracking-[0.35em] text-[#7bffb0]">
                    Live Preview
                  </p>
                  <h2 className={`mt-2 font-[family:var(--font-display)] text-3xl font-semibold uppercase tracking-[0.14em] ${layout.page}`}>
                    {activeSession?.title || "Chat"}
                  </h2>
                  <p className={`mt-2 font-[family:var(--font-body)] text-xs uppercase tracking-[0.24em] ${theme === "light" ? "text-slate-500" : "text-white/45"}`}>
                    Voice: {activePersonality.label} · Name: {profile.name}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`rounded-full border px-4 py-2 font-[family:var(--font-body)] text-xs uppercase tracking-[0.3em] ${theme === "light" ? "border-emerald-500/25 bg-emerald-50 text-emerald-700" : "border-[#7bffb0]/25 bg-[#08110d]/70 text-[#9bffc3]"}`}>
                    {isLoading ? "Streaming" : "OpenRouter"}
                  </div>

                  <button
                    className={`rounded-full border px-4 py-2 font-[family:var(--font-display)] text-xs uppercase tracking-[0.24em] transition duration-200 ${theme === "light" ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-white/10 bg-white/5 text-white hover:border-[#7bffb0]/25 hover:bg-white/8"}`}
                    type="button"
                    onClick={exportChats}
                  >
                    Export TXT
                  </button>

                  <button
                    className={`rounded-full border px-4 py-2 font-[family:var(--font-display)] text-xs uppercase tracking-[0.24em] transition duration-200 ${theme === "light" ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-white/10 bg-white/5 text-white hover:border-[#7bffb0]/25 hover:bg-white/8"}`}
                    type="button"
                    onClick={() => setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))}
                  >
                    {theme === "dark" ? "Light Mode" : "Dark Mode"}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {getPersonalityOptions().map((option) => {
                  const isActive = option.id === activeSession?.personality;

                  return (
                    <button
                      key={option.id}
                      className={`group rounded-full border px-4 py-2 text-left transition duration-200 ${
                        isActive
                          ? theme === "light"
                            ? "border-emerald-500/35 bg-emerald-50 shadow-[0_0_24px_rgba(16,185,129,0.08)]"
                            : "border-[#7bffb0]/45 bg-[#0b1a12] shadow-[0_0_24px_rgba(123,255,176,0.12)]"
                          : theme === "light"
                            ? "border-slate-200 bg-white/70 hover:border-emerald-500/25 hover:bg-white"
                            : "border-white/10 bg-white/5 hover:border-[#7bffb0]/25 hover:bg-white/8"
                      }`}
                      type="button"
                      onClick={() => updatePersonality(option.id)}
                    >
                      <span className={`block bg-gradient-to-r bg-clip-text font-[family:var(--font-display)] text-sm font-semibold uppercase tracking-[0.24em] text-transparent ${option.accent}`}>
                        {option.label}
                      </span>
                      <span className={`mt-1 block font-[family:var(--font-body)] text-[0.68rem] ${theme === "light" ? "text-slate-500" : "text-white/45"}`}>
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
                {!activeSession?.messages.length ? (
                  <div className={`rounded-[2rem] border px-6 py-10 text-center ${theme === "light" ? "border-slate-200 bg-white/80 text-slate-700" : "border-white/8 bg-white/5 text-white/70"}`}>
                    <p className="font-[family:var(--font-display)] text-2xl uppercase tracking-[0.18em]">
                      Start a new conversation
                    </p>
                    <p className="mt-3 font-[family:var(--font-body)] text-sm leading-6">
                      Open a fresh chat, change your name or avatar, and the previous chats stay saved in the sidebar.
                    </p>
                  </div>
                ) : null}

                {activeSession?.messages.map((message) => {
                  const isUser = message.role === "user";
                  const assistantPersonality = message.personalityId ?? activeSession.personality;
                  const speakerName = message.senderName ?? (isUser ? profile.name : getPersonality(assistantPersonality).label);
                  const tokenCount = estimateTokens(message.text);
                  const attachments = message.attachments ?? [];

                  return (
                    <article key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div className={`flex max-w-[88%] items-end gap-3 sm:max-w-[80%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                        <AvatarBadge
                          personalityId={assistantPersonality}
                          profile={profile}
                          role={message.role}
                          theme={theme}
                        />

                        <div className={[
                          "relative rounded-[1.75rem] px-4 py-3 shadow-lg",
                          isUser ? "rounded-br-md" : "rounded-bl-md border",
                          isUser ? layout.messageUser : layout.messageAssistant,
                        ].join(" ")}>
                          {message.text ? (
                            <p className="font-[family:var(--font-body)] text-[0.95rem] leading-7">
                              {message.text}
                            </p>
                          ) : (
                            <div className="flex items-center gap-2 py-2">
                              <span className={`h-2 w-2 animate-pulse rounded-full ${theme === "light" ? "bg-emerald-500/70" : "bg-white/55"}`} />
                              <span className={`h-2 w-2 animate-pulse rounded-full ${theme === "light" ? "bg-emerald-500/55" : "bg-white/40"} [animation-delay:120ms]`} />
                              <span className={`h-2 w-2 animate-pulse rounded-full ${theme === "light" ? "bg-emerald-500/40" : "bg-white/25"} [animation-delay:240ms]`} />
                            </div>
                          )}

                          {attachments.length ? (
                            <div className={`mt-3 grid gap-3 ${attachments.length > 1 ? "sm:grid-cols-2" : ""}`}>
                              {attachments.map((attachment, index) => (
                                <figure key={`${message.id}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                                  <div className="aspect-[4/3] bg-black/30">
                                    <img alt={attachment.name} className="h-full w-full object-cover" src={attachment.dataUrl} />
                                  </div>
                                  <figcaption className={`px-3 py-2 font-[family:var(--font-body)] text-[0.65rem] uppercase tracking-[0.18em] ${theme === "light" ? "text-slate-500" : "text-white/55"}`}>
                                    {attachment.name}
                                  </figcaption>
                                </figure>
                              ))}
                            </div>
                          ) : null}

                          <div className={`mt-2 flex items-center justify-between gap-4 font-[family:var(--font-body)] text-[0.68rem] uppercase tracking-[0.24em] ${isUser ? (theme === "light" ? "text-blue-100/90" : "text-white/72") : (theme === "light" ? "text-slate-500" : "text-white/38")}`}>
                            <span className="flex items-center gap-2">
                              {!isUser && message.text ? (
                                <button
                                  className={`rounded-full border px-2 py-1 font-[family:var(--font-body)] text-[0.65rem] uppercase tracking-[0.2em] transition duration-200 ${theme === "light" ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-white/10 bg-white/5 text-white/70 hover:border-[#7bffb0]/30 hover:bg-white/10"}`}
                                  type="button"
                                  onClick={() => void copyMessage(message.text, message.id)}
                                >
                                  {copiedMessageId === message.id ? "Copied" : "Copy"}
                                </button>
                              ) : null}
                              <span>{speakerName}</span>
                              <span>{message.timestamp}</span>
                            </span>
                            <span>≈ {tokenCount} tokens</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}

                <div ref={bottomRef} />
              </div>
            </div>

            <footer className={`border-t px-4 py-4 sm:px-6 ${layout.footer}`}>
              <form
                className={`mx-auto w-full max-w-4xl rounded-[1.6rem] border p-3 transition-colors duration-300 ${layout.input}`}
                onSubmit={handleSubmit}
              >
                {draftAttachments.length ? (
                  <div className="mb-3 grid gap-3 sm:grid-cols-2">
                    {draftAttachments.map((attachment, index) => (
                      <div key={`${attachment.name}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                        <div className="relative aspect-[4/3] bg-black/25">
                          <img alt={attachment.name} className="h-full w-full object-cover" src={attachment.dataUrl} />
                          <button
                            className="absolute right-2 top-2 rounded-full border border-white/20 bg-black/65 px-2 py-1 font-[family:var(--font-display)] text-[0.65rem] uppercase tracking-[0.18em] text-white transition hover:bg-black/80"
                            type="button"
                            onClick={() => removeDraftAttachment(index)}
                          >
                            Remove
                          </button>
                        </div>
                        <div className={`flex items-center justify-between gap-3 px-3 py-2 font-[family:var(--font-body)] text-[0.65rem] uppercase tracking-[0.18em] ${theme === "light" ? "text-slate-500" : "text-white/55"}`}>
                          <span className="truncate">{attachment.name}</span>
                          <span>{formatFileSize(attachment.size)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex items-end gap-3">
                  <label className="sr-only" htmlFor="message-input">
                    Type a message
                  </label>
                  <input
                    ref={attachmentInputRef}
                    accept="image/*"
                    className="hidden"
                    multiple
                    type="file"
                    onChange={(event) => void handleAttachmentFileChange(event)}
                  />
                  <button
                    className={`inline-flex h-12 items-center justify-center rounded-full border px-4 font-[family:var(--font-display)] text-xs font-semibold uppercase tracking-[0.2em] transition duration-200 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(123,255,176,0.18)] disabled:cursor-not-allowed disabled:opacity-50 ${theme === "light" ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-white/10 bg-white/5 text-white hover:border-[#7bffb0]/25 hover:bg-white/8"}`}
                    disabled={isLoading}
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                  >
                    Attach
                  </button>
                  <textarea
                    id="message-input"
                    className={`max-h-36 min-h-[52px] flex-1 resize-none bg-transparent px-3 py-3 font-[family:var(--font-body)] text-sm outline-none ${theme === "light" ? "text-slate-900 placeholder:text-slate-400" : "text-white placeholder:text-white/30"}`}
                    placeholder="Type a message or attach a screenshot..."
                    rows={1}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button
                    className={`inline-flex h-12 min-w-12 items-center justify-center rounded-full border px-5 font-[family:var(--font-display)] text-sm font-semibold uppercase tracking-[0.2em] transition duration-200 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(123,255,176,0.28)] disabled:cursor-not-allowed disabled:opacity-50 ${layout.button}`}
                    disabled={(!draft.trim() && !draftAttachments.length) || isLoading}
                    type="submit"
                  >
                    {isLoading ? "Live" : "Send"}
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <p className={`font-[family:var(--font-body)] text-[0.72rem] ${theme === "light" ? "text-slate-500" : "text-white/45"}`}>
                    Add homework screenshots or photos. Up to {MAX_ATTACHMENT_FILES} images, {formatFileSize(MAX_ATTACHMENT_BYTES)} each.
                  </p>
                  {attachmentError ? (
                    <p className="font-[family:var(--font-body)] text-[0.72rem] text-rose-300">
                      {attachmentError}
                    </p>
                  ) : null}
                </div>
              </form>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
