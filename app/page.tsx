"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  start as startEngine,
  stop as stopEngine,
  setMasterGain,
  playBell,
  type EngineConfig,
  type EntrainmentMode,
  type LFOShape,
  type NoiseColor,
} from "@/lib/audioEngine";
import { djBus, downloadBlob } from "@/lib/djBus";
import { detectBPM } from "@/lib/bpmDetect";
import {
  listTracks,
  saveTrack,
  deleteTrack,
  trackToFile,
  formatSize,
  type LibraryTrack,
} from "@/lib/trackLibrary";
import {
  listCloudTracks,
  uploadTrack,
  deleteCloudTrack,
  downloadTrack,
  listCloudMixes,
  uploadMix,
  deleteCloudMix,
  publicMixUrl,
  shareUrl as buildShareUrl,
  listPlaylists,
  createPlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  getPlaylistTracks,
  updateTrackMetadata,
  type CloudTrack,
  type CloudMix,
  type Playlist,
} from "@/lib/cloudLibrary";
import { useAuth } from "./auth-provider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SignInModal } from "./components/SignInModal";
import { MusicHub } from "./components/MusicHub";
import { StickyNowPlaying } from "./components/NowPlayingWidget";
import { LibraryModal } from "./components/LibraryModal";
import { PlaylistsModal, PickPlaylistModal } from "./components/PlaylistsModal";
import { MyMixesModal } from "./components/MyMixesModal";
import { EngineerCard } from "./components/EngineerCard";
import { MixerSection } from "./components/MixerSection";
import {
  InfoButton,
  EvidenceBadge,
  Slider,
  Toggle,
  SelectBox,
  SessionDisplay,
} from "./components/primitives";
import { DeepDiveModal, AcademyModal } from "./components/AcademyModal";
import { parseMetadata, guessFromFilename } from "@/lib/idTags";
import { walkEntriesForAudio } from "@/lib/dropFolders";
import {
  setMediaMetadata,
  bindMediaActions,
  setMediaPosition,
  setPlaybackState,
} from "@/lib/mediaSession";
import { signCoverUrl } from "@/lib/cloudLibrary";
import {
  PRESET_LIST,
  PRESETS,
  type PresetId,
  type Preset,
} from "@/lib/presets";
import { POMODORO_PRESETS } from "@/lib/pomodoro";
import { ACADEMY, type AcademyEntry } from "@/lib/academy";
import { exportWav, downloadWav, type ExportPayload } from "@/lib/wavExport";
import {
  type SongSlot,
  type SlotId,
  defaultSlot,
} from "@/lib/songSlots";
import {
  analyzeState,
  DEEP_DIVES,
  type EngineerState,
  type EngineerTip,
  type ApplyResult,
  type DeepDive,
} from "@/lib/engineer";

type Tab = "basic" | "moderate" | "advanced" | "timer";
type AppView = "music" | "studio" | "timer";

interface AppState {
  presetId: PresetId | null;
  beatHz: number;
  carrierHz: number;
  droneHz: number;
  bpmSync: number;
  noise: NoiseColor;
  noiseGain: number;
  droneGain: number;
  entrainmentGain: number;
  gammaBoost: boolean;
  lfoShape: LFOShape;
  breathPacer: boolean;
  emdrPan: boolean;
  mode: EntrainmentMode;
  volume: number;
  layerDrone: boolean;
  layerNoise: boolean;
}

function presetToState(p: Preset): AppState {
  return {
    presetId: p.id,
    beatHz: p.params.beatHz,
    carrierHz: p.params.carrierHz,
    droneHz: p.params.droneHz,
    bpmSync: p.params.bpmSync,
    noise: p.params.noise,
    noiseGain: p.params.noiseGain,
    droneGain: p.params.droneGain,
    entrainmentGain: p.params.entrainmentGain,
    gammaBoost: p.params.gammaBoost,
    lfoShape: p.params.lfoShape,
    breathPacer: p.id === "theta",
    emdrPan: p.id === "archaic",
    mode: "binaural",
    volume: p.defaultVolume,
    layerDrone: true,
    layerNoise: true,
  };
}

