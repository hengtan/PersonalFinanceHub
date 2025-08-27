// Retry decorator for resilient operations
export function Retry(options?: {
  maxRetries?: number;
  delay?: number;
  exponentialBackoff?: boolean;
  retryCondition?: (error: any) => boolean;
}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const maxRetries = options?.maxRetries || 3;
    const delay = options?.delay || 1000; // 1 second default
    const exponentialBackoff = options?.exponentialBackoff || true;
    const retryCondition = options?.retryCondition || ((error: any) => true);

    descriptor.value = async function (...args: any[]) {
      let lastError: any;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await method.apply(this, args);
        } catch (error) {
          lastError = error;
          
          // Don't retry if this is the last attempt or condition doesn't match
          if (attempt === maxRetries || !retryCondition(error)) {
            break;
          }
          
          // Calculate delay with exponential backoff
          const currentDelay = exponentialBackoff 
            ? delay * Math.pow(2, attempt)
            : delay;
          
          console.warn(`Method ${propertyName} failed, retrying in ${currentDelay}ms (attempt ${attempt + 1}/${maxRetries})`, error);
          
          // Wait before retry
          await sleep(currentDelay);
        }
      }
      
      throw lastError;
    };

    return descriptor;
  };
}

// Utility function for delay
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Specific retry conditions
export const RetryConditions = {
  // Retry on network errors
  networkError: (error: any) => {
    const networkErrorCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'];
    return networkErrorCodes.includes(error.code) || error.message?.includes('network');
  },

  // Retry on temporary failures (5xx status codes)
  temporaryFailure: (error: any) => {
    return error.status >= 500 && error.status < 600;
  },

  // Retry on database connection errors
  databaseError: (error: any) => {
    const dbErrorMessages = ['connection', 'timeout', 'pool'];
    return dbErrorMessages.some(msg => error.message?.toLowerCase().includes(msg));
  },

  // Never retry on authentication errors
  notAuthError: (error: any) => {
    return !(error.status === 401 || error.status === 403);
  }
};