"use client";

import React from "react";
import { motion } from "framer-motion";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
      {/* Background Shapes */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      {/* Our Why Content Section */}
      <section className="relative z-10 pt-28 pb-20 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-5xl mx-auto backdrop-blur-xl bg-white/10 border border-purple-500/30 rounded-3xl p-8 sm:p-10"
        >
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-8 leading-tight bg-gradient-to-r from-white via-purple-200 to-violet-200 bg-clip-text text-transparent">
            Our <span className="text-purple-400">Why</span>
          </h1>

          <div className="space-y-8 text-lg sm:text-xl text-gray-200">
            <p>
              At Voicero, we think every online store deserves the same tools
              the big guys have without breaking the bank. After spending years
              building and scaling several 7 figure e-commerce stores, we
              realized firsthand how powerful{" "}
              <span className="bg-purple-500 text-white px-2 py-1 rounded">
                AI can be at boosting conversions
              </span>
              , often 3 to 5 times better than traditional methods. But here's
              the catch: those top tier AI tools were either way too expensive
              or super complicated to use. We created Voicero to solve exactly
              that problem.
            </p>

            <p>
              Our main goal is pretty straightforward:{" "}
              <span className="bg-purple-500 text-white px-2 py-1 rounded">
                help entrepreneurs succeed
              </span>
              . When your store converts better, you're not just throwing money
              at ads that don't work; you're actually growing, reinvesting in
              better products, happier customers, and an awesome team. Voicero
              bundles all our best AI tricks into a simple, user friendly voice
              assistant that handles everything from returns and product
              recommendations to turning casual visitors into loyal customers
              without needing extra staff.
            </p>

            <p>
              At our core, we're guided by four key values.{" "}
              <span className="bg-purple-500 text-white px-2 py-1 rounded">
                Innovation First
              </span>{" "}
              means we never stop improving.{" "}
              <span className="bg-purple-500 text-white px-2 py-1 rounded">
                Customer Focused
              </span>{" "}
              reminds us it's all about delivering real results, not just fancy
              numbers.{" "}
              <span className="bg-purple-500 text-white px-2 py-1 rounded">
                Global Impact
              </span>{" "}
              is why we keep our tools affordable, so businesses everywhere can
              level up. And{" "}
              <span className="bg-purple-500 text-white px-2 py-1 rounded">
                Passion Driven
              </span>{" "}
              is the reason we hustle late nights, excited to solve real
              problems. Bottom line: we built Voicero because we genuinely care
              about making your business thrive.
            </p>

            <div className="border-l-4 border-purple-500/70 pl-6 py-2 mt-10">
              <p className="text-2xl font-medium text-white">
                So, start succeeding.
              </p>
              <p className="text-2xl font-medium text-white">
                Because when everyone does,{" "}
                <span className="bg-purple-500 text-white px-2 py-1 rounded">
                  no one is left behind
                </span>
                .
              </p>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
