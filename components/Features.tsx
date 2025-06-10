"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from "chart.js";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const chartTypes = [
  {
    key: "realtime",
    label: "Realtime",
    title: "Revenue Lost Due to Low Conversion Rates",
    xLabel: "Year",
    yLabel: "Money Lost ($B)",
    data: {
      labels: ["2019", "2020", "2021", "2022", "2023", "2024"],
      datasets: [
        { 
          label: "WordPress Sites", 
          data: [40, 44, 48, 52, 56, 60], 
          fill: true,
          borderColor: '#FF6B6B',
          backgroundColor: 'rgba(255, 107, 107, 0.2)',
          tension: 0.4
        },
        { 
          label: "Shopify Stores", 
          data: [20, 26, 32, 38, 44, 50], 
          fill: true,
          borderColor: '#4ECDC4',
          backgroundColor: 'rgba(78, 205, 196, 0.2)',
          tension: 0.4
        },
      ],
    },
  },
  {
    key: "predictive",
    label: "Predictive",
    title: "Correlation: User Engagement & Conversion Rates",
    xLabel: "User Engagement Level",
    yLabel: "Conversion Rate (%)",
    data: {
      labels: ["Very Low", "Low", "Medium", "High", "Very High"],
      datasets: [{ 
        label: "Conversion Rate by Engagement (%)", 
        data: [1.2, 2.8, 4.5, 7.9, 12.3], 
        fill: true,
        borderColor: '#FFD93D',
        backgroundColor: 'rgba(255, 217, 61, 0.2)',
        tension: 0.4
      }],
    },
  },
  {
    key: "performance",
    label: "Performance",
    title: "Conversion Rate Increase with Voicero",
    xLabel: "Time After Implementation",
    yLabel: "Increase (%)",
    data: {
      labels: ["1M", "3M", "6M", "9M", "12M"],
      datasets: [
        { 
          label: "Voicero Increase (%)", 
          data: [15, 32, 58, 84, 127], 
          fill: true,
          borderColor: '#6C5CE7',
          backgroundColor: 'rgba(108, 92, 231, 0.2)',
          tension: 0.4
        },
        { 
          label: "WP Sites", 
          data: [12, 28, 52, 79, 118], 
          fill: true,
          borderColor: '#FF6B6B',
          backgroundColor: 'rgba(255, 107, 107, 0.2)',
          tension: 0.4
        },
        { 
          label: "Shopify Stores", 
          data: [18, 37, 65, 92, 136], 
          fill: true,
          borderColor: '#4ECDC4',
          backgroundColor: 'rgba(78, 205, 196, 0.2)',
          tension: 0.4
        },
      ],
    },
  },
];

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      grid: { color: "rgba(255,255,255,0.1)" },
      title: { display: true, color: "rgba(255,255,255,0.8)" },
      ticks: { color: "rgba(255,255,255,0.8)", font: { size: 12 }, maxRotation: 45, minRotation: 45 },
    },
    y: {
      beginAtZero: true,
      grid: { color: "rgba(255,255,255,0.1)" },
      title: { display: true, color: "rgba(255,255,255,0.8)" },
      ticks: { color: "rgba(255,255,255,0.8)", font: { size: 12 } },
    },
  },
  plugins: {
    legend: { position: "top", labels: { color: "rgba(255,255,255,0.8)", font: { size: 12 } } },
    title: { display: true, text: "", color: "rgba(255,255,255,0.8)", font: { size: 16, weight: "bold" } },
    tooltip: {
      callbacks: {
        label: (ctx: {
          dataset: { label?: string };
          parsed: { y: number };
        }) => {
          let label = ctx.dataset.label || "";
          const v = ctx.parsed.y;
          if (label.includes("Sites")) return `${label}: $${v}B`;
          if (label.includes("Rate") || label.includes("Increase")) return `${label}: ${v}%`;
          return `${label}: ${v}`;
        },
      },
    },
  },
  elements: { line: { tension: 0.4 }, point: { radius: 5, hoverRadius: 7 } },
};

export default function Features() {
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true });
  const [active, setActive] = useState(chartTypes[0].key);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const getOpts = () => {
    const opts = JSON.parse(JSON.stringify(baseOptions));
    const cfg = chartTypes.find(c => c.key === active)!;
    opts.plugins.title.text = cfg.title;
    opts.scales.x.title.text = cfg.xLabel;
    opts.scales.y.title.text = cfg.yLabel;
    if (isMobile) {
      opts.scales.x.ticks.font.size = 10;
      opts.scales.y.ticks.font.size = 10;
      opts.plugins.legend.labels.font.size = 10;
      opts.plugins.title.font.size = 14;
      opts.elements.point.radius = 3;
      opts.elements.point.hoverRadius = 5;
    }
    return opts;
  };

  return (
    <section ref={ref} className="w-full py-3 sm:py-1 bg-black px-4 sm:px-0">
      <div className="text-center mb-8 mt-8 sm:mt-12">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.6 }} 
          className="whitespace-normal text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight"
        >
          Boost Conversions and Stop Losing Revenue
        </motion.h2>
      </div>

      <div className="container mx-auto px-4 bg-gradient-to-br from-[#2D1F3D]/80 to-[#1A1A1A]/80 rounded-2xl shadow-2xl p-4 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5 }} className="w-full h-[300px] sm:h-[400px] md:h-[500px] lg:h-[550px]">
            <Line options={getOpts()} data={chartTypes.find(c => c.key === active)!.data} />
          </motion.div>
        </AnimatePresence>

        <div className="flex justify-center mt-4 sm:mt-6 space-x-3">
          {chartTypes.map(cfg => (
            <button key={cfg.key} onClick={() => setActive(cfg.key)} className={`px-4 sm:px-6 py-1.5 sm:py-2 text-sm sm:text-base font-medium rounded-md transition duration-300 ${active === cfg.key ? "bg-purple-600 text-white shadow-lg" : "bg-gray-700/50 text-gray-300 hover:bg-gray-600/70"}`}>
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : 20 }} transition={{ duration: 0.6, delay: 0.3 }} className="mt-12 text-center">
        <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-6">We&apos;ve raised...</h3>
        <div className="relative bg-gradient-to-r from-purple-600 to-pink-500 p-[2px] rounded-2xl mx-auto max-w-lg sm:max-w-xl md:max-w-2xl">
          <div className="bg-black bg-opacity-90 rounded-2xl px-10 py-8 backdrop-blur-sm relative">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8 }} className="text-7xl sm:text-8xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white via-purple-300 to-pink-300">
              $45,000
            </motion.div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.5 }} className="text-gray-400 text-base sm:text-lg mt-4">
              of our $50,000 goal
            </motion.p>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ delay: 0.8, duration: 1.2 }}
              className="mt-6 h-4 bg-gray-800 rounded-full overflow-hidden"
            >
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "90%" }}
                transition={{ delay: 1, duration: 1.5, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-purple-600 to-pink-500"
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2, duration: 0.5, type: "spring" }} className="absolute -top-3 -right-3 bg-white text-purple-600 rounded-full px-3 py-1 text-sm font-bold shadow-lg">
              90% Complete!
            </motion.div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}