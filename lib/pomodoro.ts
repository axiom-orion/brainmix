export interface PomodoroPreset {
  id: string;
  name: string;
  focusMin: number;
  restMin: number;
  cycles: number;
  blurb: string;
}

export const POMODORO_PRESETS: PomodoroPreset[] = [
  {
    id: "classic",
    name: "Classic Pomodoro",
    focusMin: 25,
    restMin: 5,
    cycles: 4,
    blurb: "25 work / 5 rest x 4. Total ~2 hours. Best for inbox, admin, study.",
  },
  {
    id: "huberman",
    name: "Huberman Ultradian",
    focusMin: 90,
    restMin: 20,
    cycles: 1,
    blurb: "90 deep work / 20 decompress. The peak neuroplasticity window. Best for coding, writing, hard skills.",
  },
  {
    id: "adhd",
    name: "ADHD Sprint",
    focusMin: 15,
    restMin: 3,
    cycles: 6,
    blurb: "15 / 3 x 6. Short bursts crush executive-function paralysis. Best for hard-to-start days.",
  },
  {
    id: "duo",
    name: "Double Block",
    focusMin: 50,
    restMin: 10,
    cycles: 2,
    blurb: "50 / 10 x 2. Solid middle-ground for meetings + work, ~2 hours total.",
  },
];
