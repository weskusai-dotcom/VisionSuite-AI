
import { GoogleGenAI, Type } from "@google/genai";

// @google/genai compliant senior engineer fix:
// 1. API key is obtained exclusively from process.env.API_KEY.
// 2. Always use a named parameter for apiKey: new GoogleGenAI({apiKey: process.env.API_KEY}).
// 3. Creating instance per call ensures latest API key usage as per guidelines.

export const removeBackground = async (base64Image: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Using gemini-2.5-flash-image for image editing tasks.
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/png' } },
        { text: 'Remove the background and return ONLY the isolated subject with a transparent background. Ensure the output is a PNG with an alpha channel.' }
      ],
    },
  });

  // Iterate through parts to find the image part as recommended.
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }
  throw new Error('No image returned from Gemini');
};

export const analyzeImage = async (base64Image: string, mimeType: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Using gemini-3-flash-preview for basic text/analysis tasks.
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType } },
        { text: 'Analyze this image. Provide a detailed caption and a list of relevant tags (max 10).' }
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          caption: { type: Type.STRING, description: 'A descriptive caption of the image.' },
          tags: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: 'List of keywords for the image.' 
          }
        },
        required: ["caption", "tags"],
        propertyOrdering: ["caption", "tags"]
      }
    }
  });

  // Use response.text property directly.
  const text = response.text || "{}";
  return JSON.parse(text);
};
