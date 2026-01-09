'use client';

import React, { useEffect, useRef, useState, use, useMemo, useCallback } from 'react';
import { db } from '@/lib/db';
import ePub, { Book } from 'epubjs';
import { FaChevronLeft } from 'react-icons/fa';
import { IoSettingsOutline } from 'react-icons/io5';
import { IoMoonOutline, IoMoon } from 'react-icons/io5';
import Link from 'next/link';
import parse, { domToReact, HTMLReactParserOptions, Element, DOMNode } from 'html-react-parser';
import TranslatableParagraph from '@/components/TranslatableParagraph';
import SettingsModal, { FONT_OPTIONS, WIDTH_OPTIONS, FONT_SIZE_OPTIONS } from '@/components/SettingsModal';
import MobileBottomPanel, { type BottomPanelTab } from '@/components/MobileBottomPanel';
import ChatAssistant from '@/components/ChatAssistant';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ReaderDataProvider, useReaderDataStore, useActiveParagraphHash as useContextActiveParagraph } from '@/contexts/ReaderDataContext';
import { initializePanelRoot, cleanupPanelRoot } from '@/utils/panelRoot';
import { 
    dispatchPanelClose,
    subscribeToNoteSave, 
    subscribeToTranslationRetry,
    subscribeToPanelClose,
    subscribeToChatCreated,
    subscribeToChatDeleted,
} from '@/utils/panelEventBridge';

function debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// Robust path resolution helper
function resolvePath(basePath: string, relativePath: string): string {
    if (relativePath.startsWith('/') || relativePath.startsWith('http')) return relativePath;

    // Get directory parts of the base path
    const baseParts = basePath.split('/').slice(0, -1);
    const relParts = relativePath.split('/');

    for (const part of relParts) {
        if (part === '..') {
            if (baseParts.length > 0) baseParts.pop();
        } else if (part === '.') {
            // Do nothing
        } else if (part) {
            baseParts.push(part);
        }
    }

    return baseParts.join('/');
}

// Helper to extract text content from React nodes
function getTextContent(node: React.ReactNode): string {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (!node) return '';
    if (Array.isArray(node)) return node.map(getTextContent).join('');
    if (React.isValidElement(node)) {
        const props = node.props as { children?: React.ReactNode };
        if (props.children) {
            return getTextContent(props.children);
        }
    }
    return '';
}

// Wrapper component that provides the context
export default function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
    return (
        <ReaderDataProvider>
            <ReaderPageContent params={params} />
        </ReaderDataProvider>
    );
}

