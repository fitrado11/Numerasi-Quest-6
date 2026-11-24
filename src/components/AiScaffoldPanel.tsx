import React, { useState, useEffect, useRef } from 'react';
import { Bot, ChevronDown, ChevronUp, RotateCcw, Send } from 'lucide-react';
import { Question } from '../types/quiz';

interface ChatTurn {
  role: 'student' | 'tutor';
  text: string;
}

interface AiScaffoldPanelProps {
  studentId: string;
  question: Question;
  scratchpadText?: string;
  disabled?: boolean;
  onUsedScaffold: () => void;
}

export const AiScaffoldPanel: React.FC<AiScaffoldPanelProps> = ({
  studentId,
  question,
  scratchpadText = '',
  disabled = false,
  onUsedScaffold,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [hintStage, setHintStage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  // Collapse cleanly on new question and load any persisted multi-turn history
  useEffect(() => {
    let cancelled = false;
    setIsOpen(false);
    setMessages([]);
    setInput('');
    setHintStage(1);
    setErrorMsg(null);

    if (studentId && question.id) {
      fetch(
        `/api/scaffold/history?studentId=${encodeURIComponent(studentId)}&questionId=${encodeURIComponent(question.id)}`
      )
        .then((res) => (res.ok ? res.json() : { messages: [] }))
        .then((data: { messages?: ChatTurn[] }) => {
          if (cancelled) return;
          const loaded = Array.isArray(data.messages) ? data.messages : [];
          setMessages(loaded);
          const tutorCount = loaded.filter((m) => m.role === 'tutor').length;
          setHintStage(tutorCount + 1);
        })
        .catch(() => {
          // Ignore transient history load errors
        });
    }

    return () => {
      cancelled = true;
    };
  }, [studentId, question.id]);

  useEffect(() => {
    if (isOpen) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages.length, loading, isOpen]);

  const requestHint = async (studentText: string) => {
    if (loading || disabled) return;
    setIsOpen(true);
    setErrorMsg(null);
    onUsedScaffold();

    const nextHistory: ChatTurn[] = [
      ...messages,
      { role: 'student', text: studentText },
    ];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/scaffold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          questionId: question.id,
          questionNumber: question.numberLabel,
          questionTitle: question.title,
          questionText: question.questionText,
          studentClaim: question.studentClaim,
          isErrorHunt: question.isErrorHunt,
          steps: question.steps,
          trapWarning: question.trapWarning,
          studentMessage: studentText,
          scratchpadText,
          hintStage,
          history: messages,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'Gagal menghubungi Tutor AI.');
      } else {
        setMessages((prev) => [...prev, { role: 'tutor', text: data.reply }]);
        setHintStage((prev) => prev + 1);
      }
    } catch {
      setErrorMsg('Koneksi ke Tutor AI terputus. Coba lagi sebentar.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetChat = async () => {
    setMessages([]);
    setHintStage(1);
    setErrorMsg(null);
    if (studentId && question.id) {
      try {
        await fetch(
          `/api/scaffold/history?studentId=${encodeURIComponent(studentId)}&questionId=${encodeURIComponent(question.id)}`,
          { method: 'DELETE' }
        );
      } catch {
        // Ignore reset failure
      }
    }
  };

  const quickPrompts = [
    'Bagaimana langkah pertamanya?',
    'Apa kata kunci di soal ini?',
  ];

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 border border-sky-200">
            <Bot className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Butuh Bantuan? Tanya Tutor AI</h3>
            <p className="text-xs text-slate-500">
              Pemandu langkah demi langkah (bukan jawaban langsung)
            </p>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="space-y-3 pt-3 border-t border-slate-100">
          {messages.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleResetChat}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Mulai Ulang Obrolan</span>
              </button>
            </div>
          )}

          {messages.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg p-3 text-xs leading-relaxed ${
                    msg.role === 'student'
                      ? 'ml-6 bg-sky-600 text-white'
                      : 'mr-3 bg-slate-100 text-slate-800 border border-slate-200'
                  }`}
                >
                  <div className="font-semibold mb-1 opacity-80">
                    {msg.role === 'student' ? 'Kamu' : 'Tutor AI'}
                  </div>
                  <div className="whitespace-pre-line">{msg.text}</div>
                </div>
              ))}
              {loading && (
                <div className="mr-3 rounded-lg bg-slate-100 border border-slate-200 p-3 text-xs text-slate-500">
                  Menyiapkan petunjuk...
                </div>
              )}
              <div ref={scrollEndRef} />
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((promptText) => (
              <button
                key={promptText}
                type="button"
                disabled={loading || disabled}
                onClick={() => requestHint(promptText)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-sky-50 hover:border-sky-200 hover:text-sky-800 transition-colors disabled:opacity-50 text-left"
              >
                {promptText}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = input.trim();
              if (!trimmed) return;
              requestHint(trimmed);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              disabled={loading || disabled}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tulis bagian yang kamu bingung..."
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={loading || disabled || !input.trim()}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors disabled:opacity-40"
              aria-label="Kirim ke Tutor AI"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </aside>
  );
};