function stateToEngineConfig(s: AppState, tempoScale = 1): EngineConfig {
  return {
    carrierHz: s.carrierHz,
    beatHz: s.beatHz,
    droneHz: s.droneHz,
    noise: s.layerNoise ? s.noise : "off",
    noiseGain: s.noiseGain,
    droneGain: s.layerDrone ? s.droneGain : 0,
    entrainmentGain: s.entrainmentGain,
    gammaBoost: s.gammaBoost,
    lfoShape: s.lfoShape,
    bpmSync: s.bpmSync * tempoScale,
    mode: s.mode,
    masterGain: s.volume,
    breathPacer: s.breathPacer,
    emdrPan: s.emdrPan,
  };
}

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function hzBand(hz: number): string {
  if (hz >= 30) return "Gamma";
  if (hz >= 13) return "Beta";
  if (hz >= 8) return "Alpha";
  if (hz >= 4) return "Theta";
  return "Delta";
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("basic");
  const [appView, setAppView] = useState<AppView>("studio");
  const [accountOpen, setAccountOpen] = useState(false);
  const [state, setState] = useState<AppState>(() => presetToState(PRESETS.deskflow));
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  // Modal state
  const [modal, setModal] = useState<AcademyEntry | null>(null);

  // Export state
  const [exportMinutes, setExportMinutes] = useState(15);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Pomodoro state
  const [pomodoroId, setPomodoroId] = useState<string>("classic");
  const [focusPresetId, setFocusPresetId] = useState<PresetId>("deskflow");
  const [restPresetId, setRestPresetId] = useState<PresetId>("archaic");
  const [session, setSession] = useState<null | {
    phase: "focus" | "rest" | "done";
    cycle: number;
    totalCycles: number;
    phaseEndsAt: number;
    phaseDurationSec: number;
  }>(null);

  // Song mixer state - slots A and B for easy/remix modes.
  const [mixerMode, setMixerMode] = useState<"easy" | "remix">("easy");
  const [slots, setSlots] = useState<SongSlot[]>([defaultSlot("A")]);
  const [syncMatrixBpm, setSyncMatrixBpm] = useState(true);
  const [tempoScale, setTempoScale] = useState(1);

  // One audio + file input ref per slot id.
  const audioRefs = useRef<Record<SlotId, HTMLAudioElement | null>>({
    A: null,
    B: null,
  });
  const fileRefs = useRef<Record<SlotId, HTMLInputElement | null>>({
    A: null,
    B: null,
  });

  // Engineer state
  const [engineerOpen, setEngineerOpen] = useState(false);
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const [deepDive, setDeepDive] = useState<DeepDive | null>(null);

  // DJ state
  const [crossfader, setCrossfader] = useState(0.5);
  const [recording, setRecording] = useState(false);
  const [recordStartedAt, setRecordStartedAt] = useState<number | null>(null);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [lastRecording, setLastRecording] = useState<{ blob: Blob; ext: string; durationMs: number } | null>(null);

  // LLM engineer state
  const [llmAsking, setLlmAsking] = useState(false);
  const [llmResponse, setLlmResponse] = useState("");
  const [llmError, setLlmError] = useState<string | null>(null);

  // Auth
  const { user, configured: authConfigured, signOut } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);

  // Unified library state: local (IDB) when signed out, cloud when signed in.
  type LibraryEntry = {
    id: string;
    name: string;
    bpm: number | null;
    hotCues: (number | null)[];
    loopStart: number | null;
    loopEnd: number | null;
    size: number;
    source: "local" | "cloud";
    artist: string | null;
    album: string | null;
    durationSec: number | null;
    coverPath: string | null;
    _local?: LibraryTrack;
    _cloud?: CloudTrack;
  };
  const localToEntry = (t: LibraryTrack): LibraryEntry => ({
    id: t.id,
    name: t.name,
    bpm: t.bpm,
    hotCues: t.hotCues,
    loopStart: t.loopStart,
    loopEnd: t.loopEnd,
    size: t.size,
    source: "local",
    artist: null,
    album: null,
    durationSec: null,
    coverPath: null,
    _local: t,
  });
  const cloudToEntry = (t: CloudTrack): LibraryEntry => ({
    id: t.id,
    name: t.name,
    bpm: t.bpm,
    hotCues: t.hotCues,
    loopStart: t.loopStart,
    loopEnd: t.loopEnd,
    size: t.size,
    source: "cloud",
    artist: t.artist,
    album: t.album,
    durationSec: t.durationSec,
    coverPath: t.coverPath,
    _cloud: t,
  });

  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);

  // Cloud mix state
  const [cloudMixes, setCloudMixes] = useState<CloudMix[]>([]);
  const [mixesOpen, setMixesOpen] = useState(false);
  const [savingMix, setSavingMix] = useState(false);
  const [lastShareUrl, setLastShareUrl] = useState<string | null>(null);

  // Bulk import state
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<{ total: number; done: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);

  // Standalone music player state. queue is what plays; defaults to the full
  // library but can be swapped to an album or playlist subset.
  //
  // Two-turntable model: playerAudioRefA and playerAudioRefB are alternated.
  // The "active" deck is the one currently audible; the other is used to
  // pre-load and crossfade-in the next track when auto-crossfade is on.
  const playerAudioRefA = useRef<HTMLAudioElement>(null);
  const playerAudioRefB = useRef<HTMLAudioElement>(null);
  const [activeDeck, setActiveDeck] = useState<"a" | "b">("a");
  const [queue, setQueue] = useState<LibraryEntry[]>([]);
  const [queuePos, setQueuePos] = useState<number | null>(null);
  const [playerPlaying, setPlayerPlaying] = useState(false);
  const [playerPosition, setPlayerPosition] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [playerVolume, setPlayerVolume] = useState(0.85);
  const [playerObjectUrlA, setPlayerObjectUrlA] = useState<string | null>(null);
  const [playerObjectUrlB, setPlayerObjectUrlB] = useState<string | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "one" | "all">("off");
  // For shuffle: tracks already played in the current run so we don't repeat.
  const [shuffleHistory, setShuffleHistory] = useState<number[]>([]);
  // Auto-crossfade: when on, the next queue track crossfades into the current
  // one ~6 seconds before it ends. Off by default so single-track listening
  // doesn't get surprise transitions.
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(false);
  const CROSSFADE_SEC = 6;
  // Guard so we only trigger the crossfade once per track.
  const crossfadeTriggeredRef = useRef<number | null>(null);

  // Resume-where-you-left-off: persist a tiny snapshot on every tick, and
  // prompt the user when they return with a saved position > 5s in.
  const RESUME_KEY = "brainmix:player-resume";
  const [resumePrompt, setResumePrompt] = useState<{
    trackId: string;
    trackName: string;
    positionSec: number;
  } | null>(null);

  // Playlists state
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsOpen, setPlaylistsOpen] = useState(false);
  const [addToPlaylistTarget, setAddToPlaylistTarget] = useState<LibraryEntry | null>(null);

  // Sequencer (session plan) state.
  // Each step swaps the matrix preset for `minutes` minutes; the plan walks
  // through steps via a setTimeout chain. Music playback is unaffected.
  interface SequencerStep {
    id: string;
    presetId: PresetId;
    minutes: number;
  }
  const [plan, setPlan] = useState<SequencerStep[]>([]);
  const [planRunning, setPlanRunning] = useState(false);
  const [planStepIdx, setPlanStepIdx] = useState(0);
  // When a step started — used to drive the live progress bar.
  const [planStepStartedAt, setPlanStepStartedAt] = useState<number | null>(null);
  // Forces re-render every second while a plan is running so the bar updates.
  const [planTick, setPlanTick] = useState(0);
  const planTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist plans to localStorage so they survive page reloads.
  const PLAN_STORAGE_KEY = "brainmix:sequencer-plan";
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
      if (raw) setPlan(JSON.parse(raw));
    } catch {
      /* ignore corrupted state */
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
    } catch {
      /* localStorage may be full or unavailable */
    }
  }, [plan]);

  // Tick the live progress while a plan runs so the bar fills smoothly.
  useEffect(() => {
    if (!planRunning) return;
    const id = window.setInterval(() => setPlanTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [planRunning]);

  // Sync queue to library when library is the active source.
  useEffect(() => {
    // If nothing is playing yet, mirror library as the default queue.
    if (queuePos == null) setQueue(library);
  }, [library, queuePos]);

  // Load library + mixes based on auth state.
  useEffect(() => {
    if (!authConfigured) {
      listTracks().then((t) => setLibrary(t.map(localToEntry))).catch(() => {});
      return;
    }
    if (user) {
      listCloudTracks()
        .then((t) => setLibrary(t.map(cloudToEntry)))
        .catch(() => {});
      listCloudMixes().then(setCloudMixes).catch(() => {});
    } else {
      listTracks().then((t) => setLibrary(t.map(localToEntry))).catch(() => {});
      setCloudMixes([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authConfigured]);

  const handleSaveToLibrary = useCallback(
    async (slotId: SlotId) => {
      const sl = slots.find((s) => s.id === slotId);
      if (!sl?.url) return;
      try {
        const blob = await fetch(sl.url).then((r) => r.blob());
        if (user) {
          const saved = await uploadTrack({
            userId: user.id,
            name: sl.name || "Untitled",
            blob,
            bpm: sl.bpm,
            hotCues: sl.hotCues,
            loopStart: sl.loopStart,
            loopEnd: sl.loopEnd,
          });
          setLibrary((cur) => [cloudToEntry(saved), ...cur]);
        } else {
          const saved = await saveTrack({
            name: sl.name || "Untitled",
            blob,
            bpm: sl.bpm,
            hotCues: sl.hotCues,
            loopStart: sl.loopStart,
            loopEnd: sl.loopEnd,
          });
          setLibrary((cur) => [localToEntry(saved), ...cur]);
        }
      } catch (e) {
        console.error("Save to library failed:", e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, user],
  );

  const handleDeleteFromLibrary = useCallback(
    async (entry: LibraryEntry) => {
      if (entry.source === "cloud" && entry._cloud) {
        await deleteCloudTrack(entry._cloud);
      } else if (entry._local) {
        await deleteTrack(entry.id);
      }
      setLibrary((cur) => cur.filter((t) => t.id !== entry.id));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleLoadFromLibrary = useCallback(
    async (entry: LibraryEntry, slotId: SlotId) => {
      let file: File;
      if (entry.source === "cloud" && entry._cloud) {
        const blob = await downloadTrack(entry._cloud.storagePath);
        file = new File([blob], entry.name, { type: blob.type || "audio/*" });
      } else if (entry._local) {
        file = trackToFile(entry._local);
      } else {
        return;
      }
      setSlots((cur) =>
        cur.map((s) => {
          if (s.id !== slotId) return s;
          if (s.url) URL.revokeObjectURL(s.url);
          return {
            ...s,
            url: URL.createObjectURL(file),
            name: entry.name.replace(/\.[^.]+$/, ""),
            bpm: entry.bpm,
            hotCues: entry.hotCues,
            loopStart: entry.loopStart,
            loopEnd: entry.loopEnd,
            position: 0,
            bpmDetecting: false,
          };
        }),
      );
      setLibraryOpen(false);
    },
    [],
  );

  const handleSaveMixToCloud = useCallback(async () => {
    if (!user || !lastRecording) return;
    setSavingMix(true);
    try {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const saved = await uploadMix({
        userId: user.id,
        name: `Mix ${stamp}`,
        blob: lastRecording.blob,
        durationMs: lastRecording.durationMs,
        mimeType: lastRecording.blob.type || "audio/webm",
        ext: lastRecording.ext,
      });
      setCloudMixes((cur) => [saved, ...cur]);
      setLastShareUrl(buildShareUrl(saved.shareToken));
    } catch (e) {
      console.error("Save mix failed:", e);
    } finally {
      setSavingMix(false);
    }
  }, [user, lastRecording]);

  const handleDeleteCloudMix = useCallback(async (mix: CloudMix) => {
    await deleteCloudMix(mix);
    setCloudMixes((cur) => cur.filter((m) => m.id !== mix.id));
  }, []);

  // ----- Bulk import -----
  const handleBulkFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setImporting({ total: files.length, done: 0 });
      const newEntries: LibraryEntry[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const meta = await parseMetadata(file);
          const guess = guessFromFilename(file.name);
          const title = meta.title || guess.title || "Untitled";
          const artist = meta.artist || guess.artist;
          const album = meta.album;
          const year = meta.year;
          const durationSec = meta.durationSec;
          // BPM detection on small intros - fire & don't wait if it stalls.
          let bpm: number | null = null;
          try {
            const { detectBPM } = await import("@/lib/bpmDetect");
            const r = await detectBPM(file);
            if (r && r.confidence > 0.05) bpm = r.bpm;
          } catch { /* ignore */ }

          if (user) {
            const saved = await uploadTrack({
              userId: user.id,
              name: title,
              blob: file,
              bpm,
              hotCues: [null, null, null, null],
              loopStart: null,
              loopEnd: null,
              artist,
              album,
              year,
              durationSec,
              coverDataUrl: meta.coverDataUrl,
            });
            newEntries.push(cloudToEntry(saved));
          } else {
            const saved = await saveTrack({
              name: title,
              blob: file,
              bpm,
              hotCues: [null, null, null, null],
              loopStart: null,
              loopEnd: null,
            });
            newEntries.push(localToEntry(saved));
          }
        } catch (e) {
          console.error("Import failed for", file.name, e);
        }
        setImporting({ total: files.length, done: i + 1 });
      }
      setLibrary((cur) => [...newEntries, ...cur]);
      setImporting(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user],
  );

  // ----- Standalone music player -----
  // Loads a library entry into the player audio element and binds via djBus.
  const loadEntryIntoPlayer = useCallback(
    async (entry: LibraryEntry): Promise<string | null> => {
      let blob: Blob;
      if (entry.source === "cloud" && entry._cloud) {
        blob = await downloadTrack(entry._cloud.storagePath);
      } else if (entry._local) {
        blob = entry._local.blob;
      } else {
        return null;
      }
      return URL.createObjectURL(blob);
    },
    [],
  );

  const playQueueAt = useCallback(
    async (pos: number, opts?: { q?: LibraryEntry[]; auto?: boolean }) => {
      const useQ = opts?.q ?? queue;
      if (pos < 0 || pos >= useQ.length) return;
      const entry = useQ[pos];
      try {
        const url = await loadEntryIntoPlayer(entry);
        if (!url) return;
        const elA = playerAudioRefA.current;
        const elB = playerAudioRefB.current;
        if (!elA || !elB) return;
        djBus.ensureContext();
        djBus.resume();
        try { djBus.ensurePlayerPair(elA, elB); } catch { /* idempotent */ }

        // Pick target deck. Auto-crossfade loads into the INACTIVE deck so
        // we can overlap. Manual play replaces in the ACTIVE deck.
        const useCrossfade = !!opts?.auto && crossfadeEnabled;
        const target: "a" | "b" = useCrossfade
          ? activeDeck === "a" ? "b" : "a"
          : activeDeck;
        const targetEl = target === "a" ? elA : elB;
        const oldUrl = target === "a" ? playerObjectUrlA : playerObjectUrlB;
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        if (target === "a") setPlayerObjectUrlA(url);
        else setPlayerObjectUrlB(url);

        targetEl.src = url;
        targetEl.currentTime = 0;
        await targetEl.play().catch(() => {});

        if (useCrossfade) {
          // Equal-power crossfade over CROSSFADE_SEC.
          djBus.crossfadePlayer(target, CROSSFADE_SEC);
          // Pause the outgoing deck once the fade is done.
          const outgoingEl = target === "a" ? elB : elA;
          window.setTimeout(() => outgoingEl.pause(), (CROSSFADE_SEC + 0.2) * 1000);
        } else {
          // Manual swap: snap target to full, mute the other.
          djBus.crossfadePlayer(target, 0.15);
          const otherEl = target === "a" ? elB : elA;
          otherEl.pause();
        }

        setActiveDeck(target);
        if (opts?.q) setQueue(opts.q);
        setQueuePos(pos);
        crossfadeTriggeredRef.current = null;
      } catch (e) {
        console.error("Play queue entry failed:", e);
      }
    },
    [queue, playerObjectUrlA, playerObjectUrlB, activeDeck, crossfadeEnabled, loadEntryIntoPlayer],
  );

  const playEntries = useCallback(
    (entries: LibraryEntry[], startIdx = 0) => {
      if (entries.length === 0) return;
      setShuffleHistory([]);
      playQueueAt(startIdx, { q: entries });
    },
    [playQueueAt],
  );

  const activeAudioEl = () =>
    activeDeck === "a" ? playerAudioRefA.current : playerAudioRefB.current;

  const togglePlayerPlayPause = useCallback(() => {
    const el = activeAudioEl();
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeck]);

  const playerNext = useCallback(
    (auto = false) => {
      if (queuePos == null || queue.length === 0) return;
      if (shuffle && queue.length > 1) {
        const tried = new Set(shuffleHistory);
        tried.add(queuePos);
        const candidates: number[] = [];
        for (let i = 0; i < queue.length; i++) if (!tried.has(i)) candidates.push(i);
        if (candidates.length === 0) {
          if (repeatMode === "all") {
            setShuffleHistory([]);
            const pick = Math.floor(Math.random() * queue.length);
            playQueueAt(pick, { auto });
          }
          return;
        }
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        setShuffleHistory((h) => [...h, queuePos]);
        playQueueAt(pick, { auto });
        return;
      }
      const next = queuePos + 1;
      if (next < queue.length) {
        playQueueAt(next, { auto });
      } else if (repeatMode === "all") {
        playQueueAt(0, { auto });
      }
    },
    [queuePos, queue.length, shuffle, shuffleHistory, repeatMode, playQueueAt],
  );

  const playerPrev = useCallback(() => {
    if (queuePos == null) return;
    if (shuffle && shuffleHistory.length > 0) {
      const prev = shuffleHistory[shuffleHistory.length - 1];
      setShuffleHistory((h) => h.slice(0, -1));
      playQueueAt(prev);
      return;
    }
    const prev = queuePos - 1;
    if (prev >= 0) playQueueAt(prev);
  }, [queuePos, shuffle, shuffleHistory, playQueueAt]);

  // ----- Playlists -----
  useEffect(() => {
    if (user) {
      listPlaylists().then(setPlaylists).catch(() => {});
    } else {
      setPlaylists([]);
    }
  }, [user]);

  // Realtime sync: when playlists/playlist_tracks/tracks change ANYWHERE
  // (another tab, another device, even a SQL console) the local view updates
  // within a second. Cheap — Supabase Realtime is included in the plan and
  // we only run one channel per user.
  useEffect(() => {
    if (!user) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`library:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "playlists",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          listPlaylists().then(setPlaylists).catch(() => {});
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "playlist_tracks" },
        () => {
          // No user_id column on the join table — RLS guarantees we only
          // receive changes for our own playlists. Just refresh counts.
          listPlaylists().then(setPlaylists).catch(() => {});
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tracks",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Reload cloud tracks. Local IDB-only tracks aren't affected.
          listCloudTracks()
            .then((tracks) => setLibrary(tracks.map(cloudToEntry)))
            .catch(() => {});
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleCreatePlaylist = useCallback(
    async (name: string) => {
      if (!user) return null;
      const p = await createPlaylist(name, user.id);
      setPlaylists((cur) => [p, ...cur]);
      return p;
    },
    [user],
  );

  const handleDeletePlaylist = useCallback(async (id: string) => {
    await deletePlaylist(id);
    setPlaylists((cur) => cur.filter((p) => p.id !== id));
  }, []);

  const handleAddToPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      await addTrackToPlaylist(playlistId, trackId);
      setPlaylists((cur) =>
        cur.map((p) =>
          p.id === playlistId ? { ...p, trackCount: p.trackCount + 1 } : p,
        ),
      );
    },
    [],
  );

  // ----- Sequencer -----
  const addPlanStep = useCallback(() => {
    setPlan((cur) => [
      ...cur,
      {
        id: crypto.randomUUID(),
        presetId: cur[cur.length - 1]?.presetId ?? "deskflow",
        minutes: 25,
      },
    ]);
  }, []);

  const removePlanStep = useCallback((id: string) => {
    setPlan((cur) => cur.filter((s) => s.id !== id));
  }, []);

  const updatePlanStep = useCallback(
    (id: string, patch: Partial<SequencerStep>) => {
      setPlan((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    },
    [],
  );

  const runPlanStep = useCallback(
    (idx: number, currentPlan: SequencerStep[]) => {
      if (idx >= currentPlan.length) {
        setPlanRunning(false);
        setPlanStepStartedAt(null);
        return;
      }
      setPlanStepIdx(idx);
      setPlanStepStartedAt(Date.now());
      const step = currentPlan[idx];
      const preset = PRESETS[step.presetId];
      if (preset) {
        setState(presetToState(preset));
      }
      const ms = Math.max(1, step.minutes) * 60 * 1000;
      planTimerRef.current = setTimeout(() => {
        runPlanStep(idx + 1, currentPlan);
      }, ms);
    },
    [],
  );

  const startPlan = useCallback(() => {
    if (plan.length === 0) return;
    setPlanRunning(true);
    runPlanStep(0, plan);
  }, [plan, runPlanStep]);

  const stopPlan = useCallback(() => {
    if (planTimerRef.current) clearTimeout(planTimerRef.current);
    planTimerRef.current = null;
    setPlanRunning(false);
    setPlanStepStartedAt(null);
  }, []);

  useEffect(() => {
    return () => {
      if (planTimerRef.current) clearTimeout(planTimerRef.current);
    };
  }, []);

  const handlePlayPlaylist = useCallback(
    async (playlistId: string) => {
      try {
        const tracks = await getPlaylistTracks(playlistId);
        const entries = tracks.map(cloudToEntry);
        if (entries.length > 0) {
          playEntries(entries, 0);
          setPlaylistsOpen(false);
        }
      } catch (e) {
        console.error("Play playlist failed:", e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playEntries],
  );

  // ---- Resume persistence ----
  // Snapshot once a second while playing. Debounced setTimeout keeps it cheap.
  useEffect(() => {
    if (queuePos == null || !queue[queuePos] || !playerPlaying) return;
    const entry = queue[queuePos];
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          RESUME_KEY,
          JSON.stringify({
            trackId: entry.id,
            trackName: entry.name,
            positionSec: playerPosition,
          }),
        );
      } catch {
        /* localStorage may be full */
      }
    }, 1000);
    return () => window.clearTimeout(id);
  }, [queuePos, queue, playerPosition, playerPlaying]);

  // On library load (signed-in user or anonymous), check for a saved position.
  // Only prompt if the track is still in the library and > 5s in.
  useEffect(() => {
    if (library.length === 0) return;
    if (queuePos != null) return; // already playing
    if (resumePrompt) return; // already prompting
    try {
      const raw = window.localStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        trackId: string;
        trackName: string;
        positionSec: number;
      };
      const exists = library.find((e) => e.id === saved.trackId);
      if (exists && saved.positionSec > 5) {
        setResumePrompt(saved);
      }
    } catch {
      /* corrupted state, ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.length]);

  const acceptResume = useCallback(async () => {
    if (!resumePrompt) return;
    const idx = library.findIndex((e) => e.id === resumePrompt.trackId);
    if (idx < 0) {
      setResumePrompt(null);
      return;
    }
    const target = resumePrompt.positionSec;
    setResumePrompt(null);
    await playQueueAt(idx);
    // Seek after audio is loaded. Two ticks usually enough.
    window.setTimeout(() => {
      const el = activeDeck === "a" ? playerAudioRefA.current : playerAudioRefB.current;
      if (el) el.currentTime = target;
    }, 300);
  }, [resumePrompt, library, playQueueAt, activeDeck]);

  const dismissResume = useCallback(() => {
    setResumePrompt(null);
    try {
      window.localStorage.removeItem(RESUME_KEY);
    } catch { /* ignore */ }
  }, []);

  // ---- Media Session integration ----
  // Bind transport handlers once. They reference the latest handlers via refs
  // so they don't go stale as queue state changes.
  useEffect(() => {
    bindMediaActions({
      onPlay: () => activeAudioEl()?.play().catch(() => {}),
      onPause: () => activeAudioEl()?.pause(),
      onPrev: () => playerPrev(),
      onNext: () => playerNext(),
      onStop: () => {
        const a = playerAudioRefA.current;
        const b = playerAudioRefB.current;
        if (a) a.pause();
        if (b) b.pause();
        setQueuePos(null);
        setPlaybackState("none");
      },
      onSeekBackward: (offset) => {
        const el = activeAudioEl();
        if (el) el.currentTime = Math.max(0, el.currentTime - offset);
      },
      onSeekForward: (offset) => {
        const el = activeAudioEl();
        if (el) el.currentTime = Math.min(el.duration || Infinity, el.currentTime + offset);
      },
      onSeekTo: (t) => {
        const el = activeAudioEl();
        if (el) el.currentTime = t;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerPrev, playerNext]);

  // Push the current entry's metadata to the OS whenever the track changes.
  useEffect(() => {
    if (queuePos == null || !queue[queuePos]) {
      setMediaMetadata(null);
      setPlaybackState("none");
      return;
    }
    const entry = queue[queuePos];
    let cancelled = false;
    const apply = (artworkUrl: string | null) => {
      if (cancelled) return;
      setMediaMetadata({
        title: entry.name,
        artist: entry.artist,
        album: entry.album,
        artworkUrl,
      });
    };
    if (entry.coverPath) {
      signCoverUrl(entry.coverPath).then((u) => apply(u)).catch(() => apply(null));
    } else {
      apply(null);
    }
    return () => {
      cancelled = true;
    };
  }, [queuePos, queue]);

  // Reflect play/pause to the OS so the lock-screen button shows the right icon.
  useEffect(() => {
    setPlaybackState(playerPlaying ? "playing" : queuePos != null ? "paused" : "none");
  }, [playerPlaying, queuePos]);

  // Throttled position pushes — once per second is plenty for the OS scrubber.
  useEffect(() => {
    if (!playerPlaying || playerDuration <= 0) return;
    setMediaPosition({ durationSec: playerDuration, positionSec: playerPosition });
  }, [playerPlaying, playerPosition, playerDuration]);

  // Apply player volume.
  useEffect(() => {
    // Apply to both decks via the element-level volume (separate from the
    // gain-based crossfade so transitions don't fight with the volume slider).
    if (playerAudioRefA.current) playerAudioRefA.current.volume = playerVolume;
    if (playerAudioRefB.current) playerAudioRefB.current.volume = playerVolume;
  }, [playerVolume]);

  // Clean up the player object URLs on unmount.
  useEffect(() => {
    return () => {
      if (playerObjectUrlA) URL.revokeObjectURL(playerObjectUrlA);
      if (playerObjectUrlB) URL.revokeObjectURL(playerObjectUrlB);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Engine control -----
  const update = useCallback((patch: Partial<AppState>) => {
    setState((s) => ({ ...s, ...patch, presetId: null }));
  }, []);

  const applyPreset = useCallback((p: Preset) => {
    if (playing) {
      stopEngine();
      setPlaying(false);
      startedAt.current = null;
    }
    setState(presetToState(p));
  }, [playing]);

  // ----- Slot helpers -----
  const updateSlot = useCallback((id: SlotId, patch: Partial<SongSlot>) => {
    setSlots((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const addSlotB = useCallback(() => {
    setSlots((cur) => (cur.some((s) => s.id === "B") ? cur : [...cur, defaultSlot("B")]));
    setMixerMode("remix");
  }, []);

  const removeSlot = useCallback((id: SlotId) => {
    const el = audioRefs.current[id];
    if (el) el.pause();
    setSlots((cur) => {
      const target = cur.find((s) => s.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      const next = cur.filter((s) => s.id !== id);
      if (next.length === 0) return [defaultSlot("A")];
      return next;
    });
    if (id === "B") setMixerMode("easy");
  }, []);

  const importSong = useCallback((id: SlotId, file: File) => {
    setSlots((cur) =>
      cur.map((s) => {
        if (s.id !== id) return s;
        if (s.url) URL.revokeObjectURL(s.url);
        return {
          ...s,
          url: URL.createObjectURL(file),
          name: file.name.replace(/\.[^.]+$/, ""),
          position: 0,
          bpmDetecting: true,
          // Reset cue points and loop on new song.
          hotCues: [null, null, null, null],
          loopStart: null,
          loopEnd: null,
        };
      }),
    );
    // Kick off BPM detection. Best-effort - silently skip if it errors or
    // confidence is too low.
    detectBPM(file).then((result) => {
      setSlots((cur) =>
        cur.map((s) => {
          if (s.id !== id) return s;
          // Don't overwrite a BPM the user typed during analysis.
          const keepUser = s.bpm != null && !s.bpmDetecting;
          return {
            ...s,
            bpm: keepUser ? s.bpm : (result && result.confidence > 0.05 ? result.bpm : s.bpm),
            bpmDetecting: false,
          };
        }),
      );
    }).catch(() => {
      setSlots((cur) => cur.map((s) => (s.id === id ? { ...s, bpmDetecting: false } : s)));
    });
  }, []);

  const playAllSongs = useCallback(() => {
    for (const sl of slots) {
      const el = audioRefs.current[sl.id];
      if (el && sl.url) el.play().catch(() => {});
    }
  }, [slots]);

  const pauseAllSongs = useCallback(() => {
    for (const sl of slots) {
      const el = audioRefs.current[sl.id];
      if (el) el.pause();
    }
  }, [slots]);

  const applyEngineerFix = useCallback((result: ApplyResult) => {
    if (result.appState) {
      setState((s) => ({ ...s, ...result.appState, presetId: null }));
    }
    if (result.slotPatches) {
      for (const sp of result.slotPatches) updateSlot(sp.id, sp.patch);
    }
  }, [updateSlot]);

  const handleStart = useCallback(() => {
    // Ensure the shared bus exists and route matrix through it.
    const ctx = djBus.ensureContext();
    djBus.resume();
    // Retry deck binding here too - iOS Safari requires this in a user
    // gesture, which the initial mount might not be.
    for (const sl of slots) {
      const el = audioRefs.current[sl.id];
      if (el) {
        try { djBus.ensureDeck(sl.id, el); } catch { /* deck may already exist */ }
      }
    }
    startEngine(stateToEngineConfig(state, tempoScale), {
      ctx,
      destination: djBus.matrixInput ?? undefined,
    });
    playAllSongs();
    startedAt.current = Date.now();
    setElapsed(0);
    setPlaying(true);
  }, [state, tempoScale, playAllSongs, slots]);

  const handleStop = useCallback(() => {
    stopEngine();
    pauseAllSongs();
    setPlaying(false);
    startedAt.current = null;
  }, [pauseAllSongs]);

  // Sync slot volume / loop / playbackRate / preservePitch to audio elements
  // AND DJ bus settings (EQ, filter, deck volume).
  useEffect(() => {
    for (const sl of slots) {
      const el = audioRefs.current[sl.id];
      if (!el) continue;
      el.volume = sl.muted ? 0 : sl.volume;
      el.loop = sl.loop;
      el.playbackRate = sl.playbackRate;
      const anyEl = el as HTMLAudioElement & { preservesPitch?: boolean };
      if ("preservesPitch" in el) anyEl.preservesPitch = sl.preservePitch;
      // DJ bus sync (no-ops if deck not yet bound).
      djBus.setDeckVolume(sl.id, sl.muted ? 0 : 1);
      djBus.setEQ(sl.id, "low", sl.eqLow);
      djBus.setEQ(sl.id, "mid", sl.eqMid);
      djBus.setEQ(sl.id, "high", sl.eqHigh);
      djBus.setFilterCutoff(sl.id, sl.filterCutoff);
    }
  }, [slots]);

  // Sync crossfader to bus.
  useEffect(() => {
    djBus.setCrossfader(crossfader);
  }, [crossfader]);

  // Loop in/out enforcement on each tick.
  useEffect(() => {
    const id = setInterval(() => {
      for (const sl of slots) {
        if (!sl.url || sl.loopStart == null || sl.loopEnd == null) continue;
        const el = audioRefs.current[sl.id];
        if (!el) continue;
        if (el.currentTime >= sl.loopEnd) {
          el.currentTime = sl.loopStart;
        }
      }
    }, 60);
    return () => clearInterval(id);
  }, [slots]);

  // Recording timer.
  useEffect(() => {
    if (!recording || !recordStartedAt) return;
    const id = setInterval(() => {
      setRecordElapsed((Date.now() - recordStartedAt) / 1000);
    }, 250);
    return () => clearInterval(id);
  }, [recording, recordStartedAt]);

  const handleStartRecording = useCallback(() => {
    const ok = djBus.startRecording();
    if (!ok) return;
    setRecording(true);
    setRecordStartedAt(Date.now());
    setRecordElapsed(0);
  }, []);

  const handleStopRecording = useCallback(async () => {
    const result = await djBus.stopRecording();
    setRecording(false);
    setRecordStartedAt(null);
    if (result) {
      setLastRecording({ blob: result.blob, ext: result.extension, durationMs: result.durationMs });
    }
  }, []);

  const handleDownloadRecording = useCallback(() => {
    if (!lastRecording) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadBlob(lastRecording.blob, `brainmix_${stamp}.${lastRecording.ext}`);
  }, [lastRecording]);

  const handleAskEngineer = useCallback(async (state: EngineerState) => {
    setLlmAsking(true);
    setLlmResponse("");
    setLlmError(null);
    try {
      const res = await fetch("/api/engineer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      if (!res.ok) {
        const text = await res.text();
        setLlmError(text || `Request failed: ${res.status}`);
        setLlmAsking(false);
        return;
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        setLlmError("No response stream.");
        setLlmAsking(false);
        return;
      }
      let accumulated = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setLlmResponse(accumulated);
      }
      setLlmAsking(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      setLlmError(msg);
      setLlmAsking(false);
    }
  }, []);

  // Sync matrix BPM to slot A's effective BPM when toggle is on.
  useEffect(() => {
    if (!syncMatrixBpm) return;
    const a = slots.find((s) => s.id === "A");
    if (!a || a.bpm == null || a.bpm <= 0) return;
    setState((s) => ({ ...s, bpmSync: a.bpm! }));
    // Note: tempoScale is applied at engine config time, so we store the raw BPM here.
  }, [slots, syncMatrixBpm]);

  // Cleanup object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const sl of slots) {
        if (sl.url) URL.revokeObjectURL(sl.url);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live volume during play
  useEffect(() => {
    if (playing) setMasterGain(state.volume);
  }, [state.volume, playing]);

  // Session timer ticker
  useEffect(() => {
    if (!playing && !session) return;
    const id = setInterval(() => {
      if (startedAt.current != null) {
        setElapsed((Date.now() - startedAt.current) / 1000);
      }
    }, 250);
    return () => clearInterval(id);
  }, [playing, session]);

  // Cleanup on unmount
  useEffect(() => () => { stopEngine(); }, []);

  // ----- Pomodoro session controller -----
  useEffect(() => {
    if (!session) return;
    const tick = setInterval(() => {
      const now = Date.now();
      if (now >= session.phaseEndsAt) {
        advancePhase();
      }
    }, 500);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const startPhase = useCallback((preset: Preset, durationSec: number) => {
    stopEngine();
    pauseAllSongs();
    setTimeout(() => {
      const cfg: EngineConfig = stateToEngineConfig(presetToState(preset), tempoScale);
      const ctx = djBus.ensureContext();
      djBus.resume();
      startEngine(cfg, { ctx, destination: djBus.matrixInput ?? undefined });
      for (const sl of slots) {
        const el = audioRefs.current[sl.id];
        if (el && sl.url) {
          el.currentTime = 0;
          el.play().catch(() => {});
        }
      }
      startedAt.current = Date.now();
      setElapsed(0);
      setPlaying(true);
    }, 100);
    return Date.now() + durationSec * 1000;
  }, [slots, tempoScale, pauseAllSongs]);

  const startSession = useCallback(() => {
    const pomo = POMODORO_PRESETS.find((p) => p.id === pomodoroId)!;
    const focusPreset = PRESETS[focusPresetId];
    playBell(4);
    const endsAt = startPhase(focusPreset, pomo.focusMin * 60);
    setSession({
      phase: "focus",
      cycle: 1,
      totalCycles: pomo.cycles,
      phaseEndsAt: endsAt,
      phaseDurationSec: pomo.focusMin * 60,
    });
  }, [pomodoroId, focusPresetId, startPhase]);

  const advancePhase = useCallback(() => {
    setSession((cur) => {
      if (!cur) return null;
      const pomo = POMODORO_PRESETS.find((p) => p.id === pomodoroId)!;
      playBell(5);
      if (cur.phase === "focus") {
        const restPreset = PRESETS[restPresetId];
        const endsAt = startPhase(restPreset, pomo.restMin * 60);
        return {
          ...cur,
          phase: "rest",
          phaseEndsAt: endsAt,
          phaseDurationSec: pomo.restMin * 60,
        };
      }
      // After rest: next cycle or done.
      if (cur.cycle >= cur.totalCycles) {
        stopEngine();
        setPlaying(false);
        return { ...cur, phase: "done" };
      }
      const focusPreset = PRESETS[focusPresetId];
      const endsAt = startPhase(focusPreset, pomo.focusMin * 60);
      return {
        ...cur,
        phase: "focus",
        cycle: cur.cycle + 1,
        phaseEndsAt: endsAt,
        phaseDurationSec: pomo.focusMin * 60,
      };
    });
  }, [pomodoroId, focusPresetId, restPresetId, startPhase]);

  const stopSession = useCallback(() => {
    stopEngine();
    pauseAllSongs();
    setPlaying(false);
    setSession(null);
  }, [pauseAllSongs]);

  // ----- Export -----
  const handleExport = useCallback(() => {
    setExporting(true);
    setExportProgress(0);
    const payload: ExportPayload = {
      ...stateToEngineConfig(state, tempoScale),
      minutes: exportMinutes,
    };
    exportWav(payload, (ev) => {
      if (ev.type === "progress") {
        setExportProgress(ev.percent);
      } else {
        const name =
          (state.presetId ?? "custom") +
          `_${state.beatHz}Hz_${exportMinutes}min.wav`;
        downloadWav(ev.blob, name);
        setExporting(false);
        setExportProgress(0);
      }
    });
  }, [state, exportMinutes]);

  // ----- Derived UI -----
  const phaseRemaining = session
    ? Math.max(0, (session.phaseEndsAt - Date.now()) / 1000)
    : 0;
  const phaseProgress = session && session.phaseDurationSec > 0
    ? 1 - phaseRemaining / session.phaseDurationSec
    : 0;

  // Snapshot for the Engineer's analyzer.
  const engineerState: EngineerState = {
    preset: state.presetId,
    beatHz: state.beatHz,
    carrierHz: state.carrierHz,
    droneHz: state.droneHz,
    bpmSync: state.bpmSync,
    noise: state.noise,
    noiseGain: state.layerNoise ? state.noiseGain : 0,
    droneGain: state.layerDrone ? state.droneGain : 0,
    entrainmentGain: state.entrainmentGain,
    mode: state.mode,
    gammaBoost: state.gammaBoost,
    emdrPan: state.emdrPan,
    breathPacer: state.breathPacer,
    volume: state.volume,
    tempoScale,
    syncMatrixBpm,
    slots,
    playing,
    crossfader,
    recordingDurationMs: recording ? recordElapsed * 1000 : 0,
  };
  const activeTips = analyzeState(engineerState, dismissedTips);

  return (
    <div
      className="min-h-screen bg-[#09090b] text-zinc-100 font-sans"
      onDragEnter={(e) => {
        if (e.dataTransfer.types?.includes("Files")) {
          e.preventDefault();
          dragCounter.current++;
          setDragActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.dataTransfer.types?.includes("Files")) {
          e.preventDefault();
          dragCounter.current--;
          if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setDragActive(false);
          }
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types?.includes("Files")) e.preventDefault();
      }}
      onDrop={async (e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setDragActive(false);
        // dataTransfer.items lets us walk folders via webkitGetAsEntry, which
        // the plain .files API doesn't. Fall back to .files if entries aren't
        // available (e.g. Firefox without the experimental flag).
        const items = e.dataTransfer.items;
        let collected: File[] = [];
        if (items && items.length > 0) {
          const entries: FileSystemEntry[] = [];
          for (const item of Array.from(items)) {
            const ent = item.webkitGetAsEntry?.();
            if (ent) entries.push(ent);
          }
          if (entries.length > 0) {
            collected = await walkEntriesForAudio(entries);
          } else {
            collected = Array.from(e.dataTransfer.files ?? []);
          }
        } else {
          collected = Array.from(e.dataTransfer.files ?? []);
        }
        const audio = collected.filter(
          (f) =>
            /^audio\//.test(f.type) ||
            /\.(mp3|m4a|wav|flac|ogg|aac|opus)$/i.test(f.name),
        );
        if (audio.length > 0) handleBulkFiles(audio);
      }}
    >
      {dragActive && (
        <div className="fixed inset-0 z-40 bg-[#00ffcc]/10 backdrop-blur-sm border-2 border-dashed border-[#00ffcc]/60 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-2xl text-[#00ffcc] font-light mb-2">
              Drop to import
            </div>
            <div className="text-sm text-zinc-400">
              MP3 · M4A · WAV · FLAC · OGG
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-md md:max-w-2xl px-4 py-6 md:py-10 pb-40 md:pb-44">
        {/* Header */}
        <header className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <h1 className="text-2xl md:text-3xl font-light tracking-tight">
            brain<span className="text-[#00ffcc]">mix</span>
          </h1>
          <div className="flex gap-1.5 flex-wrap">
            {authConfigured && user && (
              <button
                onClick={() => setPlaylistsOpen(true)}
                className="text-[11px] md:text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-[#a78bfa]/40 text-[#a78bfa] bg-[#a78bfa]/5 hover:bg-[#a78bfa]/10"
              >
                Playlists {playlists.length > 0 && `(${playlists.length})`}
              </button>
            )}
            {authConfigured && user && (
              <button
                onClick={() => setMixesOpen(true)}
                className="text-[11px] md:text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-[#00ffcc]/40 text-[#00ffcc] bg-[#00ffcc]/5 hover:bg-[#00ffcc]/10"
              >
                My Mixes {cloudMixes.length > 0 && `(${cloudMixes.length})`}
              </button>
            )}
            <button
              onClick={() => setModal(ACADEMY.ytmusic)}
              className="text-[11px] md:text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-fuchsia-500/40 text-fuchsia-300 bg-fuchsia-500/5 hover:bg-fuchsia-500/15"
            >
              YT Music
            </button>
            <button
              onClick={() => setModal(ACADEMY.evidence)}
              className="text-[11px] md:text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-900"
            >
              Science?
            </button>
            {authConfigured && (
              user ? (
                <button
                  onClick={() => signOut()}
                  title={user.email ?? ""}
                  className="text-[11px] md:text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-900"
                >
                  Sign out
                </button>
              ) : (
                <button
                  onClick={() => setSignInOpen(true)}
                  className="text-[11px] md:text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-900"
                >
                  Sign in
                </button>
              )
            )}
          </div>
        </header>

        {/* Resume-playback banner — shown only when there's a saved position. */}
        {appView === "music" && resumePrompt && (
          <div className="mb-4 p-3 rounded-xl border border-[#a78bfa]/40 bg-[#a78bfa]/[0.04] flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-[#a78bfa]/80">
                Resume?
              </div>
              <div className="text-sm text-zinc-200 truncate">
                {resumePrompt.trackName}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono">
                Pick up at {Math.floor(resumePrompt.positionSec / 60)}:
                {Math.floor(resumePrompt.positionSec % 60).toString().padStart(2, "0")}
              </div>
            </div>
            <button
              onClick={acceptResume}
              className="px-3 py-1.5 text-[11px] uppercase tracking-wider rounded bg-[#a78bfa] text-zinc-950 font-medium hover:bg-[#a78bfa]/85"
            >
              Resume
            </button>
            <button
              onClick={dismissResume}
              className="px-2 py-1.5 text-[11px] uppercase tracking-wider rounded border border-zinc-800 text-zinc-500 hover:text-zinc-300"
            >
              ✕
            </button>
          </div>
        )}

        {/* Music view (browse + play) */}
        {appView === "music" && (
          <MusicHub
            user={user}
            authConfigured={authConfigured}
            libraryCount={library.length}
            playlistsCount={playlists.length}
            mixesCount={cloudMixes.length}
            playerActive={queuePos != null}
            onOpenLibrary={() => setLibraryOpen(true)}
            onOpenPlaylists={() => setPlaylistsOpen(true)}
            onOpenMixes={() => setMixesOpen(true)}
            onSignIn={() => setSignInOpen(true)}
            onBulkImport={() => bulkInputRef.current?.click()}
          />
        )}

        {/* Matrix tabs (Studio view only) */}
        {appView === "studio" && (
          <div className="flex gap-1 mb-5 p-1 bg-black/40 border border-zinc-900 rounded-lg">
            {(["basic", "moderate", "advanced"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-xs uppercase tracking-wider font-medium rounded transition-colors ${
                  tab === t
                    ? "bg-zinc-900 text-[#00ffcc]"
                    : "text-zinc-600 hover:text-zinc-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Tab content */}
        {tab === "basic" && (
          <div className="space-y-3 mb-6">
            {PRESET_LIST.map((p) => {
              const selected = state.presetId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    selected
                      ? "border-[#00ffcc]/60 bg-[#00ffcc]/5 ring-1 ring-[#00ffcc]/40"
                      : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{p.emoji}</span>
                    <span className="font-medium">{p.name}</span>
                    <EvidenceBadge level={p.evidence} />
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-mono mb-1.5">
                    {p.band} · {p.hz}
                  </div>
                  <div className="text-xs text-zinc-400 leading-relaxed">
                    {p.blurb}
                  </div>
                  {selected && (
                    <div className="mt-3 pt-3 border-t border-zinc-800 text-[11px] text-zinc-500 leading-relaxed">
                      {p.science}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {tab === "moderate" && (
          <div className="space-y-4 mb-6">
            <p className="text-xs text-zinc-500">
              Adjust the two core neuro-metrics. Carrier and waveform are locked here -
              go Advanced for full control.
            </p>
            <Slider
              label="Target Brain State"
              info={() => setModal(ACADEMY.brainstate)}
              value={state.beatHz}
              min={2}
              max={50}
              step={0.5}
              display={`${state.beatHz} Hz · ${hzBand(state.beatHz)}`}
              onChange={(v) => update({ beatHz: v })}
            />
            <Slider
              label="Music Pocket Sync"
              info={() => setModal(ACADEMY.bpmsync)}
              value={state.bpmSync}
              min={0}
              max={140}
              step={1}
              display={state.bpmSync === 0 ? "OFF (drone)" : `${state.bpmSync} BPM`}
              onChange={(v) => update({ bpmSync: v })}
            />
            <Toggle
              label="40 Hz Gamma Boost"
              info={() => setModal(ACADEMY.gamma)}
              checked={state.gammaBoost}
              onChange={(v) => update({ gammaBoost: v })}
            />
          </div>
        )}

        {tab === "advanced" && (
          <div className="space-y-4 mb-6">
            <Slider
              label="Entrainment Hz"
              info={() => setModal(ACADEMY.brainstate)}
              value={state.beatHz}
              min={1}
              max={60}
              step={0.5}
              display={`${state.beatHz} Hz · ${hzBand(state.beatHz)}`}
              onChange={(v) => update({ beatHz: v })}
            />
            <Slider
              label="Pocket Sync (BPM)"
              info={() => setModal(ACADEMY.bpmsync)}
              value={state.bpmSync}
              min={0}
              max={160}
              step={1}
              display={state.bpmSync === 0 ? "OFF" : `${state.bpmSync} BPM`}
              onChange={(v) => update({ bpmSync: v })}
            />
            <Slider
              label="Carrier Tuning"
              info={() => setModal(ACADEMY.carrier)}
              value={state.carrierHz}
              min={80}
              max={528}
              step={1}
              display={`${state.carrierHz} Hz`}
              onChange={(v) => update({ carrierHz: v })}
            />
            <Slider
              label="Drone Fundamental"
              value={state.droneHz}
              min={55}
              max={220}
              step={1}
              display={`${state.droneHz} Hz`}
              onChange={(v) => update({ droneHz: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <SelectBox
                label="LFO Shape"
                info={() => setModal(ACADEMY.waveform)}
                value={state.lfoShape}
                options={[
                  { value: "sine", label: "Sine (subtle)" },
                  { value: "square", label: "Square (sharp)" },
                ]}
                onChange={(v) => update({ lfoShape: v as LFOShape })}
              />
              <SelectBox
                label="Noise"
                info={() => setModal(ACADEMY.noise)}
                value={state.noise}
                options={[
                  { value: "brown", label: "Brown (deep)" },
                  { value: "pink", label: "Pink (warm)" },
                  { value: "off", label: "Off" },
                ]}
                onChange={(v) => update({ noise: v as NoiseColor })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Toggle
                label="Gamma Boost"
                info={() => setModal(ACADEMY.gamma)}
                checked={state.gammaBoost}
                onChange={(v) => update({ gammaBoost: v })}
              />
              <Toggle
                label="Breath Pacer"
                info={() => setModal(ACADEMY.breath)}
                checked={state.breathPacer}
                onChange={(v) => update({ breathPacer: v })}
              />
              <Toggle
                label="EMDR Panning"
                info={() => setModal(ACADEMY.emdr)}
                checked={state.emdrPan}
                onChange={(v) => update({ emdrPan: v })}
              />
              <Toggle
                label="Drone Layer"
                checked={state.layerDrone}
                onChange={(v) => update({ layerDrone: v })}
              />
            </div>
          </div>
        )}

        {appView === "timer" && (
          <div className="space-y-4 mb-6">
            <p className="text-xs text-zinc-500">
              No screen clock. No alarm. The audio shifts between focus and rest
              configs with a 432 Hz bell as the only signal.
            </p>

            <div>
              <label className="text-xs uppercase tracking-wider text-zinc-500 mb-2 block">
                Session
              </label>
              <div className="space-y-2">
                {POMODORO_PRESETS.map((p) => {
                  const selected = p.id === pomodoroId;
                  return (
                    <button
                      key={p.id}
                      disabled={!!session && session.phase !== "done"}
                      onClick={() => setPomodoroId(p.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        selected
                          ? "border-[#00ffcc]/60 bg-[#00ffcc]/5"
                          : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex justify-between items-baseline">
                        <span className="font-medium text-sm">{p.name}</span>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {p.focusMin} / {p.restMin} x {p.cycles}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                        {p.blurb}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SelectBox
                label="Focus Sound"
                value={focusPresetId}
                options={PRESET_LIST.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(v) => setFocusPresetId(v as PresetId)}
              />
              <SelectBox
                label="Rest Sound"
                value={restPresetId}
                options={PRESET_LIST.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(v) => setRestPresetId(v as PresetId)}
              />
            </div>

            {session && (
              <SessionDisplay
                phase={session.phase}
                cycle={session.cycle}
                total={session.totalCycles}
                remaining={phaseRemaining}
                progress={phaseProgress}
              />
            )}

            <button
              onClick={session && session.phase !== "done" ? stopSession : startSession}
              className={`w-full h-12 rounded-xl font-medium text-sm transition-colors ${
                session && session.phase !== "done"
                  ? "bg-zinc-200 text-zinc-950 hover:bg-zinc-300"
                  : "bg-[#00ffcc] text-zinc-950 hover:bg-[#00ffcc]/85"
              }`}
            >
              {session && session.phase !== "done" ? "Stop Session" : "Start Session"}
            </button>
          </div>
        )}

        {/* Song mixer (Studio only) */}
        {appView === "studio" && (
        <section className="mt-4 border-t border-zinc-900 pt-5">
          <MixerSection
            mode={mixerMode}
            slots={slots}
            syncMatrixBpm={syncMatrixBpm}
            tempoScale={tempoScale}
            crossfader={crossfader}
            recording={recording}
            recordElapsed={recordElapsed}
            lastRecording={lastRecording ? { durationMs: lastRecording.durationMs } : null}
            libraryCount={library.length}
            isAuthenticated={!!user}
            savingMix={savingMix}
            lastShareUrl={lastShareUrl}
            onModeChange={setMixerMode}
            onPickFile={(id) => fileRefs.current[id]?.click()}
            onRemoveSlot={removeSlot}
            onAddSlotB={addSlotB}
            onUpdateSlot={updateSlot}
            onSyncChange={setSyncMatrixBpm}
            onTempoScale={setTempoScale}
            onCrossfader={setCrossfader}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onDownloadRecording={handleDownloadRecording}
            onSaveMixToCloud={handleSaveMixToCloud}
            onClearShareUrl={() => setLastShareUrl(null)}
            onOpenLibrary={() => setLibraryOpen(true)}
            onSaveSlot={handleSaveToLibrary}
            onSeek={(id, t) => {
              const el = audioRefs.current[id];
              if (el) el.currentTime = t;
              updateSlot(id, { position: t });
            }}
            onInfo={() => setModal(ACADEMY.songmix)}
          />
        </section>
        )}

        {/* Engineer card (Studio only) */}
        {appView === "studio" && (
        <section className="mt-4">
          <EngineerCard
            tips={activeTips}
            engineerOpen={engineerOpen}
            onToggleOpen={() => setEngineerOpen((v) => !v)}
            onApply={(tip) => {
              if (tip.apply) applyEngineerFix(tip.apply(engineerState));
            }}
            onDismiss={(id) => setDismissedTips((cur) => new Set(cur).add(id))}
            onOpenDeepDive={(d) => setDeepDive(d)}
            llmAsking={llmAsking}
            llmResponse={llmResponse}
            llmError={llmError}
            onAskLLM={() => handleAskEngineer(engineerState)}
            onClearLLM={() => {
              setLlmResponse("");
              setLlmError(null);
            }}
          />
        </section>
        )}

        {/* Session sequencer - schedule preset transitions for long sessions */}
        {appView === "studio" && (
          <section className="mt-4 border-t border-zinc-900 pt-5">
            <div className="flex justify-between items-baseline mb-2">
              <h3 className="text-xs uppercase tracking-widest text-[#00ffcc]">
                Session plan
              </h3>
              <span className="text-[10px] text-zinc-500 font-mono">
                {plan.length === 0
                  ? "Empty"
                  : `${plan.length} step${plan.length !== 1 ? "s" : ""}`}
                {planRunning && ` · running ${planStepIdx + 1}/${plan.length}`}
              </span>
            </div>

            {plan.length === 0 && (
              <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
                Schedule preset transitions for long sessions. Example: 25 min Desk
                Flow → 5 min Archaic Reset → 25 min Theta Theater. Add steps,
                tap Start, and the matrix walks itself through each preset.
              </p>
            )}

            <div className="space-y-2 mb-3">
              {plan.map((step, i) => {
                const isActive = planRunning && i === planStepIdx;
                const stepMs = Math.max(1, step.minutes) * 60 * 1000;
                const elapsed = isActive && planStepStartedAt
                  ? Date.now() - planStepStartedAt
                  : 0;
                const remaining = Math.max(0, stepMs - elapsed);
                const progressPct = isActive
                  ? Math.min(100, (elapsed / stepMs) * 100)
                  : 0;
                // Suppress unused-var warning on planTick - it forces this re-render.
                void planTick;
                return (
                  <div
                    key={step.id}
                    className={`p-2.5 rounded-lg border bg-zinc-900/40 ${
                      isActive ? "border-[#00ffcc]/60 bg-[#00ffcc]/[0.03]" : "border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono w-5 ${
                          isActive ? "text-[#00ffcc]" : "text-zinc-600"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <select
                        value={step.presetId}
                        onChange={(e) =>
                          updatePlanStep(step.id, {
                            presetId: e.target.value as PresetId,
                          })
                        }
                        disabled={planRunning}
                        className="flex-1 min-w-0 bg-black/40 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-60"
                      >
                        {PRESET_LIST.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.emoji} {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={step.minutes}
                        onChange={(e) =>
                          updatePlanStep(step.id, {
                            minutes: Math.max(1, parseInt(e.target.value) || 1),
                          })
                        }
                        min={1}
                        max={120}
                        disabled={planRunning}
                        className="w-14 bg-black/40 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono disabled:opacity-60"
                      />
                      <span className="text-[10px] text-zinc-500">min</span>
                      <button
                        onClick={() => removePlanStep(step.id)}
                        disabled={planRunning}
                        className="px-2 py-1 text-[10px] text-zinc-500 border border-zinc-800 rounded hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-30"
                      >
                        ✕
                      </button>
                    </div>
                    {isActive && (
                      <div className="mt-2">
                        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#00ffcc] transition-[width] duration-1000 ease-linear"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1 text-[10px] font-mono text-zinc-500">
                          <span>{formatTime(elapsed / 1000)}</span>
                          <span>−{formatTime(remaining / 1000)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={addPlanStep}
                disabled={planRunning}
                className="flex-1 h-9 rounded-lg border border-zinc-800 text-zinc-400 text-[11px] uppercase tracking-wider hover:border-zinc-700 disabled:opacity-30"
              >
                + Add step
              </button>
              {!planRunning ? (
                <button
                  onClick={startPlan}
                  disabled={plan.length === 0}
                  className="flex-1 h-9 rounded-lg bg-[#00ffcc] text-zinc-950 text-[11px] uppercase tracking-wider font-medium hover:bg-[#00ffcc]/85 disabled:opacity-30"
                >
                  ▶ Start plan
                </button>
              ) : (
                <button
                  onClick={stopPlan}
                  className="flex-1 h-9 rounded-lg border border-rose-500/40 text-rose-400 text-[11px] uppercase tracking-wider hover:bg-rose-500/10"
                >
                  ■ Stop
                </button>
              )}
            </div>
          </section>
        )}

        {/* Hidden bulk-import input */}
        <input
          ref={bulkInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) handleBulkFiles(files);
          }}
        />

        {/* Hidden player audio elements (two decks routed through bus.playerPair).
            Both fire events; we only act on those from the currently active deck. */}
        {(["a", "b"] as const).map((deck) => (
          <audio
            key={deck}
            ref={deck === "a" ? playerAudioRefA : playerAudioRefB}
            preload="metadata"
            className="hidden"
            onPlay={() => {
              if (activeDeck === deck) setPlayerPlaying(true);
            }}
            onPause={() => {
              if (activeDeck === deck) setPlayerPlaying(false);
            }}
            onLoadedMetadata={(e) => {
              if (activeDeck === deck) setPlayerDuration(e.currentTarget.duration || 0);
            }}
            onTimeUpdate={(e) => {
              if (activeDeck !== deck) return;
              const t = e.currentTarget.currentTime || 0;
              setPlayerPosition(t);
              // Auto-crossfade trigger: when nearing the end, kick off the
              // next track into the inactive deck.
              if (
                crossfadeEnabled &&
                queuePos != null &&
                queue.length > queuePos + 1 &&
                repeatMode !== "one" &&
                crossfadeTriggeredRef.current !== queuePos
              ) {
                const dur = e.currentTarget.duration || 0;
                if (dur > CROSSFADE_SEC * 2 && t > dur - CROSSFADE_SEC) {
                  crossfadeTriggeredRef.current = queuePos;
                  playerNext(true);
                }
              }
            }}
            onEnded={() => {
              if (activeDeck !== deck) return;
              if (repeatMode === "one") {
                const el = activeAudioEl();
                if (el) {
                  el.currentTime = 0;
                  el.play().catch(() => {});
                }
                return;
              }
              // If the crossfade already fired for this position, the next
              // track is already playing on the other deck.
              if (crossfadeTriggeredRef.current === queuePos) return;
              playerNext();
            }}
          />
        ))}

        {/* Hidden file inputs + audio elements for each slot */}
        {slots.map((sl) => (
          <div key={sl.id}>
            <input
              ref={(el) => {
                fileRefs.current[sl.id] = el;
              }}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importSong(sl.id, file);
                e.target.value = "";
              }}
            />
            <audio
              ref={(el) => {
                audioRefs.current[sl.id] = el;
                if (el) {
                  // Bind this element to the DJ bus once. The graph survives
                  // src changes - we never have to rebind on a new song.
                  try { djBus.ensureDeck(sl.id, el); } catch { /* iOS may delay */ }
                }
              }}
              src={sl.url ?? undefined}
              preload="metadata"
              onLoadedMetadata={(e) =>
                updateSlot(sl.id, { duration: e.currentTarget.duration || 0 })
              }
              onTimeUpdate={(e) =>
                updateSlot(sl.id, {
                  position: e.currentTarget.currentTime || 0,
                })
              }
              onEnded={() => {
                if (!sl.loop) updateSlot(sl.id, { position: 0 });
              }}
              className="hidden"
            />
          </div>
        ))}

        {/* Bottom transport (Studio + Timer) */}
        {(appView === "studio" || appView === "timer") && (
        <section className="mt-2 space-y-4 border-t border-zinc-900 pt-5">
          <SelectBox
            label="Output Mode"
            info={() => setModal(ACADEMY.mode)}
            value={state.mode}
            options={[
              { value: "binaural", label: "Headphones (binaural)" },
              { value: "isochronic", label: "Speakers (isochronic)" },
              { value: "off", label: "Off (drone only)" },
            ]}
            onChange={(v) => update({ mode: v as EntrainmentMode })}
          />

          <div>
            <div className="flex justify-between items-baseline mb-2">
              <label className="text-xs uppercase tracking-wider text-zinc-500">
                Volume
              </label>
              <span className="text-xs text-zinc-500 font-mono">
                {Math.round(state.volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={state.volume}
              onChange={(e) => update({ volume: parseFloat(e.target.value) })}
              className="w-full"
            />
            <p className="text-[11px] text-zinc-600 mt-1">
              Keep this around 30-50%. Entrainment works better quiet.
            </p>
          </div>

          {tab !== "timer" && (
            <div className="flex items-center gap-3">
              <button
                onClick={playing ? handleStop : handleStart}
                className={`flex-1 h-12 rounded-xl font-medium transition-colors ${
                  playing
                    ? "bg-zinc-200 text-zinc-950 hover:bg-zinc-300"
                    : "bg-[#00ffcc] text-zinc-950 hover:bg-[#00ffcc]/85"
                }`}
              >
                {playing ? "Stop" : "Play"}
              </button>
              <div className="text-2xl font-mono text-zinc-400 w-20 text-right tabular-nums">
                {formatTime(elapsed)}
              </div>
            </div>
          )}
        </section>
        )}

        {/* Export section (Studio only) */}
        {appView === "studio" && (
          <section className="mt-6 p-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50">
            <div className="flex justify-between items-baseline mb-2">
              <label className="text-xs uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                Export .WAV
                <InfoButton onClick={() => setModal(ACADEMY.export)} />
              </label>
              <span className="text-xs text-zinc-500 font-mono">
                {exportMinutes} min
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={exportMinutes}
              onChange={(e) => setExportMinutes(parseInt(e.target.value))}
              className="w-full mb-3"
            />
            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full h-10 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900 text-sm uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? `Rendering ${exportProgress}%` : "Render & Download"}
            </button>
            {exportMinutes > 30 && (
              <p className="text-[11px] text-amber-400/70 mt-2">
                ⚠ Long exports use a lot of memory (~10 MB per minute). May take a moment.
              </p>
            )}
          </section>
        )}

        {appView === "studio" && (
          <footer className="mt-10 text-[11px] text-zinc-600 leading-relaxed border-t border-zinc-900 pt-5">
            Layer this UNDER your YouTube Music. Tap any [?] to see what each control
            actually does and what's evidence-backed vs vibes.
          </footer>
        )}
      </div>

      {/* Sticky NowPlaying widget (fixed above bottom tab nav) */}
      {queuePos != null && queue[queuePos] && (
        <div className="fixed bottom-14 left-0 right-0 z-20 px-3 pb-2">
          <div className="mx-auto max-w-md md:max-w-2xl">
            <StickyNowPlaying
              entry={queue[queuePos]}
              playing={playerPlaying}
              position={playerPosition}
              duration={playerDuration || queue[queuePos].durationSec || 0}
              volume={playerVolume}
              queueIndex={queuePos}
              queueLength={queue.length}
              shuffle={shuffle}
              repeatMode={repeatMode}
              crossfade={crossfadeEnabled}
              onToggle={togglePlayerPlayPause}
              onPrev={playerPrev}
              onNext={() => playerNext()}
              onSeek={(t) => {
                const el = activeAudioEl();
                if (el) {
                  el.currentTime = t;
                  setPlayerPosition(t);
                }
              }}
              onVolume={setPlayerVolume}
              onShuffle={() => setShuffle((v) => !v)}
              onRepeat={() =>
                setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"))
              }
              onCrossfade={() => setCrossfadeEnabled((v) => !v)}
              onClose={() => {
                if (playerAudioRefA.current) playerAudioRefA.current.pause();
                if (playerAudioRefB.current) playerAudioRefB.current.pause();
                setQueuePos(null);
                setShuffleHistory([]);
                crossfadeTriggeredRef.current = null;
                if (playerObjectUrlA) {
                  URL.revokeObjectURL(playerObjectUrlA);
                  setPlayerObjectUrlA(null);
                }
                if (playerObjectUrlB) {
                  URL.revokeObjectURL(playerObjectUrlB);
                  setPlayerObjectUrlB(null);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Bottom tab nav (fixed) */}
      <nav className="fixed bottom-0 left-0 right-0 h-14 bg-black/90 backdrop-blur-md border-t border-zinc-900 z-20">
        <div className="mx-auto max-w-md md:max-w-2xl h-full grid grid-cols-3">
          {(
            [
              { id: "music", label: "Music", icon: "♪" },
              { id: "studio", label: "Studio", icon: "⛯" },
              { id: "timer", label: "Timer", icon: "⏱" },
            ] as { id: AppView; label: string; icon: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setAppView(t.id)}
              aria-label={t.label}
              aria-pressed={appView === t.id}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                appView === t.id ? "text-[#00ffcc]" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="text-lg leading-none" aria-hidden="true">{t.icon}</span>
              <span className="text-[10px] uppercase tracking-widest">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {modal && <AcademyModal entry={modal} onClose={() => setModal(null)} />}
      {deepDive && <DeepDiveModal dive={deepDive} onClose={() => setDeepDive(null)} />}
      {libraryOpen && (
        <LibraryModal
          entries={library}
          slots={slots}
          importing={importing}
          onClose={() => setLibraryOpen(false)}
          onLoad={handleLoadFromLibrary}
          onDelete={handleDeleteFromLibrary}
          onPlay={(_e, idx) => {
            playEntries(library, idx);
            setLibraryOpen(false);
          }}
          onPlayMany={(entries) => {
            playEntries(entries, 0);
            setLibraryOpen(false);
          }}
          onAddToPlaylist={(e) => setAddToPlaylistTarget(e)}
          onEdit={async (entry, patch) => {
            // Look up the full local entry (with _cloud) by id.
            const full = library.find((e) => e.id === entry.id);
            if (!full || full.source !== "cloud" || !full._cloud) return;
            const updated = await updateTrackMetadata(full._cloud.id, patch);
            setLibrary((cur) =>
              cur.map((e) => (e.id === entry.id ? cloudToEntry(updated) : e)),
            );
          }}
          onBulkImport={() => bulkInputRef.current?.click()}
        />
      )}
      {playlistsOpen && (
        <PlaylistsModal
          playlists={playlists}
          onClose={() => setPlaylistsOpen(false)}
          onCreate={handleCreatePlaylist}
          onDelete={handleDeletePlaylist}
          onPlay={handlePlayPlaylist}
        />
      )}
      {addToPlaylistTarget && (
        <PickPlaylistModal
          playlists={playlists}
          track={addToPlaylistTarget}
          onClose={() => setAddToPlaylistTarget(null)}
          onPick={async (playlistId) => {
            const t = addToPlaylistTarget;
            if (t?._cloud) {
              await handleAddToPlaylist(playlistId, t._cloud.id);
            }
            setAddToPlaylistTarget(null);
          }}
          onCreate={async (name) => {
            const p = await handleCreatePlaylist(name);
            return p?.id ?? null;
          }}
        />
      )}
      {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}
      {mixesOpen && (
        <MyMixesModal
          mixes={cloudMixes}
          onClose={() => setMixesOpen(false)}
          onDelete={handleDeleteCloudMix}
        />
      )}
    </div>
  );
}

// =====================================================================
// Components
// =====================================================================

