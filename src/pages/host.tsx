'use client';

import Navbar from '@/components/Navbar';
import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase/firebase-init';
import io from 'socket.io-client';

function generateSessionKey() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

const EMOJIS = ['👍', '😂', '🔥', '👏', '😍', '😮'];
const QUALITIES = [
  { label: 'Default', value: 'default' },
  { label: 'HD', value: 'hd' },
  { label: 'SD', value: 'sd' },
];

function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Helper to create a black video frame stream
function createBlackFrameStream(width = 640, height = 360) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);
  }
  // Capture the canvas as a MediaStream
  return canvas.captureStream(15); // 15 FPS
}

export default function Host() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sessionKey, setSessionKey] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [user, setUser] = useState<any>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<{ user: string; text: string }[]>([]);
  const [message, setMessage] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [quality, setQuality] = useState('default');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordingIndicator, setRecordingIndicator] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [mobile, setMobile] = useState(false);
  const [mp4DownloadUrl, setMp4DownloadUrl] = useState<string | null>(null);

  const socketRef = useRef<any>(null);
  const pcsRef = useRef<{ [viewerId: string]: RTCPeerConnection }>({});
  const recorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  // Restore session key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('host_session_key');
    if (savedKey) {
      setSessionKey(savedKey);
    }
  }, []);

  useEffect(() => {
    setMobile(isMobile());
  }, []);

  useEffect(() => {
    if (isStreaming && !sessionKey) {
      const newKey = generateSessionKey();
      setSessionKey(newKey);
      localStorage.setItem('host_session_key', newKey);
    }
    // If sessionKey is set (from restore or new), save it
    if (isStreaming && sessionKey) {
      localStorage.setItem('host_session_key', sessionKey);
    }
  }, [isStreaming, sessionKey]);

  useEffect(() => {
    if (!isStreaming || !sessionKey) return;
    let socket;
    try {
      socket = io('http://localhost:8000');
    } catch (err) {
      setStatus('Could not connect to the server. Make sure the backend is running.');
      return;
    }
    socketRef.current = socket;
    socket.emit('role', 'host');
    socket.emit('set-stream-meta', { title, description, sessionKey });

    socket.on('viewer-count', (count: number) => setViewerCount(count));
    socket.on('chat', (msg: any) => setChatMessages((prev) => [...prev, msg]));
    socket.on('emoji', (data: any) => {
      setChatMessages((prev) => [...prev, { user: 'Reaction', text: data.emoji }]);
    });
    socket.on('stream-meta', (meta: any) => {
      setTitle(meta.title);
      setDescription(meta.description);
    });
    socket.on('ready-for-offer', async ({ viewerId }) => {
      if (!pcsRef.current[viewerId]) {
        const pc = new RTCPeerConnection();
        pcsRef.current[viewerId] = pc;
        if (stream) {
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        }
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('signal', { candidate: event.candidate, to: viewerId });
          }
        };
        pc.onconnectionstatechange = () => {
          setStatus('Connection with viewer: ' + pc.connectionState);
        };
      }
      const offer = await pcsRef.current[viewerId].createOffer();
      await pcsRef.current[viewerId].setLocalDescription(offer);
      socket.emit('signal', { desc: pcsRef.current[viewerId].localDescription, to: viewerId });
    });
    socket.on('signal', async (data: any) => {
      const { from, desc, candidate } = data;
      if (!pcsRef.current[from]) return;
      if (desc) await pcsRef.current[from].setRemoteDescription(desc);
      if (candidate) await pcsRef.current[from].addIceCandidate(candidate);
    });
    socket.on('connect_error', () => setStatus('Could not connect to the server. Make sure the backend is running.'));
    return () => {
      socket.disconnect();
      Object.values(pcsRef.current).forEach((pc) => pc.close());
      pcsRef.current = {};
    };
  }, [isStreaming, sessionKey, title, description, stream]);

  // Helper to update all peer connections with the latest stream tracks
  const updatePeerConnections = () => {
    Object.values(pcsRef.current).forEach((pc) => {
      const senders = pc.getSenders();
      // Replace or add tracks for each kind
      stream?.getTracks().forEach((newTrack) => {
        const matchingSender = senders.find((s) => s.track && s.track.kind === newTrack.kind);
        if (matchingSender) {
          matchingSender.replaceTrack(newTrack);
        } else {
          pc.addTrack(newTrack, stream);
        }
      });
    });
  };

  const startStream = async (source: 'webcam' | 'screen') => {
    if (stream) {
      // Before stopping the old stream, show a black frame to viewers
      const blackStream = createBlackFrameStream(
        videoRef.current?.videoWidth || 640,
        videoRef.current?.videoHeight || 360
      );
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      stream?.getTracks().forEach((track) => track.stop());
    }
    let constraints: any = { video: true, audio: true };
    if (!mobile && source === 'webcam') {
      if (quality === 'hd') constraints.video = { width: { ideal: 1280 }, height: { ideal: 720 } };
      if (quality === 'sd') constraints.video = { width: { ideal: 640 }, height: { ideal: 360 } };
    }
    let mediaStream: MediaStream;
    try {
      if (source === 'webcam') {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStatus('Webcam streaming...');
      } else {
        if (mobile || !navigator.mediaDevices.getDisplayMedia) {
          alert('Screen sharing is not supported on mobile devices.');
          return;
        }
        mediaStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
        setStatus('Screen casting...');
      }
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
      setIsStreaming(true);
      setAudioEnabled(true);
      setVideoEnabled(true);
      // Update all peer connections with the new stream
      setTimeout(updatePeerConnections, 100);
      // Notify viewers to restart stream
      if (socketRef.current) {
        socketRef.current.emit('restart-stream');
      }
    } catch (err) {
      setStatus('Could not access camera/mic');
    }
  };

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setStatus('Paused / Will Resume Soon');
    setIsStreaming(false);
    setSessionKey('');
    localStorage.removeItem('host_session_key'); // Clear session key on stop
    if (videoRef.current) videoRef.current.srcObject = null;
    Object.values(pcsRef.current).forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        if (sender.track) pc.removeTrack(sender);
      });
    });
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !socketRef.current) return;
    socketRef.current.emit('chat', { user: user?.displayName || 'Host', text: message });
    setMessage('');
  };

  const handleSendEmoji = (emoji: string) => {
    if (socketRef.current) {
      socketRef.current.emit('emoji', { emoji });
    }
  };

  const handleUpdateMeta = () => {
    if (socketRef.current) {
      socketRef.current.emit('set-stream-meta', { title, description, sessionKey });
    }
  };

  const handleThemeToggle = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    document.body.style.background = theme === 'dark' ? 'white' : '#181c20';
    document.body.style.color = theme === 'dark' ? '#181c20' : '#e0e6ed';
  };

  const handleAudioToggle = () => {
    setAudioEnabled((prev) => {
      const newVal = !prev;
      stream?.getAudioTracks().forEach((track) => (track.enabled = newVal));
      updatePeerConnections();
      return newVal;
    });
  };

  const handleVideoToggle = () => {
    setVideoEnabled((prev) => {
      const newVal = !prev;
      stream?.getVideoTracks().forEach((track) => (track.enabled = newVal));
      updatePeerConnections();
      return newVal;
    });
  };

  const handleQualityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setQuality(e.target.value);
    if (isStreaming && stream) {
      // Restart stream with new quality
      startStream('webcam');
    }
  };

  const handleRecord = () => {
    if (!isRecording && stream) {
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      setRecordedChunks([]);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) setRecordedChunks((prev) => [...prev, e.data]);
      };
      recorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        // Upload to server for conversion
        setStatus('Uploading and converting to MP4...');
        const formData = new FormData();
        formData.append('video', blob, 'recording.webm');
        try {
          const res = await fetch('http://localhost:8000/convert', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json();
          setMp4DownloadUrl(data.mp4Url);
          setStatus('Recording ready for download as MP4!');
        } catch (err) {
          setStatus('Failed to convert recording.');
        }
      };
      recorder.start();
      setIsRecording(true);
      setRecordingIndicator(true);
    } else if (isRecording && recorderRef.current) {
      recorderRef.current.stop();
      setIsRecording(false);
      setRecordingIndicator(false);
    }
  };

  useEffect(() => {
    // When stream changes, update peer connections
    if (stream) {
      updatePeerConnections();
    }
  }, [stream]);

  if (user === null) {
    return (
      <>
        <Navbar />
        <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div>Please sign in to host a stream.</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <div className="card-glass w-full max-w-5xl flex flex-col items-center">
          <div className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-blue-400 to-yellow-300 mb-6 drop-shadow-lg text-center">Stream-It - Host Panel</div>
          {/* Step-by-step Instructions */}
          <div className="bg-teal-900 text-teal-200 rounded-lg p-4 mb-6 max-w-xl mx-auto text-sm">
            <div className="font-bold mb-1">How to Host a Class:</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>Click <b>Start Webcam</b> or <b>Start Screen Cast</b> to begin your class.</li>
              <li>Copy the session key below and share it with your students.</li>
              <li>Keep this page open while hosting. If you stop streaming, students will be disconnected.</li>
              <li>If you see errors, make sure your camera/mic are allowed and the backend server is running.</li>
            </ol>
          </div>
          {/* Main Controls */}
          <div className="flex flex-col md:flex-row gap-8 w-full justify-center items-start">
            {/* Video & Controls */}
            <div className="flex flex-col items-center gap-4 w-full md:w-2/3">
              <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-lg mb-2 flex items-center justify-center">
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-contain bg-black rounded-xl" />
              </div>
              <div className="flex flex-wrap gap-4 justify-center">
                {!isStreaming ? (
                  <>
                    <button className="btn-glow" onClick={() => startStream('webcam')}>Start Webcam</button>
                    <button className="btn-glow" onClick={() => startStream('screen')}>Start Screen Cast</button>
                  </>
                ) : (
                  <button className="btn-glow" onClick={stopStream}>Stop Stream</button>
                )}
                <button className="btn-feature" onClick={handleAudioToggle}>{audioEnabled ? 'Mute Audio' : 'Unmute Audio'}</button>
                <button className="btn-feature" onClick={handleVideoToggle}>{videoEnabled ? 'Hide Video' : 'Show Video'}</button>
                <button className="btn-feature" onClick={handleRecord}>{isRecording ? 'Stop Recording' : 'Record'}</button>
              </div>
            </div>
            {/* Chat/Meta/Session Key */}
            <div className="flex flex-col gap-6 w-full md:w-1/3">
              {/* Session Key Display & Instructions */}
              {isStreaming && sessionKey && (
                <div className="mb-6 flex flex-col items-center">
                  <div className="text-lg font-semibold text-teal-400 mb-2">Session Key:</div>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-mono bg-gray-900 px-4 py-2 rounded-lg border border-teal-500 select-all">{sessionKey}</span>
                    <button
                      className="ml-2 px-3 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded transition text-sm"
                      onClick={() => {navigator.clipboard.writeText(sessionKey)}}
                    >
                      Copy
                    </button>
                  </div>
                  <div className="mt-2 text-gray-300 text-center max-w-md">
                    Share this session key with your students. They must enter it on the Join page to watch your class live.
                  </div>
                </div>
              )}
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
                <form onSubmit={handleSendMessage} className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 rounded-lg bg-gray-800 text-white border border-teal-700 focus:outline-none"
                  />
                  <button type="submit" className="btn-feature">Send</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
      {mp4DownloadUrl && (
        <a href={mp4DownloadUrl} download className="bg-green-500 text-white px-4 py-2 rounded-md mt-2 inline-block">
          Download MP4
        </a>
      )}
    </>
  );
}