"use client";

import React, { useEffect, useState } from "react";
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
} from "react-icons/fa";
import { useRouter, useSearchParams } from "next/navigation";
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
  type: "product" | "post" | "page" | "collection";
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

// Data shape from the new API route
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
  };
  content: {
    products: ContentItem[];
    blogPosts: ContentItem[];
    pages: ContentItem[];
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

// Add this helper function at the top of the file
function countWords(str: string): number {
  return str.trim().split(/\s+/).length;
}

export default function WebsiteSettings() {
  const searchParams = useSearchParams()!;
  const websiteId = searchParams.get("id");

  const [websiteData, setWebsiteData] = useState<WebsiteData | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<
    "products" | "posts" | "pages" | "collections"
  >("products");

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // Add this state to track the toggle operation
  const [isToggling, setIsToggling] = useState(false);

  // Add this state for syncing status
  const [isSyncingInstructions, setIsSyncingInstructions] = useState(false);

  const [isSavingColor, setIsSavingColor] = useState(false);
  const [colorSaveError, setColorSaveError] = useState<string | null>(null);

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");

  // Add this state for UI settings
  const [isSavingUiSettings, setIsSavingUiSettings] = useState(false);
  const [uiSettingsError, setUiSettingsError] = useState<string | null>(null);

  // Add this state after the existing state declarations
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    "appearance" | "behavior" | "questions" | "features"
  >("appearance");

  // Add this state for saving auto features
  const [isSavingAutoFeatures, setIsSavingAutoFeatures] = useState(false);
  const [autoFeaturesError, setAutoFeaturesError] = useState<string | null>(
    null
  );
  const [showFeatureWarning, setShowFeatureWarning] = useState(false);
  const [pendingFeatureChanges, setPendingFeatureChanges] = useState<any>(null);

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

  const router = useRouter();

  // 1) Fetch the data from our new route: /api/website/get?id=<websiteId>
  useEffect(() => {
    if (!websiteId) return;
    setIsLoading(true);

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/websites/get?id=${websiteId}`, {
          method: "GET",
        });
        if (!res.ok) {
          console.error("Failed to fetch website data:", res.status);

          // If unauthorized (403) or not found (404), redirect to websites list
          if (res.status === 403 || res.status === 404) {
            router.push("/app/websites");
            return;
          }
          return;
        }
        const data = await res.json();
        console.log("Website data loaded:", {
          iconBot: data.iconBot,
          iconVoice: data.iconVoice,
          iconMessage: data.iconMessage,
          clickMessage: data.clickMessage,
        });

        // Ensure default values for icon fields
        if (!data.iconBot || data.iconBot === "MessageIcon")
          data.iconBot = "bot";
        if (!data.iconVoice || data.iconVoice === "VoiceIcon")
          data.iconVoice = "microphone";
        if (!data.iconMessage || data.iconMessage === "MessageIcon")
          data.iconMessage = "message";

        setWebsiteData(data);
      } catch (error) {
        console.error("Error fetching website data:", error);
        // On any error, also redirect to websites list
        router.push("/app/websites");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [websiteId, router]);

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

  // Add a useEffect to refresh data when returning from Stripe with upgraded=true parameter
  useEffect(() => {
    const upgraded = searchParams.get("upgraded");
    const canceled = searchParams.get("upgrade_canceled");

    if (websiteId && upgraded === "true") {
      // Refresh the website data after plan upgrade
      const refreshData = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`/api/websites/get?id=${websiteId}`, {
            method: "GET",
            headers: {
              "Cache-Control": "no-cache",
            },
          });
          if (res.ok) {
            const data = await res.json();
            setWebsiteData(data);
            // Close the plan modal if it was open
            setShowPlanModal(false);
            // Show success message
            alert("Plan upgraded successfully!");
          }
        } catch (error) {
          console.error("Error refreshing website data:", error);
        } finally {
          setIsLoading(false);
        }
      };

      refreshData();
    } else if (canceled === "true") {
      // Handle canceled upgrade if needed
      setShowPlanModal(false);
    }
  }, [searchParams, websiteId]);

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
        // For custom websites, redirect to the syncContent page
        router.push(`/app/websites/syncContent?id=${websiteData.id}`);
      }
    } catch (error) {
      console.error("Error during sync:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Add subscription management functions
  const handleManageSubscription = async () => {
    if (!websiteData) return;

    // ALWAYS show the plan modal for Enterprise and Starter plans
    // regardless of whether it's Shopify or not
    if (websiteData.plan === "Enterprise" || websiteData.plan === "Starter") {
      setShowPlanModal(true);
      return;
    }

    // If no plan, show subscription modal
    if (!websiteData.plan) {
      setShowSubscriptionModal(true);
    }
  };

  // Add a separate function for Shopify users to access Shopify admin if needed
  const handleShopifyPricingRedirect = () => {
    if (!websiteData) return;

    const storeName = websiteData.domain
      .replace(/^https?:\/\//, "") // Remove http:// or https://
      .split(".")[0]; // Get the first part of the domain

    // Redirect to Shopify admin pricing page
    const shopifyPricingUrl = `https://admin.shopify.com/store/${storeName}/apps/voicero-app-shop/app/pricing`;
    window.open(shopifyPricingUrl, "_blank");
  };

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
    } catch (error) {
      console.error("Error toggling status:", error);
    } finally {
      setIsToggling(false);
    }
  };

  // Add this function to handle syncing instructions with OpenAI assistants
  const handleSyncInstructions = async () => {
    if (!websiteData) return;

    setIsSyncingInstructions(true);
    try {
      const response = await fetch("/api/websites/sync-instructions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          websiteId: websiteData.id,
          instructions: websiteData.customInstructions,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to sync instructions");
      }

      // Show success toast or message
    } catch (error) {
      console.error("Error syncing instructions:", error);
      // Show error toast or message
    } finally {
      setIsSyncingInstructions(false);
    }
  };

  // Update the handleColorChange function
  const handleColorChange = async (newColor: string) => {
    if (!websiteData) return;

    setIsSavingColor(true);
    setColorSaveError(null);

    try {
      // Optimistically update the UI
      setWebsiteData({
        ...websiteData,
        color: newColor,
      } as WebsiteData);

      const response = await fetch("/api/websites/update-color", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          websiteId: websiteData.id,
          color: newColor,
        }),
      });

      if (!response.ok) {
        // Revert on error
        setWebsiteData({
          ...websiteData,
          color: websiteData.color,
        } as WebsiteData);
        throw new Error("Failed to update color");
      }
    } catch (error) {
      console.error("Error updating color:", error);
      setColorSaveError("Failed to save color");
    } finally {
      setIsSavingColor(false);
      // Clear error after 3 seconds if there was one
      if (colorSaveError) {
        setTimeout(() => setColorSaveError(null), 3000);
      }
    }
  };

  const handlePlanChange = async () => {
    if (!websiteData) return;
    setIsPlanLoading(true);
    setPlanError("");
    try {
      const response = await fetch("/api/stripe/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId: websiteData.id,
          websiteData: { ...websiteData, plan: "Starter" },
          successUrl: `${window.location.origin}/app/websites/website?id=${websiteData.id}&upgraded=true`,
          cancelUrl: `${window.location.origin}/app/websites/website?id=${websiteData.id}&upgrade_canceled=true`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to change plan");
      if (data.url) {
        window.location.href = data.url; // Stripe checkout
      } else if (data.success) {
        window.location.href = `${window.location.origin}/app/websites/website?id=${websiteData.id}&upgraded=true`;
      }
    } catch (err) {
      setPlanError(
        err instanceof Error ? err.message : "Failed to change plan"
      );
    } finally {
      setIsPlanLoading(false);
    }
  };

  // Update the handleCancelPlan function to work with all website types
  const handleCancelPlan = async () => {
    if (!websiteData) return;
    setIsPlanLoading(true);
    setPlanError("");
    try {
      const response = await fetch("/api/stripe/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteId: websiteData.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to cancel plan");

      // Update local state
      setWebsiteData({ ...websiteData, plan: "", stripeId: undefined });
      setShowPlanModal(false);

      // Show success message or toast
    } catch (err) {
      setPlanError(
        err instanceof Error ? err.message : "Failed to cancel plan"
      );
    } finally {
      setIsPlanLoading(false);
    }
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
  const { products, blogPosts, pages } = content;

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

    return (
      <div className="space-y-4">
        {items.map((item) => (
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
              <a
                href={`${domain}${item.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-brand-text-secondary hover:text-brand-accent 
                           transition-colors rounded-lg hover:bg-brand-lavender-light/5"
              >
                <FaExternalLinkAlt className="w-4 h-4" />
              </a>
            </div>

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
                {expandedItems.includes(item.id) ? "Show less" : "Read more..."}
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
                          <span className="font-medium">{review.reviewer}</span>
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
                          <span className="font-medium">{comment.author}</span>
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
        ))}
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

  // Subscription Modal Component
  const SubscriptionModal = () => {
    const [isLoading, setIsLoading] = useState(false);

    const handleUpgrade = async () => {
      if (!websiteData) return;

      setIsLoading(true);
      try {
        const response = await fetch("/api/stripe/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            websiteId: websiteData.id,
            plan: "Pro",
            successUrl: `${window.location.origin}/app/websites/new/complete?session_id={CHECKOUT_SESSION_ID}&id=${websiteData.id}`,
            cancelUrl: `${window.location.origin}/app/websites/website?id=${websiteData.id}&canceled=true`,
          }),
        });

        if (!response.ok) throw new Error("Failed to create checkout session");

        const { url } = await response.json();
        window.location.href = url;
      } catch (error) {
        console.error("Error upgrading plan:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (!showSubscriptionModal) return null;

    // Don't show upgrade modal for Pro users
    if (websiteData?.plan === "Pro") return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-brand-text-primary">
              Upgrade to Pro
            </h2>
            <button
              onClick={() => setShowSubscriptionModal(false)}
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

          <div className="mb-6">
            <p className="text-brand-text-secondary mb-4">
              Upgrade to Pro to unlock:
            </p>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-brand-text-secondary">
                <FaCheck className="w-4 h-4 text-green-500" />
                <span>50,000 monthly queries</span>
              </li>
              <li className="flex items-center gap-2 text-brand-text-secondary">
                <FaCheck className="w-4 h-4 text-green-500" />
                <span>Priority support</span>
              </li>
              <li className="flex items-center gap-2 text-brand-text-secondary">
                <FaCheck className="w-4 h-4 text-green-500" />
                <span>Advanced analytics</span>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleUpgrade}
              disabled={isLoading}
              className="block w-full px-4 py-2 bg-brand-accent text-white 
                       rounded-lg text-center hover:bg-brand-accent/90 
                       transition-colors disabled:opacity-50"
            >
              {isLoading ? "Processing..." : "Upgrade Now - $40/month"}
            </button>
            <button
              onClick={() => setShowSubscriptionModal(false)}
              className="block w-full px-4 py-2 border border-brand-accent/20 
                       text-brand-accent rounded-lg text-center 
                       hover:bg-brand-accent/5 transition-colors"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Add this function to handle updating the clickMessage field
  const handleSaveUiSettings = async () => {
    if (!websiteData) return;

    setIsSavingUiSettings(true);
    setUiSettingsError(null);

    // Define valid icon values
    const validBotIcons = ["bot", "voice", "message"];
    const validVoiceIcons = ["microphone", "waveform", "speaker"];
    const validMessageIcons = ["message", "document", "cursor"];

    // Ensure we have valid icons
    const iconBot = validBotIcons.includes(websiteData.iconBot)
      ? websiteData.iconBot
      : "bot";
    const iconVoice = validVoiceIcons.includes(websiteData.iconVoice)
      ? websiteData.iconVoice
      : "microphone";
    const iconMessage = validMessageIcons.includes(websiteData.iconMessage)
      ? websiteData.iconMessage
      : "message";

    console.log("Current clickMessage value:", websiteData.clickMessage);

    try {
      console.log("Sending data:", {
        websiteId: websiteData.id,
        botName: websiteData.botName,
        customWelcomeMessage: websiteData.customWelcomeMessage,
        iconBot,
        iconVoice,
        iconMessage,
        clickMessage: websiteData.clickMessage,
      });

      const response = await fetch("/api/websites/update-ui-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          websiteId: websiteData.id,
          botName: websiteData.botName,
          customWelcomeMessage: websiteData.customWelcomeMessage,
          iconBot,
          iconVoice,
          iconMessage,
          clickMessage: websiteData.clickMessage,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error("API error response:", data);
        throw new Error(data.error || "Failed to update UI settings");
      }

      const responseData = await response.json();
      console.log("API success response:", responseData);

      // Update the local state with the response data
      setWebsiteData({
        ...websiteData,
        botName: responseData.website.botName,
        customWelcomeMessage: responseData.website.customWelcomeMessage,
        iconBot: responseData.website.iconBot,
        iconVoice: responseData.website.iconVoice,
        iconMessage: responseData.website.iconMessage,
        clickMessage: responseData.website.clickMessage,
      } as WebsiteData);
    } catch (error) {
      console.error("Error updating UI settings:", error);
      setUiSettingsError("Failed to save UI settings");
    } finally {
      setIsSavingUiSettings(false);
      // Clear error after 3 seconds if there was one
      if (uiSettingsError) {
        setTimeout(() => setUiSettingsError(null), 3000);
      }
    }
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
                plan === ""
                  ? "bg-gray-200 text-gray-500"
                  : status === "active"
                  ? "bg-green-50 text-green-600"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {plan === "" ? "Inactive Plan" : status}
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
            {type === "Custom" && customType ? `${type} (${customType})` : type}{" "}
            • {plan ? `${plan} Plan` : "No Active Plan"}
          </p>
        </div>
        <div className="flex gap-4">
          <motion.button
            whileHover={{ scale: !websiteData.lastSync ? 1 : 1.02 }}
            whileTap={{ scale: !websiteData.lastSync ? 1 : 0.98 }}
            onClick={handleToggleStatus}
            disabled={isToggling || !websiteData.lastSync || plan === ""}
            title={
              !websiteData.lastSync
                ? "Please sync your content before activating"
                : plan === ""
                ? "Please upgrade your plan to activate"
                : ""
            }
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
              status === "active"
                ? "bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20"
                : "bg-brand-lavender-dark text-white hover:bg-brand-lavender-dark/90"
            } ${
              isToggling || !websiteData.lastSync || plan === ""
                ? "opacity-50 cursor-not-allowed"
                : ""
            }`}
          >
            <FaPowerOff
              className={`w-4 h-4 ${isToggling ? "animate-spin" : ""}`}
            />
            {isToggling
              ? "Updating..."
              : status === "active"
              ? "Deactivate"
              : "Activate"}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSync}
            disabled={isSyncing || plan === ""}
            className="px-4 py-2 text-brand-accent border border-brand-accent/20 rounded-xl hover:bg-brand-accent/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FaSync
              className={`inline-block mr-2 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? "Syncing..." : "Sync Content"}
          </motion.button>

          {/* Show "Manage Plan" for all active plans */}
          {(plan === "Starter" || plan === "Enterprise") && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleManageSubscription}
              className="px-4 py-2 bg-brand-accent text-white rounded-xl shadow hover:bg-brand-accent/90 transition-shadow"
            >
              Manage Plan
            </motion.button>
          )}

          {/* For Shopify sites, add a separate button to access Shopify admin */}
          {(plan === "Starter" || plan === "Enterprise") &&
            websiteData.type?.toLowerCase() === "shopify" && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleShopifyPricingRedirect}
                className="px-4 py-2 border border-brand-accent text-brand-accent rounded-xl hover:bg-brand-accent/5 transition-colors"
              >
                Shopify Admin
              </motion.button>
            )}

          {!plan && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowPlanModal(true)}
              className="px-4 py-2 bg-brand-accent text-white rounded-xl shadow hover:bg-brand-accent/90 transition-shadow"
            >
              Upgrade Plan
            </motion.button>
          )}
          {planError && <div className="text-red-500 text-sm">{planError}</div>}
        </div>
      </div>

      {/* Usage */}
      {plan && (
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
                {monthlyQueries.toLocaleString()} /{" "}
                {queryLimit === 0 ? "Unlimited" : queryLimit.toLocaleString()}
              </span>
            </div>
            {/* Only show progress bar if there's a limit */}
            {queryLimit > 0 && (
              <div className="w-full bg-brand-lavender-light/20 rounded-full h-2">
                <div
                  className="bg-brand-accent h-2 rounded-full transition-all"
                  style={{
                    width: `${(monthlyQueries / queryLimit) * 100}%`,
                  }}
                />
              </div>
            )}
            {/* Add Enterprise plan note if on Starter plan */}
            {plan === "Starter" && (
              <div className="mt-4 text-sm text-black">
                <p className="text-black">
                  <strong>Note:</strong> If you exceed{" "}
                  {queryLimit.toLocaleString()} queries, you'll automatically be
                  upgraded to the Enterprise plan at{" "}
                  <strong className="text-brand-accent">$0.10 per query</strong>{" "}
                  with unlimited usage.
                </p>
              </div>
            )}
            {/* Show different note for Enterprise users */}
            {plan === "Enterprise" && (
              <div className="mt-4 text-sm text-black">
                <p className="text-black">
                  <strong>Enterprise Plan:</strong> You have unlimited queries
                  at{" "}
                  <strong className="text-brand-accent">$0.10 per query</strong>{" "}
                  with no monthly limits.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat UI Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-brand-text-primary">
            Chat Interface Settings
          </h2>
        </div>

        {/* Tabs for different settings */}
        <div className="mb-6 border-b border-brand-lavender-light/20">
          <div className="flex flex-wrap">
            <button
              onClick={() => setActiveSettingsTab("appearance")}
              className={`px-4 py-2 text-sm font-medium transition-colors relative
                ${
                  activeSettingsTab === "appearance"
                    ? "text-brand-accent"
                    : "text-brand-text-secondary"
                }`}
            >
              Appearance
              {activeSettingsTab === "appearance" && (
                <motion.div
                  layoutId="activeSettingsTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent"
                />
              )}
            </button>
            <button
              onClick={() => setActiveSettingsTab("behavior")}
              className={`px-4 py-2 text-sm font-medium transition-colors relative
                ${
                  activeSettingsTab === "behavior"
                    ? "text-brand-accent"
                    : "text-brand-text-secondary"
                }`}
            >
              Behavior
              {activeSettingsTab === "behavior" && (
                <motion.div
                  layoutId="activeSettingsTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent"
                />
              )}
            </button>
            <button
              onClick={() => setActiveSettingsTab("questions")}
              className={`px-4 py-2 text-sm font-medium transition-colors relative
                ${
                  activeSettingsTab === "questions"
                    ? "text-brand-accent"
                    : "text-brand-text-secondary"
                }`}
            >
              Pop-up Questions
              {activeSettingsTab === "questions" && (
                <motion.div
                  layoutId="activeSettingsTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent"
                />
              )}
            </button>
            <button
              onClick={() => setActiveSettingsTab("features")}
              className={`px-4 py-2 text-sm font-medium transition-colors relative
                ${
                  activeSettingsTab === "features"
                    ? "text-brand-accent"
                    : "text-brand-text-secondary"
                }`}
            >
              AI Features
              {activeSettingsTab === "features" && (
                <motion.div
                  layoutId="activeSettingsTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent"
                />
              )}
            </button>
          </div>
        </div>

        {/* Appearance Tab */}
        {activeSettingsTab === "appearance" && (
          <>
            {/* Brand Color */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-brand-text-primary">
                  Brand Color
                </h3>
                <button
                  onClick={async () => {
                    if (!websiteData) return;

                    setIsSavingColor(true);
                    setColorSaveError(null);

                    try {
                      const response = await fetch(
                        "/api/websites/update-color",
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            websiteId: websiteData.id,
                            color: websiteData.color,
                          }),
                        }
                      );

                      if (!response.ok) {
                        throw new Error("Failed to update color");
                      }
                    } catch (error) {
                      console.error("Error updating color:", error);
                      setColorSaveError("Failed to save color");
                      // Revert on error
                      setWebsiteData({
                        ...websiteData,
                        color: websiteData.color,
                      } as WebsiteData);
                    } finally {
                      setIsSavingColor(false);
                      // Clear error after 3 seconds if there was one
                      if (colorSaveError) {
                        setTimeout(() => setColorSaveError(null), 3000);
                      }
                    }
                  }}
                  disabled={isSavingColor}
                  className="px-3 py-1 text-sm bg-brand-accent text-white rounded-lg 
                            hover:bg-brand-accent/90 transition-colors disabled:opacity-50"
                >
                  {isSavingColor ? (
                    <>
                      <FaSync className="inline-block mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Color"
                  )}
                </button>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <input
                    type="color"
                    value={websiteData?.color || "#6366F1"}
                    onChange={(e) => {
                      // Optimistically update
                      setWebsiteData({
                        ...websiteData!,
                        color: e.target.value,
                      } as WebsiteData);
                    }}
                    className="w-12 h-12 rounded-lg cursor-pointer"
                    disabled={isSavingColor}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-brand-text-secondary">
                    Choose a color to represent your website. This color will be
                    used throughout the chat interface.
                  </p>
                </div>
              </div>
              {colorSaveError && (
                <p className="text-sm text-red-500 mt-1">{colorSaveError}</p>
              )}
            </div>

            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-brand-text-primary">
                Chat UI Elements
              </h3>
              <button
                onClick={handleSaveUiSettings}
                disabled={isSavingUiSettings}
                className="px-3 py-1 text-sm bg-brand-accent text-white rounded-lg 
                          hover:bg-brand-accent/90 transition-colors disabled:opacity-50"
              >
                {isSavingUiSettings ? (
                  <>
                    <FaSync className="inline-block mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save UI Settings"
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Chatbot Name */}
              <div>
                <label
                  htmlFor="botName"
                  className="block text-sm font-medium text-brand-text-secondary mb-2"
                >
                  Chatbot Name
                </label>
                <input
                  id="botName"
                  type="text"
                  value={websiteData?.botName || "Bot"}
                  onChange={(e) => {
                    // Optimistically update
                    setWebsiteData({
                      ...websiteData!,
                      botName: e.target.value,
                    } as WebsiteData);
                  }}
                  className="w-full p-2 rounded-lg border border-brand-lavender-light/20 
                           focus:outline-none focus:ring-2 focus:ring-brand-accent/20 bg-gray-100 text-black"
                  placeholder="e.g., Assistant, Helper, Guide"
                />
                <p className="text-xs text-brand-text-secondary mt-1">
                  This name will be displayed to users in the chat interface.
                </p>
              </div>

              {/* Welcome Message */}
              <div>
                <label
                  htmlFor="welcomeMessage"
                  className="block text-sm font-medium text-brand-text-secondary mb-2"
                >
                  Welcome Message
                </label>
                <textarea
                  id="welcomeMessage"
                  value={websiteData?.customWelcomeMessage || ""}
                  onChange={(e) => {
                    // Optimistically update
                    setWebsiteData({
                      ...websiteData!,
                      customWelcomeMessage: e.target.value,
                    } as WebsiteData);
                  }}
                  className="w-full h-24 p-2 rounded-lg border border-brand-lavender-light/20 
                           focus:outline-none focus:ring-2 focus:ring-brand-accent/20 bg-gray-100 text-black"
                  placeholder="e.g., Hello! How can I help you today?"
                />
                <p className="text-xs text-brand-text-secondary mt-1">
                  This is the first message users will see when they open the
                  chat.
                </p>
              </div>
            </div>

            {/* Add the Click Message field here */}
            <div className="mb-6">
              <label
                htmlFor="clickMessage"
                className="block text-sm font-medium text-brand-text-secondary mb-2"
              >
                Click Message
              </label>
              <input
                id="clickMessage"
                type="text"
                value={websiteData?.clickMessage || ""}
                onChange={(e) => {
                  // Optimistically update
                  setWebsiteData({
                    ...websiteData!,
                    clickMessage: e.target.value,
                  } as WebsiteData);
                }}
                className="w-full p-2 rounded-lg border border-brand-lavender-light/20 
                         focus:outline-none focus:ring-2 focus:ring-brand-accent/20 bg-gray-100 text-black"
                placeholder="e.g., Need help shopping?"
              />
              <p className="text-xs text-brand-text-secondary mt-1">
                This message will be displayed when the AI suggests clicking on
                elements.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Bot Icon */}
              <div>
                <label className="block text-sm font-medium text-brand-text-secondary mb-2">
                  Bot Icon
                </label>
                <div className="flex flex-wrap gap-3">
                  {["bot", "voice", "message"].map((icon) => (
                    <div
                      key={`bot-${icon}`}
                      onClick={() => {
                        setWebsiteData({
                          ...websiteData!,
                          iconBot: icon,
                        } as WebsiteData);
                      }}
                      className={`p-3 border ${
                        websiteData?.iconBot === icon
                          ? "border-brand-accent bg-brand-accent/10"
                          : "border-gray-200 hover:border-brand-accent/50"
                      } rounded-lg cursor-pointer transition-colors flex items-center justify-center`}
                    >
                      <div
                        className={`text-${
                          websiteData?.iconBot === icon
                            ? "brand-accent"
                            : "gray-600"
                        }`}
                      >
                        {SVG_ICONS[icon as keyof typeof SVG_ICONS] ||
                          SVG_ICONS.bot}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-brand-text-secondary mt-1">
                  This icon represents your chatbot in the UI.
                </p>
              </div>
            </div>

            {uiSettingsError && (
              <div className="mt-3 text-red-500 text-sm">{uiSettingsError}</div>
            )}
          </>
        )}

        {/* Behavior Tab - AI Instructions */}
        {activeSettingsTab === "behavior" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-medium text-brand-text-primary">
                AI Assistant Instructions
              </h3>
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm ${
                    countWords(websiteData?.customInstructions || "") > 300
                      ? "text-red-500"
                      : "text-brand-text-secondary"
                  }`}
                >
                  {countWords(websiteData?.customInstructions || "")} / 300
                  words
                </span>
                <button
                  onClick={async () => {
                    if (!websiteData) return;

                    // Update in database
                    try {
                      const response = await fetch(
                        "/api/websites/update-instructions",
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            websiteId: websiteData?.id,
                            instructions: websiteData?.customInstructions,
                          }),
                        }
                      );

                      if (!response.ok) {
                        const data = await response.json();
                        throw new Error(
                          data.error || "Failed to update instructions"
                        );
                      }
                    } catch (error) {
                      console.error("Error updating instructions:", error);
                      // Revert on error
                      setWebsiteData({
                        ...websiteData!,
                        customInstructions: websiteData?.customInstructions,
                      } as WebsiteData);
                    }
                  }}
                  className="px-3 py-1 text-sm bg-brand-accent text-white rounded-lg 
                          hover:bg-brand-accent/90 transition-colors"
                >
                  Save Instructions
                </button>
                <button
                  onClick={handleSyncInstructions}
                  disabled={isSyncingInstructions}
                  className="px-3 py-1 text-sm bg-brand-accent/20 text-brand-accent rounded-lg 
                          hover:bg-brand-accent/30 transition-colors disabled:opacity-50"
                >
                  {isSyncingInstructions ? (
                    <>
                      <FaSync className="inline-block mr-2 animate-spin" />
                      Syncing with AI...
                    </>
                  ) : (
                    <>
                      <FaSync className="inline-block mr-2" />
                      Sync with AI
                    </>
                  )}
                </button>
              </div>
            </div>
            <textarea
              value={websiteData?.customInstructions || ""}
              onChange={async (e) => {
                // Check word count
                if (countWords(e.target.value) > 300) {
                  return; // Don't update if exceeding limit
                }

                // Optimistically update
                setWebsiteData({
                  ...websiteData!,
                  customInstructions: e.target.value,
                } as WebsiteData);
              }}
              placeholder="Add custom instructions for how the AI assistant should behave when chatting with your customers..."
              className={`w-full h-32 p-3 rounded-lg border 
                       ${
                         countWords(websiteData?.customInstructions || "") > 300
                           ? "border-red-500"
                           : "border-brand-lavender-light/20"
                       }
                       focus:outline-none focus:ring-2 focus:ring-brand-accent/20 bg-gray-100 text-black`}
            />
            <div className="flex items-center justify-between">
              <p className="text-sm text-brand-text-secondary">
                These instructions will guide how the AI assistant interacts
                with your customers.
              </p>
              {countWords(websiteData?.customInstructions || "") > 300 && (
                <p className="text-sm text-red-500">
                  Instructions cannot exceed 300 words
                </p>
              )}
            </div>
          </div>
        )}

        {/* Questions Tab */}
        {activeSettingsTab === "questions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-medium text-brand-text-primary">
                Pop-up Questions
              </h3>
              <span className="text-sm text-brand-text-secondary">
                {websiteData?.popUpQuestions?.length || 0} / 3 questions
              </span>
            </div>
            <p className="text-sm text-brand-text-secondary mb-4">
              These questions will be shown to users in a pop-up when they first
              visit your website.
            </p>

            <div className="space-y-3">
              {websiteData?.popUpQuestions?.map((question, index) => (
                <div key={question.id} className="flex items-center gap-3">
                  <input
                    type="text"
                    value={question.question}
                    onChange={async (e) => {
                      const newQuestions = [
                        ...(websiteData?.popUpQuestions || []),
                      ];
                      newQuestions[index] = {
                        ...question,
                        question: e.target.value,
                      };

                      // Optimistically update
                      setWebsiteData({
                        ...websiteData!,
                        popUpQuestions: newQuestions,
                      } as WebsiteData);

                      // Update in database
                      try {
                        const response = await fetch(
                          "/api/websites/update-question",
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              questionId: question.id,
                              question: e.target.value,
                            }),
                          }
                        );

                        if (!response.ok)
                          throw new Error("Failed to update question");
                      } catch (error) {
                        console.error("Error updating question:", error);
                        // Revert on error
                        setWebsiteData({
                          ...websiteData!,
                          popUpQuestions: websiteData?.popUpQuestions,
                        } as WebsiteData);
                      }
                    }}
                    className="flex-1 p-2 rounded-lg border border-brand-lavender-light/20 
                             focus:outline-none focus:ring-2 focus:ring-brand-accent/20 bg-gray-100 text-black"
                  />
                  <button
                    onClick={async () => {
                      // Optimistically update
                      setWebsiteData({
                        ...websiteData!,
                        popUpQuestions: websiteData?.popUpQuestions?.filter(
                          (q) => q.id !== question.id
                        ),
                      } as WebsiteData);

                      // Delete from database
                      try {
                        const response = await fetch(
                          "/api/websites/delete-question",
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              questionId: question.id,
                            }),
                          }
                        );

                        if (!response.ok)
                          throw new Error("Failed to delete question");
                      } catch (error) {
                        console.error("Error deleting question:", error);
                        // Revert on error
                        setWebsiteData({
                          ...websiteData!,
                          popUpQuestions: websiteData?.popUpQuestions,
                        } as WebsiteData);
                      }
                    }}
                    className="p-2 text-red-500 hover:text-red-600 transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              ))}

              {(websiteData?.popUpQuestions?.length || 0) < 3 && (
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch(
                        "/api/websites/add-question",
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            websiteId: websiteData?.id,
                            question: "New Question",
                          }),
                        }
                      );

                      if (!response.ok)
                        throw new Error("Failed to add question");

                      const newQuestion = await response.json();

                      setWebsiteData({
                        ...websiteData!,
                        popUpQuestions: [
                          ...(websiteData?.popUpQuestions || []),
                          newQuestion,
                        ],
                      } as WebsiteData);
                    } catch (error) {
                      console.error("Error adding question:", error);
                    }
                  }}
                  className="w-full p-2 border-2 border-dashed border-brand-lavender-light/20 
                             rounded-lg text-brand-text-secondary hover:text-brand-accent 
                             hover:border-brand-accent/20 transition-colors"
                >
                  + Add Question
                </button>
              )}
            </div>
            <p className="text-xs text-brand-text-secondary">
              You can add up to 3 pop-up questions.
            </p>
          </div>
        )}

        {/* Add the new AI Features Tab */}
        {activeSettingsTab === "features" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-brand-text-primary">
                AI Auto Features
              </h3>
              <button
                onClick={async () => {
                  if (!websiteData) return;

                  setIsSavingAutoFeatures(true);
                  setAutoFeaturesError(null);

                  try {
                    const response = await fetch(
                      "/api/websites/update-auto-features",
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          websiteId: websiteData.id,
                          allowAutoCancel: websiteData.allowAutoCancel,
                          allowAutoReturn: websiteData.allowAutoReturn,
                          allowAutoExchange: websiteData.allowAutoExchange,
                          allowAutoClick: websiteData.allowAutoClick,
                          allowAutoScroll: websiteData.allowAutoScroll,
                          allowAutoHighlight: websiteData.allowAutoHighlight,
                          allowAutoRedirect: websiteData.allowAutoRedirect,
                          allowAutoGetUserOrders:
                            websiteData.allowAutoGetUserOrders,
                          allowAutoUpdateUserInfo:
                            websiteData.allowAutoUpdateUserInfo,
                          allowAutoFillForm: websiteData.allowAutoFillForm,
                          allowAutoTrackOrder: websiteData.allowAutoTrackOrder,
                          allowAutoLogout: websiteData.allowAutoLogout,
                          allowAutoLogin: websiteData.allowAutoLogin,
                          allowAutoGenerateImage:
                            websiteData.allowAutoGenerateImage,
                          allowMultiAIReview: websiteData.allowMultiAIReview,
                        }),
                      }
                    );

                    if (!response.ok) {
                      const data = await response.json();
                      throw new Error(
                        data.error || "Failed to update AI features"
                      );
                    }
                  } catch (error) {
                    console.error("Error updating AI features:", error);
                    setAutoFeaturesError("Failed to save AI features");
                  } finally {
                    setIsSavingAutoFeatures(false);
                  }
                }}
                disabled={isSavingAutoFeatures}
                className="px-3 py-1 text-sm bg-brand-accent text-white rounded-lg 
                          hover:bg-brand-accent/90 transition-colors disabled:opacity-50"
              >
                {isSavingAutoFeatures ? (
                  <>
                    <FaSync className="inline-block mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Features"
                )}
              </button>
            </div>

            <p className="text-sm text-brand-text-secondary mb-4">
              Control which automated actions your AI assistant can perform.
              Disabling certain features may limit functionality.
            </p>

            <div className="grid grid-cols-1 gap-4">
              {/* Critical Features with warnings */}
              <div className="border-b border-brand-lavender-light/20 pb-4 mb-4">
                <h4 className="font-medium text-brand-text-primary mb-3">
                  Critical Features
                </h4>
                <p className="text-sm text-amber-600 mb-4">
                  <FaExclamationTriangle className="inline-block mr-1" />
                  Disabling these features will significantly reduce the
                  effectiveness of your AI assistant.
                </p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Multiple AI Reviews</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow users to see multiple AI summaries per day instead
                        of just one
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={websiteData?.allowMultiAIReview ?? false}
                        onChange={() => {
                          setWebsiteData({
                            ...websiteData!,
                            allowMultiAIReview: !(
                              websiteData?.allowMultiAIReview ?? false
                            ),
                          } as WebsiteData);
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Redirect</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to automatically redirect users to relevant
                        pages
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={websiteData?.allowAutoRedirect ?? true}
                        onChange={() => {
                          const newValue = !(
                            websiteData?.allowAutoRedirect ?? true
                          );
                          if (!newValue) {
                            setShowFeatureWarning(true);
                            setPendingFeatureChanges({
                              feature: "allowAutoRedirect",
                              value: false,
                            });
                          } else {
                            setWebsiteData({
                              ...websiteData!,
                              allowAutoRedirect: true,
                            } as WebsiteData);
                          }
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Scroll</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to scroll to relevant sections on the page
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={websiteData?.allowAutoScroll ?? true}
                        onChange={() => {
                          const newValue = !(
                            websiteData?.allowAutoScroll ?? true
                          );
                          if (!newValue) {
                            setShowFeatureWarning(true);
                            setPendingFeatureChanges({
                              feature: "allowAutoScroll",
                              value: false,
                            });
                          } else {
                            setWebsiteData({
                              ...websiteData!,
                              allowAutoScroll: true,
                            } as WebsiteData);
                          }
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Highlight</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to highlight important elements on the page
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={websiteData?.allowAutoHighlight ?? true}
                        onChange={() => {
                          const newValue = !(
                            websiteData?.allowAutoHighlight ?? true
                          );
                          if (!newValue) {
                            setShowFeatureWarning(true);
                            setPendingFeatureChanges({
                              feature: "allowAutoHighlight",
                              value: false,
                            });
                          } else {
                            setWebsiteData({
                              ...websiteData!,
                              allowAutoHighlight: true,
                            } as WebsiteData);
                          }
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Click</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to click buttons and links on behalf of users
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={websiteData?.allowAutoClick ?? true}
                        onChange={() => {
                          setWebsiteData({
                            ...websiteData!,
                            allowAutoClick: !(
                              websiteData?.allowAutoClick ?? true
                            ),
                          } as WebsiteData);
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Fill Forms</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to fill out forms on behalf of users
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={websiteData?.allowAutoFillForm ?? true}
                        onChange={() => {
                          setWebsiteData({
                            ...websiteData!,
                            allowAutoFillForm: !(
                              websiteData?.allowAutoFillForm ?? true
                            ),
                          } as WebsiteData);
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Standard Features */}
              <div>
                <h4 className="font-medium text-brand-text-primary mb-3">
                  Order Features
                </h4>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Cancel</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to help users cancel orders
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={websiteData?.allowAutoCancel ?? true}
                        onChange={() => {
                          setWebsiteData({
                            ...websiteData!,
                            allowAutoCancel: !(
                              websiteData?.allowAutoCancel ?? true
                            ),
                          } as WebsiteData);
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Return</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to help users return products
                      </p>
                      <span className="inline-block mt-1 px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded">
                        Coming Soon
                      </span>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={false}
                        disabled={true}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Exchange</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to help users exchange products
                      </p>
                      <span className="inline-block mt-1 px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded">
                        Coming Soon
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={false}
                        disabled={true}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Get User Orders</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to fetch and display user order history
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={websiteData?.allowAutoGetUserOrders ?? true}
                        onChange={() => {
                          setWebsiteData({
                            ...websiteData!,
                            allowAutoGetUserOrders: !(
                              websiteData?.allowAutoGetUserOrders ?? true
                            ),
                          } as WebsiteData);
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Track Orders</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to help users track their order status
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={websiteData?.allowAutoTrackOrder ?? true}
                        onChange={() => {
                          setWebsiteData({
                            ...websiteData!,
                            allowAutoTrackOrder: !(
                              websiteData?.allowAutoTrackOrder ?? true
                            ),
                          } as WebsiteData);
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Account Features */}
              <div className="border-t border-brand-lavender-light/20 pt-4">
                <h4 className="font-medium text-brand-text-primary mb-3">
                  Account Features
                </h4>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Update User Info</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to help users update their account information
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={websiteData?.allowAutoUpdateUserInfo ?? true}
                        onChange={() => {
                          setWebsiteData({
                            ...websiteData!,
                            allowAutoUpdateUserInfo: !(
                              websiteData?.allowAutoUpdateUserInfo ?? true
                            ),
                          } as WebsiteData);
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Login</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to help users log into their accounts
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={websiteData?.allowAutoLogin ?? true}
                        onChange={() => {
                          setWebsiteData({
                            ...websiteData!,
                            allowAutoLogin: !(
                              websiteData?.allowAutoLogin ?? true
                            ),
                          } as WebsiteData);
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Logout</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to help users log out of their accounts
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={websiteData?.allowAutoLogout ?? true}
                        onChange={() => {
                          setWebsiteData({
                            ...websiteData!,
                            allowAutoLogout: !(
                              websiteData?.allowAutoLogout ?? true
                            ),
                          } as WebsiteData);
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Content Generation Features */}
              <div className="border-t border-brand-lavender-light/20 pt-4">
                <h4 className="font-medium text-brand-text-primary mb-3">
                  Content Generation
                </h4>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-brand-lavender-light/5 rounded-lg">
                    <div>
                      <h5 className="font-medium">Auto Generate Images</h5>
                      <p className="text-sm text-brand-text-secondary">
                        Allow AI to generate custom images based on user
                        requests
                      </p>
                      <span className="inline-block mt-1 px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded">
                        Coming Soon
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-not-allowed opacity-50">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={false}
                        disabled={true}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {autoFeaturesError && (
              <div className="mt-3 text-red-500 text-sm">
                {autoFeaturesError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Global Statistics */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
        <h2 className="text-xl font-semibold text-brand-text-primary mb-6">
          Global Statistics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 className="text-sm text-brand-text-secondary mb-2">
              Total AI Redirects
            </h3>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-brand-accent">
                {globalStats.totalAiRedirects.toLocaleString()}
              </span>
            </div>
          </div>
          <div>
            <h3 className="text-sm text-brand-text-secondary mb-2">
              Voice Chats
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-brand-text-primary">
                {globalStats.totalVoiceChats.toLocaleString()}
              </span>
              <Link
                href={`/app/chats?website=${websiteData.id}&type=voice`}
                className="text-sm text-brand-accent hover:text-brand-accent/80 transition-colors"
              >
                View chats →
              </Link>
            </div>
          </div>
          <div>
            <h3 className="text-sm text-brand-text-secondary mb-2">
              Text Chats
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-brand-text-primary">
                {globalStats.totalTextChats.toLocaleString()}
              </span>
              <Link
                href={`/app/chats?website=${websiteData.id}&type=text`}
                className="text-sm text-brand-accent hover:text-brand-accent/80 transition-colors"
              >
                View chats →
              </Link>
            </div>
          </div>
        </div>
      </div>

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
            <ContentList items={products} />
          )}
          {activeTab === "posts" && type.toLowerCase() !== "custom" && (
            <ContentList items={blogPosts} />
          )}
          {activeTab === "pages" && <ContentList items={pages} />}
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
        </div>
      </div>

      {/* Plan Management Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-xl relative">
            <button
              onClick={() => setShowPlanModal(false)}
              className="absolute top-4 right-4 text-brand-text-secondary hover:text-brand-accent"
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-xl font-bold mb-4 text-brand-text-primary">
              {plan === "Starter" || plan === "Enterprise"
                ? "Manage Your Plan"
                : "Upgrade Your Plan"}
            </h2>
            {planError && (
              <div className="text-red-500 text-sm mb-2">{planError}</div>
            )}
            <div className="space-y-4">
              {!plan && (
                <button
                  onClick={() => handlePlanChange()}
                  disabled={isPlanLoading}
                  className="block w-full px-4 py-2 bg-brand-accent text-white rounded-lg border border-brand-accent hover:bg-brand-accent/90 transition-colors disabled:opacity-50"
                >
                  Upgrade to Starter ($1/query - 100 queries)
                </button>
              )}

              {/* Current Plan Information */}
              {(plan === "Starter" || plan === "Enterprise") && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="text-lg font-semibold mb-2 text-black">
                    {plan === "Enterprise" ? "Enterprise Plan" : "Starter Plan"}
                  </h3>
                  <p className="text-sm text-brand-text-secondary mb-2">
                    {plan === "Enterprise"
                      ? "You're currently on our Enterprise plan with pay-per-usage pricing at $0.10 per query with unlimited usage."
                      : "You're currently on our Starter plan with 100 monthly queries at $1/query."}
                  </p>

                  {/* Plan details section */}
                  <div className="mt-4 text-sm text-brand-text-secondary">
                    <div className="flex justify-between mb-1">
                      <span>Plan:</span>
                      <span className="font-medium text-black">{plan}</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span>Monthly Queries:</span>
                      <span className="font-medium text-black">
                        {plan === "Enterprise" ? "Unlimited" : "100"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pricing:</span>
                      <span className="font-medium text-black">
                        {plan === "Enterprise" ? "$0.10 per query" : "$1/query"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Cancel button */}
              {(plan === "Starter" || plan === "Enterprise") && (
                <>
                  <button
                    onClick={handleCancelPlan}
                    disabled={isPlanLoading}
                    className="block w-full px-4 py-2 bg-red-100 text-red-600 rounded-lg border border-red-200 hover:bg-red-200 transition-colors disabled:opacity-50"
                  >
                    {isPlanLoading ? "Processing..." : "Cancel Plan"}
                  </button>
                  <p className="text-xs text-brand-text-secondary text-center mt-2">
                    Your plan will be canceled immediately. This action cannot
                    be undone.
                  </p>
                </>
              )}

              {/* Plan upgrade information */}
              {plan === "Starter" && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="text-lg font-semibold mb-2 text-black">
                    Enterprise Plan
                  </h3>
                  <p className="text-sm text-brand-text-secondary mb-2">
                    When you exceed your Starter plan limit of 100 queries,
                    you'll automatically be upgraded to our Enterprise plan.
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-brand-accent">$0.10</span>
                    <span className="text-sm text-brand-text-secondary">
                      per query
                    </span>
                  </div>
                  <ul className="text-sm text-brand-text-secondary list-disc pl-5 space-y-1">
                    <li>Unlimited queries</li>
                    <li>Pay only for what you use</li>
                    <li>No action required - automatic upgrade</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Feature Warning Modal */}
      {showFeatureWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-xl relative">
            <button
              onClick={() => {
                setShowFeatureWarning(false);
                setPendingFeatureChanges(null);
              }}
              className="absolute top-4 right-4 text-brand-text-secondary hover:text-brand-accent"
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-xl font-bold mb-4 text-brand-text-primary">
              Warning: Reduced Functionality
            </h2>
            <div className="text-amber-600 mb-6">
              <FaExclamationTriangle className="text-4xl mx-auto mb-4" />
              <p className="text-center">
                Disabling this feature will significantly reduce the
                effectiveness of your AI assistant.
              </p>
            </div>
            <p className="mb-6 text-brand-text-secondary">
              {pendingFeatureChanges?.feature === "allowAutoRedirect" &&
                "Without auto-redirect, your AI cannot automatically take users to product pages, blog posts, or other relevant content when requested."}
              {pendingFeatureChanges?.feature === "allowAutoScroll" &&
                "Without auto-scroll, your AI cannot guide users to the specific sections of your page when answering questions."}
              {pendingFeatureChanges?.feature === "allowAutoHighlight" &&
                "Without auto-highlight, your AI cannot visually indicate important information on your pages."}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowFeatureWarning(false);
                  setPendingFeatureChanges(null);
                }}
                className="flex-1 px-4 py-2 border border-brand-accent/20 text-brand-accent 
                        rounded-lg text-center hover:bg-brand-accent/5 transition-colors"
              >
                Keep Enabled
              </button>
              <button
                onClick={() => {
                  if (pendingFeatureChanges) {
                    setWebsiteData({
                      ...websiteData!,
                      [pendingFeatureChanges.feature]:
                        pendingFeatureChanges.value,
                    } as WebsiteData);
                  }
                  setShowFeatureWarning(false);
                  setPendingFeatureChanges(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 
                        rounded-lg text-center hover:bg-gray-200 transition-colors"
              >
                Disable Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
