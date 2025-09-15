/**
 * Main Entry Point
 * Bootstraps the Evidence Service Application
 */

// Make this a module to support top-level await
export {};

console.log('🚀 Starting Evidence Service index.ts...'); // touch for reload

// Import app.js and test constructor vs start steps from the full implementation
try {
  console.log('📦 Importing ./app.js module (no execution yet)...');
  const appModule = await import('./app.js');
  console.log('✅ app.js imported. Export keys:', Object.keys(appModule));

  const ForensicEvidenceApp = (appModule as any).ForensicEvidenceApp;
  if (!ForensicEvidenceApp) {
    console.log('⚠️ Named export ForensicEvidenceApp not found. Available exports:', Object.keys(appModule));
  } else {
    console.log('🏗️ Creating app instance via getInstance (constructor phase)...');
    const appInstance = ForensicEvidenceApp.getInstance();
    console.log('✅ App instance created. Proceeding to start...');

    console.log('▶️ Starting application (middleware, routes, server, background connections)...');
    await appInstance.start();
    console.log('✅ Application started successfully');
  }

} catch (error: unknown) {
  console.error('❌ Failed to start application:');
  console.error('Error type:', typeof error);
  console.error('Error constructor:', (error as any)?.constructor?.name);
  console.error('Error message:', (error as Error)?.message || 'No message');
  console.error('Error stack:', (error as Error)?.stack || 'No stack trace');
  console.error('Full error object:', JSON.stringify(error, null, 2));
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
