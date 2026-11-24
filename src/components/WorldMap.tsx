import React, { useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, ChevronDown, ChevronUp, Swords } from 'lucide-react';
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

  const totalXp = Object.values(attempts).reduce((sum, a) => sum + a.earnedXp, 0);
  const completedCount = Object.keys(attempts).length;

  // Find the first unfinished world in sequential order as the single focal recommendation
  const recommendedChapter =
    chapters.find((ch) => {
      const qs = questions.filter((q) => q.chapterId === ch.id);
      const done = qs.filter((q) => Boolean(attempts[q.id])).length;
      return done < qs.length;
    }) ?? chapters[0];

  const recQuestions = questions.filter((q) => q.chapterId === recommendedChapter.id);
  const recDone = recQuestions.filter((q) => Boolean(attempts[q.id])).length;

  return (
    <div className="mx-auto max-w-[1040px] px-6 py-8 space-y-8">
      {/* Quiet Student Greeting & Single XP Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold text-sky-700">
            Halo, {studentName || 'Teman'} · Matematika SD Kelas 6
          </p>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-950 mt-0.5">
            Peta Dunia Belajar
          </h1>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 tabular-nums">
            <span className="text-xs text-slate-500 mr-2">XP Kamu</span>
            <strong className="font-mono text-base font-bold text-sky-700">{totalXp} XP</strong>
            <span className="text-xs text-slate-400 ml-2">({completedCount}/{questions.length} soal)</span>
          </div>
          <button
            type="button"
            onClick={onEditStudentName}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline underline-offset-4 whitespace-nowrap"
          >
            Ganti Nama
          </button>
        </div>
      </div>

      {/* Single Focal Anchor: Next Recommended Step */}
      <section className="rounded-2xl border border-sky-200 bg-white p-6 md:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <p className="text-xs font-bold text-sky-700">
            {recDone > 0 ? 'Lanjutkan Langkahmu' : 'Mulai Dari Sini'} · {recommendedChapter.orderLabel}
          </p>
          <h2 className="text-xl md:text-2xl font-extrabold text-slate-950">
            {recommendedChapter.title}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            {recommendedChapter.subtitle} — selesaikan {recQuestions.length} soal satu per satu dengan teliti.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onStartWorld(recommendedChapter.id)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 py-3.5 text-sm md:text-base font-bold text-white hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
        >
          <span>
            {recDone > 0
              ? `Lanjut (${recDone}/${recQuestions.length})`
              : `Mulai ${recommendedChapter.orderLabel}`}
          </span>
          <ArrowRight className="h-4.5 w-4.5" />
        </button>
      </section>

      {/* Sequential Path List (1 -> 2 -> 3 -> 4 -> Boss) */}
      <section className="space-y-3.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold text-slate-900">Urutan Dunia Belajar</h2>
          <span className="text-xs text-slate-500">Kerjakan berurutan agar makin mudah</span>
        </div>

        <div className="space-y-3">
          {chapters.map((chapter, idx) => {
            const worldQuestions = questions.filter((q) => q.chapterId === chapter.id);
            const worldAttempts = worldQuestions.map((q) => attempts[q.id]).filter(Boolean);
            const worldCorrect = worldAttempts.filter((a) => a.isCorrect).length;
            const worldEarnedXp = worldAttempts.reduce((sum, a) => sum + a.earnedXp, 0);
            const isFinished =
              worldAttempts.length === worldQuestions.length && worldQuestions.length > 0;
            const isRecommended = chapter.id === recommendedChapter.id;
            const isGuideOpen = openGuideId === chapter.id;

            return (
              <div
                key={chapter.id}
                className={`rounded-xl border bg-white p-5 transition-colors ${
                  isRecommended
                    ? 'border-sky-300'
                    : chapter.isBoss
                      ? 'border-rose-200'
                      : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold border ${
                        isFinished
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : chapter.isBoss
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : isRecommended
                              ? 'bg-sky-50 border-sky-200 text-sky-700'
                              : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {isFinished ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : chapter.isBoss ? (
                        <Swords className="h-4.5 w-4.5" />
                      ) : (
                        idx + 1
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className={chapter.isBoss ? 'font-bold text-rose-700' : 'font-semibold text-slate-700'}>
                          {chapter.orderLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{worldQuestions.length} Soal</span>
                        {worldAttempts.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-semibold text-sky-700 tabular-nums">
                              {worldEarnedXp} XP ({worldCorrect}/{worldQuestions.length} benar)
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="text-base md:text-lg font-bold text-slate-950">
                        {chapter.title}
                      </h3>
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
                      <span>Jurus</span>
                      {isGuideOpen ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onStartWorld(chapter.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs md:text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 ${
                        chapter.isBoss
                          ? 'bg-rose-600 hover:bg-rose-700'
                          : isRecommended
                            ? 'bg-sky-600 hover:bg-sky-700'
                            : 'bg-slate-900 hover:bg-slate-800'
                      }`}
                    >
                      <span>
                        {isFinished
                          ? 'Ulangi'
                          : worldAttempts.length > 0
                            ? 'Lanjut'
                            : 'Mulai'}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isGuideOpen && (
                  <div className="mt-4 pt-3.5 border-t border-slate-100 rounded-lg bg-slate-50 p-4 space-y-1.5">
                    <div className="text-xs font-bold text-slate-900">{chapter.introTitle}</div>
                    <ul className="space-y-1 text-xs text-slate-600 list-disc pl-4 leading-relaxed">
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
      </section>
    </div>
  );
};
