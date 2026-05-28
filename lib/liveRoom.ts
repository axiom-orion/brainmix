/**
 * Minimal WebRTC listening room: one host broadcasts audio, N listeners
 * tune in. Topology = mesh (one peer connection per listener) so we can
 * skip a media server. Signaling rides Supabase Realtime "broadcast" events.
 *
 * Limits: mesh doesn't scale past ~5 listeners on a typical home connection.
 * For a real product you'd swap this for LiveKit / Daily / an SFU. Good
 * enough for personal sharing — "tune in to my DJ set, friends."
 *
 * Public STUN servers only — no TURN. If a listener is behind symmetric NAT
 * or a strict firewall, the connection won't establish. That's acceptable
 * for an MVP; document it in the UI.
 */

import * as Sentry from "@sentry/nextjs";
import { getSupabaseClient } from "./supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/** Tag every WebRTC breadcrumb so Sentry can filter the listening-room domain. */
function trace(message: string, data?: Record<string, unknown>) {
  Sentry.addBreadcrumb({
    category: "live-room",
    message,
    level: "info",
    data,
  });
}

function captureFault(message: string, err?: unknown, extra?: Record<string, unknown>) {
  // Use captureException when we have an Error, captureMessage otherwise.
  if (err instanceof Error) {
    Sentry.captureException(err, { extra: { domain: "live-room", message, ...extra } });
  } else {
    Sentry.captureMessage(message, { level: "warning", extra: { domain: "live-room", ...extra } });
  }
}

/**
 * ICE servers configuration. Three tiers, in order of preference:
 *
 *   1. STUN — always. Free, public. Resolves your own IP for ICE candidates.
 *      Sufficient for ~80% of peer connections (non-symmetric-NAT networks).
 *
 *   2. Custom TURN — set NEXT_PUBLIC_TURN_URL / _USERNAME / _CREDENTIAL via
 *      Vercel env vars. Use Cloudflare Calls (free up to 1000 GB/month) or
 *      Twilio TURN (~$0.40/GB) for production. Required for ~20% of users
 *      behind symmetric NAT / strict corporate firewalls.
 *
 *   3. Open-relay fallback — metered.ca's free public TURN. Throttled but
 *      keeps the demo working without any setup. Enabled by default.
 *
 * Cloudflare TURN setup (recommended):
 *   1. https://dash.cloudflare.com/?to=/:account/calls → New TURN app
 *   2. Generate credentials → copy URL + username + credential
 *   3. vercel env add NEXT_PUBLIC_TURN_URL production       (paste turn:...)
 *   4. vercel env add NEXT_PUBLIC_TURN_USERNAME production
 *   5. vercel env add NEXT_PUBLIC_TURN_CREDENTIAL production
 *   6. Redeploy.
 */
function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  } else {
    // Open-relay free public TURN — rate-limited but lets the demo work
    // without per-user setup. Replace with your own service for production.
    servers.push(
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    );
  }
  return servers;
}

type SignalingMessage =
  | { kind: "listener-joined"; from: string }
  | { kind: "offer"; from: string; to: string; sdp: string }
  | { kind: "answer"; from: string; to: string; sdp: string }
  | {
      kind: "ice";
      from: string;
      to: string;
      candidate: RTCIceCandidateInit;
    };

function makeId(): string {
  return crypto.randomUUID();
}

// ─────────────────────────────────────────────────────────────────────────────
// Host
// ─────────────────────────────────────────────────────────────────────────────

export interface HostHandle {
  token: string;
  listeners: number;
  stop(): Promise<void>;
  onListenersChange(cb: (n: number) => void): void;
}

