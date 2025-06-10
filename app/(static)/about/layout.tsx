import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Our Why - Voicero.AI",
  description:
    "Learn about our mission to revolutionize search with AI innovation",
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-black">{children}</div>;
}
