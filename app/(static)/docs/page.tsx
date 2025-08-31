"use client";

import React from "react";
import Link from "next/link";
import {
  FaShopify,
  FaWordpress,
  FaRocket,
  FaBook,
  FaEnvelope,
  FaArrowRight,
  FaPhone,
} from "react-icons/fa";

export default function Docs() {
  return (
    <div className="max-w-4xl mx-auto space-y-12 pt-20 bg-black min-h-screen pb-12">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-white">
          Get Started with AI Chat
        </h1>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto">
          Add powerful AI chat capabilities to your website in minutes. Choose
          your platform below to get started.
        </p>
      </div>

      {/* Quick Start */}
      <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gray-800 rounded-lg">
            <FaRocket className="w-6 h-6 text-brand-accent" />
          </div>
          <h2 className="text-2xl font-semibold text-white">
            Quick Start Guide
          </h2>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-white">
              1. Choose Your Platform
            </h3>
            <p className="text-gray-300">
              Select either WordPress or Shopify based on your website platform.
              We provide specialized integration guides for each.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-medium text-white">
              2. Install the Plugin/App
            </h3>
            <p className="text-gray-300">
              Follow the platform-specific installation steps to add our AI chat
              widget to your site. No coding required!
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-medium text-white">
              3. Configure Settings
            </h3>
            <p className="text-gray-300">
              Customize the chat widget appearance, behavior, and AI responses
              to match your brand and requirements.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-medium text-white">
              4. Test and Launch
            </h3>
            <p className="text-gray-300">
              Preview the chat widget on your site, test interactions, and go
              live when you&apos;re ready!
            </p>
          </div>
        </div>
      </div>

      {/* Platform Selection */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* WordPress */}
        <Link
          href="/docs/wordpress"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gray-800 rounded-xl">
              <FaWordpress className="w-8 h-8 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">
                WordPress
              </h3>
              <p className="text-gray-300">Plugin installation guide</p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Learn how to install and configure our WordPress plugin for seamless
            AI chat integration.
          </p>
          <span className="text-brand-accent group-hover:gap-2 flex items-center gap-1 transition-all">
            View guide <FaArrowRight className="w-4 h-4" />
          </span>
        </Link>

        {/* Shopify */}
        <Link
          href="/docs/shopify"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gray-800 rounded-xl">
              <FaShopify className="w-8 h-8 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">Shopify</h3>
              <p className="text-gray-300">App installation guide</p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Follow our step-by-step guide to add AI chat capabilities to your
            Shopify store.
          </p>
          <span className="text-brand-accent group-hover:gap-2 flex items-center gap-1 transition-all">
            View guide <FaArrowRight className="w-4 h-4" />
          </span>
        </Link>
        <Link
          href="/docs/custom"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <h3 className="text-xl font-semibold text-white mb-1">Custom</h3>
          <p className="text-gray-300">Custom integration guide</p>
          <p className="text-gray-300 mb-4">
            Follow our step-by-step guide to add AI chat capabilities to your
            custom website.
          </p>
          <span className="text-brand-accent group-hover:gap-2 flex items-center gap-1 transition-all">
            View guide <FaArrowRight className="w-4 h-4" />
          </span>
        </Link>
      </div>

      {/* Additional Resources */}
      <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gray-800 rounded-lg">
            <FaBook className="w-6 h-6 text-brand-accent" />
          </div>
          <h2 className="text-2xl font-semibold text-white">
            Additional Resources
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Link
            href="/contact"
            className="flex items-center gap-3 p-4 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <FaEnvelope className="w-5 h-5 text-brand-accent" />
            <div>
              <h3 className="font-medium text-white">Contact Us</h3>
              <p className="text-sm text-gray-300">Send us a message</p>
            </div>
          </Link>

          <a
            href="tel:+17206122979"
            className="flex items-center gap-3 p-4 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <FaPhone className="w-5 h-5 text-brand-accent" />
            <div>
              <h3 className="font-medium text-white">Call Support</h3>
              <p className="text-sm text-gray-300">+1 (720) 612-2979</p>
            </div>
          </a>

          <a
            href="mailto:support@voicero.ai"
            className="flex items-center gap-3 p-4 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <FaEnvelope className="w-5 h-5 text-brand-accent" />
            <div>
              <h3 className="font-medium text-white">Email Support</h3>
              <p className="text-sm text-gray-300">support@voicero.ai</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
