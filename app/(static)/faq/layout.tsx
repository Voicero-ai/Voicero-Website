import type { Metadata } from "next";
import "../../globals.css";

export const metadata: Metadata = {
  title: "FAQ - Voicero.AI",
  description:
    "Frequently asked questions about our AI chatbot solution for Shopify stores",
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-black">{children}</div>;
}
