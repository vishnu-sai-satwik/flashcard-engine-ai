import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SessionLog { id: string; front: string; back: string; type: string; rating: "hard" | "good" | "easy"; }
export interface Flashcard { id: string; front: string; back: string; type: string; sourceQuote?: string; easeFactor: number; interval: number; nextReviewDate: number; }
export interface Deck { id: string; title: string; createdAt: number; lastStudied: number; cards: Flashcard[]; sessionLogs?: SessionLog[]; }

interface FlashcardStore {
  decks: Deck[];
  currentView: "library" | "upload" | "study" | "finished";
  preference: string;
  cardCount: number;
  activeDeckId: string | null;
  dueCards: Flashcard[];
  currentIndex: number;
  sessionLogs: SessionLog[];
  sessionHistory: any[];

  setPreference: (pref: string) => void;
  setCardCount: (count: number) => void;
  setCurrentView: (view: "library" | "upload" | "study" | "finished") => void;
  addDeck: (deck: Deck) => void;
  deleteDeck: (id: string) => void;
  startStudySession: (deckId: string) => void;
  handleRating: (quality: number, ratingStr: "hard" | "good" | "easy") => void;
  undoRating: () => void;
  exitSession: () => void;
}

export const useStore = create<FlashcardStore>()(
  persist(
    (set, get) => ({
      decks: [],
      currentView: "library",
      preference: "Balanced",
      cardCount: 20,
      activeDeckId: null,
      dueCards: [],
      currentIndex: 0,
      sessionLogs: [],
      sessionHistory: [],

      setPreference: (p) => set({ preference: p }),
      setCardCount: (c) => set({ cardCount: c }),
      setCurrentView: (v) => set({ currentView: v }),
      
      addDeck: (deck) => {
        set((state) => ({ decks: [deck, ...state.decks] }));
        get().startStudySession(deck.id);
      },
      
      deleteDeck: (id) => set((state) => ({ decks: state.decks.filter(d => d.id !== id) })),

      startStudySession: (deckId) => {
        const deck = get().decks.find(d => d.id === deckId);
        if (!deck) return;

        // FIX: Flawlessly track if we are resuming today's session
        const isNewDay = new Date().toDateString() !== new Date(deck.lastStudied).toDateString();
        const initialLogs = isNewDay ? [] : (deck.sessionLogs || []);
        
        // Prevent cards already answered today from returning to the queue mid-session
        const answeredTodayIds = new Set(initialLogs.map(l => l.id));
        const cardsToStudy = deck.cards.filter(c => c.nextReviewDate <= Date.now() && !answeredTodayIds.has(c.id));

        set({
          activeDeckId: deck.id,
          dueCards: cardsToStudy,
          currentIndex: 0,
          sessionLogs: initialLogs,
          sessionHistory: [],
          currentView: cardsToStudy.length > 0 ? "study" : "finished"
        });
      },

      handleRating: (quality, ratingStr) => {
        const state = get();
        const { activeDeckId, dueCards, currentIndex, sessionLogs, decks, sessionHistory } = state;
        if (!activeDeckId) return;

        // Take a snapshot for Time Travel (Undo)
        set({
          sessionHistory: [...sessionHistory, {
            dueCards: [...dueCards], currentIndex, sessionLogs: [...sessionLogs], decks: JSON.parse(JSON.stringify(decks))
          }]
        });

        const currentCard = dueCards[currentIndex];

        // Track exact answers for the summary screen
        const newLog: SessionLog = { id: currentCard.id, front: currentCard.front, back: currentCard.back, type: currentCard.type, rating: ratingStr };
        const existingIdx = sessionLogs.findIndex(l => l.id === currentCard.id);
        const updatedLogs = [...sessionLogs];
        if (existingIdx >= 0) updatedLogs[existingIdx] = newLog;
        else updatedLogs.push(newLog);

        // SM-2 Math
        let newInterval = currentCard.interval;
        let newEaseFactor = currentCard.easeFactor;

        if (quality < 3) {
          newInterval = 1; // Needs review tomorrow
        } else {
          if (currentCard.interval === 0) newInterval = 1;
          else if (currentCard.interval === 1) newInterval = 6;
          else newInterval = Math.round(currentCard.interval * currentCard.easeFactor);
        }
        newEaseFactor = Math.max(1.3, currentCard.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

        const updatedCard = { ...currentCard, easeFactor: newEaseFactor, interval: newInterval, nextReviewDate: Date.now() + newInterval * 24 * 60 * 60 * 1000 };

        const updatedDecks = decks.map(d => {
          if (d.id === activeDeckId) {
            return { ...d, lastStudied: Date.now(), sessionLogs: updatedLogs, cards: d.cards.map(c => c.id === currentCard.id ? updatedCard : c) };
          }
          return d;
        });

        // Advance the session
        const nextIndex = currentIndex + 1;
        const isFinished = nextIndex >= dueCards.length;

        set({
          decks: updatedDecks,
          sessionLogs: updatedLogs,
          currentIndex: isFinished ? currentIndex : nextIndex,
          currentView: isFinished ? "finished" : "study"
        });
      },

      undoRating: () => {
        const state = get();
        if (state.sessionHistory.length === 0) return;
        const lastState = state.sessionHistory[state.sessionHistory.length - 1];
        set({
          dueCards: lastState.dueCards, currentIndex: lastState.currentIndex, sessionLogs: lastState.sessionLogs, decks: lastState.decks,
          sessionHistory: state.sessionHistory.slice(0, -1), currentView: "study"
        });
      },

      exitSession: () => set({ currentView: "library", activeDeckId: null })
    }),
    {
      name: 'cuemath_flashcard_decks',
      // CRITICAL FIX: Only save the decks to local storage. 
      // Do not save transient state like "currentIndex" which caused UI desyncs.
      partialize: (state) => ({ decks: state.decks }),
    }
  )
);