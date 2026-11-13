import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { cancelAnnouncement, createAnnouncement, listAnnouncements } from '../../services/announcementsApi';
import { listMerchants } from '../../services/adminApi';
import AdminAnnouncementsPage from './AdminAnnouncementsPage';
import { audienceSummary, toDateTimeLocal, validateAnnouncement, EMPTY_ANNOUNCEMENT } from './announcementForm';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/announcementsApi', () => ({
  createAnnouncement: vi.fn(),
  listAnnouncements: vi.fn(),
  cancelAnnouncement: vi.fn(),
}));
vi.mock('../../services/adminApi', () => ({ listMerchants: vi.fn() }));

const HISTORY = [
  {
    _id: 'a2',
    title: 'Maintenance on Sunday',
    body: 'The dashboard will be down for an hour.',
    link: null,
    audience: { type: 'plan', plans: ['small', 'medium'] },
    status: 'scheduled',
    scheduledAt: '2026-12-01T09:00:00.000Z',
    sentAt: null,
    recipientCount: 0,
    readCount: 0,
    createdAt: '2026-11-10T09:00:00.000Z',
    createdBy: { email: 'owner@snapfit.dev' },
  },
  {
    _id: 'a1',
    title: 'Welcome to the new dashboard',
    body: 'Lots of new things.',
    link: '/dashboard',
    audience: { type: 'all' },
    status: 'sent',
    scheduledAt: null,
    sentAt: '2026-11-01T09:00:00.000Z',
    recipientCount: 40,
    readCount: 10,
    createdAt: '2026-11-01T09:00:00.000Z',
    createdBy: { email: 'owner@snapfit.dev' },
  },
];

function renderPage() {
  render(
    <MemoryRouter>
      <AdminAnnouncementsPage />
    </MemoryRouter>
  );
}

const field = (label) => screen.getByLabelText(label);
const type = (label, value) => fireEvent.change(field(label), { target: { value } });
const submit = (name = 'Send announcement') => fireEvent.click(screen.getByRole('button', { name }));
const confirmIn = async (name) => fireEvent.click(await screen.findByRole('button', { name }));

function fillBasics() {
  type('Title', '  New try-on feature  ');
  type('Message', 'Shoppers can now see the garment on themselves.');
}

beforeEach(() => {
  vi.clearAllMocks();
  listAnnouncements.mockResolvedValue({ announcements: HISTORY });
  createAnnouncement.mockImplementation(async (body) => ({
    announcement: { _id: 'new', ...body, status: body.scheduledAt ? 'scheduled' : 'sent', recipientCount: 12, readCount: 0 },
  }));
  cancelAnnouncement.mockResolvedValue({ announcement: { ...HISTORY[0], status: 'cancelled' } });
  listMerchants.mockResolvedValue({
    merchants: [
      { _id: 'm1', businessName: 'Blue Tees', email: 'blue@shop.dev' },
      { _id: 'm2', businessName: 'Red Shoes', email: 'red@shop.dev' },
    ],
    page: 1,
    pages: 1,
    total: 2,
  });
});

