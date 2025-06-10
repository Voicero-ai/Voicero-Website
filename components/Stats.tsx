"use client";

import React from "react";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import CountUp from "react-countup";

const stats = [
  {
    number: 98,
    suffix: "%",
    label: "Customer Satisfaction",
  },
  {
    number: 24,
    suffix: "/7",
    label: "Support Available",
  },
  {
    number: 100,
    suffix: "K+",
    label: "Active Users",
  },
  {
    number: 50,
    suffix: "+",
    label: "Countries Served",
  },
];

export default function Stats() {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  return (
    <section className="py-20 bg-gradient-to-b from-white to-brand-lavender-light/20">
      <div className="container mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-8"
        >
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center p-6 rounded-xl bg-white shadow-lg hover:shadow-xl transition-shadow duration-300"
            >
              <div className="text-4xl font-bold text-brand-accent mb-2">
                {inView && (
                  <CountUp
                    end={stat.number}
                    duration={2.5}
                    separator=","
                    suffix={stat.suffix}
                  />
                )}
              </div>
              <p className="text-brand-dark/70">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
} 