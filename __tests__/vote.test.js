import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Vote from '../pages/vote';
import io from 'socket.io-client';

describe('Vote page', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'token-value');
    localStorage.setItem('userId', '2');
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    localStorage.clear();
  });

  const mockFetchSequence = (responses) => {
    global.fetch = jest.fn();
    responses.forEach((response, index) => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => response,
        })
      );
    });
    return global.fetch;
  };

  test('shows message when no voting period is active', async () => {
    mockFetchSequence([null]);

    render(<Vote />);

    await waitFor(() =>
      expect(
        screen.getByText('No Voting Currently', {
          selector: 'h2',
        })
      ).toBeInTheDocument()
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('allows user to select a candidate and submit a vote', async () => {
    const now = Date.now();
    const period = {
      id: 3,
      startTime: new Date(now - 60_000).toISOString(),
      endTime: new Date(now + 3_600_000).toISOString(),
      forcedEnded: 0,
      resultsPublished: 0,
    };

    const candidates = [
      { id: 10, name: 'Candidate A', lga: 'Central', photoUrl: null },
      { id: 11, name: 'Candidate B', lga: 'North', photoUrl: null },
    ];

    const voteResponse = { message: 'Vote cast' };

    mockFetchSequence([
      period,
      candidates,
      { candidateId: null },
      voteResponse,
    ]);

    render(<Vote />);

    await waitFor(() =>
      expect(
        screen.getByText('Vote for Your Candidate', {
          selector: 'h1',
        })
      ).toBeInTheDocument()
    );

    const candidateCard = screen.getByText('Candidate A');
    await userEvent.click(candidateCard);

    const submitButton = screen.getByRole('button', { name: 'Submit Vote' });
    await userEvent.click(submitButton);

    await waitFor(() =>
      expect(
        screen.getByText('Your vote has been recorded successfully!')
      ).toBeInTheDocument()
    );

    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  test('warns user to log in when token is missing', async () => {
    localStorage.removeItem('token');

    const now = Date.now();
    const period = {
      id: 4,
      startTime: new Date(now - 60_000).toISOString(),
      endTime: new Date(now + 3_600_000).toISOString(),
      forcedEnded: 0,
      resultsPublished: 0,
    };

    const candidates = [
      { id: 12, name: 'Candidate C', lga: 'South', photoUrl: null },
    ];

    mockFetchSequence([
      period,
      candidates,
      { candidateId: null },
    ]);

    render(<Vote />);

    await waitFor(() =>
      expect(
        screen.getByText('Vote for Your Candidate', {
          selector: 'h1',
        })
      ).toBeInTheDocument()
    );

    const candidateCard = screen.getByText('Candidate C');
    await userEvent.click(candidateCard);

    const submitButton = screen.getByRole('button', { name: 'Submit Vote' });
    await userEvent.click(submitButton);

    expect(
      screen.getByText('Please login first.')
    ).toBeInTheDocument();
  });

  test('updates UI when voting ends via socket event', async () => {
    const now = Date.now();
    const period = {
      id: 5,
      startTime: new Date(now - 60_000).toISOString(),
      endTime: new Date(now + 60_000).toISOString(),
      forcedEnded: 0,
      resultsPublished: 0,
    };

    const candidates = [{ id: 15, name: 'Candidate D', lga: 'East', photoUrl: null }];

    mockFetchSequence([
      period,
      candidates,
      { candidateId: null },
      { id: 5, forcedEnded: 1, endTime: new Date(now - 10_000).toISOString(), resultsPublished: 0 },
    ]);

    render(<Vote />);

    await waitFor(() =>
      expect(
        screen.getByText('Vote for Your Candidate', {
          selector: 'h1',
        })
      ).toBeInTheDocument()
    );

    const socketMock = io.__socketMock;
    const votingEndedHandler = socketMock.on.mock.calls.find(([event]) => event === 'votingEnded')[1];

    await act(async () => {
      await votingEndedHandler();
    });

    await waitFor(() =>
      expect(
        screen.getByText('Voting has ended', {
          selector: 'h2',
        })
      ).toBeInTheDocument()
    );
  });
});
