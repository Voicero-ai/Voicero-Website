import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

interface Message {
  id: string;
  createdAt: Date;
  content: string;
  type: string | null;
  threadId: string;
  role: string;
  pageUrl: string | null;
  scrollToText: string | null;
}

interface Thread {
  id: string;
  messages: Message[];
}

interface Website {
  id: string;
  url: string;
  name: string | null;
  type: string;
  customType: string;
  plan: string;
  active: boolean;
  monthlyQueries: number;
  queryLimit: number;
  lastSyncedAt: Date | null;
  customInstructions: string | null;
  color: string | null;
  botName: string | null;
  customWelcomeMessage: string | null;
  iconBot: string | null;
  iconVoice: string | null;
  iconMessage: string | null;
  clickMessage: string | null;
  removeHighlight: boolean | null;
  aiThreads: Thread[];
  accessKeys: Array<{ key: string }>;
  popUpQuestions: Array<{
    id: string;
    question: string;
    createdAt: Date;
  }>;
  userId: string;
  allowAutoCancel: boolean | null;
  allowAutoReturn: boolean | null;
  allowAutoExchange: boolean | null;
  allowAutoClick: boolean | null;
  allowAutoScroll: boolean | null;
  allowAutoHighlight: boolean | null;
  allowAutoRedirect: boolean | null;
  allowAutoGetUserOrders: boolean | null;
  allowAutoUpdateUserInfo: boolean | null;
  allowAutoFillForm: boolean | null;
  allowAutoTrackOrder: boolean | null;
  allowAutoLogout: boolean | null;
  allowAutoLogin: boolean | null;
  allowAutoGenerateImage: boolean | null;
  allowMultiAIReview: boolean | null;
}

export async function GET(request: NextRequest) {
  try {
    console.time("website-get-route");

    // Extract query parameters
    const { searchParams } = new URL(request.url);
    const providedWebsiteId = searchParams.get("id");
    const minimalMode = searchParams.get("minimal") === "true";

    // Get authentication info
    const { userId, websiteId, authError } = await authenticateRequest(
      request,
      providedWebsiteId
    );
    if (authError) {
      return authError;
    }

    // Verify website ownership
    const ownershipCheck = await checkWebsiteOwnership(userId, websiteId);
    if (ownershipCheck.error) {
      return ownershipCheck.error;
    }

    // Fetch website data
    const { website, aiThreads } = await fetchWebsiteData(websiteId);
    if (!website) {
      return NextResponse.json(
        { error: "Website not found." },
        { status: 404 }
      );
    }

    // Initialize stat tracking
    const stats = initializeStats();

    // Filter out empty threads that have no messages
    const validThreads = aiThreads.filter(
      (thread) => thread.messages.length > 0
    );

    // Get accurate count of valid threads with actual messages
    const validThreadCount = validThreads.length;
    console.log(
      `Found ${
        aiThreads.length - validThreadCount
      } empty threads that will be filtered out`
    );
    console.log(
      `Valid thread count: ${validThreadCount}, Current monthlyQueries: ${website.monthlyQueries}`
    );

    // Process threads and calculate stats
    processThreadsAndMessages(validThreads, stats);

    // Fetch and process content based on website type
    const content = await fetchWebsiteContent(website, stats);

    // Build the response
    const responseData = buildResponseData(website, stats, content);

    console.timeEnd("website-get-route");
    return NextResponse.json(responseData, { status: 200 });
  } catch (err) {
    console.error("Failed to retrieve website data:", err);
    const errorMessage =
      err instanceof Error ? `${err.name}: ${err.message}` : "Unknown error";
    console.error("Error details:", errorMessage);

    if (err instanceof Error && err.stack) {
      console.error("Stack trace:", err.stack);
    }

    return NextResponse.json(
      { error: "Internal server error", details: errorMessage },
      { status: 500 }
    );
  }
}

// Helper Functions

async function authenticateRequest(
  request: NextRequest,
  providedWebsiteId: string | null
) {
  let userId = null;
  let websiteId = providedWebsiteId;

  // Try session-based auth first
  const session = await getServerSession(authOptions);
  if (session?.user?.email) {
    const users = (await query(`SELECT id FROM User WHERE email = ? LIMIT 1`, [
      session.user.email,
    ])) as { id: string }[];
    if (users.length > 0) {
      userId = users[0].id;
    }
  }

  // Fall back to API key auth if session auth fails
  if (!userId) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const accessKey = authHeader.substring(7);
      const websiteByKeyRows = (await query(
        `SELECT w.id, w.userId
         FROM Website w
         JOIN AccessKey ak ON ak.websiteId = w.id
         WHERE ak.key = ?
         LIMIT 1`,
        [accessKey]
      )) as { id: string; userId: string }[];
      const websiteByKey =
        websiteByKeyRows.length > 0 ? websiteByKeyRows[0] : null;

      if (websiteByKey) {
        userId = websiteByKey.userId;
        if (!websiteId) {
          websiteId = websiteByKey.id;
        }
      }
    }
  }

  // Return error if auth failed
  if (!userId) {
    return {
      userId: null,
      websiteId: null,
      authError: NextResponse.json(
        { error: "Unauthorized. Please log in or provide a valid access key." },
        { status: 401 }
      ),
    };
  }

  // Return error if no website ID was found
  if (!websiteId) {
    return {
      userId: null,
      websiteId: null,
      authError: NextResponse.json(
        {
          error: "No website ID provided and no website found for access key.",
        },
        { status: 400 }
      ),
    };
  }

  return { userId, websiteId, authError: null };
}

