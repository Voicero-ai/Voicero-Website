"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";

export default function Logo() {
  return (
    <Link href="/" className="flex items-center space-x-2">
      <motion.div
        className="w-16 h-16 flex items-center justify-center"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <img
          src="/logos/logoNoBackground.png"
          alt="Voicero.AI Logo"
          className="w-16 h-16 object-contain"
        />
      </motion.div>
      <motion.span
        className="text-3xl font-bold bg-gradient-to-r from-brand-accent to-brand-accent-dark bg-clip-text text-transparent"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        Voicero.AI
      </motion.span>
    </Link>
  );
}
