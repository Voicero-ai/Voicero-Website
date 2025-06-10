import * as cheerio from "cheerio";
import axios from "axios";

interface ExtractedContent {
  title: string;
  content: string;
  html: string;
}

/**
 * Extracts content from a given URL
 * @param url URL to extract content from
 * @returns Object containing title, content text, and HTML
 */
export async function extractContentFromUrl(
  url: string
): Promise<ExtractedContent> {
  try {
    // Fetch the HTML from the URL
    const response = await axios.get(url);
    const html = response.data;

    // Load the HTML into cheerio
    const $ = cheerio.load(html);

    // Extract the title
    const title = $("title").text() || "";

    // Remove script tags, style tags, and other non-content elements
    $(
      "script, style, nav, footer, header, aside, iframe, .cookie-banner, .ads, .navigation"
    ).remove();

    // Extract the main content from the body
    // We try to find the main content container first, if it exists
    let contentElement =
      $("main") ||
      $("article") ||
      $('[role="main"]') ||
      $('[id*="content"]') ||
      $('[class*="content"]');

    // If no specific content element was found, use the body
    if (!contentElement.length) {
      contentElement = $("body");
    }

    // Extract text content, preserving paragraph boundaries
    const paragraphs = contentElement
      .find("p, h1, h2, h3, h4, h5, h6, li")
      .map((_, element) => {
        const text = $(element).text().trim();
        return text.length > 0 ? text : null;
      })
      .get()
      .filter(Boolean);

    // Join paragraphs with line breaks for content
    const content = paragraphs.join("\n\n");

    // For HTML, just get the innerHTML of the content element
    const contentHtml = contentElement.html() || "";

    return {
      title,
      content,
      html: contentHtml,
    };
  } catch (error) {
    console.error(`Error extracting content from ${url}:`, error);
    return {
      title: "",
      content: `Failed to extract content from ${url}`,
      html: "",
    };
  }
}
