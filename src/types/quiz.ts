export type DifficultyLevel = 'Mudah' | 'Sedang' | 'Sulit';

export type ChapterId = 'bab1' | 'bab2' | 'bab3' | 'bab4' | 'bab5A' | 'bab5B';

export interface Question {
  id: string;
  chapterId: ChapterId;
  numberLabel: string;
  title: string;
  level: DifficultyLevel;
  xp: 10 | 20 | 30;
  isErrorHunt?: boolean;
  studentClaim?: string;
  needsTeacherReview?: boolean;
  teacherNote?: string;
  questionText: string;
  options: string[];
  correctIndex: number;
  finalAnswer: string;
  steps: string[];
  trapWarning: string;
  verifyTip: string;
}

export interface WorldChapter {
  id: ChapterId;
  orderLabel: string;
  title: string;
  subtitle: string;
  topic: string;
  isBoss?: boolean;
  bossVersion?: 'A' | 'B';
  introTitle: string;
  introPoints: string[];
  accentColor: 'sky' | 'emerald' | 'amber' | 'indigo' | 'rose';
}

export interface ViolationLog {
  id: string;
  timestamp: string;
  type:
    | 'tab-switch'
    | 'window-blur'
    | 'copy-attempt'
    | 'context-menu'
    | 'shortcut-blocked'
    | 'screenshot-attempt'
    | 'fullscreen-exit';
  detail: string;
  chapterTitle: string;
  questionLabel: string;
}

export interface AttemptRecord {
  questionId: string;
  chapterId: ChapterId;
  selectedIndex: number;
  isCorrect: boolean;
  earnedXp: number;
  usedHintPowerUp: boolean;
  usedFiftyFiftyPowerUp: boolean;
  usedAiScaffold: boolean;
  timestamp: string;
}

export interface QuestionOverride {
  questionId: string;
  questionText?: string;
  options?: string[];
  teacherNote?: string;
  isReviewed: boolean;
}

export interface StudentProfile {
  id: string;
  name: string;
  className: string;
  activeChapterId: ChapterId;
  hasCompletedOnboarding: boolean;
}

export interface StudentSummary {
  id: string;
  name: string;
  className: string;
  totalXp: number;
  correctCount: number;
  attemptCount: number;
  violationCount: number;
  updatedAt: string;
}
