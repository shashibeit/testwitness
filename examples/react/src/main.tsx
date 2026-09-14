import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TestWitnessIntegration } from '../TestWitnessExample';
import { App } from './App';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('The React root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <TestWitnessIntegration>
      <App />
    </TestWitnessIntegration>
  </StrictMode>,
);
