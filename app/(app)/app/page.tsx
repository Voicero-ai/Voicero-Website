"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  FaShopify,
  FaWordpress,
  FaRocket,
  FaChartLine,
  FaComments,
  FaMicrophone,
  FaExternalLinkAlt,
  FaPlus,
  FaKey,
  FaCog,
} from "react-icons/fa";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";

interface DashboardData {
  stats: {
    totalChats: number;
    voiceChats: number;
    aiRedirects: number;
    aiScrolls: number;
    aiPurchases: number;
    aiClicks: number;
    activeSites: number;
  };
  chartData: {
    date: string;
    redirects: number;
    scrolls: number;
    purchases: number;
    clicks: number;
    chats: number;
  }[];
  websites: {
    id: string;
    domain: string;
    platform: string;
    monthlyChats: number;
    aiRedirects: number;
    aiScrolls: number;
    aiPurchases: number;
    aiClicks: number;
    status: string;
  }[];
}

// Loading Skeleton Components
const StatCardSkeleton = () => (
  <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6 animate-pulse">
    <div className="flex items-center gap-3 mb-2">
      <div className="p-2 bg-gray-200 rounded-lg w-9 h-9"></div>
      <div className="h-4 bg-gray-200 rounded w-20"></div>
    </div>
    <div className="h-8 bg-gray-200 rounded w-16"></div>
  </div>
);

const ChartSkeleton = () => (
  <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6 animate-pulse">
    <div className="flex items-center justify-between mb-6">
      <div className="h-6 bg-gray-200 rounded w-32"></div>
      <div className="h-8 bg-gray-200 rounded w-28"></div>
    </div>
    <div className="flex flex-wrap gap-4 mb-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-8 bg-gray-200 rounded w-20"></div>
      ))}
    </div>
    <div className="h-[300px] bg-gray-100 rounded"></div>
  </div>
);

const QuickActionsSkeleton = () => (
  <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6 animate-pulse">
    <div className="h-6 bg-gray-200 rounded w-28 mb-4"></div>
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <div className="p-2 bg-gray-200 rounded-lg w-8 h-8"></div>
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-gray-200 rounded w-24"></div>
            <div className="h-3 bg-gray-200 rounded w-32"></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const ConnectedSitesSkeleton = () => (
  <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6 animate-pulse">
    <div className="h-6 bg-gray-200 rounded w-28 mb-4"></div>
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-200 rounded-lg w-8 h-8"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-32"></div>
              <div className="h-3 bg-gray-200 rounded w-24"></div>
            </div>
          </div>
          <div className="w-4 h-4 bg-gray-200 rounded"></div>
        </div>
      ))}
    </div>
  </div>
);

