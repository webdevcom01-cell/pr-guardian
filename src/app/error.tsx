'use client';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ background: '#111', color: '#fff', padding: '2rem', fontFamily: 'monospace' }}>
        <h2>Error: {error.message}</h2>
        <pre style={{ color: '#f87171', fontSize: '0.75rem' }}>{error.stack}</pre>
      </body>
    </html>
  );
}
