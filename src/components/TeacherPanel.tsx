import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Question, StudentSummary, WorldChapter } from '../types/quiz';

interface TeacherPanelProps {
  questions: Question[];
  chapters: WorldChapter[];
  reviewedQuestionIds: string[];
  onRefreshState: () => Promise<void>;
  onUpdateQuestionOverride: (
    questionId: string,
    payload: { questionText?: string; options?: string[]; isReviewed?: boolean }
  ) => void;
}

export const TeacherPanel: React.FC<TeacherPanelProps> = ({
  questions,
  chapters,
  reviewedQuestionIds,
  onRefreshState,
  onUpdateQuestionOverride,
}) => {
  const [verifiedPin, setVerifiedPin] = useState<string | null>(null);
  const [loginPinInput, setLoginPinInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState<'all' | 'active' | 'not-started'>('all');
  const [newStudentName, setNewStudentName] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);

  const [pinDraft, setPinDraft] = useState('');
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [filterChapter, setFilterChapter] = useState<string>('flagged');

  const flaggedQuestions = questions.filter((q) => q.needsTeacherReview);
  const errorHuntQuestions = questions.filter((q) => q.isErrorHunt);

  const displayedQuestions =
    filterChapter === 'flagged'
      ? flaggedQuestions
      : filterChapter === 'error-hunt'
        ? errorHuntQuestions
        : questions.filter((q) => q.chapterId === filterChapter);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (studentFilter === 'active' && s.attemptCount === 0) return false;
      if (studentFilter === 'not-started' && s.attemptCount > 0) return false;
      return true;
    });
  }, [students, studentSearch, studentFilter]);

  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPinInput.trim() || verifying) return;
    setVerifying(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/teacher/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: loginPinInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setLoginError(data.error || 'PIN Guru tidak cocok.');
      } else {
        const cleanPin = loginPinInput.trim();
        setVerifiedPin(cleanPin);
        setPinDraft(cleanPin);
        setStudents(Array.isArray(data.students) ? data.students : []);
        setLoginPinInput('');
      }
    } catch {
      setLoginError('Gagal terhubung ke server untuk memeriksa PIN.');
    } finally {
      setVerifying(false);
    }
  };

  const refreshTeacherOverview = async (pinToUse = verifiedPin) => {
    if (!pinToUse) return;
    try {
      const res = await fetch('/api/teacher/overview', {
        headers: { 'x-teacher-pin': pinToUse },
      });
      if (!res.ok) return;
      const data = await res.json();
      setStudents(Array.isArray(data.students) ? data.students : []);
      await onRefreshState();
    } catch {
      // Ignore transient refresh errors
    }
  };

  const handleSaveSettings = async (newPin: string) => {
    if (!verifiedPin || !newPin.trim()) return;
    setSettingsStatus(null);
    try {
      const res = await fetch('/api/teacher/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-teacher-pin': verifiedPin,
        },
        body: JSON.stringify({
          teacherPin: newPin.trim(),
        }),
      });
      if (!res.ok) {
        setSettingsStatus('Gagal menyimpan PIN Guru.');
        return;
      }
      setVerifiedPin(newPin.trim());
      setSettingsStatus('PIN Guru berhasil diperbarui.');
      await onRefreshState();
    } catch {
      setSettingsStatus('Koneksi terganggu saat menyimpan.');
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifiedPin || !newStudentName.trim() || addingStudent) return;
    setAddingStudent(true);
    try {
      const res = await fetch('/api/teacher/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teacher-pin': verifiedPin,
        },
        body: JSON.stringify({
          name: newStudentName.trim(),
          className: 'Kelas 6',
        }),
      });
      if (res.ok) {
        setNewStudentName('');
        await refreshTeacherOverview();
      }
    } finally {
      setAddingStudent(false);
    }
  };

  const handleToggleReviewed = async (q: Question) => {
    if (!verifiedPin) return;
    const nextReviewed = !reviewedQuestionIds.includes(q.id);
    onUpdateQuestionOverride(q.id, { isReviewed: nextReviewed });
    await fetch(`/api/teacher/questions/${encodeURIComponent(q.id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-teacher-pin': verifiedPin,
      },
      body: JSON.stringify({ isReviewed: nextReviewed }),
    });
  };

  const startEditing = (q: Question) => {
    setEditingId(q.id);
    setEditPrompt(q.questionText);
    setEditOptions([...q.options]);
  };

  const saveEdit = async (q: Question) => {
    if (!verifiedPin) return;
    const cleanText = editPrompt.trim() || q.questionText;
    onUpdateQuestionOverride(q.id, {
      questionText: cleanText,
      options: editOptions,
      isReviewed: true,
    });
    setEditingId(null);

    await fetch(`/api/teacher/questions/${encodeURIComponent(q.id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-teacher-pin': verifiedPin,
      },
      body: JSON.stringify({
        questionText: cleanText,
        options: editOptions,
        isReviewed: true,
      }),
    });
  };

  if (!verifiedPin) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-7 space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 border border-sky-200 text-sky-700">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-950">Masuk Mode Guru</h1>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Masukkan PIN Guru untuk mengelola bank soal dan memantau nilai serta catatan fokus siswa Kelas 6.
              </p>
            </div>
          </div>

          <form onSubmit={handleTeacherLogin} className="space-y-4">
            <div>
              <label htmlFor="teacher-gate-pin" className="block text-xs font-semibold text-slate-700 mb-1.5">
                PIN Guru
              </label>
              <input
                id="teacher-gate-pin"
                type="password"
                autoFocus
                value={loginPinInput}
                onChange={(e) => {
                  setLoginPinInput(e.target.value);
                  if (loginError) setLoginError(null);
                }}
                placeholder="Masukkan PIN..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
              />
              {loginError && <p className="mt-1.5 text-xs font-medium text-red-600">{loginError}</p>}
              <p className="mt-2 text-[11px] text-slate-400">
                PIN bawaan awal: <code className="font-mono text-slate-600">GURU6</code> (segera ubah setelah masuk).
              </p>
            </div>

            <button
              type="submit"
              disabled={verifying || !loginPinInput.trim()}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {verifying ? 'Memeriksa PIN...' : 'Buka Panel Guru'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1360px] px-6 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-sky-700">Kontrol Pengajar &amp; Kurasi Bank Soal Kelas 6</p>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-950">
            Panel Guru — Verifikasi Soal &amp; Pantauan Siswa
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">
            Kelola PIN akses Mode Guru, pantau progres serta log fokus siswa Kelas 6, tambah siswa baru bila diperlukan, dan tinjau soal yang ditandai (khususnya <strong>Soal 5A.3</strong> dan <strong>Soal 5B.3</strong>).
          </p>
        </div>

        <button
          type="button"
          onClick={() => refreshTeacherOverview()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Muat Ulang Data</span>
        </button>
      </div>

      {/* Security & Pedagogy Settings */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ShieldCheck className="h-4.5 w-4.5 text-sky-600" />
            <span>Keamanan Akses Guru &amp; Perlindungan Layar</span>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pin-input" className="block text-xs font-semibold text-slate-700">
              PIN Akses Mode Guru
            </label>
            <div className="flex gap-2">
              <input
                id="pin-input"
                type="text"
                value={pinDraft}
                onChange={(e) => {
                  setPinDraft(e.target.value);
                  setSettingsStatus(null);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-sky-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleSaveSettings(pinDraft)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Simpan PIN
              </button>
            </div>
            {settingsStatus && (
              <p className="text-xs font-medium text-emerald-700">{settingsStatus}</p>
            )}
          </div>

          <p className="text-xs text-slate-500 leading-relaxed pt-1 border-t border-slate-100">
            Soal otomatis tertutup tirai privasi jika siswa berpindah tab, membuka split-screen, atau menekan tombol tangkapan layar, disertai watermark identitas siswa dan jeda baca 6 detik sebelum mengirim jawaban.
          </p>
        </div>

        {/* Summary of Special Pedagogy Rules */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
          <div className="text-sm font-bold text-slate-900">Ringkasan Kepatuhan Aturan Kuis</div>
          <ul className="space-y-2 text-xs text-slate-600 leading-relaxed">
            <li>
              <strong className="text-slate-900">Ronde per Bab:</strong> Bab 1–4 sebagai dunia berjenjang; Bab 5 (Versi A: 8 soal, Versi B: 6 soal) sebagai Boss Battle Bridge Unit.
            </li>
            <li>
              <strong className="text-slate-900">Soal Pelacak Kesalahan (5 soal):</strong> Soal 2.2, 2.4, 4.6, 5A.5, dan 5B.5 dilengkapi kotak klaim siswa untuk mode <em>Cari Kesalahannya</em>.
            </li>
            <li>
              <strong className="text-slate-900">Soal Verifikasi Awal (2 soal):</strong> Soal 5A.3 (pola berkas asal rusak <code className="font-mono">4□7,2□5</code>) dan Soal 5B.3 (koreksi anggaran 487 siswa Rp39.398.300 &lt; Rp40.000.000).
            </li>
          </ul>
        </div>
      </section>

      {/* Student Roster & Integrity Monitoring */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4.5 w-4.5 text-sky-600" />
              <h2 className="text-base font-bold text-slate-950">
                Pantauan Siswa Terdaftar ({students.length} Siswa)
              </h2>
            </div>

            <form onSubmit={handleAddStudent} className="flex items-center gap-2">
              <input
                type="text"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="Tambah nama siswa baru..."
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={addingStudent || !newStudentName.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah</span>
              </button>
            </form>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Cari nama siswa..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'active', label: 'Sudah Mengerjakan' },
                  { id: 'not-started', label: 'Belum Mulai' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStudentFilter(tab.id)}
                  className={`rounded-lg px-2.5 py-1.5 font-semibold transition-colors ${
                    studentFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 w-12">No</th>
                <th className="px-6 py-3">Nama Siswa</th>
                <th className="px-6 py-3">Kelas</th>
                <th className="px-6 py-3">Benar / Dijawab</th>
                <th className="px-6 py-3">Total XP</th>
                <th className="px-6 py-3">Catatan Fokus / Screenshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((stu, idx) => (
                <tr key={stu.id} className="hover:bg-slate-50/70">
                  <td className="px-6 py-3 font-mono text-xs text-slate-400 tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="px-6 py-3 font-semibold text-slate-900">{stu.name}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{stu.className}</td>
                  <td className="px-6 py-3 font-mono tabular-nums text-slate-700">
                    {stu.correctCount} / {stu.attemptCount}
                  </td>
                  <td className="px-6 py-3 font-mono tabular-nums font-bold text-sky-700">
                    {stu.totalXp} XP
                  </td>
                  <td className="px-6 py-3 font-mono tabular-nums text-xs">
                    <span
                      className={
                        stu.violationCount > 0
                          ? 'font-semibold text-amber-700'
                          : 'text-emerald-700 font-medium'
                      }
                    >
                      {stu.violationCount > 0 ? `${stu.violationCount} kejadian tercatat` : 'Bersih'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Question Audit & Editor */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-950">Kurasi &amp; Verifikasi Soal</h2>

          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setFilterChapter('flagged')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                filterChapter === 'flagged' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Perlu Dicek ({flaggedQuestions.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterChapter('error-hunt')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                filterChapter === 'error-hunt' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cari Kesalahannya ({errorHuntQuestions.length})
            </button>
            {chapters.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setFilterChapter(ch.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  filterChapter === ch.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {ch.orderLabel.replace('Boss Battle · ', 'Bab 5 ')}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {displayedQuestions.map((q) => {
            const isReviewed = reviewedQuestionIds.includes(q.id);
            const isEditing = editingId === q.id;

            return (
              <div
                key={q.id}
                className={`rounded-xl border bg-white p-5 space-y-3 ${
                  q.needsTeacherReview && !isReviewed ? 'border-amber-300' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-slate-900">{q.numberLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-700">{q.title}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-500">Level {q.level} ({q.xp} XP)</span>
                    {q.isErrorHunt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-rose-700">Cari Kesalahannya</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {q.needsTeacherReview && (
                      <button
                        type="button"
                        onClick={() => handleToggleReviewed(q)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                          isReviewed
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                        }`}
                      >
                        {isReviewed ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Terverifikasi Guru</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>Tandai Sudah Dicek</span>
                          </>
                        )}
                      </button>
                    )}

                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => startEditing(q)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Edit Soal</span>
                      </button>
                    )}
                  </div>
                </div>

                {q.teacherNote && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
                    <strong>Catatan Pemeriksaan:</strong> {q.teacherNote}
                  </div>
                )}

                {isEditing ? (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Bunyi Soal
                      </label>
                      <textarea
                        rows={3}
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {editOptions.map((opt, idx) => (
                        <div key={idx}>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            {idx === q.correctIndex ? `Opsi Benar (${idx + 1})` : `Pengecoh (${idx + 1})`}
                          </label>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const next = [...editOptions];
                              next[idx] = e.target.value;
                              setEditOptions(next);
                            }}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(q)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>Simpan Perubahan</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm text-slate-700">
                    <p>{q.questionText}</p>
                    <div className="text-xs text-slate-500">
                      <strong>Kunci:</strong> {q.finalAnswer} · <strong>Jebakan Pengecoh:</strong> {q.trapWarning}
                    </div>
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
