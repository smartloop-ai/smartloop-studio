import '../styles/pricing.css';

import { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import MobileNav from '@/app/components/mobile-nav';
import { userService } from '@/app/services/user.service';
import { API_ENDPOINT } from '@/app/constants';
import Sidebar from '@/app/components/sidebar';
import Breadcrumb from '@/app/components/breadcrumb';
import { useAuth } from '@/app/hooks/useAuth';

export default function Pricing() {
  const [user] = useAuth();
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [, setRefreshing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchSubscription = async () => {
    try {
      setRefreshing(true);
      const response = await fetch(`${API_ENDPOINT}/payments/subscription`, {
        headers: { 'Authorization': `Bearer ${userService.token()}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSubscription(data);
      } else {
        const errorData = await response.json();
        console.error('Failed to load subscription details:', errorData.detail || 'Unknown error');
      }
    } catch (err) {
      console.error('Subscription fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSubscription();
    }
  }, [user]);

  const handleSubscribe = async (planType: 'free' | 'pro') => {
    if (planType === 'pro') {
      try {
        const response = await fetch(`${API_ENDPOINT}/payments/create-checkout-session`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userService.token()}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const { checkout_url } = await response.json();
          // Redirect immediately without showing loading state
          window.location.href = checkout_url;
        } else {
          const errorData = await response.json();
          console.error('Failed to initiate upgrade process:', errorData.detail || 'Unknown error');
          alert('Failed to start checkout process. Please try again.');
        }
      } catch (err) {
        console.error('Upgrade error:', err);
        alert('An error occurred. Please try again.');
      }
    }
  };

  const plans = [
    {
      name: 'Free Plan',
      icon: <NotificationsNoneIcon sx={{ fontSize: 28 }} />,
      description: 'Basic features for individual users',
      features: [
        '30,000 tokens',
        '15-20 conversations',
        'Upload documents up to 40 pages',
        'Basic support',
      ],
      credits: '300 credits included',
      price: null,
      showButton: false,
      isActive: user && (subscription?.status !== 'active' && subscription?.status !== 'will_cancel'),
    },
    {
      name: 'Pro Plan',
      icon: <FlashOnIcon sx={{ fontSize: 28 }} />,
      description: 'Advanced features for power users',
      features: [
        '300,000 tokens',
        '420-600 conversations',
        'Upload documents up to 400 pages',
        'Priority support',
      ],
      credits: '3,000 credits included',
      price: '$10',
      period: ' / month',
      buttonText: 'Upgrade to Pro',
      showButton: true,
      isActive: subscription?.status === 'active' || subscription?.status === 'will_cancel',
      portalUrl: subscription?.portal_url,
    },
  ];

  return (
    <>
      {user && (
        <>
          <Sidebar user={user} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

          <Box className="min-h-screen bg-black text-white">
            <Box className="p-4">
              <MobileNav onMenuClick={() => setMobileMenuOpen(true)} />
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <Breadcrumb items={[
                  { label: 'Home', path: '/' },
                  { label: 'Pricing' }
                ]} />
              </Box>

              {/* Header with Pricing Icon */}
              <Box className="mb-6 md:mb-8 mt-6 md:mt-12 max-w-5xl mx-auto">
                <Box className="flex gap-3 md:gap-4 mb-4 md:mb-6 flex-col">
                  <LocalOfferIcon sx={{ fontSize: { xs: 32, md: 40 }, color: 'white', display: { xs: 'none', md: 'block' } }} />
                  <h1 className="text-2xl md:text-4xl font-light">Compare Plans</h1>
                  <p className="text-sm md:text-base text-gray-400 mt-1 md:mt-2">
                    Choose the plan that best fits your needs. Upgrade or downgrade at any time.
                  </p>
                </Box>
              </Box>

              {loading ? (
                <Box className="flex justify-center items-center" sx={{ minHeight: '400px' }}>
                  <Box className="text-center">
                    <CircularProgress sx={{ color: '#ec4899' }} size={48} />
                    <p className="text-gray-400 mt-4">Loading pricing information...</p>
                  </Box>
                </Box>
              ) : (
                <>
                  {/* Pricing Cards */}
                  <Box className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-8">
                    {plans.map((plan, index) => (
                      <Box
                        key={index}
                        sx={{
                          bgcolor: plan.name === 'Pro Plan' ? 'rgba(236, 72, 153, 0.05)' : '#0a0a0a',
                          border: plan.name === 'Pro Plan' ? '2px solid #ec4899' : '1px solid #1a1a1a',
                          borderRadius: '16px',
                          padding: { xs: '20px', md: '32px' },
                          transition: 'all 0.3s ease',
                          position: 'relative',
                          transform: plan.name === 'Pro Plan' ? 'scale(1.02)' : 'scale(1)',
                          boxShadow: plan.name === 'Pro Plan' ? '0 0 30px rgba(236, 72, 153, 0.15)' : 'none',
                          '&:hover': {
                            border: plan.name === 'Pro Plan' ? '2px solid #f472b6' : '1px solid #2a2a2a',
                            transform: 'scale(1.02)',
                          },
                        }}
                      >
                        {/* Badge */}
                        {plan.name === 'Pro Plan' && !plan.isActive && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: 16,
                              right: 16,
                              bgcolor: '#ec4899',
                              color: 'white',
                              fontSize: '10px',
                              fontWeight: 700,
                              px: 2,
                              py: 0.75,
                              borderRadius: '12px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}
                          >
                            Popular
                          </Box>
                        )}
                        {plan.isActive && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: 16,
                              right: 16,
                              bgcolor: plan.name === 'Pro Plan' ? '#ec4899' : '#1a1a1a',
                              color: plan.name === 'Pro Plan' ? 'white' : '#9ca3af',
                              fontSize: '10px',
                              fontWeight: 600,
                              px: 2,
                              py: 0.75,
                              borderRadius: '12px',
                            }}
                          >
                            ACTIVE
                          </Box>
                        )}

                        {/* Icon */}
                        <Box className="mb-4" sx={{ color: plan.name === 'Pro Plan' ? '#ec4899' : '#9ca3af' }}>
                          {plan.icon}
                        </Box>

                        {/* Plan Name */}
                        <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
                          {plan.name}
                        </h3>

                        {/* Description */}
                        <p className="text-sm text-gray-400 mb-6">
                          {plan.description}
                        </p>

                        {/* Features */}
                        <Box className="space-y-3 mb-6">
                          {plan.features.map((feature, idx) => (
                            <Box key={idx} className="flex items-start gap-3">
                              <CheckIcon
                                sx={{
                                  fontSize: 20,
                                  color: plan.name === 'Pro Plan' ? '#ec4899' : 'white',
                                  flexShrink: 0,
                                  mt: 0.2
                                }}
                              />
                              <span className="text-sm text-white">
                                {feature}
                              </span>
                            </Box>
                          ))}
                        </Box>

                        {/* Credits */}
                        <Box className="mb-6">
                          <Box className="text-xs text-gray-500">
                            {plan.credits}
                          </Box>
                        </Box>

                        {/* Price and Button */}
                        {plan.price && (
                          <>
                            <Box className="mb-6">
                              <Box className="flex items-baseline gap-1">
                                <span className="text-2xl md:text-3xl font-bold text-white">{plan.price}</span>
                                <span className="text-sm text-gray-400">
                                  {plan.period}
                                </span>
                              </Box>
                            </Box>

                            {plan.showButton && (
                              <>
                                {plan.isActive && plan.portalUrl ? (
                                  <a
                                    href={plan.portalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-6 py-2.5 bg-pink-500 border border-pink-500 text-white rounded-lg hover:bg-pink-600 hover:border-pink-600 transition-all font-medium inline-block text-center w-full"
                                  >
                                    Manage Subscription
                                  </a>
                                ) : plan.isActive ? (
                                  <button
                                    disabled
                                    className="px-6 py-2.5 bg-gray-800 border border-gray-700 text-gray-500 rounded-lg cursor-not-allowed font-medium w-full"
                                  >
                                    Current Plan
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleSubscribe('pro')}
                                    className="px-6 py-2.5 bg-gradient-to-r from-pink-600 to-pink-500 border border-pink-500/30 text-white rounded-lg hover:from-pink-500 hover:to-pink-400 transition-all font-medium w-full shadow-lg shadow-pink-500/20"
                                  >
                                    {plan.buttonText}
                                  </button>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </Box>
                    ))}
                  </Box>

                  {/* Footer Note */}
                  <Box className="text-gray-500 text-sm max-w-5xl mx-auto mb-8">
                    *Prices are subject to tax depending on your location. Smartloop is powered by large language models.
                    While it can produce powerful results, its behavior is probabilistic—meaning it may occasionally make mistakes.
                  </Box>

                  {/* Billing History */}
                  {(subscription?.status === 'active' || subscription?.status === 'will_cancel') && subscription?.invoices?.length > 0 && (
                    <Box className="max-w-5xl mx-auto mt-6 md:mt-8">
                      <h3 className="text-lg md:text-xl font-semibold text-white mb-4">Billing History</h3>
                      <Box
                        sx={{
                          bgcolor: '#0a0a0a',
                          border: '1px solid #1a1a1a',
                          borderRadius: '16px',
                          overflow: 'hidden',
                        }}
                      >
                        <Box className="overflow-x-auto">
                          <table className="w-full">
                            <thead style={{ backgroundColor: '#1a1a1a' }}>
                              <tr>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {subscription.invoices.map((invoice: any, idx: number) => (
                                <tr
                                  key={invoice.id}
                                  style={{
                                    borderTop: idx > 0 ? '1px solid #1a1a1a' : 'none',
                                  }}
                                >
                                  <td className="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-400">
                                    {new Date(invoice.created * 1000).toLocaleDateString('en-US', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </td>
                                  <td className="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm font-medium text-gray-300">
                                    ${(invoice.amount_paid / 100).toFixed(2)}
                                  </td>
                                  <td className="px-3 md:px-6 py-3 whitespace-nowrap">
                                    <span
                                      style={{
                                        padding: '4px 12px',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        borderRadius: '12px',
                                        backgroundColor: invoice.status === 'paid' ? '#065f46' : '#92400e',
                                        color: invoice.status === 'paid' ? '#34d399' : '#fbbf24',
                                      }}
                                    >
                                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </Box>
                      </Box>
                    </Box>
                  )}
                </>
              )}

            </Box>
          </Box>
        </>
      )}
    </>
  );
}

