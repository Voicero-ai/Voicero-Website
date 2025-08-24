"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FaSync,
  FaCheckCircle,
  FaExclamationTriangle,
  FaComments,
  FaRobot,
  FaUser,
  FaClock,
  FaLink,
  FaVolumeUp,
  FaKeyboard,
} from "react-icons/fa";

interface AiMessage {
  id: string;
  role: string;
  content: string;
  type: string | null;
  createdAt: string;
  threadId: string;
  pageUrl?: string | null;
  scrollToText?: string | null;
}

interface ThreadSummary {
  id: string;
  threadId: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  messages: AiMessage[];
  customers?: any[];
  sessions?: Array<{ id: string; customer?: any | null }>;
  source_type?: string; // 'aithread', 'textconversation', or 'voiceconversation'
}

interface AiHistoryReport {
  ai_usage_analysis: string;
  chat_review: {
    good_count: number;
    needs_work_count: number;
    good_definition: string;
    needs_work_definition: string;
    good_thread_ids: string[];
    needs_work_thread_ids: string[];
  };
  whats_working: string[];
  pain_points: { title: string; description: string }[];
  quick_wins: string[];
  kpi_snapshot: {
    total_threads: number;
    helpful_percent: number;
    needs_work_percent: number;
    avg_user_messages_when_good: number;
    avg_user_messages_when_bad: number;
  };
}

interface ApiResponse {
  success: boolean;
  windowStart: string;
  windowEnd: string;
  threadCount: number;
  threads: ThreadSummary[];
  report: AiHistoryReport | { error: string; message?: string } | null;
  analysis: AiHistoryReport | { error: string; message?: string } | null;
  lastAnalysedAt: string;
}

