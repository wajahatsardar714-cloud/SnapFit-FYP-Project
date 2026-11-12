import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import AuthFormScreen from './AuthFormScreen';

const content = { meta: { title: 'Log In | SnapFit', description: 'Log in.' }, title: 'Log In to Your SnapFit Account' };

function renderScreen() {
  return render(
    <MemoryRouter>
      <AuthFormScreen content={content}>
        <form aria-label="form" />
      </AuthFormScreen>
    </MemoryRouter>
  );
}

describe('AuthFormScreen', () => {
  it('has a Back to home link in the top right corner, before the logo and form', () => {
    renderScreen();
    const back = screen.getByRole('link', { name: 'Back to home' });
    expect(back.getAttribute('href')).toBe('/');
    expect(back.className).toContain('absolute');
    expect(back.className).toContain('right-4');
    expect(back.className).toContain('top-4');
    // Comes first, so keyboard users reach it before the form.
    const logo = screen.getByRole('link', { name: 'SnapFit home' });
    expect(back.compareDocumentPosition(logo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the arrow on phones and adds the text from sm up', () => {
    renderScreen();
    const back = screen.getByRole('link', { name: 'Back to home' });
    expect(back.querySelector('svg')).toBeTruthy();
    expect(back.querySelector('span').className).toBe('hidden sm:inline');
  });
});
