import { render, screen, waitFor, cleanup } from '@testing-library/react';
import Home from '../pages/index';

describe('Home page', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({}),
      })
    );
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('shows guest message when user is not logged in', () => {
    render(<Home />);

    expect(
      screen.getByText('Welcome to the Voting App', {
        selector: 'h1',
      })
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('shows personalized greeting when user is logged in', async () => {
    localStorage.setItem('token', 'token-value');

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          id: 42,
          fullName: 'Jane Doe',
        }),
      })
    );

    render(<Home />);

    await waitFor(() =>
      expect(
        screen.getByText('Welcome back, Jane Doe!', {
          selector: 'h1',
        })
      ).toBeInTheDocument()
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
