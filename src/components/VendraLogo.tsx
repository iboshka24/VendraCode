import React from 'react';

interface VendraLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export const VendraLogo: React.FC<VendraLogoProps> = ({ 
  size = 28, 
  className = '', 
  showText = false 
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform hover:scale-105 duration-200"
      >
        <defs>
          <linearGradient id="vendra-grad-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#14141e" />
            <stop offset="100%" stopColor="#0c0d12" />
          </linearGradient>
          <linearGradient id="vendra-grad-v" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="50%" stopColor="#38d9a9" />
            <stop offset="100%" stopColor="#4dabf7" />
          </linearGradient>
          <linearGradient id="vendra-grad-glow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#38d9a9" stopOpacity="0.8" />
          </linearGradient>
          <filter id="vendra-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Rounded Amoeba Shield */}
        <rect
          x="4"
          y="4"
          width="92"
          height="92"
          rx="26"
          fill="url(#vendra-grad-bg)"
          stroke="#262837"
          strokeWidth="2"
        />

        {/* Cyber Amoeba Glow Ring */}
        <circle
          cx="50"
          cy="50"
          r="36"
          stroke="url(#vendra-grad-glow)"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          opacity="0.4"
        />

        {/* Glowing Geometric 'V' Polygon */}
        <path
          d="M26 28 L40 28 L50 62 L60 28 L74 28 L56 76 L44 76 Z"
          fill="url(#vendra-grad-v)"
          filter="url(#vendra-blur)"
        />

        {/* Inner Amoeba Core Nodes */}
        <circle cx="50" cy="62" r="3" fill="#38d9a9" />
        <circle cx="33" cy="28" r="2.5" fill="#7c3aed" />
        <circle cx="67" cy="28" r="2.5" fill="#4dabf7" />
        <circle cx="50" cy="20" r="1.5" fill="#38d9a9" opacity="0.7" />

        {/* Neural Circuit Sync Lines */}
        <line x1="33" y1="28" x2="50" y2="20" stroke="#7c3aed" strokeWidth="1" opacity="0.6" />
        <line x1="67" y1="28" x2="50" y2="20" stroke="#4dabf7" strokeWidth="1" opacity="0.6" />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 font-bold tracking-tight text-sm text-text-primary font-mono">
            <span>Vendra<strong className="text-ok font-black">Code</strong></span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-ok/10 text-ok border border-ok/30 font-sans font-semibold">
              HARNESS
            </span>
          </div>
          <span className="text-[10px] text-text-muted font-sans leading-none">
            Amoeba Swarm IDE
          </span>
        </div>
      )}
    </div>
  );
};