// Actual reader content that uses the context
function ReaderPageContent({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const containerRef = useRef<HTMLDivElement>(null);
    const paragraphTextMapRef = useRef<Map<string, string>>(new Map()); // Cache paragraph text by hash
    const scrollRafRef = useRef<number | null>(null);
    const lastProgressRef = useRef<number>(0);
    const [progress, setProgress] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [sections, setSections] = useState<Array<{ id: string, html: string }>>([]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [readerFont, setReaderFont] = useState('serif');
    const [readerWidth, setReaderWidth] = useState('medium');
    const [readerFontSize, setReaderFontSize] = useState('medium');
    const [bookTitle, setBookTitle] = useState<string>('');
    const [showAllTranslations, setShowAllTranslations] = useState(false);
    const [showAllComments, setShowAllComments] = useState(false);
    const [showAllChats, setShowAllChats] = useState(false);
    const [bookmarkPositions, setBookmarkPositions] = useState<Array<{ top: number; height: number; color: string }>>([]);
    const [showBookmarkIndicators, setShowBookmarkIndicators] = useState(false); // Toggle: ON = show on scroll, OFF = never show
    const [indicatorsVisible, setIndicatorsVisible] = useState(false); // Actual visibility state (for auto-hide)
    const [zenMode, setZenMode] = useState(false);
    const [notesVersion, setNotesVersion] = useState(0);
    const [bookmarksVersion, setBookmarksVersion] = useState(0);
    
    // Mobile state
    const isMobile = useIsMobile();
    const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
    const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>('translation');
    const [headerOffset, setHeaderOffset] = useState(0); // 0..HEADER_HEIGHT, used to slide header & content together
    
    // Use context for active paragraph (set by TranslatableParagraph)
    const activeParagraphHash = useContextActiveParagraph();
    
    // Batch-loaded data lookup maps (Phase 1: Batch Database Queries)
    const [translationMap, setTranslationMap] = useState<Map<string, { translatedText: string; originalText: string; error?: string }>>(new Map());
    const [translationErrors, setTranslationErrors] = useState<Map<string, string>>(new Map()); // Store errors separately
    const [noteMap, setNoteMap] = useState<Map<string, { content: string; height?: number }>>(new Map());
    const [bookmarkMap, setBookmarkMap] = useState<Map<string, { colorGroupId: string }>>(new Map());
    const [chatMap, setChatMap] = useState<Map<string, boolean>>(new Map()); // Maps threadId to hasChat boolean
    const [bookmarkGroupMap, setBookmarkGroupMap] = useState<Map<string, { name: string; color: string }>>(new Map());
    
    // Refs to access latest map values without causing re-renders
    const translationMapRef = useRef(translationMap);
    const translationErrorsRef = useRef(translationErrors);
    const noteMapRef = useRef(noteMap);
    const chatMapRef = useRef(chatMap);
    
    // Keep refs in sync with state
    useEffect(() => {
        translationMapRef.current = translationMap;
    }, [translationMap]);
    useEffect(() => {
        translationErrorsRef.current = translationErrors;
    }, [translationErrors]);
    useEffect(() => {
        noteMapRef.current = noteMap;
    }, [noteMap]);
    useEffect(() => {
        chatMapRef.current = chatMap;
    }, [chatMap]);

    // Load reader settings
    const loadReaderSettings = useCallback(async () => {
        try {
            const [fontSetting, widthSetting, fontSizeSetting] = await Promise.all([
                db.settings.get('reader_font'),
                db.settings.get('reader_width'),
                db.settings.get('reader_font_size'),
            ]);
            if (fontSetting?.value) setReaderFont(fontSetting.value);
            if (widthSetting?.value) setReaderWidth(widthSetting.value);
            if (fontSizeSetting?.value) setReaderFontSize(fontSizeSetting.value);
        } catch (e) {
            console.error('Failed to load reader settings:', e);
        }
    }, []);

    useEffect(() => {
        loadReaderSettings();
    }, [loadReaderSettings]);

    // Refresh bookmark groups map (called when groups are updated)
    const refreshBookmarkGroupMap = useCallback(async () => {
        try {
            const allBookmarkGroups = await db.bookmarkGroups.toArray();
            const bgMap = new Map<string, { name: string; color: string }>();
            allBookmarkGroups.forEach(g => {
                bgMap.set(g.id, { name: g.name, color: g.color });
            });
            setBookmarkGroupMap(bgMap);
        } catch (e) {
            console.error('Failed to refresh bookmark groups:', e);
        }
    }, []);

    // Get the data store from context
    const dataStore = useReaderDataStore();

    // Phase 1: Batch load all book-related data once on mount
    useEffect(() => {
        const batchLoadData = async () => {
            try {
                const [allTranslations, allNotes, allBookmarks, allChats, allBookmarkGroups] = await Promise.all([
                    db.translations.where('bookId').equals(id).toArray(),
                    db.notes.where('bookId').equals(id).toArray(),
                    db.bookmarks.where('bookId').equals(id).toArray(),
                    db.chats.where('bookId').equals(id).toArray(),
                    db.bookmarkGroups.toArray(),
                ]);

                // Create translation lookup map: paragraphHash -> { translatedText, originalText }
                const tMap = new Map<string, { translatedText: string; originalText: string }>();
                allTranslations.forEach(t => {
                    tMap.set(t.paragraphHash, { translatedText: t.translatedText, originalText: t.originalText });
                });

                // Create note lookup map: paragraphHash -> { content, height }
                const nMap = new Map<string, { content: string; height?: number }>();
                allNotes.forEach(n => {
                    nMap.set(n.paragraphHash, { content: n.content, height: n.height });
                });

                // Create bookmark lookup map: paragraphHash -> { colorGroupId }
                const bMap = new Map<string, { colorGroupId: string }>();
                allBookmarks.forEach(b => {
                    bMap.set(b.paragraphHash, { colorGroupId: b.colorGroupId });
                });

                // Create chat lookup map: threadId -> hasChat (boolean)
                const cMap = new Map<string, boolean>();
                allChats.forEach(chat => {
                    cMap.set(chat.threadId, true);
                });

                // Create bookmark group lookup map: groupId -> { name, color }
                const bgMap = new Map<string, { name: string; color: string }>();
                allBookmarkGroups.forEach(g => {
                    bgMap.set(g.id, { name: g.name, color: g.color });
                });

                // Initialize context store with all data
                dataStore.initializeData({
                    translations: tMap,
                    notes: nMap,
                    bookmarks: bMap,
                    chats: cMap,
                    bookmarkGroups: bgMap,
                });

                // Also update local state for bottom panel content (temporary)
                setTranslationMap(tMap);
                setNoteMap(nMap);
                setBookmarkMap(bMap);
                setChatMap(cMap);
                setBookmarkGroupMap(bgMap);
            } catch (e) {
                console.error('Failed to batch load book data:', e);
            }
        };

        batchLoadData();
    }, [id, dataStore]);

    // Refresh bookmark groups when settings modal closes (in case groups were updated)
    useEffect(() => {
        if (!isSettingsOpen) {
            // Settings modal just closed - refresh bookmark groups
            refreshBookmarkGroupMap();
        }
    }, [isSettingsOpen, refreshBookmarkGroupMap]);

    // Periodically refresh bookmark groups map (every 2 seconds) to catch external changes
    useEffect(() => {
        const interval = setInterval(() => {
            refreshBookmarkGroupMap();
        }, 2000);
        return () => clearInterval(interval);
    }, [refreshBookmarkGroupMap]);

    // Note update callback factory - needed for memoizing activeNoteContent
    const createNoteUpdateCallbackImmediate = useCallback((paragraphHash: string) => {
        return async (content: string) => {
            const noteId = `${id}-${paragraphHash}`;
            const currentNote = noteMapRef.current.get(paragraphHash);
            try {
                if (content.trim()) {
                    await db.notes.put({
                        id: noteId,
                        bookId: id,
                        paragraphHash,
                        content,
                        height: currentNote?.height || 80,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    });
                    const newMap = new Map(noteMapRef.current);
                    newMap.set(paragraphHash, { content, height: currentNote?.height || 80 });
                    setNoteMap(newMap);
                    // Also update context store
                    dataStore.setNote(paragraphHash, { content, height: currentNote?.height || 80 });
                } else {
                    await db.notes.delete(noteId);
                    const newMap = new Map(noteMapRef.current);
                    newMap.delete(paragraphHash);
                    setNoteMap(newMap);
                    dataStore.setNote(paragraphHash, null);
                }
            } catch (e) {
                console.error('Failed to save note:', e);
            }
        };
    }, [id, dataStore]);
    
    // Derived state for bottom panel content
    const activeNoteContent = useMemo(() => {
        if (!activeParagraphHash) return null;
        // Use ref to avoid dependency on noteMap - prevents recalculation on every Map update
        const note = noteMapRef.current.get(activeParagraphHash);
        return {
            content: note?.content || '',
            paragraphHash: activeParagraphHash,
            onUpdate: createNoteUpdateCallbackImmediate(activeParagraphHash),
        };
    }, [activeParagraphHash, createNoteUpdateCallbackImmediate]);
    
    // Use active paragraph hash for chat and translation
    const activeChatParagraphHash = activeParagraphHash;
    const activeTranslationParagraphHash = activeParagraphHash;

    // Get current font family, max width, and font size from settings
    const currentFont = FONT_OPTIONS.find(f => f.value === readerFont) || FONT_OPTIONS[0];
    const currentWidth = WIDTH_OPTIONS.find(w => w.value === readerWidth) || WIDTH_OPTIONS[1];
    const currentFontSize = FONT_SIZE_OPTIONS.find(s => s.value === readerFontSize) || FONT_SIZE_OPTIONS[1];

    // Helper function to check if an element should be treated as a paragraph
    const isParagraphElement = (domNode: Element): boolean => {
        const tagName = domNode.name.toLowerCase();
        
        // Check in priority order: p, div.paragraph, blockquote, li
        if (tagName === 'p') return true;
        if (tagName === 'div' && domNode.attribs?.class?.includes('paragraph')) return true;
        if (tagName === 'blockquote') return true;
        if (tagName === 'li') return true;
        
        return false;
    };

    // Helper function to get the appropriate wrapper element
    const getParagraphWrapper = (domNode: Element, children: React.ReactNode) => {
        const tagName = domNode.name.toLowerCase();
        
        if (tagName === 'p') {
            return <p>{children}</p>;
        } else if (tagName === 'div' && domNode.attribs?.class?.includes('paragraph')) {
            return <div className={domNode.attribs.class}>{children}</div>;
        } else if (tagName === 'blockquote') {
            return <blockquote>{children}</blockquote>;
        } else if (tagName === 'li') {
            return <li>{children}</li>;
        }
        
        return <p>{children}</p>; // Fallback
    };

    // Helper function for paragraph hash (matching TranslatableParagraph implementation)
    const hashText = (text: string): string => {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    };

    // Parser options to wrap paragraphs with TranslatableParagraph
    // CRITICAL: Dependencies are minimal - NO data maps! TranslatableParagraph uses context for data
    const parserOptions: HTMLReactParserOptions = useMemo(() => ({
        replace: (domNode) => {
            if (domNode instanceof Element) {
                // Strip document-level elements, just render their children
                if (['html', 'head', 'body'].includes(domNode.name)) {
                    if (domNode.name === 'head') {
                        // Skip head entirely (meta, title, etc.)
                        return <></>;
                    }
                    // For html and body, just render children
                    return <>{domToReact(domNode.children as DOMNode[], parserOptions)}</>;
                }
                
                // Wrap paragraph-like elements with TranslatableParagraph
                if (isParagraphElement(domNode)) {
                    const children = domToReact(domNode.children as DOMNode[], parserOptions);
                    const textContent = getTextContent(children);
                    
                    // Only wrap if there's actual text content (not just images)
                    if (textContent.trim().length > 0) {
                        const paragraphHash = hashText(textContent);
                        
                        // Cache paragraph text for quick lookup (avoid DOM queries)
                        paragraphTextMapRef.current.set(paragraphHash, textContent);
                        
                        // TranslatableParagraph will get data from context, not props!
                        return (
                            <TranslatableParagraph 
                                bookId={id} 
                                paragraphText={textContent}
                                paragraphHash={paragraphHash}
                                showAllTranslations={showAllTranslations}
                                showAllComments={showAllComments}
                                showAllChats={showAllChats}
                                zenMode={zenMode}
                            >
                                {getParagraphWrapper(domNode, children)}
                            </TranslatableParagraph>
                        );
                    }
                }
            }
            return undefined;
            }
        }), [id, showAllTranslations, showAllComments, showAllChats, zenMode]);
    // Dependencies: ONLY stable values that rarely change. NO maps, NO callbacks!

    // CRITICAL: Memoize parsed sections to prevent re-parsing on every render
    // This is the most expensive operation - parsing HTML for all sections
    const parsedSections = useMemo(() => {
        return sections.map((section) => ({
            id: section.id,
            content: parse(section.html, parserOptions),
        }));
    }, [sections, parserOptions]);

    // CRITICAL: Also memoize the entire sections rendering to prevent re-creating 
    // 13,000+ React elements on every state change (like tab switches)
    const renderedSections = useMemo(() => {
        return parsedSections.map((section) => (
            <div 
                key={section.id}
                className="epub-section"
                style={{
                    fontFamily: currentFont.fontFamily,
                    fontSize: currentFontSize.size,
                    lineHeight: '1.9',
                    color: 'var(--zen-text, #1a1a1a)',
                    padding: isMobile ? '8px 8px' : '10px 40px',
                    textAlign: 'left', // Left align on both mobile and desktop
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                    transition: 'font-size 0.2s ease',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                }}
            >
                {section.content}
            </div>
        ));
    }, [parsedSections, currentFont.fontFamily, currentFontSize.size, isMobile]);

    useEffect(() => {
        let bookInstance: Book | null = null;
        const blobUrls: string[] = [];

        const load = async () => {
            try {
                const bookData = await db.books.get(id);
                if (!bookData?.data) return;
                
                // Set book title
                if (bookData.title) {
                    setBookTitle(bookData.title);
                }

                // @ts-ignore
                bookInstance = ePub(bookData.data);
                await bookInstance.ready;

                const loadedSections: Array<{ id: string, html: string }> = [];

                // @ts-ignore
                for (let i = 0; i < bookInstance.spine.length; i++) {
                    // @ts-ignore
                    const section = bookInstance.spine.get(i);

                            try {
                                // Suppress epub.js internal errors
                                const originalConsoleError = console.error;
                                console.error = (...args: any[]) => {
                                    if (args[0]?.message?.includes('replaceCss')) return;
                                    originalConsoleError(...args);
                                };

                                await section.load(bookInstance.load.bind(bookInstance));
                                console.error = originalConsoleError;

                                const content = section.document;

                                if (content) {
                            // 1. Remove stylesheets to prevent 404s and style clashes
                            content.querySelectorAll('link[rel="stylesheet"]').forEach(el => el.remove());
                            content.querySelectorAll('style').forEach(el => el.remove());

                            // 2. Fix paragraph indentation (Japanese full-width spaces)
                            content.querySelectorAll('p').forEach(p => {
                                // Replace full-width space (　) at the start of paragraphs
                                if (p.innerHTML) {
                                    p.innerHTML = p.innerHTML.replace(/^[　\s]+/, '');
                                }
                            });

                            // 3. Process images (both <img> and SVG <image>)
                            const imageTags = content.querySelectorAll('img, image');
                            for (const img of imageTags) {
                                let src = img.getAttribute('src');
                                let isSvgImage = false;

                                if (!src) {
                                    src = img.getAttribute('xlink:href');
                                    isSvgImage = !!src;
                                }

                                if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                                    try {
                                        const sectionHref = section.href || section.canonical || '';
                                        const resolvedPath = resolvePath(sectionHref, src);

                                        // Attempt to find the file in zip
                                        // @ts-ignore
                                        let zipFile = bookInstance.archive.zip.file(resolvedPath);

                                        // Fallback: search for filename only if not found (sometimes paths are weird)
                                        if (!zipFile) {
                                            const fileName = resolvedPath.split('/').pop();
                                            if (fileName) {
                                                // @ts-ignore
                                                const matches = Object.keys(bookInstance.archive.zip.files).filter(k => k.endsWith(fileName));
                                                if (matches.length > 0) {
                                                    // @ts-ignore
                                                    zipFile = bookInstance.archive.zip.file(matches[0]);
                                                }
                                            }
                                        }

                                        if (zipFile) {
                                            const blob = await zipFile.async('blob');
                                            const objectUrl = URL.createObjectURL(blob);
                                            blobUrls.push(objectUrl);

                                            if (isSvgImage) {
                                                img.setAttribute('xlink:href', objectUrl);
                                            } else {
                                                img.setAttribute('src', objectUrl);
                                            }
                                        }
                                    } catch (e) {
                                        console.error('Image processing failed:', src, e);
                                    }
                                }
                            }

                            const serializer = new XMLSerializer();
                            const htmlString = serializer.serializeToString(content);

                            loadedSections.push({
                                id: section.idref || `section-${i}`,
                                html: htmlString
                            });
                        }
                        section.unload();
                    } catch (err) {
                        // Suppress replaceCss and other internal epub.js errors
                        // These don't actually break functionality
                        if (!(err instanceof Error && err.message?.includes('replaceCss'))) {
                            console.error(`Section ${i} load error:`, err);
                        }
                    }
                }
                setSections(loadedSections);
                setIsLoading(false);

            } catch (err) {
                console.error('Reader fatal error:', err);
                setIsLoading(false);
            }
        };

        load();

        return () => {
            blobUrls.forEach(url => URL.revokeObjectURL(url));
            if (bookInstance) {
                try {
                    bookInstance.destroy();
                } catch (e) { }
            }
        };
    }, [id]);

    // Save scroll position to DB with enhanced position data
    const saveScrollPosition = async (scrollPct: number) => {
        try {
            if (!containerRef.current) return;
            
            const container = containerRef.current;
            const scrollTop = container.scrollTop;
            const scrollHeight = container.scrollHeight - container.clientHeight;
            
            // Find the paragraph element closest to the scroll position
            const paragraphs = container.querySelectorAll<HTMLElement>('[data-paragraph-hash]');
            let closestParagraph: HTMLElement | null = null;
            let closestDistance = Infinity;
            const viewportTop = scrollTop;
            
            for (let j = 0; j < paragraphs.length; j++) {
                const para = paragraphs[j];
                const rect = para.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const paraTop = rect.top - containerRect.top + scrollTop;
                const distance = Math.abs(paraTop - viewportTop);
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestParagraph = para;
                }
            }
            
            // Extract paragraph hash and calculate section index
            let paragraphHash: string | undefined;
            let sectionIndex: number | undefined;
            
            if (closestParagraph) {
                paragraphHash = closestParagraph.getAttribute('data-paragraph-hash') || undefined;
                
                // Find which section contains this paragraph
                if (paragraphHash) {
                    const sectionElements = container.querySelectorAll<HTMLElement>('.epub-section');
                    for (let i = 0; i < sectionElements.length; i++) {
                        if (sectionElements[i].contains(closestParagraph)) {
                            sectionIndex = i;
                            break;
                        }
                    }
                }
            }
            
            await db.progress.put({
                bookId: id,
                scrollPosition: scrollPct,
                scrollOffset: scrollTop,
                paragraphHash,
                sectionIndex,
                updatedAt: Date.now()
            });
        } catch (e) {
            console.error('Failed to save scroll position:', e);
        }
    };

    // Smart position restoration: single jump, as early as possible, accurately
    const positionRestoredRef = useRef(false);
    const savedPositionRef = useRef<{ scrollPosition: number; sectionIndex?: number; scrollOffset?: number; paragraphHash?: string } | null>(null);
    
    // Load saved position FIRST (before book loading)
    useEffect(() => {
        const loadSavedPosition = async () => {
            try {
                const savedProgress = await db.progress.get(id);
                if (savedProgress) {
                    savedPositionRef.current = {
                        scrollPosition: savedProgress.scrollPosition,
                        sectionIndex: savedProgress.sectionIndex,
                        scrollOffset: savedProgress.scrollOffset,
                        paragraphHash: savedProgress.paragraphHash,
                    };
                }
            } catch (e) {
                console.error('Failed to load saved position:', e);
            }
        };
        loadSavedPosition();
    }, [id]);

    // Single jump position restoration (no jitter)
    useEffect(() => {
        if (positionRestoredRef.current || !savedPositionRef.current || sections.length === 0 || isLoading) return;
        if (!containerRef.current) return;

        const restorePosition = () => {
            const container = containerRef.current!;
            const saved = savedPositionRef.current!;
            
            // Wait for DOM to render with double requestAnimationFrame for accurate layout
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    let targetScroll = 0;
                    
                    // Method 1 (Best): Find by paragraph hash (most accurate)
                    if (saved.paragraphHash) {
                        const element = container.querySelector(`[data-paragraph-hash="${saved.paragraphHash}"]`);
                        if (element) {
                            const rect = element.getBoundingClientRect();
                            const containerRect = container.getBoundingClientRect();
                            targetScroll = container.scrollTop + rect.top - containerRect.top - 100; // 100px offset from top
                        }
                    }
                    
                    // Method 2: Use stored scroll offset (if sections above loaded)
                    if (targetScroll === 0 && saved.scrollOffset !== undefined) {
                        targetScroll = saved.scrollOffset;
                    }
                    
                    // Method 3: Use percentage of current loaded height (fallback)
                    if (targetScroll === 0) {
                        const scrollHeight = container.scrollHeight - container.clientHeight;
                        targetScroll = (saved.scrollPosition / 100) * scrollHeight;
                    }
                    
                    // Single jump - no smooth scrolling to avoid jitter
                    container.scrollTop = targetScroll;
                    setProgress(Math.round(saved.scrollPosition));
                    
                    // Mark as restored to prevent future jumps
                    positionRestoredRef.current = true;
                });
            });
        };

        restorePosition();
    }, [sections, isLoading, id]);

    useEffect(() => {
        const debouncedSave = debounce((pct: number) => {
            saveScrollPosition(pct);
        }, 1000);

        let hideTimeout: NodeJS.Timeout | null = null;

        const handleScroll = () => {
            if (containerRef.current) {
                const container = containerRef.current;
                const pct = (container.scrollTop / (container.scrollHeight - container.clientHeight)) * 100;
                const roundedPct = Math.round(Math.min(100, Math.max(0, pct)));
                
                // Only update if progress actually changed (avoid unnecessary re-renders)
                if (roundedPct !== lastProgressRef.current) {
                    lastProgressRef.current = roundedPct;
                    
                    // Cancel previous RAF
                    if (scrollRafRef.current !== null) {
                        cancelAnimationFrame(scrollRafRef.current);
                    }
                    
                    // Throttle progress updates via RAF to prevent lag
                    scrollRafRef.current = requestAnimationFrame(() => {
                        setProgress(roundedPct);
                        debouncedSave(roundedPct);
                        scrollRafRef.current = null;
                    });
                }

                // Show indicators on scroll if toggle is ON
                if (showBookmarkIndicators) {
                    setIndicatorsVisible(true);

                    // Hide after 1 second of no scrolling
                    if (hideTimeout) clearTimeout(hideTimeout);
                    hideTimeout = setTimeout(() => {
                        setIndicatorsVisible(false);
                    }, 1000);
                }
            }
        };

        const container = containerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll, { passive: true });
            return () => {
                container.removeEventListener('scroll', handleScroll);
                if (hideTimeout) clearTimeout(hideTimeout);
                if (scrollRafRef.current !== null) {
                    cancelAnimationFrame(scrollRafRef.current);
                }
            };
        }
    }, [showBookmarkIndicators]);
    
    // Track bookmark positions for scrollbar indicators (static, relative to document)
    useEffect(() => {
        const updateBookmarkPositions = async () => {
            if (!containerRef.current || sections.length === 0) return;

            try {
                // Get all bookmarks for this book
                const allBookmarks = await db.bookmarks.where('bookId').equals(id).toArray();
                if (allBookmarks.length === 0) {
                    setBookmarkPositions([]);
                    return;
                }
                
                // Get all bookmark groups to map colorGroupId to color
                const allGroups = await db.bookmarkGroups.toArray();
                const groupColorMap = new Map(allGroups.map(g => [g.id, g.color]));
                
                // Find paragraph elements with bookmarks
                const container = containerRef.current;
                const positions: Array<{ top: number; height: number; color: string }> = [];
                
                // Query all TranslatableParagraph containers
                const paragraphContainers = container.querySelectorAll('[data-paragraph-hash]');
                paragraphContainers.forEach((el) => {
                    const hash = el.getAttribute('data-paragraph-hash');
                    const bookmark = allBookmarks.find(b => b.paragraphHash === hash);
                    if (bookmark) {
                        // Get absolute position within the scrollable container (relative to document top)
                        const rect = el.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();
                        const scrollTop = container.scrollTop;
                        
                        // Calculate position relative to document top within container
                        const absoluteTop = rect.top - containerRect.top + scrollTop;
                        
                        // Get color from group
                        const color = groupColorMap.get(bookmark.colorGroupId) || '#f59e0b'; // Default to amber if group not found
                        
                        positions.push({
                            top: absoluteTop,
                            height: rect.height,
                            color,
                        });
                    }
                });
                
                setBookmarkPositions(positions);
            } catch (e) {
                console.error('Failed to update bookmark positions:', e);
            }
        };
        
        // Update positions when sections change or after content loads
        const timeout = setTimeout(updateBookmarkPositions, 1000);
        
        return () => clearTimeout(timeout);
    }, [sections, id, bookmarksVersion]);

    // Extract active paragraph data using REFS to avoid recalculating on every Map update
    // Only recalculate when the active paragraph hash actually changes
    const activeTranslation = useMemo(() => {
        if (!activeTranslationParagraphHash) return null;
        // Use ref to avoid dependency on translationMap
        return translationMapRef.current.get(activeTranslationParagraphHash) || null;
    }, [activeTranslationParagraphHash]);
    
    const activeTranslationError = useMemo(() => {
        if (!activeTranslationParagraphHash) return null;
        // Use ref to avoid dependency on translationErrors
        return translationErrorsRef.current.get(activeTranslationParagraphHash) || null;
    }, [activeTranslationParagraphHash]);
    
    const activeNote = useMemo(() => {
        if (!activeParagraphHash) return null;
        // Use ref to avoid dependency on noteMap
        return noteMapRef.current.get(activeParagraphHash) || null;
    }, [activeParagraphHash]);
    
    const activeChatThreadId = useMemo(() => {
        if (!activeChatParagraphHash) return null;
        return `${id}|${activeChatParagraphHash}`;
    }, [activeChatParagraphHash, id]);

    // Create stable note update callback factory using refs (must be before handleTabChange)
    const createNoteUpdateCallback = useCallback((paragraphHash: string) => {
        return async (content: string) => {
            const noteId = `${id}-${paragraphHash}`;
            const currentNote = noteMapRef.current.get(paragraphHash);
            try {
                if (content.trim()) {
                    await db.notes.put({
                        id: noteId,
                        bookId: id,
                        paragraphHash,
                        content,
                        height: currentNote?.height || 80,
                        createdAt: currentNote?.height ? Date.now() : Date.now(),
                        updatedAt: Date.now(),
                    });
                    const newMap = new Map(noteMapRef.current);
                    newMap.set(paragraphHash, { content, height: currentNote?.height || 80 });
                    setNoteMap(newMap);
                    setNotesVersion(prev => prev + 1);
                } else {
                    await db.notes.delete(noteId);
                    const newMap = new Map(noteMapRef.current);
                    newMap.delete(paragraphHash);
                    setNoteMap(newMap);
                    setNotesVersion(prev => prev + 1);
                }
            } catch (e) {
                console.error('Failed to save note:', e);
            }
        };
    }, [id]);

    // Initialize isolated panel root on mobile (completely separate React tree)
    useEffect(() => {
        if (isMobile) {
            initializePanelRoot(MobileBottomPanel);
        }
        return () => {
            cleanupPanelRoot();
        };
    }, [isMobile]);

    // Track when panel should be open (TranslatableParagraph dispatches panel:open events directly)
    useEffect(() => {
        if (activeParagraphHash && isMobile) {
            setBottomPanelOpen(true);
        }
    }, [activeParagraphHash, isMobile]);

    // Subscribe to panel events from the isolated panel
    useEffect(() => {
        if (!isMobile) return;

        // Handle note saves from the panel
        const unsubNoteSave = subscribeToNoteSave(async (payload) => {
            const { paragraphHash, content } = payload;
            const noteId = `${id}-${paragraphHash}`;
            try {
                // First check if note exists to preserve createdAt
                const existingNote = await db.notes.get(noteId);
                await db.notes.put({
                    id: noteId,
                    bookId: id,
                    paragraphHash,
                    content,
                    height: existingNote?.height,
                    createdAt: existingNote?.createdAt || Date.now(),
                    updatedAt: Date.now(),
                });
                // Update local map
                const newMap = new Map(noteMapRef.current);
                newMap.set(paragraphHash, { content, height: existingNote?.height });
                setNoteMap(newMap);
                dataStore.setNote(paragraphHash, { content });
            } catch (e) {
                console.error('Failed to save note from panel:', e);
            }
        });

        // Handle translation retries from the panel
        const unsubRetry = subscribeToTranslationRetry((payload) => {
            const { paragraphHash } = payload;
            // Find the paragraph and trigger translation
            const paragraphElement = containerRef.current?.querySelector(`[data-paragraph-hash="${paragraphHash}"]`) as HTMLElement;
            if (paragraphElement) {
                const translateButton = paragraphElement.querySelector('[data-translate-button]') as HTMLElement;
                if (translateButton) {
                    translateButton.click();
                }
            }
        });

        // Handle panel close from the isolated panel
        const unsubClose = subscribeToPanelClose(() => {
            setBottomPanelOpen(false);
            dataStore.setActiveParagraphHash(null);
        });

        // Handle chat created from the panel
        const unsubChatCreated = subscribeToChatCreated((payload) => {
            const { threadId } = payload;
            const newMap = new Map(chatMapRef.current);
            newMap.set(threadId, true);
            setChatMap(newMap);
            dataStore.setChat(payload.paragraphHash, true);
        });

        // Handle chat deleted from the panel
        const unsubChatDeleted = subscribeToChatDeleted((payload) => {
            const { threadId } = payload;
            const newMap = new Map(chatMapRef.current);
            newMap.delete(threadId);
            setChatMap(newMap);
            dataStore.setChat(payload.paragraphHash, false);
        });

        return () => {
            unsubNoteSave();
            unsubRetry();
            unsubClose();
            unsubChatCreated();
            unsubChatDeleted();
        };
    }, [isMobile, id, dataStore]);

    // Note: TranslatableParagraph now dispatches panel:content-update events directly
    // when translation completes, so no need to watch translationMap changes here.

    // Stable callbacks for bottom panel to prevent re-renders
    const handleBottomPanelClose = useCallback(() => {
        setBottomPanelOpen(false);
        dispatchPanelClose();
        // Clear active paragraph in context
        dataStore.setActiveParagraphHash(null);
    }, [dataStore]);

    // Mobile: smoothly slide header with scroll, similar to browser chrome,
    // and allow it to reappear whenever user scrolls up (not only near top)
    useEffect(() => {
        if (!isMobile) return;
        const scrollEl = containerRef.current;
        if (!scrollEl) return;

        const HEADER_HEIGHT = 56; // h-14 -> 14 * 4px
        let ticking = false;
        let lastScrollTop = scrollEl.scrollTop;
        let currentOffset = 0;

        const handleScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                const scrollTop = scrollEl.scrollTop;
                const delta = scrollTop - lastScrollTop;
                lastScrollTop = scrollTop;

                // Accumulate offset based on scroll direction, clamped between 0 and HEADER_HEIGHT.
                // Scrolling down moves header up (towards HEADER_HEIGHT), scrolling up moves it back down (towards 0),
                // regardless of absolute scroll position.
                currentOffset = Math.max(0, Math.min(HEADER_HEIGHT, currentOffset + delta));
                setHeaderOffset(currentOffset);
                ticking = false;
            });
        };

        scrollEl.addEventListener('scroll', handleScroll, { passive: true });
        // Initialize position
        handleScroll();
        return () => {
            scrollEl.removeEventListener('scroll', handleScroll);
        };
    }, [isMobile]);

    // Note: Bottom panel content (translation, note, chat) is now rendered by the
    // isolated MobileBottomPanel component in its own React root. No content useMemos needed here.

    return (
        <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--zen-reader-bg, #FDFBF7)' }}>
            {/* Header - mobile: slides with scroll (browser-chrome-like) */}
            <header
                className="h-14 flex items-center px-2 md:px-4 shrink-0 border-b relative z-10"
                style={{ 
                    borderColor: 'var(--zen-border, rgba(0,0,0,0.1))',
                    transform: isMobile ? `translateY(-${headerOffset}px)` : 'translateY(0)',
                }}
            >
                {/* Left side - back button and title (hidden in zen mode) */}
                <div className={`flex items-center min-w-0 flex-1 transition-opacity duration-300 ${zenMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    <Link href="/" className="p-2 shrink-0 transition-colors" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                        <FaChevronLeft size={16} />
                    </Link>
                    {bookTitle && (
                        <h1 className="min-w-0 flex-1 font-serif font-medium text-sm truncate pr-2" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                            {bookTitle}
                        </h1>
                    )}
                </div>

                {/* Right side - all buttons (always visible, never shrink) */}
                <div className="flex items-center gap-1 md:gap-2 shrink-0">
                    {/* Show all buttons - hidden on mobile */}
                    <div className="hidden md:flex items-center gap-2">
                        {/* Show all translations button (hidden in zen mode) */}
                        {!zenMode && (
                            <button
                                onClick={() => setShowAllTranslations(!showAllTranslations)}
                                className="p-1.5 transition-colors rounded"
                                style={{ 
                                    color: showAllTranslations ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                                    backgroundColor: showAllTranslations ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent'
                                }}
                                title="Show all translations"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 8l6 6" />
                                    <path d="M4 14l6-6 2-3" />
                                    <path d="M2 5h12" />
                                    <path d="M7 2h1" />
                                    <path d="M22 22l-5-10-5 10" />
                                    <path d="M14 18h6" />
                                </svg>
                            </button>
                        )}
                        {/* Show all comments button (hidden in zen mode) */}
                        {!zenMode && (
                            <button
                                onClick={() => setShowAllComments(!showAllComments)}
                                className="p-1.5 transition-colors rounded"
                                style={{ 
                                    color: showAllComments ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                                    backgroundColor: showAllComments ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent'
                                }}
                                title="Show all comments"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                </svg>
                            </button>
                        )}
                        {/* Show all chats button (hidden in zen mode) */}
                        {!zenMode && (
                            <button
                                onClick={() => setShowAllChats(!showAllChats)}
                                className="p-1.5 transition-colors rounded"
                                style={{ 
                                    color: showAllChats ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                                    backgroundColor: showAllChats ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent'
                                }}
                                title="Show all AI chats"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                            </button>
                        )}
                    </div>
                    {/* Show bookmark indicators button (hidden in zen mode) */}
                    {!zenMode && (
                        <button
                            onClick={() => setShowBookmarkIndicators(!showBookmarkIndicators)}
                            className="p-1.5 transition-colors rounded"
                            style={{ 
                                color: showBookmarkIndicators ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                                backgroundColor: showBookmarkIndicators ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent'
                            }}
                            title="Show bookmarks on scrollbar"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <line x1="9" y1="9" x2="15" y2="9" />
                                <line x1="9" y1="15" x2="15" y2="15" />
                            </svg>
                        </button>
                    )}
                    {/* Zen mode button - always visible */}
                    <button
                        onClick={() => setZenMode(!zenMode)}
                        className="p-2 transition-colors rounded-full"
                        style={{ 
                            color: zenMode ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                            backgroundColor: zenMode ? 'var(--zen-accent-bg, rgba(255,255,255,0.8))' : 'transparent'
                        }}
                        title="Zen mode"
                    >
                        {zenMode ? <IoMoon size={18} /> : <IoMoonOutline size={18} />}
                    </button>
                    {/* Settings button - always visible */}
                    <button
                        onClick={() => {
                            // Close mobile bottom panel so settings cleanly overlays
                            dispatchPanelClose();
                            setIsSettingsOpen(true);
                        }}
                        className="p-2 transition-colors rounded-full"
                        style={{ 
                            color: 'var(--zen-text-muted, #78716c)',
                            backgroundColor: 'transparent'
                        }}
                        title="Settings"
                    >
                        <IoSettingsOutline size={18} />
                    </button>
                </div>
            </header>

            <main
                ref={containerRef}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-smooth relative"
                style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'var(--zen-progress-bg, #e7e5e4) transparent',
                    // Move content up as header slides away so there is no empty gap
                    marginTop: isMobile ? `-${headerOffset}px` : '0px',
                }}
            >
                {/* Scrollbar indicators for bookmarks - static markers on scrollbar track (hidden in zen mode, shown on scroll if toggle is ON) */}
                {!zenMode && showBookmarkIndicators && indicatorsVisible && bookmarkPositions.length > 0 && containerRef.current && (() => {
                    const container = containerRef.current;
                    if (!container) return null;
                    
                    const containerRect = container.getBoundingClientRect();
                    const scrollHeight = container.scrollHeight;
                    const clientHeight = container.clientHeight;
                    
                    if (scrollHeight <= clientHeight) return null; // No scrollbar needed
                    
                    // Narrower scrollbar indicators
                    const scrollbarWidth = 6;
                    
                    return (
                        <div 
                            className="fixed pointer-events-none"
                            style={{
                                right: `${window.innerWidth - containerRect.right}px`,
                                top: `${containerRect.top}px`,
                                width: `${scrollbarWidth}px`,
                                height: `${clientHeight}px`,
                                zIndex: 15, // Below progress bar (z-20)
                            }}
                        >
                            {bookmarkPositions.map((pos, idx) => {
                                // Position relative to total document height (not viewport)
                                // This creates static markers on the scrollbar track
                                const indicatorTopPercent = (pos.top / scrollHeight) * 100;
                                const indicatorHeightPercent = (pos.height / scrollHeight) * 100;
                                
                                return (
                                    <div
                                        key={idx}
                                        className="absolute rounded-sm"
                                        style={{
                                            top: `${indicatorTopPercent}%`,
                                            height: `${Math.max(0.5, indicatorHeightPercent)}%`,
                                            backgroundColor: `${pos.color}99`, // 60% opacity
                                            width: '100%',
                                            right: '0',
                                            backdropFilter: 'blur(2px)',
                                            boxShadow: `0 0 2px ${pos.color}80`,
                                        }}
                                    />
                                );
                            })}
                        </div>
                    );
                })()}
                {isLoading && (
                    <div className="flex items-center justify-center h-full">
                        <div className="w-6 h-6 border-t-2 rounded-full animate-spin" style={{ borderColor: 'var(--zen-text-muted, #78716c)' }} />
                    </div>
                )}
                <div 
                    className="mx-auto py-8 transition-all duration-300"
                    style={{ 
                        maxWidth: isMobile ? '100%' : currentWidth.maxWidth,
                        paddingLeft: isMobile ? '0' : '64px',
                        paddingRight: isMobile ? '0' : '0',
                        width: '100%',
                        boxSizing: 'border-box',
                    }}
                >
                    {renderedSections}
                </div>
            </main>

            {/* Footer - hidden in zen mode */}
            {!zenMode && (
                <footer className="flex flex-col shrink-0 px-10 pt-[2px] pb-3 border-t relative z-20" style={{ borderColor: 'var(--zen-border, rgba(0,0,0,0.06))' }}>
                    <div className="w-full h-0.75 relative overflow-hidden rounded" style={{ backgroundColor: 'var(--zen-progress-bg, #e7e5e4)' }}>
                        <div
                            className="h-full absolute left-0 transition-all duration-700 ease-out"
                            style={{ width: `${progress}%`, backgroundColor: 'var(--zen-progress-fill, #78716c)' }}
                        />
                    </div>
                    <div className="mt-2 text-center font-serif text-[14px] tracking-[0.3em] uppercase opacity-70" style={{ color: 'var(--zen-text-muted, #a8a29e)' }}>
                        {progress}%
                    </div>
                </footer>
            )}

            <style jsx global>{`
                .epub-section p {
                    margin-bottom: 2em;
                    text-indent: 0 !important;
                    margin-left: 0 !important;
                    padding-left: 0 !important;
                }
                .epub-section div.paragraph {
                    margin-top: 2.5em;
                    margin-bottom: 2.5em;
                    text-indent: 0 !important;
                    margin-left: 0 !important;
                    padding-left: 0 !important;
                }
                .epub-section * {
                    text-indent: 0 !important;
                    max-width: 100%;
                }
                .epub-section img, .epub-section image {
                    max-width: 100% !important;
                    height: auto !important;
                    display: block;
                    margin: 3em auto;
                    border-radius: 4px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
                }
                .epub-section h1, .epub-section h2, .epub-section h3 {
                    margin-top: 2.5em;
                    margin-bottom: 1.5em;
                    line-height: 1.4;
                    color: var(--zen-heading, #1c1917);
                    text-align: center;
                }
                /* Hide SVG containers if they wrap images but have fixed sizes */
                .epub-section svg {
                    height: auto !important;
                    width: auto !important;
                    max-width: 100% !important;
                    overflow: visible !important;
                }
            `}</style>

                {/* Mobile Bottom Panel is now rendered in a completely isolated React root */}
                {/* See initializePanelRoot() in useEffect - no portal needed */}

            <SettingsModal 
                isOpen={isSettingsOpen} 
                onClose={() => {
                    setIsSettingsOpen(false);
                    // Refresh bookmark groups when settings modal closes
                    refreshBookmarkGroupMap();
                }}
                onSettingsChange={() => {
                    loadReaderSettings();
                    // Also refresh bookmark groups when settings change
                    refreshBookmarkGroupMap();
                }}
            />
        </div>
    );
}
