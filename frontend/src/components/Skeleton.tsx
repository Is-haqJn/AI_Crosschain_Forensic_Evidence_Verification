import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`skeleton ${className || ''}`} />
);

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className }) => (
  <div className={className}>
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="skeleton h-3 rounded mb-2 last:mb-0" />
    ))}
  </div>
);

