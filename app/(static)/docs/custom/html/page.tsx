"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FaKey,
  FaHtml5,
  FaCode,
  FaCheck,
  FaArrowLeft,
  FaCog,
  FaRocket,
  FaCopy,
} from "react-icons/fa";
import { trackCustomConversion } from "../../../../../lib/conversion-tracking";

export default function HtmlGuide() {
  const [copied, setCopied] = useState<string | null>(null);

  // Track conversion when the page loads (page view conversion)
  React.useEffect(() => {
    trackCustomConversion(`custom_html_pageview_${Date.now()}`);
  }, []);

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
            <FaHtml5 className="w-8 h-8 text-purple-400" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            HTML Integration Guide
          </h1>
        </div>
        <p className="text-lg text-gray-300">
          Follow these steps to add Voicero.AI to any website with a simple
          script tag
        </p>
      </div>

      {/* Installation Steps */}
      <div className="space-y-6">
        {/* Step 1: Get Access Key */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaKey className="w-5 h-5 text-purple-400" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                1. Get Your Access Key
              </h2>
              <p className="text-gray-300">
                Generate an access key from your dashboard. This key will be
                used to connect your website to our AI services.
              </p>
              <div className="flex items-center gap-4">
                <Link
                  href="/app/access-keys"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
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

        {/* Step 2: Add Script */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-purple-400" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                2. Add the Script to Your Website
              </h2>
              <p className="text-gray-300">
                Add the following script tag to your HTML page, just before the
                closing &lt;/body&gt; tag. Replace the data-token value with
                your own access key.
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<script 
  src="https://voicero-text-frontend.vercel.app/widget.js" 
  data-token="${demoAccessKey}"
></script>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<script 
  src="https://voicero-text-frontend.vercel.app/widget.js" 
  data-token="${demoAccessKey}"
></script>`,
                      "script"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "script" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
              <p className="text-sm text-gray-300">
                This script will automatically load and initialize the
                Voicero.AI chat widget on your website.
              </p>
            </div>
          </div>
        </div>

        {/* Step 3: Complete HTML Example */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCog className="w-5 h-5 text-purple-400" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                3. Complete HTML Example
              </h2>
              <p className="text-gray-300">
                Here's a complete HTML example showing where to place the
                script:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Website</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Your website content goes here -->
  <header>
    <h1>Welcome to My Website</h1>
  </header>
  
  <main>
    <p>This is my website content.</p>
  </main>
  
  <footer>
    <p>&copy; 2025 My Website</p>
  </footer>

  <!-- Add Voicero.AI script right before closing body tag -->
  <script 
    src="https://voicero-text-frontend.vercel.app/widget.js" 
    data-token="${demoAccessKey}"
  ></script>
</body>
</html>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Website</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Your website content goes here -->
  <header>
    <h1>Welcome to My Website</h1>
  </header>
  
  <main>
    <p>This is my website content.</p>
  </main>
  
  <footer>
    <p>&copy; 2025 My Website</p>
  </footer>

  <!-- Add Voicero.AI script right before closing body tag -->
  <script 
    src="https://voicero-text-frontend.vercel.app/widget.js" 
    data-token="${demoAccessKey}"
  ></script>
</body>
</html>`,
                      "fullExample"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "fullExample" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Verification */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaRocket className="w-5 h-5 text-purple-400" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                4. You're All Set!
              </h2>
              <p className="text-gray-300">
                Visit your website to see the AI chat widget in action. The chat
                widget will appear as a small button in the bottom-right corner
                of your website.
              </p>
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-900/20 px-3 py-2 rounded-lg">
                <FaCheck className="w-4 h-4" />
                <span>
                  Your AI chat assistant is now ready to help your visitors
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
