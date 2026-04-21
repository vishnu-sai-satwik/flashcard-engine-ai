import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const { front, back } = await req.json();

    if (!front || !back) {
      return NextResponse.json({ error: "Missing card data" }, { status: 400 });
    }

    const systemInstruction = `
      You are a friendly, deeply empathetic AI Tutor. 
      A student is studying a flashcard but does not understand the explanation.
      
      Your job is to break down the concept into an "Explain Like I'm 5" (ELI5) analogy. 
      Keep it strictly to 2 or 3 extremely simple, intuitive sentences. 
      Do NOT just repeat the technical terms. Make it relatable.
    `;

    const prompt = `Flashcard Question: ${front}\nFlashcard Answer: ${back}\n\nPlease explain this simply.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7, 
      },
    });

    return NextResponse.json({ 
      explanation: response.text 
    });

  } catch (error) {
    console.error("Error generating explanation:", error);
    return NextResponse.json({ error: "Failed to generate explanation" }, { status: 500 });
  }
}