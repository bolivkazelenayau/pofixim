'use client';

import { useEffect, useRef, useState } from 'react';
import { Gauge, Pause, Play, RotateCcw } from 'lucide-react';
import type { DictationExercise, SubmittedAnswer } from '../schemas';

type Props = {
  exercise: DictationExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
};

const WAVEFORM_BAR_COUNT = 96;
const FALLBACK_WAVEFORM = Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => {
  const phase = index / WAVEFORM_BAR_COUNT;
  return 0.25 + Math.abs(Math.sin(phase * Math.PI * 5)) * 0.55;
});
const SCRUB_FADE_OUT_MS = 12;
const SCRUB_FADE_IN_MS = 28;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function waveformBarHeight(value: number) {
  return `${Math.max(4, value * 30).toFixed(3)}px`;
}

function getMediaDuration(audio: HTMLAudioElement | null, fallback = 0) {
  if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
    return audio.duration;
  }
  if (audio?.seekable.length) {
    const seekableEnd = audio.seekable.end(audio.seekable.length - 1);
    if (Number.isFinite(seekableEnd) && seekableEnd > 0) {
      return seekableEnd;
    }
  }
  return fallback;
}

async function buildWaveform(audioSrc: string, barCount: number) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;

  const response = await fetch(audioSrc);
  const bytes = await response.arrayBuffer();
  const context = new AudioContextCtor();
  try {
    const buffer = await context.decodeAudioData(bytes.slice(0));
    const data = buffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(data.length / barCount));
    const peaks: number[] = [];

    for (let i = 0; i < barCount; i += 1) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, data.length);
      let sum = 0;
      for (let j = start; j < end; j += 1) {
        sum += data[j] * data[j];
      }
      peaks.push(Math.sqrt(sum / Math.max(1, end - start)));
    }

    const max = Math.max(...peaks, 0.001);
    return peaks.map((peak) => Math.max(0.08, Math.min(1, peak / max)));
  } finally {
    void context.close();
  }
}

