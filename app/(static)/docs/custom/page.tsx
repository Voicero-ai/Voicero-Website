"use client";

import React from "react";
import Link from "next/link";
import {
  FaCode,
  FaReact,
  FaNodeJs,
  FaVuejs,
  FaAngular,
  FaHtml5,
  FaJsSquare,
  FaDatabase,
  FaArrowLeft,
  FaRocket,
} from "react-icons/fa";
import { SiNextdotjs, SiExpress, SiJquery, SiDotnet } from "react-icons/si";

export default function CustomDocs() {
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
            <FaCode className="w-8 h-8 text-brand-accent" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            Custom Website Integration
          </h1>
        </div>
        <p className="text-lg text-gray-300">
          Choose your technology stack to get started with Voicero.AI
          integration
        </p>
      </div>

      {/* Technology Selection Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Regular HTML */}
        <Link
          href="/docs/custom/html"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gray-800 rounded-xl">
              <FaHtml5 className="w-8 h-8 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">
                Regular HTML
              </h3>
              <p className="text-gray-300">Simple script integration</p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Add Voicero.AI to any website with a simple script tag. No
            frameworks required.
          </p>
        </Link>

        {/* React */}
        <Link
          href="/docs/custom/react"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gray-800 rounded-xl">
              <FaReact className="w-8 h-8 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">React</h3>
              <p className="text-gray-300">
                Integration for React applications
              </p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Learn how to integrate Voicero.AI with your React single-page
            application.
          </p>
        </Link>

        {/* Next.js */}
        <Link
          href="/docs/custom/nextjs"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gray-800 rounded-xl">
              <SiNextdotjs className="w-8 h-8 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">Next.js</h3>
              <p className="text-gray-300">
                Integration for Next.js applications
              </p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Add Voicero.AI to your Next.js application with proper SSR support.
          </p>
        </Link>

        {/* Vue.js */}
        <Link
          href="/docs/custom/vuejs"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gray-800 rounded-xl">
              <FaVuejs className="w-8 h-8 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">Vue.js</h3>
              <p className="text-gray-300">Integration for Vue applications</p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Learn how to add Voicero.AI to your Vue.js single-page application.
          </p>
        </Link>

        {/* Angular */}
        <Link
          href="/docs/custom/angular"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gray-800 rounded-xl">
              <FaAngular className="w-8 h-8 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">Angular</h3>
              <p className="text-gray-300">
                Integration for Angular applications
              </p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Add Voicero.AI to your Angular application with proper component
            integration.
          </p>
        </Link>

        {/* Node.js */}
        <Link
          href="/docs/custom/nodejs"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gray-800 rounded-xl">
              <FaNodeJs className="w-8 h-8 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">Node.js</h3>
              <p className="text-gray-300">
                Server-side integration with Node.js
              </p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Learn how to integrate Voicero.AI with your Node.js backend
            applications.
          </p>
        </Link>

        {/* Express */}
        <Link
          href="/docs/custom/express"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gray-800 rounded-xl">
              <SiExpress className="w-8 h-8 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">Express</h3>
              <p className="text-gray-300">
                Integration for Express.js applications
              </p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Add Voicero.AI to your Express.js web applications with proper
            routing.
          </p>
        </Link>

        {/* ASP.NET Core */}
        <Link
          href="/docs/custom/aspnetcore"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gray-800 rounded-xl">
              <SiDotnet className="w-8 h-8 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">
                ASP.NET Core
              </h3>
              <p className="text-gray-300">
                Integration for .NET Core applications
              </p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Learn how to add Voicero.AI to your ASP.NET Core web applications.
          </p>
        </Link>

        {/* ASP.NET */}
        <Link
          href="/docs/custom/aspnet"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gray-800 rounded-xl">
              <SiDotnet className="w-8 h-8 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">ASP.NET</h3>
              <p className="text-gray-300">Integration for classic ASP.NET</p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Add Voicero.AI to your classic ASP.NET web applications.
          </p>
        </Link>

        {/* jQuery */}
        <Link
          href="/docs/custom/jquery"
          className="group bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 
                   hover:border-gray-700 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gray-800 rounded-xl">
              <SiJquery className="w-8 h-8 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">jQuery</h3>
              <p className="text-gray-300">Integration with jQuery</p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Learn how to add Voicero.AI to websites using jQuery.
          </p>
        </Link>
      </div>

      {/* Need Help */}
      <div className="bg-gray-900/50 rounded-xl p-6 text-center">
        <p className="text-gray-300 mb-4">
          Need help with integration? Our support team is here for you.
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