async function checkWebsiteOwnership(userId: string, websiteId: string) {
  const ownershipRows = (await query(
    `SELECT id FROM Website WHERE id = ? AND userId = ? LIMIT 1`,
    [websiteId, userId]
  )) as { id: string }[];
  const websiteOwnership = ownershipRows.length > 0 ? ownershipRows[0] : null;

  if (!websiteOwnership) {
    console.log(
      `Unauthorized website access attempt: User ID ${userId} trying to access website ID ${websiteId}`
    );
    return {
      error: NextResponse.json(
        { error: "Unauthorized. You don't have access to this website." },
        { status: 403 }
      ),
    };
  }

  return { error: null };
}

async function fetchWebsiteData(websiteId: string) {
  // Fetch basic website data
  const websiteRows = (await query(
    `SELECT id, url, name, type, customType, plan, active, monthlyQueries,
            queryLimit, lastSyncedAt, customInstructions, color, botName,
            customWelcomeMessage, iconBot, iconVoice, iconMessage, clickMessage,
            removeHighlight, userId, allowAutoCancel, allowAutoReturn,
            allowAutoExchange, allowAutoClick, allowAutoScroll, allowAutoHighlight,
            allowAutoRedirect, allowAutoGetUserOrders, allowAutoUpdateUserInfo,
            allowAutoFillForm, allowAutoTrackOrder, allowAutoLogout, allowAutoLogin,
            allowAutoGenerateImage, allowMultiAIReview
     FROM Website WHERE id = ? LIMIT 1`,
    [websiteId]
  )) as any[];
  const baseWebsite = websiteRows.length > 0 ? websiteRows[0] : null;

  if (!baseWebsite) {
    return { website: null, aiThreads: [] as Thread[] };
  }

  // Access key (latest)
  const accessKeyRows = (await query(
    `SELECT \`key\`, createdAt FROM AccessKey WHERE websiteId = ? ORDER BY createdAt DESC LIMIT 1`,
    [websiteId]
  )) as { key: string; createdAt: Date }[];
  const accessKeys = accessKeyRows.map((r) => ({ key: r.key }));

  // Pop up questions
  const popUpRows = (await query(
    `SELECT id, question, createdAt FROM PopUpQuestion WHERE websiteId = ? ORDER BY createdAt DESC`,
    [websiteId]
  )) as { id: string; question: string; createdAt: Date }[];
  const popUpQuestions = popUpRows.map((r) => ({
    id: r.id,
    question: r.question,
    createdAt: new Date(r.createdAt),
  }));

  const website = {
    ...baseWebsite,
    active: !!baseWebsite.active,
    removeHighlight: !!baseWebsite.removeHighlight,
    allowAutoCancel: !!baseWebsite.allowAutoCancel,
    allowAutoReturn: !!baseWebsite.allowAutoReturn,
    allowAutoExchange: !!baseWebsite.allowAutoExchange,
    allowAutoClick: !!baseWebsite.allowAutoClick,
    allowAutoScroll: !!baseWebsite.allowAutoScroll,
    allowAutoHighlight: !!baseWebsite.allowAutoHighlight,
    allowAutoRedirect: !!baseWebsite.allowAutoRedirect,
    allowAutoGetUserOrders: !!baseWebsite.allowAutoGetUserOrders,
    allowAutoUpdateUserInfo: !!baseWebsite.allowAutoUpdateUserInfo,
    allowAutoFillForm: !!baseWebsite.allowAutoFillForm,
    allowAutoTrackOrder: !!baseWebsite.allowAutoTrackOrder,
    allowAutoLogout: !!baseWebsite.allowAutoLogout,
    allowAutoLogin: !!baseWebsite.allowAutoLogin,
    allowAutoGenerateImage: !!baseWebsite.allowAutoGenerateImage,
    allowMultiAIReview: !!baseWebsite.allowMultiAIReview,
    lastSyncedAt: baseWebsite.lastSyncedAt
      ? new Date(baseWebsite.lastSyncedAt)
      : null,
    accessKeys,
    popUpQuestions,
  } as any;

  // Fetch threads separately
  const threadRows = (await query(
    `SELECT id FROM AiThread WHERE websiteId = ? ORDER BY createdAt DESC`,
    [websiteId]
  )) as { id: string }[];

  const aiThreads: Thread[] = [];
  for (const t of threadRows) {
    const messageRows = (await query(
      `SELECT id, createdAt, content, type, threadId, role, pageUrl, scrollToText
       FROM AiMessage WHERE threadId = ? ORDER BY createdAt ASC`,
      [t.id]
    )) as any[];
    const messages: Message[] = messageRows.map((m) => ({
      id: m.id,
      createdAt: new Date(m.createdAt),
      content: m.content,
      type: m.type ?? null,
      threadId: m.threadId,
      role: m.role,
      pageUrl: m.pageUrl ?? null,
      scrollToText: m.scrollToText ?? null,
    }));
    aiThreads.push({ id: t.id, messages });
  }

  return { website, aiThreads };
}

