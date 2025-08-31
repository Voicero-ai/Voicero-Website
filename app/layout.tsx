// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import { headers } from "next/headers";
import { WebsiteSchema } from "../components/SEO";
import { OrganizationSchema } from "../components/SEO";

export const metadata: Metadata = {
  title:
    "Voicero.AI - AI Website Chatbot for Shopify & WordPress | Plugin Chatbot",
  description:
    "Voicero.AI is the leading AI chatbot plugin for Shopify and WordPress websites. Our intelligent chatbot handles customer service, reduces cart abandonment, and improves conversion rates. Easy to install, no coding required.",
  keywords:
    "website chatbot, plugin chatbot, shopify chatbot, wordpress chatbot, AI chatbot, customer service chatbot, ecommerce chatbot, store chatbot",
  openGraph: {
    title:
      "Voicero.AI - AI Website Chatbot for Shopify & WordPress | Plugin Chatbot",
    description:
      "Voicero.AI is the leading AI chatbot plugin for Shopify and WordPress websites. Our intelligent chatbot handles customer service, reduces cart abandonment, and improves conversion rates. Easy to install, no coding required.",
    url: "https://voicero.ai",
    siteName: "Voicero.AI",
    images: [
      {
        url: "https://voicero.ai/logos/logoNoBackground.png",
        width: 1200,
        height: 630,
        alt: "Voicero.AI - AI Website Chatbot for E-commerce",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title:
      "Voicero.AI - AI Website Chatbot for Shopify & WordPress | Plugin Chatbot",
    description:
      "Voicero.AI is the leading AI chatbot plugin for Shopify and WordPress websites. Our intelligent chatbot handles customer service, reduces cart abandonment, and improves conversion rates. Easy to install, no coding required.",
    images: ["https://voicero.ai/logos/logoNoBackground.png"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the visitor's country from Vercel edge header:
  const country = (await headers()).get("x-vercel-ip-country") ?? "unknown";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="icon"
          href="/logos/logoNoBackground.png"
          style={{ borderRadius: "50%" }}
        />
        {/* Google Tag Manager */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-16904549407"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-16904549407');
          `}
        </Script>
        {/* Google Ads Tag */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-16904549407"
          strategy="afterInteractive"
        />
        <Script id="google-ads" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-16904549407');
          `}
        </Script>
        {/* Structured Data */}
        <OrganizationSchema
          name="Voicero.AI"
          description="Voicero.AI is the leading AI chatbot plugin for Shopify and WordPress websites. Our intelligent chatbot handles customer service, reduces cart abandonment, and improves conversion rates."
          url="https://voicero.ai"
          logo="https://voicero.ai/logos/logoNoBackground.png"
          sameAs={[
            "https://twitter.com/voiceroai",
            "https://www.linkedin.com/company/voiceroai",
          ]}
        />
        <WebsiteSchema
          name="Voicero.AI"
          description="Voicero.AI is the leading AI chatbot plugin for Shopify and WordPress websites. Our intelligent chatbot handles customer service, reduces cart abandonment, and improves conversion rates."
          url="https://voicero.ai"
        />
      </head>
      <body
        className="bg-black text-white font-sans antialiased overflow-x-hidden"
        suppressHydrationWarning
      >
        <div className="min-h-screen flex flex-col">
          <main className="flex-grow flex flex-col">
            {children}
            <Script
              src="http://localhost:8090/widget.js"
              strategy="afterInteractive"
              data-token="q8xGnPF6w5pu7JTGwpFQp5wsfhYzhUDyMf1puHfaGuQQO3tSub5kpA6sCRBs2eRB"
            />
          </main>
        </div>
      </body>
    </html>
  );
}
