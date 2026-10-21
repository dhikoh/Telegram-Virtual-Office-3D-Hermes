import React from 'react';
import { AVATAR_SYMBOLS } from '@hermes-office/shared';

interface AvatarSymbolPickerProps {
  value: string;
  onChange: (symbol: string) => void;
  className?: string;
}

/**
 * Pemilih simbol avatar agen berupa grid tombol yang mudah diklik/disentuh.
 * Menghilangkan keharusan mengetik emoji secara manual di keyboard ponsel.
 */
export const AvatarSymbolPicker: React.FC<AvatarSymbolPickerProps> = ({
  value,
  onChange,
  className = '',
}) => {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`} data-testid="avatar-symbol-picker">
      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-office-inset/60 border border-office-border">
        {AVATAR_SYMBOLS.map((sym) => {
          const selected = value === sym;
          return (
            <button
              key={sym}
              type="button"
              aria-label={`Pilih avatar ${sym}`}
              aria-pressed={selected}
              onClick={() => onChange(sym)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-transform active:scale-95 border ${
                selected
                  ? 'border-office-accent bg-office-accent/20 scale-105 shadow-sm ring-1 ring-office-accent/50'
                  : 'border-office-border/60 hover:border-office-accent/40 bg-office-surface/50'
              }`}
            >
              {sym}
            </button>
          );
        })}
      </div>
    </div>
  );
};