function initializeStats() {
  return {
    redirectMaps: {
      productRedirects: new Map<string, number>(),
      collectionRedirects: new Map<string, number>(),
      blogRedirects: new Map<string, number>(),
      pageRedirects: new Map<string, number>(),
      urlRedirectCounts: new Map<string, number>(),
    },
    globalStats: {
      totalAiRedirects: 0,
      totalVoiceChats: 0,
      totalTextChats: 0,
      totalAiScrolls: 0,
      totalAiPurchases: 0,
      totalAiClicks: 0,
    },
  };
}

function processThreadsAndMessages(aiThreads: Thread[], stats: any) {
  const { redirectMaps, globalStats } = stats;

  // Reset counters to ensure they're accurate
  globalStats.totalVoiceChats = 0;
  globalStats.totalTextChats = 0;

  aiThreads.forEach((thread: Thread) => {
    let hasVoiceMessage = false;
    let hasTextMessage = false;
    let hasUserMessage = false;

    // Skip empty threads entirely
    if (thread.messages.length === 0) {
      console.log(`Empty thread found: ${thread.id}`);
      return;
    }

    thread.messages.forEach((message: Message) => {
      // Process user messages for voice/text stats
      if (message.role === "user") {
        hasUserMessage = true;
        if (message.type === "voice") hasVoiceMessage = true;
        if (message.type === "text" || !message.type) hasTextMessage = true;
      }

      // Process assistant messages for actions and redirects
      if (message.role === "assistant") {
        processAssistantMessage(message, redirectMaps, globalStats);
      }
    });

    // Only count threads that have at least one user message
    if (hasUserMessage) {
      // Update global stats for the thread
      if (hasVoiceMessage) globalStats.totalVoiceChats++;
      if (hasTextMessage) globalStats.totalTextChats++;
    }
  });
}

function normalizeUrl(url: string) {
  try {
    let normalized = url;
    if (url.startsWith("http")) {
      const urlObj = new URL(url);
      normalized = urlObj.pathname;
    }
    // Remove trailing slash and period
    normalized = normalized.replace(/[\/\.]$/, "");
    // Ensure leading slash
    if (!normalized.startsWith("/")) {
      normalized = "/" + normalized;
    }
    return normalized;
  } catch (e) {
    console.error("Error normalizing URL:", url, e);
    return url;
  }
}

