import React from 'react';

type WebsiteSchemaProps = {
  url?: string;
  name?: string;
  description?: string;
  searchUrl?: string;
};

export default function WebsiteSchema({
  url = "https://voicero.ai",
  name = "Voicero.AI",
  description = "Voicero.AI is an AI-powered voice navigation platform that helps businesses improve customer experience with advanced chatbot solutions.",
  searchUrl = "https://voicero.ai/search?q="
}: WebsiteSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url,
    name,
    description,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${searchUrl}{search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
} 