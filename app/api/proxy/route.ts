import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import axios from "axios";
import puppeteer from "puppeteer";

async function getBrowser() {
  // TODO: Implement browser caching/reuse logic if needed for performance
  return await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function GET(req: NextRequest) {
  let browser = null;
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get URL and renderJS flag
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    const renderJS = searchParams.get("renderJS") === "true";

    if (!url) {
      return NextResponse.json(
        { error: "Missing URL parameter" },
        { status: 400 }
      );
    }

    // --- URL validation and protocol check ---
    try {
      new URL(url);
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return NextResponse.json(
        { error: "Only HTTP and HTTPS protocols are supported" },
        { status: 400 }
      );
    }
    // --- End validation ---

    let htmlContent = "";
    let finalUrl = url;
    let contentType = "";

    if (renderJS) {
      // --- Use Puppeteer for JS rendering ---
      console.log(`[PROXY - Puppeteer] Rendering JS for: ${url}`);
      browser = await getBrowser();
      const page = await browser.newPage();

      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      );

      try {
        console.log(`[PUPPETEER] Navigating to ${url}`);
        const response = await page.goto(url, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        console.log(
          `[PUPPETEER] Initial load complete for ${url}. Waiting for JS...`
        );
        await new Promise((resolve) => setTimeout(resolve, 4000)); // Increased wait to 5 seconds

        if (!response || !response.ok()) {
          const status = response?.status() || 500;
          console.error(`[PUPPETEER] Initial load failed: Status ${status}`);
          throw new Error(`Puppeteer failed to load page: Status ${status}`);
        }

        finalUrl = page.url();
        htmlContent = await page.content();
        contentType = response.headers()["content-type"] || "text/html";

        console.log(
          `[PUPPETEER] Extracted content after hover simulation for ${url}`
        );

        // Log HTML (optional - can be large)
        // console.log(`---------- Puppeteer HTML Content AFTER HOVER for ${url} ----------`);
        // console.log(htmlContent);
        // console.log(`---------- End Puppeteer HTML Content AFTER HOVER for ${url} ----------`);
      } finally {
        if (page) await page.close();
        if (browser) {
          await browser.close();
          browser = null;
        }
      }
      // --- End Puppeteer ---
    } else {
      // --- Use Axios for static HTML fetching ---
      console.log(`[PROXY - Axios] Fetching: ${url}`);
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      };

      try {
        const response = await axios.get(url, {
          headers,
          timeout: 15000,
          maxRedirects: 5,
          validateStatus: (status) => status < 400,
        });
        htmlContent = response.data;
        contentType = response.headers["content-type"] || "";
      } catch (axiosError: any) {
        console.error(
          `[PROXY - Axios FAIL] Failed to fetch ${url}:`,
          axiosError.message
        );
        // Handle specific error cases
        if (axiosError.code === "ECONNABORTED") {
          return NextResponse.json(
            { error: "Request timed out" },
            { status: 504 }
          );
        } else if (axiosError.code === "ECONNREFUSED") {
          return NextResponse.json(
            { error: "Connection refused" },
            { status: 502 }
          );
        } else if (axiosError.response) {
          return NextResponse.json(
            {
              error: `Server responded with ${axiosError.response.status}: ${axiosError.response.statusText}`,
            },
            { status: axiosError.response.status }
          );
        } else if (axiosError.request) {
          return NextResponse.json(
            { error: "No response received from server" },
            { status: 502 }
          );
        } else {
          throw axiosError;
        }
      }
      // --- End Axios ---
    }

    // Check content type after fetching
    const isSitemap =
      searchParams.get("allowXml") === "true" || finalUrl.includes("sitemap");

    if (!contentType.includes("text/html") && !isSitemap) {
      // For regular content requests, we only want HTML
      console.warn(
        `[PROXY] Content type mismatch for ${finalUrl}: ${contentType}`
      );
      return NextResponse.json(
        { error: `Content is not HTML (${contentType})` },
        { status: 415 }
      );
    }

    // Accept XML content for sitemaps
    if (
      isSitemap &&
      (contentType.includes("application/xml") ||
        contentType.includes("text/xml"))
    ) {
      console.log(`[PROXY] Processing sitemap XML: ${finalUrl}`);
      // Continue processing for XML sitemaps
    }

    // Return the HTML content
    return new NextResponse(htmlContent, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error: any) {
    console.error("[PROXY FATAL] Error:", error.message);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error("Error closing browser on fatal:", e);
      }
    }
    return NextResponse.json(
      { error: "Internal server error: " + error.message },
      { status: 500 }
    );
  }
}
