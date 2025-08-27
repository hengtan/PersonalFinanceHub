// Circuit Breaker decorator for fault tolerance
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

interface CircuitBreakerStats {
  failures: number;
  successes: number;
  requests: number;
  lastFailureTime?: number;
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedErrors?: (error: any) => boolean;
}

const circuitBreakers = new Map<string, {
  state: CircuitState;
  stats: CircuitBreakerStats;
  config: CircuitBreakerConfig;
  nextAttempt: number;
}>();

export function CircuitBreaker(options?: {
  failureThreshold?: number; // Number of failures before opening
  recoveryTimeout?: number; // Time in ms before attempting recovery
  monitoringPeriod?: number; // Time window for counting failures
  expectedErrors?: (error: any) => boolean; // Predicate for expected errors
}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const config: CircuitBreakerConfig = {
      failureThreshold: options?.failureThreshold || 5,
      recoveryTimeout: options?.recoveryTimeout || 30000, // 30 seconds
      monitoringPeriod: options?.monitoringPeriod || 60000, // 1 minute
      expectedErrors: options?.expectedErrors || (() => true)
    };

    const circuitKey = `${target.constructor.name}_${propertyName}`;
    
    // Initialize circuit breaker if not exists
    if (!circuitBreakers.has(circuitKey)) {
      circuitBreakers.set(circuitKey, {
        state: CircuitState.CLOSED,
        stats: { failures: 0, successes: 0, requests: 0 },
        config,
        nextAttempt: 0
      });
    }

    descriptor.value = async function (...args: any[]) {
      const circuit = circuitBreakers.get(circuitKey)!;
      const now = Date.now();

      // Clean old stats based on monitoring period
      if (circuit.stats.lastFailureTime && 
          now - circuit.stats.lastFailureTime > config.monitoringPeriod) {
        circuit.stats = { failures: 0, successes: 0, requests: 0 };
      }

      // Check circuit state
      switch (circuit.state) {
        case CircuitState.OPEN:
          if (now < circuit.nextAttempt) {
            throw new Error(`Circuit breaker is OPEN. Next attempt allowed at ${new Date(circuit.nextAttempt)}`);
          }
          // Time to try recovery
          circuit.state = CircuitState.HALF_OPEN;
          break;

        case CircuitState.HALF_OPEN:
          // In half-open state, allow one request to test recovery
          break;

        case CircuitState.CLOSED:
          // Normal operation
          break;
      }

      circuit.stats.requests++;

      try {
        const result = await method.apply(this, args);
        
        // Success - record it
        circuit.stats.successes++;
        
        if (circuit.state === CircuitState.HALF_OPEN) {
          // Recovery successful, close the circuit
          circuit.state = CircuitState.CLOSED;
          circuit.stats = { failures: 0, successes: 1, requests: 1 };
          console.log(`Circuit breaker ${circuitKey} recovered - state: CLOSED`);
        }
        
        return result;
      } catch (error) {
        // Only count as failure if it's an expected error
        if (config.expectedErrors!(error)) {
          circuit.stats.failures++;
          circuit.stats.lastFailureTime = now;
          
          // Check if we should open the circuit
          if (circuit.state === CircuitState.CLOSED && 
              circuit.stats.failures >= config.failureThreshold) {
            circuit.state = CircuitState.OPEN;
            circuit.nextAttempt = now + config.recoveryTimeout;
            console.warn(`Circuit breaker ${circuitKey} opened due to ${circuit.stats.failures} failures`);
          } else if (circuit.state === CircuitState.HALF_OPEN) {
            // Recovery failed, go back to open
            circuit.state = CircuitState.OPEN;
            circuit.nextAttempt = now + config.recoveryTimeout;
            console.warn(`Circuit breaker ${circuitKey} recovery failed - back to OPEN`);
          }
        }
        
        throw error;
      }
    };

    return descriptor;
  };
}

// Utility to get circuit breaker status
export function getCircuitBreakerStatus(target: any, methodName: string) {
  const circuitKey = `${target.constructor.name}_${methodName}`;
  return circuitBreakers.get(circuitKey);
}

// Utility to reset circuit breaker
export function resetCircuitBreaker(target: any, methodName: string) {
  const circuitKey = `${target.constructor.name}_${methodName}`;
  const circuit = circuitBreakers.get(circuitKey);
  if (circuit) {
    circuit.state = CircuitState.CLOSED;
    circuit.stats = { failures: 0, successes: 0, requests: 0 };
    circuit.nextAttempt = 0;
  }
}