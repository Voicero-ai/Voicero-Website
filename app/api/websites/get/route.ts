import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../lib/prisma"; // Adjust this path as needed
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

    // Process threads and calculate stats
    processThreadsAndMessages(aiThreads, stats);

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
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (user) {
      userId = user.id;
    }
  }

  // Fall back to API key auth if session auth fails
  if (!userId) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const accessKey = authHeader.substring(7);
      const websiteByKey = await prisma.website.findFirst({
        where: {
          accessKeys: {
            some: {
              key: accessKey,
            },
          },
        },
        select: {
          id: true,
          userId: true,
        },
      });

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
  const websiteOwnership = await prisma.website.findFirst({
    where: {
      id: websiteId,
      userId: userId,
    },
    select: { id: true },
  });

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
  const website = await prisma.website.findUnique({
    where: { id: websiteId },
    include: {
      accessKeys: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      popUpQuestions: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  // Fetch threads separately to reduce connection pressure
  const aiThreads = await prisma.aiThread.findMany({
    where: { websiteId },
    orderBy: { createdAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

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

  aiThreads.forEach((thread: Thread) => {
    let hasVoiceMessage = false;
    let hasTextMessage = false;

    thread.messages.forEach((message: Message) => {
      // Process user messages for voice/text stats
      if (message.role === "user") {
        if (message.type === "voice") hasVoiceMessage = true;
        if (message.type === "text" || !message.type) hasTextMessage = true;
      }

      // Process assistant messages for actions and redirects
      if (message.role === "assistant") {
        processAssistantMessage(message, redirectMaps, globalStats);
      }
    });

    // Update global stats for the thread
    if (hasVoiceMessage) globalStats.totalVoiceChats++;
    if (hasTextMessage) globalStats.totalTextChats++;
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
    globalStats.totalAiRedirects++;
    const normalizedUrl = normalizeUrl(message.pageUrl);
    urlRedirectCounts.set(
      normalizedUrl,
      (urlRedirectCounts.get(normalizedUrl) || 0) + 1
    );
    countRedirectByType(normalizedUrl);
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
  const wpProducts = await prisma.wordpressProduct.findMany({
    where: { websiteId },
    orderBy: { updatedAt: "desc" },
    include: {
      reviews: true,
      categories: true,
      tags: true,
      customFields: true,
    },
  });

  // Fetch WordPress Posts with relations
  const wpPosts = await prisma.wordpressPost.findMany({
    where: { websiteId },
    orderBy: { updatedAt: "desc" },
    include: {
      author: true,
      categories: true,
      tags: true,
      comments: true,
      customFields: true,
    },
  });

  // Fetch WordPress Pages
  const wpPages = await prisma.wordpressPage.findMany({
    where: { websiteId },
    orderBy: { updatedAt: "desc" },
  });

  // Map products
  const products = wpProducts.map((prod) => {
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
      categories: prod.categories.map((c) => ({ id: c.id, name: c.name })),
      tags: prod.tags.map((t) => ({ id: t.id, name: t.name })),
      reviews: prod.reviews.map((r) => ({
        id: r.id,
        reviewer: r.reviewer,
        rating: r.rating,
        review: r.review,
        verified: r.verified,
        date: r.date.toISOString(),
      })),
      customFields: prod.customFields.reduce(
        (acc, field) => ({
          ...acc,
          [field.metaKey]: field.metaValue,
        }),
        {}
      ),
    };
  });

  // Map blog posts
  const blogPosts = wpPosts.map((post) => {
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
      categories: post.categories.map((c) => ({ id: c.id, name: c.name })),
      tags: post.tags.map((t) => ({ id: t.id, name: t.name })),
      comments: post.comments.map((c) => ({
        id: c.id,
        author: c.authorName,
        content: c.content,
        date: c.date.toISOString(),
        status: c.status,
        parentId: c.parentId,
      })),
      customFields: post.customFields.reduce(
        (acc, field) => ({
          ...acc,
          [field.metaKey]: field.metaValue,
        }),
        {}
      ),
    };
  });

  // Map pages
  const pages = wpPages.map((p) => {
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
  const shopifyCollections = await prisma.shopifyCollection.findMany({
    where: { websiteId },
    orderBy: { updatedAt: "desc" },
    include: {
      products: true,
    },
  });

  // Fetch discounts - use try/catch to handle invalid date values
  let shopifyDiscounts: any[] = [];
  try {
    shopifyDiscounts = await prisma.shopifyDiscount.findMany({
      where: { websiteId },
      orderBy: { createdAt: "desc" }, // Use createdAt instead of updatedAt to avoid date issues
    });
  } catch (error) {
    console.error("Error fetching discount data:", error);
    // Fallback: get discounts without ordering
    try {
      shopifyDiscounts = await prisma.shopifyDiscount.findMany({
        where: { websiteId },
      });
    } catch (fallbackError) {
      console.error("Fallback discount fetch also failed:", fallbackError);
    }
  }

  // Fetch products with relations
  const shopifyProducts = await prisma.shopifyProduct.findMany({
    where: { websiteId },
    orderBy: { updatedAt: "desc" },
    include: {
      variants: true,
      reviews: true,
      images: true,
    },
  });

  // Fetch blog posts with comments
  const shopifyBlogs = await prisma.shopifyBlog.findMany({
    where: { websiteId },
    include: {
      posts: {
        include: {
          comments: true,
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  // Fetch pages
  const shopifyPages = await prisma.shopifyPage.findMany({
    where: { websiteId },
    orderBy: { updatedAt: "desc" },
  });

  // Map collections
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
      updatedAt:
        collection.updatedAt?.toISOString() ||
        collection.createdAt.toISOString(),
      createdAt: collection.createdAt.toISOString(),
      products: collection.products.map((p) => ({
        ...p,
        shopifyId: p.shopifyId.toString(),
      })),
      aiRedirects:
        redirectMaps.collectionRedirects.get(collection.handle || "") || 0,
      shopifyId: collection.shopifyId.toString(),
    };
  });

  // Map discounts - add null checks for all date fields
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

  // Map products
  const products = shopifyProducts.map((prod) => {
    const productUrl = `/products/${prod.handle}`;
    return {
      id: prod.id,
      title: prod.title,
      url: productUrl,
      type: "product" as const,
      lastUpdated: prod.updatedAt.toISOString(),
      aiRedirects: redirectMaps.productRedirects.get(prod.handle) || 0,
      description: prod.description,
      vendor: prod.vendor,
      productType: prod.productType,
      price: prod.variants[0]?.price || 0,
      variants: prod.variants.map((v) => ({
        id: v.id,
        title: v.title,
        price: v.price,
        sku: v.sku,
        inventory: v.inventory,
      })),
      reviews: prod.reviews.map((r) => ({
        id: r.id,
        reviewer: r.reviewer,
        rating: r.rating,
        review: r.body,
        title: r.title,
        verified: r.verified,
        date: r.createdAt.toISOString(),
      })),
      images: prod.images.map((img) => ({
        id: img.id,
        url: img.url,
        altText: img.altText,
        caption: img.caption,
      })),
    };
  });

  // Map blog posts
  const blogPosts = shopifyBlogs.flatMap((blog) =>
    blog.posts.map((post) => {
      const postUrl = `/blogs/${blog.handle}/${post.handle}`;
      return {
        id: post.id,
        title: post.title,
        url: postUrl,
        type: "post" as const,
        lastUpdated: post.updatedAt.toISOString(),
        aiRedirects: redirectMaps.blogRedirects.get(post.handle || "") || 0,
        content: post.content,
        author: post.author,
        image: post.image,
        blog: {
          id: blog.id,
          title: blog.title,
          handle: blog.handle,
        },
        comments: post.comments.map((c) => ({
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

  // Map pages
  const pages = shopifyPages.map((p) => {
    const pageUrl = `/pages/${p.handle}`;
    return {
      id: p.id,
      title: p.title,
      url: pageUrl,
      type: "page" as const,
      lastUpdated: p.updatedAt.toISOString(),
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
    const customPages = await prisma.page.findMany({
      where: { websiteId },
      orderBy: { updatedAt: "desc" },
    });

    pages = customPages.map((p: any) => {
      const pageUrl = p.url;
      return {
        id: p.id,
        title: p.title,
        url: pageUrl,
        type: "page" as const,
        lastUpdated: p.updatedAt.toISOString(),
        aiRedirects:
          redirectMaps.pageRedirects.get(p.url.replace(/^\//, "")) || 0,
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
          ? (globalStats.totalAiRedirects / website.monthlyQueries) * 100
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