function processAssistantMessage(
  message: Message,
  redirectMaps: any,
  globalStats: any
) {
  const {
    productRedirects,
    collectionRedirects,
    blogRedirects,
    pageRedirects,
    urlRedirectCounts,
  } = redirectMaps;

  // Helper function to count redirects by content type
  const countRedirectByType = (normalizedUrl: string) => {
    if (!normalizedUrl || !normalizedUrl.startsWith("/")) return;

    const parts = normalizedUrl.split("/").filter(Boolean);
    if (parts.length >= 2) {
      let type = parts[0];
      let handle = parts[1];

      // Normalize type to handle both singular and plural
      if (["product", "products"].includes(type)) type = "products";
      else if (["collection", "collections"].includes(type))
        type = "collections";
      else if (["blog", "blogs"].includes(type)) type = "blogs";
      else if (["page", "pages"].includes(type)) type = "pages";

      // Normalize handle
      handle = handle.toLowerCase().replace(/[\/.]+$/, "");

      // Count redirects by content type
      switch (type) {
        case "products":
          productRedirects.set(handle, (productRedirects.get(handle) || 0) + 1);
          break;
        case "collections":
          collectionRedirects.set(
            handle,
            (collectionRedirects.get(handle) || 0) + 1
          );
          break;
        case "blogs":
          const blogHandle = parts[parts.length - 1]
            .toLowerCase()
            .replace(/[\/.]+$/, "");
          blogRedirects.set(
            blogHandle,
            (blogRedirects.get(blogHandle) || 0) + 1
          );
          break;
        case "pages":
          pageRedirects.set(handle, (pageRedirects.get(handle) || 0) + 1);
          break;
      }
    }
  };

  // Process pageUrl if exists
  if (message.pageUrl) {
    // Count redirect once per thread rather than once per message
    if (
      !message.threadId ||
      !urlRedirectCounts.has(`thread:${message.threadId}`)
    ) {
      globalStats.totalAiRedirects++;

      // Mark this thread as already counted
      if (message.threadId) {
        urlRedirectCounts.set(`thread:${message.threadId}`, 1);
      }

      const normalizedUrl = normalizeUrl(message.pageUrl);
      urlRedirectCounts.set(
        normalizedUrl,
        (urlRedirectCounts.get(normalizedUrl) || 0) + 1
      );
      countRedirectByType(normalizedUrl);
    }
  }

  // Try to parse content as JSON for structured actions
  try {
    let contentToProcess = message.content;
    if (contentToProcess.includes("```json")) {
      contentToProcess = contentToProcess.replace(/```json\n|\n```/g, "");
    }

    const contentObj = JSON.parse(contentToProcess);

    // Process structured actions
    if (contentObj.action) {
      switch (contentObj.action) {
        case "redirect":
          if (contentObj.action_context?.url) {
            globalStats.totalAiRedirects++;
            const redirectUrl = contentObj.action_context.url;
            const normalizedUrl = normalizeUrl(redirectUrl);
            urlRedirectCounts.set(
              normalizedUrl,
              (urlRedirectCounts.get(normalizedUrl) || 0) + 1
            );
            countRedirectByType(normalizedUrl);
          }
          break;
        case "scroll":
          globalStats.totalAiScrolls++;
          break;
        case "purchase":
          globalStats.totalAiPurchases++;
          break;
        case "click":
          globalStats.totalAiClicks++;
          break;
      }
    }

    // Process legacy redirect formats
    if (contentObj.url || contentObj.redirect_url) {
      globalStats.totalAiRedirects++;
      const redirectUrl = contentObj.url || contentObj.redirect_url;
      const normalizedUrl = normalizeUrl(redirectUrl);
      urlRedirectCounts.set(
        normalizedUrl,
        (urlRedirectCounts.get(normalizedUrl) || 0) + 1
      );
      countRedirectByType(normalizedUrl);
    }
  } catch (e) {
    // If JSON parsing fails, try regex for URLs
    const urlRegex =
      /https?:\/\/[^\s)]+|(?:\/(?:pages|products|blogs|collections)\/[^\s)]+)/g;
    const urls = message.content.match(urlRegex);
    if (urls?.length) {
      urls.forEach((url) => {
        globalStats.totalAiRedirects++;
        const normalizedUrl = normalizeUrl(url);
        urlRedirectCounts.set(
          normalizedUrl,
          (urlRedirectCounts.get(normalizedUrl) || 0) + 1
        );
        countRedirectByType(normalizedUrl);
      });
    }

    // Check for action strings if JSON parsing failed
    if (message.content.includes('"action":"scroll"'))
      globalStats.totalAiScrolls++;
    if (message.content.includes('"action":"purchase"'))
      globalStats.totalAiPurchases++;
    if (message.content.includes('"action":"click"'))
      globalStats.totalAiClicks++;
  }
}

function getRedirectCount(
  url: string,
  website: any,
  urlRedirectCounts: Map<string, number>
) {
  // Normalize by removing trailing slash
  let normalizedUrl = url.replace(/\/$/, "");

  // For Shopify pages, check both with and without /pages/ prefix
  if (website.type === "Shopify") {
    if (
      !normalizedUrl.startsWith("/pages/") &&
      !normalizedUrl.startsWith("/products/") &&
      !normalizedUrl.startsWith("/blogs/")
    ) {
      normalizedUrl = "/pages/" + normalizedUrl;
    }
    // Remove trailing periods
    normalizedUrl = normalizedUrl.replace(/\.$/, "");
  }

  return urlRedirectCounts.get(normalizedUrl) || 0;
}

