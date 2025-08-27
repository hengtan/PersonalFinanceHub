// Basic test to verify Jest is working
describe('Basic Jest Setup', () => {
  it('should be able to run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should support async operations', async () => {
    const result = await Promise.resolve('async works');
    expect(result).toBe('async works');
  });

  it('should support TypeScript', () => {
    const message: string = 'TypeScript works';
    expect(message).toContain('TypeScript');
  });

  it('should support JSON operations', () => {
    const data = { test: true, value: 42 };
    expect(data.test).toBe(true);
    expect(data.value).toBe(42);
  });

  it('should support mocking', () => {
    const mockFn = jest.fn();
    mockFn('test');
    expect(mockFn).toHaveBeenCalledWith('test');
  });
});