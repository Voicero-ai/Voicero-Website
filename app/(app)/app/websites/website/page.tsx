"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  FaSync,
  FaCreditCard,
  FaShoppingBag,
  FaNewspaper,
  FaFile,
  FaExternalLinkAlt,
  FaCheck,
  FaPowerOff,
  FaLayerGroup,
  FaRobot,
  FaComments,
  FaExclamationTriangle,
  FaTrash,
  FaPercent,
  FaEllipsisV,
  FaCog,
  FaQuestionCircle,
  FaChartLine,
} from "react-icons/fa";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// SVG Icons for different options
const SVG_ICONS = {
  // Voice icons
  microphone: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
    >
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z" />
    </svg>
  ),
  waveform: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M3 12h2v3H3v-3zm4-4h2v10H7V8zm4-6h2v22h-2V2zm4 6h2v10h-2V8zm4 4h2v3h-2v-3z" />
    </svg>
  ),
  speaker: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M5 9v6h4l5 5V4L9 9H5zm13.54.12a1 1 0 1 0-1.41 1.42 3 3 0 0 1 0 4.24 1 1 0 1 0 1.41 1.41 5 5 0 0 0 0-7.07z" />
    </svg>
  ),

  // Message icons
  message: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM4 16V4h16v12H5.17L4 17.17V16z" />
    </svg>
  ),
  cursor: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      viewBox="0 0 24 24"
      width="24"
      height="24"
    >
      <path d="M11 2h2v20h-2z" />
    </svg>
  ),
  document: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M4 4h16v2H4V4zm0 4h16v2H4V8zm0 4h10v2H4v-2zm0 4h16v2H4v-2z" />
    </svg>
  ),

  // Bot icons
  bot: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width="24"
      height="24"
      fill="currentColor"
    >
      <rect
        x="12"
        y="16"
        width="40"
        height="32"
        rx="10"
        ry="10"
        stroke="black"
        strokeWidth="2"
        fill="currentColor"
      />
      <circle cx="22" cy="32" r="4" fill="white" />
      <circle cx="42" cy="32" r="4" fill="white" />
      <path
        d="M24 42c4 4 12 4 16 0"
        stroke="white"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <line x1="32" y1="8" x2="32" y2="16" stroke="black" strokeWidth="2" />
      <circle cx="32" cy="6" r="2" fill="black" />
    </svg>
  ),
  voice: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M5 9v6h4l5 5V4L9 9H5zm13.54.12a1 1 0 1 0-1.41 1.42 3 3 0 0 1 0 4.24 1 1 0 1 0 1.41 1.41 5 5 0 0 0 0-7.07z" />
    </svg>
  ),
};

// Type for each content item
interface ContentItem {
  id: string;
  title: string;
  url: string;
  type: "product" | "post" | "page" | "collection" | "discount";
  lastUpdated: string;
  aiRedirects: number;
  description?: string;
  handle?: string;
  image?: any;
  ruleSet?: any;
  sortOrder?: string;
  categories?: Array<{ id: number; name: string }>;
  tags?: Array<{ id: number; name: string }>;
  comments?: Array<{
    id: number;
    author: string;
    content: string;
    date: string;
    status: string;
    parentId?: number;
  }>;
  reviews?: Array<{
    id: number;
    reviewer: string;
    rating: number;
    review: string;
    verified: boolean;
    date: string;
  }>;
  customFields?: Record<string, string>;
  price?: number;
  regularPrice?: number;
  salePrice?: number;
  stockQuantity?: number;
  [key: string]: any;
}

// Add these interfaces at the top with your other interfaces
interface SetupInstructions {
  wordpress: {
    steps: string[];
    pluginUrl: string;
    appUrl?: never;
  };
  shopify: {
    steps: string[];
    appUrl: string;
    pluginUrl?: never;
  };
  custom?: {
    steps: string[];
    docsUrl: string;
  };
}

// New interfaces for rich AI data
interface ActionConversation {
  thread: {
    id: string;
    messages: Array<{
      id: string;
      content: string;
      createdAt: string;
      role: string;
      type: string;
      pageUrl?: string;
      scrollToText?: string;
    }>;
  };
  actions: Array<{
    messageId: string;
    createdAt: string;
    actionType?: string;
    url?: string;
    normalizedUrl?: string;
    buttonText?: string;
    css_selector?: string;
    productId?: string;
    productName?: string;
    sectionId?: string;
    scrollToText?: string;
  }>;
}

interface ActionDetails {
  cart: ActionConversation[];
  movement: ActionConversation[];
  orders: ActionConversation[];
}

interface AIOverview {
  total_message_threads: number;
  resolved_threads: number;
  total_threads: number;
  problem_resolution_rate: {
    percent: number;
  };
  period_label: string;
  avg_messages_per_thread: number;
  most_common_questions: Array<{
    category: string;
    threads: number;
    description: string;
  }>;
  recent_questions_by_topic: Array<{
    topic: string;
    items: Array<{
      question: string;
      status: string;
      note: string;
    }>;
  }>;
  total_revenue_increase: {
    amount: number;
    currency: string;
    breakdown: {
      threads: number;
      percent_of_total_threads: number;
      aov: number;
    };
  };
}

// Update WebsiteData interface to include new fields
interface WebsiteData {
  id: string;
  domain: string;
  type: string;
  plan: string;
  name: string;
  active: boolean;
  status: "active" | "inactive";
  monthlyQueries: number;
  queryLimit: number;
  lastSync: string | null;
  accessKey: string | null;
  color: string;
  globalStats: {
    totalAiRedirects: number;
    totalVoiceChats: number;
    totalTextChats: number;
  };
  stats: {
    aiRedirects: number;
    totalRedirects: number;
    redirectRate: number;
    aiScrolls?: number;
    aiPurchases?: number;
    aiClicks?: number;
    totalVoiceChats?: number;
    totalTextChats?: number;
  };
  content: {
    products: ContentItem[];
    blogPosts: ContentItem[];
    pages: ContentItem[];
    discounts?: ContentItem[];
    collections?: Array<{
      id: string;
      title: string;
      handle: string;
      updatedAt?: string;
      createdAt?: string;
      description?: string;
      image?: any;
      ruleSet?: any;
      sortOrder?: string;
      products?: Array<{ id: string; title: string; price: number }>;
      aiRedirects: number;
    }>;
  };
  stripeId?: string;
  customInstructions: string | null;
  popUpQuestions: Array<{
    id: string;
    question: string;
    createdAt: string;
  }>;
  customType?: string;
  botName: string;
  customWelcomeMessage: string;
  iconBot: "bot" | "voice" | "message" | string;
  iconVoice: "microphone" | "waveform" | "speaker" | string;
  iconMessage: "message" | "document" | "cursor" | string;
  allowAutoCancel?: boolean;
  allowAutoReturn?: boolean;
  allowAutoExchange?: boolean;
  allowAutoClick?: boolean;
  allowAutoScroll?: boolean;
  allowAutoHighlight?: boolean;
  allowAutoRedirect?: boolean;
  allowAutoGetUserOrders?: boolean;
  allowAutoUpdateUserInfo?: boolean;
  allowAutoFillForm?: boolean;
  allowAutoTrackOrder?: boolean;
  allowAutoLogout?: boolean;
  allowAutoLogin?: boolean;
  allowAutoGenerateImage?: boolean;
  allowMultiAIReview?: boolean;
  clickMessage?: string;
  // New fields
  actionConversations?: ActionDetails;
  actionDetails?: ActionDetails;
  aiOverview?: AIOverview;
  aiOverviewRevenue?: {
    amount: number;
    currency: string;
    breakdown: {
      threads: number;
      percent_of_total_threads: number;
      aov: number;
    };
  };
  showVoiceAI?: boolean;
  showTextAI?: boolean;
}

// Add this helper function at the top of the file
function countWords(str: string): number {
  return str.trim().split(/\s+/).length;
}

// Parse assistant JSON content to extract a clean answer and action
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

// Simple client-side cache key prefix for website data
const CACHE_KEY_PREFIX = "voicero.websiteData.cache:";

