import { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Button } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WifiOffIcon from '@mui/icons-material/WifiOff';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    isNetworkError: boolean;
}

/**
 * Error Boundary Component
 * Catches errors in child components and displays fallback UI
 * Handles network errors with retry capability
 * For Electron, redirects to login on critical errors
 */
class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        isNetworkError: false
    };

    private isNetworkRelatedError(error: Error): boolean {
        const networkErrorPatterns = [
            'ERR_NETWORK_CHANGED',
            'ERR_INTERNET_DISCONNECTED',
            'ERR_CONNECTION_REFUSED',
            'ERR_NAME_NOT_RESOLVED',
            'Failed to fetch',
            'NetworkError',
            'ChunkLoadError',
            'Loading chunk',
            'net::'
        ];
        const errorString = error.toString() + (error.message || '');
        return networkErrorPatterns.some(pattern => errorString.includes(pattern));
    }

    public static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        const isNetworkError = this.isNetworkRelatedError(error);
        this.setState({ isNetworkError });
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null, isNetworkError: false });
    };

    private handleReload = () => {
        window.location.reload();
    };

    private handleFullReset = async () => {
        const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

        if (isElectron && window.electronAPI?.storageClear) {
            await window.electronAPI.storageClear();
            // Use hash navigation for Electron (file:// protocol with HashRouter)
            window.location.hash = '/login';
            window.location.reload();
        } else {
            window.location.href = '/login';
        }
    };

    public render() {
        if (this.state.hasError) {
            const { isNetworkError, error } = this.state;

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
                    {isNetworkError ? (
                        <WifiOffIcon sx={{ fontSize: 80, color: '#f59e0b', marginBottom: 3 }} />
                    ) : (
                        <ErrorOutlineIcon sx={{ fontSize: 80, color: '#ef4444', marginBottom: 3 }} />
                    )}
                    <h1 style={{ fontSize: '2rem', marginBottom: '1rem', fontWeight: 600 }}>
                        {isNetworkError ? 'Connection Issue' : 'Oops! Something went wrong'}
                    </h1>
                    <p style={{ color: '#9ca3af', marginBottom: '2rem', maxWidth: '500px' }}>
                        {isNetworkError
                            ? 'Your network connection changed or was interrupted. Please check your connection and try again.'
                            : 'We encountered an unexpected error. Don\'t worry, your data is safe.'}
                    </p>
                    {error && (
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
                            <p style={{ color: isNetworkError ? '#f59e0b' : '#ef4444', fontFamily: 'monospace', fontSize: '0.875rem', margin: 0 }}>
                                {error.toString()}
                            </p>
                        </Box>
                    )}
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {isNetworkError && (
                            <Button
                                variant="contained"
                                onClick={this.handleRetry}
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
                                Try Again
                            </Button>
                        )}
                        <Button
                            variant={isNetworkError ? 'outlined' : 'contained'}
                            onClick={this.handleReload}
                            sx={{
                                backgroundColor: isNetworkError ? 'transparent' : '#ec4899',
                                borderColor: '#ec4899',
                                color: '#ffffff',
                                padding: '0.75rem 2rem',
                                fontSize: '1rem',
                                textTransform: 'none',
                                '&:hover': {
                                    backgroundColor: isNetworkError ? 'rgba(236, 72, 153, 0.1)' : '#db2777',
                                    borderColor: '#db2777'
                                }
                            }}
                        >
                            Reload Page
                        </Button>
                        {!isNetworkError && (
                            <Button
                                variant="outlined"
                                onClick={this.handleFullReset}
                                sx={{
                                    borderColor: '#6b7280',
                                    color: '#9ca3af',
                                    padding: '0.75rem 2rem',
                                    fontSize: '1rem',
                                    textTransform: 'none',
                                    '&:hover': {
                                        backgroundColor: 'rgba(107, 114, 128, 0.1)',
                                        borderColor: '#9ca3af'
                                    }
                                }}
                            >
                                Reset & Restart
                            </Button>
                        )}
                    </Box>
                </Box>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
