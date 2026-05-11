const { GoogleGenAI } = require("@google/genai");
require('dotenv').config({ path: 'C:\\Users\\lodov\\.gemini\\antigravity\\scratch\\app_aistudio\\github_ready\\.env' });

async function list() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    // In the new SDK, ai.models might not have listModels. We can try fetch directly if needed.
    // Let's just try to generate content with 2.5, 2.0, 1.5 to see what throws 404 and what throws 503.
    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
    
    for (const model of models) {
      console.log(`Testing ${model}...`);
      try {
        const response = await ai.models.generateContent({
          model: model,
          contents: "Ciao, rispondi solo con OK.",
        });
        console.log(`Success with ${model}: ${response.text.substring(0, 10)}`);
      } catch (err) {
        console.error(`Error with ${model}:`, err.message);
      }
    }
  } catch(e) {
    console.error(e);
  }
}
list();
