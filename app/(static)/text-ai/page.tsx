import Link from "next/link";
import type { ReactNode } from "react";
import {
  MessageCircle,
  Bot,
  Search,
  ShoppingCart,
  RefreshCw,
  PackageSearch,
  Package2,
  Undo2,
  ArrowLeftRight,
  Sparkles,
  User,
  TrendingUp,
  BarChart3,
  Clock,
  Heart,
} from "lucide-react";

export default function TextAIPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
      {/* Background Shapes */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-44 -left-36 w-96 h-96 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-48 -right-40 w-[28rem] h-[28rem] bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/3 left-2/3 w-72 h-72 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      <main className="relative z-10 px-4 sm:px-6 pt-28 pb-20">
        {/* Hero */}
        <section className="max-w-6xl mx-auto mb-14">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="backdrop-blur-xl bg-white/10 border border-blue-500/30 rounded-3xl p-8">
              <div className="inline-flex items-center gap-3 mb-5 px-5 py-2.5 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 rounded-full border border-blue-500/30">
                <MessageCircle className="w-5 h-5 text-blue-300" />
                <span className="text-blue-200 font-medium">Text AI</span>
              </div>
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                Chat that resolves, not just responds
              </h1>
              <p className="text-gray-300 text-base sm:text-lg max-w-2xl">
                Voicero Text handles orders, returns, exchanges, and carts — all
                in one conversation.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Pill icon={<PackageSearch className="w-4 h-4" />}>
                  Get orders
                </Pill>
                <Pill icon={<Package2 className="w-4 h-4" />}>
                  Track orders
                </Pill>
                <Pill icon={<Undo2 className="w-4 h-4" />}>Auto return</Pill>
                <Pill icon={<ArrowLeftRight className="w-4 h-4" />}>
                  Auto exchange
                </Pill>
                <Pill icon={<ShoppingCart className="w-4 h-4" />}>
                  Add to cart
                </Pill>
              </div>
              <div className="mt-8">
                <Link href="/contact" className="inline-block">
                  <button className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-4 rounded-2xl font-semibold hover:brightness-110 transition-all">
                    Try Text AI
                  </button>
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-blue-500/20 p-6 bg-gradient-to-br from-blue-900/20 to-indigo-900/20">
              <div className="space-y-4">
                <Dialogue
                  user="Where's my order #18245?"
                  ai="Your order #18245 shipped yesterday with UPS. Estimated delivery is Friday. Want me to text you updates?"
                />
                <Dialogue
                  user="I need to exchange size M to L"
                  ai="I can start an exchange for the same color in size L and email a prepaid label. Confirm?"
                />
                <Dialogue
                  user="Add 2 black tees to my cart"
                  ai="Added 2 Black Essentials Tees to your cart. Ready to checkout?"
                />
              </div>
            </div>
          </div>
        </section>

        {/* What it is */}
        <section className="max-w-6xl mx-auto mb-20">
          <Header
            icon={<Sparkles className="w-5 h-5 text-blue-300" />}
            title="What it is"
            subtitle="Full‑service chat, powered by your data"
          />
          <div className="grid lg:grid-cols-3 gap-6">
            <InfoCard
              icon={<Bot className="w-6 h-6 text-blue-300" />}
              title="Company‑trained"
              desc="Uses your products, policies, and content to give precise answers."
            />
            <InfoCard
              icon={<Search className="w-6 h-6 text-indigo-300" />}
              title="Understands context"
              desc="Remembers the conversation and user details during the session."
            />
            <InfoCard
              icon={<RefreshCw className="w-6 h-6 text-violet-300" />}
              title="Always current"
              desc="Pulls live availability, pricing, and options before it acts."
            />
          </div>
        </section>

        {/* What it does */}
        <section className="max-w-7xl mx-auto mb-20">
          <Header
            icon={<ShoppingCart className="w-5 h-5 text-blue-300" />}
            title="What it does"
            subtitle="Gets stuff done inside chat"
          />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <DoCard
              icon={<PackageSearch className="w-6 h-6" />}
              title="Get orders"
              color="blue"
              desc="Find orders by email, order #, or customer account, instantly."
            />
            <DoCard
              icon={<Package2 className="w-6 h-6" />}
              title="Track packages"
              color="indigo"
              desc="Pulls carrier status and ETAs right into the chat."
            />
            <DoCard
              icon={<Undo2 className="w-6 h-6" />}
              title="Auto returns"
              color="cyan"
              desc="Generates labels and initiates refunds without manual steps."
            />
            <DoCard
              icon={<ArrowLeftRight className="w-6 h-6" />}
              title="Auto exchanges"
              color="violet"
              desc="Swaps variants and confirms the new order in seconds."
            />
            <DoCard
              icon={<ShoppingCart className="w-6 h-6" />}
              title="Add to cart"
              color="purple"
              desc="Adds items from suggestions or Q&A right to the cart."
            />
            <DoCard
              icon={<RefreshCw className="w-6 h-6" />}
              title="Update info"
              color="blue"
              desc="Edits addresses, preferences, and subscriptions on request."
            />
          </div>
        </section>

        {/* Why customers love it */}
        <section className="max-w-6xl mx-auto mb-20">
          <Header
            icon={<User className="w-5 h-5 text-indigo-300" />}
            title="Why customers love it"
            subtitle="Quick, clear, and capable"
          />
          <ul className="grid md:grid-cols-2 gap-6">
            <Benefit
              title="Instant resolutions"
              desc="Returns, exchanges, and updates completed inside one chat."
              icon={<Clock className="w-5 h-5 text-indigo-300" />}
            />
            <Benefit
              title="Personalized help"
              desc="Remembers context and history within the session for tailored replies."
              icon={<Heart className="w-5 h-5 text-violet-300" />}
            />
            <Benefit
              title="No dead ends"
              desc="If an action is needed, it performs it — not just points to a page."
              icon={<ShoppingCart className="w-5 h-5 text-blue-300" />}
            />
            <Benefit
              title="Fast info retrieval"
              desc="Vectorized content makes answers and actions feel instant."
              icon={<Sparkles className="w-5 h-5 text-purple-300" />}
            />
          </ul>
        </section>

        {/* Why companies use it */}
        <section className="max-w-6xl mx-auto">
          <Header
            icon={<TrendingUp className="w-5 h-5 text-blue-300" />}
            title="Why companies use it"
            subtitle="Happier customers, leaner ops"
          />
          <ul className="grid md:grid-cols-2 gap-6">
            <Benefit
              title="Lower support costs"
              desc="Deflects repetitive tickets so teams can focus on high‑value issues."
              icon={<RefreshCw className="w-5 h-5 text-indigo-300" />}
            />
            <Benefit
              title="More revenue"
              desc="Assists with purchasing and reduces abandonment in key flows."
              icon={<BarChart3 className="w-5 h-5 text-blue-300" />}
            />
            <Benefit
              title="Daily insights"
              desc="Shows what customers ask and where to improve content and UX."
              icon={<Sparkles className="w-5 h-5 text-violet-300" />}
            />
            <Benefit
              title="Scales on demand"
              desc="Handles peak volume without additional headcount or tooling."
              icon={<Bot className="w-5 h-5 text-purple-300" />}
            />
          </ul>
          <div className="text-center mt-10">
            <Link href="/features" className="inline-block">
              <button className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-4 rounded-2xl font-semibold hover:brightness-110 transition-all">
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
      <div className="inline-flex items-center gap-3 mb-3 px-4 py-2 rounded-full border border-blue-500/20 bg-blue-500/10">
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
    <div className="backdrop-blur-xl bg-gradient-to-br from-blue-900/30 to-indigo-900/30 border border-blue-500/30 rounded-2xl p-6">
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
    <li className="backdrop-blur-xl bg-white/10 border border-blue-500/20 rounded-2xl p-5">
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
    <div className="rounded-2xl border border-blue-500/20 p-4 bg-white/5">
      <p className="text-blue-200 mb-2">👤 "{user}"</p>
      <p className="text-gray-200">🤖 "{ai}"</p>
    </div>
  );
}
