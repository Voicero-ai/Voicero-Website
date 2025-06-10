"use client";

import React from "react";
import { FaShopify, FaWordpress, FaWix, FaSquarespace } from "react-icons/fa";
import { SiWebflow, SiSquare, SiGhost, SiWoocommerce } from "react-icons/si";

const webBuilders = [
  {
    name: "Shopify",
    icon: FaShopify,
    color: "#95BF47"
  },
  {
    name: "WordPress",
    icon: FaWordpress,
    color: "#21759B"
  },
  {
    name: "Wix",
    icon: FaWix,
    color: "#000000"
  },
  {
    name: "Squarespace",
    icon: FaSquarespace,
    color: "#000000"
  },
  {
    name: "Webflow",
    icon: SiWebflow,
    color: "#4353FF"
  },
  {
    name: "Square",
    icon: SiSquare,
    color: "#3E4348"
  },
  {
    name: "Ghost",
    icon: SiGhost,
    color: "#738A94"
  },
  {
    name: "WooCommerce",
    icon: SiWoocommerce,
    color: "#96588A"
  }
];

export default function ScrollingLogos() {
  return (
    <div className="w-full py-12 overflow-hidden bg-gray-150 relative">
      <style jsx>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .scroll-container {
          display: flex;
          width: fit-content;
          animation: scroll 30s linear infinite;
        }
        .scroll-container:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div className="relative">
        <div className="scroll-container">
          {[...webBuilders, ...webBuilders].map((builder, index) => {
            const Icon = builder.icon;
            return (
              <div
                key={index}
                className="flex flex-col items-center justify-center min-w-[160px] h-32 transition-all duration-200 hover:scale-110 gap-3 px-10"
              >
                <Icon 
                  style={{ color: builder.color }} 
                  className="w-12 h-12 transition-transform hover:scale-110" 
                />
                <span 
                  style={{ color: builder.color }}
                  className="text-sm font-medium whitespace-nowrap"
                >
                  {builder.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
} 