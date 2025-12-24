import { CircularProgress } from '@mui/material';
import { Logo } from './logo';

interface LoadingSpinnerProps {
  message?: string;
  showLogo?: boolean;
  size?: number;
}

export default function LoadingSpinner({ message, showLogo = false, size = 24 }: LoadingSpinnerProps) {
  if (showLogo) {
    return (
      <main className="min-h-screen w-full bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <Logo />
          <div className="flex flex-col items-center gap-10 text-white">
            <CircularProgress sx={{ color: '#ec4899' }} size={size} />
            {message && <p className="text-sm text-gray-400">{message}</p>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen">
      <CircularProgress size={size} />
    </div>
  );
}
