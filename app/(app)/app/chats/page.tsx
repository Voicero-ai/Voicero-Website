"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  FaVolumeUp,
  FaKeyboard,
  FaChevronRight,
  FaFilter,
  FaSort,
  FaCaretDown,
  FaMousePointer,
  FaScroll,
  FaShoppingCart,
  FaExchangeAlt,
  FaSearch,
  FaTimes,
  FaSpinner,
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
  hasAction?: {
    click?: boolean;
    scroll?: boolean;
    purchase?: boolean;
    redirect?: boolean;
  };
}

interface SearchResult {
  threadId: string;
  messageId: string;
  content: string;
  role: string;
  createdAt: string;
  websiteDomain: string;
  websiteName?: string;
  matchContext: string;
}

type SortOption = "recent" | "oldest" | "longest" | "shortest";
type ActionType = "all" | "click" | "scroll" | "purchase" | "redirect";

export default function Chats() {
  const searchParams = useSearchParams()!;
  const websiteId = searchParams.get("website");

  const [showWebsiteFilter, setShowWebsiteFilter] = useState(false);
  const [showSortFilter, setShowSortFilter] = useState(false);
  const [showActionFilter, setShowActionFilter] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  const [selectedWebsite, setSelectedWebsite] = useState<string>("all");
  const [selectedSort, setSelectedSort] = useState<SortOption>("recent");
  const [selectedAction, setSelectedAction] = useState<ActionType>("all");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

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

  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Close modal when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        setShowSearchModal(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when modal opens
  useEffect(() => {
    if (showSearchModal && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearchModal]);

  // Handle search
  const handleSearch = async () => {
    // Require at least 7 characters
    if (!searchQuery || searchQuery.length < 7) {
      setSearchError("Please enter at least 7 characters to search");
      return;
    }

    try {
      setIsSearching(true);
      setSearchError(null);

      const response = await fetch(
        `/api/chatSearch?q=${encodeURIComponent(searchQuery)}`
      );

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      setSearchResults(data.results);

      if (data.results.length === 0) {
        setSearchError("No results found");
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  // Initial load
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (selectedWebsite !== "all")
          params.append("websiteId", selectedWebsite);
        if (selectedSort) params.append("sort", selectedSort);
        if (selectedAction !== "all") params.append("action", selectedAction);
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
  }, [selectedWebsite, selectedSort, selectedAction]);

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
      if (selectedSort) params.append("sort", selectedSort);
      if (selectedAction !== "all") params.append("action", selectedAction);
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
  }, [selectedWebsite, selectedSort, selectedAction]);

  const highlightMatchText = (text: string, query: string) => {
    if (!query) return text;

    const regex = new RegExp(
      `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi"
    );
    return text.replace(
      regex,
      '<span class="bg-brand-accent/20 font-medium">$1</span>'
    );
  };

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
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-brand-text-primary mb-2">
            Chat History
          </h1>
          <p className="text-brand-text-secondary">
            View past chat sessions across your websites
          </p>
        </div>
        <button
          onClick={() => setShowSearchModal(true)}
          className="px-4 py-2 bg-brand-accent text-white rounded-xl hover:bg-brand-accent/90 transition-colors flex items-center gap-2"
        >
          <FaSearch className="w-4 h-4" />
          <span>Search Messages</span>
        </button>
      </header>

      <div className="flex flex-wrap gap-4 items-center">
        {/* Website Filter */}
        <div className="relative">
          <button
            onClick={() => setShowWebsiteFilter(!showWebsiteFilter)}
            className="px-4 py-2 bg-white rounded-xl border border-brand-lavender-light/20 flex items-center gap-2 hover:border-brand-lavender-light/40 transition-colors"
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

        {/* Action Type Filter */}
        <div className="relative">
          <button
            onClick={() => setShowActionFilter(!showActionFilter)}
            className="px-4 py-2 bg-white rounded-xl border border-brand-lavender-light/20 flex items-center gap-2 hover:border-brand-lavender-light/40 transition-colors"
          >
            {selectedAction === "click" ? (
              <FaMousePointer className="w-4 h-4 text-brand-text-secondary" />
            ) : selectedAction === "scroll" ? (
              <FaScroll className="w-4 h-4 text-brand-text-secondary" />
            ) : selectedAction === "purchase" ? (
              <FaShoppingCart className="w-4 h-4 text-brand-text-secondary" />
            ) : selectedAction === "redirect" ? (
              <FaExchangeAlt className="w-4 h-4 text-brand-text-secondary" />
            ) : (
              <FaFilter className="w-4 h-4 text-brand-text-secondary" />
            )}
            <span className="text-sm text-brand-text-primary">
              {selectedAction === "all"
                ? "All Actions"
                : `${selectedAction} Actions`}
            </span>
            <FaCaretDown className="w-4 h-4 text-brand-text-secondary" />
          </button>

          {showActionFilter && (
            <div className="absolute top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-brand-lavender-light/20 py-2 z-10">
              {[
                { value: "all", label: "All Actions" },
                { value: "click", label: "Click Actions" },
                { value: "scroll", label: "Scroll Actions" },
                { value: "purchase", label: "Purchase Actions" },
                { value: "redirect", label: "Redirect Actions" },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSelectedAction(option.value as ActionType);
                    setShowActionFilter(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-brand-lavender-light/5 transition-colors
                           ${
                             selectedAction === option.value
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
                          {session.hasAction && (
                            <div className="flex items-center gap-1">
                              {session.hasAction.click && (
                                <span title="Has clicks">
                                  <FaMousePointer className="w-3 h-3 text-brand-accent" />
                                </span>
                              )}
                              {session.hasAction.scroll && (
                                <span title="Has scrolls">
                                  <FaScroll className="w-3 h-3 text-brand-accent" />
                                </span>
                              )}
                              {session.hasAction.purchase && (
                                <span title="Has purchases">
                                  <FaShoppingCart className="w-3 h-3 text-brand-accent" />
                                </span>
                              )}
                              {session.hasAction.redirect && (
                                <span title="Has redirects">
                                  <FaExchangeAlt className="w-3 h-3 text-brand-accent" />
                                </span>
                              )}
                            </div>
                          )}
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

      {/* Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div
            ref={modalRef}
            className="bg-white rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
          >
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold text-brand-text-primary">
                Search Messages
              </h2>
              <button
                onClick={() => setShowSearchModal(false)}
                className="text-brand-text-secondary hover:text-brand-text-primary transition-colors"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b">
              <div className="flex gap-2">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for messages (min 7 characters)..."
                  className="flex-1 px-4 py-2 border border-brand-lavender-light/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent/30 text-brand-text-primary"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching || searchQuery.length < 7}
                  className="px-4 py-2 bg-brand-accent text-white rounded-xl hover:bg-brand-accent/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSearching ? (
                    <FaSpinner className="w-4 h-4 animate-spin" />
                  ) : (
                    <FaSearch className="w-4 h-4" />
                  )}
                  <span>Search</span>
                </button>
              </div>
              {searchError && (
                <p className="text-red-500 mt-2 text-sm">{searchError}</p>
              )}
              {searchQuery.length > 0 && searchQuery.length < 7 && (
                <p className="text-brand-text-secondary mt-2 text-sm">
                  Please enter at least 7 characters to search
                </p>
              )}
            </div>

            <div className="overflow-y-auto flex-grow p-4 space-y-4">
              {searchResults.length === 0 && !searchError && !isSearching && (
                <div className="text-center py-8 text-brand-text-secondary">
                  Search for messages across all your website conversations
                </div>
              )}

              {isSearching && (
                <div className="text-center py-8 text-brand-text-secondary flex items-center justify-center gap-3">
                  <FaSpinner className="w-5 h-5 animate-spin text-brand-accent" />
                  <span>Searching...</span>
                </div>
              )}

              {searchResults.map((result) => (
                <Link
                  href={`/app/chats/session?id=${result.threadId}&messageId=${result.messageId}`}
                  key={result.messageId}
                  className="block bg-white border border-brand-lavender-light/20 rounded-xl p-4 hover:border-brand-lavender-light/40 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-sm font-medium text-brand-text-secondary">
                        {result.websiteDomain}
                      </span>
                      <span className="text-xs text-brand-text-secondary mx-1">
                        •
                      </span>
                      <span className="text-sm text-brand-text-secondary">
                        {new Date(result.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        result.role === "user"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {result.role === "user" ? "User" : "Assistant"}
                    </span>
                  </div>
                  <div className="text-brand-text-primary">
                    <div
                      className="line-clamp-3"
                      dangerouslySetInnerHTML={{
                        __html: highlightMatchText(
                          result.matchContext,
                          searchQuery
                        ),
                      }}
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <div className="flex items-center gap-1 text-brand-accent text-sm">
                      View in conversation
                      <FaChevronRight className="w-3 h-3" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
