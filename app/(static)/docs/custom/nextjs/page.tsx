"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FaKey,
  FaCode,
  FaCheck,
  FaArrowLeft,
  FaCog,
  FaRocket,
  FaCopy,
} from "react-icons/fa";
import { SiNextdotjs } from "react-icons/si";

export default function NextjsGuide() {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const demoAccessKey = "12345";

  return (
    <div className="max-w-4xl mx-auto space-y-8 pt-20 bg-black min-h-screen pb-12">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <Link
          href="/docs/custom"
          className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
        >
          <FaArrowLeft className="w-4 h-4" />
          <span>Back to Custom Integration</span>
        </Link>
      </div>

      {/* Title Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gray-800 rounded-xl">
            <SiNextdotjs className="w-8 h-8 text-brand-accent" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            Next.js Integration Guide
          </h1>
        </div>
        <p className="text-lg text-gray-300">
          Follow these steps to add Voicero.AI to your Next.js application
        </p>
      </div>

      {/* Installation Steps */}
      <div className="space-y-6">
        {/* Step 1: Get Access Key */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaKey className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                1. Get Your Access Key
              </h2>
              <p className="text-gray-300">
                Generate an access key from your dashboard. This key will be
                used to connect your Next.js application to our AI services.
              </p>
              <div className="flex items-center gap-4">
                <Link
                  href="/app/access-keys"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-accent text-white rounded-lg hover:bg-brand-accent/90 transition-colors"
                >
                  Generate Access Key
                  <FaKey className="w-4 h-4" />
                </Link>
                <p className="text-sm text-gray-300">
                  Remember to save your key securely!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Add Script to Layout */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                2. Add Script to Your Layout
              </h2>
              <p className="text-gray-300">
                Next.js provides a Script component that can be used to load
                external scripts. Add the following to your layout file:
              </p>

              <h3 className="text-lg font-medium text-white mt-4">
                For Next.js 13+ (App Router)
              </h3>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// app/layout.tsx
import Script from 'next/script';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src="https://voicero-text-frontend.vercel.app/widget.js"
          strategy="afterInteractive"
          data-token="${demoAccessKey}"
        />
      </body>
    </html>
  );
}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// app/layout.tsx
import Script from 'next/script';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src="https://voicero-text-frontend.vercel.app/widget.js"
          strategy="afterInteractive"
          data-token="${demoAccessKey}"
        />
      </body>
    </html>
  );
}`,
                      "appRouter"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "appRouter" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <h3 className="text-lg font-medium text-white mt-6">
                For Next.js 12 (Pages Router)
              </h3>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// pages/_app.js or pages/_app.tsx
import Script from 'next/script';

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Script
        src="https://voicero-text-frontend.vercel.app/widget.js"
        strategy="afterInteractive"
        data-token="${demoAccessKey}"
      />
    </>
  );
}

export default MyApp;`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// pages/_app.js or pages/_app.tsx
import Script from 'next/script';

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Script
        src="https://voicero-text-frontend.vercel.app/widget.js"
        strategy="afterInteractive"
        data-token="${demoAccessKey}"
      />
    </>
  );
}

export default MyApp;`,
                      "pagesRouter"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "pagesRouter" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Environment Variables */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCog className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                3. Using Environment Variables (Recommended)
              </h2>
              <p className="text-gray-300">
                For better security, store your access key in an environment
                variable:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// .env.local
NEXT_PUBLIC_VOICERO_ACCESS_KEY="${demoAccessKey}"`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// .env.local
NEXT_PUBLIC_VOICERO_ACCESS_KEY="${demoAccessKey}"`,
                      "envFile"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "envFile" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-300 mt-4 mb-2">
                Then update your Script component:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<Script
  src="https://voicero-text-frontend.vercel.app/widget.js"
  strategy="afterInteractive"
  data-token={process.env.NEXT_PUBLIC_VOICERO_ACCESS_KEY}
/>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<Script
  src="https://voicero-text-frontend.vercel.app/widget.js"
  strategy="afterInteractive"
  data-token={process.env.NEXT_PUBLIC_VOICERO_ACCESS_KEY}
/>`,
                      "scriptEnv"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "scriptEnv" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 5: Verification */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaRocket className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                5. You're All Set!
              </h2>
              <p className="text-gray-300">
                Run your Next.js application to see the AI chat widget in
                action. The chat widget will appear as a small button in the
                bottom-right corner of your application.
              </p>
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-900/20 px-3 py-2 rounded-lg">
                <FaCheck className="w-4 h-4" />
                <span>
                  Your AI chat assistant is now ready to help your users
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Need Help */}
      <div className="bg-gray-900/50 rounded-xl p-6 text-center">
        <p className="text-gray-300 mb-4">
          Need help with installation? Our support team is here for you.
        </p>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors text-white"
        >
          Contact Support
        </Link>
      </div>
    </div>
  );
}