async function fetchWordPressContent(websiteId: string, stats: any) {
  const { redirectMaps } = stats;
  const { urlRedirectCounts } = redirectMaps;

  // Fetch WordPress Products with relations
  const wpProducts = (await query(
    `SELECT p.*, wpr.review as reviewText, wpr.rating as reviewRating, wpr.verified as reviewVerified,
            wc.name as categoryName, wt.name as tagName, wcf.metaKey, wcf.metaValue
     FROM WordpressProduct p
     LEFT JOIN WordpressReview wpr ON wpr.productId = p.wpId
     LEFT JOIN _WordpressProductToWordpressProductCategory wpc ON wpc.A = p.id
     LEFT JOIN WordpressProductCategory wc ON wc.id = wpc.B
     LEFT JOIN _WordpressProductToWordpressProductTag wpt ON wpt.A = p.id
     LEFT JOIN WordpressProductTag wt ON wt.id = wpt.B
     LEFT JOIN WordpressCustomField wcf ON wcf.wordpressProductId = p.id
     WHERE p.websiteId = ?
     ORDER BY p.updatedAt DESC`,
    [websiteId]
  )) as any[];

  // Fetch WordPress Posts with relations
  const wpPosts = (await query(
    `SELECT p.*, wa.name as authorName
     FROM WordpressPost p
     LEFT JOIN WordpressAuthor wa ON wa.wpId = p.authorId
     WHERE p.websiteId = ?
     ORDER BY p.updatedAt DESC`,
    [websiteId]
  )) as any[];

  // Fetch WordPress Pages
  const wpPages = (await query(
    `SELECT * FROM WordpressPage WHERE websiteId = ? ORDER BY updatedAt DESC`,
    [websiteId]
  )) as any[];

  // Map products
  const products = wpProducts.map((prod: any) => {
    const productUrl = `/products/${prod.slug}`;
    return {
      id: String(prod.id),
      title: prod.name,
      url: productUrl,
      type: "product" as const,
      lastUpdated: prod.updatedAt.toISOString(),
      aiRedirects: redirectMaps.productRedirects.get(prod.slug) || 0,
      description: prod.description,
      price: prod.price,
      regularPrice: prod.regularPrice,
      salePrice: prod.salePrice,
      stockQuantity: prod.stockQuantity,
      categories: prod.categories.map((c: any) => ({ id: c.id, name: c.name })),
      tags: prod.tags.map((t: any) => ({ id: t.id, name: t.name })),
      reviews: prod.reviews.map((r: any) => ({
        id: r.id,
        reviewer: r.reviewer,
        rating: r.rating,
        review: r.review,
        verified: r.verified,
        date: r.date.toISOString(),
      })),
      customFields: prod.customFields.reduce(
        (acc: Record<string, any>, field: any) => ({
          ...acc,
          [field.metaKey]: field.metaValue,
        }),
        {}
      ),
    };
  });

  // Map blog posts
  const blogPosts = wpPosts.map((post: any) => {
    const postUrl = `/${post.slug}`;
    return {
      id: String(post.id),
      title: post.title,
      url: postUrl,
      type: "post" as const,
      lastUpdated: post.updatedAt.toISOString(),
      aiRedirects: redirectMaps.blogRedirects.get(post.slug) || 0,
      content: post.excerpt ?? post.content,
      author: post.author?.name ?? "Unknown",
      categories: post.categories.map((c: any) => ({ id: c.id, name: c.name })),
      tags: post.tags.map((t: any) => ({ id: t.id, name: t.name })),
      comments: post.comments.map((c: any) => ({
        id: c.id,
        author: c.authorName,
        content: c.content,
        date: c.date.toISOString(),
        status: c.status,
        parentId: c.parentId,
      })),
      customFields: post.customFields.reduce(
        (acc: Record<string, any>, field: any) => ({
          ...acc,
          [field.metaKey]: field.metaValue,
        }),
        {}
      ),
    };
  });

  // Map pages
  const pages = wpPages.map((p: any) => {
    const pageUrl = `/${p.slug}`;
    return {
      id: String(p.id),
      title: p.title,
      url: pageUrl,
      type: "page" as const,
      lastUpdated: p.updatedAt.toISOString(),
      aiRedirects: redirectMaps.pageRedirects.get(p.slug) || 0,
      content: p.content,
    };
  });

  return { products, blogPosts, pages, collections: [], discounts: [] };
}

