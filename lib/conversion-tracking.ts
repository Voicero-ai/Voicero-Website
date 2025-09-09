// lib/conversion-tracking.ts
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
  }
}

export const trackShopifyConversion = (
  transactionId?: string,
  value: number = 1.0
) => {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", "conversion", {
      send_to: "AW-17503203512/MlE0COaF0ZcbELjhlppB",
      value: value,
      currency: "USD",
      transaction_id:
        transactionId ||
        `shopify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  }
};

export const trackWordPressConversion = (
  transactionId?: string,
  value: number = 1.0
) => {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", "conversion", {
      send_to: "AW-17503203512/Gxi3CLym0ZcbELjhlppB",
      value: value,
      currency: "USD",
      transaction_id:
        transactionId ||
        `wordpress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  }
};

export const trackCustomConversion = (
  transactionId?: string,
  value: number = 1.0
) => {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", "conversion", {
      send_to: "AW-17503203512/DilNCNmr0ZcbELjhlppB",
      value: value,
      currency: "USD",
      transaction_id:
        transactionId ||
        `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  }
};

export const trackGeneralConversion = (
  conversionLabel: string,
  transactionId?: string,
  value: number = 1.0
) => {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", "conversion", {
      send_to: `AW-17503203512/${conversionLabel}`,
      value: value,
      currency: "USD",
      transaction_id:
        transactionId ||
        `conversion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  }
};
