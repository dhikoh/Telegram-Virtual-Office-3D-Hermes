import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface SpecListEditorProps {
  label: string;
  items: string[];
  placeholder: string;
  onAdd: (item: string) => void;
  onRemove: (index: number) => void;
  formatItem?: (raw: string) => string;
  isTag?: boolean;
}

export const SpecListEditor: React.FC<SpecListEditorProps> = ({
  label,
  items,
  placeholder,
  onAdd,
  onRemove,
  formatItem,
  isTag = false,
}) => {
  const [inputVal, setInputVal] = useState('');

  const handleAdd = () => {
    if (!inputVal.trim()) return;
    const formatted = formatItem ? formatItem(inputVal) : inputVal.trim();
    onAdd(formatted);
    setInputVal('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-office-muted">{label}</label>

      {/* Input + Add button */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
          className="flex-1 bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-office-muted/50 focus:outline-none focus:border-office-cyan min-h-[44px]"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="px-3 rounded-xl bg-office-cyan/15 hover:bg-office-cyan/25 text-office-cyan text-xs font-semibold flex items-center gap-1 border border-office-cyan/30 min-h-[44px] min-w-[44px] justify-center"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tambah</span>
        </button>
      </div>

      {/* Items list */}
      {isTag ? (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {items.map((item, idx) => (
            <span
              key={item + idx}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-office-cyan/10 border border-office-cyan/20 text-office-cyan text-[11px] font-mono"
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="hover:text-office-danger ml-0.5 p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 mt-1">
          {items.map((item, idx) => (
            <div
              key={item + idx}
              className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 text-xs text-white min-h-[40px]"
            >
              <span className="flex-1 pr-2 leading-relaxed text-[11px]">{item}</span>
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="p-1.5 text-office-muted hover:text-office-danger shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