export default function AICustomOverviewPage() {
  const searchParams = useSearchParams();
  const websiteId = searchParams.get("id");

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  // UI toggles (must be declared before any conditional returns to keep hook order stable)
  const [showGoodIds, setShowGoodIds] = useState(false);
  const [showBadIds, setShowBadIds] = useState(false);

  const windowLabel = useMemo(() => {
    if (!data?.windowStart || !data?.windowEnd) return "(last 4 weeks)";
    try {
      const start = new Date(data.windowStart);
      const end = new Date(data.windowEnd);
      return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    } catch {
      return "(last 4 weeks)";
    }
  }, [data?.windowStart, data?.windowEnd]);

  // Local SWR-style cache
  const CACHE_KEY_PREFIX = "voicero.aiOverview.cache:";
  const cacheKey = websiteId ? `${CACHE_KEY_PREFIX}${websiteId}` : "";

  const fetchOverview = async (warmStart: boolean = false) => {
    if (!websiteId) return;
    if (warmStart) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    console.log("doing ai-overview", { websiteId });
    try {
      const res = await fetch("/api/aiHistory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ websiteId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to generate AI overview");
      }
      const json = (await res.json()) as ApiResponse;
      setData(json);
      // update cache
      try {
        if (cacheKey)
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ ts: Date.now(), data: json })
          );
      } catch {}
      console.log("done ai-overview", { websiteId });
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      if (warmStart) setIsRefreshing(false);
      else setIsLoading(false);
    }
  };

  // Stale-while-revalidate: show cached data immediately, then refresh
  useEffect(() => {
    if (!websiteId) return;
    let usedCache = false;
    try {
      if (cacheKey) {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.data) {
            setData(parsed.data as ApiResponse);
            usedCache = true;
          }
        }
      }
    } catch {}
    setIsLoading(!usedCache);
    fetchOverview(usedCache);
  }, [websiteId]);

  // Build recent messages list across all threads
  const recentMessages = useMemo(() => {
    if (!data?.threads) return [] as AiMessage[];
    const all = data.threads.flatMap((t) => t.messages || []);
    return all
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 25);
  }, [data?.threads]);

  if (!websiteId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          Missing website id.
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto p-8 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 mb-4 rounded-full border-4 border-brand-lavender-light/40 border-t-brand-accent animate-spin" />
        <h2 className="text-xl font-semibold text-brand-text-primary mb-2">
          Generating custom AI overview over past 4 weeks
        </h2>
        <p className="text-sm text-brand-text-secondary">
          This can take a couple minutes while we analyze your conversations.
        </p>
      </div>
    );
  }

  const report = data.report as
    | AiHistoryReport
    | { error: string; message?: string }
    | null;
  const threadsById = new Map<string, ThreadSummary>(
    (data.threads || []).map((t) => [t.id, t])
  );

  // Toggle states for showing thread IDs
  // (already declared above to keep stable order)

  // Helper to parse assistant JSON answers
  function parseAssistantMessage(raw: string): {
    answer?: string;
    action?: string;
  } {
    try {
      let content = raw?.trim?.() ?? "";
      if (!content) return {};
      if (content.includes("```json")) {
        content = content.replace(/```json\s*|```/g, "");
      }
      const obj = JSON.parse(content);
      const answer = typeof obj?.answer === "string" ? obj.answer : undefined;
      const action = typeof obj?.action === "string" ? obj.action : undefined;
      return { answer, action };
    } catch {
      return {};
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-text-primary">
            AI Overview
          </h1>
          <p className="text-sm text-brand-text-secondary">{windowLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchOverview(true)}
            disabled={isRefreshing}
            className="px-3 py-2 bg-brand-accent text-white rounded-lg hover:bg-brand-accent/90 disabled:opacity-50 flex items-center gap-2"
            title="Refresh analysis"
          >
            <FaSync className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
      )}

      {!report || (report as any).error ? (
        <div className="p-4 bg-amber-50 text-amber-800 rounded-lg flex items-start gap-3">
          <FaExclamationTriangle className="mt-0.5" />
          <div>
            <div className="font-semibold">Report generation failed</div>
            <div className="text-sm">
              {(report as any)?.message || "Please try refreshing in a moment."}
            </div>
          </div>
        </div>
      ) : (
        <>
          <section className="bg-white rounded-2xl shadow-md border border-brand-lavender-light/30 p-8">
            <h2 className="text-lg font-semibold text-brand-text-primary mb-3">
              Usage Analysis
            </h2>
            <div className="space-y-4 text-black leading-7">
              {String((report as AiHistoryReport).ai_usage_analysis)
                .split(/\n+\n+/)
                .map((para, idx) => (
                  <p key={idx} className="text-base text-brand-text-primary">
                    {para}
                  </p>
                ))}
            </div>
          </section>

          {/* KPI Snapshot - separate section */}
          <section className="bg-white rounded-2xl shadow-md border border-brand-lavender-light/30 p-8 mb-8">
            <h2 className="text-lg font-semibold text-brand-text-primary mb-4">
              KPI Snapshot
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              <div className="p-5 rounded-xl bg-white border border-brand-lavender-light/30 shadow-sm text-brand-text-primary">
                <div className="text-xs text-brand-text-secondary mb-1">
                  Total threads
                </div>
                <div className="text-3xl font-bold">
                  {(report as AiHistoryReport).kpi_snapshot.total_threads}
                </div>
              </div>
              <div className="p-5 rounded-xl bg-green-50 border border-green-100 shadow-sm text-green-800">
                <div className="text-xs mb-1">Helpful (%)</div>
                <div className="text-2xl font-bold">
                  {(
                    report as AiHistoryReport
                  ).kpi_snapshot.helpful_percent.toFixed(2)}
                  %
                </div>
              </div>
              <div className="p-5 rounded-xl bg-amber-50 border border-amber-100 shadow-sm text-amber-900">
                <div className="text-xs mb-1">Needs‑work (%)</div>
                <div className="text-2xl font-bold">
                  {(
                    report as AiHistoryReport
                  ).kpi_snapshot.needs_work_percent.toFixed(2)}
                  %
                </div>
              </div>
              <div className="p-5 rounded-xl bg-brand-lavender-light/10 border border-brand-lavender-light/30 shadow-sm text-brand-text-primary">
                <div className="text-xs mb-1">Avg. user messages when good</div>
                <div className="text-2xl font-bold">
                  {(
                    report as AiHistoryReport
                  ).kpi_snapshot.avg_user_messages_when_good.toFixed(2)}
                </div>
              </div>
              <div className="p-5 rounded-xl bg-brand-lavender-light/10 border border-brand-lavender-light/30 shadow-sm text-brand-text-primary">
                <div className="text-xs mb-1">Avg. user messages when bad</div>
                <div className="text-2xl font-bold">
                  {(
                    report as AiHistoryReport
                  ).kpi_snapshot.avg_user_messages_when_bad.toFixed(2)}
                </div>
              </div>
            </div>
          </section>

          {/* Chat Review - Good */}
          <section className="bg-white rounded-2xl shadow-md border-l-4 border-green-400 p-8 mb-8">
            <h2 className="text-lg font-semibold text-brand-text-primary mb-4 flex items-center gap-2">
              <FaCheckCircle className="text-green-600" /> Chat Review — Good
              <span className="ml-auto text-xs font-mono bg-green-50 text-green-700 px-2 py-0.5 rounded">
                {(report as AiHistoryReport).chat_review.good_count}/
                {(report as AiHistoryReport).kpi_snapshot.total_threads}
              </span>
            </h2>

            <div className="mb-4 p-4 bg-green-50/50 rounded-lg">
              <p className="text-base text-brand-text-primary">
                <span className="font-semibold">Definition:</span>{" "}
                {(report as AiHistoryReport).chat_review.good_definition}
              </p>
            </div>

            <button
              onClick={() => setShowGoodIds((v) => !v)}
              className="text-sm px-4 py-2 rounded-lg bg-green-100 text-green-800 border border-green-200 hover:bg-green-200 transition-colors font-medium flex items-center gap-2"
            >
              {showGoodIds ? (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                  Hide All Thread IDs
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  Show All Thread IDs (
                  {
                    (report as AiHistoryReport).chat_review.good_thread_ids
                      .length
                  }
                  )
                </>
              )}
            </button>
            {showGoodIds && (
              <div className="mt-4 max-h-48 overflow-auto text-xs font-mono bg-white rounded-lg p-4 text-green-800 border border-green-100">
                {(report as AiHistoryReport).chat_review.good_thread_ids
                  .filter(Boolean)
                  .map((id) => (
                    <div
                      key={id}
                      className="truncate py-1 border-b border-green-50 last:border-0"
                    >
                      {id}
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* Chat Review - Needs Work */}
          <section className="bg-white rounded-2xl shadow-md border-l-4 border-amber-400 p-8 mb-8">
            <h2 className="text-lg font-semibold text-brand-text-primary mb-4 flex items-center gap-2">
              <FaExclamationTriangle className="text-amber-600" /> Chat Review —
              Needs Work
              <span className="ml-auto text-xs font-mono bg-amber-50 text-amber-800 px-2 py-0.5 rounded">
                {(report as AiHistoryReport).chat_review.needs_work_count}/
                {(report as AiHistoryReport).kpi_snapshot.total_threads}
              </span>
            </h2>

            <div className="mb-4 p-4 bg-amber-50/50 rounded-lg">
              <p className="text-base text-brand-text-primary">
                <span className="font-semibold">Definition:</span>{" "}
                {(report as AiHistoryReport).chat_review.needs_work_definition}
              </p>
            </div>

            <button
              onClick={() => setShowBadIds((v) => !v)}
              className="text-sm px-4 py-2 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200 transition-colors font-medium flex items-center gap-2"
            >
              {showBadIds ? (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                  Hide All Thread IDs
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  Show All Thread IDs (
                  {
                    (report as AiHistoryReport).chat_review
                      .needs_work_thread_ids.length
                  }
                  )
                </>
              )}
            </button>
            {showBadIds && (
              <div className="mt-4 max-h-48 overflow-auto text-xs font-mono bg-white rounded-lg p-4 text-amber-800 border border-amber-100">
                {(report as AiHistoryReport).chat_review.needs_work_thread_ids
                  .filter(Boolean)
                  .map((id) => (
                    <div
                      key={id}
                      className="truncate py-1 border-b border-amber-50 last:border-0"
                    >
                      {id}
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* What's working - Now stacked vertically with more space */}
          <section className="bg-white rounded-2xl shadow-md border border-brand-lavender-light/30 p-8 mb-8">
            <h3 className="text-lg font-semibold text-brand-text-primary mb-3">
              What's working
            </h3>
            <ul className="list-disc pl-5 space-y-4 text-base text-brand-text-secondary">
              {(report as AiHistoryReport).whats_working.map((w, i) => (
                <li key={i} className="text-black">
                  {w}
                </li>
              ))}
            </ul>
          </section>

          {/* Quick wins - Now in its own section */}
          <section className="bg-white rounded-2xl shadow-md border-l-4 border-green-400 border-brand-lavender-light/30 p-8 mb-8">
            <h3 className="text-lg font-semibold text-brand-text-primary mb-3">
              Quick wins
            </h3>
            <ul className="list-disc pl-5 space-y-4 text-base text-brand-text-secondary">
              {(report as AiHistoryReport).quick_wins.map((w, i) => (
                <li key={i} className="text-black">
                  {w}
                </li>
              ))}
            </ul>
          </section>

          {/* Pain points - Now in its own section */}
          <section className="bg-white rounded-2xl shadow-md border-l-4 border-amber-400 border-brand-lavender-light/30 p-8">
            <h3 className="text-lg font-semibold text-brand-text-primary mb-3">
              Pain points
            </h3>
            <ul className="space-y-6">
              {(report as AiHistoryReport).pain_points.map((p, i) => (
                <li key={i} className="text-base">
                  <div className="font-medium text-black text-lg mb-1">
                    {p.title}
                  </div>
                  <div className="text-brand-text-secondary leading-relaxed">
                    {p.description}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-white rounded-2xl shadow-md border border-brand-lavender-light/30 p-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-brand-text-primary flex items-center gap-2">
                <FaComments /> Recent AI Activity
              </h2>
            </div>
            {data.threads.length === 0 ? (
              <div className="text-sm text-brand-text-secondary">
                No recent threads.
              </div>
            ) : (
              <ThreadActivity threads={data.threads} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

// Collapsible recent activity by threads, with message detail on demand
function ThreadActivity({ threads }: { threads: ThreadSummary[] }) {
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return (threads || [])
      .slice()
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime()
      );
  }, [threads]);

  return (
    <div className="divide-y divide-brand-lavender-light/20">
      {sorted.map((t) => {
        const isOpen = openThreadId === t.id;
        const last = new Date(t.lastMessageAt);
        return (
          <div key={t.id} className="py-3">
            <button
              onClick={() => setOpenThreadId(isOpen ? null : t.id)}
              className="w-full text-left flex items-center gap-3 hover:bg-brand-lavender-light/10 rounded-lg px-2 py-2"
            >
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-lavender-light/20 text-brand-text-primary">
                {(() => {
                  // Check if this is a voice conversation
                  const isVoiceConversation =
                    t.source_type === "voiceconversation" ||
                    t.messages?.some((m) => m.type === "voice");

                  if (isVoiceConversation) {
                    return <FaVolumeUp />;
                  } else if (t.source_type === "textconversation") {
                    return <FaKeyboard />;
                  } else {
                    return <FaComments />;
                  }
                })()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-brand-text-primary truncate">
                    {t.source_type === "voiceconversation"
                      ? "Voice Conversation"
                      : t.source_type === "textconversation"
                      ? "Text Conversation"
                      : t.title || "AI Thread"}
                  </div>
                  <span className="text-xs text-brand-text-secondary flex items-center gap-1">
                    <FaClock /> {last.toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-brand-text-secondary">
                  {t.messageCount}{" "}
                  {t.messageCount === 1 ? "message" : "messages"}
                </div>
              </div>
              <span className="text-xs font-mono text-black/50 truncate max-w-[160px]">
                {t.threadId}
              </span>
            </button>

            {isOpen && (
              <div className="mt-2 ml-10 space-y-2">
                {t.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-3 rounded-lg border ${
                      m.role === "user"
                        ? "bg-brand-lavender-light/5 border-brand-lavender-light/30"
                        : "bg-white border-brand-lavender-light/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase tracking-wide text-brand-text-secondary flex items-center gap-1">
                        {m.role === "assistant" ? (
                          <FaRobot />
                        ) : m.type === "voice" ? (
                          <FaVolumeUp className="text-brand-accent" />
                        ) : (
                          <FaUser />
                        )}
                        {m.role}{" "}
                        {m.type === "voice" && m.role === "user" && "(voice)"}
                      </span>
                      <span className="text-[11px] text-brand-text-secondary flex items-center gap-1">
                        <FaClock /> {new Date(m.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-black whitespace-pre-wrap break-words">
                      {m.role === "assistant"
                        ? (() => {
                            try {
                              let c = m.content?.trim?.() ?? "";
                              if (c.includes("```json"))
                                c = c.replace(/```json\s*|```/g, "");
                              const obj = JSON.parse(c);
                              if (obj?.answer) {
                                return (
                                  <>
                                    <div>{obj.answer}</div>
                                    {obj.action && (
                                      <div className="mt-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
                                        action: {obj.action}
                                      </div>
                                    )}
                                  </>
                                );
                              }
                            } catch {}
                            return m.content;
                          })()
                        : m.content}
                    </div>
                    {m.pageUrl && (
                      <div className="mt-1 text-[11px] text-brand-text-secondary flex items-center gap-1">
                        <FaLink /> {m.pageUrl}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
