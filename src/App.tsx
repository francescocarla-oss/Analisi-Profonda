/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Search, Loader2, Calendar, ArrowDownCircle, Trash2, MoreVertical, X, Info, Star, Mail, Share2, Facebook, Twitter, MessageCircle, Copy, Linkedin } from 'lucide-react';
import { analyzeCompany } from './services/geminiService';
import { translations } from './translations';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import logo from './logo.png';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AnalysisResult {
  companyName: string;
  ticker: string;
  report: string;
  currentPrice: number;
  priceDate: string;
  currencySymbol: string;
  peerTicker?: string;
}

export default function App() {
  const [lang, setLang] = useState<'it' | 'en'>('it');
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.language) {
      setLang(navigator.language.toLowerCase().startsWith('it') ? 'it' : 'en');
    }
  }, []);
  const t = translations[lang];
  const [loading, setLoading] = useState(false);
  const [ticker, setTicker] = useState('');
  const [result, setResult] = useState<AnalysisResult | string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [history, setHistory] = useState<AnalysisResult[]>([]);

  const resultsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch global history on mount
    fetchHistory();

    // Test connectivity on mount
    fetch('/api/health')
      .then(r => r.json())
      .then(d => console.log('[Health Check] Server is up:', d))
      .catch(e => console.error('[Health Check] Server is unreachable:', e));

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (shareRef.current && !shareRef.current.contains(event.target as Node)) {
        setIsShareOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isHistoryOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isHistoryOpen]);

  useEffect(() => {
    if (result && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [result]);

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/history');
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.history) setHistory(data.history);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const deleteHistoryItem = async (e: React.MouseEvent, ticker: string) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/history/${ticker}`, { method: 'DELETE' });
      if (response.ok) {
        fetchHistory();
      }
    } catch (err) {
      console.error('Failed to delete history item:', err);
    }
  };

  const clearHistory = async () => {
    try {
      const response = await fetch('/api/history', { method: 'DELETE' });
      if (response.ok) {
        setHistory([]);
      }
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  const shareTitle = t.shareMenuTitle;
  const shareText = t.shareMenuText;
  const shareUrl = typeof window !== 'undefined' ? window.location.origin : 'https://www.finanzaworld.it';
  const fullShareText = `${shareText}\n\n${t.shareCallToAction}${shareUrl}`;

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(fullShareText);
      alert(t.copiedAlert);
      setIsShareOpen(false);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  const handleAnalyze = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!ticker) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await analyzeCompany(ticker, lang);
      setResult(data);
      fetchHistory();
      
      // Inserisce automaticamente il peerTicker nella barra di ricerca per la prossima analisi
      if (data && data.peerTicker) {
        setTicker(data.peerTicker);
      }
    } catch (error: any) {
      console.error(error);
      const errorMessage = error.message || "Non ci è possibile fare l'analisi richiesta adesso. Riprova fra qualche minuto. Grazie.";
      setResult(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const parseSections = (report: string) => {
    const sections: { title: string; content: string }[] = [];
    const sectionNames = [
      "COSA FA L'AZIENDA",
      "TOP MANAGEMENT",
      "VANTAGGI COMPETITIVI (MOAT)",
      "RISCHI"
    ];
    
    const translateSectionTitle = (title: string) => {
      if (title === "COSA FA L'AZIENDA") return t.sectionWhat;
      if (title === "TOP MANAGEMENT") return t.sectionMgmt;
      if (title === "VANTAGGI COMPETITIVI (MOAT)") return t.sectionMoat;
      if (title === "RISCHI") return t.sectionRisks;
      return title;
    };

    const lines = report.split('\n');
    let currentSectionTitle = "";
    let currentContent: string[] = [];

    lines.forEach(line => {
      const cleanLine = line.replace(/^[#* ]+/, '').trim().toUpperCase();
      const matchedSection = sectionNames.find(name => cleanLine === name);

      if (matchedSection) {
        if (currentSectionTitle) {
          sections.push({ title: translateSectionTitle(currentSectionTitle), content: currentContent.join('\n').trim() });
        }
        currentSectionTitle = matchedSection;
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    });

    if (currentSectionTitle) {
      sections.push({ title: translateSectionTitle(currentSectionTitle), content: currentContent.join('\n').trim() });
    }

    // Fallback if no sections were identified
    if (sections.length === 0) {
      return [{ title: "ANALISI COMPLETA", content: report }];
    }

    return sections;
  };

  const isAnalysisResult = (res: any): res is AnalysisResult => {
    return res && typeof res === 'object' && 'report' in res;
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0] relative overflow-x-hidden"
    >
      {/* History Drawer */}
      <AnimatePresence>
        {isHistoryOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryOpen(false)}
              className="fixed inset-0 bg-[#141414]/60 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#E4E3E0] border-l-4 border-[#C5A059] z-[101] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 bg-[#141414] text-[#E4E3E0] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Calendar className="text-[#C5A059]" size={20} />
                  <h3 className="font-mono text-xs uppercase tracking-[0.3em] font-bold">{t.history}</h3>
                </div>
                <button 
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                    <Search size={48} strokeWidth={1} />
                    <p className="font-serif italic">{t.noHistory}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-[#141414]/10">
                      <span className="text-[10px] font-mono uppercase tracking-widest opacity-40">{history.length} {t.savedAnalyses}</span>
                      <button 
                        onClick={clearHistory}
                        className="text-[10px] font-mono uppercase tracking-widest text-red-600 hover:underline flex items-center gap-1"
                      >
                        <Trash2 size={12} />
                        {t.clear}
                      </button>
                    </div>
                    {history.map((item, idx) => (
                      <div 
                        key={idx}
                        onClick={() => {
                          setResult(item);
                          setIsHistoryOpen(false);
                          if (resultsRef.current) {
                            resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className="w-full bg-white border-2 border-[#141414] p-4 text-left hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] transition-all group relative cursor-pointer"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-mono text-[10px] uppercase tracking-widest text-[#C5A059] font-bold">{item.ticker}</span>
                          <span className="font-mono text-[8px] opacity-30">{item.priceDate}</span>
                        </div>
                        <h4 className="font-serif italic font-bold text-sm group-hover:text-[#C5A059] transition-colors truncate pr-8">{item.companyName}</h4>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[10px] font-mono opacity-40">{item.currencySymbol}{(Number(item.currentPrice) || 0).toFixed(2)}</span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteHistoryItem(e, item.ticker);
                            }}
                            className="p-1 text-[#141414]/20 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 bg-white border-t border-[#141414]/10">
                <p className="text-[10px] font-serif italic text-[#141414]/60 leading-relaxed">
                  {t.historyDisclaimer}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Subtle Texture Overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-50 bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')]" />

      {/* Header */}
      <motion.header 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
        className="sticky top-0 z-40 bg-[#141414] border-b-2 border-[#C5A059] px-2 md:px-6 py-2 md:py-6 flex justify-between items-center shadow-xl"
      >
        <div className="flex items-center gap-1.5 md:gap-6 min-w-0">
          <a 
            href="https://www.finanzaworld.it" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block transition-all hover:scale-110 flex-shrink-0"
          >
            <img 
              src={logo} 
              alt="Frullatore Finanziario Logo" 
              className="h-[40px] md:h-[80px] drop-shadow-[0_0_10px_rgba(197,160,89,0.5)] logo-shine transition-all"
              referrerPolicy="no-referrer"
            />
          </a>
          <div className="flex flex-col justify-center min-w-0">
            <div className="flex flex-col leading-none min-w-0">
              <span className="text-[#C5A059] font-sans font-black uppercase tracking-tighter text-sm md:text-2xl drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)] truncate">{t.title}</span>
              <span className="text-[#C5A059]/80 font-sans font-bold tracking-tighter text-[7px] md:text-xs mt-0.5 md:mt-1 truncate">Developed by <span className="uppercase">Francesco & Lodovico Carlà</span></span>
            </div>
            <div className="mt-0.5 md:mt-2 h-3 md:h-7 flex items-center opacity-50">
              <a 
                href="https://www.finanzaworld.it" 
                target="_blank" 
                rel="noopener noreferrer"
                className="h-full block transition-all hover:scale-[1.05]"
              >
                <img 
                  src="https://www.francescocarla.it/assets/img/logo_fw.png" 
                  alt="FinanzaWorld Logo" 
                  className="h-full object-contain brightness-0 invert"
                  referrerPolicy="no-referrer"
                />
              </a>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-6 flex-shrink-0">
          <button 
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center gap-1 px-2 md:px-4 py-1 md:py-2 border-2 border-[#C5A059] text-[#C5A059] hover:bg-[#C5A059] hover:text-[#141414] transition-all font-mono text-[8px] md:text-[10px] uppercase tracking-widest font-bold shadow-[2px_2px_0px_0px_rgba(197,160,89,0.2)] md:shadow-[4px_4px_0px_0px_rgba(197,160,89,0.2)]"
          >
            <Calendar size={12} className="md:w-4 md:h-4" />
            <span className="hidden sm:inline">{t.history}</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 text-[#C5A059] hover:bg-[#C5A059]/10 rounded-full transition-colors"
              aria-label="Menu"
            >
              <MoreVertical size={24} />
            </button>

            {isMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="absolute right-0 mt-2 w-72 md:w-80 bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] z-50 overflow-hidden"
              >
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[#C5A059]">
                      <Info size={16} />
                      <span className="font-mono text-[10px] uppercase tracking-widest font-bold">{t.aboutUs}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-[#141414]/80 font-serif italic">
                      {t.aboutDesc}
                    </p>
                  </div>
                  
                  <div className="h-px bg-[#141414]/10" />
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[#C5A059]">
                      <Mail size={16} />
                      <span className="font-mono text-[10px] uppercase tracking-widest font-bold">{t.contact}</span>
                    </div>
                    <a 
                      href="mailto:premium@finanzaworld.it" 
                      className="block text-xs font-mono font-bold text-[#141414] hover:text-[#C5A059] transition-colors underline underline-offset-4 decoration-[#C5A059]/30"
                    >
                      premium@finanzaworld.it
                    </a>
                  </div>
                </div>
                <div className="bg-[#141414] p-2 text-center">
                  <button 
                    onClick={() => setIsMenuOpen(false)}
                    className="text-[9px] font-mono uppercase tracking-[0.3em] text-[#E4E3E0] hover:text-[#C5A059] transition-colors"
                  >
                    {t.close}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </motion.header>

      <main className="max-w-4xl mx-auto px-4 py-2 md:py-4">
        <div className="flex flex-col items-center">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="w-full space-y-6"
          >
            <div className="flex flex-col items-center text-center">
              <motion.div 
                whileHover={{ scale: 1.01 }}
                className="w-full p-6 md:p-10 pb-4 md:pb-6 bg-white border-2 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] group overflow-hidden text-left relative gold-glow-hover transition-shadow"
              >
                {/* Decorative Quote Mark */}
                <div className="absolute -top-6 -left-4 text-9xl font-serif text-[#C5A059]/10 select-none pointer-events-none group-hover:scale-110 transition-transform duration-700">“</div>
                
                <div className="relative z-10 space-y-8">
                  <div className="space-y-6">
                    <p className="text-lg md:text-xl leading-relaxed font-serif italic text-[#141414]/90">
                      {t.heroText1}<span className="text-[#C5A059] font-serif font-bold not-italic drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)]">{t.title}</span>{t.heroText2}
                    </p>

                    <form onSubmit={handleAnalyze} className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1 group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20 group-focus-within:opacity-100 transition-opacity" size={18} />
                        <input 
                          type="text" 
                          placeholder={t.inputPlaceholder}
                          value={ticker}
                          onChange={(e) => setTicker(e.target.value.toUpperCase())}
                          className="w-full bg-white border-2 border-[#141414] pl-12 pr-4 py-4 text-sm uppercase tracking-[0.2em] font-mono focus:outline-none focus:bg-[#141414] focus:text-[#E4E3E0] focus:placeholder:text-[#E4E3E0]/50 transition-all duration-300 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          type="submit"
                          disabled={loading || !ticker}
                          className="bg-[#141414] text-[#E4E3E0] px-10 py-4 text-sm uppercase tracking-[0.2em] font-mono hover:bg-[#141414]/90 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-[4px_4px_0px_0px_rgba(197,160,89,0.5)] cursor-pointer flex-1"
                        >
                          {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                          {t.analyzeBtn}
                        </button>
                      </div>
                    </form>

                    <p className="text-lg md:text-xl leading-relaxed font-serif italic text-[#141414]/90">
                      {t.heroFooter1}<span className="text-[#C5A059] font-bold not-italic drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)]">Francesco Carlà</span>{t.heroFooter2}<a href="https://www.finanzaworld.it" target="_blank" rel="noopener noreferrer" className="text-[#C5A059] font-bold not-italic hover:underline decoration-[#C5A059]/40">FinanzaWorld</a>{t.heroFooter3}<a href="mailto:premium@finanzaworld.it" className="text-[#C5A059] font-bold not-italic hover:underline decoration-[#C5A059]/40">premium@finanzaworld.it</a>
                    </p>
                  </div>
                </div>
                
                {/* Bottom Accent */}
                <div className="absolute bottom-0 right-0 w-24 h-24 bg-gradient-to-br from-transparent to-[#C5A059]/5" />
              </motion.div>
            </div>
          </motion.div>
        </div>

      {/* Results Area */}
      <div className="scroll-mt-24" ref={resultsRef}>
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div 
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="-mt-12 md:-mt-24 pt-0 pb-12 flex flex-col items-center justify-center space-y-6"
            >
              <div className="relative">
                <motion.div 
                  animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.6, 0.3]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 bg-[#C5A059]/30 rounded-full blur-3xl" 
                />
                <div className="relative z-10 flex items-center justify-center">
                  <Loader2 className="animate-spin text-[#C5A059]" size={64} strokeWidth={1} />
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 border-2 border-dashed border-[#C5A059]/20 rounded-full scale-150"
                  />
                </div>
              </div>
              <motion.div 
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="space-y-3 text-center bg-white/80 backdrop-blur-md p-8 border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(197,160,89,0.5)] gold-shimmer"
              >
                <p className="font-mono text-xs md:text-sm uppercase tracking-[0.6em] font-bold text-[#C5A059]">{t.analyzingTitle}</p>
                <p className="font-serif italic text-sm md:text-base text-[#141414] max-w-2xl">{t.analyzingDesc}</p>
              </motion.div>
            </motion.div>
          )}

          {result && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="mt-8 md:mt-12 space-y-6"
              transition={{ 
                type: 'spring',
                damping: 30,
                stiffness: 100
              }}
            >
              {/* Single View (Original) */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.8 }}
                className="bg-white border-2 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] overflow-hidden relative gold-glow"
              >
                {/* Report Header Decoration */}
                <div className="h-1.5 bg-[#C5A059] w-full" />
                
                <div className="p-4 md:p-6 relative">
                  {/* Decorative Background Element */}
                  <div className="absolute top-10 right-10 text-[120px] md:text-[240px] font-serif italic text-[#141414]/[0.015] select-none pointer-events-none leading-none">F</div>
  
                  <div className="relative z-10">
                    {isAnalysisResult(result) && (
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 pb-2 border-b border-[#141414]/10 gap-4">
                        <div className="space-y-1 border-l-4 border-[#C5A059] pl-4">
                          <h2 className="text-xl md:text-2xl font-serif italic font-bold tracking-tight m-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.1)]">
                            <span className="text-[#141414]">{t.title}</span> <span className="text-[#C5A059] font-serif font-bold not-italic">{result.companyName} ({result.ticker})</span>
                          </h2>
                          <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-40">{t.reportGenerated} {result.priceDate}</p>
                        </div>
                        
                        <div className="bg-[#141414] text-[#E4E3E0] p-2 shadow-[4px_4px_0px_0px_rgba(197,160,89,1)] w-full md:w-auto min-w-[150px]">
                          <p className="font-mono text-[9px] uppercase tracking-[0.2em] opacity-60 mb-1">{t.stockPrice}</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-xl font-mono text-[#C5A059]">{result.currencySymbol}</span>
                            <span className="text-2xl md:text-3xl font-serif italic font-bold">{(Number(result.currentPrice) || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
  
                    <div className="space-y-8 overflow-hidden">
                      {isAnalysisResult(result) ? (
                        <div className="space-y-6">
                          {parseSections(result.report).map((section, sIdx) => (
                            <motion.div 
                              key={sIdx}
                              initial={{ opacity: 0, y: 20 }}
                              whileInView={{ opacity: 1, y: 0 }}
                              viewport={{ once: true }}
                              transition={{ delay: sIdx * 0.1 }}
                              className="relative"
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <div className="h-0.5 flex-1 bg-[#C5A059]/20" />
                                <h3 className="text-[#C5A059] font-serif italic font-bold text-base md:text-lg tracking-widest leading-tight shrink-0 px-4">
                                  {section.title}
                                </h3>
                                <div className="h-0.5 flex-1 bg-[#C5A059]/20" />
                              </div>
                              
                              <div className="bg-white/50 p-5 md:p-7 border border-[#141414]/5 shadow-sm">
                                <ReactMarkdown
                                  remarkPlugins={[remarkBreaks]}
                                  components={{
                                    h1: ({ children }) => (
                                      <h4 className="text-[#141414] font-serif font-bold text-lg md:text-xl mt-6 mb-3 border-b border-[#141414]/10 pb-2">
                                        {children}
                                      </h4>
                                    ),
                                    h2: ({ children }) => (
                                      <h5 className="text-[#141414] font-serif font-bold text-base md:text-lg mt-5 mb-2">
                                        {children}
                                      </h5>
                                    ),
                                    p: ({ children }) => (
                                      <p className="text-[#141414]/80 font-serif leading-relaxed mb-4 text-base md:text-lg">
                                        {children}
                                      </p>
                                    ),
                                    ul: ({ children }) => <ul className="mb-4 space-y-2">{children}</ul>,
                                    li: ({ children }) => (
                                      <li className="flex items-start gap-3 text-[#141414]/80 font-serif leading-relaxed text-base md:text-lg">
                                        <span className="mt-2.5 w-1.5 h-1.5 bg-[#C5A059] shrink-0" />
                                        <span>{children}</span>
                                      </li>
                                    ),
                                    strong: ({ children }) => (
                                      <strong className="relative inline-block font-bold text-[#141414] px-1">
                                        <span className="relative z-10">{children}</span>
                                        <span className="absolute bottom-0 left-0 w-full h-[30%] bg-[#C5A059]/10 z-0" />
                                      </strong>
                                    ),
                                    blockquote: ({ children }) => (
                                      <blockquote className="my-6 p-5 bg-[#C5A059]/5 border-l-4 border-[#C5A059] italic font-serif text-lg text-[#141414]/90">
                                        {children}
                                      </blockquote>
                                    ),
                                    hr: () => <hr className="border-t border-[#141414]/5 my-6" />,
                                    a: ({ href, children }) => <a href={href} className="text-[#C5A059] hover:underline font-bold" target="_blank" rel="noopener noreferrer">{children}</a>,
                                  }}
                                >
                                  {section.content}
                                </ReactMarkdown>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-12 px-4 text-center space-y-8">
                          <div className="flex justify-center">
                            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-full">
                              <Info className="text-red-500" size={48} strokeWidth={1.5} />
                            </div>
                          </div>
                          <div className="space-y-4">
                            <h3 className="text-xl md:text-2xl font-serif italic font-bold text-[#141414]">{t.errorTitle}</h3>
                            <p className="text-base md:text-lg font-serif italic text-[#141414]/70 leading-relaxed max-w-xl mx-auto">
                              {result}
                            </p>
                          </div>
                          <div className="pt-4">
                            <button 
                              onClick={handleAnalyze}
                              className="bg-[#141414] text-[#E4E3E0] px-8 py-3 text-xs uppercase tracking-[0.2em] font-mono hover:bg-[#141414]/90 active:scale-95 transition-all shadow-[4px_4px_0px_0px_rgba(197,160,89,1)]"
                            >
                              {t.retryBtn}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
  
                    {/* CTA Box */}
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      className="mt-8 p-8 border-4 border-[#C5A059] bg-[#C5A059]/5 relative group gold-shimmer"
                    >
                      {/* Decorative elements clipping container */}
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        {/* Decorative Star Icon */}
                        <div className="absolute -top-4 -right-4 text-8xl text-[#C5A059]/10 rotate-12 group-hover:rotate-45 transition-transform duration-1000">
                          <Star size={120} fill="currentColor" />
                        </div>
                      </div>

                      <div className="absolute -top-4 left-8 bg-[#C5A059] text-white px-6 py-1.5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] text-[10px] font-mono uppercase tracking-[0.4em] font-bold z-20">
                        {t.premiumBadge}
                      </div>
                      
                      <div className="relative z-10 space-y-6">
                        <div className="flex items-start gap-4">
                          <div className="bg-[#C5A059] p-2 rounded-full text-white shadow-lg shrink-0 mt-1">
                            <Star size={20} fill="currentColor" />
                          </div>
                          <p className="text-xl md:text-2xl font-serif italic text-[#141414] leading-relaxed font-bold">
                            Vuoi sapere se la <span className="text-[#C5A059] not-italic">"tua"</span> azienda è inserita in uno dei nostri abbonamenti e portafogli Premium? 
                            Vuoi sapere se la <span className="text-[#C5A059] not-italic">"tua"</span> azienda è sopravvalutata o sottovalutata?
                          </p>
                        </div>

                        <div className="flex flex-col md:flex-row items-center gap-6 pt-4 border-t border-[#C5A059]/20">
                          <div className="flex flex-col">
                            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#C5A059] font-bold mb-1">{t.directContact}</span>
                            <span className="font-mono text-xs uppercase tracking-widest opacity-50">{t.writeTo}</span>
                          </div>
                          <a 
                            href="mailto:premium@finanzaworld.it" 
                            className="text-xl md:text-3xl font-mono font-bold text-[#141414] hover:text-[#C5A059] transition-all duration-300 underline underline-offset-8 decoration-[#C5A059]/40 hover:decoration-[#C5A059] hover:scale-105"
                          >
                            premium@finanzaworld.it
                          </a>
                        </div>
                      </div>
                    </motion.div>

                    <div className="mt-6 flex flex-wrap justify-center gap-4">
                      <motion.button 
                        whileHover={{ scale: 1.05, backgroundColor: "#141414", color: "#E4E3E0" }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setResult(null)}
                        className="px-8 py-3 border-2 border-[#141414] font-mono text-[10px] uppercase tracking-[0.3em] font-bold transition-colors"
                      >
                        {t.newAnalysisBtn}
                      </motion.button>

                      <div className="relative" ref={shareRef}>
                        <motion.button 
                          whileHover={{ scale: 1.05, backgroundColor: "#C5A059", color: "#141414" }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setIsShareOpen(!isShareOpen)}
                          className="px-8 py-3 border-2 border-[#C5A059] text-[#C5A059] font-mono text-[10px] uppercase tracking-[0.3em] font-bold transition-colors flex items-center gap-2"
                        >
                          <Share2 size={14} />
                          {t.shareAppBtn}
                        </motion.button>

                        <AnimatePresence>
                          {isShareOpen && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] z-50 overflow-hidden flex flex-col"
                            >
                              <a 
                                href={`https://wa.me/?text=${encodeURIComponent(fullShareText)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 hover:bg-[#C5A059]/10 transition-colors border-b border-[#141414]/10 text-sm font-mono font-bold text-[#141414]"
                              >
                                <MessageCircle size={16} className="text-[#25D366]" /> WhatsApp
                              </a>
                              <a 
                                href={`https://mail.google.com/mail/?view=cm&fs=1&to=&su=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(fullShareText)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 hover:bg-[#C5A059]/10 transition-colors border-b border-[#141414]/10 text-sm font-mono font-bold text-[#141414]"
                              >
                                <Mail size={16} className="text-[#EA4335]" /> Gmail
                              </a>
                              <button 
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(fullShareText);
                                    alert(lang === 'it' ? "Testo copiato! Incollalo nel tuo post su Facebook." : "Text copied! Paste it in your Facebook post.");
                                  } catch (err) {}
                                  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer');
                                }}
                                className="flex items-center gap-3 p-3 hover:bg-[#C5A059]/10 transition-colors border-b border-[#141414]/10 text-sm font-mono font-bold text-[#141414] text-left w-full"
                              >
                                <Facebook size={16} className="text-[#1877F2]" /> Facebook
                              </button>
                              <a 
                                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 hover:bg-[#C5A059]/10 transition-colors border-b border-[#141414]/10 text-sm font-mono font-bold text-[#141414]"
                              >
                                <Twitter size={16} className="text-[#1DA1F2]" /> Twitter (X)
                              </a>
                              <a 
                                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 hover:bg-[#C5A059]/10 transition-colors border-b border-[#141414]/10 text-sm font-mono font-bold text-[#141414]"
                              >
                                <Linkedin size={16} className="text-[#0A66C2]" /> LinkedIn
                              </a>
                              <button 
                                onClick={handleCopyText}
                                className="flex items-center gap-3 p-3 hover:bg-[#C5A059]/10 transition-colors text-sm font-mono font-bold text-[#141414] text-left w-full"
                              >
                                <Copy size={16} className="text-[#141414]" /> {t.copyText}
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Report Footer Decoration */}
                <div className="bg-[#141414] p-8 flex flex-col md:flex-row justify-between items-center gap-8">
                  <motion.div 
                    whileHover={{ scale: 1.02 }}
                    className="flex items-center gap-6"
                  >
                    <div className="relative">
                      <motion.div 
                        animate={{ opacity: [0.1, 0.3, 0.1] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute inset-0 bg-[#C5A059] blur-xl rounded-full" 
                      />
                      <img src={logo} alt="Frullatore Logo" className="h-12 relative z-10 drop-shadow-[0_0_8px_rgba(197,160,89,0.5)]" />
                    </div>
                    <div className="text-left">
                      <p className="font-serif italic text-xl font-bold text-[#E4E3E0]">Francesco & Lodovico Carlà</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#E4E3E0]/30">{t.footerIndependent}</p>
                    </div>
                  </motion.div>
                  
                  <div className="flex items-center gap-8">
                    <div className="flex gap-3">
                      <div className="w-2.5 h-2.5 bg-[#C5A059] rounded-full" />
                      <div className="w-2.5 h-2.5 bg-[#C5A059]/50 rounded-full" />
                      <div className="w-2.5 h-2.5 bg-[#C5A059]/20 rounded-full" />
                    </div>
                    <span className="text-[10px] font-mono text-[#E4E3E0]/30 uppercase tracking-[0.5em]">Analisi Profonda Carlà</span>
                  </div>
                </div>
              </motion.div>
          </motion.div>
        )}

        {/* History Section */}
        {history.length > 0 && !loading && !result && (
          <motion.div 
            key="history"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-12 space-y-6"
          >
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-[#141414]/10" />
              <div className="flex items-center gap-4">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.4em] font-bold opacity-40">Analisi Recenti</h3>
                <button 
                  onClick={clearHistory}
                  className="p-2 text-[#141414]/20 hover:text-red-600 transition-colors"
                  title="Cancella tutta la cronologia"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="h-px flex-1 bg-[#141414]/10" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {history.map((item, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ y: -5, scale: 1.02 }}
                  onClick={() => setResult(item)}
                  className="bg-white border-2 border-[#141414] p-6 text-left hover:shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] transition-all group cursor-pointer gold-glow-hover"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-[#C5A059] font-bold">{item.ticker}</span>
                      <span className="font-mono text-[8px] opacity-30">{item.priceDate}</span>
                    </div>
                    <button 
                      onClick={(e) => deleteHistoryItem(e, item.ticker)}
                      className="p-2 text-[#141414]/20 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <h4 className="font-serif italic font-bold text-lg group-hover:text-[#C5A059] transition-colors">{item.companyName}</h4>
                  <div className="mt-4 flex items-center gap-2">
                    <span className="text-xs font-mono opacity-40">{item.currencySymbol}{(Number(item.currentPrice) || 0).toFixed(2)}</span>
                    <ArrowDownCircle size={12} className="opacity-20" />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
      </main>

      {/* Footer */}
      <footer className="mt-4 border-t-4 border-[#C5A059] bg-[#141414] p-4 md:p-6 text-center text-[#E4E3E0]">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-center">
             <a 
               href="https://www.finanzaworld.it" 
               target="_blank" 
               rel="noopener noreferrer"
               className="transition-all hover:scale-110"
             >
               <img 
                 src="https://www.francescocarla.it/assets/img/logo_fw.png" 
                 alt="FW" 
                 className="h-8 brightness-0 invert opacity-60 hover:opacity-100 transition-opacity" 
               />
             </a>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold text-[#C5A059]">
              © Francesco Carlà - P.IVA: 04401280757 - Roc n.21473
            </p>
            <div className="flex justify-center flex-wrap gap-x-8 gap-y-2 font-mono text-[9px] uppercase tracking-widest font-bold">
              <a href="https://www.finanzaworld.it/statico/page/7/disclaimer" target="_blank" rel="noopener noreferrer" className="text-[#E4E3E0]/40 hover:text-[#C5A059] transition-colors underline underline-offset-4 decoration-[#C5A059]/20">Avvertenze</a>
              <a href="https://www.finanzaworld.it/statico/page/9/privacy" target="_blank" rel="noopener noreferrer" className="text-[#E4E3E0]/40 hover:text-[#C5A059] transition-colors underline underline-offset-4 decoration-[#C5A059]/20">Privacy</a>
            </div>
            <p className="text-[10px] font-serif italic text-[#C5A059]/60">
              FinanzaWorld: Investitori Intelligenti dal 1999.
            </p>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}
