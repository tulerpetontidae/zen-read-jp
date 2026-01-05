'use client';

import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { FaBookOpen, FaCloudUploadAlt } from 'react-icons/fa';

export default function FileUpload() {
    const router = useRouter();
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const processFile = async (file: File) => {
        if (!file.name.endsWith('.epub')) {
            alert('Please upload a valid .epub file');
            return;
        }

        setIsProcessing(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const id = uuidv4();

            await db.books.add({
                id,
                title: file.name.replace('.epub', ''),
                data: arrayBuffer,
                addedAt: Date.now(),
            });

            router.push(`/reader/${id}`);
        } catch (error) {
            console.error('Error saving book:', error);
            alert('Failed to save book to library.');
            setIsProcessing(false);
        }
    };

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await processFile(e.dataTransfer.files[0]);
        }
    }, []);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await processFile(e.target.files[0]);
        }
    };

    return (
        <div
            className={clsx(
                "w-full max-w-2xl p-16 rounded-3xl transition-all duration-500 flex flex-col items-center justify-center gap-8 cursor-pointer relative overflow-hidden group",
                isDragging
                    ? "bg-stone-100 dark:bg-stone-800 scale-[1.02]"
                    : "bg-white dark:bg-stone-900 shadow-2xl shadow-stone-200/50 dark:shadow-black/20 hover:shadow-3xl hover:shadow-stone-300/50 dark:hover:shadow-black/40",
                isProcessing && "opacity-80 pointer-events-none"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload')?.click()}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-rose-50/50 to-transparent dark:from-rose-900/10 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

            <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".epub"
                onChange={handleFileSelect}
            />

            <div className={clsx(
                "relative p-8 rounded-full transition-all duration-500",
                isDragging
                    ? "bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-100 scale-110"
                    : "bg-stone-50 dark:bg-stone-800 text-stone-400 group-hover:text-rose-500 group-hover:bg-rose-50 dark:group-hover:bg-rose-900/20"
            )}>
                {isProcessing ? (
                    <FaBookOpen className="text-5xl animate-bounce" />
                ) : (
                    <FaCloudUploadAlt className="text-5xl" />
                )}
            </div>

            <div className="text-center space-y-3 relative z-10">
                <h3 className="text-3xl font-serif font-light text-stone-800 dark:text-stone-100 tracking-wide">
                    {isProcessing ? 'Opening Book...' : 'Library Import'}
                </h3>
                <p className="text-stone-400 dark:text-stone-500 text-base font-light tracking-wide">
                    Drop your EPUB file here to begin your journey
                </p>
            </div>

            <div className={clsx(
                "h-1 w-24 rounded-full transition-all duration-700",
                isDragging ? "bg-stone-400 w-32" : "bg-stone-100 dark:bg-stone-800 group-hover:bg-rose-200 dark:group-hover:bg-rose-800"
            )} />
        </div>
    );
}