export default function WebsiteSettings() {
  const searchParams = useSearchParams()!;
  const websiteId = searchParams.get("id");

  const [websiteData, setWebsiteData] = useState<WebsiteData | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<
    "products" | "posts" | "pages" | "collections" | "discounts"
  >("products");

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // Add this state to track the toggle operation
  const [isToggling, setIsToggling] = useState(false);

  // Add this state for syncing status
  // Plan-related state variables removed as they're no longer needed

  const [isDeletingContent, setIsDeletingContent] = useState<
    Record<string, boolean>
  >({});
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // New state for caching and AI data
  const [cachedData, setCachedData] = useState<WebsiteData | null>(null);
  const [isRefreshingAI, setIsRefreshingAI] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  type ActionType = "cart" | "movement" | "orders";
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<
    Record<string, boolean>
  >({});
  const toggleThreadExpanded = (threadId: string) =>
    setExpandedThreads((prev) => ({ ...prev, [threadId]: !prev[threadId] }));

  // AI Feature Toggle States
  const [showVoiceAI, setShowVoiceAI] = useState<boolean>(false);
  const [showTextAI, setShowTextAI] = useState<boolean>(false);
  const [isTogglingAI, setIsTogglingAI] = useState(false);

  // Debug state changes
  useEffect(() => {
    console.log("showVoiceAI state changed to:", showVoiceAI);
  }, [showVoiceAI]);

  useEffect(() => {
    console.log("showTextAI state changed to:", showTextAI);
  }, [showTextAI]);

  // Track user edits to prevent them from being overwritten by background refreshes
  const [userEditedVoiceAI, setUserEditedVoiceAI] = useState<boolean | null>(
    null
  );
  const [userEditedTextAI, setUserEditedTextAI] = useState<boolean | null>(
    null
  );
  // Refs to avoid stale closures in async fetch handlers
  const userEditedVoiceAIRef = React.useRef<boolean | null>(null);
  const userEditedTextAIRef = React.useRef<boolean | null>(null);
  const [userEditedActive, setUserEditedActive] = useState<boolean | null>(
    null
  );
  const userEditedActiveRef = React.useRef<boolean | null>(null);
  useEffect(() => {
    userEditedVoiceAIRef.current = userEditedVoiceAI;
  }, [userEditedVoiceAI]);
  useEffect(() => {
    userEditedTextAIRef.current = userEditedTextAI;
  }, [userEditedTextAI]);
  useEffect(() => {
    userEditedActiveRef.current = userEditedActive;
  }, [userEditedActive]);

  // AI Feature Toggle Functions
  const handleToggleVoiceAI = async () => {
    if (!websiteId || isTogglingAI) return;

    setIsTogglingAI(true);
    try {
      const response = await fetch("/api/websites/update-ui-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId,
          showVoiceAI: !showVoiceAI,
        }),
      });

      if (response.ok) {
        const newShowVoiceAI = !showVoiceAI;
        setShowVoiceAI(newShowVoiceAI);

        // Keep userEditedVoiceAI until GET confirms server state matches
        setUserEditedVoiceAI(newShowVoiceAI);

        // Update websiteData if it exists
        if (websiteData) {
          const updatedWebsiteData = {
            ...websiteData,
            showVoiceAI: newShowVoiceAI,
          };
          setWebsiteData(updatedWebsiteData);

          // Update cache to keep it in sync
          const cacheKey = `${CACHE_KEY_PREFIX}${websiteId}`;
          try {
            const existingCache = localStorage.getItem(cacheKey);
            if (existingCache) {
              const parsed = JSON.parse(existingCache);
              console.log("Voice AI: Updating cache - before:", {
                cachedShowVoiceAI: parsed.data?.showVoiceAI,
                cachedShowTextAI: parsed.data?.showTextAI,
              });

              const updatedCache = {
                ...parsed,
                data: updatedWebsiteData,
              };

              console.log("Voice AI: Updating cache - after:", {
                cachedShowVoiceAI: updatedCache.data?.showVoiceAI,
                finalShowVoiceAI: updatedWebsiteData.showVoiceAI,
              });

              localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
            }
          } catch {}
        }
      } else {
        console.error("Failed to toggle Voice AI");
      }
    } catch (error) {
      console.error("Error toggling Voice AI:", error);
    } finally {
      setIsTogglingAI(false);
    }
  };

  const handleToggleTextAI = async () => {
    if (!websiteId || isTogglingAI) return;

    setIsTogglingAI(true);
    try {
      const response = await fetch("/api/websites/update-ui-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId,
          showTextAI: !showTextAI,
        }),
      });

      if (response.ok) {
        const newShowTextAI = !showTextAI;
        setShowTextAI(newShowTextAI);

        // Keep userEditedTextAI until GET confirms server state matches
        setUserEditedTextAI(newShowTextAI);

        // Update websiteData if it exists
        if (websiteData) {
          const updatedWebsiteData = {
            ...websiteData,
            showTextAI: newShowTextAI,
          };
          setWebsiteData(updatedWebsiteData);

          // Update cache to keep it in sync
          const cacheKey = `${CACHE_KEY_PREFIX}${websiteId}`;
          try {
            const existingCache = localStorage.getItem(cacheKey);
            if (existingCache) {
              const parsed = JSON.parse(existingCache);
              console.log("Text AI: Updating cache - before:", {
                cachedShowVoiceAI: parsed.data?.showVoiceAI,
                cachedShowTextAI: parsed.data?.showTextAI,
              });

              const updatedCache = {
                ...parsed,
                data: updatedWebsiteData,
              };

              console.log("Text AI: Updating cache - after:", {
                cachedShowVoiceAI: updatedCache.data?.showVoiceAI,
                finalShowTextAI: updatedWebsiteData.showTextAI,
              });

              localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
            }
          } catch {}
        }
      } else {
        console.error("Failed to toggle Text AI");
      }
    } catch (error) {
      console.error("Error toggling Text AI:", error);
    } finally {
      setIsTogglingAI(false);
    }
  };

  const setupInstructions: SetupInstructions = {
    wordpress: {
      steps: [
        "Download and install our WordPress plugin",
        "Go to plugin settings",
        "Enter your access key if it is not already set",
        "Click 'Sync Content Now'",
      ],
      pluginUrl: "https://wordpress.org/plugins/your-plugin", // Replace with actual URL
    },
    shopify: {
      steps: [
        "Install our Shopify app from the Shopify App Store",
        "Go to app settings",
        "Enter your access key if it is not already set",
        "Click 'Sync Content Now'",
      ],
      appUrl: "https://apps.shopify.com/your-app", // Replace with actual URL
    },
  };

  // Note: avoid client-side redirects on data errors; keep user on page

  // 1) Fetch data with stale-while-revalidate using localStorage cache
  useEffect(() => {
    if (!websiteId) return;

    const cacheKey = `${CACHE_KEY_PREFIX}${websiteId}`;
    let usedCache = false;

    // Try to load from localStorage synchronously for instant render
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.data) {
          console.log("Loading from cache:", {
            cachedShowVoiceAI: parsed.data.showVoiceAI,
            cachedShowTextAI: parsed.data.showTextAI,
          });
          setCachedData(parsed.data);
          setWebsiteData(parsed.data);

          // Initialize AI feature states from cache
          setShowVoiceAI(parsed.data.showVoiceAI ?? false);
          setShowTextAI(parsed.data.showTextAI ?? false);

          setIsLoading(false);
          usedCache = true;
        }
      }
    } catch (_) {}

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/websites/get?id=${websiteId}`, {
          method: "GET",
          headers: { "Cache-Control": "no-cache" },
        });

        if (!res.ok) {
          // Do not navigate away; show cached data if available
          return;
        }

        const data = await res.json();

        console.log("Website data loaded:", data);

        // Ensure default values for icon fields
        if (!data.iconBot || data.iconBot === "MessageIcon")
          data.iconBot = "bot";
        if (!data.iconVoice || data.iconVoice === "VoiceIcon")
          data.iconVoice = "microphone";
        if (!data.iconMessage || data.iconMessage === "MessageIcon")
          data.iconMessage = "message";

        // Merge new data with existing cached data to preserve any fields that might be missing
        console.log("Merging data - cached AI states:", {
          cachedShowVoiceAI: cachedData?.showVoiceAI,
          cachedShowTextAI: cachedData?.showTextAI,
        });
        console.log("Merging data - new AI states:", {
          newShowVoiceAI: data.showVoiceAI,
          newShowTextAI: data.showTextAI,
        });
        console.log("Merging data - user edited states:", {
          userEditedVoiceAI,
          userEditedTextAI,
          userEditedActive,
        });

        const mergedData = {
          ...cachedData,
          ...data,
          // Ensure AI feature states are preserved - prioritize user edits, then new data, then cached data, then defaults
          showVoiceAI:
            userEditedVoiceAIRef.current !== null
              ? userEditedVoiceAIRef.current
              : data.showVoiceAI !== undefined
              ? data.showVoiceAI
              : cachedData?.showVoiceAI ?? false,
          showTextAI:
            userEditedTextAIRef.current !== null
              ? userEditedTextAIRef.current
              : data.showTextAI !== undefined
              ? data.showTextAI
              : cachedData?.showTextAI ?? false,
          // Preserve website active status similarly to AI flags
          active:
            userEditedActiveRef.current !== null
              ? userEditedActiveRef.current
              : data.active !== undefined
              ? data.active
              : cachedData?.active ?? false,
          status:
            userEditedActiveRef.current !== null
              ? userEditedActiveRef.current
                ? "active"
                : "inactive"
              : data.status !== undefined
              ? data.status
              : cachedData?.status ??
                ((cachedData?.active ? "active" : "inactive") as
                  | "active"
                  | "inactive"),
        };

        console.log("Merged data - final AI states:", {
          finalShowVoiceAI: mergedData.showVoiceAI,
          finalShowTextAI: mergedData.showTextAI,
          userEditedVoiceAI,
          userEditedTextAI,
          preservingUserEdits:
            userEditedVoiceAI !== null || userEditedTextAI !== null,
        });

        setCachedData(mergedData);
        setWebsiteData(mergedData);

        // If server confirms user's pending edits, clear the flags
        if (
          userEditedVoiceAIRef.current !== null &&
          mergedData.showVoiceAI === userEditedVoiceAIRef.current
        ) {
          setUserEditedVoiceAI(null);
        }
        if (
          userEditedTextAIRef.current !== null &&
          mergedData.showTextAI === userEditedTextAIRef.current
        ) {
          setUserEditedTextAI(null);
        }

        if (
          userEditedActiveRef.current !== null &&
          mergedData.active === userEditedActiveRef.current
        ) {
          setUserEditedActive(null);
        }

        // Initialize AI feature states
        console.log("Setting AI feature states:", {
          showVoiceAI: mergedData.showVoiceAI,
          showTextAI: mergedData.showTextAI,
        });
        setShowVoiceAI(mergedData.showVoiceAI ?? false);
        setShowTextAI(mergedData.showTextAI ?? false);

        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ ts: Date.now(), data: mergedData })
          );
        } catch {}
      } catch (error) {
        // Do not navigate away on error; continue showing cache if present
      } finally {
        if (!usedCache) setIsLoading(false);
      }
    };

    if (!usedCache) setIsLoading(true);
    fetchData();
  }, [websiteId]);

  // Function to refresh AI data in background
  const refreshAIData = async () => {
    if (!websiteId || isRefreshingAI) return;

    setIsRefreshingAI(true);
    const cacheKey = `${CACHE_KEY_PREFIX}${websiteId}`;
    try {
      const res = await fetch(`/api/websites/get?id=${websiteId}`, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
      });

      if (res.ok) {
        const data = await res.json();

        console.log("AI data refreshed:", data);
        // Only update if we have new AI data or if cached data is missing AI fields
        if (data.aiOverview || data.actionDetails || !cachedData?.aiOverview) {
          // Merge new data with existing cached data to preserve any fields that might be missing
          const mergedData = {
            ...cachedData,
            ...data,
            // Ensure AI feature states are preserved - prioritize user edits, then new data, then cached data, then defaults
            showVoiceAI:
              userEditedVoiceAIRef.current !== null
                ? userEditedVoiceAIRef.current
                : data.showVoiceAI !== undefined
                ? data.showVoiceAI
                : cachedData?.showVoiceAI ?? false,
            showTextAI:
              userEditedTextAIRef.current !== null
                ? userEditedTextAIRef.current
                : data.showTextAI !== undefined
                ? data.showTextAI
                : cachedData?.showTextAI ?? false,
          };

          setCachedData(mergedData);
          setWebsiteData(mergedData);

          // If server confirms user's pending edits, clear the flags
          if (
            userEditedVoiceAIRef.current !== null &&
            mergedData.showVoiceAI === userEditedVoiceAIRef.current
          ) {
            setUserEditedVoiceAI(null);
          }
          if (
            userEditedTextAIRef.current !== null &&
            mergedData.showTextAI === userEditedTextAIRef.current
          ) {
            setUserEditedTextAI(null);
          }

          // If server confirms user's pending edits, clear the flags
          if (
            userEditedVoiceAI !== null &&
            mergedData.showVoiceAI === userEditedVoiceAI
          ) {
            setUserEditedVoiceAI(null);
          }
          if (
            userEditedTextAI !== null &&
            mergedData.showTextAI === userEditedTextAI
          ) {
            setUserEditedTextAI(null);
          }

          // Initialize AI feature states
          setShowVoiceAI(mergedData.showVoiceAI ?? false);
          setShowTextAI(mergedData.showTextAI ?? false);

          try {
            localStorage.setItem(
              cacheKey,
              JSON.stringify({ ts: Date.now(), data: mergedData })
            );
          } catch {}
        }
      }
    } catch (_) {
    } finally {
      setIsRefreshingAI(false);
    }
  };

  // Check if setup is needed when data loads
  useEffect(() => {
    if (websiteData && !websiteData.lastSync) {
      setShowSetupModal(true);
    }
  }, [websiteData]);

  // Set active tab to "pages" for Custom websites
  useEffect(() => {
    if (websiteData && websiteData.type === "Custom") {
      setActiveTab("pages");
    }
  }, [websiteData]);

  // Auto-refresh AI data only when needed
  useEffect(() => {
    if (cachedData && !isRefreshingAI) {
      // Only refresh if we don't have AI data yet
      if (!cachedData.aiOverview && !cachedData.actionDetails) {
        const timer = setTimeout(() => {
          refreshAIData();
        }, 3000); // Increased delay to avoid unnecessary refreshes

        return () => clearTimeout(timer);
      }
    }
  }, [cachedData]);

  // Stripe-related useEffect removed since it's no longer needed

  // 2) Handle sync
  const handleSync = async () => {
    if (!websiteData) return;

    setIsSyncing(true);
    try {
      const type = websiteData.type?.toLowerCase() || "";
      const isWordPress =
        type === "wordpress" || type === "wp" || type.includes("wordpress");
      const isShopify = type === "shopify";
      const isCustom = type === "custom";

      if (isWordPress) {
        // WordPress logic remains the same
        const adminUrl = `${websiteData.domain}/wp-admin/admin.php?page=ai-website-admin`;
        window.open(adminUrl, "_blank");
      } else if (isShopify) {
        // Extract store name from domain - handle both myshopify.com and custom domains
        const storeName = websiteData.domain
          .replace(/^https?:\/\//, "") // Remove http:// or https://
          .split(".")[0]; // Get the first part of the domain

        // Redirect to Shopify admin app page
        const shopifyAdminUrl = `https://admin.shopify.com/store/${storeName}/apps/voicero-app-shop/app`;
        window.open(shopifyAdminUrl, "_blank");
      } else if (isCustom) {
        // Open sync in a new tab to avoid navigating away
        window.open(`/app/websites/syncContent?id=${websiteData.id}`, "_blank");
      }
    } catch (error) {
      console.error("Error during sync:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // No subscription management needed anymore
  const handleManageSubscription = async () => {
    // Function kept for backwards compatibility but doesn't do anything
    console.log("Subscription management removed");
  };

  // Shopify pricing redirect removed (not needed anymore)

  // Add this function inside WebsiteSettings component
  const handleToggleStatus = async () => {
    if (!websiteData || isToggling) return;

    // Prevent activation if never synced
    if (!websiteData.lastSync) {
      setShowSetupModal(true);
      return;
    }

    const currentActive = websiteData.active;
    const newStatus = !currentActive;

    setIsToggling(true);

    try {
      // Optimistically update the UI
      setWebsiteData({
        ...websiteData,
        active: newStatus,
        status: newStatus ? "active" : "inactive",
      } as WebsiteData);

      // Mark user edit and update cache immediately
      setUserEditedActive(newStatus);
      try {
        const cacheKey = `${CACHE_KEY_PREFIX}${websiteId}`;
        const existingCache = localStorage.getItem(cacheKey);
        if (existingCache) {
          const parsed = JSON.parse(existingCache);
          const updatedCache = {
            ...parsed,
            data: {
              ...(parsed?.data || {}),
              ...websiteData,
              active: newStatus,
              status: newStatus ? "active" : "inactive",
            },
          };
          localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
        }
      } catch {}

      const response = await fetch("/api/websites/toggle-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          websiteId: websiteData.id,
        }),
      });

      if (!response.ok) {
        // Revert using the stored original state
        setWebsiteData({
          ...websiteData,
          active: currentActive,
          status: currentActive ? "active" : "inactive",
        } as WebsiteData);
        throw new Error("Failed to toggle status");
      }

      const data = await response.json();
      // Update with server response to ensure sync
      setWebsiteData({
        ...websiteData,
        active: data.status === "active",
        status: data.status,
      } as WebsiteData);

      // Sync cache with server-confirmed state
      try {
        const cacheKey = `${CACHE_KEY_PREFIX}${websiteId}`;
        const existingCache = localStorage.getItem(cacheKey);
        if (existingCache) {
          const parsed = JSON.parse(existingCache);
          const updatedCache = {
            ...parsed,
            data: {
              ...(parsed?.data || {}),
              ...websiteData,
              active: data.status === "active",
              status: data.status,
            },
          };
          localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
        }
      } catch {}
    } catch (error) {
      console.error("Error toggling status:", error);
    } finally {
      setIsToggling(false);
    }
  };

  const handlePlanChange = async () => {
    // Function kept for backwards compatibility
    console.log("Plan changes removed");
  };

  // Cancel plan function removed (not needed)
  const handleCancelPlan = async () => {
    // Function kept for backwards compatibility
    console.log("Plan cancellation removed");
  };

  // 3) If loading or no data yet, show a loading state
  if (isLoading || !websiteData) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse mb-2" />
            <div className="h-4 w-64 bg-gray-200 rounded-lg animate-pulse" />
          </div>
          <div className="flex gap-4">
            <div className="h-10 w-24 bg-gray-200 rounded-xl animate-pulse" />
            <div className="h-10 w-28 bg-gray-200 rounded-xl animate-pulse" />
            <div className="h-10 w-36 bg-gray-200 rounded-xl animate-pulse" />
          </div>
        </div>

        {/* Usage Stats Skeleton */}
        <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
          <div className="h-6 w-24 bg-gray-200 rounded-lg animate-pulse mb-4" />
          <div className="bg-brand-lavender-light/5 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="h-4 w-32 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-4 w-24 bg-gray-200 rounded-lg animate-pulse" />
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 animate-pulse" />
          </div>
        </div>

        {/* Global Stats Skeleton */}
        <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
          <div className="h-6 w-36 bg-gray-200 rounded-lg animate-pulse mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <div className="h-4 w-32 bg-gray-200 rounded-lg animate-pulse mb-2" />
                <div className="h-8 w-24 bg-gray-200 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Content Tabs Skeleton */}
        <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 overflow-hidden">
          <div className="border-b border-brand-lavender-light/20">
            <div className="flex">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="px-6 py-4">
                  <div className="h-4 w-24 bg-gray-200 rounded-lg animate-pulse" />
                </div>
              ))}
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-4 bg-white rounded-lg border border-brand-lavender-light/20"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="h-5 w-48 bg-gray-200 rounded-lg animate-pulse mb-2" />
                      <div className="h-4 w-64 bg-gray-200 rounded-lg animate-pulse" />
                    </div>
                  </div>
                  <div className="h-20 bg-gray-200 rounded-lg animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4) We have the data now. Let's destructure
  const {
    domain,
    status,
    type,
    customType,
    plan,
    name,
    monthlyQueries,
    queryLimit,
    globalStats,
    content,
  } = websiteData;

  // For convenience in the tab content
  const { products, blogPosts, pages, discounts = [] } = content;

  // 5) We reuse your ContentList component for each tab
  const ContentList = ({ items }: { items: ContentItem[] }) => {
    const [expandedItems, setExpandedItems] = useState<string[]>([]);
    const [showReviews, setShowReviews] = useState<Record<string, boolean>>({});
    const [showComments, setShowComments] = useState<Record<string, boolean>>(
      {}
    );
    const [showVariants, setShowVariants] = useState<Record<string, boolean>>(
      {}
    );
    const [showImages, setShowImages] = useState<Record<string, boolean>>({});
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<
      Record<string, boolean>
    >({});

    // Validate items have proper type
    useEffect(() => {
      console.log("ContentList items:", items);
      const invalidItems = items.filter(
        (item) =>
          !item.type ||
          !["product", "post", "page", "collection", "discount"].includes(
            item.type
          )
      );
      if (invalidItems.length > 0) {
        console.error("Invalid content items detected:", invalidItems);
      }
    }, [items]);

    const toggleExpand = (itemId: string) => {
      setExpandedItems((prev) =>
        prev.includes(itemId)
          ? prev.filter((id) => id !== itemId)
          : [...prev, itemId]
      );
    };

    const toggleReviews = (itemId: string) => {
      setShowReviews((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
    };

    const toggleComments = (itemId: string) => {
      setShowComments((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
    };

    const toggleVariants = (itemId: string) => {
      setShowVariants((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
    };

    const toggleImages = (itemId: string) => {
      setShowImages((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
    };

    const handleDeleteContent = async (item: ContentItem) => {
      if (!websiteData) return;

      // Set deleting state for this item
      setIsDeletingContent((prev) => ({ ...prev, [item.id]: true }));
      setDeleteError(null);

      // Validate that item has a valid type before proceeding
      if (
        !item.type ||
        !["product", "post", "page", "collection", "discount"].includes(
          item.type
        )
      ) {
        setDeleteError(`Invalid content type: ${item.type || "undefined"}`);
        setIsDeletingContent((prev) => ({ ...prev, [item.id]: false }));
        return;
      }

      console.log(`Deleting ${item.type} with ID ${item.id}`);

      try {
        const response = await fetch("/api/websites/delete-content", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            websiteId: websiteData.id,
            contentId: item.id,
            contentType: item.type,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Failed to delete ${item.type}`);
        }

        // Remove item from local state
        if (item.type === "product") {
          setWebsiteData({
            ...websiteData,
            content: {
              ...websiteData.content,
              products: websiteData.content.products.filter(
                (p) => p.id !== item.id
              ),
            },
          } as WebsiteData);
        } else if (item.type === "post") {
          setWebsiteData({
            ...websiteData,
            content: {
              ...websiteData.content,
              blogPosts: websiteData.content.blogPosts.filter(
                (p) => p.id !== item.id
              ),
            },
          } as WebsiteData);
        } else if (item.type === "page") {
          setWebsiteData({
            ...websiteData,
            content: {
              ...websiteData.content,
              pages: websiteData.content.pages.filter((p) => p.id !== item.id),
            },
          } as WebsiteData);
        } else if (
          item.type === "collection" &&
          websiteData.content.collections
        ) {
          setWebsiteData({
            ...websiteData,
            content: {
              ...websiteData.content,
              collections: websiteData.content.collections.filter(
                (c) => c.id !== item.id
              ),
            },
          } as WebsiteData);
        } else if (item.type === "discount" && websiteData.content.discounts) {
          setWebsiteData({
            ...websiteData,
            content: {
              ...websiteData.content,
              discounts: websiteData.content.discounts.filter(
                (d) => d.id !== item.id
              ),
            },
          } as WebsiteData);
        }

        // Close delete confirmation
        setShowDeleteConfirm((prev) => ({ ...prev, [item.id]: false }));
      } catch (error) {
        console.error(`Error deleting ${item.type}:`, error);
        setDeleteError(
          error instanceof Error
            ? error.message
            : `Failed to delete ${item.type}`
        );
      } finally {
        setIsDeletingContent((prev) => ({ ...prev, [item.id]: false }));
      }
    };

    return (
      <div className="space-y-4">
        {deleteError && (
          <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4">
            {deleteError}
          </div>
        )}
        {items.length === 0 ? (
          <div className="p-4 bg-gray-50 text-gray-500 rounded-lg text-center">
            No items found
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="p-4 bg-white rounded-lg border border-brand-lavender-light/20"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-brand-text-primary">
                      {item.title}
                    </h3>
                    {item.type === "collection" &&
                      item.productsCount !== undefined && (
                        <span className="text-sm text-brand-text-secondary">
                          ({item.productsCount} products)
                        </span>
                      )}
                  </div>
                  <p className="text-sm text-brand-text-secondary">
                    {domain}
                    {item.url}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`${domain}${item.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-brand-text-secondary hover:text-brand-accent 
                             transition-colors rounded-lg hover:bg-brand-lavender-light/5"
                  >
                    <FaExternalLinkAlt className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() =>
                      setShowDeleteConfirm((prev) => ({
                        ...prev,
                        [item.id]: true,
                      }))
                    }
                    className="p-2 text-red-500 hover:text-red-700 
                             transition-colors rounded-lg hover:bg-red-50"
                    disabled={isDeletingContent[item.id]}
                  >
                    <FaTrash className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Delete Confirmation */}
              {showDeleteConfirm[item.id] && (
                <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-700 mb-2">
                    Are you sure you want to delete{" "}
                    <strong>{item.title}</strong>? This action cannot be undone.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() =>
                        setShowDeleteConfirm((prev) => ({
                          ...prev,
                          [item.id]: false,
                        }))
                      }
                      className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                      disabled={isDeletingContent[item.id]}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDeleteContent(item)}
                      className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
                      disabled={isDeletingContent[item.id]}
                    >
                      {isDeletingContent[item.id] ? (
                        <>
                          <FaSync className="inline-block mr-1 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        "Delete"
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Collection-specific information */}
              {item.type === "collection" && (
                <div className="mb-3 space-y-2">
                  {item.description && (
                    <div className="text-sm text-brand-text-secondary">
                      <p
                        className={
                          expandedItems.includes(item.id) ? "" : "line-clamp-2"
                        }
                      >
                        {item.description}
                      </p>
                      {item.description.length > 100 && (
                        <button
                          onClick={() => toggleExpand(item.id)}
                          className="text-brand-accent hover:text-brand-accent/80 transition-colors mt-1"
                        >
                          {expandedItems.includes(item.id)
                            ? "Show less"
                            : "Read more..."}
                        </button>
                      )}
                    </div>
                  )}
                  {item.sortOrder && (
                    <div className="text-sm text-brand-text-secondary">
                      Sort order: {item.sortOrder}
                    </div>
                  )}
                </div>
              )}

              {/* Categories and Tags */}
              {((item.categories?.length ?? 0) > 0 ||
                (item.tags?.length ?? 0) > 0) && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {item.categories?.map((cat) => (
                    <span
                      key={cat.id}
                      className="px-2 py-1 text-xs bg-brand-lavender-light/10 rounded-full"
                    >
                      {cat.name}
                    </span>
                  ))}
                  {item.tags?.map((tag) => (
                    <span
                      key={tag.id}
                      className="px-2 py-1 text-xs bg-brand-accent/10 rounded-full"
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Product-specific information */}
              {item.type === "product" && (
                <div className="mb-3 space-y-2">
                  <div className="flex items-center gap-4 text-brand-text-secondary">
                    {item.price && (
                      <span className="text-lg font-semibold text-brand-accent">
                        ${item.price}
                      </span>
                    )}
                    {item.salePrice && item.regularPrice && (
                      <span className="text-sm text-brand-text-secondary line-through">
                        ${item.regularPrice}
                      </span>
                    )}
                    {item.stockQuantity !== undefined && (
                      <span className="text-sm text-brand-text-secondary">
                        Stock: {item.stockQuantity}
                      </span>
                    )}
                    {item.vendor && (
                      <span className="text-sm text-brand-text-secondary">
                        Vendor: {item.vendor}
                      </span>
                    )}
                    {item.productType && (
                      <span className="text-sm text-brand-text-secondary">
                        Type: {item.productType}
                      </span>
                    )}
                  </div>

                  {/* Product Variants */}
                  {item.variants && item.variants.length > 0 && (
                    <div className="mt-4">
                      <button
                        onClick={() => toggleVariants(item.id)}
                        className="text-brand-accent hover:text-brand-accent/80 transition-colors"
                      >
                        {showVariants[item.id]
                          ? "Hide Variants"
                          : `Show Variants (${item.variants.length})`}
                      </button>
                      {showVariants[item.id] && (
                        <div className="mt-2 grid gap-2">
                          {item.variants.map((variant: any) => (
                            <div
                              key={variant.id}
                              className="p-2 bg-brand-lavender-light/5 rounded-lg"
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-medium">
                                  {variant.title}
                                </span>
                                <span className="text-brand-accent">
                                  ${variant.price}
                                </span>
                              </div>
                              {variant.sku && (
                                <span className="text-sm text-brand-text-secondary">
                                  SKU: {variant.sku}
                                </span>
                              )}
                              {variant.inventory !== null && (
                                <span className="text-sm text-brand-text-secondary ml-4">
                                  Stock: {variant.inventory}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Product Images */}
                  {item.images && item.images.length > 0 && (
                    <div className="mt-4">
                      <button
                        onClick={() => toggleImages(item.id)}
                        className="text-brand-accent hover:text-brand-accent/80 transition-colors"
                      >
                        {showImages[item.id]
                          ? "Hide Images"
                          : `Show Images (${item.images.length})`}
                      </button>
                      {showImages[item.id] && (
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                          {item.images.map((image: any) => (
                            <div
                              key={image.id}
                              className="relative aspect-square rounded-lg overflow-hidden"
                            >
                              <img
                                src={image.url}
                                alt={image.altText || item.title}
                                className="object-cover w-full h-full"
                              />
                              {image.caption && (
                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white p-1 text-xs">
                                  {image.caption}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Blog post specific information */}
              {item.type === "post" && item.blog && (
                <div className="mb-2 text-sm text-brand-text-secondary">
                  <span>Blog: {item.blog.title}</span>
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="mt-2 rounded-lg max-h-48 object-cover"
                    />
                  )}
                </div>
              )}

              {/* Description / content snippet */}
              <div className="text-sm !text-black mb-3">
                <p
                  style={{
                    color: "black",
                  }}
                  className={
                    expandedItems.includes(item.id) ? "" : "line-clamp-2"
                  }
                >
                  {item.content ?? item.description}
                </p>
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="text-brand-accent hover:text-brand-accent/80 transition-colors mt-1"
                >
                  {expandedItems.includes(item.id)
                    ? "Show less"
                    : "Read more..."}
                </button>
              </div>

              {/* Reviews section for products */}
              {item.type === "product" && (item.reviews?.length ?? 0) > 0 && (
                <div className="mt-4 border-t border-brand-lavender-light/20 pt-4">
                  <button
                    onClick={() => toggleReviews(item.id)}
                    className="text-brand-accent hover:text-brand-accent/80 transition-colors"
                  >
                    {showReviews[item.id]
                      ? "Hide Reviews"
                      : `Show Reviews (${item.reviews?.length ?? 0})`}
                  </button>

                  {showReviews[item.id] && (
                    <div className="mt-3 space-y-3">
                      {item.reviews?.map((review) => (
                        <div
                          key={review.id}
                          className="p-3 bg-brand-lavender-light/5 rounded-lg"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">
                              {review.reviewer}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-yellow-400">
                                {"★".repeat(review.rating)}
                                {"☆".repeat(5 - review.rating)}
                              </span>
                              {review.verified && (
                                <span className="text-xs text-green-500">
                                  Verified Purchase
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-sm">{review.review}</p>
                          <span className="text-xs text-brand-text-secondary mt-2 block">
                            {new Date(review.date).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Comments section for posts */}
              {item.type === "post" && (item.comments?.length ?? 0) > 0 && (
                <div className="mt-4 border-t border-brand-lavender-light/20 pt-4">
                  <button
                    onClick={() => toggleComments(item.id)}
                    className="text-brand-accent hover:text-brand-accent/80 transition-colors"
                  >
                    {showComments[item.id]
                      ? "Hide Comments"
                      : `Show Comments (${item.comments?.length ?? 0})`}
                  </button>

                  {showComments[item.id] && (
                    <div className="mt-3 space-y-3">
                      {item.comments?.map((comment) => (
                        <div
                          key={comment.id}
                          className={`p-3 bg-brand-lavender-light/5 rounded-lg ${
                            comment.parentId ? "ml-8" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">
                              {comment.author}
                            </span>
                            <span className="text-xs text-brand-text-secondary">
                              {new Date(comment.date).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between text-xs text-brand-text-secondary border-t border-brand-lavender-light/20 pt-3">
                <div className="flex items-center gap-4">
                  <span>
                    Last updated:{" "}
                    {new Date(item.lastUpdated).toLocaleDateString()}
                  </span>
                  {item.type === "product" && item.price && (
                    <span className="font-medium">${item.price}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium text-brand-accent">
                    {(item.aiRedirects ?? 0).toLocaleString()}
                  </span>
                  <span>AI redirects</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  // Setup Modal Component
  const SetupModal = () => {
    // Fix the type check to be case-insensitive and more robust
    const type = websiteData?.type?.toLowerCase() || "";
    const isWordPress =
      type === "wordpress" || type === "wp" || type.includes("wordpress");
    const isShopify = type === "shopify";
    const isCustom = type === "custom";

    // Get custom type if applicable
    const customType = websiteData?.customType?.toLowerCase() || "";

    // Custom instructions based on customType
    const customInstructions = {
      steps: [
        `Follow the installation guide for ${
          websiteData?.customType || "Custom"
        }`,
        "Add the Voicero.AI integration code to your website",
        "Enter your access key when prompted",
        "Configure your settings and sync your content",
      ],
      docsUrl: `/docs/custom/${customType || "general"}`,
    };

    // Select appropriate instructions
    const instructions = isWordPress
      ? setupInstructions.wordpress
      : isShopify
      ? setupInstructions.shopify
      : isCustom
      ? customInstructions
      : null;

    if (!showSetupModal || !instructions) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h2 className="text-xl font-semibold text-brand-text-primary">
              Setup Required
            </h2>
            <button
              onClick={() => setShowSetupModal(false)}
              className="text-brand-text-secondary hover:text-brand-text-primary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="overflow-y-auto p-6 flex-1">
            <p className="text-brand-text-secondary mb-4">
              To start syncing your{" "}
              {isWordPress
                ? "WordPress"
                : isShopify
                ? "Shopify"
                : isCustom && customType
                ? websiteData?.customType
                : "Custom"}{" "}
              content, please follow these steps:
            </p>

            <ol className="space-y-3 mb-6">
              {instructions.steps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="text-brand-accent font-medium">
                    {index + 1}.
                  </span>
                  <span className="text-brand-text-secondary">{step}</span>
                </li>
              ))}
            </ol>

            {isCustom && (
              <div className="mt-4 p-4 bg-brand-lavender-light/5 rounded-lg mb-6">
                <p className="text-sm text-brand-text-secondary mb-2">
                  <strong>Integration tip:</strong> For{" "}
                  {websiteData?.customType || "custom"} websites, add the
                  Voicero script before the closing &lt;/body&gt; tag:
                </p>
                <div className="max-h-40 overflow-y-auto">
                  <pre className="mt-2 p-3 bg-gray-800 text-gray-100 rounded-lg text-xs overflow-x-auto">
                    {`<script>
  (function(v,o,i,c,e,r,o){v.VoiceroAI=v.VoiceroAI||{};
  if(v.VoiceroAI.q)return;v.VoiceroAI.q=[];
  var a=['init'];
  for(var i=0;i<a.length;i++){!function(e){
  v.VoiceroAI[e]=function(){v.VoiceroAI.q.push([e,arguments])}}(a[i])}
  var t=document.createElement('script');
  t.src='https://cdn.voicero.ai/loader.js';
  t.async=!0;document.head.appendChild(t);
  VoiceroAI.init('${websiteData?.accessKey || "YOUR_ACCESS_KEY"}');
  })();
</script>`}
                  </pre>
                </div>
              </div>
            )}

            <div className="p-4 bg-brand-lavender-light/5 rounded-lg mb-6">
              <p className="text-sm text-brand-text-secondary mb-2">
                Your Access Key:
              </p>
              <code className="block p-2 bg-gray-100 rounded text-sm font-mono break-all text-black">
                {websiteData?.accessKey || "Loading..."}
              </code>
            </div>
          </div>

          <div className="p-6 border-t border-gray-100 space-y-4">
            {!isCustom ? (
              <a
                href={
                  isWordPress && "pluginUrl" in instructions
                    ? instructions.pluginUrl
                    : isShopify && "appUrl" in instructions
                    ? instructions.appUrl
                    : "#"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-4 py-2 bg-brand-accent text-white 
                         rounded-lg text-center hover:bg-brand-accent/90 
                         transition-colors"
              >
                {isWordPress
                  ? "Download Plugin"
                  : isShopify
                  ? "Install App"
                  : "Read Documentation"}
              </a>
            ) : (
              <Link
                href={customInstructions.docsUrl}
                className="block w-full px-4 py-2 bg-brand-accent text-white 
                         rounded-lg text-center hover:bg-brand-accent/90 
                         transition-colors"
              >
                View {websiteData?.customType || "Custom"} Documentation
              </Link>
            )}

            <button
              onClick={() => setShowSetupModal(false)}
              className="block w-full px-4 py-2 border border-brand-accent/20 
                       text-brand-accent rounded-lg text-center 
                       hover:bg-brand-accent/5 transition-colors"
            >
              I&apos;ll do this later
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Empty subscription modal component (removed)
  const SubscriptionModal = () => {
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <SetupModal />
      <SubscriptionModal />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-brand-text-primary">
              {name}
            </h1>
            <span
              className={`px-3 py-1 text-sm font-medium rounded-full ${
                websiteData.active
                  ? "bg-green-50 text-green-600"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {websiteData.active ? "Active" : "Inactive"}
            </span>
            <a
              href={`${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-brand-text-secondary hover:text-brand-accent 
                         transition-colors rounded-lg hover:bg-brand-lavender-light/5"
            >
              <FaExternalLinkAlt className="w-4 h-4" />
            </a>
          </div>
          <p className="text-brand-text-secondary">
            {domain} •{" "}
            {type === "Custom" && customType ? `${type} (${customType})` : type}
          </p>
        </div>
        <div className="flex gap-4 relative">
          <motion.button
            whileHover={{ scale: !websiteData.lastSync ? 1 : 1.02 }}
            whileTap={{ scale: !websiteData.lastSync ? 1 : 0.98 }}
            onClick={handleToggleStatus}
            disabled={isToggling || !websiteData.lastSync}
            title={
              !websiteData.lastSync
                ? "Please sync your content before activating"
                : ""
            }
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
              websiteData.active
                ? "bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20"
                : "bg-brand-lavender-dark text-white hover:bg-brand-lavender-dark/90"
            } ${
              isToggling || !websiteData.lastSync
                ? "opacity-50 cursor-not-allowed"
                : ""
            }`}
          >
            <FaPowerOff
              className={`w-4 h-4 ${isToggling ? "animate-spin" : ""}`}
            />
            {isToggling
              ? "Updating..."
              : websiteData.active
              ? "Deactivate"
              : "Activate"}
          </motion.button>

          {/* Add Sync Content button for Custom type websites */}
          {type === "Custom" && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSync}
              disabled={isSyncing}
              className="px-4 py-2 bg-brand-accent text-white rounded-xl flex items-center gap-2 transition-colors hover:bg-brand-accent/90 disabled:opacity-50"
            >
              <FaSync
                className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
              />
              {isSyncing ? "Syncing..." : "Sync Content"}
            </motion.button>
          )}
          {/* Actions dropdown */}
          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsActionsOpen((v) => !v)}
              className="px-3 py-2 border border-brand-accent/20 rounded-xl hover:bg-brand-accent/5 transition-colors text-brand-text-primary flex items-center gap-2"
              title="Actions"
            >
              <FaEllipsisV className="w-4 h-4" />
              Actions
            </motion.button>
            {isActionsOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-brand-lavender-light/30 rounded-lg shadow-xl z-50 py-2 text-brand-text-primary">
                <button
                  onClick={() => {
                    console.log("doing ai-overview", {
                      websiteId: websiteData.id,
                    });
                    setIsActionsOpen(false);
                    const url = `/app/websites/website/ai-overview?id=${websiteData.id}`;
                    window.open(url, "_blank");
                    console.log("done ai-overview", {
                      websiteId: websiteData.id,
                    });
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-brand-lavender-light/10 flex items-center gap-2 text-brand-text-primary"
                >
                  <FaChartLine className="w-4 h-4" /> AI Overview
                </button>
                <button
                  onClick={() => {
                    console.log("doing sync", { websiteId: websiteData.id });
                    setIsActionsOpen(false);
                    handleSync();
                    console.log("done sync", { websiteId: websiteData.id });
                  }}
                  disabled={isSyncing}
                  className="w-full px-3 py-2 text-left hover:bg-brand-lavender-light/10 flex items-center gap-2 disabled:opacity-50 text-brand-text-primary"
                >
                  <FaSync className="w-4 h-4" /> Sync Content
                </button>
                {/* Plan management removed */}
                <button
                  onClick={() => {
                    console.log("doing interface", {
                      websiteId: websiteData.id,
                    });
                    setIsActionsOpen(false);
                    const url = `/app/websites/website/interface?id=${websiteData.id}`;
                    window.open(url, "_blank");
                    console.log("done interface", {
                      websiteId: websiteData.id,
                    });
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-brand-lavender-light/10 flex items-center gap-2 text-brand-text-primary"
                >
                  <FaRobot className="w-4 h-4" /> Edit Interface
                </button>
                <button
                  onClick={() => {
                    console.log("doing settings", {
                      websiteId: websiteData.id,
                    });
                    setIsActionsOpen(false);
                    const url = `/app/websites/website/settings?id=${websiteData.id}`;
                    window.open(url, "_blank");
                    console.log("done settings", {
                      websiteId: websiteData.id,
                    });
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-brand-lavender-light/10 flex items-center gap-2 text-brand-text-primary"
                >
                  <FaCog className="w-4 h-4" /> Settings
                </button>
                <button
                  onClick={() => {
                    console.log("doing news", {
                      websiteId: websiteData.id,
                    });
                    setIsActionsOpen(false);
                    const url = `/app/websites/website/news?id=${websiteData.id}`;
                    window.open(url, "_blank");
                    console.log("done news", {
                      websiteId: websiteData.id,
                    });
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-brand-lavender-light/10 flex items-center gap-2 text-brand-text-primary"
                >
                  <FaNewspaper className="w-4 h-4" /> Edit News Section
                </button>
                <button
                  onClick={() => {
                    console.log("doing help", {
                      websiteId: websiteData.id,
                    });
                    setIsActionsOpen(false);
                    const url = `/app/websites/website/help?id=${websiteData.id}`;
                    window.open(url, "_blank");
                    console.log("done help", {
                      websiteId: websiteData.id,
                    });
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-brand-lavender-light/10 flex items-center gap-2 text-brand-text-primary"
                >
                  <FaQuestionCircle className="w-4 h-4" /> Edit Help Section
                </button>
              </div>
            )}
          </div>
          {/* Plan error removed */}
        </div>
      </div>

      {/* Usage */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
        <h2 className="text-xl font-semibold text-brand-text-primary mb-4">
          Usage
        </h2>
        <div className="bg-brand-lavender-light/5 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-brand-text-secondary">
              Monthly Queries
            </span>
            <span className="text-sm font-medium text-brand-text-primary">
              {monthlyQueries.toLocaleString()} / {queryLimit.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-brand-lavender-light/20 rounded-full h-2">
            <div
              className="bg-brand-accent h-2 rounded-full transition-all"
              style={{
                width: `${(monthlyQueries / queryLimit) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* AI Features Section */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
        <h2 className="text-xl font-semibold text-brand-text-primary mb-4">
          AI Features
        </h2>
        {/* Debug info */}

        <div className="space-y-4">
          {/* Voice AI Feature */}
          <div className="flex items-center justify-between p-4 bg-brand-lavender-light/5 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-accent rounded-lg flex items-center justify-center">
                {SVG_ICONS.microphone}
              </div>
              <div>
                <h3 className="font-medium text-brand-text-primary">
                  Voice AI
                </h3>
                <p className="text-sm text-brand-text-secondary">
                  Enable voice-based AI interactions on your website
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleVoiceAI}
              disabled={isTogglingAI}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                showVoiceAI
                  ? "bg-brand-accent text-white hover:bg-brand-accent/90"
                  : "bg-brand-lavender-light/20 text-brand-text-primary hover:bg-brand-lavender-light/30"
              } disabled:opacity-50`}
            >
              {isTogglingAI ? (
                <FaSync className="inline-block mr-2 animate-spin" />
              ) : (
                <FaPowerOff className="inline-block mr-2" />
              )}
              {showVoiceAI ? "Live" : "Off"}
            </button>
          </div>

          {/* Text AI Feature */}
          <div className="flex items-center justify-between p-4 bg-brand-lavender-light/5 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-accent rounded-lg flex items-center justify-center  ">
                {SVG_ICONS.message}
              </div>
              <div>
                <h3 className="font-medium text-brand-text-primary">Text AI</h3>
                <p className="text-sm text-brand-text-secondary">
                  Enable text-based AI chat on your website
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleTextAI}
              disabled={isTogglingAI}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                showTextAI
                  ? "bg-brand-accent text-white hover:bg-brand-accent/90"
                  : "bg-brand-lavender-light/20 text-brand-text-primary hover:bg-brand-lavender-light/30"
              } disabled:opacity-50`}
            >
              {isTogglingAI ? (
                <FaSync className="inline-block mr-2 animate-spin" />
              ) : (
                <FaPowerOff className="inline-block mr-2" />
              )}
              {showTextAI ? "Live" : "Off"}
            </button>
          </div>
        </div>
      </div>

      {/* AI Insights Section */}
      {websiteData?.aiOverview && (
        <div
          id="ai-overview"
          className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-brand-text-primary">
              AI Insights & Performance {websiteData.aiOverview.period_label}
            </h2>
            <button
              onClick={refreshAIData}
              disabled={isRefreshingAI}
              className="px-3 py-1 text-sm bg-brand-accent text-white rounded-lg 
                        hover:bg-brand-accent/90 transition-colors disabled:opacity-50"
            >
              {isRefreshingAI ? (
                <>
                  <FaSync className="inline-block mr-2 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <FaSync className="inline-block mr-2" />
                  Refresh AI Data
                </>
              )}
            </button>
          </div>

          {/* AI Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-brand-accent">
                {websiteData.aiOverview.total_message_threads}
              </div>
              <div className="text-sm text-brand-text-secondary">
                Total Threads
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {Number(
                  websiteData.aiOverview.problem_resolution_rate.percent || 0
                ).toFixed(2)}
                %
              </div>
              <div className="text-sm text-brand-text-secondary">
                Resolution Rate
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-brand-text-primary">
                {Number(
                  websiteData.aiOverview.avg_messages_per_thread || 0
                ).toFixed(2)}
              </div>
              <div className="text-sm text-brand-text-secondary">
                Avg Messages/Thread
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">
                ${websiteData.aiOverviewRevenue?.amount || 0}
              </div>
              <div className="text-sm text-brand-text-secondary">
                Revenue Added to Cart
              </div>
            </div>
          </div>

          {/* Most Common Questions */}
          {websiteData.aiOverview.most_common_questions && (
            <div className="mb-8">
              <h3 className="text-lg font-medium text-brand-text-primary mb-4">
                Most Common Questions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {websiteData.aiOverview.most_common_questions.map(
                  (category, index) => (
                    <div
                      key={index}
                      className="p-4 bg-brand-lavender-light/5 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-brand-text-primary">
                          {category.category}
                        </h4>
                        <span className="text-sm text-brand-accent font-medium">
                          {category.threads} threads
                        </span>
                      </div>
                      <p className="text-sm text-brand-text-secondary">
                        {category.description}
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Recent Questions by Topic */}
          {websiteData.aiOverview.recent_questions_by_topic && (
            <div className="mb-8">
              <h3 className="text-lg font-medium text-brand-text-primary mb-4">
                Recent Questions by Topic
              </h3>
              <div className="space-y-4">
                {websiteData.aiOverview.recent_questions_by_topic.map(
                  (topic, index) => (
                    <div
                      key={index}
                      className="border border-brand-lavender-light/20 rounded-lg p-4"
                    >
                      <h4 className="font-medium text-brand-text-primary mb-3">
                        {topic.topic}
                      </h4>
                      <div className="space-y-3">
                        {topic.items.map((item, itemIndex) => (
                          <div
                            key={itemIndex}
                            className="flex items-start justify-between p-3 bg-brand-lavender-light/5 rounded-lg"
                          >
                            <div className="flex-1">
                              <p className="text-sm text-brand-text-primary mb-1">
                                {item.question}
                              </p>
                              <p className="text-xs text-brand-text-secondary">
                                {item.note}
                              </p>
                            </div>
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${
                                item.status === "Resolved"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Action Details */}
          {websiteData.actionDetails && (
            <div>
              <h3 className="text-lg font-medium text-brand-text-primary mb-4">
                AI Action Breakdown
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setSelectedAction("cart")}
                  className="text-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <div className="text-2xl font-bold text-blue-600">
                    {websiteData.actionDetails?.cart?.length || 0}
                  </div>
                  <div className="text-sm text-brand-text-secondary">
                    Cart Actions
                  </div>
                </button>
                <button
                  onClick={() => setSelectedAction("movement")}
                  className="text-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <div className="text-2xl font-bold text-green-600">
                    {websiteData.actionDetails?.movement?.length || 0}
                  </div>
                  <div className="text-sm text-brand-text-secondary">
                    Movement Actions
                  </div>
                </button>
                <button
                  onClick={() => setSelectedAction("orders")}
                  className="text-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  <div className="text-2xl font-bold text-purple-600">
                    {websiteData.actionDetails?.orders?.length || 0}
                  </div>
                  <div className="text-sm text-brand-text-secondary">
                    Order Actions
                  </div>
                </button>
              </div>

              {selectedAction &&
                websiteData.actionConversations?.[selectedAction] && (
                  <div className="mt-6 border border-brand-lavender-light/20 rounded-lg">
                    <div className="flex items-center justify-between p-4 border-b border-brand-lavender-light/20">
                      <h4 className="font-medium text-brand-text-primary capitalize">
                        {selectedAction} conversations
                      </h4>
                      <button
                        onClick={() => setSelectedAction(null)}
                        className="text-sm text-brand-text-secondary hover:text-brand-accent"
                      >
                        Close
                      </button>
                    </div>
                    <div className="divide-y divide-brand-lavender-light/20">
                      {websiteData.actionConversations[selectedAction]
                        .length === 0 && (
                        <div className="p-4 text-sm text-brand-text-secondary">
                          No conversations
                        </div>
                      )}
                      {websiteData.actionConversations[selectedAction].map(
                        (conv, idx) => {
                          const threadId = conv.thread?.id || `thread-${idx}`;
                          const actionCount = conv.actions?.length || 0;
                          const lastActionAt =
                            conv.actions?.[conv.actions.length - 1]?.createdAt;
                          return (
                            <div key={threadId} className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm text-brand-text-secondary">
                                    Thread
                                  </div>
                                  <div className="font-mono text-xs text-black break-all">
                                    {threadId}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs px-2 py-1 rounded-full bg-brand-lavender-light/10 text-brand-text-secondary">
                                    {actionCount} action
                                    {actionCount === 1 ? "" : "s"}
                                  </span>
                                  {lastActionAt && (
                                    <span className="text-xs text-brand-text-secondary">
                                      Last:{" "}
                                      {new Date(lastActionAt).toLocaleString()}
                                    </span>
                                  )}
                                  <button
                                    onClick={() =>
                                      toggleThreadExpanded(threadId)
                                    }
                                    className="text-sm text-brand-accent hover:text-brand-accent/80"
                                  >
                                    {expandedThreads[threadId]
                                      ? "Hide"
                                      : "View"}
                                  </button>
                                </div>
                              </div>

                              {expandedThreads[threadId] && (
                                <div className="mt-4 space-y-3">
                                  {/* Actions summary */}
                                  {conv.actions && conv.actions.length > 0 && (
                                    <div className="text-xs text-brand-text-secondary">
                                      {conv.actions.map((a, i) => (
                                        <div
                                          key={`${a.messageId}-${i}`}
                                          className="mb-1"
                                        >
                                          <span className="font-medium capitalize mr-1">
                                            {selectedAction}:
                                          </span>
                                          {selectedAction === "cart" && (
                                            <span className="text-black">
                                              {a.actionType || "(cart action)"}
                                            </span>
                                          )}
                                          {selectedAction === "movement" && (
                                            <span className="text-black">
                                              {a.actionType === "scroll" &&
                                                (a.scrollToText ||
                                                  a.sectionId ||
                                                  "(scroll)")}
                                              {a.actionType === "redirect" &&
                                                (a.url || "(redirect)")}
                                              {a.actionType === "click" &&
                                                (a.buttonText ||
                                                  a.url ||
                                                  "(click)")}
                                              {a.actionType &&
                                                ![
                                                  "scroll",
                                                  "redirect",
                                                  "click",
                                                ].includes(a.actionType) &&
                                                a.actionType}
                                            </span>
                                          )}
                                          {selectedAction === "orders" && (
                                            <span className="text-black">
                                              {a.actionType || "(order action)"}
                                            </span>
                                          )}
                                          {a.createdAt && (
                                            <span className="ml-2">
                                              @{" "}
                                              {new Date(
                                                a.createdAt
                                              ).toLocaleString()}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Conversation */}
                                  <div className="space-y-2">
                                    {conv.thread?.messages?.map((m) => {
                                      const isActionMessage =
                                        conv.actions?.some(
                                          (a) => a.messageId === m.id
                                        );
                                      return (
                                        <div
                                          key={m.id}
                                          className={`p-3 rounded-lg border ${
                                            m.role === "user"
                                              ? "bg-brand-lavender-light/5 border-brand-lavender-light/30"
                                              : "bg-white border-brand-lavender-light/30"
                                          }`}
                                        >
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs uppercase tracking-wide text-brand-text-secondary">
                                              {m.role}
                                            </span>
                                            <span className="text-[11px] text-brand-text-secondary">
                                              {new Date(
                                                m.createdAt
                                              ).toLocaleString()}
                                            </span>
                                          </div>
                                          <div className="text-sm text-black whitespace-pre-wrap break-words">
                                            {m.role === "assistant"
                                              ? (() => {
                                                  const { answer, action } =
                                                    parseAssistantMessage(
                                                      (m as any).content
                                                    );
                                                  if (answer || action) {
                                                    return (
                                                      <>
                                                        {answer && (
                                                          <div>{answer}</div>
                                                        )}
                                                        {action && (
                                                          <div className="mt-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
                                                            action: {action}
                                                          </div>
                                                        )}
                                                      </>
                                                    );
                                                  }
                                                  return (m as any).content;
                                                })()
                                              : (m as any).content}
                                          </div>
                                          {isActionMessage && (
                                            <div className="mt-2 text-[11px] px-2 py-1 inline-block rounded-full bg-brand-accent/10 text-brand-accent">
                                              Triggers {selectedAction}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {/* Content Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 overflow-hidden">
        <div className="border-b border-brand-lavender-light/20">
          <div className="flex">
            <button
              onClick={() => setActiveTab("products")}
              className={`px-6 py-4 text-sm font-medium transition-colors relative
                ${
                  activeTab === "products"
                    ? "text-brand-accent"
                    : "text-brand-text-secondary"
                }
                ${type.toLowerCase() === "custom" ? "hidden" : ""}`}
            >
              <FaShoppingBag className="inline-block mr-2" />
              Products
              {activeTab === "products" && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent"
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab("posts")}
              className={`px-6 py-4 text-sm font-medium transition-colors relative
                ${
                  activeTab === "posts"
                    ? "text-brand-accent"
                    : "text-brand-text-secondary"
                }
                ${type.toLowerCase() === "custom" ? "hidden" : ""}`}
            >
              <FaNewspaper className="inline-block mr-2" />
              Blog Posts
              {activeTab === "posts" && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent"
                />
              )}
            </button>
            {type.toLowerCase() === "shopify" && (
              <>
                <button
                  onClick={() => setActiveTab("collections")}
                  className={`px-6 py-4 text-sm font-medium transition-colors relative
                    ${
                      activeTab === "collections"
                        ? "text-brand-accent"
                        : "text-brand-text-secondary"
                    }`}
                >
                  <FaLayerGroup className="inline-block mr-2" />
                  Collections
                  {activeTab === "collections" && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent"
                    />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("discounts")}
                  className={`px-6 py-4 text-sm font-medium transition-colors relative
                    ${
                      activeTab === "discounts"
                        ? "text-brand-accent"
                        : "text-brand-text-secondary"
                    }`}
                >
                  <FaPercent className="inline-block mr-2" />
                  Discounts
                  {activeTab === "discounts" && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent"
                    />
                  )}
                </button>
              </>
            )}
            <button
              onClick={() => setActiveTab("pages")}
              className={`px-6 py-4 text-sm font-medium transition-colors relative
                ${
                  activeTab === "pages"
                    ? "text-brand-accent"
                    : "text-brand-text-secondary"
                }`}
            >
              <FaFile className="inline-block mr-2" />
              Pages
              {activeTab === "pages" && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent"
                />
              )}
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === "products" && type.toLowerCase() !== "custom" && (
            <ContentList
              items={products.map((product) => ({
                ...product,
                type: product.type || "product", // Ensure type is set for products
              }))}
            />
          )}
          {activeTab === "posts" && type.toLowerCase() !== "custom" && (
            <ContentList
              items={blogPosts.map((post) => ({
                ...post,
                type: post.type || "post", // Ensure type is set for posts
              }))}
            />
          )}
          {activeTab === "pages" && (
            <ContentList
              items={pages.map((page) => ({
                ...page,
                type: page.type || "page", // Ensure type is set for pages
              }))}
            />
          )}
          {activeTab === "collections" && type.toLowerCase() === "shopify" && (
            <ContentList
              items={
                content.collections?.map((collection) => ({
                  id: collection.id,
                  title: collection.title || "",
                  url: `/collections/${collection.handle}`,
                  type: "collection" as const,
                  lastUpdated:
                    collection.updatedAt ||
                    collection.createdAt ||
                    new Date().toISOString(),
                  aiRedirects: collection.aiRedirects,
                  description: collection.description,
                  handle: collection.handle,
                  image: collection.image?.url || collection.image || null,
                  ruleSet: collection.ruleSet,
                  sortOrder: collection.sortOrder,
                  productsCount: collection.products?.length || 0,
                })) || []
              }
            />
          )}
          {activeTab === "discounts" && type.toLowerCase() === "shopify" && (
            <ContentList
              items={discounts.map((discount: any) => ({
                ...discount,
                type: "discount" as const, // Use a fixed string instead of discount.type which might be something else
                discountType: discount.type, // Preserve the original discount type in a different field
              }))}
            />
          )}
        </div>
      </div>

      {/* Plan Management Modal removed */}
    </div>
  );
}
