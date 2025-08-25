export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { URL } from "url";

export async function GET(request: NextRequest) {
  try {
    // Get URL parameter
    const url = request.nextUrl.searchParams.get("url");

    console.log("doing: loading website for preview", url);

    // Validate parameters
    if (!url) {
      return NextResponse.json(
        { error: "Missing URL parameter" },
        { status: 400 }
      );
    }

    let fullUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      fullUrl = "https://" + url;
    }

    // Parse the URL to get base URL for relative paths
    const parsedUrl = new URL(fullUrl);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    // Fetch the target website
    const response = await fetch(fullUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch website: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the HTML content
    let html = await response.text();

    // Use Cheerio to parse and modify the HTML
    const $ = cheerio.load(html);

    // Fix relative URLs in src and href attributes
    // Special attention to images and logo files
    $("[src]").each((_, element) => {
      const src = $(element).attr("src");
      if (
        src &&
        !src.startsWith("http") &&
        !src.startsWith("//") &&
        !src.startsWith("data:")
      ) {
        let newSrc = "";
        if (src.startsWith("/")) {
          newSrc = `${baseUrl}${src}`;
        } else {
          newSrc = `${baseUrl}/${src}`;
        }
        $(element).attr("src", newSrc);

        // Log important image fixes for debugging
        if (
          $(element).is("img") &&
          (src.includes("logo") || $(element).attr("alt")?.includes("logo"))
        ) {
          console.log(`Fixed logo image: ${src} → ${newSrc}`);
        }
      }
    });

    // Handle images inside anchor tags specially
    $("a img").each((_, element) => {
      const src = $(element).attr("src");
      if (
        src &&
        !src.startsWith("http") &&
        !src.startsWith("//") &&
        !src.startsWith("data:")
      ) {
        let newSrc = "";
        if (src.startsWith("/")) {
          newSrc = `${baseUrl}${src}`;
        } else {
          newSrc = `${baseUrl}/${src}`;
        }
        $(element).attr("src", newSrc);
        console.log(`Fixed image in anchor: ${src} → ${newSrc}`);
      }
    });

    // Handle background images in style attributes
    $("[style]").each((_, element) => {
      const style = $(element).attr("style");
      if (style && style.includes("url(")) {
        const urlRegex = /url\(['"]?([^'")\s]+)['"]?\)/g;
        let match;
        let newStyle = style;

        while ((match = urlRegex.exec(style)) !== null) {
          const url = match[1];
          if (
            !url.startsWith("http") &&
            !url.startsWith("//") &&
            !url.startsWith("data:")
          ) {
            let newUrl = "";
            if (url.startsWith("/")) {
              newUrl = `${baseUrl}${url}`;
            } else {
              newUrl = `${baseUrl}/${url}`;
            }
            newStyle = newStyle.replace(url, newUrl);
            console.log(`Fixed background image: ${url} → ${newUrl}`);
          }
        }

        $(element).attr("style", newStyle);
      }
    });

    // Process and disable all links
    $("a").each((_, element) => {
      // First, fix relative URLs for display purposes
      const href = $(element).attr("href");
      if (
        href &&
        !href.startsWith("http") &&
        !href.startsWith("//") &&
        !href.startsWith("#")
      ) {
        if (href.startsWith("/")) {
          $(element).attr("href", `${baseUrl}${href}`);
        } else {
          $(element).attr("href", `${baseUrl}/${href}`);
        }
      }

      // Store the original URL in a data attribute for reference
      $(element).attr("data-original-href", href || "");

      // Disable link navigation by setting href to javascript:void(0)
      $(element).attr("href", "javascript:void(0)");

      // Add styles to show it's a link but can't be clicked
      $(element).css("pointer-events", "none");
      $(element).css("cursor", "default");

      // Add a title explaining why it's disabled
      $(element).attr("title", "Link navigation is disabled in preview mode");
    });

    // Fix base tag or add one if it doesn't exist
    const baseTag = $("base");
    if (baseTag.length > 0) {
      baseTag.attr("href", baseUrl);
    } else {
      $("head").prepend(`<base href="${baseUrl}/">`);
    }

    // Fix favicon links
    $(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
    ).each((_, element) => {
      const href = $(element).attr("href");
      if (
        href &&
        !href.startsWith("http") &&
        !href.startsWith("//") &&
        !href.startsWith("data:")
      ) {
        let newHref = "";
        if (href.startsWith("/")) {
          newHref = `${baseUrl}${href}`;
        } else {
          newHref = `${baseUrl}/${href}`;
        }
        $(element).attr("href", newHref);
        console.log(`Fixed favicon: ${href} → ${newHref}`);
      }
    });

    // Handle Content Security Policy to allow resources
    $('meta[http-equiv="Content-Security-Policy"]').remove();

    // Allow image loading from all sources
    $("head").append(
      "<meta http-equiv=\"Content-Security-Policy\" content=\"img-src * data:; default-src *; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *;\">"
    );

    // Add viewport meta tag if it doesn't exist to help with scaling
    if ($("meta[name=viewport]").length === 0) {
      $("head").append(
        '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">'
      );
    } else {
      // Modify existing viewport tag
      $("meta[name=viewport]").attr(
        "content",
        "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
      );
    }

    // Create the Voicero script to inject with zoom adjustment
    const voiceroScript = `
    <script>
      // Auto-adjust zoom level for better fit in iframe
      document.documentElement.style.zoom = "85%";
      document.body.style.transformOrigin = "top left";
      document.body.style.transform = "scale(0.85)";
      document.body.style.width = "118%";
    </script>
    <script
      src="https://voicero-text-frontend.vercel.app/widget.js"
      data-token="33f83f3ff4ec25585718df2716c8a81956f8244a50dc92bb87b59cdbf9a80e04" 
      data-config='{}'
      onload="console.log('VoiceroAI: Text widget loaded successfully')"
      defer
      onerror="console.error('VoiceroAI: Failed to load text widget')">
    </script>
    
    <script>
      // Disable all links and form submissions
      document.addEventListener('DOMContentLoaded', function() {
        // Prevent all link clicks
        document.addEventListener('click', function(e) {
          if (e.target.tagName === 'A' || e.target.closest('a')) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Link click prevented in preview mode');
            return false;
          }
        }, true);
        
        // Prevent all form submissions
        document.addEventListener('submit', function(e) {
          e.preventDefault();
          e.stopPropagation();
          console.log('Form submission prevented in preview mode');
          return false;
        }, true);
        
        // Add notification about disabled navigation
        var notificationDiv = document.createElement('div');
        notificationDiv.style.position = 'fixed';
        notificationDiv.style.bottom = '10px';
        notificationDiv.style.left = '50%';
        notificationDiv.style.transform = 'translateX(-50%)';
        notificationDiv.style.padding = '8px 16px';
        notificationDiv.style.background = 'rgba(0,0,0,0.7)';
        notificationDiv.style.color = 'white';
        notificationDiv.style.borderRadius = '4px';
        notificationDiv.style.fontSize = '12px';
        notificationDiv.style.zIndex = '999999';
        notificationDiv.style.display = 'none';
        notificationDiv.textContent = 'Navigation is disabled in preview mode';
        
        document.body.appendChild(notificationDiv);
        
        // Show notification when attempting to navigate
        document.addEventListener('click', function(e) {
          if (e.target.tagName === 'A' || e.target.closest('a') || e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            notificationDiv.style.display = 'block';
            setTimeout(function() {
              notificationDiv.style.display = 'none';
            }, 2000);
          }
        }, true);
      });
    </script>
    `;

    // Inject the script before the closing body tag
    $("body").append(voiceroScript);

    // Get the modified HTML
    const modifiedHtml = $.html();

    // Create response with the modified HTML
    const newResponse = new NextResponse(modifiedHtml);

    // Set content type and other needed headers
    newResponse.headers.set("Content-Type", "text/html; charset=utf-8");

    // Add CORS headers to allow embedding in iframe
    newResponse.headers.set("Access-Control-Allow-Origin", "*");

    // Allow iframe embedding
    newResponse.headers.delete("X-Frame-Options");

    console.log("done: website loaded and script injected");

    return newResponse;
  } catch (error) {
    console.error("Website preview error:", error);
    return NextResponse.json(
      { error: "Failed to load website preview" },
      { status: 500 }
    );
  }
}
