require('@testing-library/jest-dom');

jest.mock('socket.io-client', () => {
  return jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    close: jest.fn(),
    emit: jest.fn(),
  }));
});

if (typeof window !== 'undefined') {
  window.matchMedia = window.matchMedia || function matchMedia() {
    return {
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
  };
}
