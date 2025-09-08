"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa";

export default function ShopifyGuide() {
  const [shopifyUrl, setShopifyUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/shopify/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopifyUrl, companyName, email }),
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitted(true);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pt-20 bg-black min-h-screen pb-12">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
        >
          <FaArrowLeft className="w-4 h-4" />
          <span>Home</span>
        </Link>
      </div>

      <div className="backdrop-blur-xl bg-white/5 border border-purple-500/20 rounded-3xl p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-purple-200 mb-6">
          Shopify Store Installation
        </h1>
        <div className="space-y-6">
          <div className="bg-white/5 border border-purple-500/20 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="bg-purple-500/30 text-purple-300 font-bold rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-xs sm:text-sm flex-shrink-0 mt-0.5">
                1
              </span>
              <div className="flex-1">
                <p className="text-gray-300 mb-3">
                  Fill out the form below with your Shopify store details.
                </p>
                {submitted ? (
                  <div className="text-green-300 bg-green-900/20 border border-green-700/40 rounded-lg p-3">
                    Request submitted. Please check your email for next steps.
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Your Shopify URL</label>
                      <input
                        type="url"
                        placeholder="example.myshopify.com"
                        className="w-full bg-black/30 border border-purple-500/30 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
                        value={shopifyUrl}
                        onChange={(e) => setShopifyUrl(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Company Name</label>
                      <input
                        type="text"
                        placeholder="Your company name"
                        className="w-full bg-black/30 border border-purple-500/30 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Email Address</label>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        className="w-full bg-black/30 border border-purple-500/30 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-violet-600 px-5 py-2 rounded-lg font-semibold hover:scale-[1.02] transition"
                    >
                      Submit Request
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white/5 border border-purple-500/20 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="bg-purple-500/30 text-purple-300 font-bold rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-xs sm:text-sm flex-shrink-0 mt-0.5">
                2
              </span>
              <p className="text-gray-300">
                Wait 1 hour for a response and follow email instructions.
              </p>
            </div>
          </div>

          <div className="bg-white/5 border border-purple-500/20 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="bg-purple-500/30 text-purple-300 font-bold rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-xs sm:text-sm flex-shrink-0 mt-0.5">
                3
              </span>
              <p className="text-gray-300">Click the Sync button and then Activate.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
