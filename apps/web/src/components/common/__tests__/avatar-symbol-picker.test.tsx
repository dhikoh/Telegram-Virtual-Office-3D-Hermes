// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AvatarSymbolPicker } from '../AvatarSymbolPicker';
import { AVATAR_SYMBOLS } from '@hermes-office/shared';

describe('AvatarSymbolPicker Component', () => {
  it('renders all curated avatar symbols', () => {
    const onChange = vi.fn();
    render(<AvatarSymbolPicker value="🤖" onChange={onChange} />);

    for (const sym of AVATAR_SYMBOLS) {
      expect(screen.getByRole('button', { name: `Pilih avatar ${sym}` })).toBeDefined();
    }
  });

  it('marks current value with aria-pressed="true"', () => {
    const onChange = vi.fn();
    render(<AvatarSymbolPicker value="💼" onChange={onChange} />);

    const selectedBtn = screen.getByRole('button', { name: 'Pilih avatar 💼' });
    expect(selectedBtn.getAttribute('aria-pressed')).toBe('true');

    const otherBtn = screen.getByRole('button', { name: 'Pilih avatar 🤖' });
    expect(otherBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onChange when another symbol button is clicked', () => {
    const onChange = vi.fn();
    render(<AvatarSymbolPicker value="🤖" onChange={onChange} />);

    const targetBtn = screen.getByRole('button', { name: 'Pilih avatar ⚡' });
    fireEvent.click(targetBtn);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('⚡');
  });
});
