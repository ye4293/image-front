"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminSettings } from "@/lib/admin-types";
import { SECRET_KEYS, SETTING_KEYS } from "@/lib/admin-types";

// TYPE NAMES for translation keys (label + help per field)
const FIELD_LABEL_KEYS = {
  ezlinkaiBaseUrl: "ezlinkaiBaseUrlLabel",
  fluxApiKey: "fluxApiKeyLabel",
  r2Endpoint: "r2EndpointLabel",
  r2AccessKeyId: "r2AccessKeyIdLabel",
  r2SecretAccessKey: "r2SecretAccessKeyLabel",
  r2Bucket: "r2BucketLabel",
  r2PublicBaseUrl: "r2PublicBaseUrlLabel",
  appBaseUrl: "appBaseUrlLabel",
} as const satisfies Record<(typeof SETTING_KEYS)[number], string>;

const FIELD_HELP_KEYS = {
  ezlinkaiBaseUrl: "ezlinkaiBaseUrlHelp",
  fluxApiKey: "fluxApiKeyHelp",
  r2Endpoint: "r2EndpointHelp",
  r2AccessKeyId: "r2AccessKeyIdHelp",
  r2SecretAccessKey: "r2SecretAccessKeyHelp",
  r2Bucket: "r2BucketHelp",
  r2PublicBaseUrl: "r2PublicBaseUrlHelp",
  appBaseUrl: "appBaseUrlHelp",
} as const satisfies Record<(typeof SETTING_KEYS)[number], string>;

type SaveStatus = "idle" | "saving" | "saved" | "error";

type ClearState =
  | { key: null }
  | { key: string; stage: "confirm" };

