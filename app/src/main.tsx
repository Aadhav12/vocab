import { createRoot } from 'react-dom/client';
import './style.base.css';
import 'katex/dist/katex.min.css';
import './style.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(<App />);
