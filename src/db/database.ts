import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import type DatabaseType from 'better-sqlite3';
import { GRADE_6_ROSTER } from '../data/studentsRoster.ts';
import type {
  AttemptRecord,
  ChapterId,
  QuestionOverride,
  StudentSummary,
  ViolationLog,
} from '../types/quiz.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POSTGRES_CONNECTION_STRING =
  process.env.POSTGRES_URL || process.env.DATABASE_URL || '';

let pgPool: Pool | null = null;
let sqliteDb: DatabaseType.Database | null = null;
let initPromise: Promise<void> | null = null;

function isPostgresMode(): boolean {
  return Boolean(POSTGRES_CONNECTION_STRING.trim());
}

function getPgPool(): Pool {
  if (!pgPool) {
    const needsSsl =
      POSTGRES_CONNECTION_STRING.includes('sslmode=require') ||
      process.env.VERCEL === '1' ||
      process.env.NODE_ENV === 'production';

    pgPool = new Pool({
      connectionString: POSTGRES_CONNECTION_STRING,
      max: 10,
      connectionTimeoutMillis: 15000,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
    pgPool.on('error', (err) => {
      console.error('Unexpected Postgres pool error:', err);
    });
  }
  return pgPool;
}

async function getSqliteDb(): Promise<DatabaseType.Database> {
  if (sqliteDb) return sqliteDb;

  const { default: Database } = await import('better-sqlite3');
  const preferredDir = path.resolve(__dirname, '../../data');
  let dbDir = preferredDir;

  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.accessSync(dbDir, fs.constants.W_OK);
  } catch {
    // Fallback to /tmp if workspace directory is read-only (e.g., serverless preview without Postgres URL)
    dbDir = '/tmp/numerasi-data';
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  const dbPath = path.join(dbDir, 'numerasi.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  sqliteDb = db;
  return db;
}

async function ensureInitialized(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const now = new Date().toISOString();

    if (isPostgresMode()) {
      const pool = getPgPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          teacher_pin TEXT NOT NULL DEFAULT 'GURU6',
          max_violations INTEGER NOT NULL DEFAULT 3,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS students (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          class_name TEXT NOT NULL DEFAULT 'Kelas 6',
          active_chapter_id TEXT NOT NULL DEFAULT 'bab1',
          is_session_locked INTEGER NOT NULL DEFAULT 0,
          has_completed_onboarding INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS question_overrides (
          question_id TEXT PRIMARY KEY,
          question_text TEXT,
          options_json TEXT,
          teacher_note TEXT,
          is_reviewed INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS attempts (
          id SERIAL PRIMARY KEY,
          student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          question_id TEXT NOT NULL,
          chapter_id TEXT NOT NULL,
          selected_index INTEGER NOT NULL,
          is_correct INTEGER NOT NULL,
          earned_xp INTEGER NOT NULL,
          used_hint INTEGER NOT NULL DEFAULT 0,
          used_fifty_fifty INTEGER NOT NULL DEFAULT 0,
          used_ai_scaffold INTEGER NOT NULL DEFAULT 0,
          timestamp_label TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(student_id, question_id)
        );

        CREATE TABLE IF NOT EXISTS violation_logs (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          detail TEXT NOT NULL,
          chapter_title TEXT NOT NULL,
          question_label TEXT NOT NULL,
          timestamp_label TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scaffold_messages (
          id SERIAL PRIMARY KEY,
          student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          question_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('student', 'tutor')),
          text TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(student_id);
        CREATE INDEX IF NOT EXISTS idx_violations_student ON violation_logs(student_id);
        CREATE INDEX IF NOT EXISTS idx_scaffold_student_q ON scaffold_messages(student_id, question_id);
      `);

      await pool.query(
        `INSERT INTO app_settings (id, teacher_pin, max_violations, updated_at)
         VALUES (1, 'GURU6', 3, $1)
         ON CONFLICT (id) DO NOTHING`,
        [now]
      );

      // Seed Grade 6 roster idempotently
      for (const stu of GRADE_6_ROSTER) {
        await pool.query(
          `INSERT INTO students (id, name, class_name, active_chapter_id, is_session_locked, has_completed_onboarding, created_at, updated_at)
           VALUES ($1, $2, $3, 'bab1', 0, 1, $4, $4)
           ON CONFLICT (id) DO NOTHING`,
          [stu.id, stu.name, stu.className, now]
        );
      }
      return;
    }

    const db = await getSqliteDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        teacher_pin TEXT NOT NULL DEFAULT 'GURU6',
        max_violations INTEGER NOT NULL DEFAULT 3,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        class_name TEXT NOT NULL DEFAULT 'Kelas 6',
        active_chapter_id TEXT NOT NULL DEFAULT 'bab1',
        is_session_locked INTEGER NOT NULL DEFAULT 0,
        has_completed_onboarding INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS question_overrides (
        question_id TEXT PRIMARY KEY,
        question_text TEXT,
        options_json TEXT,
        teacher_note TEXT,
        is_reviewed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        question_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        selected_index INTEGER NOT NULL,
        is_correct INTEGER NOT NULL,
        earned_xp INTEGER NOT NULL,
        used_hint INTEGER NOT NULL DEFAULT 0,
        used_fifty_fifty INTEGER NOT NULL DEFAULT 0,
        used_ai_scaffold INTEGER NOT NULL DEFAULT 0,
        scratchpad_text TEXT,
        had_canvas_work INTEGER NOT NULL DEFAULT 0,
        board_feedback_json TEXT,
        timestamp_label TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(student_id, question_id)
      );

      CREATE TABLE IF NOT EXISTS violation_logs (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        detail TEXT NOT NULL,
        chapter_title TEXT NOT NULL,
        question_label TEXT NOT NULL,
        timestamp_label TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scaffold_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        question_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('student', 'tutor')),
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(student_id);
      CREATE INDEX IF NOT EXISTS idx_violations_student ON violation_logs(student_id);
      CREATE INDEX IF NOT EXISTS idx_scaffold_student_q ON scaffold_messages(student_id, question_id);
    `);

    db.prepare(
      `INSERT OR IGNORE INTO app_settings (id, teacher_pin, max_violations, updated_at)
       VALUES (1, 'GURU6', 3, ?)`
    ).run(now);

    const insertRoster = db.prepare(
      `INSERT OR IGNORE INTO students (id, name, class_name, active_chapter_id, is_session_locked, has_completed_onboarding, created_at, updated_at)
       VALUES (?, ?, ?, 'bab1', 0, 1, ?, ?)`
    );
    const tx = db.transaction(() => {
      for (const stu of GRADE_6_ROSTER) {
        insertRoster.run(stu.id, stu.name, stu.className, now, now);
      }
    });
    tx();
  })();

  try {
    await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

export interface DbAppSettings {
  teacherPin: string;
  updatedAt: string;
}

export interface DbStudentRow {
  id: string;
  name: string;
  class_name: string;
  active_chapter_id: ChapterId;
  has_completed_onboarding: number;
  created_at: string;
  updated_at: string;
}

export interface RosterStudentItem {
  id: string;
  name: string;
  className: string;
}

export async function getDatabaseEngineInfo(): Promise<'postgres' | 'sqlite'> {
  await ensureInitialized();
  return isPostgresMode() ? 'postgres' : 'sqlite';
}

export async function getStudentRoster(): Promise<RosterStudentItem[]> {
  await ensureInitialized();
  if (isPostgresMode()) {
    const res = await getPgPool().query(
      `SELECT id, name, class_name AS "className" FROM students ORDER BY name ASC`
    );
    return res.rows as RosterStudentItem[];
  }
  const db = await getSqliteDb();
  return db
    .prepare(`SELECT id, name, class_name AS className FROM students ORDER BY name ASC`)
    .all() as RosterStudentItem[];
}

export async function getAppSettings(): Promise<DbAppSettings> {
  await ensureInitialized();
  if (isPostgresMode()) {
    const res = await getPgPool().query(
      `SELECT teacher_pin, updated_at FROM app_settings WHERE id = 1`
    );
    const row = res.rows[0] as { teacher_pin: string; updated_at: string } | undefined;
    if (!row) {
      return { teacherPin: 'GURU6', updatedAt: new Date().toISOString() };
    }
    return { teacherPin: row.teacher_pin, updatedAt: row.updated_at };
  }

  const db = await getSqliteDb();
  const row = db
    .prepare('SELECT teacher_pin, updated_at FROM app_settings WHERE id = 1')
    .get() as { teacher_pin: string; updated_at: string } | undefined;

  if (!row) {
    return { teacherPin: 'GURU6', updatedAt: new Date().toISOString() };
  }
  return { teacherPin: row.teacher_pin, updatedAt: row.updated_at };
}

export async function updateTeacherPin(teacherPin: string): Promise<DbAppSettings> {
  await ensureInitialized();
  const current = await getAppSettings();
  const nextPin = teacherPin.trim() || current.teacherPin;
  const now = new Date().toISOString();

  if (isPostgresMode()) {
    await getPgPool().query(
      `UPDATE app_settings SET teacher_pin = $1, updated_at = $2 WHERE id = 1`,
      [nextPin, now]
    );
  } else {
    const db = await getSqliteDb();
    db.prepare(`UPDATE app_settings SET teacher_pin = ?, updated_at = ? WHERE id = 1`).run(
      nextPin,
      now
    );
  }

  return { teacherPin: nextPin, updatedAt: now };
}

export async function getQuestionOverrides(): Promise<Record<string, QuestionOverride>> {
  await ensureInitialized();
  let rows: Array<{
    question_id: string;
    question_text: string | null;
    options_json: string | null;
    teacher_note: string | null;
    is_reviewed: number;
  }> = [];

  if (isPostgresMode()) {
    const res = await getPgPool().query(
      `SELECT question_id, question_text, options_json, teacher_note, is_reviewed FROM question_overrides`
    );
    rows = res.rows;
  } else {
    const db = await getSqliteDb();
    rows = db
      .prepare(
        `SELECT question_id, question_text, options_json, teacher_note, is_reviewed FROM question_overrides`
      )
      .all() as typeof rows;
  }

  const map: Record<string, QuestionOverride> = {};
  for (const row of rows) {
    let parsedOptions: string[] | undefined;
    if (row.options_json) {
      try {
        const candidate = JSON.parse(row.options_json);
        if (Array.isArray(candidate)) parsedOptions = candidate.map(String);
      } catch {
        parsedOptions = undefined;
      }
    }
    map[row.question_id] = {
      questionId: row.question_id,
      questionText: row.question_text ?? undefined,
      options: parsedOptions,
      teacherNote: row.teacher_note ?? undefined,
      isReviewed: Boolean(row.is_reviewed),
    };
  }
  return map;
}

export async function upsertQuestionOverride(input: {
  questionId: string;
  questionText?: string;
  options?: string[];
  teacherNote?: string;
  isReviewed?: boolean;
}): Promise<QuestionOverride> {
  await ensureInitialized();
  const now = new Date().toISOString();

  let existing:
    | {
        question_text: string | null;
        options_json: string | null;
        teacher_note: string | null;
        is_reviewed: number;
      }
    | undefined;

  if (isPostgresMode()) {
    const res = await getPgPool().query(
      `SELECT question_text, options_json, teacher_note, is_reviewed FROM question_overrides WHERE question_id = $1`,
      [input.questionId]
    );
    existing = res.rows[0];
  } else {
    const db = await getSqliteDb();
    existing = db
      .prepare(
        `SELECT question_text, options_json, teacher_note, is_reviewed FROM question_overrides WHERE question_id = ?`
      )
      .get(input.questionId) as typeof existing;
  }

  const nextText =
    input.questionText !== undefined ? input.questionText : existing?.question_text ?? null;
  const nextOptionsJson =
    input.options !== undefined ? JSON.stringify(input.options) : existing?.options_json ?? null;
  const nextNote =
    input.teacherNote !== undefined ? input.teacherNote : existing?.teacher_note ?? null;
  const nextReviewed =
    input.isReviewed !== undefined ? (input.isReviewed ? 1 : 0) : existing?.is_reviewed ?? 0;

  if (isPostgresMode()) {
    await getPgPool().query(
      `INSERT INTO question_overrides (question_id, question_text, options_json, teacher_note, is_reviewed, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (question_id) DO UPDATE SET
         question_text = EXCLUDED.question_text,
         options_json = EXCLUDED.options_json,
         teacher_note = EXCLUDED.teacher_note,
         is_reviewed = EXCLUDED.is_reviewed,
         updated_at = EXCLUDED.updated_at`,
      [input.questionId, nextText, nextOptionsJson, nextNote, nextReviewed, now]
    );
  } else {
    const db = await getSqliteDb();
    db.prepare(
      `INSERT INTO question_overrides (question_id, question_text, options_json, teacher_note, is_reviewed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(question_id) DO UPDATE SET
         question_text = excluded.question_text,
         options_json = excluded.options_json,
         teacher_note = excluded.teacher_note,
         is_reviewed = excluded.is_reviewed,
         updated_at = excluded.updated_at`
    ).run(input.questionId, nextText, nextOptionsJson, nextNote, nextReviewed, now);
  }

  return {
    questionId: input.questionId,
    questionText: nextText ?? undefined,
    options: nextOptionsJson ? (JSON.parse(nextOptionsJson) as string[]) : undefined,
    teacherNote: nextNote ?? undefined,
    isReviewed: Boolean(nextReviewed),
  };
}

export async function getStudentById(studentId: string): Promise<DbStudentRow | null> {
  await ensureInitialized();
  if (isPostgresMode()) {
    const res = await getPgPool().query(
      `SELECT id, name, class_name, active_chapter_id, has_completed_onboarding, created_at, updated_at
       FROM students WHERE id = $1`,
      [studentId]
    );
    return (res.rows[0] as DbStudentRow | undefined) ?? null;
  }

  const db = await getSqliteDb();
  const row = db
    .prepare(
      `SELECT id, name, class_name, active_chapter_id, has_completed_onboarding, created_at, updated_at
       FROM students WHERE id = ?`
    )
    .get(studentId) as DbStudentRow | undefined;
  return row ?? null;
}

export async function findStudentByExactName(name: string): Promise<DbStudentRow | null> {
  await ensureInitialized();
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;

  if (isPostgresMode()) {
    const res = await getPgPool().query(
      `SELECT id, name, class_name, active_chapter_id, has_completed_onboarding, created_at, updated_at
       FROM students WHERE LOWER(TRIM(name)) = $1 LIMIT 1`,
      [normalized]
    );
    return (res.rows[0] as DbStudentRow | undefined) ?? null;
  }

  const db = await getSqliteDb();
  const row = db
    .prepare(
      `SELECT id, name, class_name, active_chapter_id, has_completed_onboarding, created_at, updated_at
       FROM students WHERE LOWER(TRIM(name)) = ? LIMIT 1`
    )
    .get(normalized) as DbStudentRow | undefined;
  return row ?? null;
}

export async function createOrUpdateStudent(input: {
  studentId?: string;
  name?: string;
  className?: string;
}): Promise<DbStudentRow> {
  await ensureInitialized();
  const now = new Date().toISOString();

  if (input.studentId) {
    const existingById = await getStudentById(input.studentId);
    if (existingById) {
      const nextClass = input.className?.trim().slice(0, 30) || existingById.class_name;
      if (isPostgresMode()) {
        await getPgPool().query(
          `UPDATE students SET class_name = $1, has_completed_onboarding = 1, updated_at = $2 WHERE id = $3`,
          [nextClass, now, existingById.id]
        );
      } else {
        const db = await getSqliteDb();
        db.prepare(
          `UPDATE students SET class_name = ?, has_completed_onboarding = 1, updated_at = ? WHERE id = ?`
        ).run(nextClass, now, existingById.id);
      }
      return (await getStudentById(existingById.id))!;
    }
  }

  const cleanName = (input.name || '').trim().slice(0, 80) || 'Siswa Kelas 6';
  const existingByName = await findStudentByExactName(cleanName);
  if (existingByName) {
    const nextClass = input.className?.trim().slice(0, 30) || existingByName.class_name;
    if (isPostgresMode()) {
      await getPgPool().query(
        `UPDATE students SET class_name = $1, has_completed_onboarding = 1, updated_at = $2 WHERE id = $3`,
        [nextClass, now, existingByName.id]
      );
    } else {
      const db = await getSqliteDb();
      db.prepare(
        `UPDATE students SET class_name = ?, has_completed_onboarding = 1, updated_at = ? WHERE id = ?`
      ).run(nextClass, now, existingByName.id);
    }
    return (await getStudentById(existingByName.id))!;
  }

  const cleanClass = input.className?.trim().slice(0, 30) || 'Kelas 6';
  const newId =
    input.studentId?.trim() ||
    `stu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  if (isPostgresMode()) {
    await getPgPool().query(
      `INSERT INTO students (id, name, class_name, active_chapter_id, is_session_locked, has_completed_onboarding, created_at, updated_at)
       VALUES ($1, $2, $3, 'bab1', 0, 1, $4, $4)`,
      [newId, cleanName, cleanClass, now]
    );
  } else {
    const db = await getSqliteDb();
    db.prepare(
      `INSERT INTO students (id, name, class_name, active_chapter_id, is_session_locked, has_completed_onboarding, created_at, updated_at)
       VALUES (?, ?, ?, 'bab1', 0, 1, ?, ?)`
    ).run(newId, cleanName, cleanClass, now, now);
  }

  return (await getStudentById(newId))!;
}

export async function setStudentActiveChapter(studentId: string, chapterId: ChapterId) {
  await ensureInitialized();
  const now = new Date().toISOString();
  if (isPostgresMode()) {
    await getPgPool().query(
      `UPDATE students SET active_chapter_id = $1, updated_at = $2 WHERE id = $3`,
      [chapterId, now, studentId]
    );
    return;
  }
  const db = await getSqliteDb();
  db.prepare(`UPDATE students SET active_chapter_id = ?, updated_at = ? WHERE id = ?`).run(
    chapterId,
    now,
    studentId
  );
}

export async function getStudentStatePayload(studentId: string) {
  await ensureInitialized();
  const student = await getStudentById(studentId);
  if (!student) return null;

  let attemptRows: Array<{
    question_id: string;
    chapter_id: ChapterId;
    selected_index: number;
    is_correct: number;
    earned_xp: number;
    used_hint: number;
    used_fifty_fifty: number;
    used_ai_scaffold: number;
    timestamp_label: string;
  }> = [];

  let violationRows: Array<{
    id: string;
    type: ViolationLog['type'];
    detail: string;
    chapter_title: string;
    question_label: string;
    timestamp_label: string;
  }> = [];

  if (isPostgresMode()) {
    const pool = getPgPool();
    const aRes = await pool.query(
      `SELECT question_id, chapter_id, selected_index, is_correct, earned_xp,
              used_hint, used_fifty_fifty, used_ai_scaffold, timestamp_label
       FROM attempts WHERE student_id = $1`,
      [studentId]
    );
    attemptRows = aRes.rows;

    const vRes = await pool.query(
      `SELECT id, type, detail, chapter_title, question_label, timestamp_label
       FROM violation_logs WHERE student_id = $1 ORDER BY created_at ASC`,
      [studentId]
    );
    violationRows = vRes.rows;
  } else {
    const db = await getSqliteDb();
    attemptRows = db
      .prepare(
        `SELECT question_id, chapter_id, selected_index, is_correct, earned_xp,
                used_hint, used_fifty_fifty, used_ai_scaffold, timestamp_label
         FROM attempts WHERE student_id = ?`
      )
      .all(studentId) as typeof attemptRows;

    violationRows = db
      .prepare(
        `SELECT id, type, detail, chapter_title, question_label, timestamp_label
         FROM violation_logs WHERE student_id = ? ORDER BY created_at ASC`
      )
      .all(studentId) as typeof violationRows;
  }

  const attempts: Record<string, AttemptRecord> = {};
  for (const row of attemptRows) {
    attempts[row.question_id] = {
      questionId: row.question_id,
      chapterId: row.chapter_id,
      selectedIndex: row.selected_index,
      isCorrect: Boolean(row.is_correct),
      earnedXp: row.earned_xp,
      usedHintPowerUp: Boolean(row.used_hint),
      usedFiftyFiftyPowerUp: Boolean(row.used_fifty_fifty),
      usedAiScaffold: Boolean(row.used_ai_scaffold),
      timestamp: row.timestamp_label,
    };
  }

  const violations: ViolationLog[] = violationRows.map((v) => ({
    id: v.id,
    type: v.type,
    detail: v.detail,
    chapterTitle: v.chapter_title,
    questionLabel: v.question_label,
    timestamp: v.timestamp_label,
  }));

  const overrides = await getQuestionOverrides();

  return {
    student: {
      id: student.id,
      name: student.name,
      className: student.class_name,
      activeChapterId: student.active_chapter_id,
      hasCompletedOnboarding: Boolean(student.has_completed_onboarding),
    },
    attempts,
    violations,
    overrides,
  };
}

export async function upsertAttempt(studentId: string, attempt: AttemptRecord) {
  await ensureInitialized();
  const now = new Date().toISOString();

  if (isPostgresMode()) {
    const pool = getPgPool();
    await pool.query(
      `INSERT INTO attempts (
        student_id, question_id, chapter_id, selected_index, is_correct, earned_xp,
        used_hint, used_fifty_fifty, used_ai_scaffold, timestamp_label, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (student_id, question_id) DO UPDATE SET
        chapter_id = EXCLUDED.chapter_id,
        selected_index = EXCLUDED.selected_index,
        is_correct = EXCLUDED.is_correct,
        earned_xp = EXCLUDED.earned_xp,
        used_hint = EXCLUDED.used_hint,
        used_fifty_fifty = EXCLUDED.used_fifty_fifty,
        used_ai_scaffold = EXCLUDED.used_ai_scaffold,
        timestamp_label = EXCLUDED.timestamp_label`,
      [
        studentId,
        attempt.questionId,
        attempt.chapterId,
        attempt.selectedIndex,
        attempt.isCorrect ? 1 : 0,
        attempt.earnedXp,
        attempt.usedHintPowerUp ? 1 : 0,
        attempt.usedFiftyFiftyPowerUp ? 1 : 0,
        attempt.usedAiScaffold ? 1 : 0,
        attempt.timestamp,
        now,
      ]
    );
    await pool.query(`UPDATE students SET updated_at = $1 WHERE id = $2`, [now, studentId]);
    return;
  }

  const db = await getSqliteDb();
  db.prepare(
    `INSERT INTO attempts (
      student_id, question_id, chapter_id, selected_index, is_correct, earned_xp,
      used_hint, used_fifty_fifty, used_ai_scaffold, scratchpad_text,
      had_canvas_work, board_feedback_json, timestamp_label, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?)
    ON CONFLICT(student_id, question_id) DO UPDATE SET
      chapter_id = excluded.chapter_id,
      selected_index = excluded.selected_index,
      is_correct = excluded.is_correct,
      earned_xp = excluded.earned_xp,
      used_hint = excluded.used_hint,
      used_fifty_fifty = excluded.used_fifty_fifty,
      used_ai_scaffold = excluded.used_ai_scaffold,
      timestamp_label = excluded.timestamp_label`
  ).run(
    studentId,
    attempt.questionId,
    attempt.chapterId,
    attempt.selectedIndex,
    attempt.isCorrect ? 1 : 0,
    attempt.earnedXp,
    attempt.usedHintPowerUp ? 1 : 0,
    attempt.usedFiftyFiftyPowerUp ? 1 : 0,
    attempt.usedAiScaffold ? 1 : 0,
    attempt.timestamp,
    now
  );

  db.prepare(`UPDATE students SET updated_at = ? WHERE id = ?`).run(now, studentId);
}

export async function recordViolationLog(
  studentId: string,
  violation: Omit<ViolationLog, 'id' | 'timestamp'>
): Promise<ViolationLog> {
  await ensureInitialized();
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const timestampLabel = nowDate.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const id = `vio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  if (isPostgresMode()) {
    const pool = getPgPool();
    await pool.query(
      `INSERT INTO violation_logs (id, student_id, type, detail, chapter_title, question_label, timestamp_label, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        studentId,
        violation.type,
        violation.detail,
        violation.chapterTitle,
        violation.questionLabel,
        timestampLabel,
        nowIso,
      ]
    );
    await pool.query(`UPDATE students SET updated_at = $1 WHERE id = $2`, [nowIso, studentId]);
  } else {
    const db = await getSqliteDb();
    db.prepare(
      `INSERT INTO violation_logs (id, student_id, type, detail, chapter_title, question_label, timestamp_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      studentId,
      violation.type,
      violation.detail,
      violation.chapterTitle,
      violation.questionLabel,
      timestampLabel,
      nowIso
    );
    db.prepare(`UPDATE students SET updated_at = ? WHERE id = ?`).run(nowIso, studentId);
  }

  return {
    id,
    type: violation.type,
    detail: violation.detail,
    chapterTitle: violation.chapterTitle,
    questionLabel: violation.questionLabel,
    timestamp: timestampLabel,
  };
}

export async function resetStudentProgress(studentId: string) {
  await ensureInitialized();
  const now = new Date().toISOString();

  if (isPostgresMode()) {
    const pool = getPgPool();
    await pool.query(`DELETE FROM attempts WHERE student_id = $1`, [studentId]);
    await pool.query(`DELETE FROM violation_logs WHERE student_id = $1`, [studentId]);
    await pool.query(`DELETE FROM scaffold_messages WHERE student_id = $1`, [studentId]);
    await pool.query(
      `UPDATE students SET is_session_locked = 0, active_chapter_id = 'bab1', updated_at = $1 WHERE id = $2`,
      [now, studentId]
    );
    return;
  }

  const db = await getSqliteDb();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM attempts WHERE student_id = ?`).run(studentId);
    db.prepare(`DELETE FROM violation_logs WHERE student_id = ?`).run(studentId);
    db.prepare(`DELETE FROM scaffold_messages WHERE student_id = ?`).run(studentId);
    db.prepare(
      `UPDATE students SET is_session_locked = 0, active_chapter_id = 'bab1', updated_at = ? WHERE id = ?`
    ).run(now, studentId);
  });
  tx();
}

export async function getLeaderboard(limit = 100): Promise<StudentSummary[]> {
  await ensureInitialized();
  let rows: Array<{
    id: string;
    name: string;
    className: string;
    updatedAt: string;
    totalXp: number | string;
    correctCount: number | string;
    attemptCount: number | string;
    violationCount: number | string;
  }> = [];

  if (isPostgresMode()) {
    const res = await getPgPool().query(
      `SELECT
         s.id,
         s.name,
         s.class_name AS "className",
         s.updated_at AS "updatedAt",
         COALESCE(SUM(a.earned_xp), 0) AS "totalXp",
         COALESCE(SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END), 0) AS "correctCount",
         COUNT(DISTINCT a.question_id) AS "attemptCount",
         (SELECT COUNT(*) FROM violation_logs v WHERE v.student_id = s.id) AS "violationCount"
       FROM students s
       LEFT JOIN attempts a ON a.student_id = s.id
       GROUP BY s.id, s.name, s.class_name, s.updated_at
       ORDER BY "totalXp" DESC, "correctCount" DESC, s.name ASC
       LIMIT $1`,
      [limit]
    );
    rows = res.rows;
  } else {
    const db = await getSqliteDb();
    rows = db
      .prepare(
        `SELECT
           s.id,
           s.name,
           s.class_name AS className,
           s.updated_at AS updatedAt,
           COALESCE(SUM(a.earned_xp), 0) AS totalXp,
           COALESCE(SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correctCount,
           COUNT(DISTINCT a.question_id) AS attemptCount,
           (SELECT COUNT(*) FROM violation_logs v WHERE v.student_id = s.id) AS violationCount
         FROM students s
         LEFT JOIN attempts a ON a.student_id = s.id
         GROUP BY s.id
         ORDER BY totalXp DESC, correctCount DESC, s.name ASC
         LIMIT ?`
      )
      .all(limit) as typeof rows;
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    className: r.className,
    totalXp: Number(r.totalXp) || 0,
    correctCount: Number(r.correctCount) || 0,
    attemptCount: Number(r.attemptCount) || 0,
    violationCount: Number(r.violationCount) || 0,
    updatedAt: r.updatedAt,
  }));
}

export async function getScaffoldHistory(studentId: string, questionId: string) {
  await ensureInitialized();
  if (isPostgresMode()) {
    const res = await getPgPool().query(
      `SELECT role, text FROM scaffold_messages
       WHERE student_id = $1 AND question_id = $2
       ORDER BY id ASC LIMIT 30`,
      [studentId, questionId]
    );
    return res.rows as Array<{ role: 'student' | 'tutor'; text: string }>;
  }

  const db = await getSqliteDb();
  return db
    .prepare(
      `SELECT role, text FROM scaffold_messages
       WHERE student_id = ? AND question_id = ?
       ORDER BY id ASC LIMIT 30`
    )
    .all(studentId, questionId) as Array<{ role: 'student' | 'tutor'; text: string }>;
}

export async function appendScaffoldTurns(
  studentId: string,
  questionId: string,
  studentText: string,
  tutorText: string
) {
  await ensureInitialized();
  const now = new Date().toISOString();

  if (isPostgresMode()) {
    const pool = getPgPool();
    await pool.query(
      `INSERT INTO scaffold_messages (student_id, question_id, role, text, created_at)
       VALUES ($1, $2, 'student', $3, $4), ($1, $2, 'tutor', $5, $4)`,
      [studentId, questionId, studentText, now, tutorText]
    );
    return;
  }

  const db = await getSqliteDb();
  const insert = db.prepare(
    `INSERT INTO scaffold_messages (student_id, question_id, role, text, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    insert.run(studentId, questionId, 'student', studentText, now);
    insert.run(studentId, questionId, 'tutor', tutorText, now);
  });
  tx();
}

export async function clearScaffoldHistory(studentId: string, questionId: string) {
  await ensureInitialized();
  if (isPostgresMode()) {
    await getPgPool().query(
      `DELETE FROM scaffold_messages WHERE student_id = $1 AND question_id = $2`,
      [studentId, questionId]
    );
    return;
  }
  const db = await getSqliteDb();
  db.prepare(`DELETE FROM scaffold_messages WHERE student_id = ? AND question_id = ?`).run(
    studentId,
    questionId
  );
}
