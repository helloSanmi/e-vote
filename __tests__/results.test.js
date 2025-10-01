import { render, screen, waitFor, cleanup } from '@testing-library/react';
import Results from '../pages/results';

describe('Results page', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userId', '2');
  });

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('informs the user when they cannot view results', async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ id: 1 }),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ published: true, results: [], noParticipation: true }),
        })
      );

    render(<Results />);

    await waitFor(() =>
      expect(
        screen.getByText('Results not available', {
          selector: 'h1',
        })
      ).toBeInTheDocument()
    );

    const messages = await screen.findAllByText(
      "You didn't participate in this voting session, so you cannot view the results."
    );

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('shows published results when the user participated', async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ id: 3 }),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            published: true,
            results: [
              {
                id: 5,
                name: 'Candidate A',
                lga: 'Central',
                photoUrl: null,
                votes: 10,
              },
            ],
          }),
        })
      );

    render(<Results />);

    await waitFor(() =>
      expect(
        screen.getByText('Election Results', {
          selector: 'h1',
        })
      ).toBeInTheDocument()
    );

    expect(await screen.findByText('Candidate A')).toBeInTheDocument();
    expect(await screen.findByText('10 Votes')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
