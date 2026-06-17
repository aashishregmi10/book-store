"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type AuthUser } from "@/lib/stores/auth";
import { useAuthModal } from "@/lib/stores/authModal";
import { clientApi, ClientApiError } from "@/lib/client-api";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GIS_SRC = "https://accounts.google.com/gsi/client";

// Minimal typing for the Google Identity Services global.
interface GoogleIdApi {
  accounts: {
    id: {
      initialize: (cfg: { client_id: string; callback: (r: { credential?: string }) => void }) => void;
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

  const handleCredential = useCallback(
    async (response: { credential?: string }) => {
      if (!response.credential) return;
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
        onError?.(err instanceof ClientApiError ? err.message : "Google sign-in failed — try again.");
      }
    },
    [setAuth, router, onError]
  );

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    const init = () => {
      if (cancelled || !window.google || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: handleCredential });
      ref.current.innerHTML = "";
      window.google.accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: 300,
        logo_alignment: "center",
      });
    };

    if (window.google) {
      init();
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", init);
    return () => {
      cancelled = true;
      script?.removeEventListener("load", init);
    };
  }, [handleCredential]);

  if (!CLIENT_ID) return null;
  return <div ref={ref} className="flex justify-center" />;
}
