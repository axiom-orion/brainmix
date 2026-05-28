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

import { getSupabaseClient } from "./supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * ICE servers — STUN always, plus TURN if NEXT_PUBLIC_TURN_URL is set. Without
 * TURN, listeners behind symmetric NAT / strict firewalls won't connect.
 * Configure all three for TURN auth: NEXT_PUBLIC_TURN_URL,
 * NEXT_PUBLIC_TURN_USERNAME, NEXT_PUBLIC_TURN_CREDENTIAL.
 */
function iceServers(): RTCIceServer[] {
  const stun: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    stun.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return stun;
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
    peers.set(listenerId, pc);
    notify();
    return pc;
  };

  channel.on(
    "broadcast",
    { event: "signal" },
    async ({ payload }: { payload: SignalingMessage }) => {
      if (payload.kind === "listener-joined") {
        // New listener — make an offer to them.
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
    emit();
  };
  pc.onconnectionstatechange = () => {
    connectionState = pc.connectionState;
    emit();
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
      if (payload.kind === "offer" && payload.to === listenerId) {
        hostId = payload.from;
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
