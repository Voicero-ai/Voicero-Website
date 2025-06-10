"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  FaWordpress,
  FaShopify,
  FaKey,
  FaCheck,
  FaCopy,
  FaCode,
  FaNodeJs,
  FaReact,
  FaJs,
  FaHtml5,
  FaAngular,
  FaVuejs,
  FaDotCircle,
} from "react-icons/fa";
import { useRouter } from "next/navigation";

interface NewWebsiteForm {
  name: string;
  url: string;
  type: "WordPress" | "Shopify" | "Custom" | "";
  customType: string;
  plan: "Starter" | "";
}

export default function NewWebsite() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<NewWebsiteForm>({
    name: "",
    url: "",
    type: "",
    customType: "",
    plan: "Starter", // Default to Starter plan
  });
  const [generatedKey] = useState<string>(() => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const length = 64;
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
      .map((x) => chars[x % chars.length])
      .join("");
  });
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFormErrors({});

    // Validate all required fields
    const errors: { [key: string]: string } = {};
    if (!form.name) errors.name = "Required";
    if (!form.url) errors.url = "Required";
    if (!form.type) errors.type = "Required";
    if (form.type === "Custom" && !form.customType)
      errors.customType = "Required";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      // Create website
      const response = await fetch("/api/websites/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          accessKey: generatedKey,
          plan: "Starter", // Always use Starter plan
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create website");
      }

      // Always redirect to Stripe for payment
      const stripeResponse = await fetch("/api/stripe/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          websiteData: data.websiteData,
          successUrl: `${window.location.origin}/app/websites/new/complete?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/app/websites/new?canceled=true`,
        }),
      });

      const stripeData = await stripeResponse.json();
      if (!stripeResponse.ok) {
        throw new Error(
          stripeData.error || "Failed to create checkout session"
        );
      }

      window.location.href = stripeData.url;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormChange = (field: keyof NewWebsiteForm, value: string) => {
    setForm({ ...form, [field]: value });
    // Clear the error for this field when it gets a value
    if (value) {
      setFormErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-brand-text-primary mb-2">
          Connect New Website
        </h1>
        <p className="text-brand-text-secondary">
          Enter your website details to get started
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 overflow-hidden">
          <div className="p-6 border-b border-brand-lavender-light/20">
            <h2 className="text-xl font-semibold text-brand-text-primary">
              Website Details
            </h2>
          </div>

          <div className="p-6 space-y-6">
            {/* Website Name */}
            <div>
              <label className="block text-sm font-medium text-brand-text-secondary mb-2">
                Website Name
                {formErrors.name && (
                  <span className="text-red-500 ml-2 text-sm">
                    {formErrors.name}
                  </span>
                )}
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleFormChange("name", e.target.value)}
                className="block w-full px-4 py-2 border border-brand-lavender-light/20 
                         rounded-xl focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent 
                         transition-colors bg-gray-100 text-black"
                placeholder="My Awesome Website"
              />
            </div>

            {/* Website URL */}
            <div>
              <label className="block text-sm font-medium text-brand-text-secondary mb-2">
                Website URL
                {formErrors.url && (
                  <span className="text-red-500 ml-2 text-sm">
                    {formErrors.url}
                  </span>
                )}
              </label>
              <input
                type="url"
                value={form.url}
                onChange={(e) => handleFormChange("url", e.target.value)}
                className="block w-full px-4 py-2 border border-brand-lavender-light/20 
                         rounded-xl focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent 
                         transition-colors bg-gray-100 text-black"
                placeholder="https://example.com"
              />
            </div>

            {/* Website Type */}
            <div>
              <label className="block text-sm font-medium text-brand-text-secondary mb-4">
                Website Type
                {formErrors.type && (
                  <span className="text-red-500 ml-2 text-sm">
                    {formErrors.type}
                  </span>
                )}
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleFormChange("type", "WordPress")}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors
                           ${
                             form.type === "WordPress"
                               ? "border-brand-accent bg-brand-accent/5"
                               : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                           }`}
                >
                  <FaWordpress
                    className={`w-6 h-6 ${
                      form.type === "WordPress"
                        ? "text-brand-accent"
                        : "text-brand-text-secondary"
                    }`}
                  />
                  <span
                    className={
                      form.type === "WordPress"
                        ? "text-brand-accent"
                        : "text-brand-text-secondary"
                    }
                  >
                    WordPress
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFormChange("type", "Shopify")}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors
                           ${
                             form.type === "Shopify"
                               ? "border-brand-accent bg-brand-accent/5"
                               : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                           }`}
                >
                  <FaShopify
                    className={`w-6 h-6 ${
                      form.type === "Shopify"
                        ? "text-brand-accent"
                        : "text-brand-text-secondary"
                    }`}
                  />
                  <span
                    className={
                      form.type === "Shopify"
                        ? "text-brand-accent"
                        : "text-brand-text-secondary"
                    }
                  >
                    Shopify
                  </span>
                </button>
              </div>

              {/* Custom Code Type Dropdown - Keep this section commented out as in the original code */}
              {/* {form.type === "Custom" && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-brand-text-secondary mb-2">
                    Custom Website Technology
                    {formErrors.customType && (
                      <span className="text-red-500 ml-2 text-sm">
                        {formErrors.customType}
                      </span>
                    )}
                  </label>
                  <div className="grid grid-cols-3 gap-4 mt-2">
                    <button
                      type="button"
                      onClick={() => handleFormChange("customType", "Node.js")}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors
                                ${
                                  form.customType === "Node.js"
                                    ? "border-brand-accent bg-brand-accent/5"
                                    : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                                }`}
                    >
                      <FaNodeJs
                        className={`w-5 h-5 ${
                          form.customType === "Node.js"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          form.customType === "Node.js"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      >
                        Node.js
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFormChange("customType", "React")}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors
                                ${
                                  form.customType === "React"
                                    ? "border-brand-accent bg-brand-accent/5"
                                    : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                                }`}
                    >
                      <FaReact
                        className={`w-5 h-5 ${
                          form.customType === "React"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          form.customType === "React"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      >
                        React
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFormChange("customType", "jQuery")}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors
                                ${
                                  form.customType === "jQuery"
                                    ? "border-brand-accent bg-brand-accent/5"
                                    : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                                }`}
                    >
                      <FaJs
                        className={`w-5 h-5 ${
                          form.customType === "jQuery"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          form.customType === "jQuery"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      >
                        jQuery
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFormChange("customType", "Next.js")}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors
                                ${
                                  form.customType === "Next.js"
                                    ? "border-brand-accent bg-brand-accent/5"
                                    : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                                }`}
                    >
                      <FaReact
                        className={`w-5 h-5 ${
                          form.customType === "Next.js"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          form.customType === "Next.js"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      >
                        Next.js
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFormChange("customType", "Express")}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors
                                ${
                                  form.customType === "Express"
                                    ? "border-brand-accent bg-brand-accent/5"
                                    : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                                }`}
                    >
                      <FaNodeJs
                        className={`w-5 h-5 ${
                          form.customType === "Express"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          form.customType === "Express"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      >
                        Express
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFormChange("customType", "Angular")}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors
                                ${
                                  form.customType === "Angular"
                                    ? "border-brand-accent bg-brand-accent/5"
                                    : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                                }`}
                    >
                      <FaAngular
                        className={`w-5 h-5 ${
                          form.customType === "Angular"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          form.customType === "Angular"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      >
                        Angular
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleFormChange("customType", "ASP.NET Core")
                      }
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors
                                ${
                                  form.customType === "ASP.NET Core"
                                    ? "border-brand-accent bg-brand-accent/5"
                                    : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                                }`}
                    >
                      <FaDotCircle
                        className={`w-5 h-5 ${
                          form.customType === "ASP.NET Core"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          form.customType === "ASP.NET Core"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      >
                        ASP.NET Core
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFormChange("customType", "Vue.js")}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors
                                ${
                                  form.customType === "Vue.js"
                                    ? "border-brand-accent bg-brand-accent/5"
                                    : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                                }`}
                    >
                      <FaVuejs
                        className={`w-5 h-5 ${
                          form.customType === "Vue.js"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          form.customType === "Vue.js"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      >
                        Vue.js
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFormChange("customType", "ASP.NET")}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors
                                ${
                                  form.customType === "ASP.NET"
                                    ? "border-brand-accent bg-brand-accent/5"
                                    : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                                }`}
                    >
                      <FaDotCircle
                        className={`w-5 h-5 ${
                          form.customType === "ASP.NET"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          form.customType === "ASP.NET"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      >
                        ASP.NET
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFormChange("customType", "Flask")}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors
                                ${
                                  form.customType === "Flask"
                                    ? "border-brand-accent bg-brand-accent/5"
                                    : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                                }`}
                    >
                      <FaDotCircle
                        className={`w-5 h-5 ${
                          form.customType === "Flask"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          form.customType === "Flask"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      >
                        Flask
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleFormChange("customType", "Regular HTML")
                      }
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors
                                ${
                                  form.customType === "Regular HTML"
                                    ? "border-brand-accent bg-brand-accent/5"
                                    : "border-brand-lavender-light/20 hover:border-brand-accent/20"
                                }`}
                    >
                      <FaHtml5
                        className={`w-5 h-5 ${
                          form.customType === "Regular HTML"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          form.customType === "Regular HTML"
                            ? "text-brand-accent"
                            : "text-brand-text-secondary"
                        }`}
                      >
                        Regular HTML
                      </span>
                    </button>
                  </div>
                </div>
              )} */}
            </div>

            {/* Access Key Option */}
            <div className="flex items-center justify-between p-4 bg-brand-lavender-light/5 rounded-xl">
              <div className="flex items-center gap-3">
                <FaKey className="w-5 h-5 text-brand-text-secondary" />
                <div>
                  <h3 className="text-brand-text-primary font-medium">
                    Your Access Key
                  </h3>
                  <p className="text-sm text-brand-text-secondary">
                    This is your secure key to access the Voicero.AI API
                  </p>
                  <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800 font-medium mb-2">
                      ⚠️ Save this key now!
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-black bg-white px-2 py-1 rounded border border-yellow-200">
                        {generatedKey}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard.writeText(generatedKey)
                        }
                        className="p-1.5 text-yellow-800 hover:bg-yellow-100 rounded-lg transition-colors"
                        title="Copy to clipboard"
                      >
                        <FaCopy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Plan Information - Show only Starter Plan */}
        <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 overflow-hidden">
          <div className="p-6 border-b border-brand-lavender-light/20">
            <h2 className="text-xl font-semibold text-brand-text-primary">
              Subscription Plan
            </h2>
          </div>

          <div className="p-6">
            <div className="max-w-md mx-auto">
              {/* Only Starter Plan */}
              <div className="p-6 rounded-xl border-2 text-left transition-colors bg-gray-100 border-brand-accent bg-brand-accent/5">
                <h3 className="text-xl font-semibold text-brand-text-primary mb-2">
                  Starter Plan
                </h3>
                <p className="text-brand-text-secondary mb-4">
                  Professional AI for your website
                </p>
                <p className="text-3xl font-bold text-brand-accent mb-2">
                  $120
                  <span className="text-base font-normal text-brand-text-secondary">
                    /month
                  </span>
                </p>

                <ul className="space-y-2 mt-4">
                  <li className="flex items-center gap-2 text-sm text-brand-text-secondary">
                    <FaCheck className="w-4 h-4 text-purple-400" />
                    1,000 Chat interactions/month
                  </li>
                  <li className="flex items-center gap-2 text-sm text-brand-text-secondary">
                    <FaCheck className="w-4 h-4 text-purple-400" />
                    Basic voice commands
                  </li>
                  <li className="flex items-center gap-2 text-sm text-brand-text-secondary">
                    <FaCheck className="w-4 h-4 text-purple-400" />
                    Standard response time
                  </li>
                  <li className="flex items-center gap-2 text-sm text-brand-text-secondary">
                    <FaCheck className="w-4 h-4 text-purple-400" />
                    Community support
                  </li>
                  <li className="flex items-center gap-2 text-sm text-brand-text-secondary">
                    <FaCheck className="w-4 h-4 text-purple-400" />
                    Single website integration
                  </li>
                  <li className="flex items-center gap-2 text-sm text-brand-text-secondary">
                    <FaCheck className="w-4 h-4 text-purple-400" />
                    Basic analytics
                  </li>
                  <li className="flex items-center gap-2 text-sm text-brand-text-secondary">
                    <FaCheck className="w-4 h-4 text-purple-400" />
                    Documentation access
                  </li>
                </ul>

                <p className="mt-4 text-sm text-brand-text-secondary">
                  By creating a website, you agree to subscribe to the Starter
                  plan at $120/month.
                </p>
              </div>

              {/* Enterprise Plan Information */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold mb-2 text-black">
                  Enterprise Plan
                </h3>
                <p className="text-sm text-black mb-2">
                  When you exceed your Starter plan limit of 1000 queries,
                  you'll automatically be upgraded to our Enterprise plan.
                </p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-brand-accent">$0.10</span>
                  <span className="text-sm text-black">
                    per query
                  </span>
                </div>
                <ul className="text-sm text-brand-text-secondary list-disc pl-5 space-y-1">
                  <li>Unlimited queries</li>
                  <li>Pay only for what you use</li>
                  <li>No action required - automatic upgrade</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.back()}
            className="px-6 py-2 text-brand-text-secondary hover:text-brand-text-primary 
                     transition-colors rounded-xl"
          >
            Cancel
          </motion.button>
          <motion.button
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={isSubmitting}
            className="px-6 py-2 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                     text-white rounded-xl shadow-lg shadow-brand-accent/20
                     hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Creating..." : "Create Website ($120/month)"}
          </motion.button>
        </div>
      </form>
    </div>
  );
}
