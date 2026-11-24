import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  appendScaffoldTurns,
  clearScaffoldHistory,
  createOrUpdateStudent,
  getAppSettings,
  getDatabaseEngineInfo,
  getLeaderboard,
  getQuestionOverrides,
  getScaffoldHistory,
  getStudentById,
  getStudentRoster,
  getStudentStatePayload,
  recordViolationLog,
  resetStudentProgress,
  setStudentActiveChapter,
  updateTeacherPin,
  upsertAttempt,
  upsertQuestionOverride,
} from '../db/database.ts';
import type { AttemptRecord, ChapterId, ViolationLog } from '../types/quiz.ts';

interface ChatTurn {
  role: 'student' | 'tutor';
  text: string;
}

interface ScaffoldRequestBody {
  studentId?: string;
  questionId?: string;
  questionNumber?: string;
  questionTitle?: string;
  questionText?: string;
  studentClaim?: string;
  isErrorHunt?: boolean;
  steps?: string[];
  trapWarning?: string;
  studentMessage?: string;
  hintStage?: number;
  history?: ChatTurn[];
}

function getAiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function requireTeacherPin(req: Request, res: Response, next: NextFunction) {
  try {
    const provided = String(req.headers['x-teacher-pin'] ?? '').trim();
    const settings = await getAppSettings();
    if (!provided || provided !== settings.teacherPin) {
      return res.status(401).json({ error: 'PIN Guru tidak cocok atau belum diisi.' });
    }
    return next();
  } catch (err) {
    console.error('Teacher auth error:', err);
    return res.status(500).json({ error: 'Gagal memverifikasi PIN Guru.' });
  }
}

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      const engine = await getDatabaseEngineInfo();
      res.json({
        ok: true,
        engine,
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      });
    } catch (err) {
      console.error('Health check failed:', err);
      res.status(500).json({ ok: false });
    }
  });

  app.get('/api/questions/overrides', async (_req, res) => {
    try {
      const overrides = await getQuestionOverrides();
      res.json({ overrides });
    } catch (err) {
      console.error('Failed to read overrides:', err);
      res.status(500).json({ error: 'Gagal memuat data soal.' });
    }
  });

  app.get('/api/students/roster', async (_req, res) => {
    try {
      const roster = await getStudentRoster();
      res.json({ roster });
    } catch (err) {
      console.error('Failed to read student roster:', err);
      res.status(500).json({ error: 'Gagal memuat daftar nama siswa.' });
    }
  });

  app.post('/api/students/session', async (req, res) => {
    try {
      const { studentId, name, className } = (req.body || {}) as {
        studentId?: string;
        name?: string;
        className?: string;
      };
      if (!studentId && (!name || !String(name).trim())) {
        return res.status(400).json({ error: 'Pilih atau tulis nama siswa terlebih dahulu.' });
      }
      const student = await createOrUpdateStudent({
        studentId: studentId ? String(studentId) : undefined,
        name: name ? String(name) : undefined,
        className: className ? String(className) : undefined,
      });
      const payload = await getStudentStatePayload(student.id);
      return res.json(payload);
    } catch (err) {
      console.error('Student session error:', err);
      return res.status(500).json({ error: 'Gagal memuat profil siswa.' });
    }
  });

  app.get('/api/students/:studentId/state', async (req, res) => {
    try {
      const payload = await getStudentStatePayload(req.params.studentId);
      if (!payload) {
        return res.status(404).json({ error: 'Profil siswa tidak ditemukan.' });
      }
      return res.json(payload);
    } catch (err) {
      console.error('Get student state error:', err);
      return res.status(500).json({ error: 'Gagal memuat data belajar siswa.' });
    }
  });

  app.put('/api/students/:studentId/chapter', async (req, res) => {
    try {
      const student = await getStudentById(req.params.studentId);
      if (!student) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });
      const { chapterId } = (req.body || {}) as { chapterId?: ChapterId };
      if (!chapterId) return res.status(400).json({ error: 'Bab tidak valid.' });
      await setStudentActiveChapter(student.id, chapterId);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Update chapter error:', err);
      return res.status(500).json({ error: 'Gagal menyimpan bab aktif.' });
    }
  });

  app.post('/api/students/:studentId/attempts', async (req, res) => {
    try {
      const student = await getStudentById(req.params.studentId);
      if (!student) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });
      const attempt = req.body as AttemptRecord;
      if (!attempt || !attempt.questionId || !attempt.chapterId) {
        return res.status(400).json({ error: 'Data jawaban tidak lengkap.' });
      }
      await upsertAttempt(student.id, attempt);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Save attempt error:', err);
      return res.status(500).json({ error: 'Gagal menyimpan jawaban ke database.' });
    }
  });

  app.post('/api/students/:studentId/violations', async (req, res) => {
    try {
      const student = await getStudentById(req.params.studentId);
      if (!student) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });
      const body = (req.body || {}) as Omit<ViolationLog, 'id' | 'timestamp'>;
      if (!body.type || !body.detail) {
        return res.status(400).json({ error: 'Data log tidak lengkap.' });
      }
      const violation = await recordViolationLog(student.id, body);
      return res.json({ violation });
    } catch (err) {
      console.error('Record violation error:', err);
      return res.status(500).json({ error: 'Gagal mencatat log fokus.' });
    }
  });

  app.delete('/api/students/:studentId/progress', async (req, res) => {
    try {
      const student = await getStudentById(req.params.studentId);
      if (!student) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });
      await resetStudentProgress(student.id);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Reset progress error:', err);
      return res.status(500).json({ error: 'Gagal mereset progres siswa.' });
    }
  });

  app.get('/api/leaderboard', async (_req, res) => {
    try {
      const rows = (await getLeaderboard(100)).map((r) => ({
        id: r.id,
        name: r.name,
        className: r.className,
        totalXp: r.totalXp,
        correctCount: r.correctCount,
        attemptCount: r.attemptCount,
      }));
      return res.json({ leaderboard: rows });
    } catch (err) {
      console.error('Leaderboard error:', err);
      return res.status(500).json({ error: 'Gagal memuat papan peringkat.' });
    }
  });

  // Teacher Auth & Management Endpoints
  app.post('/api/teacher/verify', async (req, res) => {
    try {
      const { pin } = (req.body || {}) as { pin?: string };
      const settings = await getAppSettings();
      if (!pin || pin.trim() !== settings.teacherPin) {
        return res.status(401).json({ valid: false, error: 'PIN Guru salah.' });
      }
      const [students, overrides] = await Promise.all([
        getLeaderboard(200),
        getQuestionOverrides(),
      ]);
      return res.json({
        valid: true,
        students,
        overrides,
      });
    } catch (err) {
      console.error('Teacher verify error:', err);
      return res.status(500).json({ error: 'Gagal memverifikasi PIN Guru.' });
    }
  });

  app.get('/api/teacher/overview', requireTeacherPin, async (_req, res) => {
    try {
      const [students, overrides] = await Promise.all([
        getLeaderboard(200),
        getQuestionOverrides(),
      ]);
      return res.json({ students, overrides });
    } catch (err) {
      console.error('Teacher overview error:', err);
      return res.status(500).json({ error: 'Gagal memuat ringkasan guru.' });
    }
  });

  app.post('/api/teacher/students', requireTeacherPin, async (req, res) => {
    try {
      const { name, className } = (req.body || {}) as { name?: string; className?: string };
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Nama siswa wajib diisi.' });
      }
      const student = await createOrUpdateStudent({
        name: name.trim(),
        className: className?.trim() || 'Kelas 6',
      });
      return res.json({ ok: true, student });
    } catch (err) {
      console.error('Add student error:', err);
      return res.status(500).json({ error: 'Gagal menambahkan siswa.' });
    }
  });

  app.put('/api/teacher/settings', requireTeacherPin, async (req, res) => {
    try {
      const { teacherPin } = (req.body || {}) as { teacherPin?: string };
      if (!teacherPin || !teacherPin.trim()) {
        return res.status(400).json({ error: 'PIN Guru baru tidak boleh kosong.' });
      }
      await updateTeacherPin(teacherPin);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Update teacher settings error:', err);
      return res.status(500).json({ error: 'Gagal menyimpan pengaturan guru.' });
    }
  });

  app.put('/api/teacher/questions/:questionId', requireTeacherPin, async (req, res) => {
    try {
      const { questionText, options, teacherNote, isReviewed } = (req.body || {}) as {
        questionText?: string;
        options?: string[];
        teacherNote?: string;
        isReviewed?: boolean;
      };
      const override = await upsertQuestionOverride({
        questionId: req.params.questionId,
        questionText,
        options,
        teacherNote,
        isReviewed,
      });
      return res.json({ ok: true, override });
    } catch (err) {
      console.error('Update question override error:', err);
      return res.status(500).json({ error: 'Gagal menyimpan perubahan soal.' });
    }
  });

  // Multi-turn Tutor AI Scaffold History endpoints
  app.get('/api/scaffold/history', async (req, res) => {
    try {
      const studentId = String(req.query.studentId ?? '');
      const questionId = String(req.query.questionId ?? '');
      if (!studentId || !questionId) {
        return res.json({ messages: [] });
      }
      const messages = await getScaffoldHistory(studentId, questionId);
      return res.json({ messages });
    } catch (err) {
      console.error('Get scaffold history error:', err);
      return res.status(500).json({ error: 'Gagal memuat riwayat obrolan Tutor AI.' });
    }
  });

  app.delete('/api/scaffold/history', async (req, res) => {
    try {
      const studentId = String(req.query.studentId ?? '');
      const questionId = String(req.query.questionId ?? '');
      if (studentId && questionId) {
        await clearScaffoldHistory(studentId, questionId);
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('Clear scaffold history error:', err);
      return res.status(500).json({ error: 'Gagal menghapus riwayat obrolan.' });
    }
  });

  // Multi-turn Tutor AI using Gemini ai.chats.create + persistent history
  app.post('/api/scaffold', async (req, res) => {
    const body = (req.body || {}) as ScaffoldRequestBody;
    const {
      studentId = '',
      questionId = '',
      questionNumber = '',
      questionTitle = '',
      questionText = '',
      studentClaim = '',
      isErrorHunt = false,
      steps = [],
      trapWarning = '',
      studentMessage = '',
      hintStage = 1,
      history = [],
    } = body;

    if (!questionText) {
      return res.status(400).json({ error: 'Konteks soal tidak ditemukan.' });
    }

    const activeStudentMsg =
      studentMessage.trim() ||
      'Tolong beri petunjuk langkah pertama tanpa memberi tahu jawaban akhirnya.';

    if (!process.env.GEMINI_API_KEY) {
      const safeIndex = Math.min(Math.max(0, hintStage - 1), Math.max(0, steps.length - 1));
      const fallbackStep =
        steps[safeIndex] ||
        'Coba identifikasi kata kunci dan angka penting di dalam soal terlebih dahulu.';
      const masked = fallbackStep.replace(/=\s*[\d.,]+/g, '= ...');
      const fallbackReply = `Langkah panduan ${safeIndex + 1}: ${masked}\n\nMenurutmu, angka atau operasi apa yang perlu kita pakai di langkah ini?`;

      if (studentId && questionId && (await getStudentById(studentId))) {
        await appendScaffoldTurns(studentId, questionId, activeStudentMsg, fallbackReply);
      }

      return res.json({
        reply: fallbackReply,
        mode: 'guided-fallback',
      });
    }

    const systemInstruction = `Kamu adalah Tutor Matematika SD Kelas 6 yang sabar, ramah, dan suportif.
Tugasmu adalah memberikan SCAFFOLDING (bimbingan bertahap) untuk membantu siswa menemukan caranya sendiri pada soal berikut.

KONTEKS SOAL (${questionNumber} - ${questionTitle}):
Bunyi Soal: ${questionText}
${isErrorHunt && studentClaim ? `Pernyataan yang perlu dicek kesalahannya: ${studentClaim}\n` : ''}Referensi langkah guru (JANGAN dibocorkan hasil akhirnya, pakai hanya sebagai kompas bimbingan):
${steps.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}
Catatan jebakan umum: ${trapWarning}

ATURAN MUTLAK (TIDAK BOLEH DILANGGAR):
1. DILARANG KERAS menyebutkan jawaban akhir, hasil hitungan final, atau huruf opsi jawaban yang benar.
2. Jangan menyelesaikan seluruh langkah sekaligus. Berikan maksimal SATU petunjuk kecil untuk langkah saat ini (tahap ke-${hintStage}).
3. Jika siswa meminta jawaban langsung ("kasih tahu jawabannya saja", "A, B, C, atau D?"), tolak dengan ramah dan arahkan kembali ke langkah berpikir pertama.
4. Gunakan Bahasa Indonesia yang sangat sederhana, pendek, dan mudah dipahami anak kelas 6 SD (umur 11-12 tahun).
5. Jika ini soal "Cari Kesalahannya", ajak siswa mengecek ulang hitungan atau konsep tokoh di soal tersebut (tanpa langsung membongkar jawaban akhirnya).
6. Akhiri setiap tanggapan dengan tepat SATU pertanyaan pemantik singkat agar siswa aktif mencoba langkah tersebut.
7. Panjang jawaban maksimal 2-3 kalimat singkat agar anak tidak bingung membaca terlalu banyak teks.`;

    const storedHistory =
      studentId && questionId ? await getScaffoldHistory(studentId, questionId) : [];
    const effectiveHistory = storedHistory.length > 0 ? storedHistory : history;

    const geminiHistory = effectiveHistory.slice(-12).map((turn) => ({
      role: turn.role === 'student' ? 'user' : 'model',
      parts: [{ text: turn.text }],
    }));

    try {
      const ai = getAiClient();
      const chat = ai.chats.create({
        model: 'gemini-4-hydrogen',
        history: geminiHistory,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const response = await chat.sendMessage({ message: activeStudentMsg });
      const reply = response.text?.trim();
      if (!reply) {
        return res.status(502).json({ error: 'Tutor AI tidak memberikan respons. Coba ulangi lagi.' });
      }

      if (studentId && questionId && (await getStudentById(studentId))) {
        await appendScaffoldTurns(studentId, questionId, activeStudentMsg, reply);
      }

      return res.json({ reply, mode: 'gemini' });
    } catch (err) {
      console.error('Gemini scaffold error:', err);
      return res.status(500).json({
        error:
          'Layanan Tutor AI sedang sibuk. Gunakan tombol Petunjuk di layar soal atau coba beberapa detik lagi.',
      });
    }
  });

  return app;
}
