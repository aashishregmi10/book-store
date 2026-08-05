"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type AuthUser } from "@/lib/stores/auth";
import { useAuthModal } from "@/lib/stores/authModal";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { Spinner } from "@/components/ui/Spinner";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GIS_SRC = "https://accounts.google.com/gsi/client";

/** True when Google sign-in is configured (button will render something). */
export const isGoogleConfigured = Boolean(CLIENT_ID);

/**
 * How long to wait for GIS before telling the user it hasn't shown up.
 * Deliberately generous: most of our traffic is on mobile data, where the
 * script plus Google's button iframe can genuinely take several seconds, and
 * giving up on a button that was about to work is worse than waiting. Nothing
 * is torn down when this fires — a late arrival still renders (see `stalled`).
 */
const GIS_TIMEOUT_MS = 15000;

// Minimal typing for the Google Identity Services global.
interface GisError {
  type?: string;
  message?: string;
}
interface GoogleIdApi {
  accounts: {
    id: {
      initialize: (cfg: {
        client_id: string;
        callback: (r: { credential?: string }) => void;
        // Fires when GIS itself fails — the browser blocked the FedCM dialog,
        // the user dismissed it, or the origin isn't authorised. Without this
        // every one of those is silent and the button just looks inert.
        error_callback?: (err: GisError) => void;
        use_fedcm_for_prompt?: boolean;
      }) => void;
      renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
    };
  };
}
declare global {
  interface Window {
    google?: GoogleIdApi;
  }
}

/**
 * "Continue with Google" — renders the official Google Identity Services button,
 * exchanges the returned ID token at /auth/google, then signs the user in.
 * Renders nothing if NEXT_PUBLIC_GOOGLE_CLIENT_ID isn't configured.
 */
export function GoogleSignInButton({ onError }: { onError?: (msg: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  // GIS hasn't rendered within GIS_TIMEOUT_MS (or its script failed outright).
  // Only drops the pulsing placeholder — the container stays mounted so a slow
  // script that arrives late can still render its button into it.
  const [stalled, setStalled] = useState(false);

  const handleCredential = useCallback(
    async (response: { credential?: string }) => {
      if (!response.credential) return;
      // Google's popup closes the moment it hands back a credential, but the
      // token exchange with our API can take seconds on a cold serverless
      // start. Without this the modal just sits there looking broken and
      // people click Google again.
      setBusy(true);
      try {
        const data = await clientApi.post<{ user: AuthUser; accessToken: string }>("/auth/google", {
          credential: response.credential,
        });
        setAuth(data.user, data.accessToken);

        const { next: modalNext, close } = useAuthModal.getState();
        close();
        // Where to go after sign-in: an explicit `next` wins (modal store, then a
        // ?next= query param on the /login page). Otherwise, the dedicated auth
        // pages must navigate away (home), while an inline modal over a content
        // page just refreshes in place to reflect the new session.
        const urlNext = new URLSearchParams(window.location.search).get("next");
        const target = modalNext || urlNext;
        const onAuthPage = window.location.pathname === "/login" || window.location.pathname === "/register";
        if (target) router.push(target);
        else if (onAuthPage) router.push("/");
        else router.refresh();
      } catch (err) {
        // Only clear the pending state on failure — on success the modal is
        // already closing and a navigation is in flight, so dropping the
        // spinner would flash the button back for a frame.
        setBusy(false);
        onError?.(err instanceof ClientApiError ? err.message : "Google sign-in failed — try again.");
      }
    },
    [setAuth, router, onError]
  );

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    // If GIS never renders, say so. The usual cause is the current origin
    // missing from the OAuth client's "Authorized JavaScript origins" in
    // Google Cloud Console — Google logs that to the console and otherwise
    // does nothing, which reads to a visitor as a dead button.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setStalled(true);
      onError?.("Google sign-in is taking longer than usual — you can sign in with your email and password below.");
    }, GIS_TIMEOUT_MS);

    const stopWaiting = () => {
      window.clearTimeout(timer);
    };

    const init = () => {
      if (cancelled || !window.google || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredential,
        error_callback: (err) => {
          // Dismissing the Google dialog is a normal thing to do, not an error
          // worth shouting about; anything else means sign-in is genuinely
          // unavailable and the user needs to be told to use email instead.
          if (err?.type === "popup_closed" || err?.type === "user_cancel") return;
          console.error("[google-signin] GIS error", err);
          onError?.("Google sign-in isn't available right now — use your email and password below.");
        },
      });
      ref.current.innerHTML = "";
      window.google.accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: 300,
        logo_alignment: "center",
      });
      stopWaiting();
      setStalled(false); // a late arrival still counts — drop any "taking long" state
      setReady(true);
    };

    if (window.google) {
      init();
      return () => {
        cancelled = true;
        stopWaiting();
      };
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    // A blocked script (ad blocker, offline, restricted network) fires `error`
    // and never `load`, so the button would sit as a skeleton forever.
    const onScriptError = () => {
      if (cancelled) return;
      stopWaiting();
      setStalled(true);
      onError?.("Couldn't reach Google. Use your email and password below.");
    };
    script.addEventListener("load", init);
    script.addEventListener("error", onScriptError);
    return () => {
      cancelled = true;
      stopWaiting();
      script?.removeEventListener("load", init);
      script?.removeEventListener("error", onScriptError);
    };
  }, [handleCredential, onError]);

  if (!CLIENT_ID) return null;
  // Reserve the button's height so the modal doesn't jump when GIS finishes
  // loading; show a quiet skeleton in the meantime. Once stalled, the skeleton
  // goes but the row collapses to nothing — a placeholder that pulses forever
  // is what made this look broken rather than merely unavailable.
  return (
    <div className={`relative flex items-center justify-center ${stalled && !ready ? "" : "min-h-[44px]"}`}>
      {!ready && !busy && !stalled && (
        <div
          aria-hidden
          className="absolute inset-0 animate-pulse rounded-md border border-border bg-bg"
        />
      )}
      {/* Cover the Google button while the exchange runs: it keeps the row's
          height, blocks a second click, and says what's actually happening. */}
      {busy && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-md border border-border bg-bg font-body text-sm text-muted"
        >
          <Spinner className="size-4 text-accent" />
          Signing you in…
        </div>
      )}
      <div ref={ref} className={`flex justify-center ${busy ? "pointer-events-none opacity-0" : ""}`} />
    </div>
  );
}
