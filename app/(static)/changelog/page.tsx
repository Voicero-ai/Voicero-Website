"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  FaRocket,
  FaBug,
  FaPlus,
  FaCog,
  FaCheck,
  FaClock,
} from "react-icons/fa";

// Define the changelog entries type
type ChangelogEntry = {
  version: string;
  date: string;
  changes: {
    type: "feature" | "fix" | "improvement";
    description: string;
  }[];
};

// Changelog entries - easy to add new ones here
const changelogEntries: ChangelogEntry[] = [
  //   {
  //     version: "1.2.0",
  //     date: "March 27, 2024",
  //     changes: [
  //       {
  //         type: "feature",
  //         description: "Added voice chat support for WordPress websites",
  //       },
  //       {
  //         type: "improvement",
  //         description:
  //           "Enhanced AI response accuracy for product recommendations",
  //       },
  //       {
  //         type: "fix",
  //         description: "Fixed chat history loading issues on slow connections",
  //       },
  //     ],
  //   }
];

const getChangeIcon = (type: "feature" | "fix" | "improvement") => {
  switch (type) {
    case "feature":
      return <FaRocket className="w-4 h-4 text-brand-accent" />;
    case "fix":
      return <FaBug className="w-4 h-4 text-red-500" />;
    case "improvement":
      return <FaCog className="w-4 h-4 text-blue-500" />;
    default:
      return <FaPlus className="w-4 h-4 text-brand-accent" />;
  }
};

const Changelog = () => {
  return (
    <div className="relative min-h-screen bg-black flex flex-col items-center p-4 pt-20">
      <div className="max-w-4xl w-full space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-4"
        >
          <h1 className="text-3xl md:text-5xl font-bold text-white pt-12">
            Changelog
          </h1>
          <p className="text-lg text-gray-300">
            Stay updated with our latest features and improvements
          </p>
        </motion.div>

        <div className="space-y-8">
          {changelogEntries.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 p-8 text-center"
            >
              <div className="flex justify-center mb-4">
                <FaClock className="w-12 h-12 text-brand-accent/50" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Coming Soon!
              </h2>
              <p className="text-gray-300">
                We're working on exciting new features and improvements. Check
                back soon for updates!
              </p>
            </motion.div>
          ) : (
            changelogEntries.map((entry, index) => (
              <motion.div
                key={entry.version}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 p-6 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-brand-accent">
                      v{entry.version}
                    </span>
                    <span className="text-sm text-gray-400">{entry.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FaCheck className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-500">Released</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {entry.changes.map((change, changeIndex) => (
                    <div
                      key={changeIndex}
                      className="flex items-start gap-3 p-3 rounded-lg bg-gray-700/50"
                    >
                      {getChangeIcon(change.type)}
                      <span className="text-gray-200">
                        {change.description}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Changelog;
