import { useCallback, useEffect, useMemo, useState } from 'react';
import { INITIAL_QUESTIONS, WORLD_CHAPTERS } from './data/questions';
import {
  AttemptRecord,
  ChapterId,
  Question,
  QuestionOverride,
  StudentProfile,
  ViolationLog,
} from './types/quiz';
import { ActiveView, TopNav } from './components/TopNav';
import { OnboardingWelcome } from './components/OnboardingWelcome';
import { WorldMap } from './components/WorldMap';
import { QuizArena } from './components/QuizArena';
import { LeaderboardAndStats } from './components/LeaderboardAndStats';
import { TeacherPanel } from './components/TeacherPanel';

const STUDENT_ID_KEY = 'numerasi_quest_student_id';

interface StudentStateResponse {
  student: StudentProfile;
  attempts: Record<string, AttemptRecord>;
  violations: ViolationLog[];
  overrides: Record<string, QuestionOverride>;
}

export default function App() {
  const [studentId, setStudentId] = useState<string>(() => {
    try {
      return localStorage.getItem(STUDENT_ID_KEY) || '';
    } catch {
      return '';
    }
  });
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [activeChapterId, setActiveChapterId] = useState<ChapterId>('bab1');
  const [attempts, setAttempts] = useState<Record<string, AttemptRecord>>({});
  const [violations, setViolations] = useState<ViolationLog[]>([]);
  const [overrides, setOverrides] = useState<Record<string, QuestionOverride>>({});
  const [activeView, setActiveView] = useState<ActiveView>('map');

  const applyServerState = useCallback((data: StudentStateResponse) => {
    setStudentId(data.student.id);
    setStudentProfile(data.student);
    setHasCompletedOnboarding(data.student.hasCompletedOnboarding);
    setActiveChapterId(data.student.activeChapterId || 'bab1');
    setAttempts(data.attempts || {});
    setViolations(data.violations || []);
    setOverrides(data.overrides || {});
  }, []);

  const loadInitialFromServer = useCallback(async () => {
    try {
      if (studentId) {
        const res = await fetch(`/api/students/${encodeURIComponent(studentId)}/state`);
        if (res.ok) {
          const data = (await res.json()) as StudentStateResponse;
          applyServerState(data);
          return;
        }
      }
      const ovRes = await fetch('/api/questions/overrides');
      if (ovRes.ok) {
        const ovData = (await ovRes.json()) as { overrides?: Record<string, QuestionOverride> };
        setOverrides(ovData.overrides || {});
      }
    } catch {
      // Allow UI to continue cleanly if offline briefly
    } finally {
      setIsInitializing(false);
    }
  }, [applyServerState, studentId]);

  useEffect(() => {
    loadInitialFromServer();
  }, [loadInitialFromServer]);

  const mergedQuestions: Question[] = useMemo(() => {
    return INITIAL_QUESTIONS.map((q) => {
      const ov = overrides[q.id];
      if (!ov) return q;
      return {
        ...q,
        questionText: ov.questionText ?? q.questionText,
        options: ov.options ?? q.options,
        teacherNote: ov.teacherNote ?? q.teacherNote,
      };
    });
  }, [overrides]);

  const reviewedQuestionIds = useMemo(
    () => Object.values(overrides).filter((o) => o.isReviewed).map((o) => o.questionId),
    [overrides]
  );

  const activeChapter =
    WORLD_CHAPTERS.find((c) => c.id === activeChapterId) ?? WORLD_CHAPTERS[0];

  const activeQuestions = mergedQuestions.filter((q) => q.chapterId === activeChapter.id);

  const handleCompleteOnboarding = async (
    selectedStudentId: string,
    name: string,
    className: string
  ) => {
    setIsSavingProfile(true);
    try {
      const res = await fetch('/api/students/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudentId || undefined,
          name,
          className,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as StudentStateResponse;
        try {
          localStorage.setItem(STUDENT_ID_KEY, data.student.id);
        } catch {
          // Ignore storage restriction
        }
        applyServerState(data);
        setActiveView('map');
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleStartWorld = (chapterId: ChapterId) => {
    setActiveChapterId(chapterId);
    setActiveView('quiz');
    if (studentId) {
      fetch(`/api/students/${encodeURIComponent(studentId)}/chapter`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId }),
      }).catch(() => {});
    }
  };

  const handleRecordAttempt = (attempt: AttemptRecord) => {
    setAttempts((prev) => ({
      ...prev,
      [attempt.questionId]: attempt,
    }));
    if (studentId) {
      fetch(`/api/students/${encodeURIComponent(studentId)}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt),
      }).catch(() => {});
    }
  };

  const handleRecordViolation = (violation: Omit<ViolationLog, 'id' | 'timestamp'>) => {
    const optimisticEntry: ViolationLog = {
      ...violation,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };

    setViolations((prev) => [...prev, optimisticEntry]);

    if (studentId) {
      fetch(`/api/students/${encodeURIComponent(studentId)}/violations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(violation),
      }).catch(() => {});
    }
  };

  const handleResetProgress = async () => {
    setAttempts({});
    setViolations([]);
    if (studentId) {
      await fetch(`/api/students/${encodeURIComponent(studentId)}/progress`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  };

  const handleUpdateQuestionOverride = (
    questionId: string,
    payload: { questionText?: string; options?: string[]; isReviewed?: boolean }
  ) => {
    setOverrides((prev) => {
      const existing = prev[questionId] ?? { questionId, isReviewed: false };
      return {
        ...prev,
        [questionId]: {
          ...existing,
          ...payload,
          questionId,
          isReviewed: payload.isReviewed ?? existing.isReviewed,
        },
      };
    });
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm font-medium text-slate-500">
        Menyiapkan ruang belajar...
      </div>
    );
  }

  if (!hasCompletedOnboarding && activeView !== 'teacher') {
    return (
      <OnboardingWelcome
        initialStudentId={studentProfile?.id ?? studentId}
        initialName={studentProfile?.name ?? 'Siswa Kelas 6'}
        initialClassName={studentProfile?.className ?? 'Kelas 6'}
        isSaving={isSavingProfile}
        onComplete={handleCompleteOnboarding}
        onOpenTeacherMode={() => setActiveView('teacher')}
      />
    );
  }

  const activeChapterIdx = WORLD_CHAPTERS.findIndex((c) => c.id === activeChapter.id);
  const nextChapter =
    activeChapterIdx >= 0 && activeChapterIdx + 1 < WORLD_CHAPTERS.length
      ? WORLD_CHAPTERS[activeChapterIdx + 1]
      : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopNav
        activeView={activeView}
        onNavigate={setActiveView}
        hasActiveSession={Object.keys(attempts).length > 0}
        onPrimaryAction={() => {
          if (activeView === 'quiz') {
            setActiveView('map');
          } else {
            setActiveView('quiz');
          }
        }}
      />

      <main className="flex-1">
        {activeView === 'map' && (
          <WorldMap
            studentName={studentProfile?.name ?? 'Siswa Kelas 6'}
            onEditStudentName={() => setHasCompletedOnboarding(false)}
            chapters={WORLD_CHAPTERS}
            questions={mergedQuestions}
            attempts={attempts}
            onStartWorld={handleStartWorld}
          />
        )}

        {activeView === 'quiz' && (
          <QuizArena
            studentId={studentId}
            studentName={studentProfile?.name ?? 'Siswa Kelas 6'}
            chapter={activeChapter}
            questions={activeQuestions}
            attempts={attempts}
            violations={violations}
            onRecordAttempt={handleRecordAttempt}
            onRecordViolation={handleRecordViolation}
            onExitToMap={() => setActiveView('map')}
            onNextWorld={
              nextChapter ? () => handleStartWorld(nextChapter.id) : undefined
            }
          />
        )}

        {activeView === 'stats' && (
          <LeaderboardAndStats
            studentId={studentId}
            studentName={studentProfile?.name ?? 'Siswa Kelas 6'}
            chapters={WORLD_CHAPTERS}
            questions={mergedQuestions}
            attempts={attempts}
            violations={violations}
            onResetProgress={handleResetProgress}
          />
        )}

        {activeView === 'teacher' && (
          <TeacherPanel
            questions={mergedQuestions}
            chapters={WORLD_CHAPTERS}
            reviewedQuestionIds={reviewedQuestionIds}
            onRefreshState={loadInitialFromServer}
            onUpdateQuestionOverride={handleUpdateQuestionOverride}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-6 text-xs text-slate-400">
        <div className="mx-auto max-w-[1200px] flex items-center justify-between">
          <span>Numerasi Quest · Latihan Matematika SD Kelas 6</span>
          <button
            type="button"
            onClick={() => setActiveView('teacher')}
            className="hover:text-slate-600 transition-colors"
          >
            Mode Guru
          </button>
        </div>
      </footer>
    </div>
  );
}
