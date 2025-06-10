
import React from 'react';
import Link from 'next/link';
import { FaChevronRight, FaHome } from "react-icons/fa";  
import { BreadcrumbSchema, type BreadcrumbItem } from './SEO';

type BreadcrumbProps = {
  items: {
    name: string;
    href: string;
  }[];
};

export default function Breadcrumb({ items }: BreadcrumbProps) {
  // Format items for schema
  const schemaItems: BreadcrumbItem[] = [
    {
      name: "Home",
      item: "https://voicero.ai",
      position: 1,
    },
    ...items.map((item, index) => ({
      name: item.name,
      item: `https://voicero.ai${item.href}`,
      position: index + 2,
    })),
  ];

  return (
    <>
      <BreadcrumbSchema items={schemaItems} />
      <nav className="flex items-center text-sm text-gray-300 py-4">
        <Link href="/" className="hover:text-gray-100 flex items-center">
          <FaHome className="w-4 h-4 mr-1" />
          Home
        </Link>
        {items.map((item, index) => (
          <React.Fragment key={item.href}>
            <FaChevronRight className="w-3 h-3 mx-2" />
            {index === items.length - 1 ? (
              <span className="text-gray-100 font-medium">{item.name}</span>
            ) : (
              <Link href={item.href} className="hover:text-gray-100">
                {item.name}
              </Link>
            )}
          </React.Fragment>
        ))}
      </nav>
    </>
  );
}