async function fetchShopifyContent(websiteId: string, stats: any) {
  const { redirectMaps } = stats;

  // Fetch collections first since products reference them
  let shopifyCollections: any[] = [];
  try {
    shopifyCollections = (await query(
      `SELECT sc.* FROM ShopifyCollection sc WHERE sc.websiteId = ? ORDER BY sc.createdAt DESC`,
      [websiteId]
    )) as any[];
    // Load collection products
    for (const col of shopifyCollections) {
      const prodRows = (await query(
        `SELECT sp.* FROM ShopifyProduct sp
         JOIN _ShopifyCollectionToShopifyProduct cp ON cp.A = ?
         WHERE sp.id = cp.B AND sp.websiteId = ?`,
        [col.id, websiteId]
      )) as any[];
      col.products = prodRows;
    }
  } catch (error) {
    console.error("Error fetching collection data:", error);
  }

  // Fetch discounts - use try/catch to handle invalid date values
  let shopifyDiscounts: any[] = [];
  try {
    shopifyDiscounts = (await query(
      `SELECT id, title, code, value, type, status, startsAt, endsAt, appliesTo, shopifyId, createdAt
       FROM ShopifyDiscount WHERE websiteId = ?`,
      [websiteId]
    )) as any[];

    // Sort in memory instead of using database ordering
    shopifyDiscounts = shopifyDiscounts.sort((a, b) => {
      // Safely handle dates
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return dateB - dateA; // descending order
    });
  } catch (error) {
    console.error("Error fetching discount data:", error);
    // If all attempts fail, just return an empty array
    shopifyDiscounts = [];
  }

  // Fetch products with relations
  let shopifyProducts: any[] = [];
  try {
    shopifyProducts = (await query(
      `SELECT * FROM ShopifyProduct WHERE websiteId = ?`,
      [websiteId]
    )) as any[];
    // load variants, reviews, images
    for (const p of shopifyProducts) {
      p.variants = (await query(
        `SELECT * FROM ShopifyProductVariant WHERE productId = ?`,
        [p.id]
      )) as any[];
      p.reviews = (await query(
        `SELECT * FROM ShopifyReview WHERE productId = ?`,
        [p.id]
      )) as any[];
      p.images = (await query(
        `SELECT * FROM ShopifyMedia WHERE productId = ?`,
        [p.id]
      )) as any[];
    }

    // Sort in memory instead of using database ordering
    shopifyProducts = shopifyProducts.sort((a, b) => {
      // Safely handle dates
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return dateB - dateA; // descending order
    });
  } catch (error) {
    console.error("Error fetching product data:", error);
    shopifyProducts = []; // If all attempts fail, return empty array
  }

  // Fetch blog posts with comments
  let shopifyBlogs: any[] = [];
  try {
    shopifyBlogs = (await query(
      `SELECT * FROM ShopifyBlog WHERE websiteId = ?`,
      [websiteId]
    )) as any[];
    for (const blog of shopifyBlogs) {
      blog.posts = (await query(
        `SELECT * FROM ShopifyBlogPost WHERE blogId = ? ORDER BY createdAt DESC`,
        [blog.id]
      )) as any[];
      for (const post of blog.posts) {
        post.comments = (await query(
          `SELECT * FROM ShopifyComment WHERE postId = ?`,
          [post.id]
        )) as any[];
      }
    }

    // Sort blog posts in memory
    shopifyBlogs = shopifyBlogs.map((blog) => {
      if (blog.posts && Array.isArray(blog.posts)) {
        blog.posts = blog.posts.sort((a: any, b: any) => {
          // Safely handle dates
          const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
          const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
          return dateB - dateA; // descending order
        });
      }
      return blog;
    });
  } catch (error) {
    console.error("Error fetching blog data:", error);
    shopifyBlogs = []; // If all attempts fail, return empty array
  }

  // Fetch pages - with improved error handling for invalid dates
  let shopifyPages: any[] = [];
  try {
    shopifyPages = (await query(
      `SELECT id, title, handle, content, createdAt, shopifyId
       FROM ShopifyPage WHERE websiteId = ?`,
      [websiteId]
    )) as any[];

    // Sort in memory instead of using database ordering
    shopifyPages = shopifyPages.sort((a, b) => {
      // Safely handle dates
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return dateB - dateA; // descending order
    });
  } catch (error) {
    console.error("Error fetching page data:", error);
    // If all attempts fail, just return an empty array
    shopifyPages = [];
  }

  // Map collections - with date validation
  const collections = shopifyCollections.map((collection) => {
    const collectionUrl = `/collections/${collection.handle}`;
    return {
      id: collection.id,
      title: collection.title || "",
      handle: collection.handle || "",
      description: collection.description,
      image: collection.image,
      ruleSet: collection.ruleSet,
      sortOrder: collection.sortOrder,
      updatedAt: collection.createdAt.toISOString(), // Just use createdAt which should be valid
      createdAt: collection.createdAt.toISOString(),
      products: Array.isArray(collection.products)
        ? collection.products.map((p: any) => ({
            ...p,
            shopifyId: p.shopifyId.toString(),
          }))
        : [],
      aiRedirects:
        redirectMaps.collectionRedirects.get(collection.handle || "") || 0,
      shopifyId: collection.shopifyId.toString(),
    };
  });

  // Map discounts - with date validation
  const discounts = shopifyDiscounts.map((discount) => {
    return {
      id: discount.id,
      title: discount.title,
      code: discount.code,
      value: discount.value,
      type: discount.type,
      status: discount.status,
      startsAt:
        discount.startsAt && isValidDate(discount.startsAt)
          ? discount.startsAt.toISOString()
          : null,
      endsAt:
        discount.endsAt && isValidDate(discount.endsAt)
          ? discount.endsAt.toISOString()
          : null,
      appliesTo: discount.appliesTo,
      shopifyId: discount.shopifyId.toString(),
    };
  });

  // Map products - with date validation
  const products = shopifyProducts.map((prod) => {
    const productUrl = `/products/${prod.handle}`;
    return {
      id: prod.id,
      title: prod.title,
      url: productUrl,
      type: "product" as const,
      lastUpdated: prod.createdAt.toISOString(), // Use createdAt instead of updatedAt
      aiRedirects: redirectMaps.productRedirects.get(prod.handle) || 0,
      description: prod.description,
      vendor: prod.vendor,
      productType: prod.productType,
      price: prod.variants[0]?.price || 0,
      variants: prod.variants.map((v: any) => ({
        id: v.id,
        title: v.title,
        price: v.price,
        sku: v.sku,
        inventory: v.inventory,
      })),
      reviews: prod.reviews.map((r: any) => ({
        id: r.id,
        reviewer: r.reviewer,
        rating: r.rating,
        review: r.body,
        title: r.title,
        verified: r.verified,
        date: r.createdAt.toISOString(),
      })),
      images: prod.images.map((img: any) => ({
        id: img.id,
        url: img.url,
        altText: img.altText,
        caption: img.caption,
      })),
    };
  });

  // Map blog posts - with date validation
  const blogPosts = shopifyBlogs.flatMap((blog) =>
    blog.posts.map((post: any) => {
      const postUrl = `/blogs/${blog.handle}/${post.handle}`;
      return {
        id: post.id,
        title: post.title,
        url: postUrl,
        type: "post" as const,
        lastUpdated: post.createdAt.toISOString(), // Use createdAt instead of updatedAt
        aiRedirects: redirectMaps.blogRedirects.get(post.handle || "") || 0,
        content: post.content,
        author: post.author,
        image: post.image,
        blog: {
          id: blog.id,
          title: blog.title,
          handle: blog.handle,
        },
        comments: post.comments.map((c: any) => ({
          id: c.id,
          author: c.author,
          content: c.body,
          email: c.email,
          status: c.status,
          date: c.createdAt.toISOString(),
        })),
      };
    })
  );

  // Map pages - with date validation
  const pages = shopifyPages.map((p) => {
    const pageUrl = `/pages/${p.handle}`;
    return {
      id: p.id,
      title: p.title,
      url: pageUrl,
      type: "page" as const,
      lastUpdated: p.createdAt.toISOString(), // Use createdAt instead of updatedAt
      aiRedirects: redirectMaps.pageRedirects.get(p.handle) || 0,
      content: p.content,
    };
  });

  return { products, blogPosts, pages, collections, discounts };
}