export async function startHost(stream: MediaStream): Promise<HostHandle> {
  const token = makeId().slice(0, 8);
  const hostId = makeId();
  trace("host:start", { token, tracks: stream.getTracks().length });
  const sb = getSupabaseClient();
  const channel = sb.channel(`live-${token}`, {
    config: { broadcast: { self: false } },
  });

  // One peer connection per listener, keyed by listener id.
  const peers = new Map<string, RTCPeerConnection>();
  let listenersChanged: ((n: number) => void) | null = null;
  const notify = () => listenersChanged?.(peers.size);

  const send = (msg: SignalingMessage) =>
    channel.send({ type: "broadcast", event: "signal", payload: msg });

  const newPeer = (listenerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        send({
          kind: "ice",
          from: hostId,
          to: listenerId,
          candidate: e.candidate.toJSON(),
        });
      }
    };
    pc.onconnectionstatechange = () => {
      trace("host:peer-state", { listenerId, state: pc.connectionState });
      if (pc.connectionState === "failed") {
        captureFault("host: peer connection failed", undefined, { listenerId });
      }
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        peers.delete(listenerId);
        try { pc.close(); } catch {}
        notify();
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        captureFault("host: ICE failed", undefined, { listenerId });
      }
    };
    peers.set(listenerId, pc);
    notify();
    return pc;
  };

  channel.on(
    "broadcast",
    { event: "signal" },
    async ({ payload }: { payload: SignalingMessage }) => {
      try {
        if (payload.kind === "listener-joined") {
          trace("host:listener-joined", { listenerId: payload.from });
          const pc = newPeer(payload.from);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send({
            kind: "offer",
            from: hostId,
            to: payload.from,
            sdp: offer.sdp ?? "",
          });
        } else if (payload.kind === "answer" && payload.to === hostId) {
          const pc = peers.get(payload.from);
          if (pc && pc.signalingState !== "stable") {
            await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
          }
        } else if (payload.kind === "ice" && payload.to === hostId) {
          const pc = peers.get(payload.from);
          if (pc) {
            try {
              await pc.addIceCandidate(payload.candidate);
            } catch {
              /* ignore stale candidates */
            }
          }
        }
      } catch (err) {
        captureFault("host: signaling handler threw", err, { kind: payload.kind });
      }
    },
  );

  await new Promise<void>((resolve) => {
    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });

  const stop = async () => {
    for (const pc of peers.values()) {
      try { pc.close(); } catch {}
    }
    peers.clear();
    await channel.unsubscribe();
    notify();
  };

  return {
    token,
    get listeners() { return peers.size; },
    stop,
    onListenersChange(cb) { listenersChanged = cb; },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Listener
// ─────────────────────────────────────────────────────────────────────────────

export interface ListenerHandle {
  /** The remote audio stream — attach to an <audio>.srcObject. */
  audio: MediaStream | null;
  connectionState: RTCPeerConnectionState | "joining";
  stop(): Promise<void>;
}

export function joinListener(
  token: string,
  onState: (state: ListenerHandle) => void,
): { stop: () => Promise<void> } {
  const listenerId = makeId();
  const sb = getSupabaseClient();
  const channel: RealtimeChannel = sb.channel(`live-${token}`, {
    config: { broadcast: { self: false } },
  });

  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  let hostId: string | null = null;
  let audioStream: MediaStream | null = null;
  let connectionState: RTCPeerConnectionState | "joining" = "joining";

  const emit = () => onState({ audio: audioStream, connectionState, stop });

  pc.ontrack = (e) => {
    audioStream = e.streams[0] ?? new MediaStream(e.track ? [e.track] : []);
    trace("listener:ontrack", { tracks: audioStream.getTracks().length });
    emit();
  };
  pc.onconnectionstatechange = () => {
    connectionState = pc.connectionState;
    trace("listener:state", { state: pc.connectionState });
    if (pc.connectionState === "failed") {
      captureFault("listener: peer connection failed");
    }
    emit();
  };
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "failed") {
      captureFault("listener: ICE failed");
    }
  };

  const send = (msg: SignalingMessage) =>
    channel.send({ type: "broadcast", event: "signal", payload: msg });

  pc.onicecandidate = (e) => {
    if (e.candidate && hostId) {
      send({
        kind: "ice",
        from: listenerId,
        to: hostId,
        candidate: e.candidate.toJSON(),
      });
    }
  };

  channel.on(
    "broadcast",
    { event: "signal" },
    async ({ payload }: { payload: SignalingMessage }) => {
      try {
        if (payload.kind === "offer" && payload.to === listenerId) {
          hostId = payload.from;
          trace("listener:offer-received");
          await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({
            kind: "answer",
            from: listenerId,
            to: payload.from,
            sdp: answer.sdp ?? "",
          });
        } else if (payload.kind === "ice" && payload.to === listenerId) {
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch { /* ignore */ }
        }
      } catch (err) {
        captureFault("listener: signaling handler threw", err, { kind: payload.kind });
      }
    },
  );

  const stop = async () => {
    try { pc.close(); } catch {}
    await channel.unsubscribe();
  };

  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      // Announce ourselves so the host sends an offer.
      send({ kind: "listener-joined", from: listenerId });
    }
  });

  emit();
  return { stop };
}
