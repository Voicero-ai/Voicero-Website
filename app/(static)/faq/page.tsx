"use client";

import React from "react";
import { FAQSchema } from "../../../components/SEO";

const faqItems = [
  {
    question: "What is Voicero.AI's website chatbot?",
    answer:
      "Voicero.AI is an advanced AI chatbot plugin designed specifically for Shopify and WordPress websites. It provides intelligent customer service, handles product inquiries, and helps reduce cart abandonment through automated conversations.",
  },
  {
    question: "How do I install the Voicero.AI chatbot on my Shopify store?",
    answer:
      "Installing Voicero.AI on your Shopify store is simple. Just visit the Shopify App Store, search for Voicero.AI, and click 'Add App'. Our chatbot will be automatically integrated into your store's design.",
  },
  {
    question: "Can I customize the Voicero.AI chatbot for my WordPress site?",
    answer:
      "Yes, Voicero.AI offers extensive customization options for WordPress sites. You can modify the chatbot's appearance, responses, and behavior through our user-friendly dashboard. No coding knowledge required.",
  },
  {
    question: "What features does the Voicero.AI chatbot plugin include?",
    answer:
      "Our chatbot plugin includes 24/7 customer support, product recommendations, order tracking, FAQ handling, cart recovery, and seamless integration with your existing customer service tools.",
  },
  {
    question:
      "How does the Voicero.AI chatbot improve my website's conversion rate?",
    answer:
      "The Voicero.AI chatbot improves conversion rates by providing instant responses to customer queries, reducing cart abandonment through timely interventions, and offering personalized product recommendations based on user behavior.",
  },
  {
    question:
      "Is the Voicero.AI chatbot compatible with my e-commerce platform?",
    answer:
      "Voicero.AI is compatible with major e-commerce platforms including Shopify, WordPress (WooCommerce), and custom websites. We're constantly expanding our platform support to serve more businesses.",
  },
  {
    question: "How does the chatbot handle multiple languages?",
    answer:
      "Voicero.AI's chatbot supports multiple languages out of the box. It can automatically detect the user's language and respond accordingly, making it perfect for international e-commerce stores.",
  },
  {
    question:
      "Can I integrate the chatbot with my existing customer service tools?",
    answer:
      "Yes, Voicero.AI integrates seamlessly with popular customer service tools like Zendesk, Intercom, and your existing CRM systems, ensuring a smooth handoff between AI and human agents when needed.",
  },
  {
    question: "What kind of analytics does the chatbot provide?",
    answer:
      "Voicero.AI provides detailed analytics including conversation metrics, customer satisfaction scores, conversion tracking, and insights into common customer queries to help you improve your service.",
  },
  {
    question: "How secure is the Voicero.AI chatbot?",
    answer:
      "Voicero.AI prioritizes security. Our chatbot is GDPR compliant, uses encrypted data transmission, and follows industry best practices for data protection. We never store sensitive customer information.",
  },
];

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-black py-20">
      <div className="container mx-auto px-4 py-8 max-w-4xl pt-20">
        <h1 className="text-3xl font-bold mb-6 text-white">
          Frequently Asked Questions
        </h1>

        <div className="space-y-6">
          <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
            <h2 className="text-xl font-semibold mb-4 text-white">
              What is Voicero.AI?
            </h2>
            <p className="text-gray-300">
              Voicero.AI is an advanced AI chat solution that helps businesses
              provide instant, intelligent responses to customer inquiries. Our
              platform uses cutting-edge AI technology to understand and respond
              to customer questions in a natural, conversational way.
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
            <h2 className="text-xl font-semibold mb-4 text-white">
              How does Voicero.AI work?
            </h2>
            <p className="text-gray-300">
              Voicero.AI integrates with your website through a simple plugin or
              app installation. Once installed, it analyzes your website content
              and learns about your business to provide accurate, context-aware
              responses to customer questions. The AI continuously learns and
              improves from interactions.
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
            <h2 className="text-xl font-semibold mb-4 text-white">
              What platforms does Voicero.AI support?
            </h2>
            <p className="text-gray-300">
              Currently, we support WordPress and Shopify platforms. We&apos;re
              actively working on expanding our platform support to include more
              popular website builders and e-commerce platforms.
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
            <h2 className="text-xl font-semibold mb-4 text-white">
              Is Voicero.AI easy to set up?
            </h2>
            <p className="text-gray-300">
              Yes! Our setup process is designed to be user-friendly and
              requires no coding knowledge. Simply install our plugin or app,
              follow the guided setup process, and your AI chat assistant will
              be ready to help your customers.
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
            <h2 className="text-xl font-semibold mb-4 text-white">
              Can I customize the AI responses?
            </h2>
            <p className="text-gray-300">
              Absolutely! You have full control over the AI&apos;s responses and
              behavior. You can customize the chat widget&apos;s appearance, set
              response guidelines, and even provide specific answers to common
              questions.
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
            <h2 className="text-xl font-semibold mb-4 text-white">
              How does Voicero.AI handle sensitive information?
            </h2>
            <p className="text-gray-300">
              We take data security seriously. Voicero.AI is designed to handle
              sensitive information securely and in compliance with privacy
              regulations. We don&apos;t store personal customer data, and all
              communications are encrypted.
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
            <h2 className="text-xl font-semibold mb-4 text-white">
              What kind of support do you offer?
            </h2>
            <p className="text-gray-300">
              We provide comprehensive support through email, phone, and live
              chat. Our support team is available to help with setup,
              customization, and any questions you might have about using
              Voicero.AI.
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
            <h2 className="text-xl font-semibold mb-4 text-white">
              Can I try Voicero.AI before purchasing?
            </h2>
            <p className="text-gray-300">
              Yes! We offer a free trial period so you can experience the full
              capabilities of Voicero.AI before making a commitment. Contact us
              to start your trial today.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
