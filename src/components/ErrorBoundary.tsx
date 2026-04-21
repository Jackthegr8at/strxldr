import React, { Component } from 'react';
import { useToast } from './Toast';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

class ErrorBoundaryInner extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
    // Emit toast via global error handler if available
    if ((window as any).__emitErrorToast) {
      (window as any).__emitErrorToast(error.message);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Something went wrong</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ErrorBoundary: React.FC<ErrorBoundaryProps> = (props) => {
  const { addToast } = useToast();

  // Set up global error handler for ErrorBoundary
  React.useEffect(() => {
    (window as any).__emitErrorToast = (message: string) => {
      addToast(message, 'error');
    };
  }, [addToast]);

  return <ErrorBoundaryInner {...props} />;
};
