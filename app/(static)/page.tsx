import { type Metadata } from "next";
import Hero from "../../components/Hero";
import Features from "../../components/Features";
import BlurSection from "../../components/BlurSection";
// import ScrollingLogos from "../../components/ScrollingLogos";

export default function Home() {
  return (
    <div className="relative">
      <Hero />
      {/* <ScrollingLogos /> */}
      <div>
        <BlurSection />
      </div>
      <div className="-mt-12">
        <Features />
      </div>
    </div>
  );
}
