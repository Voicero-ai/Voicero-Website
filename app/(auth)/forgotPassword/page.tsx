"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { FaEnvelope } from "react-icons/fa";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      setEmailSent(true);
    }, 1500);
  };

  return (
    <main className="min-h-screen bg-gray-900">
      <div className="container mx-auto px-4 py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <Link href="/">
              <h1
                className="text-4xl font-bold bg-clip-text text-transparent 
                            bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                            inline-block mb-4"
              >
                Voicero.AI
              </h1>
            </Link>
            <p className="text-lg text-white">Reset your password</p>
          </div>

          {/* Reset Password Form */}
          <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700">
            {emailSent ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center max-w-xl mx-auto"
              >
                <div className="text-brand-accent mb-4 text-xl">✓</div>
                <h2 className="text-xl font-semibold text-white mb-2">
                  Check your email
                </h2>
                <p className="text-gray-300 mb-6">
                  We&apos;ve sent password reset instructions to your email
                  address.
                </p>
                <Link
                  href="/login"
                  className="text-brand-accent hover:text-brand-accent/80 transition-colors"
                >
                  Back to login
                </Link>
              </motion.div>
            ) : (
              <form
                className="grid gap-6 max-w-xl mx-auto"
                onSubmit={handleSubmit}
              >
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaEnvelope className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      required
                      className="block w-full pl-10 pr-3 py-2 border border-gray-600 
                               rounded-xl focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent 
                               transition-colors bg-gray-700 text-white"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 px-4 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                           text-white rounded-xl font-medium shadow-lg shadow-brand-accent/20
                           hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow"
                  disabled={isLoading}
                >
                  {isLoading ? "Sending..." : "Reset Password"}
                </motion.button>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-brand-accent hover:text-brand-accent/80 transition-colors text-sm"
                  >
                    Back to login
                  </Link>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </main>
  );
}
