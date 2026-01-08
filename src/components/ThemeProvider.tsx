'use client';

import { useEffect } from 'react';
import { db } from '@/lib/db';
import { applyTheme } from './SettingsModal';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const themeSetting = await db.settings.get('theme');
                const theme = themeSetting?.value || 'light';
                applyTheme(theme);
                
                // Sync with localStorage if it's different (in case user changed theme in another tab)
                if (typeof window !== 'undefined') {
                    try {
                        const cachedTheme = localStorage.getItem('enso-read-theme');
                        if (cachedTheme !== theme) {
                            localStorage.setItem('enso-read-theme', theme);
                        }
                    } catch (e) {
                        // localStorage might be disabled
                    }
                }
            } catch (e) {
                console.error('Failed to load theme:', e);
                applyTheme('light');
            }
        };
        loadTheme();
    }, []);

    return <>{children}</>;
}

