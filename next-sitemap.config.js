/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.SITE_URL || "https://www.voicero.ai",
  generateRobotsTxt: true,
  exclude: ["/app/*", "/api/*"],
  // You can also add additional configuration options here
};
