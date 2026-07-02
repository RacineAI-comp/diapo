'use client';

// Legacy route: the app used to live at /home. Redirect to /, preserving the query string so
// old editor links (/home?doc=<id>) keep working.
import { useEffect } from 'react';

export default function HomeRedirect() {
  useEffect(() => {
    window.location.replace('/' + window.location.search);
  }, []);
  return null;
}
