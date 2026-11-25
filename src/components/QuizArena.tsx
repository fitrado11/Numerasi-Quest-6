import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  EyeOff,
  HelpCircle,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { MINUTES_PER_QUESTION } from '../data/questions';
import { AttemptRecord, Question, ViolationLog, WorldChapter } from '../types/quiz';
import { AiScaffoldPanel } from './AiScaffoldPanel';

interface QuizArenaProps {
  studentId: string;
  studentName: string;
  chapter: WorldChapter;
  questions: Question[];
  attempts: Record<string, AttemptRecord>;
  violations: ViolationLog[];
  onRecordAttempt: (attempt: AttemptRecord) => void;
  onRecordViolation: (violation: Omit<ViolationLog, 'id' | 'timestamp'>) => void;
  onExitToMap: () => void;
  onNextWorld?: () => void;
}

interface ShuffledOption {
  text: string;
  originalIndex: number;
}

const MIN_READ_SECONDS = 6;
const SECONDS_PER_QUESTION = MINUTES_PER_QUESTION * 60; // 3 menit = 180 detik per soal

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function deterministicShuffle(options: string[], seedStr: string): ShuffledOption[] {
  const mapped = options.map((text, idx) => ({ text, originalIndex: idx }));
  let hash = 0;
  for (let i = 0; i < seedStr.length; i += 1) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) % 2147483647;
  }
  for (let i = mapped.length - 1; i > 0; i -= 1) {
    hash = (hash * 16807) % 2147483647;
    const j = hash % (i + 1);
    const temp = mapped[i];
    mapped[i] = mapped[j];
    mapped[j] = temp;
  }
  return mapped;
}

