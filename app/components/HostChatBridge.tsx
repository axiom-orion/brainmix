"use client";

/**
 * HostChatBridge — when the user has an active /live/host broadcast in any
 * tab, this component mounts the LiveChat overlay in OTHER tabs (main app,
 * /console) so the broadcaster can DJ + chat with listeners without tab-
 * juggling.
 *
 * Watches localStorage key `brainmix:live-host-token`. The /live/host page
 * sets it on broadcast start, clears on stop.
 */

import { useEffect, useState } from "react";
import { LiveChat } from "./LiveChat";

export function HostChatBridge() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        setToken(window.localStorage.getItem("brainmix:live-host-token"));
      } catch {
        setToken(null);
      }
    };
    read();
    // Storage event fires for cross-tab changes.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "brainmix:live-host-token") read();
    };
    // Custom event for same-tab updates (when /live/host is in the same tab).
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<string | null>).detail;
      setToken(detail ?? null);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("brainmix:host-token", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("brainmix:host-token", onCustom as EventListener);
    };
  }, []);

  if (!token) return null;
  return <LiveChat token={token} />;
}
