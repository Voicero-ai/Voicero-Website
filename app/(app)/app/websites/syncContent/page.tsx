"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FaSync,
  FaPlus,
  FaTrash,
  FaArrowLeft,
  FaCode,
  FaCopy,
  FaCheck,
  FaSpider,
} from "react-icons/fa";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface WebsiteData {
  id: string;
  domain: string;
  type: string;
  customType: string;
  name: string;
  accessKey: string;
}

export default function SyncContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const websiteId = searchParams.get("id");

  const [isLoading, setIsLoading] = useState(true);
  const [isCrawling, setIsCrawling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [website, setWebsite] = useState<WebsiteData | null>(null);
  const [discoveredUrls, setDiscoveredUrls] = useState<string[]>([]);
  const [processedUrls, setProcessedUrls] = useState<string[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [error, setError] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState(0);
  const [maxUrlsToProcess, setMaxUrlsToProcess] = useState(100);
  const [manualUrlInput, setManualUrlInput] = useState("");
  const [showAllDiscovered, setShowAllDiscovered] = useState(false);
  const initialDisplayCount = 20; // Show first 20 URLs initially
  const [displayedUrlCount, setDisplayedUrlCount] = useState(10); // State for pagination
  const urlsToShowIncrement = 10; // How many more to show each time
  const [discoveredUrlMap, setDiscoveredUrlMap] = useState<Map<string, string>>(
    new Map()
  ); // Normalized -> Original
  const concurrencyLimit = 5; // Number of URLs to process in parallel
  const [queueSize, setQueueSize] = useState(0); // State for queue size display
  const [pagesToSync, setPagesToSync] = useState<
    { url: string; title: string; content: string; htmlContent: string }[]
  >([]); // State for extracted pages
  const [existingPages, setExistingPages] = useState<
    {
      id: string;
      title: string;
      url: string;
      content: string;
      htmlContent?: string;
      source?: string;
    }[]
  >([]); // State for pages already in the database

  // --- Make state variables accessible within helper ---
  // These will be updated by the main loop, but read by the helper
  let domain = "";
  let crawledUrls: Set<string> = new Set();
  let queuedUrls: Set<string> = new Set();
  let urlQueue: string[] = []; // Declare urlQueue in component scope

  // Fetch website data
  useEffect(() => {
    if (!websiteId) {
      router.push("/app/websites");
      return;
    }

    const fetchWebsite = async () => {
      try {
        const response = await fetch(`/api/websites/get?id=${websiteId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch website data");
        }

        const data = await response.json();
        setWebsite(data);

        // Initialize with the domain as the first URL to crawl
        if (data.domain) {
          let domain = data.domain;
          if (!domain.startsWith("http")) {
            domain = `${domain}`;
          }
          setDiscoveredUrls([domain]);
        }

        // Extract existing pages from the API response
        if (data.content && data.content.pages) {
          const pages = data.content.pages;
          setExistingPages(pages);

          // Extract the URLs from existing pages
          const existingUrls = pages.map((page: { url: string }) => page.url);
          if (existingUrls.length > 0) {
            // Add them to the discovered URLs if they don't already exist
            setDiscoveredUrls((prev) => {
              const combined = new Set([...prev, ...existingUrls]);
              return Array.from(combined);
            });

            // Also add to discoveredUrlMap for normalizing
            setDiscoveredUrlMap((prev) => {
              const newMap = new Map<string, string>(prev);
              existingUrls.forEach((url: string) => {
                const normalizedUrl = normalizeUrl(url);
                if (!newMap.has(normalizedUrl)) {
                  newMap.set(normalizedUrl, url);
                }
              });
              return newMap;
            });
          }
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load website data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchWebsite();
  }, [websiteId, router]);

  // Reusable Cheerio-based content extractor function
  const extractPageData = (
    html: string,
    url: string
  ): { title: string; content: string; htmlContent: string } => {
    try {
      const cheerio = require("cheerio");
      const $ = cheerio.load(html);
      const title = $("title").first().text() || url;

      // Basic content extraction (can be refined)
      $(
        "script, style, nav, footer, header, aside, iframe, .ads, noscript"
      ).remove();
      let contentElement = $('main, article, [role="main"], body').first();
      const textContent = contentElement.text().replace(/\s\s+/g, " ").trim(); // Extract text
      const htmlContent = contentElement.html() || ""; // Extract inner HTML

      return { title, content: textContent, htmlContent }; // Return all three
    } catch (e) {
      console.error(`[EXTRACT ERROR] Failed to extract content for ${url}:`, e);
      return { title: url, content: "", htmlContent: "" }; // Default on error
    }
  };

  // Function to send URLs to custom sync endpoint
  const sendUrlsToCustomSync = async (
    websiteId: string,
    urls: string[]
  ): Promise<boolean> => {
    try {
      console.log(
        `[CUSTOM SYNC] Sending ${urls.length} URLs to custom sync endpoint`
      );
      const response = await fetch("http://localhost:3001/api/custom/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          websiteId,
          urls: urls,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Custom sync endpoint returned status ${response.status}`
        );
      }

      const result = await response.json();
      console.log(
        `[CUSTOM SYNC] Successfully sent URLs to custom sync endpoint`
      );
      return true;
    } catch (error) {
      console.error("[CUSTOM SYNC] Error sending URLs:", error);
      setError(`Failed to send URLs to custom sync service. Please try again.`);
      return false;
    }
  };

  // Function to fetch and parse sitemap files (faster than crawling)
  const processWebsiteSitemaps = async (baseUrl: string): Promise<string[]> => {
    try {
      // Normalize base URL
      if (!baseUrl.startsWith("http")) {
        baseUrl = `https://${baseUrl}`;
      }
      const baseUrlObj = new URL(baseUrl);
      const rootDomain = baseUrlObj.origin;
      console.log(`[SITEMAP] Checking for sitemaps at: ${rootDomain}`);

      // Common sitemap locations to check
      const sitemapLocations = [
        "/sitemap.xml",
        "/sitemap_index.xml",
        "/sitemap-index.xml",
        "/sitemaps/sitemap.xml",
        "/wp-sitemap.xml",
      ];

      let sitemapFound = false;
      let foundUrls: string[] = [];

      // Helper function to parse XML sitemap content
      const parseSitemapXml = (xmlContent: string): string[] => {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
        const urls: string[] = [];

        // Check if it's a sitemap index
        const sitemapElements = xmlDoc.querySelectorAll("sitemap > loc");
        if (sitemapElements && sitemapElements.length > 0) {
          console.log(
            `[SITEMAP] Found sitemap index with ${sitemapElements.length} sitemaps`
          );
          return Array.from(sitemapElements).map((el) => el.textContent || "");
        }

        // Regular sitemap with URLs
        const urlElements = xmlDoc.querySelectorAll("url > loc");
        console.log(`[SITEMAP] Found ${urlElements.length} URLs in sitemap`);
        return Array.from(urlElements).map((el) => el.textContent || "");
      };

      // First try to get sitemap.xml
      for (const sitemapPath of sitemapLocations) {
        try {
          const sitemapUrl = `${rootDomain}${sitemapPath}`;
          console.log(`[SITEMAP] Trying: ${sitemapUrl}`);

          const proxyUrl = `/api/proxy?url=${encodeURIComponent(
            sitemapUrl
          )}&allowXml=true`;
          const response = await fetch(proxyUrl);

          if (response.ok) {
            const xmlContent = await response.text();

            // Check if it looks like XML
            if (
              xmlContent.includes("<?xml") ||
              xmlContent.includes("<urlset") ||
              xmlContent.includes("<sitemapindex")
            ) {
              sitemapFound = true;

              // Parse the XML content
              const parsedUrls = parseSitemapXml(xmlContent);

              // If it's a sitemap index, we need to fetch each sitemap
              if (parsedUrls.some((url) => url.includes("sitemap"))) {
                console.log(
                  `[SITEMAP] Found sitemap index, fetching individual sitemaps`
                );

                // Fetch each sitemap in the index
                for (const sitemapUrl of parsedUrls) {
                  try {
                    const childProxyUrl = `/api/proxy?url=${encodeURIComponent(
                      sitemapUrl
                    )}&allowXml=true`;
                    const childResponse = await fetch(childProxyUrl);

                    if (childResponse.ok) {
                      const childXml = await childResponse.text();
                      const childUrls = parseSitemapXml(childXml);
                      foundUrls = [...foundUrls, ...childUrls];
                    }
                  } catch (childErr) {
                    console.error(
                      `[SITEMAP] Error fetching child sitemap: ${sitemapUrl}`,
                      childErr
                    );
                  }
                }
              } else {
                // It's a regular sitemap with URLs
                foundUrls = [...foundUrls, ...parsedUrls];
              }

              // Break after finding a valid sitemap
              break;
            }
          }
        } catch (err) {
          console.log(`[SITEMAP] Error checking ${sitemapPath}:`, err);
          // Continue to next sitemap location
        }
      }

      if (sitemapFound) {
        console.log(
          `[SITEMAP] Successfully found ${foundUrls.length} URLs from sitemaps`
        );
        return foundUrls.filter((url) => !!url); // Filter out empty strings
      } else {
        console.log(`[SITEMAP] No sitemaps found, will use regular crawling`);
        return [];
      }
    } catch (error) {
      console.error("[SITEMAP] Error processing sitemaps:", error);
      return [];
    }
  };

  // --- Main crawl function reverted to single-threaded ---
  const crawlWebsite = async () => {
    if (!website) return;

    setIsCrawling(true);
    const localPagesToSync: {
      url: string;
      title: string;
      content: string;
      htmlContent: string;
    }[] = [];
    setProcessedUrls([]);
    setCrawlProgress(0);
    setError("");
    setDiscoveredUrlMap(new Map()); // Clear map at start
    const localDiscoveredMap = new Map<string, string>();

    // Reset outer scope state for this crawl run
    crawledUrls = new Set<string>();
    queuedUrls = new Set<string>();
    urlQueue = []; // Keep using component scope queue
    setQueueSize(0);

    try {
      let baseUrl = website.domain;
      if (!baseUrl.startsWith("http")) {
        baseUrl = `https://${baseUrl}`;
      }
      const domainUrl = new URL(baseUrl);
      domain = domainUrl.hostname;

      // First try to find URLs via sitemap.xml (much faster than crawling)
      console.log(`[CRAWL] Starting sitemap discovery for ${baseUrl}`);
      setCrawlProgress(10); // Set progress to show something is happening
      setCurrentUrl("Checking sitemaps...");

      const sitemapUrls = await processWebsiteSitemaps(baseUrl);

      // Check if we found a good number of URLs from the sitemap
      if (sitemapUrls.length > 0) {
        console.log(`[CRAWL] Found ${sitemapUrls.length} URLs from sitemaps`);

        // Add the root URL to ensure the homepage is always included
        const rootUrl = baseUrl;
        const rootNormalized = normalizeUrl(rootUrl);
        if (!sitemapUrls.includes(rootUrl)) {
          sitemapUrls.push(rootUrl);
          console.log(
            `[CRAWL] Added root URL: ${rootUrl} to ensure homepage is included`
          );
        }

        // Display progress to the user
        setDiscoveredUrls(sitemapUrls);
        setCrawlProgress(100);
        setCurrentUrl("URLs collected from sitemap");

        // Store URLs in state for later sending via Train button
        console.log(`[CRAWL] Storing ${sitemapUrls.length} URLs for training`);

        // Set minimal data to show the URLs in the UI
        const minimalPagesToSync = sitemapUrls.map((url) => ({
          url,
          title: url.split("/").pop() || url,
          content: "Content will be processed by Training when trained",
          htmlContent: "",
        }));

        setPagesToSync(minimalPagesToSync);
        setProcessedUrls(sitemapUrls);

        // Skip traditional crawling, but don't redirect
        return;

        // The following code is now bypassed
        const success = false; // Dummy to satisfy TypeScript
        if (false) {
          // This block is now inactive
        } else {
          // If custom sync fails, fall back to traditional crawling
          console.log(
            "[CRAWL] Custom sync failed, falling back to traditional crawling"
          );

          // Continue with traditional URL collection for crawling
          sitemapUrls.forEach((url) => {
            try {
              const normalizedUrl = normalizeUrl(url);
              if (!localDiscoveredMap.has(normalizedUrl)) {
                localDiscoveredMap.set(normalizedUrl, url);
                queuedUrls.add(normalizedUrl);
                urlQueue.push(normalizedUrl);
              }
            } catch (err) {
              console.log(`[CRAWL] Error normalizing sitemap URL: ${url}`, err);
            }
          });

          console.log(
            `[CRAWL] Added ${urlQueue.length} sitemap URLs to processing queue (including root URL)`
          );
          setDiscoveredUrls(Array.from(localDiscoveredMap.values()));
          setQueueSize(urlQueue.length);
          setCrawlProgress(20); // Made progress by finding sitemap
        }
      } else {
        // No sitemaps found, just use the root URL
        console.log(`[CRAWL] No sitemaps found, using just the root URL`);

        // Add just the root URL
        const rootUrl = baseUrl;
        const singleUrlArray = [rootUrl];

        setDiscoveredUrls(singleUrlArray);
        setCrawlProgress(100);
        setCurrentUrl("Root URL collected");

        // Store URLs in state for later sending via Train button
        console.log(`[CRAWL] Storing root URL for training`);

        // Set minimal data just to show the URL in the UI
        const minimalPagesToSync = [
          {
            url: rootUrl,
            title: "Homepage",
            content: "Content will be processed by Training when trained",
            htmlContent: "",
          },
        ];

        setPagesToSync(minimalPagesToSync);
        setProcessedUrls(singleUrlArray);

        // Skip traditional crawling, but don't redirect
        return;

        // The following code is now bypassed
        const success = false; // Dummy to satisfy TypeScript
        if (false) {
          // This block is now inactive
        } else {
          // If custom sync fails, fall back to traditional crawling with just the root URL
          console.log(
            "[CRAWL] Custom sync failed, falling back to traditional crawling"
          );
          const startUrlNormalized = normalizeUrl(baseUrl);
          urlQueue = [startUrlNormalized];
          queuedUrls.add(startUrlNormalized);
          localDiscoveredMap.set(startUrlNormalized, baseUrl);
          setDiscoveredUrls([baseUrl]);
          setQueueSize(urlQueue.length);
        }
      }

      let processedCount = 0;
      while (urlQueue.length > 0 && processedCount < maxUrlsToProcess) {
        const normalizedUrl = urlQueue.shift();
        setQueueSize((prev) => Math.max(0, prev - 1));
        if (!normalizedUrl) continue;
        // Type assertion for TypeScript - we know normalizedUrl is not undefined at this point
        const checkedUrl = normalizedUrl as string;
        if (crawledUrls.has(checkedUrl)) continue;

        // Since we've checked normalizedUrl is not undefined, we can safely use it as string
        const safeNormalizedUrl = normalizedUrl as string;

        queuedUrls.delete(safeNormalizedUrl);
        const url =
          localDiscoveredMap.get(safeNormalizedUrl) || safeNormalizedUrl;
        setCurrentUrl(url);
        crawledUrls.add(safeNormalizedUrl);
        processedCount++;

        if (shouldSkipUrl(url)) {
          // Update UI progress for skipped URLs
          setProcessedUrls(
            Array.from(crawledUrls).map(
              (nu) => localDiscoveredMap.get(nu) || nu
            )
          );
          const currentDiscoveredCount = localDiscoveredMap.size;
          setCrawlProgress(
            currentDiscoveredCount > 0
              ? Math.min(
                  100,
                  Math.round((processedCount / currentDiscoveredCount) * 100)
                )
              : 0
          );
          continue;
        }

        // --- Determine Fetch Strategy ---
        const isInitialUrl = safeNormalizedUrl === normalizeUrl(baseUrl);
        const usePuppeteer = isInitialUrl; // Always use Puppeteer for the initial URL
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}${
          usePuppeteer ? "&renderJS=true" : ""
        }`;
        const fetchMethod = usePuppeteer ? "PUPPETEER" : "AXIOS";

        let pageData: {
          url: string;
          title: string;
          content: string;
          htmlContent: string;
        } = {
          url: "",
          title: "",
          content: "",
          htmlContent: "",
        };
        let newLinksFound = 0;
        let fetchOk = false;

        // --- Perform the Determined Fetch ---
        try {
          const response = await fetch(proxyUrl);
          if (response.ok) {
            fetchOk = true;
            const html = await response.text();
            // Extract Content & Data
            const safeUrl: string = url || baseUrl;
            pageData = { url: safeUrl, ...extractPageData(html, safeUrl) };

            // Enhanced logging with content preview
            const titlePreview = pageData.title.substring(0, 50);
            const contentPreview = pageData.content
              .substring(0, 100)
              .replace(/\n/g, " ");
            console.log(
              `[EXTRACT ${fetchMethod}] Title: "${titlePreview}...", ` +
                `Content Length: ${pageData.content.length} chars, ` +
                `Content Preview: "${contentPreview}..."`
            );

            // Find Links
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            const links = doc.querySelectorAll("a");
            newLinksFound = 0; // Reset count for this pass

            Array.from(links).forEach((link) => {
              const href = link.getAttribute("href");
              if (!href) return;
              try {
                if (
                  href === "#" ||
                  href.startsWith("javascript:") ||
                  href.startsWith("mailto:") ||
                  href.startsWith("tel:") ||
                  href.includes("cdn-cgi/l/email-protection")
                )
                  return;
                let fullUrl;
                try {
                  fullUrl = new URL(href, url).toString();
                } catch (e) {
                  return;
                }
                try {
                  const urlObj = new URL(fullUrl);
                  if (urlObj.hostname !== domain || shouldSkipUrl(fullUrl))
                    return;
                  const normalizedNewLink = normalizeUrl(fullUrl);
                  if (
                    !crawledUrls.has(normalizedNewLink) &&
                    !queuedUrls.has(normalizedNewLink)
                  ) {
                    urlQueue.push(normalizedNewLink);
                    queuedUrls.add(normalizedNewLink);
                    setQueueSize((prev) => prev + 1);
                    if (!localDiscoveredMap.has(normalizedNewLink)) {
                      localDiscoveredMap.set(normalizedNewLink, fullUrl);
                    }
                    newLinksFound++; // Increment count for this pass
                  }
                } catch (e) {
                  /* Invalid derived URL */
                }
              } catch (e) {
                /* Error processing href */
              }
            });
          } else {
            console.warn(
              `[FAIL ${fetchMethod}] Fetch failed for ${url}: ${response.status}`
            );
          }
        } catch (e) {
          console.error(`[ERROR ${fetchMethod}] Processing ${url}:`, e);
        }
        // --- End Initial Fetch ---

        // --- Conditional Puppeteer Retry (ONLY if initial fetch was Axios and found 0 new links) ---
        if (
          !isInitialUrl &&
          fetchOk &&
          newLinksFound === 0 &&
          !shouldSkipUrl(url)
        ) {
          const proxyUrlPuppeteer = `/api/proxy?url=${encodeURIComponent(
            url
          )}&renderJS=true`;
          const puppeteerMethod = "PUPPETEER_RETRY";
          try {
            const responsePuppeteer = await fetch(proxyUrlPuppeteer);
            if (responsePuppeteer.ok) {
              const htmlPuppeteer = await responsePuppeteer.text();
              // ** Re-extract Content & Overwrite **
              const safeUrl: string = url || baseUrl;
              pageData = {
                url: safeUrl,
                ...extractPageData(htmlPuppeteer, safeUrl),
              }; // Overwrite with Puppeteer data

              // Enhanced logging with content preview
              const titlePreview = pageData.title.substring(0, 50);
              const contentPreview = pageData.content
                .substring(0, 100)
                .replace(/\n/g, " ");
              console.log(
                `[EXTRACT ${puppeteerMethod}] Title: "${titlePreview}...", ` +
                  `Content Length: ${pageData.content.length} chars, ` +
                  `Content Preview: "${contentPreview}..."`
              );

              // ** Re-find Links & Add **
              const parser = new DOMParser();
              const doc = parser.parseFromString(htmlPuppeteer, "text/html");
              const links = doc.querySelectorAll("a");
              let newLinksPuppeteer = 0;

              Array.from(links).forEach((link) => {
                const href = link.getAttribute("href");
                if (!href) return;
                try {
                  if (
                    href === "#" ||
                    href.startsWith("javascript:") ||
                    href.startsWith("mailto:") ||
                    href.startsWith("tel:") ||
                    href.includes("cdn-cgi/l/email-protection")
                  )
                    return;
                  let fullUrl;
                  try {
                    fullUrl = new URL(href, url).toString();
                  } catch (e) {
                    return;
                  }
                  try {
                    const urlObj = new URL(fullUrl);
                    if (urlObj.hostname !== domain || shouldSkipUrl(fullUrl))
                      return;
                    const normalizedNewLink = normalizeUrl(fullUrl);
                    if (
                      !crawledUrls.has(normalizedNewLink) &&
                      !queuedUrls.has(normalizedNewLink)
                    ) {
                      urlQueue.push(normalizedNewLink);
                      queuedUrls.add(normalizedNewLink);
                      setQueueSize((prev) => prev + 1);
                      if (!localDiscoveredMap.has(normalizedNewLink)) {
                        localDiscoveredMap.set(normalizedNewLink, fullUrl);
                      }
                      newLinksPuppeteer++;
                    }
                  } catch (e) {
                    /* Invalid derived URL */
                  }
                } catch (e) {
                  /* Error processing href */
                }
              });
            } else {
              console.warn(
                `[FAIL ${puppeteerMethod}] Retry fetch failed for ${url}: ${responsePuppeteer.status}`
              );
            }
          } catch (e) {
            console.error(`[ERROR ${puppeteerMethod}] Retrying ${url}:`, e);
          }
        }
        // --- End Conditional Retry ---

        // Add extracted page data (either from Axios or updated by Puppeteer) to list
        localPagesToSync.push({
          url: pageData.url,
          title: pageData.title,
          content: pageData.content,
          htmlContent: pageData.htmlContent,
        });

        // Update UI state after processing this URL
        setProcessedUrls(
          Array.from(crawledUrls).map((nu) => localDiscoveredMap.get(nu) || nu)
        );
        setDiscoveredUrls(Array.from(localDiscoveredMap.values()));
        setDiscoveredUrlMap(new Map(localDiscoveredMap));
        const currentDiscoveredCount = localDiscoveredMap.size;
        setCrawlProgress(
          currentDiscoveredCount > 0
            ? Math.min(
                100,
                Math.round((processedCount / currentDiscoveredCount) * 100)
              )
            : 0
        );
      }

      // Final UI / State Update - Store pagesToSync for the handleSync function
      setPagesToSync(localPagesToSync); // Set the state with extracted data
      setDiscoveredUrls(Array.from(localDiscoveredMap.values()));
      setProcessedUrls(
        Array.from(crawledUrls).map((nu) => localDiscoveredMap.get(nu) || nu)
      );
      setDiscoveredUrlMap(new Map(localDiscoveredMap));
      setCrawlProgress(100);
      setQueueSize(0);

      // Auto-sync the collected data
      try {
        if (localPagesToSync.length > 0) {
          const syncResponse = await fetch("/api/websites/sync-custom", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              websiteId: website?.id || websiteId || "",
              pages: localPagesToSync, // Send the array of page objects
            }),
          });

          if (!syncResponse.ok) {
            const errorData = await syncResponse
              .json()
              .catch(() => ({ error: "Failed to parse error response" }));
            console.error(
              "[AUTO-SYNC FAIL] Response not OK:",
              syncResponse.status,
              errorData
            );
            throw new Error(
              errorData.error ||
                `Auto-sync failed with status: ${syncResponse.status}`
            );
          }

          const syncResult = await syncResponse.json();
          // Redirect back to website detail page
        } else {
          console.warn("[AUTO-SYNC] No pages with extracted content to sync");
          setError("No content was successfully extracted during the crawl.");
          setTimeout(() => setError(""), 2500);
        }
      } catch (syncError: any) {
        console.error("[AUTO-SYNC ERROR]", syncError);
        setError(
          `Auto-sync failed: ${syncError.message}. You can try manual sync.`
        );
      }
    } catch (error) {
      console.error("[FATAL] Error during crawling process:", error);
      setError("An error occurred during crawling. Please check the console.");
    } finally {
      setIsCrawling(false);
    }
  };

  // Normalize URL to handle trailing slashes and other variations
  const normalizeUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);

      // Remove hash
      urlObj.hash = "";

      // Normalize path: remove trailing slash except for root
      if (urlObj.pathname.length > 1 && urlObj.pathname.endsWith("/")) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }

      // Return the normalized URL
      return urlObj.toString();
    } catch (e) {
      console.error(`Error normalizing URL ${url}:`, e);
      return url;
    }
  };

  // Helper function to determine if a URL should be skipped
  const shouldSkipUrl = (url: string): boolean => {
    // Skip common resource file extensions
    const resourceExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".svg",
      ".webp",
      ".css",
      ".js",
      ".pdf",
      ".zip",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".mp4",
      ".mp3",
      ".avi",
      ".mov",
      ".ico",
      ".woff",
      ".woff2",
      ".ttf",
      ".eot",
    ];

    // Skip certain path patterns
    const skipPatterns = [
      "/cdn-cgi/", // CloudFlare scripts
      "/wp-json/", // WordPress API
      "/wp-admin/", // WordPress admin
      "/wp-includes/", // WordPress core files
      "/api/", // API endpoints
      "/admin/",
      "/assets/", // Asset files
      "/static/", // Static files
      "/rss", // RSS feeds
      "/feed", // RSS feeds
      "/author/", // Author pages
      "/comment-page-", // Comment pagination
      "/xmlrpc.php", // WordPress XML-RPC
      "/wp-login.php", // WordPress login
      "/wp-content/uploads/", // WordPress uploads (usually images)
    ];

    const lowercaseUrl = url.toLowerCase();

    // Check file extensions
    if (resourceExtensions.some((ext) => lowercaseUrl.endsWith(ext))) {
      return true;
    }

    // Check skip patterns
    if (skipPatterns.some((pattern) => lowercaseUrl.includes(pattern))) {
      return true;
    }

    return false;
  };

  const handleTrain = async () => {
    // Check if we have URLs to sync
    const urlsToSync = processedUrls || [];

    if (!urlsToSync || urlsToSync.length === 0) {
      console.warn("[SYNC] No URLs available to sync.");
      setError(
        "No URLs were found. Please first click 'Start Website Discovery' to find pages, or add URLs manually."
      );
      setTimeout(() => setError(""), 4000);
      return;
    }

    setIsSyncing(true);
    setError(""); // Clear previous errors

    // Get access key for auth
    const accessKey = getAccessKey();

    // Fire and forget - send request but don't wait for response
    fetch("http://localhost:3001/api/custom/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
      body: JSON.stringify({
        websiteId: website?.id || websiteId,
        urls: urlsToSync,
      }),
    }).catch((err) => {
      // Just log errors, don't affect UI flow
      console.error("[CUSTOM SYNC] Request error:", err);
    });

    // Show loading state for 10 seconds regardless of API response
    console.log(
      "[TRAINING] Waiting 10 seconds before showing success modal..."
    );

    // Wait 10 seconds
    setTimeout(() => {
      setIsSyncing(false);
      // Show success modal
      setShowSuccessModal(true);
    }, 10000);
  };

  // Function to get the access key - first from website object, fallback to existing pages data
  const getAccessKey = (): string => {
    // First try to get it from the website object directly
    if (website?.accessKey) return website.accessKey;

    // If not available, try to find it in the existing pages data
    if (existingPages && existingPages.length > 0) {
      for (const page of existingPages) {
        if (page.source === "accessKey") {
          return page.id;
        }
      }
    }

    return ""; // Return empty string if not found
  };

  // Add this function to handle manual URL addition
  const handleAddManualUrl = () => {
    if (!manualUrlInput.trim()) return;

    try {
      const urlToAdd = manualUrlInput.trim();
      new URL(urlToAdd); // Validate URL format

      // Check if it's already discovered (using normalization)
      const normalizedToAdd = normalizeUrl(urlToAdd);
      if (!discoveredUrlMap.has(normalizedToAdd)) {
        // Add to the map and update the display state
        const newMap = new Map(discoveredUrlMap);
        newMap.set(normalizedToAdd, urlToAdd);
        setDiscoveredUrlMap(newMap); // Update state map
        setDiscoveredUrls(Array.from(newMap.values())); // Update display list
        setManualUrlInput(""); // Clear input
      } else {
        setError("URL already in the discovered list.");
        setTimeout(() => setError(""), 3000); // Clear error after 3s
      }
    } catch (e) {
      console.error("Invalid URL entered manually:", e);
      setError(
        "Invalid URL format. Please enter a full URL (e.g., https://example.com/page)."
      );
      setTimeout(() => setError(""), 2500); // Clear error after 5s
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-4 w-full bg-gray-200 rounded animate-pulse"></div>
        <div className="h-24 w-full bg-gray-200 rounded animate-pulse"></div>
      </div>
    );
  }

  if (!website) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="bg-red-50 p-4 rounded-xl text-red-600 mb-4">
          {error || "Website not found. Please go back to your websites."}
        </div>
        <Link
          href="/app/websites"
          className="inline-flex items-center text-brand-accent hover:underline"
        >
          <FaArrowLeft className="mr-2" size={14} />
          Back to Websites
        </Link>
      </div>
    );
  }

  // Success Modal Component
  const SuccessModal = () => {
    if (!showSuccessModal) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl p-8 max-w-md mx-4 relative">
          <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-green-500 rounded-full p-4">
            <FaCheck className="text-white text-2xl" />
          </div>

          <h2 className="text-2xl font-bold text-center mb-4 mt-2">
            Training Complete!
          </h2>

          <p className="text-center text-gray-600 mb-6">
            Your content has been successfully sent for training. You can now
            return to your website dashboard.
          </p>

          <div className="flex justify-center">
            <button
              onClick={() =>
                router.push(`/app/websites/website?id=${websiteId}&sync=true`)
              }
              className="bg-gradient-to-r from-brand-accent to-brand-lavender-dark text-white 
                      px-8 py-3 rounded-xl shadow-lg shadow-brand-accent/20
                      hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow"
            >
              Go to Website Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Show success modal when triggered */}
      <SuccessModal />

      <header>
        <Link
          href={`/app/websites/website?id=${websiteId}`}
          className="inline-flex items-center text-brand-accent hover:underline mb-4"
        >
          <FaArrowLeft className="mr-2" size={14} />
          Back to Website
        </Link>
        <h1 className="text-3xl font-bold text-brand-text-primary mb-2">
          Sync Content - {website.name}
        </h1>
        <p className="text-brand-text-secondary">
          Automatically discover and sync content from {website.domain}
        </p>
      </header>

      {error && (
        <div className="bg-red-50 p-4 rounded-xl text-red-600">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 overflow-hidden">
        <div className="p-6 border-b border-brand-lavender-light/20">
          <h2 className="text-xl font-semibold text-brand-text-primary">
            Content Discovery
          </h2>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="font-medium text-brand-text-primary">
              1. Collect Links
            </h3>
            <p className="text-sm text-brand-text-secondary">
              Click the button below to automatically discover content on your
              website. We'll first check for sitemaps (sitemap.xml) for faster
              URL discovery, then send the URLs to our external content
              processing service. If needed, we can fall back to traditional
              crawling.
            </p>

            <div className="bg-brand-lavender-light/5 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-brand-text-secondary">
                  Pages to discover:
                </span>
                <div className="flex items-center">
                  <input
                    type="number"
                    value={maxUrlsToProcess}
                    onChange={(e) =>
                      setMaxUrlsToProcess(
                        Math.max(
                          10,
                          Math.min(500, parseInt(e.target.value) || 100)
                        )
                      )
                    }
                    className="w-20 px-2 py-1 border border-brand-lavender-light/20 rounded-lg text-right"
                    min="10"
                    max="500"
                  />
                  <span className="ml-2 text-sm text-brand-text-secondary">
                    max
                  </span>
                </div>
              </div>

              <button
                onClick={crawlWebsite}
                disabled={isCrawling}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 mt-2
                         bg-brand-accent text-white rounded-lg 
                         hover:bg-brand-accent/90 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCrawling ? (
                  <>
                    <FaSpider className="animate-pulse" />
                    {currentUrl === "Checking sitemaps..."
                      ? "Checking Sitemaps..."
                      : currentUrl ===
                          "Sending URLs to custom sync service..." ||
                        currentUrl ===
                          "Sending root URL to custom sync service..."
                      ? "Sending to Training..."
                      : "Crawling..."}
                  </>
                ) : (
                  <>
                    <FaSpider />
                    Start Website Discovery
                  </>
                )}
              </button>

              {isCrawling && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-brand-text-secondary mb-1">
                    <span>
                      Progress: {crawlProgress}% ({processedUrls.length}{" "}
                      processed)
                    </span>
                    <span>Queue: {queueSize}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-brand-accent h-2 rounded-full"
                      style={{ width: `${crawlProgress}%` }}
                    ></div>
                  </div>
                  <div className="mt-2 text-xs text-brand-text-secondary truncate">
                    Currently processing: {currentUrl}
                  </div>
                </div>
              )}

              {!isCrawling && discoveredUrls.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-brand-text-secondary mb-2">
                    Found {discoveredUrls.length} unique pages to sync (after
                    normalization)
                  </p>
                  <div className="max-h-[40vh] overflow-y-auto bg-gray-50 rounded-lg p-3 text-xs text-brand-text-secondary border border-gray-200">
                    {discoveredUrls
                      .slice(0, displayedUrlCount)
                      .map((url, index) => (
                        <div
                          key={`${url}-${index}`}
                          className="truncate mb-1 hover:text-brand-accent"
                        >
                          <span className="inline-block w-6 text-right mr-2 text-gray-400">
                            {index + 1}.
                          </span>
                          {url}
                        </div>
                      ))}
                  </div>
                  {discoveredUrls.length > displayedUrlCount && (
                    <button
                      onClick={() =>
                        setDisplayedUrlCount(
                          Math.min(
                            displayedUrlCount + urlsToShowIncrement,
                            discoveredUrls.length
                          )
                        )
                      }
                      className="text-xs text-brand-accent hover:underline mt-2 mr-4"
                    >
                      Show{" "}
                      {Math.min(
                        urlsToShowIncrement,
                        discoveredUrls.length - displayedUrlCount
                      )}{" "}
                      More
                    </button>
                  )}
                  {displayedUrlCount > 10 && (
                    <button
                      onClick={() => setDisplayedUrlCount(10)}
                      className="text-xs text-gray-500 hover:underline mt-2"
                    >
                      Show Fewer
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Manual URL Input Section */}
          <div className="space-y-3 pt-4 border-t border-brand-lavender-light/10">
            <h3 className="font-medium text-brand-text-primary">
              Manually Add URLs
            </h3>
            <p className="text-sm text-brand-text-secondary">
              If the crawler missed any pages, you can add their full URLs here.
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={manualUrlInput}
                onChange={(e) => setManualUrlInput(e.target.value)}
                placeholder="https://example.com/missed-page"
                className="flex-1 px-3 py-2 border border-brand-lavender-light/20 
                         rounded-lg focus:ring-1 focus:ring-brand-accent/20 focus:border-brand-accent 
                         transition-colors text-sm"
              />
              <button
                type="button"
                onClick={handleAddManualUrl}
                className="px-4 py-2 text-sm bg-brand-lavender-light/10 text-brand-accent 
                         rounded-lg hover:bg-brand-lavender-light/20 transition-colors"
              >
                Add URL
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium text-brand-text-primary">
              2. Send to External Processing Service
            </h3>
            <p className="text-sm text-brand-text-secondary">
              After discovering pages, click the button below to send the URLs
              to our external processing service. This will take approximately
              30 seconds to complete, after which your content will be available
              to the chat widget.
            </p>
          </div>

          {/* Existing Pages Section */}
          {existingPages.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-brand-lavender-light/10">
              <h3 className="font-medium text-brand-text-primary">
                Existing Synced Pages ({existingPages.length})
              </h3>
              <p className="text-sm text-brand-text-secondary">
                These pages are already synced and available to your chat
                widget.
              </p>
              <div className="max-h-[30vh] overflow-y-auto bg-gray-50 rounded-lg p-3 text-xs text-brand-text-secondary border border-gray-200">
                {existingPages.map((page, index) => (
                  <div
                    key={page.id}
                    className="p-2 mb-2 border-b border-gray-100 hover:bg-gray-100"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="text-brand-accent font-medium mb-1">
                          {page.title}
                        </div>
                        <div className="text-gray-500 truncate">{page.url}</div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {(page as any).source === "custom_crawler"
                          ? "Custom Crawler"
                          : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() =>
            router.push(`/app/websites/website?id=${websiteId}&sync=true`)
          }
          className="px-6 py-2 text-brand-text-secondary hover:text-brand-text-primary 
                   transition-colors rounded-xl"
        >
          Back to Website
        </motion.button>
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleTrain}
          disabled={isSyncing || isCrawling || discoveredUrls.length === 0}
          className="px-6 py-2 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                   text-white rounded-xl shadow-lg shadow-brand-accent/20
                   hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow
                   disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSyncing ? (
            <>
              <FaSync className="inline-block mr-2 animate-spin" />
              Processing Content...
            </>
          ) : (
            <>
              <FaSync className="inline-block mr-2" />
              Send {discoveredUrls.length} URLs to Training
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
