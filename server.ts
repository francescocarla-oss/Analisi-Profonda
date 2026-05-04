import express from 'express';
import 'dotenv/config';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

// Initialize Gemini only when needed to ensure API key is loaded
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("Chiave API non trovata. Per favore, assicurati che la variabile d'ambiente 'GEMINI_API_KEY' sia impostata correttamente nei Secrets.");
  }
  return new GoogleGenAI({ apiKey });
};

// Simple JSON "database" for global history
const HISTORY_FILE = path.join(process.cwd(), 'history.json');
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
}

const getHistory = () => {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return content.trim() ? JSON.parse(content) : [];
  } catch (e) {
    console.error("[Server] Error reading history:", e);
    return [];
  }
};
const saveHistory = (history: any) => {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (e) {
    console.error("[Server] Error saving history:", e);
  }
};

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[Server] ${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), hasKey: !!process.env.GEMINI_API_KEY });
});

app.post('/api/analyze', async (req, res) => {
  const { ticker, language } = req.body;
  if (!ticker) return res.status(400).json({ error: 'Ticker mancante' });

  try {
    const ai = getGeminiClient();
    const currentDate = new Date().toISOString().split('T')[0];

    const prompt = `
      Analizza in profondità l'azienda: ${ticker}.
      Data odierna di riferimento: ${currentDate}.

      REGOLE CRITICHE DI IDENTIFICAZIONE:
      1. Identifica l'azienda partendo dalla richiesta: "${ticker}". La richiesta può essere il NOME dell'azienda (es. "Saipem"), il TICKER senza suffisso (es. "SPM") o il TICKER con suffisso (es. "SPM.MI").
      2. Il tuo primo compito è identificare l'azienda corretta e la sua borsa valori principale.
      3. Se l'azienda NON ESISTE, NON È QUOTATA in Borsa, o se il nome si riferisce a un personaggio immaginario, un luogo di fantasia o un concetto astratto, NON DEVI inventare o associare l'analisi a un'altra azienda.
      4. In caso di azienda inesistente o non quotata, restituisci il tag [REPORT] contenente esattamente la stringa: "AZIENDA_NON_ESISTENTE". NON FARE ASSOCIAZIONI CREATIVE.

      REGOLE DI ANALISI:
      1. Per l'analisi fondamentale, usa come fonti gli annual reports ufficiali e i SEC files ufficiali (10-K, 10-Q, ecc.).
      2. Per TUTTI i dati dinamici di mercato (PREZZO DI BORSA, CAPITALIZZAZIONE DI MERCATO, P/E RATIO, DIVIDEND YIELD, ecc.), DEVI eseguire una ricerca Google Search SPECIFICA. NON basarti sulla tua memoria di addestramento.
      3. PROCEDURA DI RICERCA E VERIFICA (OBBLIGATORIA):
         - Esegui ricerche multiple e incrociate focalizzandoti su Google Finance.
         - Se l'input è un nome o un ticker senza suffisso, cerca prima il ticker ufficiale e la borsa di quotazione (es. "Saipem ticker Google Finance").
         - **IMPORTANTE PER AZIENDE ITALIANE**: Se l'azienda è quotata a Milano (Borsa Italiana), assicurati di usare il ticker con il suffisso ".MI" (es. "SPM.MI" per Saipem, "ENI.MI" per Eni) per ottenere i dati corretti da Google Finance, anche se l'utente ha inserito solo "Saipem" o "SPM".
         - **IMPORTANTE PER AZIENDE USA**: Se l'azienda è quotata a Wall Street (NYSE, NASDAQ), esegui le ricerche in inglese (es. "NVDA stock price Google Finance") per ottenere i dati più precisi e aggiornati.
         - **FONTE PRIMARIA E OBBLIGATORIA**: Per i dati relativi alla sezione "RISCHI", usa esclusivamente **Google Finance** come fonte definitiva. Se Google Finance non è disponibile per quel ticker specifico, usa Yahoo Finance come unica alternativa.
         - **IDENTIFICAZIONE PREZZO (CRITICO)**: Prendi il "Prezzo in tempo reale" (Real-time price) o l'ultimo prezzo visualizzato in caratteri grandi su Google Finance. Se il mercato è chiuso, usa il prezzo di "Chiusura" o "Post-market". 
         - **DIVIETO ASSOLUTO**: È TASSATIVAMENTE VIETATO usare "Target Price", "Prezzo Obiettivo", "Massimo a 52 settimane", "Minimo a 52 settimane" o valori medi di analisti come prezzo attuale. Se il dato che trovi è descritto come "Target" o "Obiettivo", SCARTALO e cerca il prezzo di scambio attuale.
         - **PRECISIONE E VERIFICA**: Il prezzo attuale DEVE essere quello esatto di scambio. Se Google Finance mostra $96.96 per eBay (EBAY), devi riportare esattamente $96.96. Un valore come $62.45 (che potrebbe essere un vecchio prezzo o un target) è un errore inaccettabile. Verifica il prezzo almeno due volte durante la ricerca per assicurarti che sia quello "Live" o di "Chiusura".
         - **COERENZA VALUTA**: Assicurati che il simbolo della valuta corrisponda alla valuta del prezzo trovato (es. "$" per USD, "€" per EUR).
         - **CAPITALIZZAZIONE DI MERCATO**: Prendi il dato della CAPITALIZZAZIONE DI MERCATO direttamente da Google Finance. Assicurati che sia aggiornato.
         - **P/E RATIO E DIVIDEND YIELD**: Prendi questi dati direttamente da Google Finance. Se non presenti, scrivi "N/A".
         - **DOUBLE CHECK FINALE**: Prima di restituire i dati, fai un'ultima ricerca mentale/strumentale: "Il prezzo che ho inserito è il prezzo di scambio attuale o un target?". Se è un target, correggilo immediatamente.
      4. Verifica sempre che ogni dato di mercato citato sia aggiornato alla data odierna (${currentDate}).
      5. Concentrati sulla lettera del CEO agli azionisti per capire la visione e l'onestà intellettuale.
      6. **REGOLE DI PRESENTAZIONE DATI FINANZIARI**:
         - In qualsiasi parte del report in cui descrivi le performance finanziarie (es. fatturato, margini), NON usare mai l'EBITDA. 
         - Usa sempre il **Reddito operativo/Operating margin** al posto dell'EBITDA.
         - Per ogni dato finanziario principale (Fatturato, Reddito Operativo), indica sempre la variazione percentuale rispetto all'anno precedente.
      7. Fornisci un report dettagliato strutturato in 4 parti (e SOLO queste 4), utilizzando intestazioni markdown (##) per ogni sezione:
         - ## COSA FA L'AZIENDA
         - ## TOP MANAGEMENT
         - ## VANTAGGI COMPETITIVI (MOAT)
         - ## RISCHI (In questa sezione, elenca i **RISCHI** principali dell'investimento nell'azienda utilizzando bullet points, evidenziando in **grassetto** i concetti chiave. È TASSATIVAMENTE VIETATO inserire dati numerici di mercato come prezzo, capitalizzazione, P/E o Dividend Yield in questa sezione o in qualsiasi altra parte del report markdown. Questi dati verranno visualizzati separatamente dal sistema).
      8. **DIVIETO ASSOLUTO DI DATI DI MERCATO NEL TESTO**: Il report markdown DEVE contenere esclusivamente analisi qualitativa. NON includere mai frasi come "Dati di mercato aggiornati al...", "Prezzo: ...", "Capitalizzazione: ...", ecc. Il mancato rispetto di questa regola renderà il report inutilizzabile.
      9. **DIVIETO DI INSIGHT CHIAVE**: È TASSATIVAMENTE VIETATO includere blocchi di riepilogo denominati "Insight chiave" o simili, sia all'inizio che all'interno del report. NON usare blocchi di citazione markdown (">") per riassumere l'analisi. Mantieni invece l'uso del grassetto all'interno dei paragrafi per enfatizzare nomi di prodotti, brand o concetti importanti.
      10. È TASSATIVAMENTE VIETATO includere una valutazione finale, un riepilogo conclusivo, un rating o qualsiasi giudizio di valore (es. "titolo core", "premio rispetto alla media", "margine di sicurezza"). L'analisi deve terminare bruscamente dopo la sezione RISCHI. Non usare mai intestazioni come "Conclusione", "Sintesi" o "Valutazione". Non dare consigli di investimento.
      11. **DIVIETO DI VALUTAZIONE PREZZO**: È assolutamente vietato fornire qualsiasi genere di valutazione qualitativa del prezzo o del titolo (es. "il titolo riflette una valutazione che tiene conto di...", "prezzo equo", "sottovalutato"). Limitati a riportare i dati numerici puri e crudi (SOLO nei campi strutturati, NON nel report).
      12. NON includere alcun titolo o intestazione all'inizio del report (es. "Analisi Approfondita: ..."). Il report deve iniziare direttamente con la prima sezione: COSA FA L'AZIENDA.
      
      LINGUA DEL REPORT:
      Il report DEVE essere scritto in: ${language === 'it' ? 'Italiano' : 'Inglese'}.
      Usa TASSATIVAMENTE queste intestazioni in italiano per consentire il parsing del software: COSA FA L'AZIENDA, TOP MANAGEMENT, VANTAGGI COMPETITIVI (MOAT), RISCHI. Il contenuto di ciascuna sezione deve però essere nella lingua richiesta (${language === 'it' ? 'Italiano' : 'Inglese'}).

      Usa un tono professionale, asciutto e diretto. 
      Limitati a circa 1500-2000 parole totali per l'intero report.
      
      RITORNA I DATI ESATTAMENTE CON LA SEGUENTE STRUTTURA A TAG (NON usare JSON):
      
      [COMPANY_NAME]Nome completo azienda[/COMPANY_NAME]
      [TICKER]TICKER_UFFICIALE[/TICKER]
      [CURRENT_PRICE]123.45[/CURRENT_PRICE]
      [CURRENCY_SYMBOL]€[/CURRENCY_SYMBOL]
      [PRICE_DATE]${currentDate}[/PRICE_DATE]
      [PEER_TICKER]TICKER_CONCORRENTE[/PEER_TICKER]
      [REPORT]
      Il report completo in markdown
      [/REPORT]
      
      Nota sul campo "TICKER": Il valore deve essere ESCLUSIVAMENTE il ticker ufficiale dell'azienda (es. "CPR" per Campari, "AAPL" per Apple).
      Nota sul campo "PEER_TICKER": Identifica il principale concorrente diretto dell'azienda analizzata e inserisci il suo ticker ufficiale (es. se analizzi Coca-Cola (KO), il peerTicker potrebbe essere PEP). Se l'azienda è quotata a Milano, usa il suffisso .MI anche per il peer (es. se analizzi Eni (ENI.MI), il peerTicker potrebbe essere TEN.MI).
    `;

    let response: any;
    let attempt = 0;
    const modelsToTry = [
      "gemini-2.5-flash",
      "gemini-2.5-flash",
      "gemini-1.5-flash"
    ];
    let delay = 5000;

    while (attempt < modelsToTry.length) {
      const currentModel = modelsToTry[attempt];
      try {
        console.log(`[Server] Tentativo ${attempt + 1}/${modelsToTry.length} con modello: ${currentModel}`);
        response = await ai.models.generateContent({
          model: currentModel,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.1,
          },
        });
        console.log(`[Server] Risultato ottenuto con successo usando ${currentModel}!`);
        break;
      } catch (err: any) {
        console.error(`[Server] Errore con ${currentModel}:`, err.message);
        attempt++;
        if (attempt >= modelsToTry.length) {
          throw err;
        }
        console.log(`[Server] Attendo ${delay/1000} secondi e passo al prossimo tentativo...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay += 2000; // Il prossimo ritardo sarà 7s
      }
    }

    if (!response.text) {
      throw new Error("L'analisi non è possibile per questa azienda. Prova con un'altra.");
    }

    let rawText = response.text.trim();
    
    const extractTag = (tag: string) => {
      const regex = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, 'i');
      const match = rawText.match(regex);
      return match ? match[1].trim() : null;
    };

    let result: any = {};
    const reportText = extractTag('REPORT');

    if (reportText === "AZIENDA_NON_ESISTENTE" || !reportText || reportText.length < 50) {
      result.report = reportText || "AZIENDA_NON_ESISTENTE";
    } else {
      let priceVal = extractTag('CURRENT_PRICE') || "0";
      // Pulizia base del prezzo se arriva sporco
      priceVal = priceVal.replace(/[^0-9.,-]/g, '').replace(',', '.');
      
      result = {
        companyName: extractTag('COMPANY_NAME') || "",
        ticker: extractTag('TICKER') || "",
        currentPrice: parseFloat(priceVal) || 0,
        currencySymbol: extractTag('CURRENCY_SYMBOL') || "",
        priceDate: extractTag('PRICE_DATE') || currentDate,
        peerTicker: extractTag('PEER_TICKER') || "",
        report: reportText
      };
    }
    
    // Check for explicit "not found" signal from prompt
    if (result.report === "AZIENDA_NON_ESISTENTE" || !result.report || result.report.trim().length < 50) {
      throw new Error("L'azienda (o il simbolo) non esiste. Prova un'altra analisi.");
    }

    res.json(result);
  } catch (error: any) {
    console.error("[Server] Analysis Error:", error);
    res.status(500).json({ error: error.message || "Errore durante l'analisi" });
  }
});

// History is now managed via simple JSON file
app.post('/api/history', (req, res) => {
  const result = req.body;
  if (!result || !result.ticker) return res.status(400).json({ error: 'Dati mancanti' });

  try {
    const history = getHistory();
    // Avoid duplicates in recent history
    const filteredHistory = history.filter((item: any) => item.ticker !== result.ticker);
    filteredHistory.unshift({
      ...result,
      timestamp: new Date().toISOString()
    });
    saveHistory(filteredHistory.slice(0, 20));
    res.json({ success: true });
  } catch (err) {
    console.error("History Save Error:", err);
    res.status(500).json({ error: "Errore salvataggio cronologia" });
  }
});

app.get('/api/history', (req, res) => {
  res.json({ history: getHistory() });
});

app.delete('/api/history/:ticker', (req, res) => {
  const { ticker } = req.params;
  const history = getHistory();
  const filteredHistory = history.filter((item: any) => item.ticker !== ticker);
  saveHistory(filteredHistory);
  res.json({ success: true });
});

app.delete('/api/history', (req, res) => {
  saveHistory([]);
  res.json({ success: true });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
