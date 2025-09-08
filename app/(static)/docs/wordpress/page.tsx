"use client";

import React from "react";
import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa";

export default function WordPressGuide() {
  const steps = [
    {
      label: (
        <a
          href="https://wordpress.com/plugins/voicero-ai/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-300 hover:text-purple-200 hover:underline"
        >
          Go to wordpress.com/plugins/voicero-ai
        </a>
      ),
    },
    { label: "Install for free" },
    { label: "Click the Quick Connect Button" },
    { label: "Click the Sync button" },
    { label: "Click the Activate button" },
  ];

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
          WordPress Store Installation
        </h1>
        <div className="space-y-4">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-3">
              <span className="bg-purple-500/30 text-purple-300 font-bold rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-xs sm:text-sm flex-shrink-0 mt-0.5">
                {idx + 1}
              </span>
              <p className="text-gray-300 text-base">{step.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
