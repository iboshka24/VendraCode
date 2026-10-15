import React from 'react';
interface VendraLogoProps { size?: number; className?: string; showText?: boolean; }
export const VendraLogo: React.FC<VendraLogoProps> = ({ size = 28, className = '', showText = false }) => (
  <div className={`inline-flex items-center gap-2.5 ${className}`}>
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#242b27" stroke="#46554b"/>
      <path d="M9 10L16 23L23 10M12.5 10L16 17L19.5 10" stroke="#bed2c3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    {showText && <span className="font-semibold tracking-tight">VendraCode</span>}
  </div>
);
