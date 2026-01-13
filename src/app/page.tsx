'use client';

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import FileUpload from "@/components/FileUpload";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaBook } from "react-icons/fa";
import { RiDeleteBinLine, RiPencilLine } from "react-icons/ri";
import { IoSettingsOutline, IoArrowBack, IoBookOutline, IoLanguageOutline, IoCloudOfflineOutline, IoCheckmarkCircleOutline, IoPencilOutline, IoBarChartOutline } from "react-icons/io5";
import { FaGithub } from "react-icons/fa";
import ePub from "epubjs";
import { initializeDefaultBook } from "@/lib/initDefaultBook";
import { initializeBookmarkGroups } from "@/lib/db";
import { SUPPORTED_LANGUAGES, getLanguageName, getLanguageCode, getLongestLanguageName, LANGUAGE_MAP } from "@/lib/languages";

// Keyword highlighting component with hover tooltip
function KeywordHighlight({ word, definition }: { word: string; definition: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const wordRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (wordRef.current) {
      const rect = wordRef.current.getBoundingClientRect();
      // Position relative to viewport, then add scroll offset
      setTooltipPosition({
        top: rect.bottom + 8, // 8px below the word
        left: rect.left + (rect.width / 2), // Center of the word
      });
    }
    setIsHovered(true);
  };

  const tooltip = isHovered && mounted ? createPortal(
    <div
      className="fixed z-50 max-w-xs px-3 py-2 text-xs font-light leading-relaxed rounded-lg shadow-lg pointer-events-none"
      style={{
        top: `${tooltipPosition.top}px`,
        left: `${tooltipPosition.left}px`,
        transform: 'translateX(-50%)',
        backgroundColor: 'var(--zen-card-solid-bg, #ffffff)',
        border: '1px solid var(--zen-border, rgba(0,0,0,0.1))',
        color: 'var(--zen-text, #1c1917)',
        opacity: isHovered ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
      }}
    >
      {definition}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <span
        ref={wordRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsHovered(false)}
        className="relative cursor-help underline decoration-dotted underline-offset-2 decoration-1 transition-all hover:decoration-2 font-medium"
        style={{ 
          textDecorationColor: 'var(--zen-text-muted, #78716c)',
          color: 'var(--zen-text, #1c1917)',
        }}
      >
        {word}
      </span>
      {tooltip}
    </>
  );
}

// Extract cover image from EPUB (best effort)
async function extractCoverImage(arrayBuffer: ArrayBuffer): Promise<string | undefined> {
  try {
    // @ts-ignore
    const book = ePub(arrayBuffer);
    await book.ready;
    
    // @ts-ignore
    const coverUrl = await book.coverUrl();
    if (coverUrl) {
      try {
        const response = await fetch(coverUrl);
        const blob = await response.blob();
        const result = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        book.destroy();
        return result;
      } catch {
        // Cover fetch failed
      }
    }
    book.destroy();
  } catch (e) {
    console.warn('Cover extraction skipped:', e);
  }
  return undefined;
}

