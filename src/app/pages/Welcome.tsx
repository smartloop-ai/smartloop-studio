import { useNavigate } from 'react-router-dom';
import WelcomeScreen from '@/app/components/welcome-screen';

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <WelcomeScreen onNavigateToLogin={() => navigate('/login')} />
  );
}
