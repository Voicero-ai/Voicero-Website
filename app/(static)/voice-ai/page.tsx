import Link from "next/link";
import type { ReactNode } from "react";
import {
  Mic,
  Search,
  Volume2,
  MousePointerClick,
  Scroll,
  Highlighter,
  Navigation,
  RefreshCw,
  Zap,
  Sparkles,
  User,
  TrendingUp,
  BarChart3,
  Clock,
  Heart,
} from "lucide-react";

export default function VoiceAIPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
      {/* Background Shapes */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-44 -left-36 w-96 h-96 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-48 -right-40 w-[28rem] h-[28rem] bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/3 left-2/3 w-72 h-72 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      <main className="relative z-10 px-4 sm:px-6 pt-28 pb-20">
        {/* Hero */}
        <section className="max-w-6xl mx-auto mb-14">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="backdrop-blur-xl bg-white/10 border border-purple-500/30 rounded-3xl p-8">
              <div className="inline-flex items-center gap-3 mb-5 px-5 py-2.5 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-full border border-purple-500/30">
                <Mic className="w-5 h-5 text-purple-300" />
                <span className="text-purple-200 font-medium">Voice AI</span>
              </div>
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-white via-purple-200 to-violet-200 bg-clip-text text-transparent">
                Hands‑free browsing that actually helps
              </h1>
              <p className="text-gray-300 text-base sm:text-lg max-w-2xl">
                Your customers talk, Voicero does the rest — search the site,
                navigate, and take actions live.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Pill icon={<Search className="w-4 h-4" />}>Site search</Pill>
                <Pill icon={<Navigation className="w-4 h-4" />}>Navigate</Pill>
                <Pill icon={<MousePointerClick className="w-4 h-4" />}>
                  Click
                </Pill>
                <Pill icon={<Scroll className="w-4 h-4" />}>Scroll</Pill>
                <Pill icon={<Highlighter className="w-4 h-4" />}>
                  Highlight
                </Pill>
                <Pill icon={<RefreshCw className="w-4 h-4" />}>Live data</Pill>
              </div>
              <div className="mt-8">
                <Link href="/contact" className="inline-block">
                  <button className="bg-gradient-to-r from-purple-600 to-violet-600 px-8 py-4 rounded-2xl font-semibold hover:brightness-110 transition-all">
                    Try Voice AI
                  </button>
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-purple-500/20 p-6 bg-gradient-to-br from-purple-900/20 to-violet-900/20">
              <div className="space-y-4">
                <Dialogue
                  user="Show me waterproof boots under $120"
                  ai="I found 8 options under $120. Top picks are the TrailGuard at $109 and StormFlex at $119. Want me to open reviews or add a size 10 to your cart?"
                />
                <Dialogue
                  user="Scroll to sizing guide"
                  ai="Scrolling to the sizing guide and highlighting the conversion table for you."
                />
                <Dialogue
                  user="Go to checkout"
                  ai="Redirecting to checkout. I can auto-fill your shipping details if you like."
                />
              </div>
            </div>
          </div>
        </section>

        {/* What it is */}
        <section className="max-w-6xl mx-auto mb-20">
          <Header
            icon={<Sparkles className="w-5 h-5 text-purple-300" />}
            title="What it is"
            subtitle="A real voice layer for your website"
          />
          <div className="grid lg:grid-cols-3 gap-6">
            <InfoCard
              icon={<Volume2 className="w-6 h-6 text-purple-300" />}
              title="Natural voice commands"
              desc="Understands everyday language — no rigid phrasing required."
            />
            <InfoCard
              icon={<RefreshCw className="w-6 h-6 text-violet-300" />}
              title="Live website research"
              desc="Fetches fresh content and context before answering."
            />
            <InfoCard
              icon={<Navigation className="w-6 h-6 text-indigo-300" />}
              title="Action engine"
              desc="Clicks, scrolls, fills forms, highlights, and redirects on command."
            />
          </div>
        </section>

        {/* What it does */}
        <section className="max-w-7xl mx-auto mb-20">
          <Header
            icon={<Zap className="w-5 h-5 text-purple-300" />}
            title="What it does"
            subtitle="Real actions that move customers forward"
          />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <DoCard
              icon={<Search className="w-6 h-6" />}
              title="Search across pages"
              color="purple"
              desc="Ask for products, policies, or content — answers appear instantly."
            />
            <DoCard
              icon={<MousePointerClick className="w-6 h-6" />}
              title="Auto click"
              color="violet"
              desc="Opens, selects, and confirms elements you mention by name."
            />
            <DoCard
              icon={<Scroll className="w-6 h-6" />}
              title="Auto scroll"
              color="indigo"
              desc="Jumps to sections like Reviews, Specs, or Return Policy."
            />
            <DoCard
              icon={<Highlighter className="w-6 h-6" />}
              title="Highlight info"
              color="blue"
              desc="Spotlights key content so shoppers don't miss important details."
            />
            <DoCard
              icon={<Navigation className="w-6 h-6" />}
              title="Redirect smartly"
              color="cyan"
              desc="Moves to checkout, account, or any page on request."
            />
            <DoCard
              icon={<RefreshCw className="w-6 h-6" />}
              title="Stay up to date"
              color="purple"
              desc="Pulls current pricing, availability, and options before acting."
            />
          </div>
        </section>

        {/* Why customers love it */}
        <section className="max-w-6xl mx-auto mb-20">
          <Header
            icon={<User className="w-5 h-5 text-blue-300" />}
            title="Why customers love it"
            subtitle="Faster, clearer, and more human"
          />
          <ul className="grid md:grid-cols-2 gap-6">
            <Benefit
              title="Instant help, 24/7"
              desc="Answers and actions without waiting in a queue or finding the right page."
              icon={<Clock className="w-5 h-5 text-blue-300" />}
            />
            <Benefit
              title="Feels personal"
              desc="Understands context and follows up like a great in‑store associate."
              icon={<Heart className="w-5 h-5 text-violet-300" />}
            />
            <Benefit
              title="No guesswork"
              desc="Highlights the exact info they asked for and confirms the next step."
              icon={<Highlighter className="w-5 h-5 text-purple-300" />}
            />
            <Benefit
              title="Accessible by voice"
              desc="Comfortable for mobile, multi‑tasking, and accessibility needs."
              icon={<Mic className="w-5 h-5 text-indigo-300" />}
            />
          </ul>
        </section>

        {/* Why companies use it */}
        <section className="max-w-6xl mx-auto">
          <Header
            icon={<TrendingUp className="w-5 h-5 text-purple-300" />}
            title="Why companies use it"
            subtitle="Revenue up, costs down"
          />
          <ul className="grid md:grid-cols-2 gap-6">
            <Benefit
              title="Reduce support load"
              desc="Deflect routine questions and actions so your team handles only edge cases."
              icon={<Zap className="w-5 h-5 text-purple-300" />}
            />
            <Benefit
              title="Higher conversions"
              desc="Guide shoppers to the right products and reduce friction on the path to checkout."
              icon={<BarChart3 className="w-5 h-5 text-blue-300" />}
            />
            <Benefit
              title="Customer insight"
              desc="Learn what people ask for and where they get stuck to improve your site."
              icon={<Sparkles className="w-5 h-5 text-violet-300" />}
            />
            <Benefit
              title="Scales automatically"
              desc="Serve thousands of simultaneous voice sessions without adding staff."
              icon={<RefreshCw className="w-5 h-5 text-indigo-300" />}
            />
          </ul>
          <div className="text-center mt-10">
            <Link href="/features" className="inline-block">
              <button className="bg-gradient-to-r from-purple-600 to-violet-600 px-8 py-4 rounded-2xl font-semibold hover:brightness-110 transition-all">
                Explore All Features
              </button>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function Pill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-sm text-gray-200">
      {icon}
      {children}
    </span>
  );
}

