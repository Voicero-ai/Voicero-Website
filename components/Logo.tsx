"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";

export default function Logo() {
  return (
    <Link href="/" className="flex items-center space-x-2">
      <motion.div
        className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 flex items-center justify-center"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <img
          src="/logos/logoNoBackground.png"
          alt="Voicero.AI Logo"
          className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 object-contain"
        />
      </motion.div>
      <motion.span
        className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-brand-accent to-brand-accent-dark bg-clip-text text-transparent"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        Voicero.AI
      </motion.span>
    </Link>
  );
}