describe('AdminAnnouncementsPage compose', () => {
  it('validates the form before sending', async () => {
    renderPage();
    await screen.findByText('Maintenance on Sunday');

    submit();
    expect(await screen.findByText('Enter a title.')).toBeTruthy();
    expect(screen.getByText('Enter a message.')).toBeTruthy();
    expect(screen.getByText('Please fix the highlighted fields below.')).toBeTruthy();

    type('Title', 'x'.repeat(121));
    type('Message', 'Hello');
    type('In-app link (optional)', 'https://example.com');
    submit();
    expect(await screen.findByText(/120 characters or fewer/)).toBeTruthy();
    expect(screen.getByText(/in-app path that starts with "\/"/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/By plan/));
    submit();
    expect(await screen.findByText('Choose at least one plan.')).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Specific merchants/));
    submit();
    expect(await screen.findByText('Add at least one merchant.')).toBeTruthy();

    expect(createAnnouncement).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('rejects a schedule time in the past', async () => {
    renderPage();
    fillBasics();
    fireEvent.click(screen.getByLabelText('Schedule for later'));
    submit('Schedule announcement');
    expect(await screen.findByText('Choose the date and time to send it.')).toBeTruthy();

    type('Send at', toDateTimeLocal(new Date(Date.now() - 3600 * 1000)));
    submit('Schedule announcement');
    expect(await screen.findByText('Choose a time in the future.')).toBeTruthy();
  });

  it('sends to all merchants after confirming, with a trimmed payload', async () => {
    renderPage();
    fillBasics();
    type('In-app link (optional)', '/dashboard/product-mapping');
    submit();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/All merchants will be notified straight away/)).toBeTruthy();
    await confirmIn('Send now');

    await waitFor(() =>
      expect(createAnnouncement).toHaveBeenCalledWith({
        title: 'New try-on feature',
        body: 'Shoppers can now see the garment on themselves.',
        link: '/dashboard/product-mapping',
        audience: { type: 'all' },
      })
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Announcement sent to 12 merchants'));
    expect(field('Title').value).toBe('');
  });

  it('sends to the chosen plans', async () => {
    renderPage();
    fillBasics();
    fireEvent.click(screen.getByLabelText(/By plan/));
    fireEvent.click(screen.getByLabelText('Small'));
    fireEvent.click(screen.getByLabelText('Enterprise'));
    submit();
    await confirmIn('Send now');

    await waitFor(() =>
      expect(createAnnouncement).toHaveBeenCalledWith({
        title: 'New try-on feature',
        body: 'Shoppers can now see the garment on themselves.',
        audience: { type: 'plan', plans: ['small', 'enterprise'] },
      })
    );
  });

  it('sends to merchants picked from a search', async () => {
    renderPage();
    fillBasics();
    fireEvent.click(screen.getByLabelText(/Specific merchants/));
    type('Find merchants', 'tees');
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(listMerchants).toHaveBeenCalledWith({ page: 1, limit: 8, search: 'tees' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add Blue Tees' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Red Shoes' }));
    expect(within(screen.getByRole('list', { name: 'Selected merchants' })).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Red Shoes' }));
    expect(within(screen.getByRole('list', { name: 'Selected merchants' })).getAllByRole('listitem')).toHaveLength(1);

    submit();
    expect(within(await screen.findByRole('dialog')).getByText(/1 merchant will be notified/)).toBeTruthy();
    await confirmIn('Send now');

    await waitFor(() =>
      expect(createAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({ audience: { type: 'merchants', merchantIds: ['m1'] } })
      )
    );
  });

  it('schedules for a future time, sending it as ISO', async () => {
    renderPage();
    fillBasics();
    fireEvent.click(screen.getByLabelText('Schedule for later'));
    const when = toDateTimeLocal(new Date(Date.now() + 2 * 86400 * 1000));
    type('Send at', when);
    submit('Schedule announcement');

    expect(await screen.findByRole('dialog', { name: 'Schedule this announcement?' })).toBeTruthy();
    await confirmIn('Schedule');

    await waitFor(() =>
      expect(createAnnouncement).toHaveBeenCalledWith({
        title: 'New try-on feature',
        body: 'Shoppers can now see the garment on themselves.',
        audience: { type: 'all' },
        scheduledAt: new Date(when).toISOString(),
      })
    );
  });

  it('previews the notification as it is typed', async () => {
    renderPage();
    const preview = within(screen.getByLabelText('Notification preview'));
    expect(preview.getByText('Your announcement title')).toBeTruthy();
    fillBasics();
    expect(preview.getByText('New try-on feature')).toBeTruthy();
    expect(preview.getByText('Shoppers can now see the garment on themselves.')).toBeTruthy();
  });
});

describe('AdminAnnouncementsPage history', () => {
  it('lists past and scheduled announcements with audience, status and reads', async () => {
    renderPage();

    const scheduled = within((await screen.findByText('Maintenance on Sunday')).closest('tr'));
    expect(scheduled.getByText('Plans: Small, Medium')).toBeTruthy();
    expect(scheduled.getByText('Scheduled')).toBeTruthy();
    expect(scheduled.getByText(/^Scheduled for/)).toBeTruthy();

    const sent = within(screen.getByText('Welcome to the new dashboard').closest('tr'));
    expect(sent.getByText('All merchants')).toBeTruthy();
    expect(sent.getByText('Sent')).toBeTruthy();
    expect(sent.getByText('40')).toBeTruthy();
    expect(sent.getByText('10 (25%)')).toBeTruthy();
    expect(sent.queryByRole('button', { name: /Cancel/ })).toBeNull();
  });

  it('cancels a scheduled announcement after confirming', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel "Maintenance on Sunday"' }));
    await confirmIn('Cancel announcement');

    await waitFor(() => expect(cancelAnnouncement).toHaveBeenCalledWith('a2'));
    const row = within(screen.getByText('Maintenance on Sunday').closest('tr'));
    expect(await row.findByText('Cancelled')).toBeTruthy();
    expect(row.queryByRole('button', { name: /Cancel/ })).toBeNull();
  });

  it('shows an empty history', async () => {
    listAnnouncements.mockResolvedValue({ announcements: [] });
    renderPage();
    expect(await screen.findByText(/No announcements yet/)).toBeTruthy();
  });
});

describe('announcement form helpers', () => {
  it('summarises audiences', () => {
    expect(audienceSummary({ type: 'all' })).toBe('All merchants');
    expect(audienceSummary({ type: 'plan', plans: ['enterprise'] })).toBe('Plan: Enterprise');
    expect(audienceSummary({ type: 'merchants', merchantIds: ['a', 'b', 'c'] })).toBe('3 merchants');
  });

  it('accepts a complete form', () => {
    expect(validateAnnouncement({ ...EMPTY_ANNOUNCEMENT, title: 'Hi', body: 'There', link: '/dashboard' })).toEqual({});
  });
});
