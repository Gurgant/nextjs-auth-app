/**
 * Artillery Processor for Authentication Load Tests
 * Provides helper functions and hooks for performance testing
 */

module.exports = {
  /**
   * Before request hook - Add authentication headers
   */
  beforeRequest: (requestParams, context, ee, next) => {
    // Add common headers
    requestParams.headers = requestParams.headers || {};
    requestParams.headers["Accept"] = "application/json";
    requestParams.headers["Content-Type"] = "application/json";

    // Add session cookie if available
    if (context.vars.sessionCookie) {
      requestParams.headers["Cookie"] = context.vars.sessionCookie;
    }

    // Log request for debugging (only in debug mode)
    if (process.env.DEBUG) {
      console.log(
        `[${new Date().toISOString()}] ${requestParams.method} ${requestParams.url}`,
      );
    }

    return next();
  },

  /**
   * After response hook - Capture session cookies
   */
  afterResponse: (requestParams, response, context, ee, next) => {
    // Capture session cookie from Set-Cookie header
    if (response.headers["set-cookie"]) {
      const cookies = response.headers["set-cookie"];
      const sessionCookie = cookies.find((c) =>
        c.includes("next-auth.session-token"),
      );
      if (sessionCookie) {
        context.vars.sessionCookie = sessionCookie.split(";")[0];
      }
    }

    // Log response for debugging
    if (process.env.DEBUG) {
      console.log(
        `[${new Date().toISOString()}] Response: ${response.statusCode}`,
      );
    }

    // Track custom metrics
    if (response.statusCode >= 400) {
      ee.emit("counter", "http.errors", 1);

      if (response.statusCode >= 500) {
        ee.emit("counter", "http.server_errors", 1);
      } else {
        ee.emit("counter", "http.client_errors", 1);
      }
    }

    // Track response time buckets
    const responseTime = response.timings?.phases?.firstByte || 0;
    if (responseTime < 100) {
      ee.emit("counter", "response_time.fast", 1);
    } else if (responseTime < 500) {
      ee.emit("counter", "response_time.medium", 1);
    } else {
      ee.emit("counter", "response_time.slow", 1);
    }

    return next();
  },

  /**
   * Generate random string for unique emails
   */
  generateRandomString: (context, events, done) => {
    context.vars.randomString = Math.random().toString(36).substring(2, 15);
    return done();
  },

  /**
   * Generate timestamp
   */
  generateTimestamp: (context, events, done) => {
    context.vars.timestamp = Date.now();
    return done();
  },

  /**
   * Validate response contains expected data
   */
  validateResponse: (context, next) => {
    const response = context.vars.response;

    if (!response) {
      console.error("No response to validate");
      return next(new Error("No response"));
    }

    // Check for error responses
    if (response.error) {
      console.error(`Error response: ${response.error}`);
      return next(new Error(response.error));
    }

    return next();
  },

  /**
   * Setup function - runs once before tests
   */
  setup: (context, ee, done) => {
    console.log("🚀 Starting authentication load tests...");
    console.log(`Target: ${context.target}`);
    console.log(`Duration: ${context.duration}s`);
    console.log(`Arrival Rate: ${context.arrivalRate} users/s`);

    // Initialize counters
    ee.emit("counter", "test.started", 1);

    return done();
  },

  /**
   * Cleanup function - runs once after tests
   */
  cleanup: (context, ee, done) => {
    console.log("✅ Authentication load tests completed");

    // Emit final metrics
    ee.emit("counter", "test.completed", 1);

    return done();
  },

  /**
   * Custom function to simulate think time with variation
   */
  randomThinkTime: (context, events, done) => {
    const baseTime = context.vars.thinkTime || 2;
    const variation = 0.5; // +/- 50%
    const min = baseTime * (1 - variation);
    const max = baseTime * (1 + variation);
    const thinkTime = Math.random() * (max - min) + min;

    setTimeout(() => {
      return done();
    }, thinkTime * 1000);
  },

  /**
   * Check if user is authenticated
   */
  checkAuth: (context, next) => {
    if (!context.vars.sessionCookie) {
      console.error("User not authenticated");
      return next(new Error("Not authenticated"));
    }
    return next();
  },

  /**
   * Log custom metric
   */
  logMetric: (metricName, value, context, ee) => {
    ee.emit("customStat", metricName, value);

    if (process.env.DEBUG) {
      console.log(`Metric: ${metricName} = ${value}`);
    }
  },
};
