import React, { useState, useEffect, useCallback } from 'react';
import { Check, X, Delete, Ruler, CornerDownRight } from 'lucide-react';

interface DimensionEditorModalProps {
  isOpen: boolean;
  type: 'length' | 'angle';
  initialValue: number;
  wallId?: string;
  onConfirm: (newValue: number) => void;
  onClose: () => void;
}

export const DimensionEditorModal: React.FC<DimensionEditorModalProps> = ({
  isOpen,
  type,
  initialValue,
  onConfirm,
  onClose,
}) => {
  const isAngle = type === 'angle';
  const unit = isAngle ? '°' : 'm';

  // Format initial value cleanly (length: 2 decimals, angle: integer degrees)
  const formattedInitial = isAngle
    ? Math.round(initialValue).toString()
    : initialValue.toFixed(2);

  const [draft, setDraft] = useState<string>('');

  // Reset draft when modal opens or initialValue changes
  useEffect(() => {
    if (isOpen) {
      setDraft('');
    }
    try {
      window.getSelection()?.removeAllRanges();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    } catch {}
  }, [isOpen, initialValue, type]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        window.getSelection()?.removeAllRanges();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      } catch {}
    };
  }, []);

  const handleKeyPress = useCallback((char: string) => {
    setDraft((prev) => {
      if (char === '.' && isAngle) return prev; // Angles are integer degrees
      if (char === '.' && prev.includes('.')) return prev;
      if (char === '.' && prev === '') return '0.';
      if (prev.length >= 7) return prev;
      return prev + char;
    });
  }, [isAngle]);

  const handleBackspace = useCallback(() => {
    setDraft((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setDraft('');
  }, []);

  const handleCommit = useCallback(() => {
    const val = parseFloat(draft);
    if (!isNaN(val)) {
      if (!isAngle && val >= 0.05 && val <= 100) {
        onConfirm(val);
      } else if (isAngle && val >= 1 && val <= 179) {
        onConfirm(val);
      } else {
        onConfirm(initialValue);
      }
    } else {
      // If user didn't type anything, retain initial value
      onConfirm(initialValue);
    }
    onClose();
  }, [draft, isAngle, initialValue, onConfirm, onClose]);

  // Physical desktop keyboard event handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommit();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        handleClear();
        return;
      }
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeyPress(e.key);
        return;
      }
      if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        handleKeyPress('.');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCommit, handleBackspace, handleClear, handleKeyPress, onClose]);

  if (!isOpen) return null;

  const lengthPresets = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
  const anglePresets = [30, 45, 60, 90, 120, 135];
  const presets = isAngle ? anglePresets : lengthPresets;

  const displayValue = draft || formattedInitial;
  const isDisplayingDraft = Boolean(draft);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-xs bg-slate-900 border border-slate-700/80 rounded-t-3xl sm:rounded-2xl shadow-2xl p-4 flex flex-col gap-3 text-slate-100 animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {!isAngle ? (
              <>
                <Ruler className="w-4 h-4 text-sky-400" />
                <span>Wall Length • طول دیوار</span>
              </>
            ) : (
              <>
                <CornerDownRight className="w-4 h-4 text-amber-400" />
                <span>Corner Angle • زاویه گوشه</span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Display Readout Box (Pure touch readout - NO phone keyboard triggers) */}
        <div
          className={`relative flex items-center justify-between px-4 py-3 bg-slate-950 border-2 ${
            isAngle
              ? 'border-amber-500/80 ring-2 ring-amber-500/20'
              : 'border-sky-500/80 ring-2 ring-sky-500/20'
          } rounded-xl shadow-inner`}
        >
          <div className="flex items-baseline gap-1.5 flex-1 min-w-0">
            <span
              className={`text-3xl font-mono font-bold tracking-tight transition-colors ${
                isDisplayingDraft ? 'text-white' : 'text-slate-500'
              }`}
            >
              {displayValue}
            </span>
            <span
              className={`text-base font-mono font-semibold ${
                isAngle ? 'text-amber-400' : 'text-sky-400'
              }`}
            >
              {unit}
            </span>
          </div>

          {draft && (
            <button
              type="button"
              onClick={handleClear}
              className="text-[10px] font-mono uppercase px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white active:scale-95 transition-all"
            >
              Clear
            </button>
          )}
        </div>

        {/* Architectural Quick Presets */}
        <div className="grid grid-cols-6 gap-1">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setDraft(preset.toString())}
              className="py-1.5 px-0.5 text-xs font-mono font-medium rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white text-center transition-all active:scale-95"
            >
              {preset}
              <span className="text-[9px] text-slate-500">{unit}</span>
            </button>
          ))}
        </div>

        {/* CAD Touch Keypad */}
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeyPress(digit)}
              className="h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700/60 text-xl font-mono font-semibold text-slate-100 flex items-center justify-center active:scale-95 transition-all shadow-sm"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={() => handleKeyPress('.')}
            disabled={isAngle}
            className={`h-12 rounded-xl border border-slate-700/60 text-xl font-mono font-bold flex items-center justify-center active:scale-95 transition-all shadow-sm ${
              isAngle
                ? 'bg-slate-900 text-slate-600 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200'
            }`}
          >
            .
          </button>

          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700/60 text-xl font-mono font-semibold text-slate-100 flex items-center justify-center active:scale-95 transition-all shadow-sm"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Backspace"
            className="h-12 rounded-xl bg-slate-800/90 hover:bg-rose-900/40 active:bg-rose-900/60 border border-slate-700/60 text-rose-300 hover:text-rose-200 flex items-center justify-center active:scale-95 transition-all shadow-sm"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Action Controls */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <X className="w-4 h-4" /> Cancel
          </button>

          <button
            type="button"
            onClick={handleCommit}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all ${
              isAngle
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20'
            }`}
          >
            <Check className="w-4 h-4" /> Apply • ثبت
          </button>
        </div>
      </div>
    </div>
  );
};
