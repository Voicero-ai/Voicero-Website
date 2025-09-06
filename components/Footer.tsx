"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FaTwitter, FaLinkedin, FaGithub, FaEnvelope } from "react-icons/fa";
import Logo from "./Logo";

interface FooterLink {
  name: string;
  href: string;
  external?: boolean;
}

const footerLinks = {
  product: [
    { name: "Features", href: "/features" },
    { name: "Pricing", href: "/pricing" },
    { name: "Text AI", href: "/text-ai" },
    { name: "Voice AI", href: "/voice-ai" },
  ] as FooterLink[],
  company: [
    { name: "Our Why", href: "/about" },
    {
      name: "Book a Demo",
      href: "https://calendly.com/voicero-info/voicero-ai-set-up?share_attribution=expiring_link",
      external: true,
    },
    { name: "Contact", href: "/contact" },
    { name: "FAQ", href: "/faq" },
  ] as FooterLink[],
  resources: [
    { name: "Documentation", href: "/docs" },
    { name: "Blog", href: "/blog" },
    { name: "Changelog", href: "/changelog" },
    { name: "Support", href: "/contact" },
    { name: "Login", href: "/app" },
  ] as FooterLink[],
  legal: [
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms" },
    { name: "Cookie Policy", href: "/cookies" },
  ] as FooterLink[],
};

const socialLinks = [
  {
    name: "Twitter",
    href: "https://twitter.com/voicero_ai",
    icon: FaTwitter,
  },
  {
    name: "LinkedIn",
    href: "https://linkedin.com/company/voicero-ai",
    icon: FaLinkedin,
  },
  {
    name: "GitHub",
    href: "https://github.com/voicero-ai",
    icon: FaGithub,
  },
  {
    name: "Email",
    href: "mailto:info@voicero.ai",
    icon: FaEnvelope,
  },
];

export default function Footer() {
  return (
    <footer className="backdrop-blur-xl bg-black/60 border-t border-purple-500/20">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Logo and Description */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-3">
            <Logo />
            <p className="text-sm text-gray-300 max-w-md">
              Transforming digital experiences with AI-powered solutions that
              drive engagement and boost productivity.
            </p>
          </div>
        </div>

        {/* Main Footer Content */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 text-sm">
          <div>
            <h3 className="font-semibold text-white mb-3">Product</h3>
            <ul className="space-y-1">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-gray-300 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/10"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-3">Company</h3>
            <ul className="space-y-1">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-300 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/10"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-gray-300 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/10"
                    >
                      {link.name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-3">Resources</h3>
            <ul className="space-y-1">
              {footerLinks.resources.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-gray-300 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/10"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-3">Legal</h3>
            <ul className="space-y-1">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-gray-300 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/10"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-purple-500/20">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10"
                >
                  <social.icon className="w-5 h-5" />
                </a>
              ))}
            </div>
            <p className="text-xs text-gray-300">
              © {new Date().getFullYear()} Pronewer LLC. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
