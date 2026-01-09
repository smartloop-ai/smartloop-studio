import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress, LinearProgress } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import TokenIcon from '@mui/icons-material/Token';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DescriptionIcon from '@mui/icons-material/Description';
import ChatIcon from '@mui/icons-material/Chat';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import MobileNav from '@/app/components/mobile-nav';
import { useAuth } from '@/app/hooks/useAuth';
import Sidebar from '@/app/components/sidebar';
import Breadcrumb from '@/app/components/breadcrumb';

export default function Profile() {
    const navigate = useNavigate();
    const [user] = useAuth();
    const [loading, setLoading] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        if (user) {
            setLoading(false);
        }
    }, [user]);

    // Calculate usage metrics
    const getUsageMetrics = () => {
        if (!user) return null;

        // Check if user is premium (unlimited)
        const isPremium = user.is_premium;

        // Determine plan allocation: Free = 30,000 tokens (300 credits), Pro = 300,000 tokens (3,000 credits), Premium = Unlimited
        const isPro = user.is_paid;
        const planTokens = isPremium ? Infinity : (isPro ? 300000 : 30000);

        // Use the plan allocation if user.tokens is not set or is 0
        const totalTokens = isPremium ? Infinity : (user.tokens && user.tokens > 0 ? user.tokens : planTokens);
        const processedTokens = user.number_of_tokens_processed || 0;
        const remainingTokens = isPremium ? Infinity : Math.max(0, totalTokens - processedTokens);
        const usagePercentage = isPremium ? 0 : (totalTokens > 0 ? (processedTokens / totalTokens) * 100 : 0);

        // Calculate credits (assuming 100 tokens = 1 credit)
        const totalCredits = isPremium ? Infinity : Math.floor(totalTokens / 100);
        const usedCredits = Math.floor(processedTokens / 100);
        const remainingCredits = isPremium ? Infinity : Math.floor(remainingTokens / 100);

        // Count projects and documents
        const totalProjects = user.projects?.length || 0;
        const totalDocuments = user.projects?.reduce((count: number, project: any) => {
            return count + (project.documents?.length || 0);
        }, 0) || 0;

        return {
            totalTokens,
            processedTokens,
            remainingTokens,
            usagePercentage,
            totalCredits,
            usedCredits,
            remainingCredits,
            totalProjects,
            totalDocuments,
            isPremium,
        };
    };

    const metrics = getUsageMetrics();

    return (
        <>
            {user && (
                <>
                    <Sidebar user={user} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
                    <Box className="min-h-screen bg-black text-white" >
                        <Box className="p-4">
                            <MobileNav onMenuClick={() => setMobileMenuOpen(true)} />

                            {loading ? (
                                <Box className="flex justify-center items-center" sx={{ minHeight: '400px' }}>
                                    <CircularProgress sx={{ color: '#ec4899' }} size={48} />
                                </Box>
                            ) : (
                                <Box className="max-w-5xl mx-auto mt-6 md:mt-12">
                                    {/* Header */}
                                    <Box className="mb-6 md:mb-8">
                                        <Box className="flex items-center gap-3 md:gap-4 mb-4">
                                            <Box
                                                sx={{
                                                    width: { xs: '60px', md: '80px' },
                                                    height: { xs: '60px', md: '80px' },
                                                }}
                                                className="rounded-full bg-gray-700 flex items-center justify-center"
                                            >
                                                <span className="text-white text-xl md:text-2xl font-bold">
                                                    {user.name ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : 'U'}
                                                </span>
                                            </Box>
                                            <Box>
                                                <h1 className="text-2xl md:text-3xl font-bold text-white">{user.name || 'User'}</h1>
                                                <p className="text-gray-400 text-xs md:text-sm truncate">{user.email || ''}</p>
                                            </Box>
                                        </Box>
                                    </Box>

                                    {/* Account Information */}
                                    <Box className="mb-6 md:mb-8">
                                        <h2 className="text-lg md:text-xl font-semibold text-white mb-4">Account Information</h2>
                                        <Box
                                            sx={{
                                                bgcolor: '#0a0a0a',
                                                border: '1px solid #1a1a1a',
                                                borderRadius: '16px',
                                                padding: { xs: '16px', md: '24px' },
                                            }}
                                        >
                                            <Box className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {/* Name */}
                                                <Box className="flex items-start gap-3">
                                                    <PersonIcon sx={{ fontSize: 24, color: '#9ca3af', mt: 0.5 }} />
                                                    <Box>
                                                        <p className="text-xs text-gray-500 uppercase mb-1">Full Name</p>
                                                        <p className="text-white font-medium">{user.name || 'N/A'}</p>
                                                    </Box>
                                                </Box>

                                                {/* Email */}
                                                <Box className="flex items-start gap-3">
                                                    <EmailIcon sx={{ fontSize: 24, color: '#9ca3af', mt: 0.5 }} />
                                                    <Box>
                                                        <p className="text-xs text-gray-500 uppercase mb-1">Email</p>
                                                        <p className="text-white font-medium">{user.email || 'N/A'}</p>
                                                    </Box>
                                                </Box>

                                                {/* Verified Status */}
                                                <Box className="flex items-start gap-3">
                                                    {user.verified ? (
                                                        <>
                                                            <CheckCircleIcon sx={{ fontSize: 24, color: '#10b981', mt: 0.5 }} />
                                                            <Box>
                                                                <p className="text-xs text-gray-500 uppercase mb-1">Status</p>
                                                                <p className="text-green-500 font-medium">Verified</p>
                                                            </Box>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <CancelIcon sx={{ fontSize: 24, color: '#ef4444', mt: 0.5 }} />
                                                            <Box>
                                                                <p className="text-xs text-gray-500 uppercase mb-1">Status</p>
                                                                <p className="text-red-500 font-medium">Not Verified</p>
                                                            </Box>
                                                        </>
                                                    )}
                                                </Box>

                                                {/* Subscription */}
                                                <Box className="flex items-start gap-3">
                                                    {user.is_premium ? (
                                                        <AllInclusiveIcon sx={{ fontSize: 24, color: '#ec4899', mt: 0.5 }} />
                                                    ) : user.is_paid ? (
                                                        <FlashOnIcon sx={{ fontSize: 24, color: '#ec4899', mt: 0.5 }} />
                                                    ) : (
                                                        <NotificationsNoneIcon sx={{ fontSize: 24, color: '#9ca3af', mt: 0.5 }} />
                                                    )}
                                                    <Box>
                                                        <p className="text-xs text-gray-500 uppercase mb-1">Plan</p>
                                                        <p className="text-white font-medium">
                                                            {user.is_premium ? (
                                                                <span className="text-pink-400 font-semibold">Premium Plan</span>
                                                            ) : user.is_paid ? (
                                                                <span className="text-pink-400 font-semibold">Pro Plan</span>
                                                            ) : (
                                                                'Free Plan'
                                                            )}
                                                        </p>
                                                    </Box>
                                                </Box>
                                            </Box>
                                        </Box>
                                    </Box>

                                    {/* Usage Metrics */}
                                    {metrics && (
                                        <Box className="mb-6 md:mb-8">
                                            <h2 className="text-lg md:text-xl font-semibold text-white mb-4">Usage Metrics</h2>

                                            {/* Credits Card */}
                                            <Box
                                                sx={{
                                                    bgcolor: 'rgba(236, 72, 153, 0.05)',
                                                    border: '2px solid #ec4899',
                                                    borderRadius: '16px',
                                                    padding: { xs: '16px', md: '24px' },
                                                    mb: 3,
                                                    boxShadow: '0 0 30px rgba(236, 72, 153, 0.15)',
                                                }}
                                            >
                                                <Box className="flex items-center justify-between mb-4">
                                                    <Box>
                                                        <h3 className="text-base md:text-lg font-semibold text-white mb-1">Credits Remaining</h3>
                                                        <p className="text-xs md:text-sm text-gray-400">Your available credits for AI processing</p>
                                                    </Box>
                                                    <TokenIcon sx={{ fontSize: { xs: 36, md: 48 }, color: '#ec4899' }} />
                                                </Box>

                                                <Box className="mb-4">
                                                    <Box className="flex items-baseline gap-2 mb-2 flex-wrap">
                                                        {metrics.isPremium ? (
                                                            <Box className="flex items-center gap-2">
                                                                <AllInclusiveIcon sx={{ fontSize: { xs: 36, md: 48 }, color: '#ec4899' }} />
                                                                <span className="text-3xl md:text-4xl font-bold text-pink-400">Unlimited</span>
                                                            </Box>
                                                        ) : (
                                                            <>
                                                                <span className="text-3xl md:text-4xl font-bold text-pink-400">
                                                                    {metrics.remainingCredits.toLocaleString()}
                                                                </span>
                                                                <span className="text-gray-400 text-xs md:text-sm">
                                                                    / {metrics.totalCredits.toLocaleString()} credits
                                                                </span>
                                                            </>
                                                        )}
                                                    </Box>
                                                    {!metrics.isPremium && (
                                                        <LinearProgress
                                                            variant="determinate"
                                                            value={100 - metrics.usagePercentage}
                                                            sx={{
                                                                height: 8,
                                                                borderRadius: 4,
                                                                bgcolor: '#1a1a1a',
                                                                '& .MuiLinearProgress-bar': {
                                                                    bgcolor: '#ec4899',
                                                                    borderRadius: 4,
                                                                },
                                                            }}
                                                        />
                                                    )}
                                                </Box>

                                                <Box className="grid grid-cols-3 gap-4 pt-4 border-t border-pink-500/20">
                                                    <Box>
                                                        <p className="text-xs text-gray-500 uppercase mb-1">Used</p>
                                                        <p className="text-white font-semibold">{metrics.usedCredits.toLocaleString()}</p>
                                                    </Box>
                                                    <Box>
                                                        <p className="text-xs text-gray-500 uppercase mb-1">Remaining</p>
                                                        <p className="text-pink-400 font-semibold">
                                                            {metrics.isPremium ? (
                                                                <Box component="span" className="flex items-center gap-1">
                                                                    <AllInclusiveIcon sx={{ fontSize: 16 }} />
                                                                </Box>
                                                            ) : (
                                                                metrics.remainingCredits.toLocaleString()
                                                            )}
                                                        </p>
                                                    </Box>
                                                    <Box>
                                                        <p className="text-xs text-gray-500 uppercase mb-1">Total</p>
                                                        <p className="text-white font-semibold">
                                                            {metrics.isPremium ? (
                                                                <Box component="span" className="flex items-center gap-1">
                                                                    <AllInclusiveIcon sx={{ fontSize: 16 }} />
                                                                </Box>
                                                            ) : (
                                                                metrics.totalCredits.toLocaleString()
                                                            )}
                                                        </p>
                                                    </Box>
                                                </Box>
                                            </Box>

                                            {/* Token Details */}
                                            <Box
                                                sx={{
                                                    bgcolor: '#0a0a0a',
                                                    border: '1px solid #1a1a1a',
                                                    borderRadius: '16px',
                                                    padding: { xs: '16px', md: '24px' },
                                                    mb: 3,
                                                }}
                                            >
                                                <h3 className="text-base md:text-lg font-semibold text-white mb-4">Token Usage</h3>
                                                <Box className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    <Box>
                                                        <Box className="flex items-center gap-2 mb-2">
                                                            <TrendingUpIcon sx={{ fontSize: 20, color: '#ec4899' }} />
                                                            <p className="text-xs text-gray-500 uppercase">Processed</p>
                                                        </Box>
                                                        <p className="text-xl md:text-2xl font-bold text-white">{metrics.processedTokens.toLocaleString()}</p>
                                                        <p className="text-xs text-gray-600 mt-1">tokens used</p>
                                                    </Box>

                                                    <Box>
                                                        <Box className="flex items-center gap-2 mb-2">
                                                            <TokenIcon sx={{ fontSize: 20, color: '#10b981' }} />
                                                            <p className="text-xs text-gray-500 uppercase">Remaining</p>
                                                        </Box>
                                                        {metrics.isPremium ? (
                                                            <>
                                                                <Box className="flex items-center gap-1">
                                                                    <AllInclusiveIcon sx={{ fontSize: { xs: 24, md: 32 }, color: '#10b981' }} />
                                                                </Box>
                                                                <p className="text-xs text-gray-600 mt-1">unlimited</p>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <p className="text-xl md:text-2xl font-bold text-green-500">{metrics.remainingTokens.toLocaleString()}</p>
                                                                <p className="text-xs text-gray-600 mt-1">tokens left</p>
                                                            </>
                                                        )}
                                                    </Box>

                                                    <Box>
                                                        <Box className="flex items-center gap-2 mb-2">
                                                            <TokenIcon sx={{ fontSize: 20, color: '#9ca3af' }} />
                                                            <p className="text-xs text-gray-500 uppercase">Total</p>
                                                        </Box>
                                                        {metrics.isPremium ? (
                                                            <>
                                                                <Box className="flex items-center gap-1">
                                                                    <AllInclusiveIcon sx={{ fontSize: { xs: 24, md: 32 }, color: '#ffffff' }} />
                                                                </Box>
                                                                <p className="text-xs text-gray-600 mt-1">unlimited</p>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <p className="text-xl md:text-2xl font-bold text-white">{metrics.totalTokens.toLocaleString()}</p>
                                                                <p className="text-xs text-gray-600 mt-1">tokens allocated</p>
                                                            </>
                                                        )}
                                                    </Box>
                                                </Box>

                                                <Box className="mt-6 pt-6 border-t border-gray-800">
                                                    <Box className="flex items-center justify-between mb-2">
                                                        <span className="text-sm text-gray-400">Usage</span>
                                                        <span className="text-sm text-gray-400">{metrics.usagePercentage.toFixed(1)}%</span>
                                                    </Box>
                                                    <LinearProgress
                                                        variant="determinate"
                                                        value={metrics.usagePercentage}
                                                        sx={{
                                                            height: 6,
                                                            borderRadius: 3,
                                                            bgcolor: '#1a1a1a',
                                                            '& .MuiLinearProgress-bar': {
                                                                bgcolor: metrics.usagePercentage > 80 ? '#ef4444' : metrics.usagePercentage > 50 ? '#f59e0b' : '#10b981',
                                                                borderRadius: 3,
                                                            },
                                                        }}
                                                    />
                                                </Box>
                                            </Box>

                                            {/* Activity Statistics */}
                                            <Box
                                                sx={{
                                                    bgcolor: '#0a0a0a',
                                                    border: '1px solid #1a1a1a',
                                                    borderRadius: '16px',
                                                    padding: { xs: '16px', md: '24px' },
                                                }}
                                            >
                                                <h3 className="text-base md:text-lg font-semibold text-white mb-4">Activity Statistics</h3>
                                                <Box className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <Box className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg">
                                                        <Box
                                                            sx={{
                                                                width: 48,
                                                                height: 48,
                                                                borderRadius: '12px',
                                                                bgcolor: 'rgba(236, 72, 153, 0.1)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                            }}
                                                        >
                                                            <ChatIcon sx={{ fontSize: 24, color: '#ec4899' }} />
                                                        </Box>
                                                        <Box>
                                                            <p className="text-xl md:text-2xl font-bold text-white">{metrics.totalProjects}</p>
                                                            <p className="text-xs md:text-sm text-gray-400">Total Projects</p>
                                                        </Box>
                                                    </Box>

                                                    <Box className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg">
                                                        <Box
                                                            sx={{
                                                                width: 48,
                                                                height: 48,
                                                                borderRadius: '12px',
                                                                bgcolor: 'rgba(59, 130, 246, 0.1)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                            }}
                                                        >
                                                            <DescriptionIcon sx={{ fontSize: 24, color: '#3b82f6' }} />
                                                        </Box>
                                                        <Box>
                                                            <p className="text-xl md:text-2xl font-bold text-white">{metrics.totalDocuments}</p>
                                                            <p className="text-xs md:text-sm text-gray-400">Total Documents</p>
                                                        </Box>
                                                    </Box>
                                                </Box>
                                            </Box>

                                            {/* Upgrade CTA if on free plan */}
                                            {!user.is_premium && !user.is_paid && metrics.usagePercentage > 70 && (
                                                <Box
                                                    sx={{
                                                        bgcolor: 'rgba(236, 72, 153, 0.1)',
                                                        border: '1px solid rgba(236, 72, 153, 0.3)',
                                                        borderRadius: '16px',
                                                        padding: { xs: '16px', md: '24px' },
                                                        mt: 3,
                                                    }}
                                                >
                                                    <Box className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                                        <Box>
                                                            <h3 className="text-base md:text-lg font-semibold text-white mb-2">Running low on credits?</h3>
                                                            <p className="text-xs md:text-sm text-gray-400">Upgrade to Pro and get 10x more tokens for your projects</p>
                                                        </Box>
                                                        <button
                                                            onClick={() => navigate('/pricing')}
                                                            className="px-4 md:px-6 py-2 md:py-3 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-lg hover:from-pink-500 hover:to-pink-400 transition-all font-medium shadow-lg shadow-pink-500/20 whitespace-nowrap text-sm md:text-base w-full md:w-auto"
                                                        >
                                                            Upgrade to Pro
                                                        </button>
                                                    </Box>
                                                </Box>
                                            )}
                                        </Box>
                                    )}
                                </Box>
                            )}
                        </Box>
                    </Box>
                </>
            )}
        </>
    );
}
