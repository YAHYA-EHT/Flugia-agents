"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApi } from "@/lib/aria";

export type VoiceState = "idle" | "recording" | "transcribing";

export function useVoiceRecorder(onTranscript: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [duration, setDuration] = useState(0);
  const [supported, setSupported] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return; // permission denied — fail silently
    }
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      setState("transcribing");
      try {
        const text = await getApi().transcribe(blob);
        if (text.trim()) onTranscript(text.trim());
      } catch {
        /* silent on STT error */
      } finally {
        setState("idle");
        setDuration(0);
      }
    };
    recorder.start(100); // collect data every 100 ms
    recorderRef.current = recorder;
    setState("recording");
    setDuration(0);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }, [state, onTranscript]);

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
  }, []);

  // Clean up on unmount
  useEffect(() => () => { stop(); }, [stop]);

  return { state, duration, supported, start, stop };
}
