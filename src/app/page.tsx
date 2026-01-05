'use client';

import FileUpload from "@/components/FileUpload";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import Link from "next/link";
import { FaBook } from "react-icons/fa";
import { RiDeleteBinLine } from "react-icons/ri";
import { IoSettingsOutline } from "react-icons/io5";

export default function Home() {
  const books = useLiveQuery(() => db.books.toArray());

  const deleteBook = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this book?")) {
      await db.books.delete(id);
      await db.progress.delete(id);
    }
  };

  return (
    <div className="min-h-screen bg-[#Fdfbf7] dark:bg-[#0a0a0a] text-stone-800 dark:text-stone-200 font-sans selection:bg-rose-200 dark:selection:bg-rose-900 overflow-x-hidden relative">

      {/* Settings Button */}
      <Link 
        href="/settings"
        className="fixed top-6 right-6 z-20 p-3 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 bg-white/50 dark:bg-white/5 backdrop-blur-sm rounded-full border border-white/30 dark:border-white/10 shadow-sm hover:shadow-md transition-all duration-300"
        title="Settings"
      >
        <IoSettingsOutline size={20} />
      </Link>

      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-rose-100/30 dark:bg-rose-900/10 rounded-full blur-3xl opacity-60 animate-pulse duration-[10s]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-emerald-100/30 dark:bg-emerald-900/10 rounded-full blur-3xl opacity-60 animate-pulse duration-[12s]" />
      </div>

      <main className="container mx-auto px-6 py-24 flex flex-col items-center relative z-10">

        {/* Header */}
        <header className="mb-24 text-center space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-block mb-4 p-3 bg-white/50 dark:bg-white/5 backdrop-blur-md rounded-2xl border border-white/20 shadow-sm">
            <span className="text-2xl">🇯🇵</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-serif font-thin text-stone-900 dark:text-stone-50 tracking-tighter">
            ZenRead
          </h1>
          <p className="text-xl md:text-2xl text-stone-500 dark:text-stone-400 font-light max-w-lg mx-auto leading-relaxed tracking-wide">
            Master Japanese through <span className="text-stone-800 dark:text-stone-200 font-normal">immersion</span>.
          </p>
        </header>

        {/* Upload Section */}
        <section className="w-full flex justify-center mb-32 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
          <FileUpload />
        </section>

        {/* Library Section */}
        {books && books.length > 0 && (
          <section className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-300">
            <div className="flex items-center justify-between mb-12 px-2">
              <h2 className="text-3xl font-serif font-light text-stone-800 dark:text-stone-200 tracking-wide">
                Library
              </h2>
              <span className="text-sm font-light text-stone-400 uppercase tracking-widest">{books.length} Books</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {books?.map((book) => (
                <Link
                  href={`/reader/${book.id}`}
                  key={book.id}
                  className="group relative flex flex-col aspect-[3/4] p-8 bg-white/40 dark:bg-white/5 backdrop-blur-sm rounded-3xl border border-white/40 dark:border-white/10 shadow-lg hover:shadow-2xl hover:shadow-stone-200/50 dark:hover:shadow-black/50 transition-all duration-500 hover:-translate-y-2 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-transparent to-transparent dark:from-black/80 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  {/* Decorative Cover Placeholder */}
                  <div className="flex-1 flex items-center justify-center mb-6">
                    <div className="w-24 h-36 bg-stone-100 dark:bg-stone-800 shadow-inner rounded-r-lg border-l-4 border-stone-300 dark:border-stone-600 flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
                      <span className="font-serif text-4xl text-stone-300 dark:text-stone-600 opacity-50">本</span>
                    </div>
                  </div>

                  <div className="relative z-10 space-y-2 text-center">
                    <h3 className="font-serif font-medium text-xl leading-snug text-stone-800 dark:text-stone-100 line-clamp-2 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                      {book.title}
                    </h3>
                    <p className="text-xs text-stone-400 font-light tracking-wider">
                      {new Date(book.addedAt).toLocaleDateString()}
                    </p>
                  </div>

                  <button
                    onClick={(e) => deleteBook(e, book.id)}
                    className="absolute top-4 right-4 p-3 text-stone-300 hover:text-rose-500 bg-transparent hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-full transition-all opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0"
                    title="Delete book"
                  >
                    <RiDeleteBinLine size={18} />
                  </button>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
