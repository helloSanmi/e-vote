require('@testing-library/jest-dom');

jest.mock('socket.io-client', () => {
  const socketMock = {
    on: jest.fn(),
    off: jest.fn(),
    close: jest.fn(),
    emit: jest.fn(),
  };
  const factory = jest.fn(() => socketMock);
  factory.__socketMock = socketMock;
  return factory;
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

  if (!window.FileReader) {
    class MockFileReader {
      constructor() {
        this.result = null;
        this.onload = null;
        this.onerror = null;
      }

      readAsDataURL(file) {
        try {
          const type = file?.type || 'application/octet-stream';
          const base = Buffer.from(file?.name || '').toString('base64');
          this.result = `data:${type};base64,${base}`;
          if (typeof this.onload === 'function') {
            this.onload({ target: { result: this.result } });
          }
        } catch (error) {
          if (typeof this.onerror === 'function') {
            this.onerror(error);
          }
        }
      }
    }

    Object.defineProperty(window, 'FileReader', {
      writable: true,
      configurable: true,
      value: MockFileReader,
    });
    global.FileReader = MockFileReader;
  }
}
