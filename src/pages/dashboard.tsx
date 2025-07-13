'use client';

import { useEffect, useState, useCallback } from 'react';
import { auth } from '@/firebase/firebase-init';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/router';
import Navbar from '@/components/Navbar';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import Image from 'next/image';
import Link from 'next/link';

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [gDriveConnected, setGDriveConnected] = useState(false);
  const router = useRouter();

  const db = getFirestore();
  const storage = getStorage();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        fetchUserVideos(firebaseUser.uid);
      } else {
        router.push('/');
      }
    });
    return () => unsubscribe();
  }, []);

  // Check for Google Drive connection on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setGDriveConnected(!!sessionStorage.getItem('gdrive_connected'));
    }
  }, []);

  // Handler to start OAuth flow
  const handleMountGoogleDrive = useCallback(() => {
    window.location.href = '/api/drive/oauth';
  }, []);

  // Listen for OAuth callback (for demo, use sessionStorage flag)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('gdrive') === 'success') {
        sessionStorage.setItem('gdrive_connected', '1');
        setGDriveConnected(true);
        // Remove param from URL
        url.searchParams.delete('gdrive');
        window.history.replaceState({}, document.title, url.pathname);
      }
    }
  }, []);

  const fetchUserVideos = async (uid: string) => {
    const q = query(collection(db, 'videos'), where('userId', '==', uid));
    const snapshot = await getDocs(q);
    const userVideos = snapshot.docs.map((doc) => doc.data());
    setVideos(userVideos);
  };

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const storageRef = ref(storage, `videos/${user.uid}/${file.name}`);
      await uploadBytes(storageRef, file);
      const videoUrl = await getDownloadURL(storageRef);
      await addDoc(collection(db, 'videos'), {
        userId: user.uid,
        fileName: file.name,
        videoUrl,
        createdAt: serverTimestamp(),
      });
      setFile(null);
      fetchUserVideos(user.uid);
      alert('Upload successful!');
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#0f1117] text-white py-10 px-6 flex flex-col items-center">
        <h1 className="text-4xl text-teal-400 font-bold mb-6">Dashboard</h1>

        {/* Upload Section */}
        <div className="bg-[#1c1f2b] p-6 rounded-xl border border-teal-500 max-w-xl w-full mb-8">
          <p className="mb-3 font-semibold">Upload a new video:</p>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-white mb-3"
          />
          <button
            disabled={uploading}
            onClick={handleUpload}
            className="bg-teal-500 hover:bg-teal-400 text-black px-4 py-2 rounded-md font-semibold transition disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload Video'}
          </button>
        </div>

        {/* Google Drive Mount Section */}
        <div className="bg-[#1c1f2b] p-6 rounded-xl border border-blue-500 max-w-xl w-full mb-8 flex flex-col items-center">
          <button
            onClick={handleMountGoogleDrive}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md font-semibold mb-2"
          >
            {gDriveConnected ? 'Remount Google Drive (Switch Account)' : 'Mount Google Drive'}
          </button>
          {gDriveConnected && (
            <span className="text-green-400 font-semibold">Google Drive connected!</span>
          )}
        </div>

        {/* Join & Host */}
        <div className="flex gap-6 mb-10">
          <Link
            href="/viewer"
            className="bg-blue-500 hover:bg-blue-400 text-white px-5 py-2 rounded-lg"
          >
            Join Stream
          </Link>
          <Link
            href="/host"
            className="bg-purple-500 hover:bg-purple-400 text-white px-5 py-2 rounded-lg"
          >
            Host Stream
          </Link>
        </div>

        {/* Video List */}
        <section className="w-full max-w-4xl">
          <h2 className="text-2xl font-semibold mb-4">Your Uploaded Videos</h2>
          {videos.length === 0 ? (
            <p className="text-gray-400">No videos uploaded yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video, index) => (
                <div
                  key={index}
                  className="bg-[#1a1d29] p-3 rounded-lg border border-teal-700"
                >
                  <video
                    controls
                    src={video.videoUrl}
                    className="rounded-md w-full mb-2"
                  />
                  <p className="text-sm text-gray-300 truncate">{video.fileName}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