export default function Home() {
  const router = useRouter();
  const books = useLiveQuery(() => db.books.toArray());
  const allProgress = useLiveQuery(() => db.progress.toArray());
  
  // Create progress map
  const progressMap = React.useMemo(() => {
    if (!allProgress || !books) return {};
    const map: Record<string, number> = {};
    allProgress.forEach(p => {
      map[p.bookId] = p.scrollPosition;
    });
    return map;
  }, [allProgress, books]);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [updatingCovers, setUpdatingCovers] = useState(false);
  const [currentLanguageIndex, setCurrentLanguageIndex] = useState(0);
  const [titleTypingText, setTitleTypingText] = useState("JP");
  const [masterTypingText, setMasterTypingText] = useState("日本語");
  const [editingLanguageId, setEditingLanguageId] = useState<string | null>(null);
  const [editLanguage, setEditLanguage] = useState("");
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [showHowToUse, setShowHowToUse] = useState(false);

  // Track initial animation so first load shows full JP/日本語 without typing
  const hasInitialTitleAnimationRunRef = useRef(false);
  const hasInitialMasterAnimationRunRef = useRef(false);

  // Find longest language name for fixed width
  const longestLanguageName = getLongestLanguageName();
  const longestLanguageCode = "CN"; // All codes are 2 chars, but CN is widest visually

  // Language cycling animation with typing effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLanguageIndex((prev) => (prev + 1) % SUPPORTED_LANGUAGES.length);
    }, 8000); // Change every 8 seconds (slower, more time to see)
    return () => clearInterval(interval);
  }, []);

  // Typing animation for title (EnsoRead [CODE]) with backspace effect
  useEffect(() => {
    // On initial load, don't animate; just ensure the correct code is shown
    if (!hasInitialTitleAnimationRunRef.current) {
      hasInitialTitleAnimationRunRef.current = true;
      const initialLang = SUPPORTED_LANGUAGES[currentLanguageIndex];
      setTitleTypingText(getLanguageCode(initialLang.code));
      return;
    }

    const prevIndex = currentLanguageIndex === 0 ? SUPPORTED_LANGUAGES.length - 1 : currentLanguageIndex - 1;
    const prevLang = SUPPORTED_LANGUAGES[prevIndex];
    const currentLang = SUPPORTED_LANGUAGES[currentLanguageIndex];
    const previousText = getLanguageCode(prevLang.code);
    const targetText = getLanguageCode(currentLang.code);
    
    // First, delete previous text (backspace effect)
    let deleteIndex = previousText.length;
    const deleteInterval = setInterval(() => {
      if (deleteIndex > 0) {
        setTitleTypingText(previousText.substring(0, deleteIndex - 1));
        deleteIndex--;
      } else {
        clearInterval(deleteInterval);
        
        // Small pause before typing
        setTimeout(() => {
          // Then type new text
          let currentIndex = 0;
          const typingInterval = setInterval(() => {
            if (currentIndex < targetText.length) {
              setTitleTypingText(targetText.substring(0, currentIndex + 1));
              currentIndex++;
            } else {
              clearInterval(typingInterval);
            }
          }, 300); // 300ms per character (slower typing)
        }, 200); // 200ms pause
      }
    }, 100); // 100ms per character deletion
    
    return () => {
      clearInterval(deleteInterval);
    };
  }, [currentLanguageIndex]);

  // Typing animation for "Master [language]" - only the language name types with backspace
  useEffect(() => {
    // On initial load, don't animate; just ensure the correct language name is shown
    if (!hasInitialMasterAnimationRunRef.current) {
      hasInitialMasterAnimationRunRef.current = true;
      const initialLang = SUPPORTED_LANGUAGES[currentLanguageIndex];
      setMasterTypingText(initialLang.nativeName);
      return;
    }

    const prevIndex = currentLanguageIndex === 0 ? SUPPORTED_LANGUAGES.length - 1 : currentLanguageIndex - 1;
    const prevLang = SUPPORTED_LANGUAGES[prevIndex];
    const currentLang = SUPPORTED_LANGUAGES[currentLanguageIndex];
    const previousText = prevLang.nativeName;
    const targetLanguageName = currentLang.nativeName;
    
    // First, delete previous text (backspace effect)
    let deleteIndex = previousText.length;
    const deleteInterval = setInterval(() => {
      if (deleteIndex > 0) {
        setMasterTypingText(previousText.substring(0, deleteIndex - 1));
        deleteIndex--;
      } else {
        clearInterval(deleteInterval);
        
        // Small pause before typing
        setTimeout(() => {
          // Then type new text
          let currentIndex = 0;
          const typingInterval = setInterval(() => {
            if (currentIndex < targetLanguageName.length) {
              setMasterTypingText(targetLanguageName.substring(0, currentIndex + 1));
              currentIndex++;
            } else {
              clearInterval(typingInterval);
            }
          }, 150); // 150ms per character (slower typing)
        }, 200); // 200ms pause
      }
    }, 80); // 80ms per character deletion
    
    return () => {
      clearInterval(deleteInterval);
    };
  }, [currentLanguageIndex]);

  // Initialize default book and bookmark groups on first load
  useEffect(() => {
    initializeDefaultBook();
    initializeBookmarkGroups();
  }, []);

  // Update missing covers for existing books
  useEffect(() => {
    if (!books || books.length === 0 || updatingCovers) return;
    
    const booksWithoutCovers = books.filter(book => !book.coverImage);
    if (booksWithoutCovers.length === 0) return;
    
    const updateCovers = async () => {
      setUpdatingCovers(true);
      for (const book of booksWithoutCovers) {
        try {
          const coverImage = await extractCoverImage(book.data);
          if (coverImage) {
            await db.books.update(book.id, { coverImage });
          }
        } catch (e) {
          console.warn(`Failed to extract cover for ${book.title}:`, e);
        }
      }
      setUpdatingCovers(false);
    };
    
    updateCovers();
  }, [books]);

  const handleDeleteBook = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletingBookId(id); // Show confirmation modal
  };

  const confirmDeleteBook = async () => {
    if (!deletingBookId) return;
    
    try {
      // Delete book and its progress
      await db.books.delete(deletingBookId);
      await db.progress.delete(deletingBookId);
      
      // Also delete all related data (translations, notes, chats, bookmarks)
      await Promise.all([
        db.translations.where('bookId').equals(deletingBookId).delete(),
        db.notes.where('bookId').equals(deletingBookId).delete(),
        db.chats.where('bookId').equals(deletingBookId).delete(),
        db.bookmarks.where('bookId').equals(deletingBookId).delete(),
      ]);
    } catch (e) {
      console.error('Failed to delete book:', e);
    } finally {
      setDeletingBookId(null); // Close confirmation modal
    }
  };

  const startEditing = (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const saveTitle = async (e: React.FormEvent | React.FocusEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (editTitle.trim()) {
      await db.books.update(id, { title: editTitle.trim() });
    }
    setEditingId(null);
  };

  const startEditingLanguage = (e: React.MouseEvent, id: string, currentLanguage: string | undefined) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingLanguageId(id);
    setEditLanguage(currentLanguage || 'ja');
  };

  const saveLanguage = async (e: React.FormEvent | React.FocusEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (editLanguage) {
      await db.books.update(id, { sourceLanguage: editLanguage });
    }
    setEditingLanguageId(null);
  };

  const handleLanguageKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      saveLanguage(e, id);
    } else if (e.key === 'Escape') {
      setEditingLanguageId(null);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      saveTitle(e, id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  // Handle keyboard navigation for How to Use view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showHowToUse) {
        setShowHowToUse(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHowToUse]);

  return (
    <div className="min-h-screen bg-[var(--zen-bg,#Fdfbf7)] text-[var(--zen-text,#1c1917)] font-sans selection:bg-rose-200 overflow-x-hidden relative">

      {/* Settings Button */}
      <Link 
        href="/settings"
        className="fixed top-6 right-6 z-20 p-3 backdrop-blur-sm rounded-full shadow-sm hover:shadow-md transition-all duration-300"
        style={{ 
          color: 'var(--zen-text-muted, #78716c)',
          backgroundColor: 'var(--zen-accent-bg, rgba(255,255,255,0.5))',
          borderColor: 'var(--zen-border, rgba(255,255,255,0.3))'
        }}
        title="Settings"
      >
        <IoSettingsOutline size={20} />
      </Link>

      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-rose-100/30 dark:bg-rose-900/10 rounded-full blur-3xl opacity-60 animate-pulse duration-[10s]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-emerald-100/30 dark:bg-emerald-900/10 rounded-full blur-3xl opacity-60 animate-pulse duration-[12s]" />
      </div>

      <main className={`container mx-auto px-6 ${showHowToUse ? 'pt-8 pb-8' : 'py-24'} flex flex-col items-center relative z-10`}>

        {/* Header */}
        <header className={`${showHowToUse ? 'mb-6' : 'mb-16'} text-center space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000`}>
          <div className="inline-block mb-4">
            <img src="/landing_zen.svg" alt="EnsoRead" className="w-32 h-32" style={{ filter: 'var(--zen-logo-filter, none)' }} />
          </div>
          <h1 className="text-6xl md:text-8xl font-serif font-thin tracking-tighter" style={{ color: 'var(--zen-heading, #1c1917)' }}>
            <span className="inline-block">Ens<span className="macron-o">ō</span>Read</span>{' '}
            <span 
              className="text-rose-400 inline-block"
              style={{ 
                width: '2.5ch', // Fixed width for 2-char codes
                display: 'inline-block',
                textAlign: 'left',
                fontSize: 'inherit',
                fontFamily: 'inherit',
                letterSpacing: 'inherit',
              }}
            >
              {titleTypingText || '\u00A0'}
              {titleTypingText && titleTypingText.length < longestLanguageCode.length && (
                <span className="animate-blink">|</span>
              )}
            </span>
          </h1>
          <p 
            className="text-lg md:text-xl font-light max-w-lg mx-auto leading-relaxed tracking-wide mt-4"
            style={{ 
              minHeight: '1.5em',
            }}
          >
            <span style={{ color: 'var(--zen-text-muted, #78716c)' }}>Master </span>
            <span style={{ color: 'var(--zen-text-muted, #78716c)' }}>
              {masterTypingText || '\u00A0'}
              {masterTypingText && masterTypingText.length < SUPPORTED_LANGUAGES[currentLanguageIndex].nativeName.length && (
                <span className="animate-blink">|</span>
              )}
            </span>
            {' '}
            <span style={{ color: 'var(--zen-text-muted, #78716c)' }}>through </span>
            <span className="font-normal block md:inline" style={{ color: 'var(--zen-text, #1c1917)' }}>reading immersion</span>.
          </p>
          <div className="mt-8 h-10 flex items-center justify-center" style={{ minHeight: '2.5rem' }}>
            <button
              onClick={() => {
                setShowHowToUse(true);
                
                // Wait for React to render the Philosophy section and scroll so BACK button is at top
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    setTimeout(() => {
                      // Find the BACK button - this should be the topmost element visible
                      const backButton = document.querySelector('[data-back-button]') as HTMLElement;
                      if (backButton) {
                        // Scroll so the BACK button is at the top of the viewport
                        const backButtonRect = backButton.getBoundingClientRect();
                        const currentScrollY = window.scrollY;
                        const backButtonAbsoluteTop = backButtonRect.top + currentScrollY;
                        // Scroll to position the button at the very top (with a small offset for padding)
                        const targetScroll = backButtonAbsoluteTop - 20; // 20px offset for visual padding
                        window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
                      }
                    }, 400); // Wait for animations to complete
                  });
                });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowHowToUse(true);
                  
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      setTimeout(() => {
                        const backButton = document.querySelector('[data-back-button]') as HTMLElement;
                        if (backButton) {
                          const backButtonRect = backButton.getBoundingClientRect();
                          const currentScrollY = window.scrollY;
                          const backButtonAbsoluteTop = backButtonRect.top + currentScrollY;
                          const targetScroll = backButtonAbsoluteTop - 20;
                          window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
                        }
                      }, 400);
                    });
                  });
                }
              }}
              className={`inline-flex items-center gap-2 px-0 py-2 transition-opacity duration-500 hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 rounded-sm ${
                showHowToUse ? 'opacity-0 pointer-events-none invisible' : 'opacity-100 pointer-events-auto visible'
              }`}
              style={{
                color: 'var(--zen-text-muted, #78716c)',
                backgroundColor: 'transparent',
              }}
              aria-label="View Philosophy & Guide"
              ref={(el) => {
                if (el) {
                  (window as any).philosophyButtonRef = el;
                }
              }}
            >
              <span className="text-sm font-light tracking-wider uppercase letter-spacing-wider border-b border-current pb-0.5 transition-all duration-300 hover:border-opacity-50" style={{ borderColor: 'var(--zen-text-muted, #78716c)' }}>
                Philosophy & Guide
              </span>
            </button>
          </div>
        </header>

        {/* How to Use Content Section */}
        {showHowToUse && (
        <section 
          data-philosophy-section
          className="w-full max-w-4xl mx-auto px-4 md:px-6 animate-in fade-in slide-in-from-bottom-12 duration-500"
          style={{
            animationFillMode: 'forwards',
            marginBottom: 0,
            paddingBottom: 0,
            marginTop: 0,
          }}
        >
            {/* Back Button */}
            <button
              data-back-button
              onClick={() => {
                setShowHowToUse(false);
                // Scroll all the way to the top
                setTimeout(() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }, 100);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowHowToUse(false);
                  setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }, 100);
                }
              }}
              className="mb-6 md:mb-8 inline-flex items-center gap-2 px-0 py-2 transition-all duration-300 hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 rounded-sm min-h-[44px] touch-manipulation"
              style={{
                color: 'var(--zen-text-muted, #78716c)',
                backgroundColor: 'transparent',
              }}
              aria-label="Back to main view"
            >
              <IoArrowBack size={18} />
              <span className="text-sm font-light tracking-wider uppercase letter-spacing-wider border-b border-current pb-0.5 transition-all duration-300 hover:border-opacity-50" style={{ borderColor: 'var(--zen-text-muted, #78716c)' }}>
                Back
              </span>
            </button>

            {/* Content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: showHowToUse ? '2rem' : 0, paddingBottom: 0, marginBottom: 0, paddingTop: 0 }}>
              {/* Header */}
              <div className="text-center" style={{ marginTop: 0, marginBottom: 0 }}>
                <h2 
                  data-philosophy-heading
                  className="text-3xl md:text-4xl lg:text-5xl font-serif font-light tracking-tight mb-4 px-2" 
                  style={{ color: 'var(--zen-heading, #1c1917)' }}
                >
                  Philosophy & Guide
                </h2>
              </div>

              {/* Philosophy Section */}
              <div className="backdrop-blur-sm rounded-2xl md:rounded-3xl p-6 md:p-8 lg:p-12 shadow-lg" style={{ 
                backgroundColor: 'var(--zen-card-bg, rgba(255,255,255,0.4))',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--zen-border, rgba(255,255,255,0.4))',
              }}>
                <h3 className="text-xl md:text-2xl lg:text-3xl font-serif font-light mb-4 md:mb-6" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                  The Immersive Reading Approach
                </h3>
                <div className="space-y-4 text-sm md:text-base lg:text-lg font-light leading-relaxed" style={{ color: 'var(--zen-text, #1c1917)' }}>
                  <p>
                   At some point in your language learning, it helps to move beyond exercises and begin engaging with <span className="font-medium">native content</span>. Real fluency grows through context, where repeated exposure in real sentences makes vocabulary and grammar stick.</p>
                  
                  <p><span className="font-medium">Reading</span> is one of the simplest ways to do this, yet many learners struggle to maintain a reading habit in a foreign language. Gaps in understanding break concentration and create frustration, often making people quit too early. To stay engaged, when an unknown word, grammar pattern, or sentence structure sparks curiosity your brain needs fast answers. 
                  </p>
                  <p>
                    Ens<span className="macron-o">ō</span>Read is built around this idea. It keeps you in the reading flow by giving you instant access to meanings and translations, exactly when curiosity arises. But be careful! <span className="font-medium">Use translation to verify your understanding, not to bypass it</span>. Leave notes for yourself by marking tricky grammar, saving useful vocabulary, or recording questions for later. With repeated exposure in meaningful contexts, comprehension grows naturally over time.
                  </p>
                </div>
              </div>

              {/* What is EnsōRead */}
              <div className="backdrop-blur-sm rounded-2xl md:rounded-3xl p-6 md:p-8 lg:p-12 shadow-lg" style={{ 
                backgroundColor: 'var(--zen-card-bg, rgba(255,255,255,0.4))',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--zen-border, rgba(255,255,255,0.4))',
              }}>
                <h3 className="text-xl md:text-2xl lg:text-3xl font-serif font-light mb-4 md:mb-6" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                  What is Ens<span className="macron-o">ō</span>Read?
                </h3>
                <div className="space-y-4 text-sm md:text-base lg:text-lg font-light leading-relaxed" style={{ color: 'var(--zen-text, #1c1917)' }}>
                  <p>
                   Ens<span className="macron-o">ō</span>Read is an EPUB reader designed specifically for language learning. It lets you upload books in your target language and read with support tools that preserve focus instead of interrupting it. You can view paragraph-level translations for <KeywordHighlight word="parallel reading" definition="Reading method where you see the original text alongside its translation, helping you understand meaning while maintaining reading flow." /> and consult an <KeywordHighlight word="AI companion" definition="An LLM model that can answer questions about language, grammar, and meaning alike to your native friend or tutor. Currently you will have to use your own OpenAI API key to use this feature." /> that can aswer arbitrary questions about the text on the fly. Think of it as having a native speaker or teacher beside you, ready to answer questions at the moment they arise. 
                  </p>
                  <p>
                    The project began as a personal tool for Japanese reading comprehension and has since grown to support many language pairs. If you would like to request a feature, ask about language support, or report a bug, feel free to contact the developer via the <a href="https://github.com/tulerpetontidae/enso-read" target="_blank" rel="noopener noreferrer" className="underline decoration-1 underline-offset-2 hover:decoration-2 transition-all" style={{ color: 'var(--zen-text, #1c1917)', textDecorationColor: 'var(--zen-text-muted, #78716c)' }}>project's GitHub page</a>.
                  </p>
                </div>
              </div>

              {/* Features Section */}
              <div className="backdrop-blur-sm rounded-2xl md:rounded-3xl p-6 md:p-8 lg:p-12 shadow-lg" style={{ 
                backgroundColor: 'var(--zen-card-bg, rgba(255,255,255,0.4))',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--zen-border, rgba(255,255,255,0.4))',
                marginBottom: 0,
              }}>
                <h3 className="text-xl md:text-2xl lg:text-3xl font-serif font-light mb-6 md:mb-8" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                  Key Features
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {/* Feature 1: Translation */}
                  <div className="flex gap-3 md:gap-4">
                    <div className="flex-shrink-0 mt-0.5 md:mt-1" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                      <IoLanguageOutline size={20} className="md:w-6 md:h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base md:text-lg font-medium mb-1.5 md:mb-2" style={{ color: 'var(--zen-heading, #1c1917)' }}>On-Demand paragraph Translation</h4>
                      <p className="text-xs md:text-sm font-light leading-relaxed" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                        Get instant translations with multiple engines: OpenAI, Google Translate or Bergamot. For more powerful models you will need to set up an API key in Settings.
                      </p>
                    </div>
                  </div>

                  {/* Feature 2: Notes */}
                  <div className="flex gap-3 md:gap-4">
                    <div className="flex-shrink-0 mt-0.5 md:mt-1" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                      <IoPencilOutline size={20} className="md:w-6 md:h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base md:text-lg font-medium mb-1.5 md:mb-2" style={{ color: 'var(--zen-heading, #1c1917)' }}>Interactive notes and AI companion</h4>
                      <p className="text-xs md:text-sm font-light leading-relaxed" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                        Save notes directly in your books. Capture vocabulary, grammar insights, or personal thoughts as you read. Chat to an AI companion for explanations and clarifications (requires an API key in Settings). Your annotations stay with the text.
                      </p>
                    </div>
                  </div>

                  {/* Feature 3: Bookmarks */}
                  <div className="flex gap-3 md:gap-4">
                    <div className="flex-shrink-0 mt-0.5 md:mt-1" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                      <IoBookOutline size={20} className="md:w-6 md:h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base md:text-lg font-medium mb-1.5 md:mb-2" style={{ color: 'var(--zen-heading, #1c1917)' }}>Bookmarks & Progress</h4>
                      <p className="text-xs md:text-sm font-light leading-relaxed" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                        Bookmark important passages and track your reading progress. Visual indicators show how far you've come in each book.
                      </p>
                    </div>
                  </div>

                  {/* Feature 4: Multiple Languages */}
                  <div className="flex gap-3 md:gap-4">
                    <div className="flex-shrink-0 mt-0.5 md:mt-1" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                      <IoCheckmarkCircleOutline size={20} className="md:w-6 md:h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base md:text-lg font-medium mb-1.5 md:mb-2" style={{ color: 'var(--zen-heading, #1c1917)' }}>Multiple Languages</h4>
                      <p className="text-xs md:text-sm font-light leading-relaxed" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                        Support for Japanese, Chinese, German, and many more languages.
                      </p>
                    </div>
                  </div>

                  {/* Feature 5: Offline Capabilities */}
                  <div className="flex gap-3 md:gap-4">
                    <div className="flex-shrink-0 mt-0.5 md:mt-1" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                      <IoCloudOfflineOutline size={20} className="md:w-6 md:h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base md:text-lg font-medium mb-1.5 md:mb-2" style={{ color: 'var(--zen-heading, #1c1917)' }}>Offline Usage</h4>
                      <p className="text-xs md:text-sm font-light leading-relaxed" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                        All data is stored locally - your books, notes, and translations remain private. The offline translation capability is performed with Bergamot - locally executed language models. More offline features are actively in development.
                      </p>
                    </div>
                  </div>

                  {/* Feature 6: Clean Reading */}
                  <div className="flex gap-3 md:gap-4">
                    <div className="flex-shrink-0 mt-0.5 md:mt-1" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                      <IoBarChartOutline size={20} className="md:w-6 md:h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base md:text-lg font-medium mb-1.5 md:mb-2" style={{ color: 'var(--zen-heading, #1c1917)' }}>Distraction-Free Reading</h4>
                      <p className="text-xs md:text-sm font-light leading-relaxed" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                        Clean, minimalist interface focused on the text. Customizable themes adapt to your preference (light, dark, or sepia) for comfortable reading in any environment.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Getting Started */}
              <div className="text-center" style={{ marginBottom: 0, paddingBottom: 0, paddingTop: showHowToUse ? '1rem' : 0, marginTop: showHowToUse ? '1rem' : 0 }}>
                <button
                  onClick={() => {
                    setShowHowToUse(false);
                    // Scroll to very top after transition
                    setTimeout(() => {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }, 100);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShowHowToUse(false);
                      setTimeout(() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }, 100);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-0 py-2 transition-all duration-300 hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 rounded-sm min-h-[44px] touch-manipulation"
                  style={{
                    color: 'var(--zen-text-muted, #78716c)',
                    backgroundColor: 'transparent',
                  }}
                  aria-label="Start reading - return to main view"
                >
                  <span className="text-sm font-light tracking-wider uppercase letter-spacing-wider border-b border-current pb-0.5 transition-all duration-300 hover:border-opacity-50" style={{ borderColor: 'var(--zen-text-muted, #78716c)' }}>
                    Start Reading
                  </span>
                </button>
                <p className="mt-3 md:mt-4 text-xs md:text-sm font-light px-2" style={{ color: 'var(--zen-text-muted, #78716c)', marginBottom: 0, paddingBottom: 0 }}>
                  Upload an EPUB file to begin your reading journey
                </p>
              </div>
            </div>
        </section>
        )}

        {/* Upload Section */}
        {!showHowToUse && (
        <section 
          className="w-full flex justify-center mb-20 animate-in fade-in slide-in-from-bottom-12 duration-500 delay-200"
          ref={(el) => {
            if (el) {
              (window as any).uploadSectionRef = el;
            }
          }}
        >
          <div>
            <FileUpload />
          </div>
        </section>
        )}

        {/* Library Section */}
        {!showHowToUse && books && books.length > 0 && (
          <section 
            className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-16 duration-500 delay-300"
          >
            <div>
            <div className="flex items-center justify-between mb-12 px-2">
              <h2 className="text-3xl font-serif font-light tracking-wide" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                Library
              </h2>
              <span className="text-sm font-light uppercase tracking-widest" style={{ color: 'var(--zen-text-muted, #78716c)' }}>{books.length} Books</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {books?.map((book) => (
                <div
                  key={book.id}
                  className="group relative flex flex-col aspect-[3/4] p-8 backdrop-blur-sm rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 overflow-hidden cursor-pointer"
                  style={{ 
                    backgroundColor: 'var(--zen-card-bg, rgba(255,255,255,0.4))',
                    borderColor: 'var(--zen-border, rgba(255,255,255,0.4))',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                  }}
                  onClick={(e) => {
                    // Don't navigate if clicking on interactive elements
                    const target = e.target as HTMLElement;
                    if (
                      editingId === book.id ||
                      editingLanguageId === book.id ||
                      target.closest('.language-badge-container') ||
                      target.closest('.action-buttons-container') ||
                      target.closest('input') ||
                      target.closest('select') ||
                      target.closest('button') ||
                      target.tagName === 'SELECT' ||
                      target.tagName === 'OPTION'
                    ) {
                      // Don't navigate - let the interactive element handle it
                      return;
                    }
                    // Navigate to the reader
                    router.push(`/reader/${book.id}`);
                  }}
                >
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" 
                    style={{ 
                      background: 'var(--zen-card-hover-gradient, linear-gradient(to top, rgba(255,255,255,0.9), transparent))'
                    }} 
                  />

                  {/* Progress Indicator - gradient from bottom to top */}
                  {progressMap[book.id] > 0 && (
                    <div 
                      className="absolute inset-0 pointer-events-none rounded-3xl"
                      style={{
                        background: `linear-gradient(to top, 
                          var(--zen-progress-gradient-start) 0%, 
                          var(--zen-progress-gradient-start) ${progressMap[book.id]}%, 
                          transparent ${progressMap[book.id]}%, 
                          transparent 100%)`
                      }}
                    />
                  )}

                  {/* Progress Percentage */}
                  {progressMap[book.id] > 0 && (
                    <div 
                      className="absolute bottom-4 right-4 z-10 text-xs font-light tracking-wider"
                      style={{ 
                        color: 'var(--zen-text-muted)',
                        opacity: 0.8
                      }}
                    >
                      {progressMap[book.id]}%
                    </div>
                  )}

                  {/* Language Badge - Editable (Top Left) */}
                  <div 
                    className="language-badge-container absolute top-4 left-4 z-20"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editingLanguageId !== book.id) {
                        startEditingLanguage(e, book.id, book.sourceLanguage);
                      }
                    }}
                    title="Click to change language"
                  >
                    {editingLanguageId === book.id ? (
                      <select
                        value={editLanguage}
                        onChange={(e) => {
                          const newLang = e.target.value;
                          setEditLanguage(newLang);
                          // Save immediately on change
                          db.books.update(book.id, { sourceLanguage: newLang || undefined }).then(() => {
                            setEditingLanguageId(null);
                          });
                        }}
                        onBlur={(e) => {
                          saveLanguage(e, book.id);
                        }}
                        onKeyDown={(e) => handleLanguageKeyDown(e, book.id)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="px-2 py-1 rounded-md text-xs font-light backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                        style={{ 
                          backgroundColor: 'var(--zen-card-solid-bg, rgba(255,255,255,0.9))',
                          color: 'var(--zen-text)',
                          border: '1px solid var(--zen-border, rgba(0,0,0,0.1))',
                        }}
                      >
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <option key={lang.code} value={lang.code}>
                            {lang.nativeName} ({lang.code.toUpperCase()})
                          </option>
                        ))}
                        <option value="">Unknown</option>
                      </select>
                    ) : (
                      <div 
                        className="px-2 py-1 rounded-md text-xs font-light backdrop-blur-sm cursor-pointer hover:bg-opacity-90 transition-all"
                        style={{ 
                          backgroundColor: book.sourceLanguage 
                            ? 'var(--zen-card-solid-bg, rgba(255,255,255,0.8))' 
                            : 'var(--zen-card-solid-bg, rgba(255,255,255,0.6))',
                          color: 'var(--zen-text-muted)',
                          border: '1px solid var(--zen-border, rgba(0,0,0,0.1))'
                        }}
                      >
                        {book.sourceLanguage 
                          ? `${getLanguageName(book.sourceLanguage)} ${getLanguageCode(book.sourceLanguage)}`
                          : 'Language?'}
                      </div>
                    )}
                  </div>

                  {/* Book Cover */}
                  <div className="flex-1 flex items-center justify-center mb-4">
                    {book.coverImage ? (
                      <div className="w-20 h-28 rounded-lg overflow-hidden shadow-md group-hover:scale-105 transition-transform duration-500">
                        <img 
                          src={book.coverImage} 
                          alt={book.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-28 shadow-inner rounded-lg border-l-4 flex items-center justify-center group-hover:scale-105 transition-transform duration-500" style={{ backgroundColor: 'var(--zen-placeholder-bg, #f5f5f4)', borderColor: 'var(--zen-placeholder-border, #d6d3d1)' }}>
                        <span className="font-serif text-3xl opacity-50" style={{ color: 'var(--zen-placeholder-text, #d6d3d1)' }}>本</span>
                      </div>
                    )}
                  </div>

                  <div className="relative z-10 space-y-2 text-center">
                    {editingId === book.id ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={(e) => saveTitle(e, book.id)}
                        onKeyDown={(e) => handleTitleKeyDown(e, book.id)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="w-full font-serif font-medium text-lg text-center rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-rose-300"
                        style={{ backgroundColor: 'var(--zen-input-bg, white)', borderColor: 'var(--zen-border, #e7e5e4)', color: 'var(--zen-text, #1c1917)' }}
                      />
                    ) : (
                      <h3 className="font-serif font-medium text-xl leading-snug line-clamp-2 group-hover:text-rose-500 transition-colors" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                        {book.title}
                      </h3>
                    )}
                    <p className="text-xs font-light tracking-wider" style={{ color: 'var(--zen-text-muted, #a8a29e)' }}>
                      {new Date(book.addedAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="action-buttons-container absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all z-20">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditing(e, book.id, book.title);
                      }}
                      className="p-2 hover:text-amber-500 rounded-full transition-all"
                      style={{ color: 'var(--zen-text-muted, #d6d3d1)' }}
                      title="Rename book"
                    >
                      <RiPencilLine size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBook(e, book.id);
                      }}
                      className="p-2 hover:text-rose-500 rounded-full transition-all"
                      style={{ color: 'var(--zen-text-muted, #d6d3d1)' }}
                      title="Delete book"
                    >
                      <RiDeleteBinLine size={16} />
                    </button>
                  </div>

                  {/* Delete Confirmation Modal */}
                  {deletingBookId === book.id && (
                    <div
                      className="absolute inset-0 flex items-center justify-center z-50 rounded-3xl"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        backdropFilter: 'blur(4px)',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingBookId(null);
                      }}
                    >
                      <div
                        className="px-4 py-3 rounded-xl shadow-lg max-w-xs mx-4"
                        style={{
                          backgroundColor: 'var(--zen-note-bg, white)',
                          borderWidth: '2px',
                          borderStyle: 'solid',
                          borderColor: 'var(--zen-note-border, #fcd34d)',
                          color: 'var(--zen-text, #1c1917)',
                          textAlign: 'center',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mb-3 text-sm font-medium">Delete this book?</div>
                        <p className="text-xs mb-4" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                          All translations, notes, chats, and bookmarks will be removed. This cannot be undone.
                        </p>
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDeleteBook();
                            }}
                            className="px-3 py-1 rounded text-xs font-medium transition-colors"
                            style={{
                              backgroundColor: 'rgba(220, 38, 38, 0.9)',
                              color: 'white',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.9)';
                            }}
                          >
                            Delete
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingBookId(null);
                            }}
                            className="px-3 py-1 rounded text-xs font-medium transition-colors"
                            style={{
                              backgroundColor: 'rgba(245, 245, 244, 0.9)',
                              color: '#1c1917',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(245, 245, 244, 1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(245, 245, 244, 0.9)';
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            </div>
          </section>
        )}

        {/* Footer with GitHub link */}
        {!showHowToUse && (
        <footer className="mt-32 pb-4 text-center animate-in fade-in slide-in-from-bottom-20 duration-500 delay-400">
          <a
            href="https://github.com/tulerpetontidae/enso-read"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-col items-center gap-1.5 transition-colors hover:opacity-80"
            style={{ color: 'var(--zen-text-muted)' }}
          >
            <FaGithub size={20} />
            <span className="text-xs">tulerpetontidae/enso-read</span>
          </a>
        </footer>
        )}
      </main>
    </div>
  );
}
