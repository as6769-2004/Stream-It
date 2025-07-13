import { useEffect } from 'react';
import Head from 'next/head';
import firebase from 'firebase/compat/app';

export default function Login() {
  useEffect(() => {
    const loadFirebase = async () => {
      const loadScript = (src: string) =>
        new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });

      try {
        await loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js');
        await loadScript('/firebase-init.js');

        const auth = firebase.auth();
        const provider = new firebase.auth.GoogleAuthProvider();

        document.getElementById('googleSignIn')?.addEventListener('click', () => {
          auth.signInWithPopup(provider)
            .then(() => {
              window.location.href = '/home';
            })
            .catch(console.error);
        });
      } catch (err) {
        console.error('Failed to load Firebase:', err);
      }
    };

    loadFirebase();
  }, []);

  return (
    <>
      <Head>
        <title>Login | Stream-It</title>
      </Head>
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
        <div className="bg-[#1f232b] text-white p-8 md:p-10 rounded-2xl shadow-2xl max-w-md w-full text-center space-y-6">
          <h1 className="text-3xl md:text-4xl font-bold text-teal-400">Welcome to Stream-It</h1>
          <p className="text-gray-400 text-sm">Sign in to host or view streams</p>
          <button
            id="googleSignIn"
            className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold py-3 px-6 rounded-md shadow hover:bg-gray-200 transition"
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google"
              className="w-6 h-6"
            />
            Continue with Google
          </button>
        </div>
      </div>
    </>
  );
}
