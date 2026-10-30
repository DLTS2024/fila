import { createRoot } from 'react-dom/client';
import Studio from '../app/authenticated-studio';
import '../app/globals.css';

createRoot(document.getElementById('root')!).render(<Studio />);
