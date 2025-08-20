"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FaExclamationTriangle, FaPowerOff } from "react-icons/fa";

type WebsiteSettingsState = {
  id: string;
  name?: string;
  url?: string;
  plan?: string;
  active: boolean;
  showVoiceAI: boolean;
  showTextAI: boolean;
  // Auto features
  allowAutoCancel: boolean;
  allowAutoReturn: boolean;
  allowAutoExchange: boolean;
  allowAutoClick: boolean;
  allowAutoScroll: boolean;
  allowAutoHighlight: boolean;
  allowAutoRedirect: boolean;
  allowAutoGetUserOrders: boolean;
  allowAutoUpdateUserInfo: boolean;
  allowAutoFillForm: boolean;
  allowAutoTrackOrder: boolean;
  allowAutoLogout: boolean;
  allowAutoLogin: boolean;
  allowAutoGenerateImage: boolean;
  // Text custom instructions
  customInstructions: string | null;
};

export default function WebsiteUISettingsPage() {
  const searchParams = useSearchParams();
  const websiteId = searchParams.get("id");

  const [isSavingUI, setIsSavingUI] = useState(false);
  const [isSavingFeatures, setIsSavingFeatures] = useState(false);
  const [state, setState] = useState<WebsiteSettingsState | null>(null);

  const allEnabled = useMemo(() => {
    return Boolean(state?.showVoiceAI) && Boolean(state?.showTextAI);
  }, [state?.showVoiceAI, state?.showTextAI]);

  useEffect(() => {
    if (!websiteId) return;
    (async () => {
      try {
        console.log("doing settings-get", { websiteId });
        const res = await fetch(`/api/updateInterface/get?id=${websiteId}`, {
          method: "GET",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        const w = data.website || {};
        const next: WebsiteSettingsState = {
          id: websiteId,
          name: "Website",
          url: "",
          plan: "",
          active: Boolean(w.active),
          showVoiceAI: Boolean(w.showVoiceAI),
          showTextAI: Boolean(w.showTextAI),
          allowAutoCancel: Boolean(w.allowAutoCancel),
          allowAutoReturn: Boolean(w.allowAutoReturn),
          allowAutoExchange: Boolean(w.allowAutoExchange),
          allowAutoClick: Boolean(w.allowAutoClick),
          allowAutoScroll: Boolean(w.allowAutoScroll),
          allowAutoHighlight: Boolean(w.allowAutoHighlight),
          allowAutoRedirect: Boolean(w.allowAutoRedirect),
          allowAutoGetUserOrders: Boolean(w.allowAutoGetUserOrders),
          allowAutoUpdateUserInfo: Boolean(w.allowAutoUpdateUserInfo),
          allowAutoFillForm: Boolean(w.allowAutoFillForm),
          allowAutoTrackOrder: Boolean(w.allowAutoTrackOrder),
          allowAutoLogout: Boolean(w.allowAutoLogout),
          allowAutoLogin: Boolean(w.allowAutoLogin),
          allowAutoGenerateImage: Boolean(w.allowAutoGenerateImage),
          customInstructions: w.customInstructions ?? "",
        };
        setState(next);
        console.log("done settings-get", { websiteId });
      } catch {}
    })();
  }, [websiteId]);

  const saveEdit = async (payload: Partial<WebsiteSettingsState>) => {
    if (!websiteId) return;
    console.log("doing settings-edit", { websiteId });
    await fetch(`/api/updateInterface/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ websiteId, ...payload }),
    });
    console.log("done settings-edit", { websiteId });
  };

  const saveUISettings = async (
    updates: Partial<
      Pick<
        WebsiteSettingsState,
        "showVoiceAI" | "showTextAI" | "customInstructions"
      >
    >
  ) => {
    if (!state || !websiteId) return;
    setIsSavingUI(true);
    try {
      const next: WebsiteSettingsState = {
        ...state,
        showVoiceAI:
          updates.showVoiceAI !== undefined
            ? updates.showVoiceAI
            : state.showVoiceAI,
        showTextAI:
          updates.showTextAI !== undefined
            ? updates.showTextAI
            : state.showTextAI,
        customInstructions:
          updates.customInstructions !== undefined
            ? updates.customInstructions
            : state.customInstructions,
      };
      console.log("doing ui-toggle", { websiteId });
      setState(next);
      await saveEdit({
        showVoiceAI: next.showVoiceAI,
        showTextAI: next.showTextAI,
        customInstructions: next.customInstructions || "",
      });
      console.log("done ui-toggle", { websiteId });
    } finally {
      setIsSavingUI(false);
    }
  };

  const saveAutoFeatures = async (nextState: WebsiteSettingsState) => {
    if (!websiteId) return;
    setIsSavingFeatures(true);
    try {
      console.log("doing feature-toggle", { websiteId });
      setState(nextState);
      await saveEdit(nextState);
      console.log("done feature-toggle", { websiteId });
    } finally {
      setIsSavingFeatures(false);
    }
  };

  const handleToggleAll = async () => {
    if (!state) return;
    const target = !allEnabled;
    // Optimistic UI
    setState({ ...state, showVoiceAI: target, showTextAI: target });
    await saveUISettings({ showVoiceAI: target, showTextAI: target });
  };

  const handleToggleActive = async () => {
    if (!state) return;
    const nextActive = !state.active;
    setState({ ...state, active: nextActive });
    await saveEdit({ active: nextActive });
  };

  const handleToggleVoice = async () => {
    if (!state) return;
    const target = !state.showVoiceAI;
    setState({ ...state, showVoiceAI: target });
    await saveUISettings({ showVoiceAI: target });
  };

  const handleToggleText = async () => {
    if (!state) return;
    const target = !state.showTextAI;
    setState({ ...state, showTextAI: target });
    await saveUISettings({ showTextAI: target });
  };

  const handleFeatureToggle = async (
    key: keyof WebsiteSettingsState,
    disabled?: boolean
  ) => {
    if (!state || disabled) return;
    const next: WebsiteSettingsState = {
      ...state,
      [key]: !state[key],
    } as WebsiteSettingsState;
    // Optimistic UI
    setState(next);
    await saveAutoFeatures(next);
  };

  const [instructionsDraft, setInstructionsDraft] = useState<string>("");
  const instructionsCount = instructionsDraft.trim().length;
  const instructionsChanged = useMemo(() => {
    return (state?.customInstructions ?? "") !== instructionsDraft;
  }, [state?.customInstructions, instructionsDraft]);

  useEffect(() => {
    if (state) setInstructionsDraft(state.customInstructions ?? "");
  }, [state?.id]);

  const handleSaveInstructions = async () => {
    if (!state) return;
    const trimmed = instructionsDraft.trim().slice(0, 300);
    // Optimistic UI
    setState({ ...state, customInstructions: trimmed });
    await saveUISettings({ customInstructions: trimmed });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-text-primary">
            Assistant UI Settings
          </h1>
          {state?.url && (
            <p className="text-brand-text-secondary">{state.url}</p>
          )}
        </div>
      </div>

      {/* Loading skeletons */}
      {!state && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6 animate-pulse">
            <div className="h-6 w-48 bg-gray-200 rounded mb-4" />
            <div className="h-10 w-full bg-gray-100 rounded" />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6 animate-pulse">
            <div className="h-6 w-36 bg-gray-200 rounded mb-4" />
            <div className="h-10 w-full bg-gray-100 rounded mb-3" />
            <div className="h-10 w-full bg-gray-100 rounded" />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6 animate-pulse">
            <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
            <div className="grid grid-cols-1 gap-3">
              <div className="h-8 w-full bg-gray-100 rounded" />
              <div className="h-8 w-full bg-gray-100 rounded" />
              <div className="h-8 w-full bg-gray-100 rounded" />
            </div>
          </div>
        </div>
      )}

      {state && (
        <>
          {/* Website Status */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-brand-text-primary">
                  Website Status
                </h2>
                <p className="text-sm text-brand-text-secondary">
                  Turn your assistant on or off
                </p>
              </div>
              <button
                onClick={handleToggleActive}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
                  state.active
                    ? "bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20"
                    : "bg-brand-lavender-dark text-white hover:bg-brand-lavender-dark/90"
                }`}
              >
                <FaPowerOff className="w-4 h-4" />
                {state.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>

          {/* Top UI Toggles */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
            <h2 className="text-xl font-semibold text-brand-text-primary mb-4">
              AI UI
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-brand-lavender-light/5 rounded-lg">
                <div>
                  <h3 className="font-medium text-brand-text-primary">
                    Activate All
                  </h3>
                  <p className="text-sm text-brand-text-secondary">
                    Toggle both Voice and Text AI
                  </p>
                </div>
                <button
                  onClick={handleToggleAll}
                  disabled={isSavingUI}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    allEnabled
                      ? "bg-brand-accent text-white hover:bg-brand-accent/90"
                      : "bg-brand-lavender-light/20 text-brand-text-primary hover:bg-brand-lavender-light/30"
                  } disabled:opacity-50`}
                >
                  {isSavingUI ? (
                    <FaPowerOff className="inline-block mr-2 animate-spin" />
                  ) : (
                    <FaPowerOff className="inline-block mr-2" />
                  )}
                  {allEnabled ? "Live" : "Off"}
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-brand-lavender-light/5 rounded-lg">
                <div>
                  <h3 className="font-medium text-brand-text-primary">
                    Voice AI
                  </h3>
                  <p className="text-sm text-brand-text-secondary">
                    Enable voice-based assistant UI
                  </p>
                </div>
                <button
                  onClick={handleToggleVoice}
                  disabled={isSavingUI}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    state.showVoiceAI
                      ? "bg-brand-accent text-white hover:bg-brand-accent/90"
                      : "bg-brand-lavender-light/20 text-brand-text-primary hover:bg-brand-lavender-light/30"
                  } disabled:opacity-50`}
                >
                  {isSavingUI ? (
                    <FaPowerOff className="inline-block mr-2 animate-spin" />
                  ) : (
                    <FaPowerOff className="inline-block mr-2" />
                  )}
                  {state.showVoiceAI ? "Live" : "Off"}
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-brand-lavender-light/5 rounded-lg">
                <div>
                  <h3 className="font-medium text-brand-text-primary">
                    Text AI
                  </h3>
                  <p className="text-sm text-brand-text-secondary">
                    Enable text chat assistant UI
                  </p>
                </div>
                <button
                  onClick={handleToggleText}
                  disabled={isSavingUI}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    state.showTextAI
                      ? "bg-brand-accent text-white hover:bg-brand-accent/90"
                      : "bg-brand-lavender-light/20 text-brand-text-primary hover:bg-brand-lavender-light/30"
                  } disabled:opacity-50`}
                >
                  {isSavingUI ? (
                    <FaPowerOff className="inline-block mr-2 animate-spin" />
                  ) : (
                    <FaPowerOff className="inline-block mr-2" />
                  )}
                  {state.showTextAI ? "Live" : "Off"}
                </button>
              </div>
            </div>
          </div>

          {/* AI Auto Features */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-brand-text-primary">
                  AI Auto Features
                </h2>
                <p className="text-sm text-brand-text-secondary mt-1">
                  Control which automated actions your AI assistant can perform.
                  Disabling certain features may limit functionality.
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-brand-lavender-light/20 text-brand-text-secondary">
                Edit
              </span>
            </div>

            <div className="flex items-start gap-3 p-3 bg-amber-50 text-amber-800 rounded-lg border border-amber-200 mb-6">
              <FaExclamationTriangle className="mt-0.5" />
              <p className="text-sm text-black">
                Disabling these features will significantly reduce the
                effectiveness of your AI assistant.
              </p>
            </div>

            {/* Critical Features */}
            <div className="mb-6">
              <h3 className="font-medium text-brand-text-primary mb-3">
                Critical Features
              </h3>
              <div className="space-y-3">
                {(
                  [
                    {
                      key: "allowAutoRedirect",
                      label:
                        "Allow AI to automatically redirect users to relevant pages",
                    },
                    {
                      key: "allowAutoScroll",
                      label:
                        "Allow AI to scroll to relevant sections on the page",
                    },
                    {
                      key: "allowAutoHighlight",
                      label:
                        "Allow AI to highlight important elements on the page",
                    },
                    {
                      key: "allowAutoClick",
                      label:
                        "Allow AI to click buttons and links on behalf of users",
                    },
                    {
                      key: "allowAutoFillForm",
                      label: "Allow AI to automatically fill forms for users",
                    },
                  ] as Array<{ key: keyof WebsiteSettingsState; label: string }>
                ).map(({ key, label }) => (
                  <ToggleRow
                    key={key}
                    label={label}
                    enabled={Boolean((state as any)[key])}
                    onClick={() => handleFeatureToggle(key)}
                    disabled={isSavingFeatures}
                  />
                ))}
              </div>
            </div>

            {/* Order Features */}
            <div className="mb-6">
              <h3 className="font-medium text-brand-text-primary mb-3">
                Order Features
              </h3>
              <div className="space-y-3">
                <ToggleRow
                  label="Allow AI to help users cancel orders"
                  enabled={state.allowAutoCancel}
                  onClick={() => handleFeatureToggle("allowAutoCancel")}
                  disabled={isSavingFeatures}
                />
                <ToggleRow
                  label="Allow AI to help users return products (Coming Soon)"
                  enabled={state.allowAutoReturn}
                  onClick={() => handleFeatureToggle("allowAutoReturn", true)}
                  disabled
                />
                <ToggleRow
                  label="Allow AI to help users exchange products (Coming Soon)"
                  enabled={state.allowAutoExchange}
                  onClick={() => handleFeatureToggle("allowAutoExchange", true)}
                  disabled
                />
                <ToggleRow
                  label="Allow AI to help users track their orders"
                  enabled={state.allowAutoTrackOrder}
                  onClick={() => handleFeatureToggle("allowAutoTrackOrder")}
                  disabled={isSavingFeatures}
                />
                <ToggleRow
                  label="Allow AI to fetch and display user order history"
                  enabled={state.allowAutoGetUserOrders}
                  onClick={() => handleFeatureToggle("allowAutoGetUserOrders")}
                  disabled={isSavingFeatures}
                />
              </div>
            </div>

            {/* User Data Features */}
            <div className="mb-6">
              <h3 className="font-medium text-brand-text-primary mb-3">
                User Data Features
              </h3>
              <div className="space-y-3">
                <ToggleRow
                  label="Allow AI to help users update their account information"
                  enabled={state.allowAutoUpdateUserInfo}
                  onClick={() => handleFeatureToggle("allowAutoUpdateUserInfo")}
                  disabled={isSavingFeatures}
                />
                <ToggleRow
                  label="Allow AI to help users log out"
                  enabled={state.allowAutoLogout}
                  onClick={() => handleFeatureToggle("allowAutoLogout")}
                  disabled={isSavingFeatures}
                />
                <ToggleRow
                  label="Allow AI to help users log in"
                  enabled={state.allowAutoLogin}
                  onClick={() => handleFeatureToggle("allowAutoLogin")}
                  disabled={isSavingFeatures}
                />
              </div>
            </div>

            {/* Content Generation Features */}
            <div className="mb-2">
              <h3 className="font-medium text-brand-text-primary mb-3">
                Content Generation Features
              </h3>
              <div className="space-y-3">
                <ToggleRow
                  label="Allow AI to generate images for users (Coming Soon)"
                  enabled={state.allowAutoGenerateImage}
                  onClick={() =>
                    handleFeatureToggle("allowAutoGenerateImage", true)
                  }
                  disabled
                />
              </div>
            </div>
          </div>

          {/* Custom Instructions */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
            <h2 className="text-xl font-semibold text-brand-text-primary mb-2">
              Custom Instructions
            </h2>
            <p className="text-sm text-brand-text-secondary mb-4">
              Add guidance for your assistant. Max 300 characters.
            </p>
            <textarea
              value={instructionsDraft}
              onChange={(e) => {
                const v = e.target.value.slice(0, 300);
                setInstructionsDraft(v);
              }}
              className="w-full min-h-[120px] p-3 border border-brand-lavender-light/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/40 text-black"
              placeholder="Example: Always greet customers by name and ask how you can help with their order."
              maxLength={300}
            />
            <div className="mt-2 flex items-center justify-between text-sm">
              <span
                className={`${
                  instructionsCount > 300
                    ? "text-red-600"
                    : "text-brand-text-secondary"
                }`}
              >
                {instructionsCount}/300
              </span>
              <button
                onClick={handleSaveInstructions}
                disabled={!instructionsChanged || isSavingUI}
                className="px-4 py-2 rounded-lg bg-brand-accent text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  enabled,
  onClick,
  disabled,
}: {
  label: string;
  enabled: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-brand-lavender-light/5 rounded-lg">
      <div className="text-brand-text-primary text-sm">{label}</div>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`px-4 py-2 rounded-lg font-medium transition-all ${
          enabled
            ? "bg-brand-accent text-white hover:bg-brand-accent/90"
            : "bg-brand-lavender-light/20 text-brand-text-primary hover:bg-brand-lavender-light/30"
        } disabled:opacity-50`}
      >
        {enabled ? "Enabled" : "Disabled"}
      </button>
    </div>
  );
}