export default function DictationCard({ exercise }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef(false);
  const wasMutedBeforeScrubRef = useRef(false);
  const volumeBeforeScrubRef = useRef(1);
  const fadeFrameRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [decodedWaveform, setDecodedWaveform] = useState<number[] | null>(
    exercise.payload.waveform ?? null,
  );

  const rates = exercise.payload.playbackRates?.length
    ? exercise.payload.playbackRates
    : [0.75, 1, 1.25, 1.5];
  const waveform = decodedWaveform ?? exercise.payload.waveform ?? FALLBACK_WAVEFORM;
  const displayDuration = getMediaDuration(audioRef.current, duration);
  const progress = displayDuration > 0 ? currentTime / displayDuration : 0;

  useEffect(() => {
    let cancelled = false;
    if (exercise.payload.waveform?.length) return;

    buildWaveform(exercise.payload.audioSrc, WAVEFORM_BAR_COUNT)
      .then((peaks) => {
        if (!cancelled && peaks?.length) {
          setDecodedWaveform(peaks);
        }
      })
      .catch(() => {
        if (!cancelled) setDecodedWaveform(null);
      });

    return () => {
      cancelled = true;
    };
  }, [exercise.payload.audioSrc, exercise.payload.waveform]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, [rate]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function restart() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
    void audio.play();
  }

  function seekAtClientX(clientX: number) {
    const audio = audioRef.current;
    const box = waveformRef.current?.getBoundingClientRect();
    const seekDuration = getMediaDuration(audio, duration);
    if (!audio || !box || seekDuration <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    audio.currentTime = ratio * seekDuration;
    setCurrentTime(audio.currentTime);
    if (duration <= 0) setDuration(seekDuration);
  }

  function cancelVolumeFade() {
    if (fadeFrameRef.current != null) {
      window.cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
  }

  function fadeVolume(audio: HTMLAudioElement, to: number, durationMs: number) {
    cancelVolumeFade();
    const from = clampVolume(audio.volume);
    const target = clampVolume(to);
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      audio.volume = clampVolume(from + (target - from) * progress);
      if (progress < 1) {
        fadeFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        fadeFrameRef.current = null;
      }
    };

    fadeFrameRef.current = window.requestAnimationFrame(tick);
  }

  function beginScrubMute(audio: HTMLAudioElement) {
    wasMutedBeforeScrubRef.current = audio.muted;
    volumeBeforeScrubRef.current = clampVolume(audio.volume);
    audio.muted = false;
    fadeVolume(audio, 0, SCRUB_FADE_OUT_MS);
    window.setTimeout(() => {
      if (isScrubbingRef.current) {
        audio.muted = true;
      }
    }, SCRUB_FADE_OUT_MS);
  }

  function endScrubMute(audio: HTMLAudioElement) {
    cancelVolumeFade();
    audio.volume = 0;
    audio.muted = wasMutedBeforeScrubRef.current;
    if (!wasMutedBeforeScrubRef.current) {
      fadeVolume(audio, clampVolume(volumeBeforeScrubRef.current), SCRUB_FADE_IN_MS);
    } else {
      audio.volume = clampVolume(volumeBeforeScrubRef.current);
    }
  }

  return (
    <div className="mb-5 mt-2 rounded-2xl border border-stroke bg-surface-strong p-3 shadow-sm">
      <audio
        ref={audioRef}
        src={exercise.payload.audioSrc}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(getMediaDuration(event.currentTarget))}
        onDurationChange={(event) => setDuration(getMediaDuration(event.currentTarget))}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
          setDuration((current) => getMediaDuration(event.currentTarget, current));
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="rounded-2xl border border-stroke bg-surface px-3 py-3 text-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlayback}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition hover:bg-primary-strong"
            title={isPlaying ? 'Пауза' : 'Слушать'}
          >
            {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
          </button>

          <div className="min-w-0 flex-1">
            <div
              ref={waveformRef}
              role="slider"
              aria-label="Позиция аудио"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              onPointerDown={(event) => {
                const audio = audioRef.current;
                isScrubbingRef.current = true;
                if (audio) {
                  beginScrubMute(audio);
                }
                event.currentTarget.setPointerCapture(event.pointerId);
                seekAtClientX(event.clientX);
              }}
              onPointerMove={(event) => {
                if (isScrubbingRef.current) {
                  seekAtClientX(event.clientX);
                }
              }}
              onPointerUp={(event) => {
                const audio = audioRef.current;
                isScrubbingRef.current = false;
                if (audio) {
                  endScrubMute(audio);
                }
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={(event) => {
                const audio = audioRef.current;
                isScrubbingRef.current = false;
                if (audio) {
                  endScrubMute(audio);
                }
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onKeyDown={(event) => {
                const audio = audioRef.current;
                const seekDuration = getMediaDuration(audio, duration);
                if (!audio || seekDuration <= 0) return;
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  const delta = event.key === 'ArrowLeft' ? -3 : 3;
                  audio.currentTime = Math.min(seekDuration, Math.max(0, audio.currentTime + delta));
                  if (duration <= 0) setDuration(seekDuration);
                }
              }}
              className="group flex h-10 cursor-ew-resize touch-none select-none items-center gap-px overflow-hidden rounded-lg px-1 outline-none focus:ring-2 focus:ring-primary/30 sm:gap-px md:gap-[3px]"
            >
              {waveform.map((height, index) => {
                const active = index / waveform.length <= progress;
                return (
                  <span
                    key={`${index}-${height}`}
                    className={`${index % 2 === 1 ? 'hidden md:block' : 'block'} w-px min-w-px flex-1 rounded-full transition ${
                      active ? 'bg-primary' : 'bg-foreground/18'
                    }`}
                    style={{ height: waveformBarHeight(height) }}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs font-medium text-foreground/55">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(displayDuration)}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stroke bg-surface-strong px-2.5 py-1.5 text-xs font-bold text-foreground/80 transition hover:bg-stroke"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Заново
          </button>
          <div className="inline-flex items-center gap-1 rounded-lg border border-stroke bg-surface-strong px-1.5 py-1">
            <Gauge className="h-3.5 w-3.5 text-foreground/55" />
            {rates.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRate(item)}
                className={`rounded-md px-2 py-1 text-xs font-black transition ${
                  rate === item
                    ? 'bg-primary text-white'
                    : 'text-foreground/80 hover:bg-stroke'
                }`}
              >
                {item}x
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 px-1 text-xs font-medium text-foreground/55">
        Ответ отправьте обычным сообщением внизу.
      </p>
    </div>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