export function SettingsForm({ settings }: { settings: AdminSettings }) {
  const t = useTranslations("AdminSettings");

  // Plain fields: controlled inputs initialised with the current value.
  // Secret fields: controlled inputs initialised empty — the real value is
  // never sent to the browser, only a mask. See the "empty secret" trap below.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const key of SETTING_KEYS) {
      const field = settings.fields[key];
      if (field?.kind === "plain") {
        init[key] = field.value;
      } else {
        // Secret fields always start empty so the user sees the placeholder
        // ("leave blank to keep unchanged") rather than masked dots that could
        // mislead them into thinking they're editing the real value.
        init[key] = "";
      }
    }
    return init;
  });

  // Track which fields the server returned as "plain" so we know the originals.
  // Used to skip fields that haven't changed (no-op saves).
  const [origPlain] = useState<Record<string, string>>(() => {
    const orig: Record<string, string> = {};
    for (const key of SETTING_KEYS) {
      const field = settings.fields[key];
      if (field?.kind === "plain") orig[key] = field.value;
    }
    return orig;
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  // Backend message on save failure — shown verbatim because the audience is
  // an admin and backend validation messages like "那是 S3 API 域名，不允许匿名读"
  // are exactly what they need. Other pages in this repo deliberately do NOT
  // show raw backend error messages; this page is the intentional exception.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [clearState, setClearState] = useState<ClearState>({ key: null });

  // Live settings after successful saves (so configured/masked stays fresh)
  const [liveSettings, setLiveSettings] = useState(settings);

  function handleChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (saveStatus === "saved" || saveStatus === "error") {
      setSaveStatus("idle");
      setErrorMessage(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveStatus("saving");
    setErrorMessage(null);

    const updates: Record<string, string> = {};

    for (const key of SETTING_KEYS) {
      const isSecret = (SECRET_KEYS as readonly string[]).includes(key);

      if (isSecret) {
        // ⚠️  CRITICAL: Do NOT include a secret key when its input is empty.
        //
        // The backend treats an empty string for a secret as "clear this secret",
        // not "leave it unchanged". If the form naively included all fields, every
        // save would silently wipe all three secrets — because the browser never
        // receives the real value, only a mask, so the input starts empty.
        //
        // An operator changes a bucket name, hits save, and the upstream API key
        // plus both R2 credentials are gone. Image transfer stops silently while
        // the page still looks fine. Only include a secret when the user actually
        // typed something. Clearing a secret is a separate explicit action (the
        // "Clear" button below), never expressed by leaving the field blank.
        if (values[key]) {
          updates[key] = values[key];
        }
      } else {
        // Plain fields: only include if changed to avoid unnecessary churn.
        if (values[key] !== origPlain[key]) {
          updates[key] = values[key];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      setSaveStatus("saved");
      return;
    }

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : t("saveFailed");
        setErrorMessage(msg);
        setSaveStatus("error");
        return;
      }
      // Refresh live settings from the response so masking / configured state
      // reflects what the server accepted.
      if (
        typeof data === "object" &&
        data !== null &&
        "fields" in data &&
        "storageEnabled" in data
      ) {
        setLiveSettings(data as AdminSettings);
      }
      // Clear secret inputs after a successful save — they served their purpose
      // and leaving a freshly-saved key visible in the input is a security risk.
      setValues((prev) => {
        const next = { ...prev };
        for (const key of SECRET_KEYS) {
          if (key in updates) next[key] = "";
        }
        return next;
      });
      setSaveStatus("saved");
    } catch {
      setErrorMessage(t("saveFailed"));
      setSaveStatus("error");
    }
  }

  // ---- Clear secret flow ----

  function requestClear(key: string) {
    setClearState({ key, stage: "confirm" });
  }

  function cancelClear() {
    setClearState({ key: null });
  }

  async function confirmClear() {
    if (clearState.key === null) return;
    const key = clearState.key;
    setClearState({ key: null });
    setSaveStatus("saving");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        // Explicitly send empty string to signal "clear this secret".
        // This is the ONLY code path where an empty secret string goes in
        // the request body — triggered by a user clicking "Clear" then
        // confirming, never by a blank input on normal save.
        body: JSON.stringify({ [key]: "" }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : t("saveFailed");
        setErrorMessage(msg);
        setSaveStatus("error");
        return;
      }
      if (
        typeof data === "object" &&
        data !== null &&
        "fields" in data &&
        "storageEnabled" in data
      ) {
        setLiveSettings(data as AdminSettings);
      }
      setSaveStatus("saved");
    } catch {
      setErrorMessage(t("saveFailed"));
      setSaveStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Storage status banner */}
      <p className="text-sm text-muted-foreground">
        {liveSettings.storageEnabled ? t("storageOn") : t("storageOff")}
      </p>

      {/* Stripe note — admin may look for Stripe keys here and not find them */}
      <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        {t("stripeNote")}
      </p>

      {SETTING_KEYS.map((key) => {
        const field = liveSettings.fields[key];
        const isSecret = (SECRET_KEYS as readonly string[]).includes(key);

        return (
          <div key={key} className="space-y-1">
            <Label htmlFor={`field-${key}`}>{t(FIELD_LABEL_KEYS[key])}</Label>
            <p className="text-xs text-muted-foreground">{t(FIELD_HELP_KEYS[key])}</p>

            {isSecret && field?.kind === "secret" && (
              // testid lets e2e assert the configured state of **one specific**
              // secret. A global count of "Configured" badges can't tell which
              // secret survived a save, and the empty-secret-wipe bug clears
              // them one key at a time.
              <p className="text-xs" data-testid={`secret-status-${key}`}>
                {field.configured ? (
                  <>
                    <span className="font-medium text-success">{t("configured")}</span>
                    {field.masked ? (
                      <span className="ml-1 font-mono text-muted-foreground">{field.masked}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-muted-foreground">{t("notConfigured")}</span>
                )}
              </p>
            )}

            <div className="flex gap-2">
              <Input
                id={`field-${key}`}
                type={isSecret ? "password" : "text"}
                value={values[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={isSecret ? t("secretPlaceholder") : undefined}
                autoComplete={isSecret ? "new-password" : "off"}
                className="flex-1"
              />
              {isSecret && field?.kind === "secret" && field.configured && (
                <>
                  {clearState.key === key && clearState.stage === "confirm" ? (
                    <>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={confirmClear}
                        className="shrink-0"
                      >
                        {t("clearConfirm")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={cancelClear}
                        className="shrink-0"
                      >
                        ✕
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => requestClear(key)}
                      className="shrink-0"
                    >
                      {t("clearSecret")}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? t("saving") : t("save")}
        </Button>
        {saveStatus === "saved" && (
          <span className="text-sm text-success">{t("saved")}</span>
        )}
        {saveStatus === "error" && errorMessage && (
          // Backend message shown verbatim — this page is the intentional
          // exception to the pattern of hiding backend error messages from users.
          // The audience is an admin and backend validation messages are
          // exactly what they need to diagnose misconfiguration.
          <span className="text-sm text-destructive">{errorMessage}</span>
        )}
      </div>
    </form>
  );
}
