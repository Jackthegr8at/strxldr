import React from 'react';
import { ThemeProvider } from './components/ThemeProvider';

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <div>
        <h1>Welcome to the Staking Dashboard</h1>
        {/* Add your main content here */}
      </div>
    </ThemeProvider>
  );
};

export default App; 