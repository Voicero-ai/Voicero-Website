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
    "h-full p-8 bg-gray-900 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 border";

  return (
    <section id="pricing" className="py-20 bg-black">
      <div className="container mx-auto px-4">
        <motion.div
          {...fade}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-white mb-4">
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
                  p.usage ? "border-brand-accent" : "border-gray-700"
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
                    className="block w-full py-3 px-6 rounded-lg transition-colors duration-200 bg-gray-800 hover:bg-gray-700 text-white"
                  >
                    Get Started
                  </Link>
                </div>

                <div className="space-y-4">
                  {p.features.map((f, j) => (
                    <div key={j} className="flex items-center">
                      <FaCheck className="text-brand-accent mr-3 flex-shrink-0" />
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
