"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, Loader2, BrainCircuit, CheckCircle2, Library, Plus, ArrowLeft, Play, Trash2, Sparkles, AlertCircle, TrendingUp, Undo2, ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// --- CORE DATA MODELS ---
interface SessionLog {
  id: string;
  front: string;
  back: string;
  type: string;
  rating: "hard" | "good" | "easy";
}

interface Flashcard {
  id: string;
  front: string;
  back: string;
  type: string;
  sourceQuote?: string;
  easeFactor: number;
  interval: number;
  nextReviewDate: number;
}

interface Deck {
  id: string;
  title: string;
  createdAt: number;
  lastStudied: number;
  cards: Flashcard[];
  allDayLogs?: SessionLog[]; 
}

const STUDY_MODES = [
  { id: "Balanced", desc: "Well-rounded coverage with explanations." },
  { id: "Exam Crunch", desc: "High-yield, concise, and test-focused." },
  { id: "Deep Mastery", desc: "Connections, reasoning, and mastery." }
];

export default function Home() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [currentView, setCurrentView] = useState<"library" | "upload" | "study" | "finished">("library");

  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [preference, setPreference] = useState("Balanced");
  const [cardCount, setCardCount] = useState<number>(20);

  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const [allDayLogs, setAllDayLogs] = useState<SessionLog[]>([]);
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);

  const [isExplaining, setIsExplaining] = useState(false);
  const [explainingCardId, setExplainingCardId] = useState<string | null>(null);
  const [tutorExplanations, setTutorExplanations] = useState<Record<string, string>>({});
  
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    const savedDecks = localStorage.getItem("cuemath_flashcard_decks");
    if (savedDecks) setDecks(JSON.parse(savedDecks));
  }, []);

  useEffect(() => {
    localStorage.setItem("cuemath_flashcard_decks", JSON.stringify(decks));
  }, [decks]);

  const calculateRetentionScore = (deck: Deck) => {
    if (deck.cards.length === 0) return 0;
    let totalScore = 0;
    deck.cards.forEach(card => {
      let score = (card.easeFactor / 2.5) * 60;
      score += card.interval * 5;
      if (card.nextReviewDate <= Date.now()) score -= 20;
      totalScore += Math.min(100, Math.max(0, score));
    });
    return Math.round(totalScore / deck.cards.length);
  };

  const globalRetention = decks.length > 0 ? Math.round(decks.reduce((acc, d) => acc + calculateRetentionScore(d), 0) / decks.length) : 0;

  const extractTextFromPDF = async (file: File) => {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((item: any) => item.str).join(" ") + " ";
    }
    return fullText;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setLoadingText(`Architecting ${preference} deck...`);

    try {
      const text = await extractTextFromPDF(file);
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, preference, cardCount }),
      });

      const data = await response.json();

      if (data.cards) {
        const newCards: Flashcard[] = data.cards.map((c: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          ...c, easeFactor: 2.5, interval: 0, nextReviewDate: Date.now(),
        }));

        const newDeck: Deck = {
          id: Math.random().toString(36).substr(2, 9),
          title: data.title || file.name.replace(".pdf", ""),
          createdAt: Date.now(), lastStudied: Date.now(), cards: newCards,
          allDayLogs: [],
        };

        setDecks(prev => [newDeck, ...prev]);
        startStudySession(newDeck);
      }
    } catch (error) {
      alert("Something went wrong analyzing the PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const startStudySession = (deck: Deck) => {
    setActiveDeckId(deck.id);
    setExpandedLogId(null);
    setTutorExplanations({});

    const isNewDay = new Date().toDateString() !== new Date(deck.lastStudied).toDateString();
    const existingLogs: SessionLog[] = isNewDay ? [] : (deck.allDayLogs || []);
    
    const answeredTodayIds = new Set(existingLogs.map(l => l.id));
    const cardsToStudy = deck.cards.filter(c => c.nextReviewDate <= Date.now() && !answeredTodayIds.has(c.id));

    setAllDayLogs(existingLogs);
    setSessionHistory([]);

    if (cardsToStudy.length === 0) {
      setCurrentView("finished");
      return;
    }

    setDueCards(cardsToStudy);
    setCurrentIndex(0);
    setCurrentView("study");
  };

  const handleRating = (quality: number, ratingStr: "hard" | "good" | "easy") => {
    if (!activeDeckId) return;

    setSessionHistory(prev => [...prev, {
      dueCards: [...dueCards],
      currentIndex,
      allDayLogs: [...allDayLogs],
      decks: JSON.parse(JSON.stringify(decks)),
    }]);

    const currentCard = dueCards[currentIndex];

    const newLog: SessionLog = {
      id: currentCard.id, front: currentCard.front, back: currentCard.back,
      type: currentCard.type, rating: ratingStr,
    };

    const existingDayIdx = allDayLogs.findIndex(l => l.id === currentCard.id);
    const updatedAllDayLogs = existingDayIdx >= 0
      ? allDayLogs.map((l, i) => (i === existingDayIdx ? newLog : l))
      : [...allDayLogs, newLog];

    let newInterval = currentCard.interval;
    let newEaseFactor = currentCard.easeFactor;

    if (quality < 3) {
      newInterval = 1; 
    } else {
      if (currentCard.interval === 0) newInterval = 1;
      else if (currentCard.interval === 1) newInterval = 6;
      else newInterval = Math.round(currentCard.interval * currentCard.easeFactor);
    }
    newEaseFactor = Math.max(1.3, currentCard.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

    const updatedCard: Flashcard = {
      ...currentCard, easeFactor: newEaseFactor, interval: newInterval,
      nextReviewDate: Date.now() + newInterval * 24 * 60 * 60 * 1000,
    };

    setDecks(prev => prev.map(d => {
      if (d.id === activeDeckId) {
        return {
          ...d, lastStudied: Date.now(),
          cards: d.cards.map(c => (c.id === currentCard.id ? updatedCard : c)),
          allDayLogs: updatedAllDayLogs,
        };
      }
      return d;
    }));

    setAllDayLogs(updatedAllDayLogs);
    setIsFlipped(false);

    setTimeout(() => {
      if (currentIndex + 1 >= dueCards.length) {
        setCurrentView("finished");
      } else {
        setCurrentIndex(prev => prev + 1);
      }
    }, 200);
  };

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessionHistory.length === 0) return;

    const lastState = sessionHistory[sessionHistory.length - 1];
    setDueCards(lastState.dueCards);
    setCurrentIndex(lastState.currentIndex);
    setAllDayLogs(lastState.allDayLogs);
    setDecks(lastState.decks);
    
    setSessionHistory(prev => prev.slice(0, -1));
    setIsFlipped(false);
  };

  const handleExplain = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentCard = dueCards[currentIndex];
    
    if (tutorExplanations[currentCard.id]) return;
    
    setExplainingCardId(currentCard.id);
    try {
      const response = await fetch("/api/explain", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front: currentCard.front, back: currentCard.back }),
      });
      const data = await response.json();
      setTutorExplanations(prev => ({ ...prev, [currentCard.id]: data.explanation }));
    } catch (error) {
      alert("Failed to connect to the AI Tutor.");
    } finally {
      setExplainingCardId(null);
    }
  };

  const deleteDeck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDecks(prev => prev.filter(d => d.id !== id));
  };

  const pageTransition = {
    initial: { opacity: 0, y: 15, scale: 0.99 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -15, scale: 0.99 },
    transition: { duration: 0.3, ease: "easeOut" },
  };

  const totalCardsToday = allDayLogs.length + (dueCards.length - currentIndex);
  const currentCardNum = allDayLogs.length + 1;
  const progressPercent = totalCardsToday > 0 ? Math.round((allDayLogs.length / totalCardsToday) * 100) : 100;

  return (
    <div className="min-h-screen text-white font-sans overflow-hidden relative bg-[#050505]">
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .preserve-3d { transform-style: preserve-3d; }
        .perspective-1000 { perspective: 1000px; }
      `}} />

      {/* STATIC HIGH-PERFORMANCE BACKGROUND - ZERO LAG */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[80vw] md:w-[40vw] h-[80vw] md:h-[40vw] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[90vw] md:w-[50vw] h-[90vw] md:h-[50vw] bg-purple-600/10 blur-[150px] rounded-full" />
      </div>

      <div className="relative z-10 h-screen overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="wait">

          {/* ── LIBRARY ── */}
          {currentView === "library" && (
            <motion.div key="library" {...pageTransition} className="p-4 sm:p-8 md:p-16 max-w-6xl mx-auto min-h-full flex flex-col">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 md:mb-16 gap-6">
                <div>
                  <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight flex items-center gap-3">
                    <BrainCircuit className="text-blue-500 w-8 h-8 md:w-10 md:h-10 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]" /> 
                    Flashcard Engine
                  </h1>
                  <p className="text-neutral-400 mt-2 text-sm md:text-base font-medium">Smart spaced-repetition powered by AI.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
                  {decks.length > 0 && (
                    <div className="bg-[#111] border border-white/5 px-6 py-3 rounded-2xl flex items-center justify-between gap-5 w-full sm:w-auto">
                      <div>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-extrabold mb-0.5">Global Retention</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-black text-green-500 leading-none">{globalRetention}%</span>
                        </div>
                      </div>
                      <div className="flex items-end gap-1 h-6">
                        {[40, 45, 60, 55, 70, 85, globalRetention].map((bar, i) => (
                          <div key={i} className={`w-1.5 rounded-sm ${i === 6 ? 'bg-green-500' : 'bg-white/10'}`} style={{ height: `${Math.max(10, bar)}%` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={() => setCurrentView("upload")} className="bg-white text-black px-6 py-3 rounded-full font-bold flex items-center justify-center gap-2 hover:bg-neutral-200 transition-all w-full sm:w-auto">
                    <Plus className="w-5 h-5" /> New Deck
                  </button>
                </div>
              </div>

              {decks.length === 0 ? (
                <div className="flex-grow flex flex-col items-center justify-center text-center py-20 px-4">
                  <Library className="w-12 h-12 text-neutral-600 mb-4" />
                  <h2 className="text-2xl font-semibold text-neutral-300 mb-2">No decks yet</h2>
                  <p className="text-neutral-500 mb-6 text-sm">Upload a PDF to let Gemini architect your first deck.</p>
                  <button onClick={() => setCurrentView("upload")} className="text-blue-400 hover:text-blue-300 font-bold px-6 py-3 bg-blue-500/10 rounded-full border border-blue-500/20 text-sm">
                    Create Deck &rarr;
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                  {decks.map((deck) => {
                    const isNewDay = new Date().toDateString() !== new Date(deck.lastStudied).toDateString();
                    const todayLogs = isNewDay ? [] : (deck.allDayLogs || []);
                    const answeredTodayIds = new Set(todayLogs.map(l => l.id));
                    
                    const dueCount = deck.cards.filter(c => c.nextReviewDate <= Date.now() && !answeredTodayIds.has(c.id)).length;
                    const answeredToday = todayLogs.length;
                    const totalDueToday = Math.min(deck.cards.length, dueCount + answeredToday);
                    const hasProgress = answeredToday > 0 && dueCount > 0;
                    const allDoneToday = answeredToday > 0 && dueCount === 0;

                    return (
                      <div key={deck.id} onClick={() => startStudySession(deck)} className="bg-[#111] border border-white/5 p-5 md:p-6 rounded-2xl cursor-pointer hover:border-neutral-600 transition-all duration-200 group relative flex flex-col min-h-[180px] md:min-h-[200px]">
                        <button onClick={(e) => deleteDeck(deck.id, e)} className="absolute top-4 right-4 text-neutral-600 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-2">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <h3 className="text-lg md:text-xl font-bold mb-2 pr-8">{deck.title}</h3>
                        <p className="text-[10px] md:text-xs text-neutral-500 font-semibold uppercase tracking-wider mb-4 md:mb-6">{deck.cards.length} Total Cards</p>
                        
                        {(hasProgress || allDoneToday) && (
                          <div className="mb-4 mt-auto">
                            <div className="flex justify-between text-[9px] md:text-[10px] text-neutral-500 mb-1 font-bold uppercase tracking-wide">
                              <span>Today's Progress</span>
                              <span>{answeredToday} / {totalDueToday}</span>
                            </div>
                            <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" style={{ width: `${totalDueToday > 0 ? (answeredToday / totalDueToday) * 100 : 100}%` }} />
                            </div>
                          </div>
                        )}

                        <div className={`flex items-center justify-between ${!(hasProgress || allDoneToday) ? 'mt-auto' : ''}`}>
                          <span className={`px-2 md:px-3 py-1 md:py-1.5 rounded-md text-[9px] md:text-[10px] font-bold tracking-widest uppercase ${allDoneToday ? "bg-green-500/10 text-green-400" : hasProgress ? "bg-yellow-500/10 text-yellow-400" : dueCount > 0 ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-500"}`}>
                             {allDoneToday ? "View Summary" : hasProgress ? `${dueCount} Remaining` : dueCount > 0 ? `${dueCount} Due for Review` : "All caught up"}
                          </span>
                          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-colors shrink-0">
                            <Play className="w-3 h-3 ml-0.5" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ── UPLOAD ── */}
          {currentView === "upload" && (
            <motion.div key="upload" {...pageTransition} className="min-h-full flex flex-col items-center justify-center p-4 sm:p-8 relative">
              <button onClick={() => setCurrentView("library")} className="absolute top-4 sm:top-8 left-4 sm:left-8 text-neutral-400 hover:text-white flex items-center gap-2 bg-[#111] px-4 sm:px-5 py-2 sm:py-2.5 rounded-full border border-white/5 transition-colors text-xs sm:text-sm font-medium z-10">
                <ArrowLeft className="w-4 h-4" /> Cancel
              </button>
              
              <div className="max-w-2xl w-full space-y-6 sm:space-y-8 mt-16 sm:mt-12">
                <div className="text-center space-y-2 sm:space-y-3 mb-6 sm:mb-10">
                  <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Make These Cards YOURS</h1>
                  <p className="text-sm sm:text-base text-neutral-400">Customize how your flashcards are generated</p>
                </div>

                <div className="bg-[#111] border border-white/5 p-6 sm:p-8 rounded-2xl shadow-xl">
                  <h3 className="text-xs sm:text-sm font-bold text-neutral-300 mb-4 flex items-center gap-2"><Sparkles className="w-4 h-4 text-blue-400"/> Pick a starting preset</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                    {STUDY_MODES.map((mode) => (
                      <button key={mode.id} onClick={() => setPreference(mode.id)} className={`text-left p-4 rounded-xl border transition-all duration-200 flex flex-col ${preference === mode.id ? "bg-blue-500/10 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.1)] text-white" : "bg-[#151515] border-white/5 text-neutral-400 hover:border-white/20"}`}>
                        <p className="font-bold text-sm mb-1 text-white">{mode.id}</p>
                        <p className="text-xs text-neutral-500">{mode.desc}</p>
                      </button>
                    ))}
                  </div>

                  <h3 className="text-xs sm:text-sm font-bold text-neutral-300 mb-4 flex items-center gap-2"><Library className="w-4 h-4 text-purple-400"/> Number of flashcards</h3>
                  <div className="flex items-center gap-4 mb-2">
                    <input type="range" min="10" max="50" step="5" value={cardCount} onChange={e => setCardCount(Number(e.target.value))} className="flex-grow accent-white h-1 bg-white/10 rounded-lg appearance-none cursor-pointer" />
                    <span className="text-xl font-bold bg-white/5 px-4 py-1.5 rounded-lg border border-white/5 text-white">{cardCount}</span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-neutral-500 mb-8">Actual card count is determined by AI based on content length.</p>

                  <h3 className="text-xs sm:text-sm font-bold text-neutral-300 mb-4">Upload Source Material</h3>
                  <div className={`relative border-2 border-dashed rounded-xl p-8 sm:p-10 transition-all ${isProcessing ? "border-blue-500/50 bg-blue-500/5" : "border-white/10 hover:border-neutral-500 bg-[#0A0A0A]"}`}>
                    {isProcessing ? (
                      <div className="flex flex-col items-center space-y-4 text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        <p className="text-xs sm:text-sm font-medium text-blue-400">{loadingText}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-3 text-center cursor-pointer">
                        <UploadCloud className="w-8 h-8 text-neutral-400" />
                        <p className="text-xs sm:text-sm font-bold text-white">Click to upload PDF</p>
                        <input type="file" accept=".pdf" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={isProcessing} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── STUDY ── */}
          {currentView === "study" && dueCards[currentIndex] && (
            <motion.div key="study" {...pageTransition} className="min-h-full flex flex-col items-center p-4 sm:p-6 md:p-12 relative">
              
              <div className="absolute top-4 sm:top-8 left-4 sm:left-8 flex gap-2 sm:gap-3 z-50">
                <button onClick={() => setCurrentView("library")} className="text-neutral-400 hover:text-white flex items-center gap-1.5 sm:gap-2 bg-[#111] px-3 sm:px-5 py-2 sm:py-2.5 rounded-full border border-white/5 transition-colors text-xs sm:text-sm font-bold">
                  <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" /> Exit
                </button>
                {sessionHistory.length > 0 && (
                  <button onClick={handleUndo} className="text-blue-400 hover:text-blue-300 flex items-center gap-1.5 sm:gap-2 bg-blue-500/10 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full border border-blue-500/20 transition-colors text-xs sm:text-sm font-bold">
                    <Undo2 className="w-3 h-3 sm:w-4 sm:h-4" /> Undo
                  </button>
                )}
              </div>

              <div className="w-full max-w-3xl mb-8 mt-14 sm:mt-12 z-10">
                <div className="flex justify-between text-[10px] sm:text-xs font-bold text-neutral-500 mb-2 sm:mb-3 uppercase tracking-wide">
                  <span>Card {currentCardNum} of {totalCardsToday} Today</span>
                  <span className="text-blue-500">{progressPercent}% Mastered</span>
                </div>
                <div className="h-1.5 w-full bg-[#1A1A1A] rounded-full overflow-hidden">
                  <motion.div className="h-full bg-blue-600" initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.4 }} />
                </div>
              </div>

              <div className="relative w-full max-w-3xl h-[400px] md:h-[500px] perspective-1000 z-10" onClick={() => setIsFlipped(!isFlipped)}>
                <motion.div className="w-full h-full relative preserve-3d cursor-pointer" animate={{ rotateX: isFlipped ? 180 : 0 }} transition={{ duration: 0.5, type: "spring", stiffness: 260, damping: 25 }} style={{ transformStyle: "preserve-3d" }}>
                  
                  {/* FRONT */}
                  <div className="absolute w-full h-full backface-hidden bg-[#111] border border-white/5 rounded-3xl p-6 sm:p-10 flex flex-col justify-center items-center text-center shadow-2xl">
                    <span className="absolute top-4 sm:top-6 left-4 sm:left-6 uppercase tracking-widest text-[9px] sm:text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border border-blue-500/20">
                      {dueCards[currentIndex].type?.replace("_", " ")}
                    </span>
                    <div className="text-2xl sm:text-3xl md:text-4xl font-medium w-full overflow-y-auto max-h-[80%] custom-scrollbar [&>p]:m-0 flex flex-col justify-center items-center leading-tight sm:leading-tight px-2">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{dueCards[currentIndex].front}</ReactMarkdown>
                    </div>
                    <p className="absolute bottom-4 sm:bottom-6 text-neutral-600 text-[10px] sm:text-xs font-bold tracking-widest uppercase">Click to flip</p>
                  </div>
                  
                  {/* BACK */}
                  <div className="absolute w-full h-full backface-hidden bg-[#151515] border border-white/5 rounded-3xl p-6 sm:p-8 flex flex-col shadow-2xl" style={{ transform: "rotateX(180deg)", backfaceVisibility: "hidden" }}>
                    
                    <div className="w-full shrink-0 mb-4 border-b border-white/5 pb-3 sm:pb-4">
                      {!tutorExplanations[dueCards[currentIndex].id] ? (
                        <button onClick={handleExplain} disabled={explainingCardId === dueCards[currentIndex].id} className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#D4B3FF] hover:text-[#E2C9FF] transition-colors w-full justify-center bg-[#2A1E38] py-2.5 sm:py-3.5 rounded-xl border border-[#432C66] hover:bg-[#342645]">
                          {explainingCardId === dueCards[currentIndex].id ? <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" /> : <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />}
                          {explainingCardId === dueCards[currentIndex].id ? "Generating Analogy..." : "I don't get it. Explain with AI Tutor."}
                        </button>
                      ) : (
                        <div className="bg-[#2A1E38] border border-[#432C66] rounded-xl p-3 sm:p-4 animate-in fade-in">
                          <p className="text-[9px] sm:text-[10px] font-bold text-[#D4B3FF] uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> AI Tutor</p>
                          <p className="text-xs sm:text-sm text-[#F0E6FF] leading-relaxed">{tutorExplanations[dueCards[currentIndex].id]}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex-grow overflow-y-auto custom-scrollbar text-left pr-2">
                      <div className="text-base sm:text-lg md:text-xl leading-relaxed text-neutral-200 [&>p]:mb-4 [&>p:last-child]:mb-0">
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{dueCards[currentIndex].back}</ReactMarkdown>
                      </div>
                    </div>

                    {dueCards[currentIndex].sourceQuote && (
                      <div className="shrink-0 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/5 text-left">
                        <p className="text-[8px] sm:text-[9px] font-bold text-neutral-600 uppercase tracking-widest mb-1">Verifiable Source Context</p>
                        <p className="text-[10px] sm:text-xs text-neutral-400 italic">"{dueCards[currentIndex].sourceQuote}"</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              <AnimatePresence>
                {isFlipped && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-row gap-2 sm:gap-4 mt-6 sm:mt-8 z-10 w-full max-w-2xl justify-center">
                    <button onClick={(e) => { e.stopPropagation(); handleRating(1, "hard"); }} className="flex-1 max-w-[160px] py-3 sm:py-3.5 rounded-xl sm:rounded-full font-bold bg-transparent text-red-500 border border-red-500/30 hover:bg-red-500/10 transition-colors text-xs sm:text-sm">Learning (Hard)</button>
                    <button onClick={(e) => { e.stopPropagation(); handleRating(4, "good"); }} className="flex-1 max-w-[160px] py-3 sm:py-3.5 rounded-xl sm:rounded-full font-bold bg-transparent text-yellow-500 border border-yellow-500/30 hover:bg-yellow-500/10 transition-colors text-xs sm:text-sm">Good</button>
                    <button onClick={(e) => { e.stopPropagation(); handleRating(5, "easy"); }} className="flex-1 max-w-[160px] py-3 sm:py-3.5 rounded-xl sm:rounded-full font-bold bg-transparent text-green-500 border border-green-500/30 hover:bg-green-500/10 transition-colors text-xs sm:text-sm">Mastered (Easy)</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── FINISHED ── */}
          {currentView === "finished" && (
            <motion.div key="finished" {...pageTransition} className="min-h-full flex flex-col items-center justify-center p-4 sm:p-8 pb-20">
              <div className="text-center w-full max-w-4xl mt-8 sm:mt-12">
                <div className="bg-green-500/10 w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                  <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-green-500" />
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold mb-2">Session Complete</h1>
                <p className="text-neutral-400 text-sm sm:text-base">Your algorithmic intervals have been updated.</p>
                
                <div className="flex gap-3 sm:gap-4 justify-center mt-8 sm:mt-10 mb-8 sm:mb-12">
                  <div className="bg-[#111] border border-white/5 px-6 sm:px-8 py-5 sm:py-6 rounded-2xl text-center flex-1 max-w-[140px] sm:max-w-[160px]">
                    <p className="text-4xl sm:text-5xl font-black text-red-500 mb-1 sm:mb-2 drop-shadow-[0_0_12px_rgba(239,68,68,0.5)]">{allDayLogs.filter(l => l.rating === "hard").length}</p>
                    <p className="text-[9px] sm:text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Learning</p>
                  </div>
                  <div className="bg-[#111] border border-white/5 px-6 sm:px-8 py-5 sm:py-6 rounded-2xl text-center flex-1 max-w-[140px] sm:max-w-[160px]">
                    <p className="text-4xl sm:text-5xl font-black text-green-500 mb-1 sm:mb-2 drop-shadow-[0_0_12px_rgba(34,197,94,0.5)]">{allDayLogs.filter(l => l.rating !== "hard").length}</p>
                    <p className="text-[9px] sm:text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Mastered</p>
                  </div>
                </div>

                <div className="w-full bg-[#111] border border-white/5 p-6 sm:p-8 rounded-3xl mt-4 flex flex-col md:flex-row gap-6 sm:gap-8 text-left mb-8 sm:mb-12">
                  <div className="flex-1">
                    <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 mb-4 text-red-400">
                      <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" /> Areas to Review
                    </h3>
                    {allDayLogs.filter(log => log.rating === "hard").length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-neutral-500 text-xs sm:text-sm">Flawless session! Nothing to review.</p>
                      </div>
                    ) : (
                      <ul className="space-y-3 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                        {allDayLogs.filter(log => log.rating === "hard").map((c) => (
                          <li key={c.id} className="bg-[#1A1A1A] rounded-xl border border-red-500/10 overflow-hidden">
                             <button className="w-full text-left p-3 sm:p-4 flex items-start justify-between gap-3 hover:bg-white/5 transition-colors" onClick={() => setExpandedLogId(expandedLogId === `hard-${c.id}` ? null : `hard-${c.id}`)}>
                              <div className="flex-1 min-w-0">
                                <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-red-500 mb-1.5 block">{c.type?.replace("_", " ")}</span>
                                <div className="text-xs sm:text-sm text-neutral-300 line-clamp-2 [&>p]:m-0">
                                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{c.front}</ReactMarkdown>
                                </div>
                              </div>
                              {expandedLogId === `hard-${c.id}` ? <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4 text-neutral-500 shrink-0 mt-1" /> : <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-neutral-500 shrink-0 mt-1" />}
                            </button>
                            <AnimatePresence>
                              {expandedLogId === `hard-${c.id}` && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                  <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2 border-t border-red-500/10">
                                    <p className="text-[8px] sm:text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Answer</p>
                                    <div className="text-xs sm:text-sm text-neutral-400 leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0">
                                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{c.back}</ReactMarkdown>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="w-px bg-white/5 hidden md:block" />

                  <div className="flex-1">
                    <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 mb-4 text-green-400">
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" /> Strong Concepts
                    </h3>
                    {allDayLogs.filter(log => log.rating !== "hard").length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-neutral-500 text-xs sm:text-sm">Keep practicing!</p>
                      </div>
                    ) : (
                      <ul className="space-y-3 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                        {allDayLogs.filter(log => log.rating !== "hard").map((c) => (
                          <li key={c.id} className="bg-[#1A1A1A] rounded-xl border border-green-500/10 overflow-hidden">
                             <button className="w-full text-left p-3 sm:p-4 flex items-start justify-between gap-3 hover:bg-white/5 transition-colors" onClick={() => setExpandedLogId(expandedLogId === `good-${c.id}` ? null : `good-${c.id}`)}>
                              <div className="flex-1 min-w-0">
                                <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-green-500 mb-1.5 block">{c.type?.replace("_", " ")}</span>
                                <div className="text-xs sm:text-sm text-neutral-300 line-clamp-2 [&>p]:m-0">
                                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{c.front}</ReactMarkdown>
                                </div>
                              </div>
                              {expandedLogId === `good-${c.id}` ? <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4 text-neutral-500 shrink-0 mt-1" /> : <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-neutral-500 shrink-0 mt-1" />}
                            </button>
                            <AnimatePresence>
                              {expandedLogId === `good-${c.id}` && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                  <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2 border-t border-green-500/10">
                                    <p className="text-[8px] sm:text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Answer</p>
                                    <div className="text-xs sm:text-sm text-neutral-400 leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0">
                                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{c.back}</ReactMarkdown>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <button onClick={() => setCurrentView("library")} className="bg-white text-black px-8 py-3 rounded-full text-sm font-bold hover:bg-neutral-200 transition-colors w-full sm:w-auto">
                  Return to Dashboard
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}