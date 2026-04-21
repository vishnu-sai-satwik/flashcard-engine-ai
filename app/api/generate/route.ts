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
      description: "An array of educational flashcards.",
      items: {
        type: Type.OBJECT,
        properties: {
          front: { type: Type.STRING, description: "The core question or concept." },
          back: { type: Type.STRING, description: "The comprehensive explanation." },
          type: { type: Type.STRING, description: "Categorize as: concept, definition, or worked_example" },
          sourceQuote: { 
            type: Type.STRING, 
            description: "A short, exact, verbatim sentence snippet directly from the provided text that proves or contextualizes this card. DO NOT hallucinate this." 
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
      modeInstruction = "STUDY MODE: EXAM CRUNCH. Focus exclusively on high-yield, concise, and test-focused facts. Prioritize brevity and direct, punchy answers.";
    } else if (preference === "Deep Mastery") {
      modeInstruction = "STUDY MODE: DEEP MASTERY. Focus on deep understanding, underlying connections, reasoning, and comprehensive mastery of the topic. Explanations should be highly detailed.";
    } else {
      modeInstruction = "STUDY MODE: BALANCED. Provide well-rounded coverage with clear, balanced explanations.";
    }

    const systemInstruction = `
      You are an expert educator. Your task is to process the provided study material and generate a comprehensive deck of practice-ready flashcards.
      
      ${modeInstruction}

      First, generate a short, accurate title for the material. 
      Then, extract the information into the flashcards array.
      
      CRITICAL REQUIREMENTS:
      1. QUANTITY: Generate approximately ${cardCount} flashcards. Prioritize the most important material to hit this density target.
      2. MATH: If the material contains any math equations, formulas, or variables, you MUST format them using standard LaTeX syntax. Use single $ for inline math and double $$ for block equations.
      3. ANCHORING: For EVERY flashcard, you MUST extract a 'sourceQuote'. This must be a verbatim snippet from the text that proves the answer.
      
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

let flashcards = parsedResponse.flashcards || [];

// ✅ FIX: Strictly enforce cardCount limit
if (flashcards.length > cardCount) {
  flashcards = flashcards.slice(0, cardCount);
}

return NextResponse.json({ 
  title: parsedResponse.title || "Untitled Deck",
  cards: flashcards
});

  } catch (error) {
    console.error("Error generating flashcards:", error);
    return NextResponse.json({ error: "Failed to generate flashcards" }, { status: 500 });
  }
}