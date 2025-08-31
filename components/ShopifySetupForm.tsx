"use client";

import React, { useState } from "react";
import { ArrowRight } from "lucide-react";

interface ShopifySetupFormProps {
  onSuccess?: () => void;
}

const ShopifySetupForm: React.FC<ShopifySetupFormProps> = ({ onSuccess }) => {
  const [shopifyUrl, setShopifyUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      // Validate form
      if (!shopifyUrl) {
        throw new Error("Shopify URL is required");
      }
      if (!companyName) {
        throw new Error("Company name is required");
      }
      if (!email) {
        throw new Error("Email is required");
      }

      // Ensure URL has myshopify.com
      let formattedUrl = shopifyUrl.trim();
      if (!formattedUrl.includes(".myshopify.com")) {
        if (!formattedUrl.includes(".")) {
          formattedUrl = `${formattedUrl}.myshopify.com`;
        } else {
          throw new Error(
            "Please enter a valid Shopify URL (example.myshopify.com)"
          );
        }
      }

      // Send to API
      const response = await fetch("/api/shopify/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shopifyUrl: formattedUrl,
          companyName,
          email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit form");
      }

      // Success
      setSuccess(true);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-purple-300">Request Received!</h3>
        <p className="text-gray-300">
          We'll set up your Shopify store within 1 hour and send instructions to{" "}
          <span className="text-purple-300">{email}</span>
        </p>
        <p className="text-sm text-gray-400 mt-4">
          Be sure to check your inbox (and spam folder) for our email
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-[500px]">
      <div>
        <label
          htmlFor="shopifyUrl"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Your Shopify URL
        </label>
        <div className="relative">
          <input
            type="text"
            id="shopifyUrl"
            className="w-full px-4 py-3 bg-gray-800/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-500 min-w-[300px]"
            placeholder="example.myshopify.com"
            value={shopifyUrl}
            onChange={(e) => setShopifyUrl(e.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="companyName"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Company Name
        </label>
        <input
          type="text"
          id="companyName"
          className="w-full px-4 py-2 bg-gray-800/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-500"
          placeholder="Your company name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Email Address
        </label>
        <input
          type="email"
          id="email"
          className="w-full px-4 py-2 bg-gray-800/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-500"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 p-2 rounded-lg">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="w-full bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-2 rounded-lg font-medium hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-70"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Processing...
          </>
        ) : (
          <>
            Submit Request
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  );
};

export default ShopifySetupForm;
