'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, provider } from '@/firebase/firebase-init';
import Link from 'next/link';
import Image from 'next/image';

export default function Navbar() {
  const [user, setUser] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
      console.error('Sign in failed', error);
    }
  };

  const handleSignOut = () => {
    signOut(auth);
    setUser(null);
  };

  return (
    <nav className="card-glass border-b border-teal-700 text-white px-6 py-4 flex items-center justify-between relative shadow-lg backdrop-blur-md">
      {/* Left: Logo */}
      <Link href="/" className="text-2xl font-extrabold bg-gradient-to-r from-teal-400 via-blue-400 to-yellow-300 bg-clip-text text-transparent drop-shadow-lg">
        Stream-It
      </Link>

      {/* Center: Nav Links */}
      <div className="hidden md:flex gap-6 font-medium text-gray-300">
        <Link href="/host" className="hover:text-white">Host</Link>
        <Link href="/viewer" className="hover:text-white">Join</Link>
        <Link href="/simpletube" className="hover:text-white">Explore</Link>
      </div>

      {/* Right: Auth area */}
      <div className="flex items-center gap-4">
        {!user ? (
          <button
            onClick={handleSignIn}
            className="btn-feature"
          >
            Signin
          </button>
        ) : (
          <>
            <Image
              src={user.photoURL}
              alt="Profile"
              width={40}
              height={40}
              className="rounded-full border-2 border-teal-500 cursor-pointer shadow-md"
              onClick={() => setMenuOpen(!menuOpen)}
            />
            {/* Optional Dropdown */}
            {menuOpen && (
              <div className="absolute right-6 top-16 bg-[#1a1c23] border border-teal-600 rounded-lg shadow-lg p-3 z-20 w-40">
                <p className="text-sm text-gray-300 mb-2 text-center">{user.displayName}</p>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left text-red-400 hover:bg-red-500/20 px-3 py-1 rounded-md"
                >
                  Logout
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </nav>
  );
}
