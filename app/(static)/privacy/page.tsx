"use client";

import React from "react";
import { motion } from "framer-motion";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-black py-20">
      <div className="container mx-auto px-4 py-8 max-w-4xl pt-20">
        <h1 className="text-3xl font-bold mb-6 text-white">Privacy Policy</h1>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            Introduction
          </h2>
          <p className="mb-4 text-gray-300">
            Welcome to our Privacy Policy. This document explains how we
            collect, use, and protect your personal information when you use our
            website and services.
          </p>
          <p className="mb-4 text-gray-300">
            We are committed to ensuring the privacy and security of your data.
            Please read this policy carefully to understand our practices
            regarding your personal information.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            Information We Collect
          </h2>
          <p className="mb-4 text-gray-300">
            We may collect the following types of information:
          </p>
          <ul className="list-disc ml-8 mb-4 text-gray-300">
            <li>
              Personal information such as name, email address, and contact
              details that you provide voluntarily
            </li>
            <li>Account information when you register for an account</li>
            <li>
              Website data that you voluntarily provide through our plugins
            </li>
          </ul>
          <p className="mb-4 text-gray-300">
            Please note: We do not collect IP addresses or use cookies on our
            website.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            How We Use Your Information
          </h2>
          <p className="mb-4 text-gray-300">
            We use your personal information for the following purposes:
          </p>
          <ul className="list-disc ml-8 mb-4 text-gray-300">
            <li>To provide and maintain our services</li>
            <li>To notify you about changes to our services</li>
            <li>To allow you to participate in interactive features</li>
            <li>To provide customer support</li>
            <li>
              To gather analysis or valuable information to improve our services
            </li>
            <li>To monitor the usage of our services</li>
            <li>To detect, prevent, and address technical issues</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            Data Storage and Security
          </h2>
          <p className="mb-4 text-gray-300">
            We implement appropriate security measures to protect your personal
            information against unauthorized access, alteration, disclosure, or
            destruction. We store your data on secure servers and use
            industry-standard encryption to protect sensitive information.
          </p>
          <p className="mb-4 text-gray-300">
            While we strive to use commercially acceptable means to protect your
            personal information, no method of transmission over the Internet or
            method of electronic storage is 100% secure. We cannot guarantee
            absolute security of your data.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            Your Data Rights
          </h2>
          <p className="mb-4 text-gray-300">
            You have the following rights regarding your personal information:
          </p>
          <ul className="list-disc ml-8 mb-4 text-gray-300">
            <li>The right to access your personal data</li>
            <li>The right to request correction of inaccurate data</li>
            <li>The right to request deletion of your data</li>
            <li>The right to object to processing of your data</li>
            <li>The right to data portability</li>
            <li>The right to withdraw consent</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            Data Deletion
          </h2>
          <p className="mb-4 text-gray-300">
            You can manage and delete your website data at any time through your
            account settings. To delete your entire account, please contact us
            using the information provided below. Upon receiving your request,
            we will:
          </p>
          <ul className="list-disc ml-8 mb-4 text-gray-300">
            <li>Verify your identity to ensure the security of your data</li>
            <li>Process your deletion request within 30 days</li>
            <li>Remove your personal information from our active databases</li>
            <li>
              Ensure your data is also deleted from any third-party services we
              use
            </li>
            <li>Provide confirmation once the deletion process is complete</li>
          </ul>
          <p className="mb-4 text-gray-300">
            Please note that some information may be retained in our archives or
            backups for legal or legitimate business purposes. However, this
            data will not be used for active processing.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">Contact Us</h2>
          <p className="mb-4 text-gray-300">
            If you have any questions about this Privacy Policy, your data, or
            would like to exercise any of your data rights, please contact us
            at:
          </p>
          <div className="mb-4 text-gray-300">
            <p>Email: info@voicero.ai</p>
            <p>Phone: +1 (330) 696-2596</p>
            <p>Address: 21646 N 44th Pl Phoenix AZ, 85050</p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            Changes to This Privacy Policy
          </h2>
          <p className="mb-4 text-gray-300">
            We may update our Privacy Policy from time to time. We will notify
            you of any changes by posting the new Privacy Policy on this page
            and updating the "Last Updated" date.
          </p>
          <p className="mb-4 text-gray-300">
            You are advised to review this Privacy Policy periodically for any
            changes. Changes to this Privacy Policy are effective when they are
            posted on this page.
          </p>
          <p className="font-semibold text-gray-300">
            Last Updated: March 1, 2025
          </p>
        </section>
      </div>
    </div>
  );
}
