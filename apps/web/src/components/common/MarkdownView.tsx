/**
 * Lightweight, Safe Markdown Viewer Component
 * Renders task results, soul summaries, and formatted agent responses cleanly.
 */

import React from 'react';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className = '' }) => {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeLanguage = '';

  lines.forEach((line, index) => {
    // Check for fenced code block ```
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        elements.push(
          <div key={`code-${index}`} className="my-2 rounded-lg bg-black/60 border border-white/10 p-3 overflow-x-auto">
            {codeLanguage && (
              <div className="text-[10px] text-office-cyan font-mono mb-1">{codeLanguage}</div>
            )}
            <pre className="font-mono text-xs text-office-cyan/90 leading-relaxed whitespace-pre">
              {codeBlockContent.join('\n')}
            </pre>
          </div>
        );
        inCodeBlock = false;
        codeBlockContent = [];
        codeLanguage = '';
      } else {
        // Start of code block
        inCodeBlock = true;
        codeLanguage = line.trim().replace(/^```/, '');
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      return;
    }

    // Headers
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={index} className="text-base font-bold text-white mt-3 mb-1.5 border-b border-white/10 pb-1">
          {formatInline(line.substring(2))}
        </h1>
      );
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={index} className="text-sm font-bold text-office-cyan mt-2.5 mb-1">
          {formatInline(line.substring(3))}
        </h2>
      );
      return;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={index} className="text-xs font-semibold text-office-violet mt-2 mb-0.5">
          {formatInline(line.substring(4))}
        </h3>
      );
      return;
    }

    // Bullet lists
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      elements.push(
        <div key={index} className="flex items-start gap-2 my-0.5 pl-2 text-xs text-office-text/90">
          <span className="text-office-cyan mt-1">•</span>
          <span>{formatInline(line.trim().substring(2))}</span>
        </div>
      );
      return;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={index} className="border-l-2 border-office-cyan/60 pl-2.5 my-1.5 text-xs text-office-muted italic bg-white/5 py-1 rounded-r">
          {formatInline(line.substring(2))}
        </blockquote>
      );
      return;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={index} className="h-1.5" />);
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={index} className="text-xs text-office-text/90 leading-relaxed my-0.5">
        {formatInline(line)}
      </p>
    );
  });

  return <div className={`markdown-body select-text ${className}`}>{elements}</div>;
};

// Formats **bold**, `code`, and *italic*
function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|`.*?`|\*.*?\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-semibold text-white">
          {token.substring(2, token.length - 2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={match.index} className="font-mono text-[11px] bg-black/40 text-office-cyan px-1 py-0.5 rounded border border-white/10">
          {token.substring(1, token.length - 1)}
        </code>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={match.index} className="italic text-office-text/80">
          {token.substring(1, token.length - 1)}
        </em>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
