/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.SITE_URL || "https://www.voicero.ai",
  generateRobotsTxt: false, // Prevent overwriting custom robots.txt
  exclude: ["/api/*"], // Only exclude api routes, not app pages
  generateIndexSitemap: false, // Don't regenerate the main sitemap.xml
  transform: async (config, path) => {
    return {
      loc: path,
      changefreq: "daily",
      priority: 0.7,
      lastmod: new Date().toISOString(),
    };
  },
};
