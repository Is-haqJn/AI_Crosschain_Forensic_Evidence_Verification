/**
 * Main Entry Point
 * Bootstraps the Evidence Service Application
 */

// Make this a module to support top-level await
export {};

console.log('🚀 Starting Evidence Service index.ts...'); // touch for reload

// Prefer simple static import to avoid dynamic ESM resolver quirks
try {
  const app = (await import('./app.js')).default as any;
  if (!app || typeof app.start !== 'function') {
    throw new Error('app.js default export is not an app instance with start()');
  }
  console.log('▶️ Starting application (middleware, routes, server, background connections)...');
  await app.start();
  console.log('✅ Application started successfully');
} catch (error: unknown) {
  const { inspect } = await import('node:util');
  console.error('❌ Failed to start application (static import path):');
  console.error(inspect(error, { depth: 8, colors: false }));
  process.exit(1);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// reload 
// reload