// Helper function to check if a date is valid
function isValidDate(date: Date): boolean {
  return (
    date instanceof Date &&
    !isNaN(date.getTime()) &&
    date.getMonth() > 0 &&
    date.getDate() > 0
  ); // Month and day must be > 0
}

async function fetchCustomContent(websiteId: string, stats: any) {
  const { redirectMaps } = stats;

  let pages: Array<{
    id: string;
    title: string;
    url: string;
    type: "page";
    lastUpdated: string;
    aiRedirects: number;
    content: string | null;
    htmlContent?: string | null;
    source?: string;
  }> = [];

  try {
    const customPages = (await query(
      `SELECT id, title, url, content, html, updatedAt
       FROM Page
       WHERE websiteId = ?
       ORDER BY updatedAt DESC`,
      [websiteId]
    )) as any[];

    pages = customPages.map((p: any) => {
      const pageUrl = p.url;
      return {
        id: p.id,
        title: p.title,
        url: pageUrl,
        type: "page" as const,
        lastUpdated: new Date(p.updatedAt).toISOString(),
        aiRedirects:
          redirectMaps.pageRedirects.get(String(p.url).replace(/^\//, "")) || 0,
        content: p.content,
        htmlContent: p.html,
        source: "custom_crawler",
      };
    });
  } catch (error) {
    console.error("Error fetching custom pages:", error);
  }

  return { products: [], blogPosts: [], pages, collections: [], discounts: [] };
}

async function fetchWebsiteContent(website: any, stats: any) {
  let content;

  switch (website.type) {
    case "WordPress":
      content = await fetchWordPressContent(website.id, stats);
      break;
    case "Shopify":
      content = await fetchShopifyContent(website.id, stats);
      break;
    case "Custom":
      content = await fetchCustomContent(website.id, stats);
      break;
    default:
      throw new Error(`Unsupported website type: ${website.type}`);
  }

  // Check for additional custom pages regardless of website type
  if (website.type !== "Custom") {
    try {
      const additionalPages = await fetchCustomContent(website.id, stats);
      content.pages = [...content.pages, ...additionalPages.pages];
    } catch (error) {
      console.error("Error fetching additional custom pages:", error);
    }
  }

  return content;
}

function buildResponseData(website: any, stats: any, content: any) {
  const { globalStats, redirectMaps } = stats;

  // Log statistics discrepancy for debugging
  if (
    globalStats.totalTextChats + globalStats.totalVoiceChats !==
    website.monthlyQueries
  ) {
    console.log(`Statistics discrepancy detected for website ${website.id}:`);
    console.log(`Monthly queries: ${website.monthlyQueries}`);
    console.log(`Total text chats: ${globalStats.totalTextChats}`);
    console.log(`Total voice chats: ${globalStats.totalVoiceChats}`);
    console.log(
      `Combined chats: ${
        globalStats.totalTextChats + globalStats.totalVoiceChats
      }`
    );
  }

  return {
    id: website.id,
    domain: website.url,
    type: website.type,
    customType: website.customType || "",
    plan: website.plan,
    name: website.name || website.url,
    active: website.active,
    status: website.active ? "active" : "inactive",
    monthlyQueries: website.monthlyQueries,
    queryLimit: website.queryLimit,
    lastSync: website.lastSyncedAt ? website.lastSyncedAt.toISOString() : null,
    accessKey: website.accessKeys[0]?.key || null,
    color: website.color || "#6366F1", // Default color
    botName: website.botName,
    customWelcomeMessage: website.customWelcomeMessage,
    iconBot: website.iconBot,
    iconVoice: website.iconVoice,
    iconMessage: website.iconMessage,
    clickMessage: website.clickMessage,
    customInstructions: website.customInstructions,
    removeHighlight: website.removeHighlight,
    allowAutoCancel: website.allowAutoCancel,
    allowAutoReturn: website.allowAutoReturn,
    allowAutoExchange: website.allowAutoExchange,
    allowAutoClick: website.allowAutoClick,
    allowAutoScroll: website.allowAutoScroll,
    allowAutoHighlight: website.allowAutoHighlight,
    allowAutoRedirect: website.allowAutoRedirect,
    allowAutoGetUserOrders: website.allowAutoGetUserOrders,
    allowAutoUpdateUserInfo: website.allowAutoUpdateUserInfo,
    allowAutoFillForm: website.allowAutoFillForm,
    allowAutoTrackOrder: website.allowAutoTrackOrder,
    allowAutoLogout: website.allowAutoLogout,
    allowAutoLogin: website.allowAutoLogin,
    allowAutoGenerateImage: website.allowAutoGenerateImage,
    allowMultiAIReview: website.allowMultiAIReview,
    popUpQuestions: website.popUpQuestions.map((q: any) => ({
      id: q.id,
      question: q.question,
      createdAt: q.createdAt.toISOString(),
    })),
    globalStats,
    stats: {
      aiRedirects: globalStats.totalAiRedirects,
      totalRedirects: globalStats.totalAiRedirects,
      aiScrolls: globalStats.totalAiScrolls,
      aiPurchases: globalStats.totalAiPurchases,
      aiClicks: globalStats.totalAiClicks,
      redirectRate:
        website.monthlyQueries > 0
          ? Math.min(
              (globalStats.totalAiRedirects / website.monthlyQueries) * 100,
              100
            )
          : 0,
      totalVoiceChats: globalStats.totalVoiceChats,
      totalTextChats: globalStats.totalTextChats,
    },
    content: {
      products: content.products.map((p: any) => ({
        id: p.id,
        shopifyId: p.shopifyId ? p.shopifyId.toString() : undefined,
        handle: extractHandle(p.url, "products"),
        title: p.title || "",
        description: p.description || "",
        url: p.url,
        aiRedirects: p.aiRedirects,
      })),
      blogPosts: content.blogPosts.map((p: any) => ({
        id: p.id,
        shopifyId: p.shopifyId ? p.shopifyId.toString() : undefined,
        handle: extractHandle(p.url, "blogs"),
        title: p.title || "",
        content: p.content || "",
        url: p.url,
        aiRedirects: p.aiRedirects,
      })),
      pages: content.pages.map((p: any) => ({
        id: p.id,
        shopifyId: p.shopifyId ? p.shopifyId.toString() : undefined,
        handle: extractHandle(p.url, "pages"),
        title: p.title || "",
        content: p.content || "",
        url: p.url,
        aiRedirects: p.aiRedirects,
      })),
      collections: content.collections.map((c: any) => ({
        id: c.id,
        shopifyId: c.shopifyId.toString(),
        handle: c.handle || "",
        title: c.title || "",
        description: c.description || "",
        aiRedirects: c.aiRedirects,
      })),
      discounts: content.discounts.map((d: any) => ({
        id: d.id,
        shopifyId: d.shopifyId,
        title: d.title || "",
        code: d.code || "",
        value: d.value || "",
        type: d.type || "",
        status: d.status || "",
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        appliesTo: d.appliesTo || "",
      })),
    },
  };
}

// Helper function to extract and normalize handle from a URL
function extractHandle(url: string, type: string): string | null {
  try {
    // Remove domain if present
    let path = url;
    if (url.startsWith("http")) {
      const urlObj = new URL(url);
      path = urlObj.pathname;
    }
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2) {
      let t = parts[0];
      let h = parts[1];
      // Normalize type
      if (["product", "products"].includes(t)) t = "products";
      else if (["collection", "collections"].includes(t)) t = "collections";
      else if (["blog", "blogs"].includes(t)) t = "blogs";
      else if (["page", "pages"].includes(t)) t = "pages";
      if (t === type) {
        // Normalize handle: lowercase, strip trailing slashes/periods
        return h.toLowerCase().replace(/[\/.]+$/, "");
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}
