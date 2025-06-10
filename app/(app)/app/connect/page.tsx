"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import Link from "next/link";

interface Website {
  id: string;
  name: string;
  url: string;
  active: boolean;
  type: string;
}

export default function ConnectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);

  const siteUrl = searchParams!.get("site_url");
  const wpRedirect = searchParams!.get("redirect_url");
  const siteType = searchParams!.get("type") || "WordPress";

  const connectWebsite = useCallback(
    async (
      websiteId?: string,
      savedSiteUrl?: string,
      savedWpRedirect?: string
    ) => {
      try {
        // Ensure we have a session before proceeding
        if (!session?.user?.id) {
          const currentUrl = new URL(window.location.href);
          const callbackUrl = `/app/connect${currentUrl.search}`;
          router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
          return;
        }

        let connectionData = {
          siteUrl: savedSiteUrl || siteUrl,
          wpRedirect: savedWpRedirect || wpRedirect,
          type: siteType,
        };

        // If no params provided, try to get from sessionStorage
        if (!connectionData.siteUrl || !connectionData.wpRedirect) {
          const storedParams = sessionStorage.getItem("connectionParams");
          if (storedParams) {
            const params = JSON.parse(storedParams);
            connectionData = {
              siteUrl: params.site_url,
              wpRedirect: params.redirect_url,
              type: params.type,
            };
          }
        }

        // Validate required parameters
        if (!connectionData.siteUrl || !connectionData.wpRedirect) {
          setError("Missing required connection parameters");
          return;
        }

        const response = await fetch("/api/connect-website", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Include session token in request
            Authorization: `Bearer ${session.user.id}`,
          },
          body: JSON.stringify({
            siteUrl: connectionData.siteUrl,
            wpRedirect: connectionData.wpRedirect,
            websiteId: websiteId,
            type: connectionData.type,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to connect website");
        }

        // Clear stored parameters
        sessionStorage.removeItem("connectionParams");

        // Redirect back to WordPress with the access key
        window.location.href = data.redirectUrl;
      } catch (err: any) {
        setError(err?.message || "An unknown error occurred");
      }
    },
    [siteUrl, wpRedirect, siteType, router, session]
  );

  useEffect(() => {
    if (status === "loading") return;

    // Immediately redirect if no session
    if (!session?.user?.id) {
      const currentUrl = new URL(window.location.href);
      const callbackUrl = `/app/connect${currentUrl.search}`;
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    // Only proceed with connection flow if we have a session and user
    if (session?.user?.id) {
      // Store connection params
      if (siteUrl && wpRedirect) {
        sessionStorage.setItem(
          "connectionParams",
          JSON.stringify({
            site_url: siteUrl,
            redirect_url: wpRedirect,
            type: siteType,
          })
        );
      }

      const fetchWebsites = async () => {
        try {
          // Ensure session and user still exist
          if (!session?.user?.id) return;

          const response = await fetch("/api/websites", {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.user.id}`,
            },
          });
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Failed to fetch websites");
          }

          // Filter websites based on the type from URL
          const filteredWebsites = data.filter(
            (website: Website) => website.type === siteType
          );
          setWebsites(filteredWebsites);

          // If there's only one site of this type or none, proceed with connection
          if (filteredWebsites.length <= 1) {
            // Get stored params if current URL doesn't have them
            const storedParams = sessionStorage.getItem("connectionParams");
            if (!siteUrl && !wpRedirect && storedParams) {
              const params = JSON.parse(storedParams);
              await connectWebsite(
                undefined,
                params.site_url,
                params.redirect_url
              );
            } else {
              await connectWebsite();
            }
          }
        } catch (err: any) {
          setError(err?.message || "An unknown error occurred");
        } finally {
          setLoading(false);
        }
      };

      fetchWebsites();
    }
  }, [session, status, siteUrl, wpRedirect, siteType, router, connectWebsite]);

  if (!session && status !== "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-lavender-light/20 to-white py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold text-violet-900 mb-4">
                Connect Your Website
              </h1>
              <p className="text-gray-600 mb-8">
                To connect your website, please sign in or create an account
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border border-brand-lavender-light/20">
              <div className="space-y-6">
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(
                    `/connect${window.location.search}`
                  )}`}
                >
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-3 px-4 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                             text-white rounded-xl font-medium shadow-lg shadow-brand-accent/20
                             hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow"
                  >
                    Sign In
                  </motion.button>
                </Link>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">or</span>
                  </div>
                </div>

                <Link
                  href={`/getStarted?callbackUrl=${encodeURIComponent(
                    `/connect${window.location.search}`
                  )}`}
                >
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-3 px-4 bg-white border-2 border-violet-600 
                             text-violet-600 rounded-xl font-medium 
                             hover:bg-violet-50 transition-colors"
                  >
                    Create Account
                  </motion.button>
                </Link>

                <div className="mt-6 text-center text-sm text-gray-500">
                  <p>
                    By continuing, you agree to our{" "}
                    <Link
                      href="/terms"
                      className="text-violet-600 hover:text-violet-700"
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      className="text-violet-600 hover:text-violet-700"
                    >
                      Privacy Policy
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-violet-900">
            Loading...
          </h1>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md w-full">
          <div className="text-red-600 font-medium">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (websites.length > 1) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-violet-900 mb-2">
              Choose a Website to Connect
            </h1>
            <p className="text-gray-600">
              Select an existing website or create a new connection
            </p>
          </div>
          <div className="space-y-4">
            {websites.map((website) => (
              <div
                key={website.id}
                className="bg-white border border-gray-200 rounded-xl p-6 flex items-center justify-between hover:border-violet-300 hover:shadow-sm transition-all"
              >
                <div>
                  <h2 className="font-semibold text-lg text-violet-900">
                    {website.name || website.url}
                  </h2>
                  <p className="text-gray-500">{website.url}</p>
                </div>
                <button
                  onClick={() => connectWebsite(website.id)}
                  className="px-6 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium"
                >
                  Connect
                </button>
              </div>
            ))}
            <div className="mt-8 text-center">
              <button
                onClick={() => connectWebsite()}
                className="px-8 py-3 bg-white border-2 border-violet-600 text-violet-600 rounded-lg hover:bg-violet-50 transition-colors font-medium"
              >
                Create New Connection
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-6 text-violet-900">
          Connecting your website...
        </h1>
        <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-violet-600 border-t-transparent mx-auto"></div>
      </div>
    </div>
  );
}
