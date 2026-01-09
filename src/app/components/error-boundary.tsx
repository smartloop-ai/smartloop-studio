import { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Button } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error Boundary Component
 * Catches errors in child components and displays fallback UI
 * For Electron, redirects to login on critical errors
 */
class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    private handleReload = () => {
        // Clear storage and reload
        const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

        if (isElectron && window.electronAPI?.storageClear) {
            window.electronAPI.storageClear().then(() => {
                window.location.href = '/login';
            });
        } else {
            localStorage.clear();
            window.location.href = '/login';
        }
    };

    public render() {
        if (this.state.hasError) {
            return (
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '100vh',
                        backgroundColor: '#000000',
                        color: '#ffffff',
                        padding: '2rem',
                        textAlign: 'center'
                    }}
                >
                    <ErrorOutlineIcon sx={{ fontSize: 80, color: '#ef4444', marginBottom: 3 }} />
                    <h1 style={{ fontSize: '2rem', marginBottom: '1rem', fontWeight: 600 }}>
                        Oops! Something went wrong
                    </h1>
                    <p style={{ color: '#9ca3af', marginBottom: '2rem', maxWidth: '500px' }}>
                        We encountered an unexpected error. Don't worry, your data is safe.
                        Click the button below to restart the application.
                    </p>
                    {this.state.error && (
                        <Box
                            sx={{
                                backgroundColor: '#1a1a1a',
                                border: '1px solid #2a2a2a',
                                borderRadius: '8px',
                                padding: '1rem',
                                marginBottom: '2rem',
                                maxWidth: '600px',
                                width: '100%',
                                textAlign: 'left'
                            }}
                        >
                            <p style={{ color: '#ef4444', fontFamily: 'monospace', fontSize: '0.875rem', margin: 0 }}>
                                {this.state.error.toString()}
                            </p>
                        </Box>
                    )}
                    <Button
                        variant="contained"
                        onClick={this.handleReload}
                        sx={{
                            backgroundColor: '#ec4899',
                            color: '#ffffff',
                            padding: '0.75rem 2rem',
                            fontSize: '1rem',
                            textTransform: 'none',
                            '&:hover': {
                                backgroundColor: '#db2777'
                            }
                        }}
                    >
                        Restart Application
                    </Button>
                </Box>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
