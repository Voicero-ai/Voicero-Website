"use client";

import React from "react";
import { motion } from "framer-motion";

export default function CookiePolicy() {
  return (
    <div className="min-h-screen bg-black py-20">
      <div className="container mx-auto px-4 py-8 max-w-4xl pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto"
        >
          <h1 className="text-4xl font-bold text-white mb-8">Cookie Policy</h1>
          <div className="prose prose-lg prose-invert max-w-none text-gray-300">
            <p className="mb-6">
              Last updated: {new Date().toLocaleDateString()}
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-white mb-4">
                1. What Are Cookies
              </h2>
              <p>
                Cookies are small pieces of text sent by your web browser by a
                website you visit. A cookie file is stored in your web browser
                and allows the Service or a third-party to recognize you and
                make your next visit easier and more useful to you.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-white mb-4">
                2. How We Use Cookies
              </h2>
              <p>
                When you use and access the Service, we may place a number of
                cookie files in your web browser. We use cookies for the
                following purposes:
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>To enable certain functions of the Service</li>
                <li>To provide analytics</li>
                <li>To store your preferences</li>
                <li>
                  To enable advertisements delivery, including behavioral
                  advertising
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-white mb-4">
                3. Types of Cookies We Use
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Essential Cookies:
                  </h3>
                  <p>
                    These cookies are essential to provide you with services
                    available through our website and to enable you to use some
                    of its features. Without these cookies, the services that
                    you have asked for cannot be provided, and we only use these
                    cookies to provide you with those services.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Functionality Cookies:
                  </h3>
                  <p>
                    These cookies allow our website to remember choices you make
                    when you use our website. The purpose of these cookies is to
                    provide you with a more personal experience and to avoid you
                    having to re-select your preferences every time you visit
                    our website.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Analytics Cookies:
                  </h3>
                  <p>
                    These cookies are used to collect information about traffic
                    to our website and how users use our website. The
                    information gathered via these cookies does not "directly"
                    identify any individual visitor. The information is
                    aggregated and anonymous.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Advertising Cookies:
                  </h3>
                  <p>
                    These cookies are used to make advertising messages more
                    relevant to you and your interests. They also perform
                    functions like preventing the same ad from continuously
                    reappearing, ensuring that ads are properly displayed, and
                    in some cases selecting advertisements that are based on
                    your interests.
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-white mb-4">
                4. Third-Party Cookies
              </h2>
              <p>
                In addition to our own cookies, we may also use various
                third-party cookies to report usage statistics of the Service,
                deliver advertisements on and through the Service, and so on.
                These cookies may include:
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>Google Analytics</li>
                <li>Google Ads</li>
                <li>Facebook Pixel</li>
                <li>Other advertising partners</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-white mb-4">
                5. What Are Your Choices Regarding Cookies
              </h2>
              <p>
                If you'd like to delete cookies or instruct your web browser to
                delete or refuse cookies, please visit the help pages of your
                web browser. Please note, however, that if you delete cookies or
                refuse to accept them, you might not be able to use all of the
                features we offer, you may not be able to store your
                preferences, and some of our pages might not display properly.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-white mb-4">
                6. Where Can You Find More Information About Cookies
              </h2>
              <p>
                You can learn more about cookies and the following third-party
                websites:
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>
                  AllAboutCookies:{" "}
                  <a
                    href="http://www.allaboutcookies.org/"
                    className="text-brand-accent hover:text-brand-accent/80 hover:underline"
                  >
                    http://www.allaboutcookies.org/
                  </a>
                </li>
                <li>
                  Network Advertising Initiative:{" "}
                  <a
                    href="http://www.networkadvertising.org/"
                    className="text-brand-accent hover:text-brand-accent/80 hover:underline"
                  >
                    http://www.networkadvertising.org/
                  </a>
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-white mb-4">
                7. Contact Us
              </h2>
              <p>
                If you have any questions about our Cookie Policy, please
                contact us:
              </p>
              <ul className="list-none mt-4">
                <li>Email: info@voicero.ai</li>
                <li>Website: https://www.voicero.ai</li>
              </ul>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
