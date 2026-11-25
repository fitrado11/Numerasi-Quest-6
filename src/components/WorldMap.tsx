import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
} from 'lucide-react';
import { MINUTES_PER_QUESTION } from '../data/questions';
import { AttemptRecord, ChapterId, Question, WorldChapter } from '../types/quiz';

interface WorldMapProps {
  studentName: string;
  onEditStudentName: () => void;
  chapters: WorldChapter[];
  questions: Question[];
  attempts: Record<string, AttemptRecord>;
  onStartWorld: (chapterId: ChapterId) => void;
}

export const WorldMap: React.FC<WorldMapProps> = ({
  studentName,
  onEditStudentName,
  chapters,
  questions,
  attempts,
  onStartWorld,
}) => {
  const [openGuideId, setOpenGuideId] = useState<ChapterId | null>(null);

  const totalScore = Object.values(attempts).reduce((sum, a) => sum + a.earnedXp, 0);
  const completedCount = Object.keys(attempts).length;

  // Find the first unfinished package in sequential order
  const recommendedChapter =
    chapters.find((ch) => {
      const qs = questions.filter((q) => q.chapterId === ch.id);
      const done = qs.filter((q) => Boolean(attempts[q.id])).length;
      return done < qs.length;
    }) ?? chapters[0];

  const recQuestions = questions.filter((q) => q.chapterId === recommendedChapter.id);
  const recDone = recQuestions.filter((q) => Boolean(attempts[q.id])).length;
  const recMinutes = recQuestions.length * MINUTES_PER_QUESTION;

  // Group 6 packages into 3 sequential stages so 6th graders are never overwhelmed by 6 flat items
  const sequentialStages: Array<{
    stageNumber: string;
    title: string;
    description: string;
    chapterIds: ChapterId[];
    headerBg: string;
    headerBorder: string;
    badgeBg: string;
  }> = [
    {
      stageNumber: 'Tahap 1',
      title: 'Fondasi Operasi & Soal Cerita',
      description: 'Mulai dari kelipatan/faktor (KPK & FPB) dan soal cerita perkalian-pembagian.',
      chapterIds: ['bab1', 'bab2'],
      headerBg: 'bg-sky-50/90',
      headerBorder: 'border-sky-200',
      badgeBg: 'bg-sky-600 text-white',
    },
    {
      stageNumber: 'Tahap 2',
      title: 'Bilangan Besar & Nilai Desimal',
      description: 'Latih pembulatan estimasi 4 digit dan ketelitian nilai tempat desimal.',
      chapterIds: ['bab3', 'bab4'],
      headerBg: 'bg-indigo-50/90',
      headerBorder: 'border-indigo-200',
      badgeBg: 'bg-indigo-600 text-white',
    },
    {
      stageNumber: 'Tahap 3',
      title: 'Evaluasi Gabungan Akhir',
      description: 'Gabungan seluruh materi untuk mengukur kesiapan TKA Numerasi SD.',
      chapterIds: ['bab5A', 'bab5B'],
      headerBg: 'bg-rose-50/90',
      headerBorder: 'border-rose-200',
      badgeBg: 'bg-rose-600 text-white',
    },
  ];

  return (
    <div className="mx-auto max-w-[1060px] px-6 py-8 space-y-8">
      {/* Zone 1: Dark Slate Context & Progress Banner (clearly distinct from page canvas) */}
      <section className="rounded-2xl bg-slate-900 text-white p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-sky-300">
            Peserta: {studentName || 'Siswa'} · TKA Numerasi SD Kelas 6
          </p>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
            Daftar Numerasi
          </h1>
          <p className="text-xs md:text-sm text-slate-300 max-w-xl leading-relaxed">
            Kerjakan paket latihan secara berurutan dari Tahap 1 hingga Tahap 3. Setiap soal dialokasikan {MINUTES_PER_QUESTION} menit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 shrink-0">
          <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 tabular-nums">
            <div className="text-[11px] font-medium text-slate-400">Capaian Saat Ini</div>
            <div className="mt-0.5 flex items-baseline gap-2.5">
              <strong className="font-mono text-lg font-bold text-sky-300">{totalScore} poin</strong>
              <span className="text-xs text-slate-400">
                ({completedCount}/{questions.length} soal)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onEditStudentName}
            className="rounded-xl border border-slate-700 bg-slate-800/70 px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap"
          >
            Ganti Nama
          </button>
        </div>
      </section>

      {/* Zone 2: Single Dominant Focal Anchor — Next Recommended Action */}
      <section className="rounded-2xl border border-sky-200 bg-white overflow-hidden shadow-sm">
        <div className="bg-sky-50 border-b border-sky-200 px-6 py-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-sky-900">
            {recDone > 0 ? 'Langkah Sekarang · Lanjutkan Paket' : 'Langkah Sekarang · Paket Berikutnya'}
          </span>
          <span className="font-mono text-xs font-semibold text-sky-800 tabular-nums">
            {recommendedChapter.orderLabel} · {recQuestions.length} Soal · {recMinutes} Menit
          </span>
        </div>

        <div className="p-6 md:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <h2 className="text-xl md:text-2xl font-extrabold text-slate-950">
              {recommendedChapter.title}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {recommendedChapter.subtitle} — total waktu sesi{' '}
              <span className="font-semibold text-slate-900 tabular-nums">{recMinutes} menit</span> (
              {MINUTES_PER_QUESTION} menit per soal).
            </p>
          </div>

          <button
            type="button"
            onClick={() => onStartWorld(recommendedChapter.id)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-7 py-4 text-sm md:text-base font-bold text-white hover:bg-sky-700 transition-colors shadow-sm whitespace-nowrap shrink-0"
          >
            <span>
              {recDone > 0
                ? `Lanjutkan (${recDone}/${recQuestions.length} Soal)`
                : `Mulai ${recommendedChapter.orderLabel}`}
            </span>
            <ArrowRight className="h-4.5 w-4.5" />
          </button>
        </div>
      </section>

      {/* Zone 3: 3-Stage Sequential Learning Path (Color-Separated Stages) */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">
            Alur Paket Soal TKA Numerasi (3 Tahap)
          </h2>
          <span className="text-xs text-slate-500">
            Alokasi {MINUTES_PER_QUESTION} menit/soal · Kerjakan berurutan agar mudah dipahami
          </span>
        </div>

        <div className="space-y-5">
          {sequentialStages.map((stage) => {
            const stageChapters = stage.chapterIds
              .map((id) => chapters.find((c) => c.id === id))
              .filter((c): c is WorldChapter => Boolean(c));

            return (
              <div
                key={stage.stageNumber}
                className={`rounded-2xl border ${stage.headerBorder} bg-white overflow-hidden shadow-sm`}
              >
                {/* Stage Color Header Strip */}
                <div
                  className={`${stage.headerBg} border-b ${stage.headerBorder} px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${stage.badgeBg} whitespace-nowrap shrink-0`}
                    >
                      {stage.stageNumber}
                    </span>
                    <div>
                      <h3 className="text-sm md:text-base font-bold text-slate-950">
                        {stage.title}
                      </h3>
                      <p className="text-xs text-slate-600">{stage.description}</p>
                    </div>
                  </div>
                </div>

                {/* Packages inside this Stage */}
                <div className="divide-y divide-slate-100">
                  {stageChapters.map((chapter) => {
                    const globalIdx = chapters.findIndex((c) => c.id === chapter.id);
                    const pkgQuestions = questions.filter((q) => q.chapterId === chapter.id);
                    const pkgAttempts = pkgQuestions.map((q) => attempts[q.id]).filter(Boolean);
                    const pkgCorrect = pkgAttempts.filter((a) => a.isCorrect).length;
                    const pkgScore = pkgAttempts.reduce((sum, a) => sum + a.earnedXp, 0);
                    const pkgTotalMinutes = pkgQuestions.length * MINUTES_PER_QUESTION;
                    const isFinished =
                      pkgAttempts.length === pkgQuestions.length && pkgQuestions.length > 0;
                    const isRecommended = chapter.id === recommendedChapter.id;
                    const isGuideOpen = openGuideId === chapter.id;

                    return (
                      <div
                        key={chapter.id}
                        className={`p-5 md:px-6 transition-colors ${
                          isFinished
                            ? 'bg-emerald-50/25'
                            : isRecommended
                              ? 'bg-sky-50/30'
                              : 'bg-white'
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold border ${
                                isFinished
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : isRecommended
                                    ? 'bg-sky-600 border-sky-600 text-white'
                                    : chapter.isEvaluation
                                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                                      : 'bg-slate-100 border-slate-200 text-slate-700'
                              }`}
                            >
                              {isFinished ? (
                                <CheckCircle2 className="h-5 w-5" />
                              ) : chapter.isEvaluation ? (
                                <ClipboardCheck className="h-4.5 w-4.5" />
                              ) : (
                                globalIdx + 1
                              )}
                            </div>

                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span
                                  className={
                                    isFinished
                                      ? 'font-bold text-emerald-700'
                                      : chapter.isEvaluation
                                        ? 'font-bold text-rose-700'
                                        : isRecommended
                                          ? 'font-bold text-sky-700'
                                          : 'font-semibold text-slate-700'
                                  }
                                >
                                  {chapter.orderLabel}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums">{pkgQuestions.length} Soal</span>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 font-mono font-medium text-slate-700 tabular-nums">
                                  <Clock className="h-3 w-3 text-slate-400" />
                                  {pkgTotalMinutes} Menit
                                </span>
                                {pkgAttempts.length > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                                      {pkgScore} poin ({pkgCorrect}/{pkgQuestions.length} benar)
                                    </span>
                                  </>
                                )}
                              </div>
                              <h4 className="text-base font-bold text-slate-950">
                                {chapter.title}
                              </h4>
                              <p className="text-xs md:text-sm text-slate-600">{chapter.subtitle}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0 pl-14 md:pl-0">
                            <button
                              type="button"
                              onClick={() => setOpenGuideId(isGuideOpen ? null : chapter.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              <span>Ringkasan Materi</span>
                              {isGuideOpen ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => onStartWorld(chapter.id)}
                              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs md:text-sm font-bold text-white transition-colors whitespace-nowrap shrink-0 ${
                                isFinished
                                  ? 'bg-emerald-600 hover:bg-emerald-700'
                                  : isRecommended
                                    ? 'bg-sky-600 hover:bg-sky-700'
                                    : chapter.isEvaluation
                                      ? 'bg-rose-600 hover:bg-rose-700'
                                      : 'bg-slate-900 hover:bg-slate-800'
                              }`}
                            >
                              <span>
                                {isFinished
                                  ? 'Lihat Ulang'
                                  : pkgAttempts.length > 0
                                    ? 'Lanjut'
                                    : 'Mulai'}
                              </span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {isGuideOpen && (
                          <div className="mt-4 pt-3.5 border-t border-amber-200/80 bg-amber-50/60 -mx-5 -mb-5 md:-mx-6 px-5 md:px-6 py-4 space-y-1.5">
                            <div className="text-xs font-bold text-amber-950">
                              {chapter.introTitle}
                            </div>
                            <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4 leading-relaxed">
                              {chapter.introPoints.map((pt, i) => (
                                <li key={i}>{pt}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
