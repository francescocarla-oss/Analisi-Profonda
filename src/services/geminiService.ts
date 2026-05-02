export async function analyzeCompany(ticker: string, language: string = 'it') {
  console.log("[Client] Richiesta analisi profonda per via Server:", ticker);
  
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ticker, language }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Errore server: ${response.status}`);
    }

    const result = await response.json();
    
    // Attempt to save history (fire and forget)
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    }).catch(err => console.error("History sync error:", err));

    return result;

  } catch (error: any) {
    console.error("[Client] Analysis Error:", error);
    // User-friendly mapping for certain errors
    if (error.message?.includes("503") || error.message?.includes("UNAVAILABLE") || error.message?.includes("high demand")) {
      throw new Error("Il modello AI è attualmente sovraccarico. Per favore riprova tra qualche minuto.");
    }
    throw error;
  }
}
