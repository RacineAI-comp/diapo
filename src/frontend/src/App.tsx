import { Editor } from './features/slide-editor/components/Editor';
import { Dashboard } from './features/dashboard/Dashboard';

// Minimal routing: ?doc=<uuid> opens the editor for that presentation; otherwise the dashboard.
export function App() {
  const hasDoc =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('doc');
  return hasDoc ? <Editor /> : <Dashboard />;
}
