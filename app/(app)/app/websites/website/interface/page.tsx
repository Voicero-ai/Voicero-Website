"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FaHome, FaNewspaper, FaQuestionCircle } from "react-icons/fa";

type BottomNavSettings = {
  home: boolean;
  news: boolean;
  help: boolean;
};

type PopUpQuestion = {
  id: string;
  question: string;
};

type InterfaceSettingsState = {
  id: string;
  color: string;
  botName: string;
  customWelcomeMessage: string;
  popUpQuestions: PopUpQuestion[];
  bottomNav: BottomNavSettings;
};

const STORAGE_KEY_PREFIX = "voicero.interface:";

export default function InterfaceSettingsPage() {
  const searchParams = useSearchParams();
  const websiteId = searchParams.get("id");

  const [state, setState] = useState<InterfaceSettingsState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");

  const questionsRemaining = useMemo(() => {
    return Math.max(0, 3 - (state?.popUpQuestions.length ?? 0));
  }, [state?.popUpQuestions]);

  useEffect(() => {
    if (!websiteId) return;
    (async () => {
      try {
        setIsLoading(true);
        console.log("doing interface-get", { websiteId });
        const res = await fetch(`/api/updateInterface/get?id=${websiteId}`, {
          method: "GET",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) throw new Error("Failed to load interface settings");
        const data = await res.json();
        const w = data.website || {};
        const next: InterfaceSettingsState = {
          id: w.id || websiteId,
          color: w.color || "#000000",
          botName: w.botName || "",
          customWelcomeMessage: w.customWelcomeMessage || "",
          popUpQuestions: (w.popUpQuestions || []).map((p: any) => ({
            id: String(p.id),
            question: String(p.question || ""),
          })),
          bottomNav: {
            home: Boolean(w.showHome),
            news: Boolean(w.showNews),
            help: Boolean(w.showHelp),
          },
        };
        setState(next);
        console.log("done interface-get", { websiteId });
      } catch (e) {
        // fallback minimal
        setState({
          id: websiteId,
          color: "#000000",
          botName: "",
          customWelcomeMessage: "",
          popUpQuestions: [],
          bottomNav: { home: true, news: true, help: true },
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [websiteId]);

  const saveEdit = async (
    payload: Partial<{
      color: string;
      botName: string;
      customWelcomeMessage: string;
      showHome: boolean;
      showNews: boolean;
      showHelp: boolean;
    }>
  ) => {
    if (!websiteId) return;
    setIsSaving(true);
    try {
      console.log("doing interface-edit", { websiteId });
      await fetch(`/api/updateInterface/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteId, ...payload }),
      });
      console.log("done interface-edit", { websiteId });
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = async <K extends keyof InterfaceSettingsState>(
    key: K,
    value: InterfaceSettingsState[K]
  ) => {
    if (!state) return;
    const next: InterfaceSettingsState = {
      ...state,
      [key]: value,
    } as InterfaceSettingsState;
    console.log("doing interface-save", { websiteId });
    setState(next);
    await saveEdit({
      color: key === "color" ? (value as string) : undefined,
      botName: key === "botName" ? (value as string) : undefined,
      customWelcomeMessage:
        key === "customWelcomeMessage" ? (value as string) : undefined,
    });
    console.log("done interface-save", { websiteId });
  };

  const handleColorChange = (val: string) => {
    updateField("color", val);
  };

  const handleBotNameChange = (val: string) => {
    updateField("botName", val);
  };

  const handleWelcomeChange = (val: string) => {
    updateField("customWelcomeMessage", val.slice(0, 200));
  };

  const handleAddQuestion = async () => {
    if (!state) return;
    const trimmed = newQuestion.trim();
    if (!trimmed) return;
    if (state.popUpQuestions.length >= 3) return;
    const nextQuestions = [
      ...state.popUpQuestions,
      { id: `${Date.now()}`, question: trimmed },
    ];
    setNewQuestion("");
    // optimistic
    setState({ ...state, popUpQuestions: nextQuestions });
    try {
      console.log("doing interface-add-question", { websiteId });
      const res = await fetch(`/api/updateInterface/addQuestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteId, question: trimmed }),
      });
      const data = await res.json();
      if (res.ok && data?.id) {
        setState((prev) =>
          prev
            ? {
                ...prev,
                popUpQuestions: prev.popUpQuestions.map((q) =>
                  q.id === nextQuestions[nextQuestions.length - 1].id
                    ? { ...q, id: String(data.id) }
                    : q
                ),
              }
            : prev
        );
      }
      console.log("done interface-add-question", { websiteId });
    } catch {}
  };

  const handleRemoveQuestion = async (id: string) => {
    if (!state) return;
    const nextQuestions = state.popUpQuestions.filter((q) => q.id !== id);
    setState({ ...state, popUpQuestions: nextQuestions });
    try {
      console.log("doing interface-delete-question", { websiteId });
      await fetch(`/api/updateInterface/deleteQuestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteId, id }),
      });
      console.log("done interface-delete-question", { websiteId });
    } catch {}
  };

  const handleToggleBottomNav = async (key: keyof BottomNavSettings) => {
    if (!state) return;
    const next: InterfaceSettingsState = {
      ...state,
      bottomNav: { ...state.bottomNav, [key]: !state.bottomNav[key] },
    };
    console.log("doing interface-nav-toggle", { websiteId });
    setState(next);
    const map: Record<string, keyof ReturnType<typeof Object>> = {};
    const payload: any = {};
    if (key === "home") payload.showHome = next.bottomNav.home;
    if (key === "news") payload.showNews = next.bottomNav.news;
    if (key === "help") payload.showHelp = next.bottomNav.help;
    await saveEdit(payload);
    console.log("done interface-nav-toggle", { websiteId });
  };

  const navIcon = (key: keyof BottomNavSettings) => {
    switch (key) {
      case "home":
        return <FaHome className="w-5 h-5" />;
      case "news":
        return <FaNewspaper className="w-5 h-5" />;
      case "help":
        return <FaQuestionCircle className="w-5 h-5" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-text-primary">
            Edit Interface
          </h1>
        </div>
      </div>

      {(isLoading || !state) && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6 animate-pulse">
            <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
            <div className="h-10 w-full bg-gray-100 rounded" />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6 animate-pulse">
            <div className="h-6 w-36 bg-gray-200 rounded mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="h-10 w-full bg-gray-100 rounded" />
              <div className="h-24 w-full bg-gray-100 rounded md:col-span-2" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6 animate-pulse">
            <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
            <div className="h-10 w-full bg-gray-100 rounded mb-3" />
            <div className="flex gap-2">
              <div className="h-8 w-20 bg-gray-100 rounded" />
              <div className="h-8 w-20 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
      )}

      {state && !isLoading && (
        <>
          {/* Appearance */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
            <h2 className="text-xl font-semibold text-brand-text-primary mb-4">
              Appearance
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-brand-text-secondary mb-2">
                  Primary Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={state.color}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="h-10 w-14 p-1 rounded border border-brand-lavender-light/30"
                  />
                  <input
                    type="text"
                    value={state.color}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="flex-1 px-3 py-2 border border-brand-lavender-light/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/40 text-black"
                    placeholder="#000000"
                  />
                  <div
                    className="h-10 w-10 rounded-lg border border-brand-lavender-light/30"
                    style={{ backgroundColor: state.color }}
                    title={state.color}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Assistant */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
            <h2 className="text-xl font-semibold text-brand-text-primary mb-4">
              AI Identity
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-brand-text-secondary mb-2">
                  AI Name
                </label>
                <input
                  type="text"
                  value={state.botName}
                  onChange={(e) => handleBotNameChange(e.target.value)}
                  className="w-full px-3 py-2 border border-brand-lavender-light/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/40 text-black"
                  placeholder="Assistant"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-brand-text-secondary mb-2">
                  Welcome Message
                </label>
                <textarea
                  value={state.customWelcomeMessage}
                  onChange={(e) => handleWelcomeChange(e.target.value)}
                  maxLength={50}
                  className="w-full min-h-[100px] px-3 py-2 border border-brand-lavender-light/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/40 text-black"
                  placeholder="Hi there! How can I help you today?"
                />
                <div className="text-xs text-brand-text-secondary mt-1">
                  {state.customWelcomeMessage.length}/50
                </div>
              </div>
            </div>
          </div>

          {/* Pop-up Questions */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-brand-text-primary">
                Pop-up Questions
              </h2>
              <div className="text-sm text-brand-text-secondary">
                Remaining: {questionsRemaining}
              </div>
            </div>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                className="flex-1 px-3 py-2 border border-brand-lavender-light/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/40 text-black"
                placeholder="Add a quick question (max 3)"
                maxLength={120}
              />
              <button
                onClick={handleAddQuestion}
                disabled={
                  !newQuestion.trim() || state.popUpQuestions.length >= 3
                }
                className="px-4 py-2 rounded-lg bg-brand-accent text-white disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {state.popUpQuestions.length === 0 ? (
              <div className="p-4 bg-brand-lavender-light/10 rounded-lg text-sm text-brand-text-secondary">
                No questions yet.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {state.popUpQuestions.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center gap-2 px-3 py-2 bg-brand-lavender-light/10 rounded-full text-sm"
                  >
                    <span className="text-black">{q.question}</span>
                    <button
                      onClick={() => handleRemoveQuestion(q.id)}
                      className="text-brand-text-secondary hover:text-brand-accent"
                      aria-label="Remove question"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Navigation */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
            <h2 className="text-xl font-semibold text-brand-text-primary mb-4">
              Bottom Navigation
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(
                [
                  { key: "home", label: "Home" },
                  { key: "news", label: "News" },
                  { key: "help", label: "Help" },
                ] as Array<{ key: keyof BottomNavSettings; label: string }>
              ).map(({ key, label }) => {
                const enabled = state.bottomNav[key];
                return (
                  <button
                    key={key}
                    onClick={() => handleToggleBottomNav(key)}
                    className="p-4 rounded-xl border transition-all text-left flex items-center gap-3"
                    style={{
                      borderColor: enabled ? state.color : "#e5e7eb",
                      boxShadow: enabled
                        ? `0 0 0 3px ${state.color}22`
                        : "none",
                      backgroundColor: enabled ? `${state.color}10` : "#F8FAFC",
                    }}
                  >
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{
                        backgroundColor: enabled ? state.color : "#ECEFF7",
                        color: enabled ? "#fff" : "#64748B",
                      }}
                    >
                      {navIcon(key)}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-brand-text-primary">
                        {label}
                      </div>
                      <div className="text-xs text-brand-text-secondary">
                        {enabled ? "Shown in nav" : "Hidden from nav"}
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        enabled
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {enabled ? "On" : "Off"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
