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
    const socket = io('http://192.168.142.63:8000');
    socketRef.current = socket;
    socket.emit('role', 'viewer');
    socket.on('connect', () => setStatus('Connected'));
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

  if (!sessionKey) {
    return (
      <>
        <Navbar />
        <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: '#4fd1c5', marginBottom: '1rem' }}>Enter Session Key to Join Stream</h2>
          <input
            type="text"
            value={inputSessionKey}
            onChange={e => setInputSessionKey(e.target.value)}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', outline: 'none', fontSize: '1.2rem', marginBottom: '1rem', textAlign: 'center', letterSpacing: '2px' }}
            placeholder="Session Key"
            maxLength={8}
          />
          <button
            onClick={handleJoin}
            style={{ background: '#4fd1c5', color: '#0f1117', fontWeight: 'bold', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
          >
            Join
          </button>
          {error && <div style={{ color: 'red', marginTop: '1rem' }}>{error}</div>}
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="branding mt-6 text-2xl font-bold text-teal-400 text-center">StreamX</div>
      <div className="main flex flex-col md:flex-row w-full max-w-5xl mx-auto bg-[#181c20] rounded-2xl shadow-lg overflow-hidden mt-4">
        {/* Video Section */}
        <div className="flex-1 flex flex-col items-center p-4 relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isMuted}
            className="rounded-lg w-full max-w-lg aspect-video bg-black"
            style={{ maxHeight: 320 }}
          />
          {/* Black overlay if stream is lost or black frame */}
          {!isStreamActive && (
            <div className="absolute top-0 left-0 w-full h-full bg-black opacity-100 z-20 flex items-center justify-center">
              <span className="text-gray-400">No video stream</span>
            </div>
          )}
          {/* Buffering Spinner */}
          {isBuffering && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="w-12 h-12 border-4 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
          <div className="flex flex-row gap-2 mt-2 justify-center">
            <button onClick={handleMuteToggle} className="bg-teal-500 hover:bg-teal-400 text-black px-3 py-1 rounded-md font-semibold text-sm">
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={handleFullscreen} className="bg-blue-500 hover:bg-blue-400 text-white px-3 py-1 rounded-md font-semibold text-sm">
              Fullscreen
            </button>
          </div>
        </div>
        {/* Side Panel */}
        <div className="flex-1 flex flex-col p-4 gap-4 min-w-[260px] max-w-md">
          <div className="text-lg text-teal-400 font-semibold mb-2">Join Stream</div>
          {!sessionKey && (
            <div className="flex flex-col gap-2 items-center">
              <input
                type="text"
                value={inputSessionKey}
                onChange={e => setInputSessionKey(e.target.value)}
                className="px-3 py-2 rounded-lg border border-teal-400 text-black text-center text-lg w-full"
                placeholder="Session Key"
                maxLength={8}
              />
              <button
                onClick={handleJoin}
                className="bg-teal-500 hover:bg-teal-400 text-black px-4 py-2 rounded-md font-semibold w-full"
              >
                Join
              </button>
              {error && <div className="text-red-400 text-sm mt-1">{error}</div>}
            </div>
          )}
          {sessionKey && (
            <>
              <div className="text-teal-300 font-semibold mb-1">Session: {streamMeta.title}</div>
              <div className="text-gray-400 mb-2">{streamMeta.description}</div>
              <div className="text-gray-400 mb-2">Viewers: {viewerCount}</div>
              <div className="flex flex-row gap-2 mb-2">
                {EMOJIS.map((emoji) => (
                  <button key={emoji} className="text-2xl" onClick={() => handleSendEmoji(emoji)}>{emoji}</button>
                ))}
              </div>
              <div className="bg-[#23272f] rounded-lg p-2 h-32 overflow-y-auto text-sm mb-2">
                {chatMessages.map((msg, i) => (
                  <div key={i}><strong>{msg.user}:</strong> {msg.text}</div>
                ))}
              </div>
              <form onSubmit={sendMessage} className="flex flex-row gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  className="flex-1 px-2 py-1 rounded-lg border border-teal-400 text-black"
                  placeholder="Type a message..."
                />
                <button type="submit" className="bg-teal-500 hover:bg-teal-400 text-black px-3 py-1 rounded-md font-semibold">Send</button>
              </form>
              <button onClick={handleThemeToggle} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-md font-semibold mt-2">Toggle Theme</button>
            </>
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
