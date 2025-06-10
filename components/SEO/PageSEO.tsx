import React from 'react';
import { Metadata } from 'next';
import FAQSchema, { type FAQItem } from './FAQSchema';
import BreadcrumbSchema, { BreadcrumbItem } from './BreadcrumbSchema';

type PageSEOProps = {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  breadcrumbs?: BreadcrumbItem[];
  faqItems?: FAQItem[];
  canonical?: string;
  children?: React.ReactNode;
};

export function generatePageMetadata({ 
  title, 
  description, 
  path, 
  ogImage = 'https://voicero.ai/logos/logoNoBackground.png'
}: Omit<PageSEOProps, 'breadcrumbs' | 'faqItems' | 'children'>): Metadata {
  const url = `https://voicero.ai${path}`;
  
  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Voicero.AI',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${title} | Voicero.AI`,
        },
      ],
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function PageSEO({ 
  title, 
  description, 
  path, 
  ogImage = 'https://voicero.ai/logos/logoNoBackground.png',
  breadcrumbs,
  faqItems,
  canonical,
  children
}: PageSEOProps) {
  const canonicalUrl = canonical || `https://voicero.ai${path}`;
  
  return (
    <>
      {breadcrumbs && <BreadcrumbSchema items={breadcrumbs} />}
      {faqItems && <FAQSchema items={faqItems} />}
      {children}
      <link rel="canonical" href={canonicalUrl} />
    </>
  );
} 