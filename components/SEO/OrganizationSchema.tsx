import React from 'react';

type OrganizationSchemaProps = {
  url?: string;
  logo?: string;
  name?: string;
  description?: string;
  sameAs?: string[];
};

export default function OrganizationSchema({
  url = "https://voicero.ai",
  logo = "https://voicero.ai/logos/logoNoBackground.png",
  name = "Voicero.AI",
  description = "Voicero.AI is an AI-powered voice navigation platform that helps businesses improve customer experience with advanced chatbot solutions.",
  sameAs = []
}: OrganizationSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    url,
    logo,
    name,
    description,
    sameAs
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
} 