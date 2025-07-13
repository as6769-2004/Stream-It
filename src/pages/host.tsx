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
    const socket = io('http://localhost:8000');
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
    return () => {
      socket.disconnect();
      Object.values(pcsRef.current).forEach((pc) => pc.close());
      pcsRef.current = {};
    };
  }, [isStreaming, sessionKey, title, description, stream]);

  const updatePeerConnections = () => {
    Object.values(pcsRef.current).forEach((pc) => {
      const senders = pc.getSenders();

      stream?.getTracks().forEach((newTrack) => {
        const matchingSender = senders.find((s) => s.track?.kind === newTrack.kind);
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
      updatePeerConnections();
      // Notify viewers to restart stream
      if (socketRef.current) {
        socketRef.current.emit('restart-stream');
      }
    } catch (err: any) {
      alert('Could not access camera/mic: ' + (err.message || err));
      setStatus('Camera/mic access denied or unavailable.');
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
      if (stream) {
        stream.getAudioTracks().forEach((track) => (track.enabled = !prev));
      }
      return !prev;
    });
  };

  const handleVideoToggle = () => {
    setVideoEnabled((prev) => {
      if (stream) {
        stream.getVideoTracks().forEach((track) => (track.enabled = !prev));
      }
      return !prev;
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
      <div style={{ minHeight: '100vh', background: theme === 'dark' ? '#181c20' : 'white', color: theme === 'dark' ? 'white' : '#181c20', fontFamily: 'Segoe UI, Arial, sans-serif', padding: 0, margin: 0 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: '2.2rem', fontWeight: 700, color: '#4fd1c5', letterSpacing: 2, marginBottom: 24, textAlign: 'center' }}>Stream-It - Host Panel</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, width: '100%', justifyContent: 'center', alignItems: 'flex-start' }}>
            {/* Video & Controls */}
            <div style={{ flex: 2, minWidth: 340, maxWidth: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', background: theme === 'dark' ? '#23272f' : '#f4f4f4', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', padding: 24 }}>
              {/* Meta Controls */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 18, width: '100%', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                <input type="text" placeholder="Stream Title" value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1, minWidth: 120, maxWidth: 180, padding: '0.5em 1em', borderRadius: 8, border: '1px solid #4fd1c5', fontSize: 16, background: theme === 'dark' ? '#181c20' : '#fff', color: 'inherit' }} />
                <textarea placeholder="Description" rows={1} value={description} onChange={e => setDescription(e.target.value)} style={{ flex: 1, minWidth: 120, maxWidth: 180, padding: '0.5em 1em', borderRadius: 8, border: '1px solid #4fd1c5', fontSize: 16, background: theme === 'dark' ? '#181c20' : '#fff', color: 'inherit', resize: 'none' }} />
                <button onClick={handleUpdateMeta} style={{ background: '#4fd1c5', color: '#181c20', fontWeight: 600, border: 'none', borderRadius: 8, padding: '0.5em 1.2em', fontSize: 16, cursor: 'pointer', transition: 'background 0.2s' }}>Update</button>
              </div>
              {/* Controls */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
                <button onClick={() => startStream('webcam')} style={{ background: '#4fd1c5', color: '#181c20', fontWeight: 600, border: 'none', borderRadius: 8, padding: '0.5em 1.2em', fontSize: 16, cursor: 'pointer', transition: 'background 0.2s' }}>Webcam</button>
                <button onClick={() => startStream('screen')} style={{ background: '#4fd1c5', color: '#181c20', fontWeight: 600, border: 'none', borderRadius: 8, padding: '0.5em 1.2em', fontSize: 16, cursor: 'pointer', transition: 'background 0.2s' }}>Screen</button>
                <button onClick={stopStream} disabled={!isStreaming} style={{ background: isStreaming ? '#ff4d4f' : '#888', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 8, padding: '0.5em 1.2em', fontSize: 16, cursor: isStreaming ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}>Stop</button>
                <button onClick={handleAudioToggle} style={{ background: '#23272f', color: '#4fd1c5', fontWeight: 600, border: '1px solid #4fd1c5', borderRadius: 8, padding: '0.5em 1.2em', fontSize: 16, cursor: 'pointer', transition: 'background 0.2s' }}>{audioEnabled ? 'Mute Audio' : 'Unmute Audio'}</button>
                <button onClick={handleVideoToggle} style={{ background: '#23272f', color: '#4fd1c5', fontWeight: 600, border: '1px solid #4fd1c5', borderRadius: 8, padding: '0.5em 1.2em', fontSize: 16, cursor: 'pointer', transition: 'background 0.2s' }}>{videoEnabled ? 'Hide Video' : 'Show Video'}</button>
                <select value={quality} onChange={handleQualityChange} style={{ background: '#23272f', color: '#4fd1c5', fontWeight: 600, border: '1px solid #4fd1c5', borderRadius: 8, padding: '0.5em 1.2em', fontSize: 16, cursor: 'pointer' }}>
                  {QUALITIES.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                </select>
                <button onClick={handleRecord} style={{ background: isRecording ? '#ff4d4f' : '#4fd1c5', color: isRecording ? '#fff' : '#181c20', fontWeight: 600, border: 'none', borderRadius: 8, padding: '0.5em 1.2em', fontSize: 16, cursor: 'pointer', transition: 'background 0.2s' }}>{isRecording ? 'Stop Recording' : 'Start Recording'}</button>
                {recordingIndicator && <span style={{ color: '#ff4d4f', fontWeight: 'bold', marginLeft: 8 }}>● REC</span>}
              </div>
              <div style={{ fontSize: 15, color: '#4fd1c5', marginBottom: 8 }}>{status}</div>
              <div style={{ width: '100%', aspectRatio: '16 / 9', background: '#222', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 12 }}>
                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#222', borderRadius: 12, display: 'block' }} />
              </div>
              {isStreaming && sessionKey && (
                <div style={{ color: '#4fd1c5', marginTop: 8, fontSize: 17, textAlign: 'center' }}>
                  <strong>Session Key:</strong> <span style={{ fontSize: 20, letterSpacing: 2 }}>{sessionKey}</span>
                  <div style={{ fontSize: 14, color: '#ccc' }}>Share this key with viewers to let them join your stream.</div>
                </div>
              )}
            </div>
            {/* Side Panel */}
            <div style={{ flex: 1, minWidth: 280, maxWidth: 340, background: theme === 'dark' ? '#23272f' : '#f4f4f4', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', padding: 20, display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
              <div style={{ fontSize: 18, color: '#4fd1c5', marginBottom: 6 }}>Viewers: <span>{viewerCount}</span></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {EMOJIS.map((emoji) => (
                  <button key={emoji} style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', transition: 'transform 0.1s', borderRadius: 6, padding: 4, color: '#4fd1c5' }} onClick={() => handleSendEmoji(emoji)}>{emoji}</button>
                ))}
              </div>
              <div style={{ background: theme === 'dark' ? '#181c20' : '#fff', borderRadius: 8, padding: '0.5em', height: 180, overflowY: 'auto', fontSize: 15, marginBottom: 8, border: '1px solid #4fd1c5' }}>
                {chatMessages.map((msg, i) => (
                  <div key={i}><strong>{msg.user}:</strong> {msg.text}</div>
                ))}
              </div>
              <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={message} onChange={e => setMessage(e.target.value)} placeholder="Type a message..." style={{ flex: 1, padding: '0.5em', borderRadius: 6, border: '1px solid #4fd1c5', fontSize: 15, background: theme === 'dark' ? '#181c20' : '#fff', color: 'inherit' }} />
                <button type="submit" style={{ background: '#4fd1c5', color: '#181c20', fontWeight: 600, border: 'none', borderRadius: 6, padding: '0.5em 1.2em', fontSize: 15, cursor: 'pointer', transition: 'background 0.2s' }}>Send</button>
              </form>
              <button onClick={handleThemeToggle} style={{ background: 'none', color: '#4fd1c5', border: '1px solid #4fd1c5', borderRadius: 8, padding: '0.5em 1.2em', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>Toggle Theme</button>
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