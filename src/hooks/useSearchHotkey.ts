import { useEffect } from 'react';

type UseSearchHotkeyProps = {
  inputRef: React.RefObject<HTMLInputElement>;
  enabled?: boolean;
};

export const useSearchHotkey = ({ inputRef, enabled = true }: UseSearchHotkeyProps) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger when "/" is pressed and no input is focused
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeElement = document.activeElement;
        const isInputFocused = activeElement instanceof HTMLInputElement || 
                               activeElement instanceof HTMLTextAreaElement ||
                               activeElement?.getAttribute('contenteditable') === 'true';

        if (!isInputFocused && inputRef.current) {
          e.preventDefault();
          inputRef.current.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputRef, enabled]);
};
