"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FaGlobe,
  FaExternalLinkAlt,
  FaShoppingBag,
  FaNewspaper,
  FaFile,
  FaCheckCircle,
  FaTimesCircle,
} from "react-icons/fa";
import { useRouter } from "next/navigation";

interface Website {
  id: string;
  url: string;
  type: string;
  active: boolean;
  monthlyQueries: number;
  queryLimit: number;
  lastSyncedAt: string | null;
  content: {
    products?: number;
    blogPosts?: number;
    pages: number;
  };
  status: "active" | "inactive";
  name?: string;
}

export default function Websites() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchWebsites = async () => {
      try {
        const response = await fetch("/api/websites");
        if (!response.ok) {
          throw new Error("Failed to fetch websites");
        }
        const data = await response.json();
        setWebsites(data);
      } catch (error) {
        console.error("Error fetching websites:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWebsites();
  }, []);

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-brand-text-primary mb-2">
            Connected Websites
          </h1>
          <p className="text-brand-text-secondary">
            Manage and monitor your connected websites
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => router.push("/app/websites/new")}
          className="px-6 py-2 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                   text-white rounded-xl shadow-lg shadow-brand-accent/20
                   hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow"
        >
          Connect Website
        </motion.button>
      </header>

      {/* Website List */}
      {websites.length > 0 ? (
        <div className="grid gap-6">
          {websites.map((website) => (
            <motion.div
              key={website.id}
              onClick={() =>
                router.push(`/app/websites/website?id=${website.id}`)
              }
              className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 
                       overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="p-6 border-b border-brand-lavender-light/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-brand-lavender-light/10 rounded-lg">
                      <FaGlobe className="w-6 h-6 text-brand-accent" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-brand-text-primary">
                          {website.url}
                        </h2>
                        <div
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm ${
                            website.active
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {website.active ? (
                            <>
                              <FaCheckCircle className="w-3 h-3" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <FaTimesCircle className="w-3 h-3" />
                              <span>Inactive</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-brand-text-secondary">
                        {website.name && <span>{website.name} •</span>}
                        <span>{website.type}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={`${website.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-brand-text-secondary hover:text-brand-accent 
                               transition-colors rounded-lg hover:bg-brand-lavender-light/5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FaExternalLinkAlt className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Usage Stats */}
                {
                  <div className="mt-6 bg-brand-lavender-light/5 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-brand-text-secondary">
                        Monthly Queries
                      </span>
                      <span className="text-sm font-medium text-brand-text-primary">
                        {website.monthlyQueries.toLocaleString()} /{" "}
                        {website.queryLimit.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-brand-lavender-light/20 rounded-full h-2">
                      <div
                        className="bg-brand-accent h-2 rounded-full transition-all"
                        style={{
                          width: `${
                            (website.monthlyQueries / website.queryLimit) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                }

                {/* Content Summary */}
                <div className="mt-4 grid grid-cols-3 gap-4">
                  {website.content.products !== undefined && (
                    <div className="flex items-center gap-2">
                      <FaShoppingBag className="w-4 h-4 text-brand-text-secondary" />
                      <span className="text-sm text-brand-text-secondary">
                        {website.content.products} Products
                      </span>
                    </div>
                  )}
                  {website.content.blogPosts !== undefined && (
                    <div className="flex items-center gap-2">
                      <FaNewspaper className="w-4 h-4 text-brand-text-secondary" />
                      <span className="text-sm text-brand-text-secondary">
                        {website.content.blogPosts} Blog Posts
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <FaFile className="w-4 h-4 text-brand-text-secondary" />
                    <span className="text-sm text-brand-text-secondary">
                      {website.content.pages} Pages
                    </span>
                  </div>
                </div>

                {/* Last Sync Info */}
                <div className="px-6 py-3 bg-brand-lavender-light/5 text-sm">
                  {website.lastSyncedAt ? (
                    <span className="text-brand-text-secondary">
                      Last synced:{" "}
                      {new Date(website.lastSyncedAt).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-amber-600 flex items-center gap-2">
                      <FaTimesCircle className="w-4 h-4" />
                      Not yet synced - AI features will be available after first
                      sync
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-brand-lavender-light/20">
          <FaGlobe className="w-12 h-12 text-brand-text-secondary/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-brand-text-primary mb-2">
            No Websites Connected
          </h3>
          <p className="text-brand-text-secondary mb-6">
            Connect your first website to get started
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/app/websites/new")}
            className="px-6 py-2 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                     text-white rounded-xl shadow-lg shadow-brand-accent/20
                     hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow"
          >
            Connect Website
          </motion.button>
        </div>
      )}
    </div>
  );
}
