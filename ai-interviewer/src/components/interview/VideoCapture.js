"use client";

import React, { useRef, useEffect, useState } from 'react';
import { User, CameraOff } from 'lucide-react';

const VideoCapture = ({ isActive, onFrame, analysis }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [streamError, setStreamError] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  useEffect(() => {
    let stream = null;
    let isMounted = true;
    let retryTimeout = null;

    const startCamera = async (retries = 3) => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!isMounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.warn('Play error:', e));
          setIsCameraReady(true);
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        if (err.name === 'NotReadableError' && retries > 0 && isMounted) {
          console.warn('Camera locked, retrying in 1s...');
          retryTimeout = setTimeout(() => startCamera(retries - 1), 1000);
          return;
        }
        if (isMounted) setStreamError(true);
      }
    };
    startCamera();
    return () => { 
      isMounted = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (stream) stream.getTracks().forEach(track => track.stop()); 
    };
  }, []);

  useEffect(() => {
    let intervalId;
    if (isActive && isCameraReady) {
      intervalId = setInterval(() => {
        if (videoRef.current && canvasRef.current) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video.videoWidth === 0 || video.videoHeight === 0) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          if (onFrame) onFrame(dataUrl);
        }
      }, 1000);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [isActive, isCameraReady, onFrame]);

  return (
    <div className="relative w-full h-full bg-slate-900 flex items-center justify-center">
      {/* Fallback states */}
      {streamError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <CameraOff className="w-10 h-10 mb-3 text-slate-400" />
          <p className="text-sm font-medium text-slate-300">Camera access denied</p>
          <p className="text-xs text-slate-500 mt-1">Please check your permissions</p>
        </div>
      ) : !isCameraReady ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900">
          <User className="w-10 h-10 mb-3 text-slate-500 animate-pulse" />
          <p className="text-sm font-medium text-slate-400">Initializing camera...</p>
        </div>
      ) : null}

      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-500 ${
          isCameraReady && !streamError ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default VideoCapture;
