"use client";

import React from "react";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";

const steps = [
  {
    title: "Connect",
    description: "Seamlessly integrate our platform with your existing systems",
    icon: "🔌",
  },
  {
    title: "Configure",
    description: "Customize settings to match your specific requirements",
    icon: "⚙️",
  },
  {
    title: "Analyze",
    description: "Get powerful insights from your data in real-time",
    icon: "📊",
  },
  {
    title: "Optimize",
    description: "Make data-driven decisions to improve performance",
    icon: "🚀",
  },
];

export default function Process() {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: {
      opacity: 0,
      y: 20,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
      },
    },
  };

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-bold text-brand-dark mb-4">
            How It Works
          </h2>
          <p className="text-xl text-brand-dark/70">
            Follow our simple process to get started
          </p>
        </motion.div>

        <motion.div
          ref={ref}
          variants={containerVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="grid grid-cols-1 md:grid-cols-4 gap-8"
        >
          {steps.map((step, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="relative"
            >
              <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <div className="text-4xl mb-4">{step.icon}</div>
                <h3 className="text-xl font-bold text-brand-dark mb-2">
                  {step.title}
                </h3>
                <p className="text-brand-dark/70">{step.description}</p>
              </div>
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-brand-accent/30" />
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
} 