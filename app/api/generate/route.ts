import { GoogleGenAI, Type, Schema } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const deckSchema: Schema = {
  type: Type.OBJECT,
  description: "A complete flashcard deck extracted from the provided text.",
  properties: {
    title: {
      type: Type.STRING,
      description: "A short, highly descriptive title for this specific deck.",
    },
    flashcards: {
      type: Type.ARRAY,
      description: "An array of highly detailed educational flashcards.",
      items: {
        type: Type.OBJECT,
        properties: {
          front: { type: Type.STRING, description: "The core question or concept." },
          back: { type: Type.STRING, description: "The comprehensive, multi-sentence explanation. NEVER leave this blank." },
          type: { type: Type.STRING, description: "Categorize as: concept, definition, or worked_example" },
          sourceQuote: {
            type: Type.STRING,
            description: "A short, exact, verbatim sentence snippet directly from the provided text that proves the answer.",
          },
        },
        required: ["front", "back", "type", "sourceQuote"],
      },
    },
  },
  required: ["title", "flashcards"],
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, preference = "Balanced", cardCount = 20 } = body;

    if (!text) return NextResponse.json({ error: "No text provided" }, { status: 400 });

    let modeInstruction = "";
    if (preference === "Exam Crunch") {
      modeInstruction =
        "STUDY MODE: EXAM CRUNCH. Focus on high-yield, test-focused facts, but ensure answers are still complete and fully explained.";
    } else if (preference === "Deep Mastery") {
      modeInstruction =
        "STUDY MODE: DEEP MASTERY. Focus on deep understanding, underlying connections, and reasoning. Explanations MUST be highly detailed and comprehensive.";
    } else {
      modeInstruction =
        "STUDY MODE: BALANCED. Provide well-rounded coverage with clear, robust explanations.";
    }

    const bufferCount = Math.ceil(cardCount * 1.2);

    const systemInstruction = `
      You are an expert educator and domain specialist. Your task is to process the provided study material and generate a comprehensive deck of practice-ready flashcards.
      
      ${modeInstruction}

      First, generate a short, accurate title for the material. 
      Then, extract the information into the flashcards array.
      
      CRITICAL QUALITY REQUIREMENTS:
      1. DEPTH & ACCURACY: Do not write short or lazy answers. The 'back' of each flashcard MUST be thoroughly explained and highly accurate. NEVER output empty strings.
      2. QUANTITY: Generate approximately ${bufferCount} high-quality flashcards. Prioritize quality over exact numbers.
      3. MATH: If the material contains any math equations, formulas, or variables, you MUST format them using standard LaTeX syntax. Use single $ for inline math and double $$ for block equations.
      4. ANCHORING: For EVERY flashcard, you MUST extract a 'sourceQuote' verbatim from the text that proves the answer.
      
      Ensure the output strictly follows the requested JSON schema.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: text,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: deckSchema,
        temperature: preference === "Exam Crunch" ? 0.1 : 0.3,
      },
    });

    const parsedResponse = JSON.parse(response.text || "{}");
    const allCards: any[] = parsedResponse.flashcards || [];

    // Safely trim down to the requested count without breaking if AI generates slightly fewer
    const trimmedCards = allCards.slice(0, cardCount);

    return NextResponse.json({
      title: parsedResponse.title || "Untitled Deck",
      cards: trimmedCards,
    });
  } catch (error) {
    console.error("Error generating flashcards:", error);
    return NextResponse.json({ error: "Failed to generate flashcards" }, { status: 500 });
  }
}