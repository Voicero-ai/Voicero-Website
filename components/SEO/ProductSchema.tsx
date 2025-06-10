import React from 'react';

type ReviewType = {
  author: string;
  rating: number;
  date: string;
  reviewBody: string;
};

type OfferType = {
  price: number;
  priceCurrency: string;
  availability: 'InStock' | 'OutOfStock' | 'PreOrder';
  url: string;
  validFrom?: string;
  priceValidUntil?: string;
};

type ProductSchemaProps = {
  name: string;
  description: string;
  image: string;
  sku?: string;
  mpn?: string;
  brand?: string;
  offers?: OfferType[];
  reviews?: ReviewType[];
  aggregateRating?: {
    ratingValue: number;
    reviewCount: number;
  };
};

export default function ProductSchema({
  name = "Voicero.AI Website Chatbot",
  description = "Advanced AI chatbot plugin for Shopify and WordPress websites. Features include 24/7 customer support, product recommendations, order tracking, and cart recovery. Easy to install, no coding required.",
  image = "https://voicero.ai/logos/logoNoBackground.png",
  sku = "VOICERO-CHATBOT-2024",
  mpn = "VCB-2024",
  brand = "Voicero.AI",
  offers = [{
    price: 49.99,
    priceCurrency: "USD",
    availability: "InStock",
    url: "https://voicero.ai/pricing",
    validFrom: "2024-01-01",
    priceValidUntil: "2024-12-31"
  }],
  reviews = [
    {
      author: "John Smith",
      rating: 5,
      date: "2024-03-15",
      reviewBody: "The best chatbot plugin I've used for my Shopify store. Easy to set up and has significantly improved our customer service response times."
    },
    {
      author: "Sarah Johnson",
      rating: 5,
      date: "2024-03-10",
      reviewBody: "Excellent WordPress integration. The chatbot has helped us reduce cart abandonment and increase sales."
    }
  ],
  aggregateRating = {
    ratingValue: 4.9,
    reviewCount: 150
  }
}: ProductSchemaProps) {
  const schema: any = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image,
    sku,
    mpn,
    brand: {
      "@type": "Brand",
      name: brand
    },
    offers: offers.length === 1 
      ? {
          "@type": "Offer",
          price: offers[0].price,
          priceCurrency: offers[0].priceCurrency,
          availability: `https://schema.org/${offers[0].availability}`,
          url: offers[0].url,
          validFrom: offers[0].validFrom,
          priceValidUntil: offers[0].priceValidUntil
        }
      : offers.map(offer => ({
          "@type": "Offer",
          price: offer.price,
          priceCurrency: offer.priceCurrency,
          availability: `https://schema.org/${offer.availability}`,
          url: offer.url,
          validFrom: offer.validFrom,
          priceValidUntil: offer.priceValidUntil
        })),
    reviews: reviews.map(review => ({
      "@type": "Review",
      author: {
        "@type": "Person",
        name: review.author
      },
      reviewRating: {
        "@type": "Rating",
        ratingValue: review.rating
      },
      datePublished: review.date,
      reviewBody: review.reviewBody
    })),
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: aggregateRating.ratingValue,
      reviewCount: aggregateRating.reviewCount
    },
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Platform Support",
        value: "Shopify, WordPress, WooCommerce"
      },
      {
        "@type": "PropertyValue",
        name: "Features",
        value: "24/7 Support, Product Recommendations, Order Tracking, Cart Recovery"
      },
      {
        "@type": "PropertyValue",
        name: "Installation",
        value: "No Coding Required"
      }
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
} 