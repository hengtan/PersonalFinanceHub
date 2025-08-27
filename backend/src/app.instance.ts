// App instance for testing and server usage
import App from './app';

// Create and initialize the app instance
const app = new App();

// Export the initialized app for use in tests and server
export { app };

// Export the FastifyInstance for testing
export const appInstance = app;