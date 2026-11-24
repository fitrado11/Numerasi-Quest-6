import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  EyeOff,
  HelpCircle,
  Maximize2,
  Minimize2,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
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
  const initialQuestionIndex = useMemo(() => {
    const idx = questions.findIndex((q) => !attempts[q.id]);
    return idx >= 0 ? idx : 0;
  }, [chapter.id]);

  const [currentIndex, setCurrentIndex] = useState(initialQuestionIndex);
  const [roundComplete, setRoundComplete] = useState(false);

  // Per-round power-up budget (1x each per round/world)
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

  // Anti-screenshot & anti-cheat privacy curtain (no lockout!)
  const [isPrivacyCurtainOpen, setIsPrivacyCurtainOpen] = useState(false);
  const [curtainReason, setCurtainReason] = useState<string>(
    'Layar soal disembunyikan sementara karena fokus berpindah.'
  );
  const [warningToast, setWarningToast] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const lastViolationAtRef = useRef<number>(0);

  useEffect(() => {
    const firstOpen = questions.findIndex((q) => !attempts[q.id]);
    setCurrentIndex(firstOpen >= 0 ? firstOpen : 0);
    setRoundComplete(false);
    setHintPowerUpUsedInRound(false);
    setFiftyFiftyUsedInRound(false);
    setHintShownForQuestionId(null);
    setEliminatedOriginalIndices([]);
    setUsedAiOnCurrent(false);
    setSelectedDisplayIdx(null);
    setSubmittedAttempt(null);
    setWarningToast(null);
    setIsPrivacyCurtainOpen(false);
  }, [chapter.id]);

  const currentQuestion = questions[currentIndex];

  useEffect(() => {
    if (!currentQuestion) return;
    const existing = attempts[currentQuestion.id];
    setSelectedDisplayIdx(null);
    setSubmittedAttempt(existing ?? null);
    setEliminatedOriginalIndices([]);
    setUsedAiOnCurrent(false);
    setReadCountdown(existing ? 0 : MIN_READ_SECONDS);
  }, [currentQuestion?.id]);

  // Countdown to prevent instant blind guessing on unanswered questions
  useEffect(() => {
    if (submittedAttempt || roundComplete || readCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setReadCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [submittedAttempt, roundComplete, readCountdown, currentQuestion?.id]);

  const shuffledOptions = useMemo(() => {
    if (!currentQuestion) return [];
    return deterministicShuffle(currentQuestion.options, `${currentQuestion.id}-v1`);
  }, [currentQuestion]);

  // Anti-screenshot, privacy-curtain, and anti-copy-paste guards (logs silently without locking session)
  useEffect(() => {
    if (roundComplete || !currentQuestion) return;

    const triggerViolation = (type: ViolationLog['type'], detail: string) => {
      const now = Date.now();
      if (now - lastViolationAtRef.current < 1500) return;
      lastViolationAtRef.current = now;

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
        showCurtain('Tetap berada di tab kuis ya! Layar soal disembunyikan saat berpindah tab.');
        triggerViolation(
          'tab-switch',
          'Terdeteksi berpindah tab atau membuka aplikasi lain saat kuis.'
        );
      } else if (document.hasFocus()) {
        setIsPrivacyCurtainOpen(false);
      }
    };

    let blurTimer: number | null = null;
    const handleWindowBlur = () => {
      showCurtain('Fokus layar berpindah keluar. Klik kembali jendela kuis untuk melanjutkan.');
      blurTimer = window.setTimeout(() => {
        if (!document.hasFocus()) {
          triggerViolation(
            'window-blur',
            'Fokus layar berpindah keluar (kemungkinan split-screen atau alat bantu lain).'
          );
        }
      }, 250);
    };

    const handleWindowFocus = () => {
      if (blurTimer !== null) {
        window.clearTimeout(blurTimer);
        blurTimer = null;
      }
      if (!document.hidden) {
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
      setIsFullscreen(Boolean(document.fullscreenElement));
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
  }, [chapter.title, currentQuestion?.id, roundComplete, onRecordViolation]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
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
        <p className="text-sm text-slate-600">Tidak ada soal pada dunia ini.</p>
        <button
          type="button"
          onClick={onExitToMap}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Kembali ke Peta Dunia
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

  // End-of-round Summary Screen
  if (roundComplete) {
    const roundAttempts = questions.map((q) => attempts[q.id]).filter(Boolean);
    const roundXp = roundAttempts.reduce((sum, a) => sum + a.earnedXp, 0);
    const roundMaxXp = questions.reduce((sum, q) => sum + q.xp, 0);
    const roundCorrect = roundAttempts.filter((a) => a.isCorrect).length;
    const accuracy = Math.round((roundCorrect / questions.length) * 100);

    return (
      <div className="mx-auto max-w-[820px] px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-7 md:p-9 space-y-6">
          <div className="space-y-2 border-b border-slate-100 pb-5">
            <p className="text-xs font-bold text-emerald-700">
              {chapter.orderLabel} · Ronde Selesai
            </p>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-950">
              Bagus! {chapter.title} Tuntas
            </h2>
            <p className="text-sm text-slate-600">
              Kamu sudah menyelesaikan seluruh soal pada dunia ini.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">XP Diperoleh</div>
              <div className="mt-1 font-mono text-2xl font-bold text-sky-700 tabular-nums">
                {roundXp} <span className="text-sm font-normal text-slate-400">/ {roundMaxXp}</span>
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
              Kembali ke Peta Dunia
            </button>
            {onNextWorld && (
              <button
                type="button"
                onClick={onNextWorld}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
              >
                <span>Lanjut ke Dunia Berikutnya</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const currentStep = submittedAttempt ? 2 : 1;
  const progressPct = Math.round(((currentIndex + 1) / questions.length) * 100);
  const watermarkLabel = `${studentName || 'Siswa'} · ${studentId.slice(-5) || 'K5'} · ${currentQuestion.numberLabel}`;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 space-y-5 anti-copy-print-hide">
      {/* Calm, uncluttered Progress & Focus Header */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
            <span className={chapter.isBoss ? 'font-bold text-rose-700' : 'font-bold text-sky-700'}>
              {chapter.orderLabel}
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-semibold text-slate-900">{chapter.title}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono text-xs text-slate-600 tabular-nums">
              Soal {currentIndex + 1} dari {questions.length}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                violations.length > 0 ? 'text-amber-700' : 'text-slate-500'
              }`}
            >
              <ShieldCheck className={`h-3.5 w-3.5 ${violations.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
              <span>{violations.length > 0 ? `${violations.length} Catatan Fokus` : 'Mode Fokus Aktif'}</span>
            </span>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              title="Layar Penuh"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}</span>
            </button>
          </div>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-sky-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Gentle warning banner if triggered */}
      {warningToast && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 flex items-center justify-between gap-4 text-xs md:text-sm text-amber-900"
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

      {/* Main Content Layout: Focused Left Question Card + Calm Collapsible AI Helper */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section
          className="relative overflow-hidden lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-6 md:p-8 space-y-6 anti-copy"
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
        >
          {/* Subtle student identity watermark across the question workspace to deter screenshots & phone photos */}
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute inset-0 overflow-hidden opacity-[0.045] flex flex-wrap items-center justify-around gap-10 -rotate-12 scale-110 z-0"
          >
            {Array.from({ length: 8 }).map((_, idx) => (
              <span key={idx} className="font-mono text-xs font-bold tracking-wider text-slate-900 whitespace-nowrap">
                {watermarkLabel}
              </span>
            ))}
          </div>

          {/* Privacy Curtain Overlay when tab/window loses focus or screenshot key is pressed */}
          {isPrivacyCurtainOpen && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/95 backdrop-blur-md p-6 text-center text-white space-y-4">
              <ShieldAlert className="h-10 w-10 text-amber-400" />
              <div className="space-y-1.5 max-w-md">
                <h3 className="text-lg font-bold">Soal Disembunyikan Sementara</h3>
                <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                  {curtainReason}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPrivacyCurtainOpen(false)}
                className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-500 transition-colors"
              >
                Kembali Fokus ke Soal
              </button>
            </div>
          )}

          <div className="relative z-10 space-y-6">
            {/* Clean 2-Step Indicator */}
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 border border-slate-200 p-1.5 text-xs">
              {[
                { step: 1, label: '1. Baca & Pilih Jawaban' },
                { step: 2, label: '2. Pelajari Pembahasan' },
              ].map((item) => {
                const isActive = currentStep === item.step;
                const isDone = currentStep > item.step;
                return (
                  <div
                    key={item.step}
                    className={`rounded-lg px-3 py-2 text-center font-semibold transition-colors ${
                      isActive
                        ? 'bg-white text-sky-700 shadow-sm border border-sky-200'
                        : isDone
                          ? 'text-emerald-700'
                          : 'text-slate-400'
                    }`}
                  >
                    {item.label}
                  </div>
                );
              })}
            </div>

            {/* Question Metadata & Power-ups */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-mono font-bold text-slate-900">
                  {currentQuestion.numberLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-semibold ${
                    currentQuestion.level === 'Sulit'
                      ? 'text-rose-700'
                      : currentQuestion.level === 'Sedang'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                  }`}
                >
                  Level {currentQuestion.level}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-semibold text-sky-700 tabular-nums">
                  +{currentQuestion.xp} XP
                </span>
                {currentQuestion.isErrorHunt && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                      <Search className="h-3.5 w-3.5" />
                      Cari Kesalahannya
                    </span>
                  </>
                )}
              </div>

              {!submittedAttempt && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={hintPowerUpUsedInRound}
                    onClick={handleUseHintPowerUp}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      hintPowerUpUsedInRound
                        ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span>Petunjuk ({hintPowerUpUsedInRound ? '0' : '1'}x)</span>
                  </button>

                  <button
                    type="button"
                    disabled={fiftyFiftyUsedInRound}
                    onClick={handleUseFiftyFifty}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      fiftyFiftyUsedInRound
                        ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100'
                    }`}
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    <span>50:50 ({fiftyFiftyUsedInRound ? '0' : '1'}x)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Question Prompt */}
            <div className="space-y-4">
              <h2 className="text-xl md:text-2xl font-bold text-slate-950">
                {currentQuestion.title}
              </h2>

              {currentQuestion.isErrorHunt && currentQuestion.studentClaim && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 space-y-1">
                  <div className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                    <Search className="h-3.5 w-3.5" />
                    <span>Periksa Pernyataan Teman Ini:</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900 leading-relaxed">
                    {currentQuestion.studentClaim}
                  </p>
                </div>
              )}

              <p className="text-base md:text-[17px] text-slate-800 leading-relaxed font-medium">
                {currentQuestion.questionText}
              </p>
            </div>

            {/* Power-up Hint Display */}
            {hintShownForQuestionId === currentQuestion.id && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1">
                <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                  <span>Petunjuk Langkah Pertama:</span>
                </div>
                <p className="text-sm text-amber-950 leading-relaxed">
                  {currentQuestion.steps[0]}
                </p>
              </div>
            )}

            {/* Direct Multiple-Choice Options */}
            <div className="space-y-3 pt-1">
              <div className="text-xs font-bold text-slate-700">
                {submittedAttempt
                  ? 'Pilihan Jawaban:'
                  : 'Hitung di kertas coretanmu, lalu pilih jawaban yang paling tepat:'}
              </div>

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
                    'border-slate-200 bg-white text-slate-800 hover:border-sky-400 hover:bg-sky-50/40';
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
                    buttonStyle = 'border-sky-600 bg-sky-50 text-slate-950 font-semibold ring-1 ring-sky-600';
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
                                ? 'bg-sky-600 text-white border-sky-600'
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>
                      {readCountdown > 0
                        ? `Baca soal dan hitung dulu dengan teliti (${readCountdown} detik)...`
                        : 'Cek kembali pilihanmu supaya tidak terjebak angka pengecoh.'}
                    </span>
                  </p>
                  <button
                    type="button"
                    disabled={selectedDisplayIdx === null || readCountdown > 0}
                    onClick={handleSubmitAnswer}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-bold text-white hover:bg-sky-700 transition-colors disabled:opacity-40 whitespace-nowrap shrink-0"
                  >
                    <span>
                      {readCountdown > 0 ? `Tunggu ${readCountdown} dtk` : 'Kirim Jawaban'}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Post-Answer Review */}
            {submittedAttempt && (
              <div className="space-y-4 border-t border-slate-200 pt-5">
                <div
                  className={`rounded-xl border p-4 flex items-start gap-3 ${
                    submittedAttempt.isCorrect
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                      : 'border-red-200 bg-red-50 text-red-950'
                  }`}
                >
                  {submittedAttempt.isCorrect ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <div className="text-sm font-bold">
                      {submittedAttempt.isCorrect
                        ? `Hebat! Jawabanmu benar (+${submittedAttempt.earnedXp} XP).`
                        : 'Belum tepat, tidak apa-apa! Yuk lihat cara yang benar di bawah ini.'}
                    </div>
                    <div className="text-xs text-slate-700">
                      <strong>Jawaban Benar:</strong> {currentQuestion.finalAnswer}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs md:text-sm">
                  <div>
                    <div className="font-bold text-slate-900 mb-1.5">Cara Mengerjakannya:</div>
                    <ol className="list-decimal pl-5 space-y-1 text-slate-700 leading-relaxed">
                      {currentQuestion.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  <div className="border-t border-slate-200/80 pt-2.5 text-amber-900">
                    <strong>Ingat Jebakannya:</strong> {currentQuestion.trapWarning}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
                  >
                    <span>
                      {currentIndex + 1 < questions.length
                        ? 'Lanjut ke Soal Berikutnya'
                        : 'Lihat Hasil Ronde'}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Zone: Collapsed-by-default AI Helper + Quick Question Navigator */}
        <div className="lg:col-span-4 space-y-4">
          <AiScaffoldPanel
            studentId={studentId}
            question={currentQuestion}
            onUsedScaffold={() => setUsedAiOnCurrent(true)}
          />

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="text-xs font-bold text-slate-800">Nomor Soal di Dunia Ini</div>
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
          </div>
        </div>
      </div>
    </div>
  );
};
