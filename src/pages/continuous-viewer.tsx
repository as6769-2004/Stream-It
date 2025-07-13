import Navbar from '@/components/Navbar';
import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase/firebase-init';
import io from 'socket.io-client';

export default function ContinuousViewer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [user, setUser] = useState<any>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [status, setStatus] = useState('Connecting...');
  const sessionKey = 'ABC123'; // Replace with your session key or get from query param
  const socketRef = useRef<any>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const socket = io('http://localhost:8000');
    socketRef.current = socket;
    console.log('[VIEWER] Socket connected:', socket.id);
    socket.emit('role', 'viewer');
    console.log('[VIEWER] Role emitted: viewer');
    // Basic peer connection setup
    const pc = new RTCPeerConnection();
    peerRef.current = pc;
    pc.ontrack = (event) => {
      console.log('[VIEWER] ontrack event:', event);
      if (videoRef.current) {
        videoRef.current.srcObject = event.streams[0];
        console.log('[VIEWER] Video srcObject set');
      }
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[VIEWER] ICE candidate:', event.candidate);
        socket.emit('signal', { candidate: event.candidate });
      }
    };
    pc.onconnectionstatechange = () => {
      console.log('[VIEWER] Peer connection state:', pc.connectionState);
    };
    pc.oniceconnectionstatechange = () => {
      console.log('[VIEWER] ICE connection state:', pc.iceConnectionState);
    };
    pc.onicegatheringstatechange = () => {
      console.log('[VIEWER] ICE gathering state:', pc.iceGatheringState);
    };
    pc.onnegotiationneeded = () => {
      console.log('[VIEWER] Negotiation needed');
    };
    socket.on('signal', async (data) => {
      console.log('[VIEWER] Signal received:', data);
      if (data.desc) {
        if (!peerRef.current) return;
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.desc));
        console.log('[VIEWER] setRemoteDescription');
        if (data.desc.type === 'offer') {
          const answer = await peerRef.current.createAnswer();
          await peerRef.current.setLocalDescription(answer);
          console.log('[VIEWER] Answer created and setLocalDescription');
          socket.emit('signal', { desc: peerRef.current.localDescription });
          console.log('[VIEWER] Answer sent to host');
        }
      } else if (data.candidate) {
        try {
          await peerRef.current?.addIceCandidate(data.candidate);
          console.log('[VIEWER] addIceCandidate');
        } catch (e) {
          console.error('[VIEWER] Error adding ICE candidate', e);
        }
      }
    });
    socket.on('ready-for-offer', () => {
      console.log('[VIEWER] ready-for-offer received, emitting ready-for-offer');
      socket.emit('ready-for-offer');
    });
    return () => {
      socket.disconnect();
      peerRef.current?.close();
    };
  }, [user]);

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

  if (!user) return null;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#0f1117] text-white py-10 px-6 flex flex-col items-center">
        <h1 className="text-3xl text-teal-400 font-bold mb-4">Continuous Viewer</h1>
        <div className="mb-4">Session Key: <span className="font-mono text-lg text-teal-300">{sessionKey}</span></div>
        <div className="mb-4">Status: <span className="text-yellow-300">{status}</span></div>
        <div className="flex flex-col items-center relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isMuted}
            className="rounded-lg w-full max-w-lg aspect-video bg-black mb-4"
            style={{ maxHeight: 320 }}
          />
        </div>
        <div className="flex flex-row gap-2 mt-2 justify-center">
          <button onClick={handleMuteToggle} className="bg-teal-500 hover:bg-teal-400 text-black px-3 py-1 rounded-md font-semibold text-sm">
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button onClick={handleFullscreen} className="bg-blue-500 hover:bg-blue-400 text-white px-3 py-1 rounded-md font-semibold text-sm">
            Fullscreen
          </button>
        </div>
      </main>
    </>
  );
} 