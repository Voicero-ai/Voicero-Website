"use client";

import { FaShopify, FaWordpress, FaRocket } from "react-icons/fa";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative min-h-screen w-full flex flex-col items-center justify-center px-4 bg-black overflow-hidden">
      {/* Glowing background circle */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"
        aria-hidden="true"
      >
        <div className="w-[350px] h-[350px] sm:w-[500px] sm:h-[500px] md:w-[700px] md:h-[700px] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-600/40 via-purple-600/30 to-transparent blur-3xl opacity-80" />
      </div>
      {/* Bottom fade gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black via-black/95 to-transparent z-10" />
      <div className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto text-center relative z-10">
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-widest text-gray-100 mb-6 leading-tight">
          <span className="block">The <span className="bg-clip-text text-transparent bg-gradient-to-r from-pink-400 via-fuchsia-500 to-purple-500">chatbot</span> that doesn&apos;t</span>
          <span className="block">confuse your customers</span>
        </h1>
        <p className="text-lg sm:text-xl md:text-2xl text-gray-300 mb-10 max-w-xl mx-auto">
          Voicero is a plugin AI chatbot for any website, nearly eliminates customer complaints by handling everything from returns, subscriptions, product recommendations.
        </p>
        <div className="flex flex-col gap-4 w-full justify-center">
          <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
            <Link href="https://calendly.com/voicero-info/voicero-ai-set-up?share_attribution=expiring_link" className="w-full sm:w-auto" target="_blank" rel="noopener noreferrer">
              <button className="btn-primary w-full flex items-center justify-center gap-2 px-8 py-4 text-lg">
                <FaWordpress className="w-6 h-6" /> Wordpress Store
              </button>
            </Link>
            <Link href="https://calendly.com/voicero-info/voicero-ai-set-up?share_attribution=expiring_link" className="w-full sm:w-auto" target="_blank" rel="noopener noreferrer">
              <button className="btn-primary w-full flex items-center justify-center gap-2 px-8 py-4 text-lg">
                <FaShopify className="w-6 h-6" /> Shopify Store
              </button>
            </Link>
          </div>
          <div className="flex justify-center w-full">
            <Link href="https://calendly.com/voicero-info/voicero-ai-set-up?share_attribution=expiring_link" className="w-full sm:w-auto" target="_blank" rel="noopener noreferrer">
              <button className="btn-primary w-full flex items-center justify-center gap-2 px-8 py-4 text-lg mt-2">
                <FaRocket className="w-6 h-6" /> Custom Store
              </button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
