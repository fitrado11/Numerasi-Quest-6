import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, PenTool, Search, UserCheck } from 'lucide-react';
import { GRADE_6_ROSTER } from '../data/studentsRoster';

interface RosterOption {
  id: string;
  name: string;
  className: string;
}

interface OnboardingWelcomeProps {
  initialStudentId?: string;
  initialName: string;
  initialClassName?: string;
  isSaving?: boolean;
  onComplete: (studentId: string, studentName: string, className: string) => void;
  onOpenTeacherMode: () => void;
}

export const OnboardingWelcome: React.FC<OnboardingWelcomeProps> = ({
  initialStudentId = '',
  initialName,
  initialClassName = 'Kelas 6',
  isSaving = false,
  onComplete,
  onOpenTeacherMode,
}) => {
  const [roster, setRoster] = useState<RosterOption[]>(GRADE_6_ROSTER);
  const [searchQuery, setSearchQuery] = useState(
    initialName && initialName !== 'Siswa Kelas 6' ? initialName : ''
  );
  const [selectedStudent, setSelectedStudent] = useState<RosterOption | null>(() => {
    if (initialStudentId) {
      const match = GRADE_6_ROSTER.find((s) => s.id === initialStudentId);
      if (match) return match;
      if (initialName && initialName !== 'Siswa Kelas 6') {
        return { id: initialStudentId, name: initialName, className: initialClassName };
      }
    }
    return null;
  });
  const [className, setClassName] = useState(initialClassName || 'Kelas 6');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/students/roster')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { roster?: RosterOption[] } | null) => {
        if (!cancelled && data?.roster && data.roster.length > 0) {
          setRoster(data.roster);
        }
      })
      .catch(() => {
        // Keep seeded GRADE_6_ROSTER fallback if offline
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRoster = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((item) => item.name.toLowerCase().includes(q));
  }, [roster, searchQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!selectedStudent) {
      setError('Cari dan klik namamu dari daftar siswa Kelas 6 terlebih dahulu.');
      return;
    }
    onComplete(selectedStudent.id, selectedStudent.name, className);
  };

  const steps = [
    {
      num: '1',
      icon: BookOpen,
      title: 'Pilih Dunia Berurutan',
      desc: 'Mulai dari Dunia 1 sampai Boss Terakhir. Satu dunia berisi 6–10 soal.',
    },
    {
      num: '2',
      icon: PenTool,
      title: 'Baca Teliti & Hitung',
      desc: 'Hitung di kertas coretanmu, waspadai angka pengecoh, lalu pilih jawaban terbaik.',
    },
    {
      num: '3',
      icon: CheckCircle2,
      title: 'Pelajari & Kumpulkan XP',
      desc: 'Gunakan Petunjuk atau Tutor AI jika bingung. Tetap fokus di halaman ini selama kuis berlangsung.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 px-6 py-10">
      <div className="mx-auto w-full max-w-2xl flex items-center justify-between">
        <span className="text-base font-bold tracking-tight text-slate-900">
          Numerasi Quest
        </span>
        <button
          type="button"
          onClick={onOpenTeacherMode}
          className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline underline-offset-4"
        >
          Mode Guru
        </button>
      </div>

      <main className="mx-auto w-full max-w-2xl my-8 rounded-2xl border border-slate-200 bg-white p-7 md:p-10 space-y-8">
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-sky-700">
            Matematika SD Kelas 6 · Belajar Langkah demi Langkah
          </p>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-950 [text-wrap:balance]">
            Halo! Siap Berlatih Hitungan Hari Ini?
          </h1>
          <p className="text-sm md:text-base text-slate-600 leading-relaxed">
            Ikuti 3 langkah sederhana di bawah ini sebelum mulai bermain dan belajar.
          </p>
        </div>

        {/* 3 Sequential Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-sky-700">
                    Langkah {step.num}
                  </span>
                  <Icon className="h-4 w-4 text-slate-500" />
                </div>
                <h2 className="text-sm font-bold text-slate-900">{step.title}</h2>
                <p className="text-xs text-slate-600 leading-relaxed">{step.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Single Clear Initiation Form */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2 space-y-1.5">
              <label
                htmlFor="onboarding-search"
                className="block text-sm font-bold text-slate-900"
              >
                Cari &amp; Pilih Namamu ({roster.length} Siswa Terdaftar)
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="onboarding-search"
                  type="text"
                  autoFocus
                  value={searchQuery}
                  disabled={isSaving}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (selectedStudent && e.target.value !== selectedStudent.name) {
                      setSelectedStudent(null);
                    }
                    if (error) setError(null);
                  }}
                  placeholder="Ketik namamu, misal: Abrar atau Salma..."
                  className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="onboarding-class"
                className="block text-sm font-bold text-slate-900"
              >
                Kelas
              </label>
              <select
                id="onboarding-class"
                value={className}
                disabled={isSaving}
                onChange={(e) => setClassName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
              >
                <option value="Kelas 6">Kelas 6</option>
                <option value="Kelas 6A">Kelas 6A</option>
                <option value="Kelas 6B">Kelas 6B</option>
                <option value="Kelas 6C">Kelas 6C</option>
              </select>
            </div>
          </div>

          {/* Searchable Student Picker List */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2 max-h-48 overflow-y-auto space-y-1">
            {filteredRoster.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                Nama tidak ditemukan di daftar. Coba periksa ejaan atau hubungi guru.
              </div>
            ) : (
              filteredRoster.map((stu) => {
                const isSelected = selectedStudent?.id === stu.id;
                return (
                  <button
                    key={stu.id}
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      setSelectedStudent(stu);
                      setSearchQuery(stu.name);
                      setClassName(stu.className || 'Kelas 6');
                      if (error) setError(null);
                    }}
                    className={`w-full rounded-lg px-3.5 py-2 text-left text-sm flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-sky-600 text-white font-semibold'
                        : 'bg-white text-slate-800 hover:bg-sky-50 border border-slate-200/70'
                    }`}
                  >
                    <span>{stu.name}</span>
                    {isSelected && <UserCheck className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {selectedStudent && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-900 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Nama terpilih: <strong>{selectedStudent.name}</strong> ({className})
              </span>
            </div>
          )}

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 py-3.5 text-base font-bold text-white hover:bg-sky-700 transition-colors disabled:opacity-60"
          >
            <span>{isSaving ? 'Menyiapkan Papan Belajar...' : 'Lanjut ke Peta Dunia'}</span>
            <ArrowRight className="h-4.5 w-4.5" />
          </button>
        </form>
      </main>

      <div className="mx-auto w-full max-w-2xl text-center text-xs text-slate-400">
        Numerasi Quest · Latihan Terstruktur SD Kelas 6
      </div>
    </div>
  );
};
