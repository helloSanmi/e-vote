import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Admin from '../pages/admin';
import io from 'socket.io-client';

const serverUrl = process.env.NEXT_PUBLIC_API_URL;

describe('Admin page', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'admin-token');
    localStorage.setItem('isAdmin', 'true');
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    localStorage.clear();
  });

  const mockAdminFetch = (handlers) => {
    global.fetch = jest.fn((input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      const route = url.replace(serverUrl, '');

      if (handlers[route]) {
        return handlers[route](init);
      }

      return Promise.resolve({
        ok: true,
        json: async () => [],
      });
    });
  };

  test('renders current period and candidates on load', async () => {
    mockAdminFetch({
      '/api/admin/get-period': () =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            id: 1,
            startTime: new Date().toISOString(),
            endTime: new Date(Date.now() + 3_600_000).toISOString(),
            resultsPublished: 0,
            forcedEnded: 0,
          }),
        }),
      '/api/admin/get-candidates': () =>
        Promise.resolve({
          ok: true,
          json: async () => [
            { id: 10, name: 'Candidate A', lga: 'Central', published: 0 },
            { id: 11, name: 'Candidate B', lga: 'North', published: 1 },
          ],
        }),
      '/api/admin/results': () =>
        Promise.resolve({ ok: true, json: async () => [] }),
      '/api/admin/periods': () =>
        Promise.resolve({ ok: true, json: async () => [] }),
    });

    render(<Admin />);

    await waitFor(() =>
      expect(
        screen.getByText('Administrative Page', { selector: 'h1' })
      ).toBeInTheDocument()
    );

    expect(screen.getByText('Unpublished Candidates')).toBeInTheDocument();
    expect(screen.getByText('Candidate A (Central)')).toBeInTheDocument();
    expect(screen.getByText('Published Candidates')).toBeInTheDocument();
    expect(screen.getByText('Candidate B (North)')).toBeInTheDocument();
  });

  test('allows admin to add a new candidate', async () => {
    mockAdminFetch({
      '/api/admin/get-period': () =>
        Promise.resolve({
          ok: true,
          json: async () => null,
        }),
      '/api/admin/get-candidates': () =>
        Promise.resolve({
          ok: true,
          json: async () => [],
        }),
      '/api/admin/results': () =>
        Promise.resolve({ ok: true, json: async () => [] }),
      '/api/admin/periods': () =>
        Promise.resolve({ ok: true, json: async () => [] }),
      '/api/admin/add-candidate': () =>
        Promise.resolve({ ok: true, json: async () => ({ message: 'Candidate added' }) }),
    });

    render(<Admin />);

    const nameInput = screen.getByPlaceholderText('Candidate Name');
    const lgaInput = screen.getByPlaceholderText('LGA');
    const photoInput = screen.getByLabelText('Candidate Photo');

    await userEvent.type(nameInput, 'New Candidate');
    await userEvent.type(lgaInput, 'South');
    const file = new File(['avatar'], 'photo.png', { type: 'image/png' });
    await userEvent.upload(photoInput, file);

    const addButton = screen.getByRole('button', { name: 'Add Candidate' });
    await userEvent.click(addButton);

    await waitFor(() =>
      expect(screen.getByText('Candidate added successfully')).toBeInTheDocument()
    );

    const addCall = global.fetch.mock.calls.find(([url]) =>
      url.includes('/api/admin/add-candidate')
    );
    expect(addCall).toBeTruthy();
    const parsed = JSON.parse(addCall[1].body);
    expect(parsed.photoData).toMatch(/^data:image\/png;base64,/);
  });

  test('handles start voting failures gracefully', async () => {
    mockAdminFetch({
      '/api/admin/get-period': () =>
        Promise.resolve({ ok: true, json: async () => null }),
      '/api/admin/get-candidates': () =>
        Promise.resolve({ ok: true, json: async () => [] }),
      '/api/admin/results': () =>
        Promise.resolve({ ok: true, json: async () => [] }),
      '/api/admin/periods': () =>
        Promise.resolve({ ok: true, json: async () => [] }),
      '/api/admin/start-voting': () =>
        Promise.resolve({ ok: false, json: async () => ({ error: 'No unpublished candidates available to start voting' }) }),
    });

    render(<Admin />);

    const startInput = screen.getByLabelText('Start Time');
    const endInput = screen.getByLabelText('End Time');

    await userEvent.type(startInput, '2024-01-01T10:00');
    await userEvent.type(endInput, '2024-01-01T12:00');

    const startButton = screen.getByRole('button', { name: 'Start Voting' });
    await userEvent.click(startButton);

    await waitFor(() =>
      expect(
        screen.getByText('No unpublished candidates available to start voting')
      ).toBeInTheDocument()
    );
  });

  test('reacts to socket updates by refreshing candidates', async () => {
    const loadCandidates = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 21, name: 'Initial Candidate', lga: 'West', published: 0 },
      ])
      .mockResolvedValueOnce([
        { id: 21, name: 'Initial Candidate', lga: 'West', published: 0 },
        { id: 22, name: 'Updated Candidate', lga: 'North', published: 1 },
      ]);

    mockAdminFetch({
      '/api/admin/get-period': () =>
        Promise.resolve({ ok: true, json: async () => null }),
      '/api/admin/get-candidates': () => loadCandidates(),
      '/api/admin/results': () =>
        Promise.resolve({ ok: true, json: async () => [] }),
      '/api/admin/periods': () =>
        Promise.resolve({ ok: true, json: async () => [] }),
    });

    render(<Admin />);

    await waitFor(() =>
      expect(screen.getByText('Initial Candidate (West)')).toBeInTheDocument()
    );

    const socketMock = io.__socketMock;
    const candidatesUpdatedHandler = socketMock.on.mock.calls.find(([event]) => event === 'candidatesUpdated')[1];

    await act(async () => {
      await candidatesUpdatedHandler();
    });

    await waitFor(() =>
      expect(screen.getByText('Updated Candidate (North)')).toBeInTheDocument()
    );
  });
});
