"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageCircle,
  Mic,
  Type,
  ShoppingCart,
  RefreshCw,
  Star,
  Navigation,
  Package,
  User,
  Calendar,
  Headphones,
  TrendingUp,
  Zap,
  Eye,
  BarChart3,
  Sparkles,
  ChevronRight,
  Play,
  Volume2,
  Search,
  Bot,
  ArrowRight,
  Clock,
  Heart,
} from "lucide-react";
import Link from "next/link";
import WebsitePreview from "../../components/WebsitePreview";
import { FaShopify, FaWordpress, FaRocket } from "react-icons/fa";
import { trackShopifyConversion } from "../../lib/conversion-tracking";

const VoiceroWebsite = () => {
  const [particles, setParticles] = useState<any[]>([]);

  const containerRef = useRef(null);

  useEffect(() => {
    const newParticles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 1,
      speed: Math.random() * 2 + 1,
      direction: Math.random() * 360,
    }));
    setParticles(newParticles);

    const interval = setInterval(() => {
      setParticles((prev) =>
        prev.map((particle) => ({
          ...particle,
          x:
            (particle.x + Math.cos(particle.direction) * particle.speed * 0.1) %
            100,
          y:
            (particle.y + Math.sin(particle.direction) * particle.speed * 0.1) %
            100,
        }))
      );
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white overflow-x-hidden relative">
      {/* Floating Particles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute w-1 h-1 bg-purple-400 rounded-full opacity-20"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              transform: `scale(${particle.size / 2})`,
            }}
          />
        ))}
      </div>

      {/* Animated Background Shapes */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      <div className="relative z-10" ref={containerRef}>
        {/* Hero Section */}
        <section
          id="top"
          className="min-h-[calc(100vh-80px)] pt-24 md:pt-28 flex items-center px-4 sm:px-6 relative"
        >
          <div className="max-w-7xl mx-auto w-full">
            <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
              {/* Left Box - Main Content */}
              <div className="backdrop-blur-xl bg-white/10 border border-purple-500/30 rounded-2xl p-2 sm:p-3 md:p-3 lg:p-4 mb-6 shadow-2xl md:hover:scale-105 transition-all duration-500 flex flex-col">
                <div>
                  <div className="inline-flex items-center gap-1 mb-2 px-2 py-1 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-full border border-purple-500/30">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    <span className="text-purple-300 font-medium text-xs sm:text-sm">
                      AI-Powered Customer Experience
                    </span>
                  </div>

                  <h1 className="text-xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-2 bg-gradient-to-r from-white via-purple-200 to-violet-200 bg-clip-text text-transparent leading-tight">
                    The free chatbot that
                    <br />
                    <span className="text-purple-400">
                      makes you more money
                    </span>
                  </h1>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="text-xs sm:text-sm text-gray-300 mr-2">
                      Available on
                    </span>
                    <Link
                      href="/docs/shopify"
                      onClick={() =>
                        trackShopifyConversion(
                          `shopify_click_badge_${Date.now()}`
                        )
                      }
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-500/30 bg-white/10 hover:bg-white/15 transition-colors text-xs sm:text-sm text-gray-200"
                    >
                      <FaShopify className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
                      <span>Shopify</span>
                    </Link>
                    <Link
                      href="/docs/wordpress"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-500/30 bg-white/10 hover:bg-white/15 transition-colors text-xs sm:text-sm text-gray-200"
                    >
                      <FaWordpress className="w-4 h-4 sm:w-5 sm:h-5 text-blue-300" />
                      <span>WordPress</span>
                    </Link>
                    <Link
                      href="/docs/custom/html"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-500/30 bg-white/10 hover:bg-white/15 transition-colors text-xs sm:text-sm text-gray-200"
                    >
                      <FaRocket className="w-4 h-4 sm:w-5 sm:h-5 text-purple-300" />
                      <span>Custom</span>
                    </Link>
                  </div>

                  {/* Install for free now section - moved up under badges */}
                  <div className="mt-4 text-center">
                    <div className="h-6 mb-3" aria-hidden="true"></div>
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-2 bg-gradient-to-r from-white via-purple-200 to-violet-200 bg-clip-text text-transparent">
                      Install for free now
                    </h2>
                    {/* Arrow pointing down */}
                    <div className="flex justify-center">
                      <div className="animate-bounce">
                        <svg
                          className="w-6 h-6 text-purple-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 14l-7 7m0 0l-7-7m7 7V3"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Platform Selection Buttons */}
                  <div className="mt-6">
                    <h3 className="text-center text-sm font-bold text-purple-200 mb-4">
                      Choose your platform
                    </h3>
                    <div className="flex flex-col gap-3">
                      <Link
                        href="/docs/wordpress"
                        className="backdrop-blur-xl border rounded-xl px-4 py-3 hover:shadow-xl transition-all duration-300 flex items-center justify-center bg-gradient-to-r from-white/15 to-purple-500/10 border-purple-400/40 hover:border-purple-400/60 hover:bg-gradient-to-r hover:from-white/20 hover:to-purple-500/15 text-gray-100 font-semibold text-sm"
                      >
                        WordPress
                      </Link>
                      <Link
                        href="/docs/shopify"
                        onClick={() =>
                          trackShopifyConversion(
                            `shopify_click_button_${Date.now()}`
                          )
                        }
                        className="backdrop-blur-xl border rounded-xl px-4 py-3 hover:shadow-xl transition-all duration-300 flex items-center justify-center bg-gradient-to-r from-white/15 to-purple-500/10 border-purple-400/40 hover:border-purple-400/60 hover:bg-gradient-to-r hover:from-white/20 hover:to-purple-500/15 text-gray-100 font-semibold text-sm"
                      >
                        Shopify
                      </Link>
                      <Link
                        href="/docs/custom/html"
                        className="backdrop-blur-xl border rounded-xl px-4 py-3 hover:shadow-xl transition-all duration-300 flex items-center justify-center bg-gradient-to-r from-white/15 to-purple-500/10 border-purple-400/40 hover:border-purple-400/60 hover:bg-gradient-to-r hover:from-white/20 hover:to-purple-500/15 text-gray-100 font-semibold text-sm"
                      >
                        Custom Website
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Box - Website Preview */}
              <div className="backdrop-blur-xl bg-gradient-to-br from-purple-900/40 via-violet-900/30 to-indigo-900/40 border border-purple-400/50 rounded-2xl p-2 sm:p-3 md:p-3 lg:p-4 mb-6 shadow-2xl shadow-purple-500/20 md:hover:scale-105 md:hover:shadow-purple-500/30 transition-all duration-500 flex flex-col relative overflow-hidden">
                {/* Animated background elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/20 to-transparent rounded-full blur-2xl animate-pulse"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-violet-500/20 to-transparent rounded-full blur-2xl animate-pulse delay-1000"></div>

                <div className="relative z-10">
                  <div className="inline-flex items-center gap-1 mb-2 px-2 py-1 bg-gradient-to-r from-purple-500/30 to-violet-500/30 rounded-full border border-purple-400/50 shadow-lg shadow-purple-500/20">
                    <div className="w-5 h-5 bg-gradient-to-r from-purple-400 to-violet-400 rounded-full animate-pulse"></div>
                    <span className="text-purple-200 font-semibold text-xs sm:text-sm">
                      🚀 Live Demo
                    </span>
                  </div>

                  <h2 className="text-xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-2 bg-gradient-to-r from-white via-purple-200 to-violet-200 bg-clip-text text-transparent leading-tight">
                    Try Voicero AI
                    <br />
                    <span className="text-purple-400">
                      without installing on your website
                    </span>
                  </h2>

                  {/* Enhanced preview section */}
                  <div className="bg-gradient-to-br from-white/10 to-purple-500/10 border border-purple-400/30 rounded-xl p-2 shadow-lg shadow-purple-500/10">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-violet-500 rounded-lg flex items-center justify-center">
                        <Search className="w-4 h-4 text-white" />
                      </div>
                      <h3 className="text-base font-bold text-gray-300">
                        Copy and paste your website URL in the box below for
                        live demo
                      </h3>
                    </div>

                    <WebsitePreview />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Voice AI vs Text AI Section */}
        <section className="py-24 px-6 bg-gradient-to-b from-transparent to-purple-900/10">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                Two Powerful AI Systems
              </h2>
              <p className="text-xl text-gray-300 max-w-3xl mx-auto">
                Experience the future with our revolutionary dual AI technology
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12">
              {/* Voice AI Section */}
              <div className="backdrop-blur-xl bg-gradient-to-br from-purple-900/30 to-violet-900/30 border border-purple-500/30 rounded-3xl p-10 hover:scale-105 transition-all duration-500 group">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                    <Mic className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-purple-300">
                      Voice AI
                    </h3>
                    <p className="text-purple-200">
                      Hands-free site navigation
                    </p>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-3 text-gray-300">
                    <Search className="w-5 h-5 text-purple-400" />
                    <span>
                      Search your entire site without touching anything
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <Volume2 className="w-5 h-5 text-purple-400" />
                    <span>Natural voice commands and responses</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <Zap className="w-5 h-5 text-purple-400" />
                    <span>Real-time website research and auto actions</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <Navigation className="w-5 h-5 text-purple-400" />
                    <span>Complete hands-free navigation experience</span>
                  </div>
                </div>

                <div className="bg-purple-900/50 rounded-2xl p-6 border border-purple-500/20 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="bg-purple-800/50 rounded-lg p-3 mb-3">
                        <p className="text-purple-200 font-medium">
                          👤 "Show me wireless headphones under $100"
                        </p>
                      </div>
                      <div className="bg-purple-700/30 rounded-lg p-3">
                        <p className="text-purple-100">
                          🤖 "I found 12 wireless headphones under $100. Here
                          are the top 3 based on reviews: Sony WH-CH720N for
                          $89, JBL Tune 760NC for $79, and Audio-Technica
                          ATH-M40x for $99. Would you like me to add any to your
                          cart?"
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <Link href="/voice-ai">
                  <button className="w-full bg-gradient-to-r from-purple-600 to-violet-600 px-6 py-3 rounded-xl font-semibold hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2">
                    Learn More About Voice AI
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
              </div>

              {/* Text AI Section */}
              <div className="backdrop-blur-xl bg-gradient-to-br from-blue-900/30 to-indigo-900/30 border border-blue-500/30 rounded-3xl p-10 hover:scale-105 transition-all duration-500 group">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                    <Type className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-blue-300">
                      Text AI
                    </h3>
                    <p className="text-blue-200">Instant customer support</p>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-3 text-gray-300">
                    <MessageCircle className="w-5 h-5 text-blue-400" />
                    <span>Instant answers to customer questions</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <RefreshCw className="w-5 h-5 text-blue-400" />
                    <span>Order updates and return processing</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <ShoppingCart className="w-5 h-5 text-blue-400" />
                    <span>Auto-add items to cart</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <Bot className="w-5 h-5 text-blue-400" />
                    <span>Vectorized content for lightning-fast retrieval</span>
                  </div>
                </div>

                <div className="bg-blue-900/50 rounded-2xl p-6 border border-blue-500/20 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="bg-blue-800/50 rounded-lg p-3 mb-3">
                        <p className="text-blue-200 font-medium">
                          👤 "I need to return my order #12345"
                        </p>
                      </div>
                      <div className="bg-blue-700/30 rounded-lg p-3">
                        <p className="text-blue-100">
                          🤖 "I found your order #12345 for the Nike Air Max
                          purchased on March 15th. I've initiated your return
                          and emailed you a prepaid shipping label. Your refund
                          will process within 3-5 business days. Is there
                          anything else I can help with?"
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <Link href="/text-ai">
                  <button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 rounded-xl font-semibold hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2">
                    Learn More About Text AI
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Custom Intelligence Section */}
        <section className="py-24 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left side - Content */}
              <div className="backdrop-blur-xl bg-gradient-to-r from-violet-900/30 to-purple-900/30 border border-violet-500/30 rounded-3xl p-10 hover:scale-105 transition-all duration-500">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl flex items-center justify-center hover:scale-110 hover:rotate-6 transition-all duration-300">
                    <Bot className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                      Custom Intelligence
                    </h2>
                    <p className="text-violet-300">
                      Tailored for your business
                    </p>
                  </div>
                </div>

                <p className="text-lg text-gray-300 mb-8 leading-relaxed">
                  Get AI responses trained on your company data and customer
                  patterns. Our AI learns your business inside and out to
                  provide personalized experiences that feel like talking to
                  your best support agent.
                </p>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-3 text-gray-300">
                    <Sparkles className="w-5 h-5 text-violet-400" />
                    <span>
                      AI trained on your specific products and policies
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <Eye className="w-5 h-5 text-blue-400" />
                    <span>
                      Deep insights into customer behavior and preferences
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <BarChart3 className="w-5 h-5 text-purple-400" />
                    <span>95% success rate in finding what users need</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <Bot className="w-5 h-5 text-indigo-400" />
                    <span>
                      Continuous learning from every customer interaction
                    </span>
                  </div>
                </div>
                <Link href="/features">
                  <button className="bg-gradient-to-r from-violet-600 to-purple-600 px-8 py-4 rounded-xl font-semibold hover:scale-105 transition-all duration-300 flex items-center gap-2">
                    See All Features
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </Link>
              </div>

              {/* Right side - Dashboard Preview */}
              <div className="backdrop-blur-xl bg-white/5 border border-purple-500/20 rounded-3xl p-8 hover:scale-105 transition-all duration-500">
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold text-purple-300">
                      Customer Insights Dashboard
                    </h3>
                    <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  </div>

                  {/* Mock Analytics */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-purple-900/40 rounded-xl p-4 border border-purple-500/20">
                      <div className="text-2xl font-bold text-purple-300">
                        2,847
                      </div>
                      <div className="text-sm text-gray-400">
                        Questions Answered
                      </div>
                    </div>
                    <div className="bg-violet-900/40 rounded-xl p-4 border border-violet-500/20">
                      <div className="text-2xl font-bold text-violet-300">
                        95.2%
                      </div>
                      <div className="text-sm text-gray-400">Success Rate</div>
                    </div>
                  </div>

                  {/* Mock Popular Questions */}
                  <div className="bg-purple-900/30 rounded-xl p-4 border border-purple-500/10">
                    <h4 className="text-lg font-semibold text-purple-200 mb-3">
                      Top Customer Questions
                    </h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                        <span className="text-gray-300">
                          "How do I return an item?"
                        </span>
                        <span className="text-purple-400 ml-auto">
                          342 asks
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-2 h-2 bg-violet-400 rounded-full"></div>
                        <span className="text-gray-300">
                          "Track my order #..."
                        </span>
                        <span className="text-violet-400 ml-auto">
                          289 asks
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                        <span className="text-gray-300">
                          "Product recommendations for..."
                        </span>
                        <span className="text-blue-400 ml-auto">195 asks</span>
                      </div>
                    </div>
                  </div>

                  {/* Mock Response Preview */}
                  <div className="bg-gradient-to-r from-purple-800/20 to-violet-800/20 rounded-xl p-4 border border-purple-400/20">
                    <h4 className="text-sm font-semibold text-purple-200 mb-2">
                      Custom Response Example
                    </h4>
                    <p className="text-xs text-gray-300 italic">
                      "Based on your purchase history and our current inventory,
                      I recommend the Pro Max version which is 30% off today and
                      includes free shipping to your usual address."
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Core Technology Features */}
        <section className="py-24 px-6 bg-gradient-to-b from-purple-900/10 to-transparent">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                Powered by Advanced AI Technology
              </h2>
              <p className="text-xl text-gray-300 max-w-3xl mx-auto">
                Our dual AI systems work together to deliver exceptional
                customer experiences
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              {/* Realtime Intelligence */}
              <div className="backdrop-blur-xl bg-white/10 border border-purple-500/20 rounded-2xl p-8 hover:scale-105 transition-all duration-300">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-violet-600 rounded-xl flex items-center justify-center">
                    <Zap className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-purple-400">
                      Realtime Intelligence
                    </h3>
                    <p className="text-gray-400">
                      Always up-to-date information
                    </p>
                  </div>
                </div>
                <p className="text-gray-300 mb-6">
                  Research across your entire website with live data. Our AI
                  performs real-time research and auto-actions to always provide
                  current inventory, pricing, and availability.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    <span>Live website research</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    <span>Auto-actions for real-time data</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    <span>Never outdated information</span>
                  </div>
                </div>
              </div>

              {/* Predictive Actions */}
              <div className="backdrop-blur-xl bg-white/10 border border-violet-500/20 rounded-2xl p-8 hover:scale-105 transition-all duration-300">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-gradient-to-r from-violet-600 to-blue-600 rounded-xl flex items-center justify-center">
                    <Eye className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-violet-400">
                      Predictive Actions
                    </h3>
                    <p className="text-gray-400">AI learns customer patterns</p>
                  </div>
                </div>
                <p className="text-gray-300 mb-6">
                  Anticipate customer needs, suggest relevant products, and
                  guide users to conversion before they even ask. Our AI becomes
                  smarter with every interaction.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="w-2 h-2 bg-violet-400 rounded-full"></div>
                    <span>Smart product recommendations</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="w-2 h-2 bg-violet-400 rounded-full"></div>
                    <span>Proactive customer assistance</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="w-2 h-2 bg-violet-400 rounded-full"></div>
                    <span>Continuous learning AI</span>
                  </div>
                </div>
              </div>

              {/* Lightning Performance */}
              <div className="backdrop-blur-xl bg-white/10 border border-blue-500/20 rounded-2xl p-8 hover:scale-105 transition-all duration-300">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                    <BarChart3 className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-blue-400">
                      Lightning Performance
                    </h3>
                    <p className="text-gray-400">
                      Vectorized content retrieval
                    </p>
                  </div>
                </div>
                <p className="text-gray-300 mb-6">
                  Instant access to any information on your site with our
                  advanced vectorization technology. Fast retrieval means no
                  waiting or searching for customers.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span>Vectorized website content</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span>Lightning-fast responses</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span>95% success rate in finding what users need</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Business & Customer Benefits */}
        <section className="py-24 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                Why Voicero.AI Transforms Both Sides of the Equation
              </h2>
              <p className="text-xl text-gray-300 max-w-3xl mx-auto">
                Our AI doesn't just answer questions - it creates value for your
                business and delight for your customers
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12">
              {/* Why It Helps Your Business */}
              <div className="backdrop-blur-xl bg-gradient-to-br from-purple-900/30 to-violet-900/30 border border-purple-500/30 rounded-3xl p-8 hover:scale-105 transition-all duration-500">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-purple-200 mb-2">
                    Why It Helps Your Business
                  </h3>
                  <p className="text-gray-400">
                    Transform your operations and boost your bottom line
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-purple-600/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                      <Zap className="w-4 h-4 text-purple-300" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-purple-200 mb-2">
                        Reduce Support Costs
                      </h4>
                      <p className="text-gray-300 text-sm">
                        Automate routine customer inquiries and reduce the need
                        for human support staff, cutting operational costs while
                        maintaining quality service.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-violet-600/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                      <ShoppingCart className="w-4 h-4 text-violet-300" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-violet-200 mb-2">
                        Increase Sales & Conversions
                      </h4>
                      <p className="text-gray-300 text-sm">
                        Guide customers to the right products, handle objections
                        in real-time, and reduce cart abandonment with
                        intelligent assistance.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-blue-600/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                      <BarChart3 className="w-4 h-4 text-blue-300" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-blue-200 mb-2">
                        Gain Customer Insights
                      </h4>
                      <p className="text-gray-300 text-sm">
                        Understand what customers are asking, what they're
                        struggling with, and identify opportunities to improve
                        your products and services.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-indigo-600/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                      <RefreshCw className="w-4 h-4 text-indigo-300" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-indigo-200 mb-2">
                        Scale Without Limits
                      </h4>
                      <p className="text-gray-300 text-sm">
                        Handle unlimited customer interactions simultaneously
                        without adding staff, perfect for growing businesses and
                        seasonal spikes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Why It Helps Your Customers */}
              <div className="backdrop-blur-xl bg-gradient-to-br from-blue-900/30 to-indigo-900/30 border border-blue-500/30 rounded-3xl p-8 hover:scale-105 transition-all duration-500">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <User className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-blue-200 mb-2">
                    Why It Helps Your Customers
                  </h3>
                  <p className="text-gray-400">
                    Deliver exceptional experiences that keep customers coming
                    back
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-blue-600/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                      <Clock className="w-4 h-4 text-blue-300" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-blue-200 mb-2">
                        Instant Answers, 24/7
                      </h4>
                      <p className="text-gray-300 text-sm">
                        No more waiting for business hours or sitting in support
                        queues. Get immediate help whenever they need it, day or
                        night.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-indigo-600/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                      <Sparkles className="w-4 h-4 text-indigo-300" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-indigo-200 mb-2">
                        Personalized Experience
                      </h4>
                      <p className="text-gray-300 text-sm">
                        AI that remembers their preferences, purchase history,
                        and provides tailored recommendations just for them.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-purple-600/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                      <Navigation className="w-4 h-4 text-purple-300" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-purple-200 mb-2">
                        Effortless Navigation
                      </h4>
                      <p className="text-gray-300 text-sm">
                        Find products, track orders, and get support without
                        clicking through multiple pages or learning complex
                        website navigation.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-violet-600/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                      <Heart className="w-4 h-4 text-violet-300" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-violet-200 mb-2">
                        Feel Valued & Understood
                      </h4>
                      <p className="text-gray-300 text-sm">
                        Experience service that feels human and caring, with AI
                        that genuinely helps solve their problems and makes
                        shopping easier.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto text-center">
            <div className="backdrop-blur-xl bg-gradient-to-r from-purple-900/50 to-violet-900/50 border border-purple-500/30 rounded-3xl p-12 hover:scale-105 transition-all duration-500">
              <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-white via-purple-200 to-violet-200 bg-clip-text text-transparent">
                Transform Your Customer Experience Today
              </h2>
              <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
                Join businesses using Voicero to eliminate customer confusion
                and boost conversions with our intelligent AI chatbot that
                understands your business and your customers.
              </p>

              <div className="flex flex-col sm:flex-row gap-6 justify-center">
                <Link href="#top">
                  <button className="group bg-gradient-to-r from-purple-600 to-violet-600 px-12 py-6 rounded-2xl font-bold text-xl hover:scale-110 hover:shadow-2xl hover:shadow-purple-500/25 transition-all duration-300 flex items-center gap-3">
                    Install Now
                    <ArrowRight className="w-6 h-6 group-hover:scale-125 transition-transform duration-300" />
                  </button>
                </Link>
                <button
                  onClick={() => {
                    const topElement = document.getElementById("top");
                    if (topElement) {
                      topElement.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                  className="group backdrop-blur-xl bg-white/10 border border-purple-500/20 px-12 py-6 rounded-2xl font-bold text-xl hover:scale-110 hover:bg-white/15 transition-all duration-300 flex items-center gap-3"
                >
                  Use Demo
                  <Play className="w-6 h-6 group-hover:scale-125 transition-transform duration-300" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default VoiceroWebsite;