function Header({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center gap-3 mb-3 px-4 py-2 rounded-full border border-purple-500/20 bg-purple-500/10">
        {icon}
        <span className="text-gray-200 font-medium">{title}</span>
      </div>
      <h2 className="text-2xl sm:text-4xl font-bold mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
        {subtitle}
      </h2>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  desc,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="backdrop-blur-xl bg-gradient-to-br from-purple-900/30 to-violet-900/30 border border-purple-500/30 rounded-2xl p-6">
      <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-gray-300 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function DoCard({
  icon,
  title,
  desc,
  color,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  color: "purple" | "violet" | "indigo" | "blue" | "cyan";
}) {
  const tone: Record<string, string> = {
    purple: "from-purple-900/30 to-violet-900/30 border-purple-500/30",
    violet: "from-violet-900/30 to-purple-900/30 border-violet-500/30",
    indigo: "from-indigo-900/30 to-blue-900/30 border-indigo-500/30",
    blue: "from-blue-900/30 to-indigo-900/30 border-blue-500/30",
    cyan: "from-cyan-900/30 to-blue-900/30 border-cyan-500/30",
  };
  return (
    <div
      className={`backdrop-blur-xl bg-gradient-to-br ${tone[color]} rounded-2xl p-6 border`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
          {icon}
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <p className="text-gray-300 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function Benefit({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: ReactNode;
}) {
  return (
    <li className="backdrop-blur-xl bg-white/10 border border-purple-500/20 rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h4 className="text-base font-semibold mb-1">{title}</h4>
          <p className="text-gray-300 text-sm leading-relaxed">{desc}</p>
        </div>
      </div>
    </li>
  );
}

function Dialogue({ user, ai }: { user: string; ai: string }) {
  return (
    <div className="rounded-2xl border border-purple-500/20 p-4 bg-white/5">
      <p className="text-purple-200 mb-2">👤 "{user}"</p>
      <p className="text-gray-200">🤖 "{ai}"</p>
    </div>
  );
}
