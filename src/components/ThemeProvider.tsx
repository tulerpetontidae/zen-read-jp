'use client';

import { useEffect } from 'react';
import { db } from '@/lib/db';
import { applyTheme } from './SettingsModal';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const loadTheme = async () => {
            // Try localStorage first for instant loading, then sync with database
            let theme = 'light';
            
            if (typeof window !== 'undefined') {
                try {
                    const cachedTheme = localStorage.getItem('enso-read-theme');
                    if (cachedTheme && ['light', 'sepia', 'dark'].includes(cachedTheme)) {
                        theme = cachedTheme;
                        // Apply immediately from localStorage for instant UI update
                        applyTheme(theme);
                    }
                } catch (e) {
                    // localStorage might be disabled
                }
            }
            
            // Then try to load from database (may override localStorage if different)
            try {
                const themeSetting = await db.settings.get('theme');
                if (themeSetting?.value) {
                    theme = themeSetting.value;
                    applyTheme(theme);
                    
                    // Sync localStorage with database value
                    if (typeof window !== 'undefined') {
                        try {
                            localStorage.setItem('enso-read-theme', theme);
                        } catch (e) {
                            // localStorage might be disabled
                        }
                    }
                } else if (theme === 'light') {
                    // If no theme in DB and localStorage also had none, default to light
                    applyTheme('light');
                }
            } catch (e) {
                console.error('Failed to load theme from database:', e);
                // Keep using localStorage/default theme
                applyTheme(theme);
            }
        };
        loadTheme();
    }, []);

    return <>{children}</>;
}

