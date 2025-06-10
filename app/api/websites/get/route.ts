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
}

export async function GET(request: NextRequest) {
  try {
    // 1) Extract the 'id' query param => e.g. /api/website/get?id=<websiteId>
    const { searchParams } = new URL(request.url);
    const providedWebsiteId = searchParams.get("id");

    // Get the current session
    const session = await getServerSession(authOptions);
    let userId: string | null = null;
    let websiteId: string | null = providedWebsiteId;

    // Check if we have a valid session
    if (session?.user?.email) {
      // Get the current user based on email
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });

      if (user) {
        userId = user.id;
      }
    }

    // If no valid session, check for access key in Authorization header
    if (!userId) {
      const authHeader = request.headers.get("Authorization");

      if (authHeader && authHeader.startsWith("Bearer ")) {
        const accessKey = authHeader.substring(7); // Remove "Bearer " prefix

        // Look up the website by accessKey
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
          // If no websiteId was provided, use the one from the access key
          if (!websiteId) {
            websiteId = websiteByKey.id;
          }
        }
      }
    }

    // If we still don't have a userId, return unauthorized
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in or provide a valid access key." },
        { status: 401 }
      );
    }

    // If we still don't have a websiteId, return error
    if (!websiteId) {
      return NextResponse.json(
        {
          error: "No website ID provided and no website found for access key.",
        },
        { status: 400 }
      );
    }

    // Initialize redirect tracking maps
    const productRedirects = new Map<string, number>();
    const collectionRedirects = new Map<string, number>();
    const blogRedirects = new Map<string, number>();
    const pageRedirects = new Map<string, number>();
    const urlRedirectCounts = new Map<string, number>();

    // First check if the website belongs to the user
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
      return NextResponse.json(
        { error: "Unauthorized. You don't have access to this website." },
        { status: 403 }
      );
    }

    // Fetch website with aiThreads and messages
    const website = (await prisma.website.findUnique({
      where: { id: websiteId },
      include: {
        accessKeys: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
        aiThreads: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
            messages: {
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        },
        popUpQuestions: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    })) as Website | null;

    if (!website) {
      return NextResponse.json(
        { error: "Website not found." },
        { status: 404 }
      );
    }

    // We've already verified above that the user owns this website, so this check is redundant
    // But keeping it as a double-check for security
    if (website.userId !== userId) {
      console.log(
        `Security check failed: Website user ID ${website.userId} doesn't match authenticated user ID ${userId}`
      );
      return NextResponse.json(
        { error: "Unauthorized. You don't have access to this website." },
        { status: 403 }
      );
    }

    // Let's also log the raw count from the database
    const threadCount = await prisma.aiThread.count({
      where: { websiteId },
    });

    // Calculate global stats and content-specific redirects
    const globalStats = {
      totalAiRedirects: 0,
      totalVoiceChats: 0,
      totalTextChats: 0,
      totalAiScrolls: 0,
      totalAiPurchases: 0,
      totalAiClicks: 0,
    };

    // At the start of the counting logic

    // Iterate through all threads and their messages
    website.aiThreads.forEach((thread: Thread) => {
      let hasVoiceMessage = false;
      let hasTextMessage = false;

      thread.messages.forEach((message: Message) => {
        // Only count user messages for voice/text stats
        if (message.role === "user") {
          if (message.type === "voice") {
            hasVoiceMessage = true;
          }
          if (message.type === "text" || !message.type) {
            hasTextMessage = true;
          }
        }

        // Check for redirects in assistant messages
        if (message.role === "assistant") {
          // Helper function to normalize URLs
          const normalizeUrl = (url: string) => {
            try {
              // If it's a full URL, parse it with URL constructor
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
          };

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

              // Normalize handle: lowercase, strip trailing slashes/periods
              handle = handle.toLowerCase().replace(/[\/.]+$/, "");

              // Count redirects by content type
              switch (type) {
                case "products":
                  productRedirects.set(
                    handle,
                    (productRedirects.get(handle) || 0) + 1
                  );

                  break;
                case "collections":
                  collectionRedirects.set(
                    handle,
                    (collectionRedirects.get(handle) || 0) + 1
                  );
                  break;
                case "blogs":
                  // Always use the last segment as the key for blogs
                  const blogHandle = parts[parts.length - 1]
                    .toLowerCase()
                    .replace(/[\/.]+$/, "");
                  blogRedirects.set(
                    blogHandle,
                    (blogRedirects.get(blogHandle) || 0) + 1
                  );

                  break;
                case "pages":
                  pageRedirects.set(
                    handle,
                    (pageRedirects.get(handle) || 0) + 1
                  );
                  break;
              }
            }
          };

          // First try to find redirect in pageUrl
          if (message.pageUrl) {
            globalStats.totalAiRedirects++;
            const normalizedUrl = normalizeUrl(message.pageUrl);
            urlRedirectCounts.set(
              normalizedUrl,
              (urlRedirectCounts.get(normalizedUrl) || 0) + 1
            );
            countRedirectByType(normalizedUrl);
          }

          // Try to parse content as JSON first
          try {
            let contentToProcess = message.content;
            // Check if content has ```json markers and extract the JSON
            if (contentToProcess.includes("```json")) {
              contentToProcess = contentToProcess.replace(
                /```json\n|\n```/g,
                ""
              );
            }

            const contentObj = JSON.parse(contentToProcess);

            // --- NEW LOGIC: Check for action: 'redirect' and action_context.url ---
            if (contentObj.action) {
              switch (contentObj.action) {
                case "redirect":
                  if (
                    contentObj.action_context &&
                    contentObj.action_context.url
                  ) {
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
            // --- END NEW LOGIC ---

            // Existing logic for url or redirect_url
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
            // If JSON parsing fails, try to find URLs in the content
            const urlRegex =
              /https?:\/\/[^\s)]+|(?:\/(?:pages|products|blogs|collections)\/[^\s)]+)/g;
            const urls = message.content.match(urlRegex);
            if (urls && urls.length > 0) {
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

            // Check for actions in the string content if JSON parsing failed
            if (message.content.includes('"action":"scroll"'))
              globalStats.totalAiScrolls++;
            if (message.content.includes('"action":"purchase"'))
              globalStats.totalAiPurchases++;
            if (message.content.includes('"action":"click"'))
              globalStats.totalAiClicks++;
          }
        }
      });

      if (hasVoiceMessage) {
        globalStats.totalVoiceChats++;
      }
      if (hasTextMessage) {
        globalStats.totalTextChats++;
      }
    });

    // After counting

    // Helper function to get redirect count for a URL - normalize input URL
    const getRedirectCount = (url: string) => {
      // First normalize by removing trailing slash
      let normalizedUrl = url.replace(/\/$/, "");

      // For Shopify pages, we need to check both with and without /pages/ prefix
      if (website.type === "Shopify") {
        // If it's a pages URL without the prefix, add it
        if (
          !normalizedUrl.startsWith("/pages/") &&
          !normalizedUrl.startsWith("/products/") &&
          !normalizedUrl.startsWith("/blogs/")
        ) {
          normalizedUrl = "/pages/" + normalizedUrl;
        }

        // Also check for trailing periods that might have been captured
        normalizedUrl = normalizedUrl.replace(/\.$/, "");
      }

      return urlRedirectCounts.get(normalizedUrl) || 0;
    };

    // 4) We'll store all content (products, blogPosts, pages) here
    type ContentItem = {
      id: string;
      title: string | null;
      url: string;
      type: "product" | "post" | "page";
      lastUpdated: string;
      aiRedirects: number;
      description?: string | null;
      content?: string | null;
      [key: string]: any; // For additional properties that vary by type
    };

    let products: ContentItem[] = [];
    let blogPosts: ContentItem[] = [];
    let pages: ContentItem[] = [];
    let collections: Array<{
      id: string;
      title: string;
      handle: string;
      description: string | null;
      image: any;
      ruleSet: any;
      sortOrder: string | null;
      updatedAt: string;
      createdAt: string;
      products: any[];
      aiRedirects: number;
      shopifyId: string;
    }> = [];
    let discounts: Array<{
      id: string;
      title: string | null;
      code: string | null;
      value: string | null;
      type: string | null;
      status: string | null;
      startsAt: string | null;
      endsAt: string | null;
      appliesTo: string | null;
      shopifyId: string;
    }> = [];

    // 5) Check website.type => If "wordpress", fetch from WordPress tables
    if (website.type === "WordPress") {
      // Fetch WordPress Products with reviews
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

      products = wpProducts.map((prod) => {
        const productUrl = `/products/${prod.slug}`;

        return {
          id: String(prod.id),
          title: prod.name,
          url: productUrl,
          type: "product" as const,
          lastUpdated: prod.updatedAt.toISOString(),
          aiRedirects: getRedirectCount(productUrl),
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

      // Fetch WordPress Posts with more relations
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

      blogPosts = wpPosts.map((post) => {
        const postUrl = `/${post.slug}`;

        return {
          id: String(post.id),
          title: post.title,
          url: postUrl,
          type: "post" as const,
          lastUpdated: post.updatedAt.toISOString(),
          aiRedirects: getRedirectCount(postUrl),
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

      // Fetching WordPress Pages
      const wpPages = await prisma.wordpressPage.findMany({
        where: { websiteId },
        orderBy: { updatedAt: "desc" },
      });

      pages = wpPages.map((p) => {
        const pageUrl = `/${p.slug}`;

        return {
          id: String(p.id),
          title: p.title,
          url: pageUrl,
          type: "page" as const,
          lastUpdated: p.updatedAt.toISOString(),
          aiRedirects: getRedirectCount(pageUrl),
          content: p.content,
        };
      });

      // 6) If Shopify => fetch from Shopify tables
    } else if (website.type === "Shopify") {
      // Fetch Shopify Collections first
      const shopifyCollections = await prisma.shopifyCollection.findMany({
        where: { websiteId },
        orderBy: { updatedAt: "desc" },
        include: {
          products: true,
        },
      });

      // Fetch Shopify Discounts
      const shopifyDiscounts = await prisma.shopifyDiscount.findMany({
        where: { websiteId },
        orderBy: { updatedAt: "desc" },
      });

      discounts = shopifyDiscounts.map((discount) => {
        return {
          id: discount.id,
          title: discount.title,
          code: discount.code,
          value: discount.value,
          type: discount.type,
          status: discount.status,
          startsAt: discount.startsAt?.toISOString() || null,
          endsAt: discount.endsAt?.toISOString() || null,
          appliesTo: discount.appliesTo,
          shopifyId: discount.shopifyId.toString(),
        };
      });

      collections = shopifyCollections.map((collection) => {
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
          aiRedirects: collectionRedirects.get(collection.handle || "") || 0,
          shopifyId: collection.shopifyId.toString(),
        };
      });

      // Shopify Products with variants, reviews, and images
      const shopifyProducts = await prisma.shopifyProduct.findMany({
        where: { websiteId },
        orderBy: { updatedAt: "desc" },
        include: {
          variants: true,
          reviews: true,
          images: true,
        },
      });

      products = shopifyProducts.map((prod) => {
        const productUrl = `/products/${prod.handle}`;
        return {
          id: prod.id,
          title: prod.title,
          url: productUrl,
          type: "product" as const,
          lastUpdated: prod.updatedAt.toISOString(),
          aiRedirects: getRedirectCount(productUrl),
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

      // Shopify Blog Posts with comments
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

      blogPosts = shopifyBlogs.flatMap((blog) =>
        blog.posts.map((post) => {
          const postUrl = `/blogs/${blog.handle}/${post.handle}`;
          return {
            id: post.id,
            title: post.title,
            url: postUrl,
            type: "post" as const,
            lastUpdated: post.updatedAt.toISOString(),
            aiRedirects: blogRedirects.get(post.handle || "") || 0,
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

      // Shopify Pages
      const shopifyPages = await prisma.shopifyPage.findMany({
        where: { websiteId },
        orderBy: { updatedAt: "desc" },
      });

      pages = shopifyPages.map((p) => {
        const pageUrl = `/pages/${p.handle}`;
        return {
          id: p.id,
          title: p.title,
          url: pageUrl,
          type: "page" as const,
          lastUpdated: p.updatedAt.toISOString(),
          aiRedirects: getRedirectCount(pageUrl),
          content: p.content,
        };
      });
    } else if (website.type === "Custom") {
      // For Custom websites, we only handle pages
      // Set empty arrays for products and blog posts
      products = [];
      blogPosts = [];
      collections = [];

      // Get pages from the Page model for custom websites
      try {
        const customPages = await prisma.page.findMany({
          where: { websiteId },
          orderBy: { updatedAt: "desc" },
        });

        if (customPages.length > 0) {
          pages = customPages.map((p: any) => {
            const pageUrl = p.url;
            return {
              id: p.id,
              title: p.title,
              url: pageUrl,
              type: "page" as const,
              lastUpdated: p.updatedAt.toISOString(),
              aiRedirects: getRedirectCount(pageUrl),
              content: p.content,
              htmlContent: p.html,
            };
          });
        } else {
          pages = [];
        }
      } catch (error) {
        console.error("Error fetching custom pages:", error);
        pages = [];
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported website type: ${website.type}` },
        { status: 400 }
      );
    }

    // Check for additional custom pages regardless of website type
    if (website.type !== "Custom") {
      try {
        const additionalCustomPages = await prisma.page.findMany({
          where: { websiteId },
          orderBy: { updatedAt: "desc" },
        });

        if (additionalCustomPages.length > 0) {
          const customPages = additionalCustomPages.map((p: any) => {
            const pageUrl = p.url;
            return {
              id: p.id,
              title: p.title,
              url: pageUrl,
              type: "page" as const,
              lastUpdated: p.updatedAt.toISOString(),
              aiRedirects: getRedirectCount(pageUrl),
              content: p.content,
              htmlContent: p.html,
              source: "custom_crawler", // Mark these as coming from the custom crawler
            };
          });

          // Combine with existing pages
          pages = [...pages, ...customPages];
        }
      } catch (error) {
        console.error("Error fetching additional custom pages:", error);
      }
    }

    // After processing all messages, log the final counts

    // When building products array, assign aiRedirects using normalized handle
    if (products && Array.isArray(products)) {
      products = products.map((prod: any) => {
        const handle = extractHandle(prod.url, "products");
        const count = handle ? productRedirects.get(handle) || 0 : 0;

        return {
          ...prod,
          aiRedirects: count,
        };
      });
    }

    // When building blogPosts array, assign aiRedirects by matching only on the handle (last segment), regardless of prefix
    if (blogPosts && Array.isArray(blogPosts)) {
      blogPosts = blogPosts.map((post: any) => {
        // Extract handle from post.url (last segment, strip slashes, lowercase)
        const urlParts = post.url.split("/").filter(Boolean);
        const handle = urlParts[urlParts.length - 1].toLowerCase();

        // Check for redirects in both prefixed and non-prefixed URLs
        let count = 0;

        // Check for /blog/handle format
        const prefixedUrl = `/blog/${handle}`;
        count += urlRedirectCounts.get(prefixedUrl) || 0;

        // Check for /handle format (no prefix)
        const nonPrefixedUrl = `/${handle}`;
        count += urlRedirectCounts.get(nonPrefixedUrl) || 0;

        // Check for exact URL match
        count += urlRedirectCounts.get(post.url) || 0;

        return {
          ...post,
          aiRedirects: count,
        };
      });
    }

    // After blogPosts is initialized, increment blogRedirects for /handle (no prefix) URLs
    if (blogPosts && Array.isArray(blogPosts)) {
      for (const [url, count] of Array.from(urlRedirectCounts.entries())) {
        const parts = url.split("/").filter(Boolean);
        if (parts.length === 1) {
          const handle = parts[0].toLowerCase().replace(/[\/.]+$/, "");
          const match = blogPosts.find((post: any) => {
            const urlParts = post.url.split("/").filter(Boolean);
            const postHandle = urlParts[urlParts.length - 1].toLowerCase();
            return postHandle === handle;
          });
          if (match) {
            blogRedirects.set(handle, (blogRedirects.get(handle) || 0) + count);
          }
        }
      }
    }

    // 7) Finally, return a structure matching your front-end:
    //    domain, type, plan, status, monthlyQueries, queryLimit, etc.
    //    plus lastSync (from website.lastSyncedAt)
    //    plus globalStats, plus stats (if needed), plus content
    const responseData = {
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
      lastSync: website.lastSyncedAt
        ? website.lastSyncedAt.toISOString()
        : null,
      accessKey: website.accessKeys[0]?.key || null,
      color: website.color || "#6366F1", // Default color if none set
      botName: website.botName,
      customWelcomeMessage: website.customWelcomeMessage,
      iconBot: website.iconBot,
      iconVoice: website.iconVoice,
      iconMessage: website.iconMessage,
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
      popUpQuestions: website.popUpQuestions.map((q) => ({
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
        products: products.map((p) => ({
          id: p.id,
          shopifyId: p.shopifyId ? p.shopifyId.toString() : undefined,
          handle: extractHandle(p.url, "products"),
          title: p.title || "",
          description: p.description || "",
          url: p.url,
          aiRedirects:
            productRedirects.get(extractHandle(p.url, "products") || "") || 0,
        })),
        blogPosts: blogPosts.map((p) => ({
          id: p.id,
          shopifyId: p.shopifyId ? p.shopifyId.toString() : undefined,
          handle: extractHandle(p.url, "blogs"),
          title: p.title || "",
          content: p.content || "",
          url: p.url,
          aiRedirects:
            blogRedirects.get(extractHandle(p.url, "blogs") || "") || 0,
        })),
        pages: pages.map((p) => ({
          id: p.id,
          shopifyId: p.shopifyId ? p.shopifyId.toString() : undefined,
          handle: extractHandle(p.url, "pages"),
          title: p.title || "",
          content: p.content || "",
          url: p.url,
          aiRedirects:
            pageRedirects.get(extractHandle(p.url, "pages") || "") || 0,
        })),
        collections: collections.map((c) => ({
          id: c.id,
          shopifyId: c.shopifyId.toString(),
          handle: c.handle || "",
          title: c.title || "",
          description: c.description || "",
          aiRedirects: collectionRedirects.get(c.handle || "") || 0,
        })),
        discounts: discounts.map((d) => ({
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

    return NextResponse.json(responseData, { status: 200 });
  } catch (err) {
    console.error("Failed to retrieve website data:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
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
