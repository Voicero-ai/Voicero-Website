"use client";

import React from "react";
import { motion } from "framer-motion";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-black py-20">
      <div className="container mx-auto px-4 py-8 max-w-4xl pt-20">
        <h1 className="text-3xl font-bold mb-6 text-white">Terms of Service</h1>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            1. Acceptance of Terms
          </h2>
          <p className="mb-4 text-gray-300">
            By accessing and using Voicero.AI&apos;s services, you agree to be
            bound by these Terms of Service. If you do not agree to these terms,
            please do not use our services.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            2. Description of Service
          </h2>
          <p className="mb-4 text-gray-300">
            Voicero.AI provides AI-powered chat solutions for websites. Our
            service includes the AI chat widget, related plugins, and associated
            support services.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            3. User Responsibilities
          </h2>
          <p className="mb-4 text-gray-300">
            As a user of Voicero.AI, you agree to:
          </p>
          <ul className="list-disc ml-8 mb-4 text-gray-300">
            <li>Provide accurate and complete information</li>
            <li>Maintain the security of your account</li>
            <li>Use the service in compliance with all applicable laws</li>
            <li>Not misuse or attempt to manipulate the AI system</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            4. Service Limitations
          </h2>
          <p className="mb-4 text-gray-300">
            Voicero.AI reserves the right to:
          </p>
          <ul className="list-disc ml-8 mb-4 text-gray-300">
            <li>Modify or discontinue any part of the service</li>
            <li>Limit access to certain features</li>
            <li>Update pricing and service terms</li>
            <li>Enforce usage limits and restrictions</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            5. Intellectual Property
          </h2>
          <p className="mb-4 text-gray-300">
            All content, features, and functionality of Voicero.AI are owned by
            us and are protected by international copyright, trademark, and
            other intellectual property laws.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            6. Privacy and Data
          </h2>
          <p className="mb-4 text-gray-300">
            Your use of Voicero.AI is also governed by our Privacy Policy. We
            are committed to protecting your data and maintaining your privacy.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            7. Termination
          </h2>
          <p className="mb-4 text-gray-300">
            We reserve the right to terminate or suspend access to our service
            for violations of these terms or for any other reason at our
            discretion.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            8. Contact Information
          </h2>
          <p className="mb-4 text-gray-300">
            For questions about these Terms of Service, please contact us at:
          </p>
          <div className="mb-4 text-gray-300">
            <p>Email: info@voicero.ai</p>
            <p>Phone: +1 (330) 696-2596</p>
            <p>Address: 21646 N 44th Pl Phoenix AZ, 85050</p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            9. Changes to Terms
          </h2>
          <p className="mb-4 text-gray-300">
            We may update these terms from time to time. We will notify you of
            any changes by posting the new Terms of Service on this page.
          </p>
          <p className="font-semibold text-gray-300">
            Last Updated: March 1, 2025
          </p>
        </section>
      </div>
    </div>
  );
}
