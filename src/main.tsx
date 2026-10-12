import { createRoot } from 'react-dom/client';
import ContentReview from './review/ContentReview';
import './review/content-review.css';

// Content review hold: the previous entry is preserved in main-dashboard.tsx.
// Do not import it here: its route modules and transport have network side effects.
createRoot(document.getElementById('root')!).render(<ContentReview />);
