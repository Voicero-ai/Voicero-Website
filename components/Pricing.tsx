"use client";

import { motion } from "framer-motion";
import { FaCheck } from "react-icons/fa";
import Link from "next/link";

const plans = [
  {
    name: "Starter",
    price: 1.0,
    desc: "Pay per query for your first 100 queries",
    usage: true,
    features: [
      "Up to 100 chat interactions",
      "Manage customer returns",
      "Manage customer subscriptions",
      "Extensive order management",
      "Hands off page navigation",
      "Order tracking and status updates",
      "Schedule meetings",
      "General support",
      "Single website integration",
      "Documentation access",
    ],
  },
  {
    name: "Enterprise",
    price: 0.8,
    desc: "Automatically upgrade after 100 queries",
    usage: true,
    features: [
      "All Starter features",
      "Unlimited chat interactions",
      "Advanced voice commands",
      "Custom support",
    ],
  },
];

export default function Pricing() {
  const fade = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
  };
  const base =
    "h-full p-8 backdrop-blur-xl bg-white/10 border border-purple-500/30 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300";

  return (
    <section
      id="pricing"
      className="relative py-24 bg-gray-900 text-white overflow-hidden"
    >
      {/* Background Shapes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4">
        <motion.div
          {...fade}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-white via-purple-200 to-violet-200 bg-clip-text text-transparent">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Everyone starts with the starter plan. After 100 queries, you will
            automatically be upgraded to the enterprise plan.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((p, i) => (
            <motion.div
              key={p.name}
              {...fade}
              transition={{ duration: 0.6, delay: i * 0.2 }}
            >
              <div
                className={`${base} ${
                  p.usage ? "ring-1 ring-purple-400/30" : ""
                }`}
              >
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-white mb-2">
                    {p.name}
                  </h3>
                  <p className="text-gray-300 mb-4">{p.desc}</p>
                  <div className="flex items-baseline justify-center mb-6">
                    <span className="text-5xl font-bold text-white">
                      ${p.price.toFixed(2)}
                    </span>
                    <span className="text-gray-300 ml-2">per query</span>
                  </div>
                  <Link
                    href="https://calendly.com/voicero-info/voicero-ai-set-up?share_attribution=expiring_link"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3 px-6 rounded-2xl transition-all duration-200 bg-gradient-to-r from-purple-600 to-violet-600 hover:brightness-110 text-white"
                  >
                    Get Started
                  </Link>
                </div>

                <div className="space-y-4">
                  {p.features.map((f, j) => (
                    <div key={j} className="flex items-center">
                      <FaCheck className="text-purple-400 mr-3 flex-shrink-0" />
                      <span className="text-gray-300">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