const DashboardSkeleton = () => (
  <div className="max-w-7xl mx-auto space-y-8">
    {/* Quick Stats Skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
    </div>

    {/* Main Content Grid Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <ChartSkeleton />
      <div className="space-y-6">
        <QuickActionsSkeleton />
        <ConnectedSitesSkeleton />
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7");
  const [activeLines, setActiveLines] = useState({
    redirects: true,
    scrolls: true,
    purchases: true,
    clicks: true,
    chats: true,
  });
  const router = useRouter();
  const { status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch(`/api/dashboard?timeRange=${timeRange}`);
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        if (!response.ok) throw new Error("Failed to fetch dashboard data");
        const dashboardData = await response.json();
        setData(dashboardData);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (status === "authenticated") {
      fetchDashboardData();
    }
  }, [status, router, timeRange]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-8 px-4">
          <div className="mb-8">
            <div className="h-8 bg-gray-200 rounded w-48 mb-2 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-64 animate-pulse"></div>
          </div>
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  if (!data) {
    return <div>Error loading dashboard data</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-brand-lavender-light/10 rounded-lg">
              <FaComments className="w-5 h-5 text-brand-accent" />
            </div>
            <h3 className="text-brand-text-secondary font-medium">
              Total Chats
            </h3>
          </div>
          <p className="text-3xl font-bold text-brand-text-primary">
            {data.stats.totalChats}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-brand-lavender-light/10 rounded-lg">
              <FaMicrophone className="w-5 h-5 text-brand-accent" />
            </div>
            <h3 className="text-brand-text-secondary font-medium">
              Voice Chats
            </h3>
          </div>
          <p className="text-3xl font-bold text-brand-text-primary">
            {data.stats.voiceChats}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-brand-lavender-light/10 rounded-lg">
              <FaChartLine className="w-5 h-5 text-brand-accent" />
            </div>
            <h3 className="text-brand-text-secondary font-medium">
              AI Actions
            </h3>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-brand-text-secondary">
              Redirects: {data.stats.aiRedirects}
            </p>
            <p className="text-sm text-brand-text-secondary">
              Scrolls: {data.stats.aiScrolls}
            </p>
            <p className="text-sm text-brand-text-secondary">
              Add to Cart: {data.stats.aiPurchases}
            </p>
            <p className="text-sm text-brand-text-secondary">
              Clicks: {data.stats.aiClicks}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-brand-lavender-light/10 rounded-lg">
              <FaRocket className="w-5 h-5 text-brand-accent" />
            </div>
            <h3 className="text-brand-text-secondary font-medium">
              Active Sites
            </h3>
          </div>
          <p className="text-3xl font-bold text-brand-text-primary">
            {data.stats.activeSites}
          </p>
          <p className="text-sm text-brand-text-secondary mt-1">
            Shopify & WordPress
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Activity Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-brand-text-primary">
              Activity Overview
            </h2>
            <select
              className="px-3 py-1 border border-brand-lavender-light/20 rounded-lg text-sm text-brand-text-secondary"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-4 mb-4">
            <button
              onClick={() =>
                setActiveLines((prev) => ({
                  ...prev,
                  redirects: !prev.redirects,
                }))
              }
              className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm transition-colors ${
                activeLines.redirects
                  ? "bg-brand-lavender-light/10 text-brand-text-primary"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              <div className="w-3 h-3 rounded-full bg-[#6366f1]" />
              Redirects
            </button>
            <button
              onClick={() =>
                setActiveLines((prev) => ({ ...prev, scrolls: !prev.scrolls }))
              }
              className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm transition-colors ${
                activeLines.scrolls
                  ? "bg-brand-lavender-light/10 text-brand-text-primary"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
              Scrolls
            </button>
            <button
              onClick={() =>
                setActiveLines((prev) => ({
                  ...prev,
                  purchases: !prev.purchases,
                }))
              }
              className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm transition-colors ${
                activeLines.purchases
                  ? "bg-brand-lavender-light/10 text-brand-text-primary"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
              Add to Cart
            </button>
            <button
              onClick={() =>
                setActiveLines((prev) => ({ ...prev, clicks: !prev.clicks }))
              }
              className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm transition-colors ${
                activeLines.clicks
                  ? "bg-brand-lavender-light/10 text-brand-text-primary"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
              Clicks
            </button>
            <button
              onClick={() =>
                setActiveLines((prev) => ({ ...prev, chats: !prev.chats }))
              }
              className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm transition-colors ${
                activeLines.chats
                  ? "bg-brand-lavender-light/10 text-brand-text-primary"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              <div className="w-3 h-3 rounded-full bg-[#a855f7]" />
              Chats
            </button>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.chartData.map((item) => ({
                  ...item,
                  date: format(new Date(item.date), "MMM d, yyyy"),
                }))}
              >
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  tickFormatter={(value) => format(new Date(value), "MMM d")}
                />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  labelFormatter={(label) =>
                    format(new Date(label), "MMM d, yyyy")
                  }
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "8px",
                  }}
                />
                {activeLines.redirects && (
                  <Line
                    type="monotone"
                    dataKey="redirects"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                )}
                {activeLines.scrolls && (
                  <Line
                    type="monotone"
                    dataKey="scrolls"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                )}
                {activeLines.purchases && (
                  <Line
                    type="monotone"
                    dataKey="purchases"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                )}
                {activeLines.clicks && (
                  <Line
                    type="monotone"
                    dataKey="clicks"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                )}
                {activeLines.chats && (
                  <Line
                    type="monotone"
                    dataKey="chats"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
            <h2 className="text-xl font-semibold text-brand-text-primary mb-4">
              Quick Actions
            </h2>
            <div className="space-y-3">
              <Link
                href="/app/websites/new"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-brand-lavender-light/5 transition-colors group"
              >
                <div className="p-2 bg-brand-lavender-light/10 rounded-lg group-hover:bg-brand-lavender-light/20">
                  <FaPlus className="w-4 h-4 text-brand-accent" />
                </div>
                <div>
                  <h3 className="font-medium text-brand-text-primary">
                    Add Website
                  </h3>
                  <p className="text-sm text-brand-text-secondary">
                    Connect a new site
                  </p>
                </div>
              </Link>

              <Link
                href="/app/access-keys"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-brand-lavender-light/5 transition-colors group"
              >
                <div className="p-2 bg-brand-lavender-light/10 rounded-lg group-hover:bg-brand-lavender-light/20">
                  <FaKey className="w-4 h-4 text-brand-accent" />
                </div>
                <div>
                  <h3 className="font-medium text-brand-text-primary">
                    Access Keys
                  </h3>
                  <p className="text-sm text-brand-text-secondary">
                    Manage your Access Keys
                  </p>
                </div>
              </Link>

              <Link
                href="/docs"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-brand-lavender-light/5 transition-colors group"
              >
                <div className="p-2 bg-brand-lavender-light/10 rounded-lg group-hover:bg-brand-lavender-light/20">
                  <FaRocket className="w-4 h-4 text-brand-accent" />
                </div>
                <div>
                  <h3 className="font-medium text-brand-text-primary">
                    Documentation
                  </h3>
                  <p className="text-sm text-brand-text-secondary">
                    Setup guides & help
                  </p>
                </div>
              </Link>
            </div>
          </div>

          {/* Connected Sites */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
            <h2 className="text-xl font-semibold text-brand-text-primary mb-4">
              Connected Sites
            </h2>
            <div className="space-y-4">
              {data.websites.map((site) => (
                <Link
                  key={site.id}
                  href={`/app/websites/website?id=${site.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-brand-lavender-light/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand-lavender-light/10 rounded-lg">
                      {site.platform === "shopify" ? (
                        <FaShopify className="w-4 h-4 text-brand-accent" />
                      ) : (
                        <FaWordpress className="w-4 h-4 text-brand-accent" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium text-brand-text-primary">
                        {site.domain}
                      </h3>
                      <p className="text-sm text-brand-text-secondary">
                        {site.monthlyChats} chats • {site.aiRedirects} redirects
                      </p>
                    </div>
                  </div>
                  <FaExternalLinkAlt className="w-4 h-4 text-brand-text-secondary" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
