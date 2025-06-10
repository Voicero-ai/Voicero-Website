"use client";

import React from "react";
import Link from "next/link";
import {
  FaKey,
  FaWordpress,
  FaDownload,
  FaCheck,
  FaSync,
  FaArrowLeft,
  FaCog,
  FaRocket,
} from "react-icons/fa";

export default function WordPressGuide() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pt-20 bg-black min-h-screen pb-12">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <Link
          href="/docs"
          className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
        >
          <FaArrowLeft className="w-4 h-4" />
          <span>Back to Documentation</span>
        </Link>
      </div>

      {/* Title Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gray-800 rounded-xl">
            <FaWordpress className="w-8 h-8 text-brand-accent" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            WordPress Installation Guide
          </h1>
        </div>
        <p className="text-lg text-gray-300">
          Follow these steps to add AI chat capabilities to your WordPress
          website
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
                used to connect your WordPress site to our AI services.
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

        {/* Step 2: Download Plugin */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaDownload className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                2. Install the Plugin
              </h2>
              <p className="text-gray-300">
                Download and install the Voicero.AI plugin from the WordPress
                plugin directory or via your WordPress admin dashboard.
              </p>
              <div className="flex items-center gap-4">
                <a
                  href="https://wordpress.org/plugins/voicero-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-accent text-white rounded-lg hover:bg-brand-accent/90 transition-colors"
                >
                  Download Plugin
                  <FaDownload className="w-4 h-4" />
                </a>
                <span className="text-sm text-gray-300">
                  or search for &quot;Voicero.AI&quot; in WordPress plugins
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Configure Plugin */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCog className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                3. Configure the Plugin
              </h2>
              <div className="space-y-4">
                <p className="text-gray-300">
                  After activation, follow these steps in your WordPress admin:
                </p>
                <ol className="space-y-3 text-gray-300 list-decimal list-inside ml-4">
                  <li>Find &quot;Voicero.AI&quot; in the sidebar menu</li>
                  <li>Enter your access key in the settings</li>
                  <li>Click &quot;Verify&quot; to validate your key</li>
                  <li>
                    Click &quot;Sync Website Data&quot; to initialize AI
                    features
                  </li>
                  <li>
                    Click &quot;Add to Website&quot; to enable the chat widget
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Verification */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaRocket className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                4. You&apos;re All Set!
              </h2>
              <p className="text-gray-300">
                Visit your website to see the AI chat widget in action. You can
                customize its appearance and behavior anytime from the WordPress
                admin panel.
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
