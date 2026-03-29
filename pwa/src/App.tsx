import { useState, useEffect } from 'react';
import { OnboardingFlow } from './OnboardingFlow';
import { LoginScreen } from './components/LoginScreen';
import { RegisterScreen } from './components/RegisterScreen';
import './index.css';

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('token');
    if (stored) setToken(stored);
  }, []);

  const handleLogin = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('onboardingComplete');
    setToken(null);
  };

  if (!token) {
    if (showRegister) {
      return <RegisterScreen onRegister={handleLogin} onSwitchToLogin={() => setShowRegister(false)} />;
    }
    return <LoginScreen onLogin={handleLogin} onSwitchToRegister={() => setShowRegister(true)} />;
  }

  return <OnboardingFlow onLogout={handleLogout} />;
}

export default App;

