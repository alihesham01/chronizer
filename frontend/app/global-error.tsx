'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ textAlign: 'center', padding: '2rem', border: '1px solid #fca5a5', borderRadius: '0.5rem', backgroundColor: '#fef2f2' }}>
            <h2 style={{ color: '#991b1b', marginBottom: '0.5rem' }}>Application Error</h2>
            <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {error.message || 'A critical error occurred'}
            </p>
            <button
              onClick={reset}
              style={{ backgroundColor: '#dc2626', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
