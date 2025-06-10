"use client";

import { motion } from "framer-motion";
import { FaArrowRight, FaArrowDown } from "react-icons/fa";
import Image from "next/image";

export default function BlurSection() {
  const features = [
    { title: "Manage Returns" },
    { title: "Customer Subscriptions" },
    { title: "Product Recommendations" },
    { title: "Page Navigation" },
    { title: "Order Tracking" },
    { title: "Account Management" },
    { title: "Meeting Scheduling" },
    { title: "General Support" }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6 }
    }
  };

  return (
    <section className="relative w-full flex flex-col items-center justify-center px-4 sm:px-2 pt-0 mt-0 pb-32 overflow-hidden bg-black">
      {/* Top fade gradient */}
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-black via-black/95 to-transparent z-10" />
      
      {/* Header */}
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative z-20 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-16 mt-0 text-white"
      >
        What can Voicero Do
      </motion.h2>

      {/* Embedded Video Demo */}
      <div className="w-full flex justify-center mb-12">
        <video
          src="/video/Voicero Demo.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="w-full max-w-3xl aspect-video rounded-xl overflow-hidden shadow-lg"
        />
      </div>

      {/* Main Content Container */}
      <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-24 mt-8">
        {/* Images Section */}
        <motion.div 
          className="relative w-80 h-80"
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          whileHover={{ scale: 1.02 }}
        >
          <div className="absolute inset-8 bg-white rounded-xl h-[calc(50%-2rem)] mt-11" />
          <Image
            src="/images/2.png"
            alt="Voicero Chat"
            fill
            className="object-contain"
          />
          {/* Connecting Arrow */}
          <motion.div 
            className="absolute -right-12 top-[45%] transform -translate-y-1/2 lg:-right-12 lg:top-[37%] lg:-translate-y-1/2 right-1/2 top-auto bottom-0 translate-x-1/2 translate-y-0 lg:translate-x-0 lg:bottom-auto lg:right-[-3rem] lg:top-[45%]"
            animate={{ x: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="block lg:hidden">
              <FaArrowDown className="text-white w-12 h-12" />
            </span>
            <span className="hidden lg:block">
              <FaArrowRight className="text-white w-12 h-12" />
            </span>
          </motion.div>
        </motion.div>

        {/* Features Grid */}
        <motion.div 
          className="flex-1"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
            {features.map((feature) => (
              <motion.div
                key={feature.title}
                variants={itemVariants}
                whileHover={{ 
                  scale: 1.05,
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  transition: { duration: 0.2 }
                }}
                className="relative group h-[120px]"
              >
                <div className="bg-gradient-to-br from-white/5 to-white/10 border border-white/10 rounded-xl p-4 sm:p-8 backdrop-blur-md transition-all duration-300 group-hover:shadow-lg group-hover:shadow-purple-500/20 h-full flex items-center justify-center">
                  <h3 className="text-white font-semibold text-sm sm:text-lg text-center">{feature.title}</h3>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}