export const QuizArena: React.FC<QuizArenaProps> = ({
  studentId,
  studentName,
  chapter,
  questions,
  attempts,
  violations,
  onRecordAttempt,
  onRecordViolation,
  onExitToMap,
  onNextWorld,
}) => {
  const totalSessionSeconds = questions.length * SECONDS_PER_QUESTION;
  const timerStorageKey = `tka_session_timer_${studentId || 'anon'}_${chapter.id}`;
  const allQuestionsAnswered =
    questions.length > 0 && questions.every((q) => Boolean(attempts[q.id]));

  const initialQuestionIndex = useMemo(() => {
    const idx = questions.findIndex((q) => !attempts[q.id]);
    return idx >= 0 ? idx : 0;
  }, [chapter.id]);

  const [currentIndex, setCurrentIndex] = useState(initialQuestionIndex);
  const [roundComplete, setRoundComplete] = useState(false);

  // Accumulated session timer (3 menit × jumlah soal) + per-question 3-minute pacing timer
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState<number>(totalSessionSeconds);
  const [sessionTimedOut, setSessionTimedOut] = useState(false);
  const [questionSecondsLeft, setQuestionSecondsLeft] = useState<number>(SECONDS_PER_QUESTION);

  // Per-session helper budget (1x each per paket)
  const [hintPowerUpUsedInRound, setHintPowerUpUsedInRound] = useState(false);
  const [fiftyFiftyUsedInRound, setFiftyFiftyUsedInRound] = useState(false);

  // Per-question states
  const [hintShownForQuestionId, setHintShownForQuestionId] = useState<string | null>(null);
  const [eliminatedOriginalIndices, setEliminatedOriginalIndices] = useState<number[]>([]);
  const [usedAiOnCurrent, setUsedAiOnCurrent] = useState(false);
  const [selectedDisplayIdx, setSelectedDisplayIdx] = useState<number | null>(null);
  const [submittedAttempt, setSubmittedAttempt] = useState<AttemptRecord | null>(null);

  // Anti-random-guessing read-first timer
  const [readCountdown, setReadCountdown] = useState<number>(MIN_READ_SECONDS);

  // Anti-screenshot & anti-cheat privacy curtain & fullscreen focus gate (no permanent lockout)
  const [hasEnteredFocusGate, setHasEnteredFocusGate] = useState<boolean>(
    () =>
      allQuestionsAnswered ||
      (typeof document !== 'undefined' && Boolean(document.fullscreenElement))
  );
  const [focusModeType, setFocusModeType] = useState<'native' | 'window'>(() =>
    typeof document !== 'undefined' && document.fullscreenElement ? 'native' : 'native'
  );
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [isPrivacyCurtainOpen, setIsPrivacyCurtainOpen] = useState(false);
  const [curtainReason, setCurtainReason] = useState<string>(
    'Layar soal disembunyikan sementara karena fokus berpindah.'
  );
  const [warningToast, setWarningToast] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  );

  const lastViolationByTypeRef = useRef<Partial<Record<ViolationLog['type'], number>>>({});
  const wasNativeFullscreenRef = useRef<boolean>(
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  );
  const isUnmountingRef = useRef<boolean>(false);

  useEffect(() => {
    isUnmountingRef.current = false;
    return () => {
      isUnmountingRef.current = true;
    };
  }, []);

  useEffect(() => {
    const firstOpen = questions.findIndex((q) => !attempts[q.id]);
    const isAlreadyDone = questions.length > 0 && questions.every((q) => Boolean(attempts[q.id]));
    let restoredSeconds = totalSessionSeconds;
    let timedOutOnLoad = false;

    if (!isAlreadyDone) {
      try {
        const raw = localStorage.getItem(timerStorageKey);
        if (raw !== null) {
          const parsed = Number.parseInt(raw, 10);
          if (Number.isFinite(parsed) && parsed >= 0 && parsed <= totalSessionSeconds) {
            restoredSeconds = parsed;
            if (parsed === 0) {
              timedOutOnLoad = true;
            }
          }
        }
      } catch {
        // Ignore storage errors
      }
    }

    const currentlyFullscreen =
      typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false;

    setCurrentIndex(firstOpen >= 0 ? firstOpen : 0);
    setSessionSecondsLeft(restoredSeconds);
    setSessionTimedOut(timedOutOnLoad);
    setRoundComplete(timedOutOnLoad);
    setQuestionSecondsLeft(SECONDS_PER_QUESTION);
    setHintPowerUpUsedInRound(false);
    setFiftyFiftyUsedInRound(false);
    setHintShownForQuestionId(null);
    setEliminatedOriginalIndices([]);
    setUsedAiOnCurrent(false);
    setSelectedDisplayIdx(null);
    setSubmittedAttempt(null);
    setWarningToast(null);
    setIsPrivacyCurtainOpen(false);
    setFullscreenError(null);
    setIsFullscreen(currentlyFullscreen);
    wasNativeFullscreenRef.current = currentlyFullscreen;
    setHasEnteredFocusGate(isAlreadyDone || currentlyFullscreen);
    if (currentlyFullscreen) {
      setFocusModeType('native');
    }
  }, [chapter.id, timerStorageKey, totalSessionSeconds]);

  const currentQuestion = questions[currentIndex];

  useEffect(() => {
    if (!currentQuestion) return;
    const existing = attempts[currentQuestion.id];
    setSelectedDisplayIdx(null);
    setSubmittedAttempt(existing ?? null);
    setEliminatedOriginalIndices([]);
    setUsedAiOnCurrent(false);
    setReadCountdown(existing ? 0 : MIN_READ_SECONDS);
    setQuestionSecondsLeft(existing ? 0 : SECONDS_PER_QUESTION);
  }, [currentQuestion?.id]);

  // Countdown to prevent instant blind guessing on unanswered questions (pauses until Focus Gate entered & curtain closed)
  useEffect(() => {
    if (
      !hasEnteredFocusGate ||
      isPrivacyCurtainOpen ||
      submittedAttempt ||
      roundComplete ||
      sessionTimedOut ||
      readCountdown <= 0
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setReadCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [
    hasEnteredFocusGate,
    isPrivacyCurtainOpen,
    submittedAttempt,
    roundComplete,
    sessionTimedOut,
    readCountdown,
    currentQuestion?.id,
  ]);

  // Accumulated session timer (3 menit × jumlah soal) & per-question 3-minute timer
  useEffect(() => {
    if (
      !hasEnteredFocusGate ||
      roundComplete ||
      sessionTimedOut ||
      allQuestionsAnswered ||
      questions.length === 0
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setSessionSecondsLeft((prev) => {
        const next = prev > 0 ? prev - 1 : 0;
        try {
          localStorage.setItem(timerStorageKey, String(next));
        } catch {
          // Ignore storage errors
        }
        if (next === 0) {
          setSessionTimedOut(true);
          setRoundComplete(true);
        }
        return next;
      });

      if (!submittedAttempt) {
        setQuestionSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    hasEnteredFocusGate,
    roundComplete,
    sessionTimedOut,
    allQuestionsAnswered,
    questions.length,
    submittedAttempt,
    timerStorageKey,
  ]);

  const handleRestartSessionTimer = () => {
    try {
      localStorage.setItem(timerStorageKey, String(totalSessionSeconds));
    } catch {
      // Ignore storage errors
    }
    const firstOpen = questions.findIndex((q) => !attempts[q.id]);
    setCurrentIndex(firstOpen >= 0 ? firstOpen : 0);
    setSessionSecondsLeft(totalSessionSeconds);
    setQuestionSecondsLeft(SECONDS_PER_QUESTION);
    setSessionTimedOut(false);
    setRoundComplete(false);
  };

  const shuffledOptions = useMemo(() => {
    if (!currentQuestion) return [];
    return deterministicShuffle(currentQuestion.options, `${currentQuestion.id}-v1`);
  }, [currentQuestion]);

  // Anti-screenshot, privacy-curtain, minimize/tab-switch & fullscreen-exit guards
  useEffect(() => {
    if (!hasEnteredFocusGate || roundComplete || allQuestionsAnswered || !currentQuestion) return;

    const triggerViolation = (type: ViolationLog['type'], detail: string) => {
      const now = Date.now();
      const lastForType = lastViolationByTypeRef.current[type] ?? 0;
      if (now - lastForType < 1500) return;
      lastViolationByTypeRef.current[type] = now;

      onRecordViolation({
        type,
        detail,
        chapterTitle: chapter.title,
        questionLabel: currentQuestion.numberLabel,
      });
      setWarningToast(detail);
    };

    const showCurtain = (reason: string) => {
      setCurtainReason(reason);
      setIsPrivacyCurtainOpen(true);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        showCurtain(
          'Jendela latihan diperkecil (minimize) atau kamu berpindah tab. Layar soal disembunyikan.'
        );
        triggerViolation(
          'tab-switch',
          'Siswa mengganti tab, membuka aplikasi lain, atau memperkecil (minimize) jendela latihan.'
        );
      } else if (document.hasFocus() && (focusModeType !== 'native' || document.fullscreenElement)) {
        setIsPrivacyCurtainOpen(false);
      }
    };

    let blurTimer: number | null = null;
    const handleWindowBlur = () => {
      showCurtain('Fokus layar berpindah keluar. Klik kembali ke layar latihan untuk melanjutkan.');
      blurTimer = window.setTimeout(() => {
        if (!document.hasFocus() && !isUnmountingRef.current) {
          triggerViolation(
            'window-blur',
            'Fokus layar berpindah keluar dari jendela latihan (minimize, pindah aplikasi, atau split-screen).'
          );
        }
      }, 250);
    };

    const handleWindowFocus = () => {
      if (blurTimer !== null) {
        window.clearTimeout(blurTimer);
        blurTimer = null;
      }
      if (!document.hidden && (focusModeType !== 'native' || document.fullscreenElement)) {
        setIsPrivacyCurtainOpen(false);
      }
    };

    const handleCopyOrCut = (e: ClipboardEvent) => {
      e.preventDefault();
      triggerViolation('copy-attempt', 'Menyalin teks soal tidak diperbolehkan selama kuis.');
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      triggerViolation('copy-attempt', 'Menempel teks dari luar tidak diperbolehkan.');
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      triggerViolation('context-menu', 'Klik kanan dinonaktifkan selama kuis berlangsung.');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingInInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      // Screenshot key combinations (Windows Snipping Tool, macOS Cmd+Shift+3/4/5, PrintScreen)
      if (
        e.key === 'PrintScreen' ||
        (mod && e.shiftKey && ['3', '4', '5', 's'].includes(key))
      ) {
        e.preventDefault();
        try {
          navigator.clipboard?.writeText?.('');
        } catch {
          // Ignore clipboard write refusal
        }
        showCurtain('Tangkapan layar (screenshot) tidak diperbolehkan selama kuis.');
        triggerViolation(
          'screenshot-attempt',
          'Terdeteksi percobaan mengambil screenshot layar soal.'
        );
        return;
      }

      if (mod && ['c', 'v', 'x', 'u', 's', 'p'].includes(key)) {
        e.preventDefault();
        triggerViolation(
          'shortcut-blocked',
          `Tombol pintas ${e.ctrlKey ? 'Ctrl' : 'Cmd'}+${key.toUpperCase()} dinonaktifkan saat kuis.`
        );
        return;
      }

      if (mod && key === 'a' && !isTypingInInput) {
        e.preventDefault();
        triggerViolation('shortcut-blocked', 'Pilih semua teks pada soal dinonaktifkan.');
        return;
      }

      if (e.key === 'F12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(key))) {
        e.preventDefault();
        triggerViolation('shortcut-blocked', 'Akses Developer Tools dinonaktifkan saat kuis.');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        try {
          navigator.clipboard?.writeText?.('');
        } catch {
          // Ignore clipboard write refusal
        }
        showCurtain('Tangkapan layar (screenshot) tidak diperbolehkan selama kuis.');
        triggerViolation(
          'screenshot-attempt',
          'Terdeteksi tombol PrintScreen ditekan saat soal tampil.'
        );
      }
    };

    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (active) {
        wasNativeFullscreenRef.current = true;
        if (!document.hidden) {
          setIsPrivacyCurtainOpen(false);
        }
      } else if (wasNativeFullscreenRef.current && !isUnmountingRef.current) {
        showCurtain(
          'Kamu keluar dari Mode Layar Penuh. Aktifkan kembali Layar Penuh untuk melanjutkan soal.'
        );
        triggerViolation(
          'fullscreen-exit',
          'Siswa keluar dari Layar Penuh (Fullscreen) atau memperkecil layar di tengah sesi.'
        );
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('copy', handleCopyOrCut);
    document.addEventListener('cut', handleCopyOrCut);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      if (blurTimer !== null) window.clearTimeout(blurTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('copy', handleCopyOrCut);
      document.removeEventListener('cut', handleCopyOrCut);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [
    hasEnteredFocusGate,
    focusModeType,
    chapter.title,
    currentQuestion?.id,
    roundComplete,
    allQuestionsAnswered,
    onRecordViolation,
  ]);

  const enterFocusAndFullscreen = async () => {
    setFullscreenError(null);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      wasNativeFullscreenRef.current = Boolean(document.fullscreenElement);
      setIsFullscreen(Boolean(document.fullscreenElement));
      setFocusModeType('native');
      setHasEnteredFocusGate(true);
      setIsPrivacyCurtainOpen(false);
    } catch {
      setFullscreenError(
        'Browser atau jendela pratinjau membatasi mode layar penuh otomatis. Kamu tetap bisa masuk dengan Mode Fokus Jendela (perpindahan tab & minimize tetap tercatat ke database guru).'
      );
    }
  };

  const enterWindowFocusFallback = () => {
    setFullscreenError(null);
    setFocusModeType('window');
    wasNativeFullscreenRef.current = false;
    setHasEnteredFocusGate(true);
    setIsPrivacyCurtainOpen(false);
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        wasNativeFullscreenRef.current = true;
        setIsFullscreen(true);
        setFocusModeType('native');
        setIsPrivacyCurtainOpen(false);
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setWarningToast('Browser membatasi mode layar penuh otomatis di jendela ini.');
    }
  };

  if (!currentQuestion) {
    return (
      <div className="mx-auto max-w-[900px] px-6 py-12 text-center">
        <p className="text-sm text-slate-600">Tidak ada soal pada paket ini.</p>
        <button
          type="button"
          onClick={onExitToMap}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Kembali ke Daftar Numerasi
        </button>
      </div>
    );
  }

  const handleUseHintPowerUp = () => {
    if (hintPowerUpUsedInRound || submittedAttempt) return;
    setHintPowerUpUsedInRound(true);
    setHintShownForQuestionId(currentQuestion.id);
  };

  const handleUseFiftyFifty = () => {
    if (fiftyFiftyUsedInRound || submittedAttempt) return;
    const wrongIndices = shuffledOptions
      .map((opt) => opt.originalIndex)
      .filter((origIdx) => origIdx !== currentQuestion.correctIndex);

    setEliminatedOriginalIndices(wrongIndices.slice(0, 2));
    setFiftyFiftyUsedInRound(true);

    if (
      selectedDisplayIdx !== null &&
      wrongIndices.slice(0, 2).includes(shuffledOptions[selectedDisplayIdx].originalIndex)
    ) {
      setSelectedDisplayIdx(null);
    }
  };

  const handleSubmitAnswer = () => {
    if (selectedDisplayIdx === null || submittedAttempt || readCountdown > 0) {
      return;
    }
    const chosen = shuffledOptions[selectedDisplayIdx];
    const isCorrect = chosen.originalIndex === currentQuestion.correctIndex;
    const record: AttemptRecord = {
      questionId: currentQuestion.id,
      chapterId: chapter.id,
      selectedIndex: chosen.originalIndex,
      isCorrect,
      earnedXp: isCorrect ? currentQuestion.xp : 0,
      usedHintPowerUp: hintShownForQuestionId === currentQuestion.id,
      usedFiftyFiftyPowerUp: eliminatedOriginalIndices.length > 0,
      usedAiScaffold: usedAiOnCurrent,
      timestamp: new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
    setSubmittedAttempt(record);
    onRecordAttempt(record);
  };

  const handleNextQuestion = () => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      setWarningToast(null);
    } else {
      setRoundComplete(true);
    }
  };

  // End-of-session Summary Screen
  if (roundComplete) {
    const roundAttempts = questions.map((q) => attempts[q.id]).filter(Boolean);
    const roundScore = roundAttempts.reduce((sum, a) => sum + a.earnedXp, 0);
    const roundMaxScore = questions.reduce((sum, q) => sum + q.xp, 0);
    const roundCorrect = roundAttempts.filter((a) => a.isCorrect).length;
    const accuracy = Math.round((roundCorrect / questions.length) * 100);
    const sessionMinutes = questions.length * MINUTES_PER_QUESTION;

    return (
      <div className="mx-auto max-w-[820px] px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-7 md:p-9 space-y-6">
          <div className="space-y-2 border-b border-slate-100 pb-5">
            <p className={`text-xs font-bold ${sessionTimedOut ? 'text-amber-700' : 'text-emerald-700'}`}>
              {chapter.orderLabel} · {sessionTimedOut ? `Waktu Sesi Berakhir (${sessionMinutes} Menit)` : 'Sesi Latihan Selesai'}
            </p>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-950">
              {sessionTimedOut
                ? `Waktu ${sessionMinutes} Menit Telah Habis`
                : `${chapter.title} Selesai`}
            </h2>
            <p className="text-sm text-slate-600">
              {sessionTimedOut
                ? `Kamu berhasil mengerjakan ${roundAttempts.length} dari ${questions.length} soal dalam alokasi waktu ${sessionMinutes} menit.`
                : `Kamu sudah menyelesaikan seluruh soal pada paket ini.`}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Skor Diperoleh</div>
              <div className="mt-1 font-mono text-2xl font-bold text-sky-700 tabular-nums">
                {roundScore} <span className="text-sm font-normal text-slate-400">/ {roundMaxScore} poin</span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Jawaban Benar</div>
              <div className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                {roundCorrect} <span className="text-sm font-normal text-slate-400">/ {questions.length} soal</span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Ketepatan</div>
              <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {accuracy}%
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onExitToMap}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
            >
              Kembali ke Daftar Numerasi
            </button>

            <div className="flex flex-wrap items-center gap-2.5">
              {sessionTimedOut && roundAttempts.length < questions.length && (
                <button
                  type="button"
                  onClick={handleRestartSessionTimer}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Atur Ulang Waktu ({sessionMinutes} Menit)</span>
                </button>
              )}

              {onNextWorld && (
                <button
                  type="button"
                  onClick={onNextWorld}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
                >
                  <span>Lanjut ke Paket Berikutnya</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Pre-Start Fullscreen / Mode Fokus Gate (wajib sebelum soal & timer dimulai)
  if (!hasEnteredFocusGate && !allQuestionsAnswered && !roundComplete) {
    const sessionMinutes = questions.length * MINUTES_PER_QUESTION;
    return (
      <div className="mx-auto max-w-[760px] px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="bg-slate-900 text-white px-6 py-5 md:px-8 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-sky-300">
              <span>{chapter.orderLabel}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono tabular-nums">{questions.length} Soal</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono tabular-nums">Durasi {sessionMinutes} Menit</span>
            </div>
            <h2 className="text-xl md:text-2xl font-extrabold text-white">{chapter.title}</h2>
            <p className="text-xs md:text-sm text-slate-300">
              Peserta: <strong className="text-white">{studentName || 'Siswa Kelas 6'}</strong>
            </p>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-start gap-3.5 rounded-xl border border-sky-200 bg-sky-50/90 p-4">
              <Maximize2 className="h-5 w-5 text-sky-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-sky-950">
                  Aktifkan Layar Penuh &amp; Mode Fokus Sebelum Mulai
                </h3>
                <p className="text-xs md:text-sm text-sky-900 leading-relaxed">
                  Latihan baru akan terbuka dan waktu <strong>{sessionMinutes} menit</strong> baru berjalan setelah kamu masuk ke layar penuh.
                </p>
              </div>
            </div>

            <ol className="space-y-3 text-sm text-slate-700">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 font-mono text-xs font-bold text-white">
                  1
                </span>
                <span className="pt-0.5 leading-relaxed">
                  Siapkan <strong>kertas coretan dan pensil</strong> sebelum menekan tombol mulai.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 font-mono text-xs font-bold text-white">
                  2
                </span>
                <span className="pt-0.5 leading-relaxed">
                  Gunakan <strong>3 menit per soal</strong> secara tenang. Soal pertama terbuka setelah jeda baca 6 detik.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 font-mono text-xs font-bold text-white">
                  3
                </span>
                <span className="pt-0.5 leading-relaxed">
                  Selama latihan, <strong>ganti tab, memperkecil (minimize) layar, keluar dari layar penuh, atau tombol screenshot</strong> otomatis tercatat ke log guru.
                </span>
              </li>
            </ol>

            {fullscreenError && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3 text-xs md:text-sm text-amber-950">
                <p className="leading-relaxed">{fullscreenError}</p>
                <button
                  type="button"
                  onClick={enterWindowFocusFallback}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-400 bg-white px-4 py-2.5 text-xs font-bold text-amber-950 hover:bg-amber-100 transition-colors whitespace-nowrap"
                >
                  <ShieldCheck className="h-4 w-4 text-amber-700" />
                  <span>Mulai dengan Mode Fokus Jendela</span>
                </button>
              </div>
            )}

            <div className="border-t border-slate-100 pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={onExitToMap}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Kembali ke Daftar Numerasi
              </button>

              <button
                type="button"
                onClick={enterFocusAndFullscreen}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 py-3.5 text-sm font-bold text-white hover:bg-sky-700 transition-colors shadow-sm whitespace-nowrap"
              >
                <Maximize2 className="h-4 w-4 shrink-0" />
                <span>Aktifkan Layar Penuh &amp; Mulai Latihan</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active stage: 1 = Baca Soal (while 6s read countdown active), 2 = Pilih Jawaban, 3 = Pelajari Pembahasan
  const activeStage: 1 | 2 | 3 = submittedAttempt ? 3 : readCountdown > 0 ? 1 : 2;
  const progressPct = Math.round(((currentIndex + 1) / questions.length) * 100);
  const watermarkLabel = `${studentName || 'Siswa'} · ${studentId.slice(-5) || 'K6'} · ${currentQuestion.numberLabel}`;
  const isSessionUrgent = !allQuestionsAnswered && sessionSecondsLeft <= 60;
  const isSessionWarning = !allQuestionsAnswered && !isSessionUrgent && sessionSecondsLeft <= 180;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 space-y-5 anti-copy-print-hide">
      {/* Zone 0: Dark Slate Session Context Frame (distinct from light background & workspace) */}
      <div className="rounded-2xl bg-slate-900 text-white px-5 py-4 md:px-6 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
            <span className={chapter.isEvaluation ? 'font-bold text-rose-300' : 'font-bold text-sky-300'}>
              {chapter.orderLabel}
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="font-semibold text-white">{chapter.title}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="font-mono text-xs text-slate-300 tabular-nums">
              Soal {currentIndex + 1} dari {questions.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Accumulated Session Timer (3 menit × jumlah soal) */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold tabular-nums ${
                allQuestionsAnswered
                  ? 'border-emerald-500/40 bg-emerald-950/70 text-emerald-200'
                  : isSessionUrgent
                    ? 'border-red-400 bg-red-950/90 text-red-200'
                    : isSessionWarning
                      ? 'border-amber-400 bg-amber-950/90 text-amber-200'
                      : 'border-slate-700 bg-slate-800 text-slate-100'
              }`}
            >
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                {allQuestionsAnswered
                  ? `Sesi Selesai (${questions.length * MINUTES_PER_QUESTION} mnt)`
                  : `Sisa Sesi: ${formatMmSs(sessionSecondsLeft)} / ${formatMmSs(totalSessionSeconds)}`}
              </span>
            </span>

            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                violations.length > 0 ? 'text-amber-300' : 'text-slate-300'
              }`}
            >
              <ShieldCheck
                className={`h-3.5 w-3.5 ${violations.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}
              />
              <span>{violations.length > 0 ? `${violations.length} Catatan Fokus` : 'Mode Fokus'}</span>
            </span>

            {isFullscreen && !allQuestionsAnswered ? (
              <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-950/70 px-2.5 py-1.5 text-xs font-medium text-emerald-200 whitespace-nowrap">
                <Maximize2 className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">Layar Penuh Aktif</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors whitespace-nowrap"
                title="Layar Penuh"
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-sky-400 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Sequential 3-Stage Stepper Bar with Color Separation */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
        {[
          {
            step: 1 as const,
            label: '1. Baca & Pahami Soal',
            sublabel: 'Cermati konteks & angka',
            activeCls: 'bg-sky-600 text-white border-sky-700 shadow-sm',
            doneCls: 'bg-sky-50 text-sky-900 border-sky-200',
            subActiveCls: 'text-sky-100',
            subDoneCls: 'text-sky-700',
          },
          {
            step: 2 as const,
            label: '2. Hitung & Pilih Jawaban',
            sublabel: 'Coret di kertas lalu kirim',
            activeCls: 'bg-indigo-600 text-white border-indigo-700 shadow-sm',
            doneCls: 'bg-indigo-50 text-indigo-900 border-indigo-200',
            subActiveCls: 'text-indigo-100',
            subDoneCls: 'text-indigo-700',
          },
          {
            step: 3 as const,
            label: '3. Pelajari Pembahasan',
            sublabel: 'Cek langkah & pengecoh',
            activeCls: 'bg-emerald-600 text-white border-emerald-700 shadow-sm',
            doneCls: 'bg-emerald-50 text-emerald-900 border-emerald-200',
            subActiveCls: 'text-emerald-100',
            subDoneCls: 'text-emerald-700',
          },
        ].map((item) => {
          const isActive = activeStage === item.step;
          const isDone = activeStage > item.step;
          return (
            <div
              key={item.step}
              className={`rounded-xl border px-4 py-2.5 transition-colors flex items-center justify-between gap-2 ${
                isActive
                  ? item.activeCls
                  : isDone
                    ? item.doneCls
                    : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              <div>
                <div className="font-bold">{item.label}</div>
                <div
                  className={`text-[11px] ${
                    isActive
                      ? item.subActiveCls
                      : isDone
                        ? item.subDoneCls
                        : 'text-slate-400'
                  }`}
                >
                  {item.sublabel}
                </div>
              </div>
              {isDone && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Gentle warning banner if triggered */}
      {warningToast && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 flex items-center justify-between gap-4 text-xs md:text-sm text-amber-950"
        >
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4.5 w-4.5 text-amber-600 shrink-0" />
            <span>
              <strong>Pengingat Fokus:</strong> {warningToast}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setWarningToast(null)}
            className="text-xs font-semibold underline shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Main Content Layout: Color-Separated Left Sequential Stages + Right Support Rail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div
          className="relative lg:col-span-8 space-y-5 anti-copy"
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
        >
          {/* Privacy Curtain Overlay when tab/window loses focus, exits fullscreen, or screenshot key is pressed */}
          {isPrivacyCurtainOpen && (
            <div className="absolute inset-0 z-30 rounded-2xl flex flex-col items-center justify-center bg-slate-900/95 backdrop-blur-md p-6 text-center text-white space-y-4">
              <ShieldAlert className="h-10 w-10 text-amber-400" />
              <div className="space-y-1.5 max-w-md">
                <h3 className="text-lg font-bold">Soal Disembunyikan Sementara</h3>
                <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                  {curtainReason}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (focusModeType === 'native' && !document.fullscreenElement) {
                    void enterFocusAndFullscreen();
                  } else {
                    setIsPrivacyCurtainOpen(false);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-500 transition-colors"
              >
                {focusModeType === 'native' && !isFullscreen && (
                  <Maximize2 className="h-4 w-4 shrink-0" />
                )}
                <span>
                  {focusModeType === 'native' && !isFullscreen
                    ? 'Aktifkan Layar Penuh & Lanjutkan'
                    : 'Kembali Fokus ke Soal'}
                </span>
              </button>
            </div>
          )}

          {/* TAHAP 1: ZONA KONTEKS SOAL (Soft Sky Surface) */}
          <section className="relative overflow-hidden rounded-2xl border border-sky-200 bg-sky-50/80 shadow-sm">
            {/* Subtle student identity watermark */}
            <div
              aria-hidden="true"
              className="pointer-events-none select-none absolute inset-0 overflow-hidden opacity-[0.04] flex flex-wrap items-center justify-around gap-10 -rotate-12 scale-110 z-0"
            >
              {Array.from({ length: 6 }).map((_, idx) => (
                <span
                  key={idx}
                  className="font-mono text-xs font-bold tracking-wider text-slate-900 whitespace-nowrap"
                >
                  {watermarkLabel}
                </span>
              ))}
            </div>

            {/* Sky Context Header Strip */}
            <div className="relative z-10 bg-sky-100/80 border-b border-sky-200 px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-sky-950">
                <span className="font-bold text-sky-800">Tahap 1 · Konteks Soal</span>
                <span aria-hidden="true" className="text-sky-300">·</span>
                <span className="font-mono font-bold">{currentQuestion.numberLabel}</span>
                <span aria-hidden="true" className="text-sky-300">·</span>
                <span
                  className={`font-semibold ${
                    currentQuestion.level === 'Sulit'
                      ? 'text-rose-700'
                      : currentQuestion.level === 'Sedang'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                  }`}
                >
                  Tingkat {currentQuestion.level}
                </span>
                <span aria-hidden="true" className="text-sky-300">·</span>
                <span className="font-mono font-semibold tabular-nums">{currentQuestion.xp} poin</span>
              </div>

              {!submittedAttempt && (
                <span
                  className={`inline-flex items-center gap-1 font-mono font-semibold tabular-nums ${
                    questionSecondsLeft === 0
                      ? 'text-amber-800'
                      : questionSecondsLeft <= 30
                        ? 'text-red-700'
                        : 'text-sky-900'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {questionSecondsLeft > 0
                    ? `Waktu Soal: ${formatMmSs(questionSecondsLeft)} / 03:00`
                    : 'Melebihi 3 mnt (pakai sisa sesi)'}
                </span>
              )}
            </div>

            {/* Question Content */}
            <div className="relative z-10 p-6 md:p-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl md:text-2xl font-extrabold text-slate-950">
                  {currentQuestion.title}
                </h2>
                {currentQuestion.isErrorHunt && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700">
                    <Search className="h-3.5 w-3.5" />
                    Analisis Kesalahan
                  </span>
                )}
              </div>

              {currentQuestion.isErrorHunt && currentQuestion.studentClaim && (
                <div className="border-t border-b border-rose-200 bg-rose-50/90 -mx-6 md:-mx-7 px-6 md:px-7 py-4 space-y-1">
                  <div className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                    <Search className="h-3.5 w-3.5" />
                    <span>Pernyataan yang Perlu Diperiksa Kesalahannya:</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900 leading-relaxed">
                    {currentQuestion.studentClaim}
                  </p>
                </div>
              )}

              <p className="text-base md:text-[17px] text-slate-900 leading-relaxed font-medium">
                {currentQuestion.questionText}
              </p>
            </div>
          </section>

          {/* TAHAP 2: ZONA PILIHAN JAWABAN & AKSI KIRIM (Crisp White + Indigo Header Strip) */}
          <section className="rounded-2xl border border-indigo-200 bg-white overflow-hidden shadow-sm">
            <div className="bg-indigo-50/90 border-b border-indigo-200/80 px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-indigo-900">
                {submittedAttempt
                  ? 'Tahap 2 · Jawaban Terkirim'
                  : 'Tahap 2 · Hitung di Kertas Coretan, Lalu Pilih Jawaban'}
              </span>
              {!submittedAttempt && readCountdown > 0 && (
                <span className="font-mono font-semibold text-indigo-700 tabular-nums">
                  Waktu baca: {readCountdown} dtk
                </span>
              )}
            </div>

            <div className="p-6 md:p-7 space-y-4">
              <div className="space-y-2.5">
                {shuffledOptions.map((opt, displayIdx) => {
                  const letter = String.fromCharCode(65 + displayIdx);
                  const isEliminated = eliminatedOriginalIndices.includes(opt.originalIndex);
                  const isSelected = selectedDisplayIdx === displayIdx;

                  const isSubmitted = Boolean(submittedAttempt);
                  const isCorrectOption = opt.originalIndex === currentQuestion.correctIndex;
                  const isChosenOption =
                    submittedAttempt && opt.originalIndex === submittedAttempt.selectedIndex;

                  let buttonStyle =
                    'border-slate-200 bg-white text-slate-800 hover:border-indigo-400 hover:bg-indigo-50/40';
                  if (isEliminated) {
                    buttonStyle =
                      'border-slate-200 bg-slate-100 text-slate-400 line-through opacity-50 cursor-not-allowed';
                  } else if (isSubmitted) {
                    if (isCorrectOption) {
                      buttonStyle =
                        'border-emerald-500 bg-emerald-50 text-emerald-950 font-semibold';
                    } else if (isChosenOption && !submittedAttempt?.isCorrect) {
                      buttonStyle = 'border-red-400 bg-red-50 text-red-950';
                    } else {
                      buttonStyle = 'border-slate-200 bg-slate-50/70 text-slate-500';
                    }
                  } else if (isSelected) {
                    buttonStyle =
                      'border-indigo-600 bg-indigo-50 text-slate-950 font-semibold ring-1 ring-indigo-600';
                  }

                  return (
                    <button
                      key={`${currentQuestion.id}-${opt.originalIndex}`}
                      type="button"
                      disabled={isEliminated || isSubmitted}
                      onClick={() => setSelectedDisplayIdx(displayIdx)}
                      className={`w-full rounded-xl border p-4 text-left text-sm md:text-[15px] transition-all flex items-start gap-3.5 ${buttonStyle}`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold border ${
                          isSubmitted && isCorrectOption
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : isSubmitted && isChosenOption && !submittedAttempt?.isCorrect
                              ? 'bg-red-600 text-white border-red-600'
                              : isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {letter}
                      </span>
                      <span className="flex-1 leading-relaxed">{opt.text}</span>
                    </button>
                  );
                })}
              </div>

              {!submittedAttempt && (
                <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-slate-600 flex items-center gap-1.5 leading-relaxed">
                    <Clock className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    <span>
                      {readCountdown > 0
                        ? `Tahap 1: Baca soal dengan teliti (${readCountdown} detik) sebelum memilih.`
                        : selectedDisplayIdx === null
                          ? 'Pilih salah satu opsi A, B, C, atau D berdasarkan hitunganmu.'
                          : 'Periksa kembali angka dan satuannya, lalu klik Kirim Jawaban.'}
                    </span>
                  </p>
                  <button
                    type="button"
                    disabled={selectedDisplayIdx === null || readCountdown > 0}
                    onClick={handleSubmitAnswer}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-bold text-white hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-40 whitespace-nowrap shrink-0"
                  >
                    <span>
                      {readCountdown > 0 ? `Baca Soal (${readCountdown} dtk)` : 'Kirim Jawaban'}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* TAHAP 3: ZONA PEMBAHASAN LANGKAH DEMI LANGKAH (Emerald / Amber Semantic Band) */}
          {submittedAttempt && (
            <section
              className={`rounded-2xl border overflow-hidden shadow-sm ${
                submittedAttempt.isCorrect ? 'border-emerald-300 bg-white' : 'border-amber-300 bg-white'
              }`}
            >
              <div
                className={`px-6 py-4 flex items-start gap-3 text-white ${
                  submittedAttempt.isCorrect ? 'bg-emerald-600' : 'bg-amber-600'
                }`}
              >
                {submittedAttempt.isCorrect ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div className="text-sm font-bold">
                    {submittedAttempt.isCorrect
                      ? `Tahap 3 · Jawaban Benar (+${submittedAttempt.earnedXp} poin)`
                      : 'Tahap 3 · Jawaban Belum Tepat — Pelajari Langkahnya'}
                  </div>
                  <div className="text-xs text-white/90">
                    <strong>Jawaban Benar:</strong> {currentQuestion.finalAnswer}
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-7 space-y-4">
                <div>
                  <div className="text-xs md:text-sm font-bold text-slate-900 mb-2">
                    Langkah Penyelesaian:
                  </div>
                  <ol className="list-decimal pl-5 space-y-1.5 text-xs md:text-sm text-slate-700 leading-relaxed">
                    {currentQuestion.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>

                <div className="border-t border-amber-200 bg-amber-50/80 -mx-6 md:-mx-7 px-6 md:px-7 py-3.5 text-xs md:text-sm text-amber-950">
                  <strong>Perhatikan Angka Pengecoh:</strong> {currentQuestion.trapWarning}
                </div>

                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    <span>
                      {currentIndex + 1 < questions.length
                        ? 'Lanjut ke Soal Berikutnya'
                        : 'Lihat Hasil Sesi'}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Right Zone: Optional Helpers (Warm Amber) + Collapsed AI Tutor + Question Navigator */}
        <div className="lg:col-span-4 space-y-4">
          {!submittedAttempt && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 space-y-3">
              <div>
                <h3 className="text-xs font-bold text-amber-950">Alat Bantu Soal (Opsional)</h3>
                <p className="text-[11px] text-amber-900/80 mt-0.5">
                  Dipakai hanya jika kamu benar-benar buntu.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={hintPowerUpUsedInRound}
                  onClick={handleUseHintPowerUp}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    hintPowerUpUsedInRound
                      ? 'border-slate-200 bg-white/60 text-slate-400 cursor-not-allowed'
                      : 'border-amber-300 bg-white text-amber-950 hover:bg-amber-100'
                  }`}
                >
                  <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>Petunjuk ({hintPowerUpUsedInRound ? '0' : '1'}x)</span>
                </button>

                <button
                  type="button"
                  disabled={fiftyFiftyUsedInRound}
                  onClick={handleUseFiftyFifty}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    fiftyFiftyUsedInRound
                      ? 'border-slate-200 bg-white/60 text-slate-400 cursor-not-allowed'
                      : 'border-sky-300 bg-white text-sky-900 hover:bg-sky-50'
                  }`}
                >
                  <EyeOff className="h-3.5 w-3.5 shrink-0" />
                  <span>Eliminasi 2 ({fiftyFiftyUsedInRound ? '0' : '1'}x)</span>
                </button>
              </div>

              {hintShownForQuestionId === currentQuestion.id && (
                <div className="border-t border-amber-200 pt-3 space-y-1">
                  <div className="text-xs font-bold text-amber-950">Petunjuk Langkah Pertama:</div>
                  <p className="text-xs text-amber-950 leading-relaxed">
                    {currentQuestion.steps[0]}
                  </p>
                </div>
              )}
            </div>
          )}

          <AiScaffoldPanel
            studentId={studentId}
            question={currentQuestion}
            onUsedScaffold={() => setUsedAiOnCurrent(true)}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-800">Daftar Nomor Soal</div>
              <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                {questions.length * MINUTES_PER_QUESTION} mnt total
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {questions.map((q, idx) => {
                const att = attempts[q.id];
                const active = idx === currentIndex;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-8 min-w-8 px-2 rounded-lg text-xs font-mono font-semibold transition-colors tabular-nums ${
                      active
                        ? 'bg-slate-900 text-white'
                        : att
                          ? att.isCorrect
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-red-100 text-red-800 border border-red-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Hitam: Aktif</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 font-medium">Hijau: Benar</span>
              <span aria-hidden="true">·</span>
              <span className="text-red-700 font-medium">Merah: Salah</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
