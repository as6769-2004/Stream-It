'use client';

import { useState, useEffect } from 'react';
import { auth, provider } from '@/firebase/firebase-init';
import { signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import Navbar from '@/components/Navbar';
import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-[#0f1117] text-white px-6 py-10 flex flex-col items-center">
        {/* Header */}
        <header className="w-full max-w-6xl text-center mb-12 mt-10">
          <h1 className="text-5xl font-bold text-teal-400 mb-4">
            Welcome to Stream-It 🎥
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Stream-It is your next-gen platform to host, join, and explore
            real-time video streams. Upload videos, interact through chat,
            and experience seamless live events with just one click.
          </p>
        </header>

        {/* Overview Section */}
        <section className="w-full max-w-4xl text-center mb-12">
          <h2 className="text-2xl font-semibold text-white mb-4">What you can do:</h2>
          <ul className="text-gray-300 space-y-3 text-left sm:text-center">
            <li>✅ Host live streams with ease</li>
            <li>✅ Join as a viewer in real-time</li>
            <li>✅ Upload and explore videos</li>
            <li>✅ Chat during live broadcasts</li>
            <li>✅ Secure Google login experience</li>
          </ul>
        </section>

        {/* Auth Section */}
        {!user ? (
          <button
            onClick={handleSignIn}
            className="mt-6 bg-teal-500 hover:bg-teal-400 text-black px-6 py-3 rounded-lg text-lg font-semibold transition"
          >
            Continue with Google
          </button>
        ) : (
          <div className="text-center mt-6">
            <Image
              src={user.photoURL}
              alt="Profile"
              width={100}
              height={100}
              className="rounded-full mx-auto mb-4"
            />
            <p className="text-xl font-semibold text-teal-300 mb-1">{user.displayName}</p>
            <p className="text-gray-400 mb-4">{user.email}</p>

            <Link
              href="/dashboard"
              className="mt-2 inline-block bg-teal-600 hover:bg-teal-500 text-black px-5 py-2 rounded-lg font-semibold transition"
            >
              Go to Dashboard
            </Link>

          </div>
        )}
      </main>
    </>
  );
}
