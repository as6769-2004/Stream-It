'use client';

import Navbar from '@/components/Navbar';
import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase/firebase-init';
import io from 'socket.io-client';

export default function ContinuousHost() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [user, setUser] = useState<any>(null);
  const [status, setStatus] = useState('Idle');
  const socketRef = useRef<any>(null);
  const pcsRef = useRef<{ [viewerId: string]: RTCPeerConnection }>({});
  const sessionKey = 'ABC123';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!stream) return;

    const socket = io('http://localhost:8000');
    socketRef.current = socket;
    console.log('[HOST] Socket connected:', socket.id);

    socket.emit('role', 'host');
    console.log('[HOST] Role emitted: host');
    socket.emit('set-stream-meta', {
      title: 'Continuous Stream',
      description: '',
      sessionKey,
    });
    console.log('[HOST] Stream meta set');

    // Notify viewers of host refresh
    socket.emit('host-restarted');
    console.log('[HOST] Host restarted emitted');

    socket.on('ready-for-offer', async ({ viewerId }) => {
      console.log('[HOST] ready-for-offer from viewer:', viewerId);
      if (!pcsRef.current[viewerId]) {
        const pc = new RTCPeerConnection();
        pcsRef.current[viewerId] = pc;
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
          console.log('[HOST] Track added to peer connection:', track.kind);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('[HOST] ICE candidate:', event.candidate);
            socket.emit('signal', {
              candidate: event.candidate,
              to: viewerId,
            });
          }
        };
        pc.onconnectionstatechange = () => {
          console.log('[HOST] Peer connection state:', pc.connectionState);
        };
        pc.oniceconnectionstatechange = () => {
          console.log('[HOST] ICE connection state:', pc.iceConnectionState);
        };
        pc.onicegatheringstatechange = () => {
          console.log('[HOST] ICE gathering state:', pc.iceGatheringState);
        };
        pc.onnegotiationneeded = () => {
          console.log('[HOST] Negotiation needed');
        };
        pc.ontrack = (event) => {
          console.log('[HOST] ontrack event:', event);
        };
      }

      const offer = await pcsRef.current[viewerId].createOffer();
      await pcsRef.current[viewerId].setLocalDescription(offer);
      console.log('[HOST] Offer created and setLocalDescription');
      socket.emit('signal', {
        desc: pcsRef.current[viewerId].localDescription,
        to: viewerId,
      });
      console.log('[HOST] Offer sent to viewer:', viewerId);
    });

    socket.on('signal', async ({ from, desc, candidate }) => {
      console.log('[HOST] Signal received from viewer:', from, { desc, candidate });
      if (!pcsRef.current[from]) return;
      if (desc) {
        await pcsRef.current[from].setRemoteDescription(desc);
        console.log('[HOST] setRemoteDescription from viewer:', from);
      }
      if (candidate) {
        await pcsRef.current[from].addIceCandidate(candidate);
        console.log('[HOST] addIceCandidate from viewer:', from);
      }
    });

    return () => {
      socket.disconnect();
      Object.values(pcsRef.current).forEach((pc) => pc.close());
      pcsRef.current = {};
    };
  }, [stream]);

  useEffect(() => {
    (async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        setStream(mediaStream);
        setStatus('Webcam streaming...');
      } catch (err) {
        setStatus('Could not access camera/mic');
      }
    })();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setStream(null);
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setStatus('Stopped');
    if (videoRef.current) videoRef.current.srcObject = null;
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  if (!user) return null;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#0f1117] text-white py-10 px-6 flex flex-col items-center">
        <h1 className="text-3xl text-teal-400 font-bold mb-4">Continuous Host</h1>
        <div className="mb-4">
          Session Key:{' '}
          <span className="font-mono text-lg text-teal-300">{sessionKey}</span>
        </div>
        <div className="mb-4">
          Status: <span className="text-yellow-300">{status}</span>
        </div>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="rounded-lg w-full max-w-lg aspect-video bg-black mb-4"
          style={{ maxHeight: 320 }}
        />
        <button
          onClick={stopStream}
          className="bg-red-500 hover:bg-red-400 text-white px-4 py-2 rounded-md font-semibold"
        >
          Stop
        </button>
      </main>
    </>
  );
}
