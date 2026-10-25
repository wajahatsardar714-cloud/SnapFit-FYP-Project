import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AdminLayout from './AdminLayout';

const logout = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ merchant: { email: 'owner@snapfit.dev', role: 'superadmin' }, logout }),
}));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="merchants" element={<p>Merchants page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminLayout', () => {
  it('marks the area as the super admin console and renders the page inside it', () => {
    renderAt('/admin/merchants');

    expect(screen.getAllByText('Super Admin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('owner@snapfit.dev').length).toBeGreaterThan(0);
    expect(screen.getByText('Merchants page')).toBeTruthy();
  });

  it('links every admin page and signs out', () => {
    renderAt('/admin/merchants');

    const nav = within(screen.getAllByRole('navigation', { name: 'Admin' })[0]);
    expect(nav.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/admin',
      '/admin/merchants',
      '/admin/analytics',
      '/admin/demo',
      '/admin/audit-log',
      '/admin/settings',
    ]);

    fireEvent.click(screen.getAllByRole('button', { name: /log ?out|sign out/i })[0]);
    expect(logout).toHaveBeenCalled();
  });
});
