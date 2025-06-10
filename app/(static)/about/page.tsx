"use client";

import React from "react";
import { motion } from "framer-motion";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-black py-20">
      {/* Our Why Content Section */}
      <section className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mx-auto"
        >
          <h1 className="text-5xl lg:text-6xl font-bold text-white mb-10 leading-tight" style={{ color: "#FFFFFF" }}>
            Our <span className="text-purple-500" style={{ color: "#8B5CF6" }}>Why</span>
          </h1>
          
          <div className="space-y-8 text-xl">
            <p className="text-white" style={{ color: "#FFFFFF" }}>
              At Voicero, we think every online store deserves the same tools the big guys have without breaking the bank. After spending years building and scaling several 7 figure e-commerce stores, we realized firsthand how powerful <span className="bg-purple-500 text-white px-2 py-1 rounded" style={{ backgroundColor: "#8B5CF6" }}>AI can be at boosting conversions</span>, often 3 to 5 times better than traditional methods. But here's the catch: those top tier AI tools were either way too expensive or super complicated to use. We created Voicero to solve exactly that problem.
            </p>
            
            <p className="text-white" style={{ color: "#FFFFFF" }}>
              Our main goal is pretty straightforward: <span className="bg-purple-500 text-white px-2 py-1 rounded" style={{ backgroundColor: "#8B5CF6" }}>help entrepreneurs succeed</span>. When your store converts better, you're not just throwing money at ads that don't work; you're actually growing, reinvesting in better products, happier customers, and an awesome team. Voicero bundles all our best AI tricks into a simple, user friendly voice assistant that handles everything from returns and product recommendations to turning casual visitors into loyal customers without needing extra staff.
            </p>
            
            <p className="text-white" style={{ color: "#FFFFFF" }}>
              At our core, we're guided by four key values. <span className="bg-purple-500 text-white px-2 py-1 rounded" style={{ backgroundColor: "#8B5CF6" }}>Innovation First</span> means we never stop improving. <span className="bg-purple-500 text-white px-2 py-1 rounded" style={{ backgroundColor: "#8B5CF6" }}>Customer Focused</span> reminds us it's all about delivering real results, not just fancy numbers. <span className="bg-purple-500 text-white px-2 py-1 rounded" style={{ backgroundColor: "#8B5CF6" }}>Global Impact</span> is why we keep our tools affordable, so businesses everywhere can level up. And <span className="bg-purple-500 text-white px-2 py-1 rounded" style={{ backgroundColor: "#8B5CF6" }}>Passion Driven</span> is the reason we hustle late nights, excited to solve real problems. Bottom line: we built Voicero because we genuinely care about making your business thrive.
            </p>
            
            <div className="border-l-4 border-purple-500 pl-6 py-2 mt-10" style={{ borderColor: "#8B5CF6" }}>
              <p className="text-2xl font-medium text-white" style={{ color: "#FFFFFF" }}>
                So, start succeeding.
              </p>
              <p className="text-2xl font-medium text-white" style={{ color: "#FFFFFF" }}>
                Because when everyone does, <span className="bg-purple-500 text-white px-2 py-1 rounded" style={{ backgroundColor: "#8B5CF6" }}>no one is left behind</span>.
              </p>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
