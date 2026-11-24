import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, Search, ShieldAlert, Trash2, Trophy } from 'lucide-react';
import { AttemptRecord, Question, ViolationLog, WorldChapter } from '../types/quiz';

interface LeaderboardRow {
  id: string;
  name: string;
  className: string;
  totalXp: number;
  correctCount: number;
  attemptCount: number;
}

interface LeaderboardAndStatsProps {
  studentId: string;
  studentName: string;
  chapters: WorldChapter[];
  questions: Question[];
  attempts: Record<string, AttemptRecord>;
  violations: ViolationLog[];
  onResetProgress: () => void;
}

export const LeaderboardAndStats: React.FC<LeaderboardAndStatsProps> = ({
  studentId,
  studentName,
  chapters,
  questions,
  attempts,
  violations,
  onResetProgress,
}) => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/leaderboard')
      .then((res) => (res.ok ? res.json() : { leaderboard: [] }))
      .then((data: { leaderboard?: LeaderboardRow[] }) => {
        if (!cancelled && Array.isArray(data.leaderboard)) {
          setLeaderboard(data.leaderboard);
        }
      })
      .catch(() => {
        // Keep page clean if leaderboard temporarily fails
      });
    return () => {
      cancelled = true;
    };
  }, [attempts, studentName]);

  const attemptList = Object.values(attempts);
  const totalXp = attemptList.reduce((sum, a) => sum + a.earnedXp, 0);
  const maxXp = questions.reduce((sum, q) => sum + q.xp, 0);
  const totalCorrect = attemptList.filter((a) => a.isCorrect).length;
  const accuracy = attemptList.length > 0 ? Math.round((totalCorrect / attemptList.length) * 100) : 0;

  const errorHuntQuestions = questions.filter((q) => q.isErrorHunt);
  const errorHuntSolved = errorHuntQuestions.filter((q) => attempts[q.id]?.isCorrect).length;

  return (
    <div className="mx-auto max-w-[1360px] px-6 py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-sky-700">Laporan Kemajuan Belajar</p>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-950">
            Rekap Nilai &amp; Integritas — {studentName || 'Siswa Kelas 6'}
          </h1>
        </div>

        <button
          type="button"
          onClick={onResetProgress}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors self-start md:self-auto"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Reset Progres Siswa</span>
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total XP Terkumpul</span>
            <Award className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-950 tabular-nums">
            {totalXp} <span className="text-sm font-normal text-slate-400">/ {maxXp} XP</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Akurasi Jawaban</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {accuracy}% <span className="text-sm font-normal text-slate-400">({totalCorrect}/{attemptList.length})</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Soal Cari Kesalahan</span>
            <Search className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-950 tabular-nums">
            {errorHuntSolved} <span className="text-sm font-normal text-slate-400">/ {errorHuntQuestions.length} tuntas</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Log Aktivitas Mencurigakan</span>
            <ShieldAlert className="h-4 w-4 text-red-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-950 tabular-nums">
            {violations.length} <span className="text-sm font-normal text-slate-400">kejadian</span>
          </div>
        </div>
      </div>

      {/* Per-World Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-bold text-slate-950">Rincian Penguasaan per Dunia</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Dunia / Bab</th>
                <th className="px-6 py-3">Terjawab</th>
                <th className="px-6 py-3">Benar</th>
                <th className="px-6 py-3">XP Diraih</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chapters.map((ch) => {
                const worldQs = questions.filter((q) => q.chapterId === ch.id);
                const worldAttempts = worldQs.map((q) => attempts[q.id]).filter(Boolean);
                const worldCorrect = worldAttempts.filter((a) => a.isCorrect).length;
                const worldXp = worldAttempts.reduce((sum, a) => sum + a.earnedXp, 0);
                const worldMax = worldQs.reduce((sum, q) => sum + q.xp, 0);

                return (
                  <tr key={ch.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5">
                      <div className="font-semibold text-slate-900">{ch.orderLabel}: {ch.title}</div>
                      <div className="text-xs text-slate-500">{ch.subtitle}</div>
                    </td>
                    <td className="px-6 py-3.5 font-mono tabular-nums text-slate-700">
                      {worldAttempts.length} / {worldQs.length}
                    </td>
                    <td className="px-6 py-3.5 font-mono tabular-nums text-emerald-700 font-semibold">
                      {worldCorrect}
                    </td>
                    <td className="px-6 py-3.5 font-mono tabular-nums text-sky-700 font-semibold">
                      {worldXp} / {worldMax}
                    </td>
                    <td className="px-6 py-3.5 text-xs">
                      {worldAttempts.length === 0 ? (
                        <span className="text-slate-400">Belum dimulai</span>
                      ) : worldAttempts.length === worldQs.length ? (
                        <span className="font-semibold text-emerald-700">Selesai</span>
                      ) : (
                        <span className="font-semibold text-amber-700">Sedang Berlangsung</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Class Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4.5 w-4.5 text-amber-600" />
              <h2 className="text-base font-bold text-slate-950">Papan Peringkat Kelas</h2>
            </div>
            <span className="text-xs text-slate-500">Urutan berdasarkan XP terbanyak</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 w-16">Posisi</th>
                  <th className="px-6 py-3">Nama Siswa</th>
                  <th className="px-6 py-3">Kelas</th>
                  <th className="px-6 py-3">Soal Benar</th>
                  <th className="px-6 py-3">Total XP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaderboard.map((row, idx) => {
                  const isMe = row.id === studentId;
                  return (
                    <tr
                      key={row.id}
                      className={isMe ? 'bg-sky-50/60 font-semibold' : 'hover:bg-slate-50/70'}
                    >
                      <td className="px-6 py-3 font-mono tabular-nums text-slate-700">#{idx + 1}</td>
                      <td className="px-6 py-3 text-slate-900">
                        {row.name} {isMe && <span className="text-xs font-semibold text-sky-700">(Kamu)</span>}
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-600">{row.className}</td>
                      <td className="px-6 py-3 font-mono tabular-nums text-emerald-700">
                        {row.correctCount} / {row.attemptCount}
                      </td>
                      <td className="px-6 py-3 font-mono tabular-nums font-bold text-sky-700">
                        {row.totalXp} XP
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Integrity Log */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-950">Log Pemantauan Aktivitas Mencurigakan</h2>
          <span className="text-xs text-slate-500">Tercatat otomatis saat pindah tab / salin teks</span>
        </div>
        {violations.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            Bersih — belum ada aktivitas mencurigakan yang tercatat.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {violations.slice().reverse().map((v) => (
              <div key={v.id} className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-red-700">{v.questionLabel}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="text-slate-800">{v.detail}</span>
                </div>
                <span className="font-mono text-slate-500 tabular-nums shrink-0">{v.timestamp}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
