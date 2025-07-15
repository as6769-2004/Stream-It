'use client';

import Navbar from '@/components/Navbar';
import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase/firebase-init';
import io from 'socket.io-client';
import { FaVolumeMute, FaVolumeUp, FaExpand } from 'react-icons/fa';

const EMOJIS = ['👍', '😂', '🔥', '👏', '😍', '😮'];

function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export default function Viewer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('Connecting...');
  const [streamMeta, setStreamMeta] = useState({ title: '', description: '', sessionKey: '' });
  const [chatMessages, setChatMessages] = useState<{ user: string; text: string }[]>([]);
  const [message, setMessage] = useState('');
  const [user, setUser] = useState<any>(null);
  const [inputSessionKey, setInputSessionKey] = useState('');
  const [sessionKey, setSessionKey] = useState('');
  const [error, setError] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [chatVisible, setChatVisible] = useState(true);
  const [emojiPopups, setEmojiPopups] = useState<{ id: number; emoji: string }[]>([]);
  const [isMuted, setIsMuted] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isStreamActive, setIsStreamActive] = useState(true);

  const socketRef = useRef<any>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const popupId = useRef(0);
  let retryCount = 0;
  const MAX_RETRIES = 3;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setMobile(isMobile());
  }, []);

  // Helper to fully reset peer connection and renegotiate
  function resetPeerConnectionAndRequest() {
    // Close the old peer connection
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    // Clear the video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    // Create a new peer connection and renegotiate
    if (socketRef.current) {
      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      pc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
        }
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('signal', { candidate: event.candidate });
        }
      };
      socketRef.current.emit('ready-for-offer');
    }
    retryCount++;
    if (retryCount > MAX_RETRIES) {
      window.location.reload();
    }
  }

  useEffect(() => {
    if (!sessionKey) return;
    let socket;
    try {
      socket = io('http://localhost:8000');
    } catch (err) {
      setError('Could not connect to the server. Make sure the backend is running.');
      return;
    }
    socketRef.current = socket;
    socket.emit('role', 'viewer');
    socket.on('connect', () => setStatus('Connected'));
    socket.on('connect_error', () => setError('Could not connect to the server. Make sure the backend is running.'));
    socket.on('stream-meta', (meta) => setStreamMeta(meta));
    socket.on('viewer-count', (count: number) => setViewerCount(count));
    socket.on('chat', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });
    socket.on('emoji', (data) => {
      // Animated emoji popup
      popupId.current += 1;
      setEmojiPopups((prev) => [...prev, { id: popupId.current, emoji: data.emoji }]);
      setTimeout(() => {
        setEmojiPopups((prev) => prev.filter((p) => p.id !== popupId.current));
      }, 1000);
      setChatMessages((prev) => [...prev, { user: 'Reaction', text: data.emoji }]);
    });
    // Initial peer connection setup
    resetPeerConnectionAndRequest();
    // Listen for host's restart-stream event
    socket.on('restart-stream', () => {
      retryCount = 0;
      resetPeerConnectionAndRequest();
    });
    socket.on('signal', async (data) => {
      if (data.desc) {
        const pc = peerRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.desc));
        if (data.desc.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { desc: pc.localDescription });
        }
      } else if (data.candidate) {
        try {
          await peerRef.current?.addIceCandidate(data.candidate);
        } catch (e) {
          console.error('Error adding ICE candidate', e);
        }
      }
    });
    return () => {
      socket.disconnect();
      peerRef.current?.close();
    };
  }, [sessionKey]);

  // Buffering event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handlePlaying);
    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handlePlaying);
    };
  }, [videoRef.current]);

  // Detect stream interruptions and show black overlay if needed
  useEffect(() => {
    let checkInterval: any = null;
    let freezeStart: number | null = null;
    function checkStream() {
      const video = videoRef.current;
      if (!video) return;
      const inactive = !video.srcObject || (video.srcObject as MediaStream).getTracks().length === 0;
      if (inactive) {
        setIsStreamActive(false);
        if (freezeStart === null) freezeStart = Date.now();
        if (freezeStart && Date.now() - freezeStart > 2000) {
          resetPeerConnectionAndRequest();
          freezeStart = null;
        }
      } else {
        setIsStreamActive(true);
        freezeStart = null;
        retryCount = 0; // Reset retry count on successful stream
      }
    }
    checkInterval = setInterval(checkStream, 200);
    return () => clearInterval(checkInterval);
  }, []);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !socketRef.current) return;
    socketRef.current.emit('chat', { user: user?.displayName || 'Viewer', text: message });
    setMessage('');
  };

  const handleJoin = () => {
    if (!inputSessionKey.trim()) {
      setError('Please enter a session key.');
      return;
    }
    setSessionKey(inputSessionKey.trim().toUpperCase());
    setError('');
  };

  const handleSendEmoji = (emoji: string) => {
    if (socketRef.current) {
      socketRef.current.emit('emoji', { emoji, user: user?.displayName || 'Viewer' });
    }
  };

  const handleThemeToggle = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    document.body.style.background = theme === 'dark' ? 'white' : '#181c20';
    document.body.style.color = theme === 'dark' ? '#181c20' : '#e0e6ed';
  };

  const handleSnapshot = () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'snapshot.png';
      a.click();
    }
  };

  const handleMuteToggle = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if ((videoRef.current as any).webkitRequestFullscreen) {
        (videoRef.current as any).webkitRequestFullscreen();
      } else if ((videoRef.current as any).msRequestFullscreen) {
        (videoRef.current as any).msRequestFullscreen();
      }
    }
  };

  if (user === null) {
    return (
      <>
        <Navbar />
        <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div>Please sign in to join a stream.</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <div className="card-glass w-full max-w-5xl flex flex-col items-center">
          <div className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-blue-400 to-yellow-300 mb-6 drop-shadow-lg text-center">Stream-It - Viewer</div>
          {/* Step-by-step Instructions */}
          <div className="bg-blue-900 text-blue-200 rounded-lg p-4 mb-6 max-w-xl mx-auto text-sm">
            <div className="font-bold mb-1">How to Join a Class:</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>Ask your host for the session key.</li>
              <li>Enter the session key below and click <b>Join Class</b>.</li>
              <li>Allow access to your speakers/headphones if prompted.</li>
              <li>If you see errors, make sure the host is streaming and you entered the correct key.</li>
            </ol>
          </div>
          {/* Session Key Input & Instructions */}
          {!sessionKey && (
            <div className="flex flex-col items-center justify-center min-h-[30vh]">
              <div className="text-lg font-semibold text-blue-400 mb-2">Enter Session Key</div>
              <input
                type="text"
                value={inputSessionKey}
                onChange={e => setInputSessionKey(e.target.value.toUpperCase())}
                placeholder="e.g. 1A2B3C"
                className="text-2xl font-mono px-6 py-3 rounded-lg border-2 border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3 bg-gray-900 text-white text-center w-64"
                maxLength={8}
                autoFocus
              />
              <button
                onClick={handleJoin}
                className="btn-glow mb-2"
              >
                Join Class
              </button>
              {error && <div className="text-red-400 mt-1">{error}</div>}
              <div className="mt-2 text-gray-300 text-center max-w-md">
                Ask your host for the session key to join the live class.
              </div>
            </div>
          )}
          {/* Main Content */}
          {sessionKey && (
            <div className="flex flex-col md:flex-row gap-8 w-full justify-center items-start mt-6">
              {/* Video Section */}
              <div className="flex flex-col items-center gap-4 w-full md:w-2/3">
                <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-lg mb-2 flex items-center justify-center">
                  <video ref={videoRef} autoPlay playsInline muted={isMuted} className="w-full h-full object-contain bg-black rounded-xl" />
                </div>
                <div className="flex flex-wrap gap-4 justify-center">
                  <button className="btn-feature" onClick={handleMuteToggle}>{isMuted ? 'Unmute' : 'Mute'}</button>
                  <button className="btn-feature" onClick={handleFullscreen}>Fullscreen</button>
                </div>
              </div>
              {/* Chat/Meta */}
              <div className="flex flex-col gap-6 w-full md:w-1/3">
                {/* Status */}
                <div className="text-sm text-gray-400 mb-2">Status: <span className="font-semibold text-teal-300">{status}</span></div>
                {/* Viewer Count */}
                <div className="text-sm text-gray-400 mb-2">Viewers: <span className="font-semibold text-yellow-300">{viewerCount}</span></div>
                {/* Chat */}
                <div className="bg-[#181c2b] rounded-lg p-4 shadow-inner max-h-60 overflow-y-auto text-sm">
                  <div className="font-semibold text-teal-300 mb-2">Chat</div>
                  <div className="space-y-1 mb-2">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className="text-gray-200"><span className="font-bold text-teal-400">{msg.user}:</span> {msg.text}</div>
                    ))}
                  </div>
                  <form onSubmit={sendMessage} className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 px-3 py-2 rounded-lg bg-gray-800 text-white border border-blue-700 focus:outline-none"
                    />
                    <button type="submit" className="btn-feature">Send</button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes pop {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          80% { opacity: 1; transform: translateY(-60px) scale(1.3); }
          100% { opacity: 0; transform: translateY(-80px) scale(1.1); }
        }
      `}</style>
    </>
  );
}
