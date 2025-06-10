"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  FaTwitter,
  FaLinkedin,
  FaGithub,
  FaEnvelope,
} from "react-icons/fa";
import Logo from "./Logo";

interface FooterLink {
  name: string;
  href: string;
  external?: boolean;
}

const footerLinks = {
  product: [
    { name: "Features", href: "/#features" },
    { name: "Pricing", href: "/pricing" },
    { name: "Contact", href: "/contact" },
  ] as FooterLink[],
  company: [
    { name: "Our Why", href: "/about" },
    { name: "Book a Demo", href: "https://calendly.com/voicero-info/voicero-ai-set-up?share_attribution=expiring_link", external: true },
    { name: "FAQ", href: "/faq" },
  ] as FooterLink[],
  resources: [
    { name: "Documentation", href: "/docs" },
    { name: "Changelog", href: "/changelog" },
    { name: "Support", href: "/contact" },
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
    <footer className="bg-black border-t border-gray-800">
      <div className="container mx-auto px-4 py-6">
        {/* Logo and Description */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Logo />
            <p className="text-sm text-gray-300 max-w-md">
              Transforming digital experiences with AI-powered solutions
              that drive engagement and boost productivity.
            </p>
          </div>
        </div>

        {/* Main Footer Content */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6 text-sm">
          <div>
            <h3 className="font-semibold text-white mb-2">Product</h3>
            <ul className="space-y-1">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-gray-300 hover:text-pink-500 transition-colors"
                    style={{ "--hover-color": "#d53f8c" } as React.CSSProperties}
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-2">Company</h3>
            <ul className="space-y-1">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-300 hover:text-pink-500 transition-colors"
                      style={{ "--hover-color": "#d53f8c" } as React.CSSProperties}
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-gray-300 hover:text-pink-500 transition-colors"
                      style={{ "--hover-color": "#d53f8c" } as React.CSSProperties}
                    >
                      {link.name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-2">Resources</h3>
            <ul className="space-y-1">
              {footerLinks.resources.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-gray-300 hover:text-pink-500 transition-colors"
                    style={{ "--hover-color": "#d53f8c" } as React.CSSProperties}
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-2">Legal</h3>
            <ul className="space-y-1">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-gray-300 hover:text-pink-500 transition-colors"
                    style={{ "--hover-color": "#d53f8c" } as React.CSSProperties}
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-4 border-t border-gray-800">
          <div className="flex flex-col md:flex-row justify-between items-center gap-2">
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-pink-500 transition-colors"
                  style={{ "--hover-color": "#d53f8c" } as React.CSSProperties}
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
