"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  FaVolumeUp,
  FaKeyboard,
  FaChevronRight,
  FaFilter,
  FaSort,
  FaCaretDown,
} from "react-icons/fa";
import Link from "next/link";

interface ChatResponse {
  type: "redirect" | "scroll" | "answer";
  content: string;
  metadata?: {
    url?: string;
    elementId?: string;
    json?: any;
  };
  timestamp: string;
}

interface Chat {
  id: string;
  type: "voice" | "text";
  query: string;
  response: ChatResponse;
  timestamp: string;
}

interface ChatSession {
  id: string;
  startedAt: string;
  type: "voice" | "text";
  initialQuery: string;
  messageCount: number;
  website: {
    id: string;
    domain: string;
    name?: string;
  };
}

type SortOption = "recent" | "oldest" | "longest" | "shortest";
type TimeRange = "all" | "last20" | "today" | "week" | "month";

export default function Chats() {
  const searchParams = useSearchParams()!;
  const websiteId = searchParams.get("website");
  const filterType = searchParams.get("type") as "voice" | "text" | null;

  const [showWebsiteFilter, setShowWebsiteFilter] = useState(false);
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [showSortFilter, setShowSortFilter] = useState(false);
  const [showTimeFilter, setShowTimeFilter] = useState(false);

  const [selectedWebsite, setSelectedWebsite] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<"all" | "voice" | "text">(
    "all"
  );
  const [selectedSort, setSelectedSort] = useState<SortOption>("recent");
  const [selectedTime, setSelectedTime] = useState<TimeRange>("all");

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [websites, setWebsites] = useState<
    { id: string; url: string; name?: string }[]
  >([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Initial load
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (selectedWebsite !== "all")
          params.append("websiteId", selectedWebsite);
        if (selectedType !== "all") params.append("type", selectedType);
        if (selectedSort) params.append("sort", selectedSort);
        if (selectedTime !== "all") params.append("timeRange", selectedTime);
        params.append("page", "1");
        params.append("limit", "10");

        const response = await fetch(`/api/chats?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch chat sessions");

        const data = await response.json();
        setSessions(data.sessions);
        setHasMore(data.hasMore);
        setTotalCount(data.totalCount);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [selectedWebsite, selectedType, selectedSort, selectedTime]);

  useEffect(() => {
    const fetchWebsites = async () => {
      try {
        const response = await fetch("/api/websites");
        if (!response.ok) throw new Error("Failed to fetch websites");
        const data = await response.json();
        setWebsites(data);
      } catch (err) {
        console.error("Failed to fetch websites:", err);
      }
    };

    fetchWebsites();
  }, []);

  const loadMore = async () => {
    if (loadingMore) return;

    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const params = new URLSearchParams();
      if (selectedWebsite !== "all")
        params.append("websiteId", selectedWebsite);
      if (selectedType !== "all") params.append("type", selectedType);
      if (selectedSort) params.append("sort", selectedSort);
      if (selectedTime !== "all") params.append("timeRange", selectedTime);
      params.append("page", nextPage.toString());
      params.append("limit", "10");

      const response = await fetch(`/api/chats?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch more chat sessions");

      const data = await response.json();
      setSessions((prev) => [...prev, ...data.sessions]);
      setHasMore(data.hasMore);
      setTotalCount(data.totalCount);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoadingMore(false);
    }
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setSessions([]);
  }, [selectedWebsite, selectedType, selectedSort, selectedTime]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-red-50 text-red-500 p-4 rounded-xl">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-brand-text-primary mb-2">
          Chat History
        </h1>
        <p className="text-brand-text-secondary">
          View past chat sessions across your websites
        </p>
      </header>

      <div className="flex flex-wrap gap-4 items-center">
        {/* Website Filter */}
        <div className="relative">
          <button
            onClick={() => setShowWebsiteFilter(!showWebsiteFilter)}
            className="px-4 py-2 bg-white rounded-xl border border-brand-lavender-light/20 
                     flex items-center gap-2 hover:border-brand-lavender-light/40 transition-colors"
          >
            <FaFilter className="w-4 h-4 text-brand-text-secondary" />
            <span className="text-sm text-brand-text-primary">
              {selectedWebsite === "all"
                ? "All Websites"
                : websites.find((w) => w.id === selectedWebsite)?.url}
            </span>
            <FaCaretDown className="w-4 h-4 text-brand-text-secondary" />
          </button>

          {showWebsiteFilter && (
            <div className="absolute top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-brand-lavender-light/20 py-2 z-10">
              <button
                onClick={() => {
                  setSelectedWebsite("all");
                  setShowWebsiteFilter(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-brand-lavender-light/5 transition-colors
                         ${
                           selectedWebsite === "all"
                             ? "text-brand-accent"
                             : "text-brand-text-primary"
                         }`}
              >
                All Websites
              </button>
              {websites.map((website) => (
                <button
                  key={website.id}
                  onClick={() => {
                    setSelectedWebsite(website.id);
                    setShowWebsiteFilter(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-brand-lavender-light/5 transition-colors
                           ${
                             selectedWebsite === website.id
                               ? "text-brand-accent"
                               : "text-brand-text-primary"
                           }`}
                >
                  {website.url}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat Type Filter */}
        <div className="relative">
          <button
            onClick={() => setShowTypeFilter(!showTypeFilter)}
            className="px-4 py-2 bg-white rounded-xl border border-brand-lavender-light/20 
                     flex items-center gap-2 hover:border-brand-lavender-light/40 transition-colors"
          >
            {selectedType === "voice" ? (
              <FaVolumeUp className="w-4 h-4 text-brand-text-secondary" />
            ) : selectedType === "text" ? (
              <FaKeyboard className="w-4 h-4 text-brand-text-secondary" />
            ) : (
              <FaFilter className="w-4 h-4 text-brand-text-secondary" />
            )}
            <span className="text-sm text-brand-text-primary">
              {selectedType === "all" ? "All Types" : `${selectedType} Chats`}
            </span>
            <FaCaretDown className="w-4 h-4 text-brand-text-secondary" />
          </button>

          {showTypeFilter && (
            <div className="absolute top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-brand-lavender-light/20 py-2 z-10">
              {["all", "voice", "text"].map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedType(type as "all" | "voice" | "text");
                    setShowTypeFilter(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-brand-lavender-light/5 transition-colors
                           ${
                             selectedType === type
                               ? "text-brand-accent"
                               : "text-brand-text-primary"
                           }`}
                >
                  {type === "all" ? "All Types" : `${type} Chats`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort Filter */}
        <div className="relative">
          <button
            onClick={() => setShowSortFilter(!showSortFilter)}
            className="px-4 py-2 bg-white rounded-xl border border-brand-lavender-light/20 
                     flex items-center gap-2 hover:border-brand-lavender-light/40 transition-colors"
          >
            <FaSort className="w-4 h-4 text-brand-text-secondary" />
            <span className="text-sm text-brand-text-primary">
              {selectedSort === "recent"
                ? "Most Recent"
                : selectedSort === "oldest"
                ? "Oldest First"
                : selectedSort === "longest"
                ? "Longest First"
                : "Shortest First"}
            </span>
            <FaCaretDown className="w-4 h-4 text-brand-text-secondary" />
          </button>

          {showSortFilter && (
            <div className="absolute top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-brand-lavender-light/20 py-2 z-10">
              {[
                { value: "recent", label: "Most Recent" },
                { value: "oldest", label: "Oldest First" },
                { value: "longest", label: "Longest First" },
                { value: "shortest", label: "Shortest First" },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSelectedSort(option.value as SortOption);
                    setShowSortFilter(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-brand-lavender-light/5 transition-colors
                           ${
                             selectedSort === option.value
                               ? "text-brand-accent"
                               : "text-brand-text-primary"
                           }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Time Range Filter */}
        <div className="relative">
          <button
            onClick={() => setShowTimeFilter(!showTimeFilter)}
            className="px-4 py-2 bg-white rounded-xl border border-brand-lavender-light/20 
                     flex items-center gap-2 hover:border-brand-lavender-light/40 transition-colors"
          >
            <FaFilter className="w-4 h-4 text-brand-text-secondary" />
            <span className="text-sm text-brand-text-primary">
              {selectedTime === "all"
                ? "All Time"
                : selectedTime === "last20"
                ? "Last 20"
                : selectedTime === "today"
                ? "Today"
                : selectedTime === "week"
                ? "This Week"
                : "This Month"}
            </span>
            <FaCaretDown className="w-4 h-4 text-brand-text-secondary" />
          </button>

          {showTimeFilter && (
            <div className="absolute top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-brand-lavender-light/20 py-2 z-10">
              {[
                { value: "all", label: "All Time" },
                { value: "last20", label: "Last 20" },
                { value: "today", label: "Today" },
                { value: "week", label: "This Week" },
                { value: "month", label: "This Month" },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSelectedTime(option.value as TimeRange);
                    setShowTimeFilter(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-brand-lavender-light/5 transition-colors
                           ${
                             selectedTime === option.value
                               ? "text-brand-accent"
                               : "text-brand-text-primary"
                           }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {sessions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-brand-lavender-light/20">
            <h3 className="text-lg font-medium text-brand-text-primary mb-2">
              No chat history yet
            </h3>
            <p className="text-brand-text-secondary">
              Chat history will appear here once you start conversations with
              your websites.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6 hover:border-brand-lavender-light/40 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-brand-lavender-light/10 rounded-lg">
                        {session.type === "voice" ? (
                          <FaVolumeUp className="w-5 h-5 text-brand-accent" />
                        ) : (
                          <FaKeyboard className="w-5 h-5 text-brand-accent" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-brand-text-secondary">
                            {session.website.domain}
                          </span>
                          <span className="text-xs text-brand-text-secondary">
                            •
                          </span>
                          <span className="text-sm text-brand-text-secondary">
                            {new Date(session.startedAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-brand-text-primary font-medium mb-2">
                          {session.initialQuery}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-brand-text-secondary">
                            {session.messageCount} messages in conversation
                          </span>
                        </div>
                      </div>
                    </div>
                    <Link
                      href={`/app/chats/session?id=${session.id}`}
                      className="flex items-center gap-1 text-brand-accent hover:text-brand-accent/80 transition-colors text-sm"
                    >
                      View conversation
                      <FaChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            {hasMore && (
              <div className="text-center pt-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-brand-accent text-white rounded-xl hover:bg-brand-accent/90 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
