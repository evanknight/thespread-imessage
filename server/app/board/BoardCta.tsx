'use client';

import { useEffect, useState } from 'react';

// The board is a server component and can't know whether this visitor is
// enrolled — the token lives in localStorage. So the CTA resolves on the
// client: "Log in & pick" for newcomers, "My picks" for enrolled players.
export default function BoardCta() {
  const [name, setName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setName(localStorage.getItem('spread_token') ? localStorage.getItem('spread_name') : null);
    setReady(true);
  }, []);

  // Render the neutral label until we know, so SSR and hydration agree.
  return (
    <a className="cta-gold" href="/play">
      {!ready ? 'Open' : name ? `${name}'s picks →` : 'Log in & pick'}
    </a>
  );
}
