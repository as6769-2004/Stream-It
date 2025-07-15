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

      <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
        <div className="card-glass w-full max-w-3xl flex flex-col items-center">
          {/* Header */}
          <header className="w-full text-center mb-10 mt-6">
            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-blue-400 to-yellow-300 mb-4 drop-shadow-lg">
              Welcome to Stream-It 🎥
            </h1>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Stream-It is your next-gen platform to host, join, and explore
              real-time video streams. Upload videos, interact through chat,
              and experience seamless live events with just one click.
            </p>
          </header>

          {/* Overview Section */}
          <section className="w-full text-center mb-10">
            <h2 className="text-2xl font-semibold text-white mb-4">What you can do:</h2>
            <ul className="text-gray-300 space-y-3 text-left sm:text-center">
              <li>✅ Host live streams with ease</li>
              <li>✅ Join as a viewer in real-time</li>
              <li>✅ Upload and explore videos</li>
              <li>✅ Chat during live broadcasts</li>
              <li>✅ Secure Google login experience</li>
            </ul>
          </section>

          {/* Host/Join Buttons */}
          <div className="flex flex-col sm:flex-row gap-6 mb-10">
            <Link href="/host">
              <button className="btn-glow">Host a Class</button>
            </Link>
            <Link href="/viewer">
              <button className="btn-glow">Join a Class</button>
            </Link>
          </div>

          {/* Auth Section */}
          {!user ? (
            <button
              onClick={handleSignIn}
              className="btn-feature mt-2"
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
                className="rounded-full mx-auto mb-4 border-4 border-teal-400 shadow-lg"
              />
              <p className="text-xl font-semibold text-teal-300 mb-1">{user.displayName}</p>
              <p className="text-gray-400 mb-4">{user.email}</p>

              <Link
                href="/dashboard"
                className="btn-feature mt-2"
              >
                Go to Dashboard
              </Link>

            </div>
          )}
        </div>
      </main>
    </>
  );
}
