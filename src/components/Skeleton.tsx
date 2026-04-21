import React from 'react';

type SkeletonVariant = 'text' | 'rect' | 'circle';

type SkeletonProps = {
  className?: string;
  variant?: SkeletonVariant;
};

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rect'
}) => {
  const baseClasses = 'animate-pulse bg-gray-200 dark:bg-gray-700';
  
  const variantClasses = {
    text: 'h-4 w-3/4 rounded',
    rect: 'rounded',
    circle: 'rounded-full'
  };
  
  return (
    <div 
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      aria-hidden="true"
    />
  );
};
