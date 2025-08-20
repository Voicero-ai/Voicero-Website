import type { Metadata } from "next";
import "../../globals.css";

export const metadata: Metadata = {
  title: "Terms of Service - Voicero.AI",
  description:
    "Terms of Service for using Voicero.AI's AI chatbot solution for Shopify stores",
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-black">{children}</div>;
}
