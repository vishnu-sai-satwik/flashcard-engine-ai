# 🧠 Flashcard Engine AI

**A production-grade, AI-native spaced repetition system built for the Cuemath AI Builder Challenge.**

Website Link: https://flashcard-engine-ai.vercel.app/
Loom Video Presentation: 

## 🚀 The Product Mindset
Standard AI flashcard generators act as simple wrappers around an LLM. For this challenge, I approached the problem as a **Product Engineer**, focusing on algorithmic fidelity, UX edge cases, and verifiable learning. 

This isn't just an API call; it's a seamless, offline-resilient study platform.

### 💡 Key Product Differentiators

* **Algorithmic Fidelity (Zustand + SM-2):** Implementing Spaced Repetition (SM-2) in a standard React component creates race conditions during mid-session exits. I decoupled the logic using **Zustand** global state management. This ensures that if a user leaves mid-session and returns, their exact daily progress and queue state are flawlessly rehydrated without double-counting metrics.
* **Verifiable Truth (Anti-Hallucination):** To combat LLM hallucinations, the Gemini generation prompt strictly requires an exact `sourceQuote` for every flashcard. The UI renders this verifiable context at the bottom of the card, proving data lineage to the student.
* **On-Card AI Tutor:** When a student doesn't understand a card, they shouldn't just click "Hard" and memorize what they don't grasp. I built a secondary `/api/explain` route. Clicking "Explain Like I'm 5" generates a contextual, ultra-simple analogy right on the card's back face without disrupting the session flow.
* **Strict Density Control:** LLMs struggle with exact counting. If a user requests 20 cards, the system intelligently requests a buffer from Gemini and strictly trims the array on the server-side, guaranteeing the exact density target is met.
* **Performance-First UI:** The UI uses a premium Glassmorphism aesthetic with CSS-based ambient mesh gradients. I deliberately avoided expensive React animations on massive blur filters to ensure the app maintains a silky 60fps even on lower-end laptops.

## 🛠 Technical Architecture

* **Framework:** Next.js 14 (App Router)
* **State Management:** Zustand (w/ Persist Middleware for LocalStorage)
* **AI Engine:** Google Gemini 2.5 Flash API
* **Styling & UI:** Tailwind CSS, Framer Motion, Lucide React
* **Markdown Parsing:** React-Markdown, Remark-Math, Rehype-Katex (Full LaTeX support)
* **Deployment:** Vercel

 Architected and engineered by **Vishnu Sai Satwik** for **Cuemath**.
