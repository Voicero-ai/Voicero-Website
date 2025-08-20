import Link from "next/link";
import type { ReactNode } from "react";
import {
  Mic,
  MessageCircle,
  MousePointerClick,
  Scroll,
  Highlighter,
  Navigation,
  Edit3,
  ShoppingCart,
  Package2,
  PackageSearch,
  RefreshCw,
  ArrowLeftRight,
  Undo2,
  BarChart3,
  Brain,
  Sparkles,
  CalendarDays,
  Gauge,
} from "lucide-react";

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white overflow-x-hidden relative">
      {/* Background Shapes */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      <main className="relative z-10 pt-32 pb-24 px-4 sm:px-6">
        {/* Header */}
        <section className="max-w-6xl mx-auto text-center mb-16">
          <div className="inline-flex items-center gap-3 mb-6 px-5 py-2.5 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-full border border-purple-500/30">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <span className="text-purple-300 font-medium">
              Powerful Features
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-white via-purple-200 to-violet-200 bg-clip-text text-transparent">
            Built for real customer experiences
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-300 max-w-3xl mx-auto">
            Same design language and color system you love — now focused on what
            Voice + Text + Company intelligence actually does for you.
          </p>
        </section>

        {/* Voice AI Features */}
        <section className="max-w-7xl mx-auto mb-20">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-3 mb-4 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full">
              <Mic className="w-5 h-5 text-purple-300" />
              <span className="text-purple-200 font-medium">Voice AI</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Hands‑free website control
            </h2>
            <p className="text-gray-300 max-w-2xl mx-auto">
              Let customers browse and take action without lifting a finger.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<MousePointerClick className="w-6 h-6 text-purple-300" />}
              title="Auto Click"
              desc="Trigger precise clicks anywhere on the page based on natural voice commands."
              tone="purple"
            />
            <FeatureCard
              icon={<Edit3 className="w-6 h-6 text-violet-300" />}
              title="Auto Fill Form"
              desc="Fill inputs, selects, and textareas with voice — names, emails, order numbers, and more."
              tone="violet"
            />
            <FeatureCard
              icon={<Scroll className="w-6 h-6 text-indigo-300" />}
              title="Auto Scroll"
              desc="Scroll to sections, products, or elements by name. ‘Scroll to reviews’, done."
              tone="indigo"
            />
            <FeatureCard
              icon={<Highlighter className="w-6 h-6 text-blue-300" />}
              title="Highlight"
              desc="Call attention to elements and content so users never get lost."
              tone="blue"
            />
            <FeatureCard
              icon={<Navigation className="w-6 h-6 text-cyan-300" />}
              title="Redirect"
              desc="Jump to pages or deep‑links instantly — ‘Go to checkout’, ‘Open return policy’."
              tone="cyan"
            />
          </div>
        </section>

        {/* Text AI Features */}
        <section className="max-w-7xl mx-auto mb-20">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-3 mb-4 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full">
              <MessageCircle className="w-5 h-5 text-blue-300" />
              <span className="text-blue-200 font-medium">Voicero Text</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Concierge‑level chat that actually does things
            </h2>
            <p className="text-gray-300 max-w-2xl mx-auto">
              Not just answers — actions. Orders, returns, exchanges, and carts.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<PackageSearch className="w-6 h-6 text-blue-300" />}
              title="Get Orders"
              desc="Pull order details by email, order number, or customer account."
              tone="blue"
            />
            <FeatureCard
              icon={<Package2 className="w-6 h-6 text-indigo-300" />}
              title="Track Orders"
              desc="Give live tracking updates and delivery ETAs right in chat."
              tone="indigo"
            />
            <FeatureCard
              icon={<Undo2 className="w-6 h-6 text-cyan-300" />}
              title="Auto Return"
              desc="Generate labels, initiate returns, and confirm refund timelines automatically."
              tone="cyan"
            />
            <FeatureCard
              icon={<ArrowLeftRight className="w-6 h-6 text-violet-300" />}
              title="Auto Exchange"
              desc="Swap sizes, colors, or variants and update orders in seconds."
              tone="violet"
            />
            <FeatureCard
              icon={<ShoppingCart className="w-6 h-6 text-purple-300" />}
              title="Add To Cart"
              desc="Add items to cart from recommendations or product Q&A."
              tone="purple"
            />
          </div>
        </section>

        {/* Company Features */}
        <section className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-3 mb-4 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full">
              <Brain className="w-5 h-5 text-violet-300" />
              <span className="text-violet-200 font-medium">
                Company Intelligence
              </span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Insights that improve your site every day
            </h2>
            <p className="text-gray-300 max-w-2xl mx-auto">
              Daily automatic processing turns conversations into actions you
              can take.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<BarChart3 className="w-6 h-6 text-purple-300" />}
              title="What Customers Ask"
              desc="See trending questions, stuck points, and intent — updated every day."
              tone="purple"
            />
            <FeatureCard
              icon={<Gauge className="w-6 h-6 text-indigo-300" />}
              title="Lower Questions"
              desc="Recommendations to reduce repetitive questions by improving pages, FAQs, and flows."
              tone="indigo"
            />
            <FeatureCard
              icon={<CalendarDays className="w-6 h-6 text-blue-300" />}
              title="Daily Processing"
              desc="Automatic analysis runs every day — no setup, no reports to build."
              tone="blue"
            />
          </div>

          {/* CTA */}
          <div className="text-center mt-12">
            <Link href="/contact" className="inline-block">
              <button className="bg-gradient-to-r from-purple-600 to-violet-600 px-8 py-4 rounded-2xl font-semibold hover:scale-105 transition-all duration-300">
                Try these features on your site
              </button>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

type FeatureCardProps = {
  icon: ReactNode;
  title: string;
  desc: string;
  tone: "purple" | "violet" | "indigo" | "blue" | "cyan";
};

function FeatureCard({ icon, title, desc, tone }: FeatureCardProps) {
  const toneMap: Record<FeatureCardProps["tone"], string> = {
    purple:
      "bg-gradient-to-br from-purple-900/30 to-violet-900/30 border-purple-500/30",
    violet:
      "bg-gradient-to-br from-violet-900/30 to-purple-900/30 border-violet-500/30",
    indigo:
      "bg-gradient-to-br from-indigo-900/30 to-blue-900/30 border-indigo-500/30",
    blue: "bg-gradient-to-br from-blue-900/30 to-indigo-900/30 border-blue-500/30",
    cyan: "bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-cyan-500/30",
  };

  return (
    <div
      className={`backdrop-blur-xl ${toneMap[tone]} border rounded-3xl p-6 hover:scale-105 transition-all duration-500`}
    >
      <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-300 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}
