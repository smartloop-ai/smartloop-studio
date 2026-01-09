import { useEffect, useState } from 'react';
import { userService } from '@/app/services/user.service';
import { OAuthUtils } from '@/app/shared/utils'; // Add this import

import { API_ENDPOINT } from '@/app/constants';
import Breadcrumb from '@/app/components/breadcrumb';
import Sidebar from '@/app/components/sidebar';
import { useAuth } from '@/app/hooks/useAuth';
import { CircularProgress, Box } from '@mui/material';
import AddBoxIcon from '@mui/icons-material/AddBox';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import MobileNav from '@/app/components/mobile-nav';
import moment from 'moment';

export default function Developers() {
  const [user] = useAuth();
  const [, setErrorMessage] = useState("");
  const [, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied]: any = useState(false);
  const [tokens, setTokens] = useState<{ id: string; name: string, created_at: Date, last_used_at: Date }[]>([]);
  const [tokenName, setTokenName] = useState("");
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [brewCommandsCopied, setBrewCommandsCopied] = useState(false);
  const [showTokenList, setShowTokenList] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);


  const getTokens = async () => {
    setErrorMessage("");
    setIsLoading(true);

    const url = `${API_ENDPOINT}/users/me/tokens`;

    try {
      const response = await userService.makeAuthenticatedRequest(url, {
        method: 'GET'
      });

      if (response && response.ok) {
        const tokenData = await response.json();

        if (Array.isArray(tokenData)) {
          setTokens(tokenData);
        } else {
          console.log("Unexpected response format when fetching tokens");
        }

      } else if (response) {
        console.error("Failed to fetch tokens: ", response.status);
      }

    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
      console.error("Failed to fetch tokens: ", err);
    } finally {
      setIsLoading(false);
    }
  }

  const createToken = async () => {
    setErrorMessage("");
    setDirty(true);

    if (!tokenName.trim()) {
      return;
    }

    const url = `${API_ENDPOINT}/users/me/tokens`;
    setIsLoading(true);

    try {
      const response = await userService.makeAuthenticatedRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: tokenName
        })
      });

      if (response && response.ok) {
        const result = await response.json();

        if (result) {
          setTokens(prevTokens => [...prevTokens, result]); // Append new token to list
          setRawToken(result.token); // Show the raw token once
          setTokenName(""); // Clear input field
          setSuccessMessage("");
          setDirty(false);
          setCopied(false); // Reset copied state
          getTokens();
        }
      } else if (response) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

  const deleteToken = async (tokenId: string) => {
    console.log(`Delete token: ${tokenId}`);
    setSuccessMessage("");
    setErrorMessage("");
    setIsLoading(true);

    try {
      // Use the shared utility function
      const success = await OAuthUtils.deleteToken(
        tokenId,
        `${userService.token()}`
      );

      if (success) {
        // Remove the token from the state list on successful delete
        setTokens(prevTokens => prevTokens.filter(token => token.id !== tokenId));
        setSuccessMessage("Token successfully deleted!");
        setRawToken("");
        console.log(`Successfully deleted token id: ${tokenId}`);
      } else {
        setErrorMessage("Failed to delete token");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      getTokens();
    }
  }, [user]);


  return (
    <>
      {user && (
        <>
          <Sidebar user={user} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

          <Box className="min-h-screen bg-black text-white" sx={{ marginLeft: { xs: 0, md: '280px' } }}>
            <Box className="px-4 md:px-8 pb-6 md:pb-8 pt-4">
              <MobileNav onMenuClick={() => setMobileMenuOpen(true)} />
              <Box className="welcome-page mt-10">
                <Box className="welcome-page__container">
                  <Box className="welcome-page__body max-w-4xl mx-auto">
                    {/* CLI Setup Instructions */}
                    <div className="border border-gray-700/50 rounded-2xl p-4 md:p-6 text-left bg-gradient-to-br from-gray-900/50 to-gray-800/30">
                  <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
                        <div className="p-2 bg-pink-500/10 rounded-lg">
                          <svg className="w-6 h-6 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-xl md:text-2xl font-bold text-white">Getting Started</h3>
                          <p className="text-xs md:text-sm text-gray-400">Follow these steps to set up the Smartloop Platform</p>
                        </div>
                      </div>

                      <div className="space-y-4 md:space-y-6">
                        {/* Step 1 */}
                        <div className="flex gap-2 md:gap-4">
                          <div className="flex-shrink-0 w-8 h-8 bg-pink-500/10 border-2 border-pink-500/50 rounded-lg flex items-center justify-center text-pink-400 font-bold text-sm">
                            1
                          </div>
                          <div className="flex-1">
                            <p className="text-gray-100 font-semibold mb-2 md:mb-3 text-sm md:text-base">Install the CLI with Homebrew</p>
                            <div className="relative">
                              <pre className="bg-gray-950 border border-gray-700/50 px-3 md:px-4 py-3 md:py-3.5 rounded-xl text-pink-300 font-mono text-xs md:text-sm overflow-x-auto pr-12 md:pr-14 shadow-lg">
                                <code>brew tap smartloop-ai/smartloop{'\n'}brew install smartloop</code>
                              </pre>
                              <CopyToClipboard
                                text={`brew tap smartloop-ai/smartloop\nbrew install smartloop`}
                                onCopy={() => {
                                  setBrewCommandsCopied(true);
                                  setTimeout(() => setBrewCommandsCopied(false), 2000);
                                }}
                              >
                                <button className="absolute top-2.5 right-2.5 hover:bg-gray-700/80 p-2 rounded-lg transition-all hover:scale-105">
                                  {brewCommandsCopied ? (
                                    <CheckCircleIcon className="text-green-400" fontSize="small" />
                                  ) : (
                                    <ContentCopyIcon className="text-gray-400 hover:text-gray-300" fontSize="small" />
                                  )}
                                </button>
                              </CopyToClipboard>
                            </div>
                          </div>
                        </div>

                        {/* Step 2 */}
                        <div className="flex gap-2 md:gap-4">
                          <div className="flex-shrink-0 w-8 h-8 bg-pink-500/10 border-2 border-pink-500/50 rounded-lg flex items-center justify-center text-pink-400 font-bold text-sm">
                            2
                          </div>
                          <div className="flex-1">
                            <p className="text-gray-100 font-semibold text-sm md:text-base mb-2 md:mb-3">Generate a developer token</p>

                            {/* New Token Display */}
                            {rawToken && (
                              <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/10 border-2 border-green-500/30 rounded-xl p-4 shadow-lg mb-4 max-w-full overflow-hidden">
                                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <CheckCircleIcon className="text-green-400" fontSize="small" />
                                    <span className="text-xs font-bold text-green-400 uppercase tracking-wide">Token Generated</span>
                                  </div>
                                  <span className="text-xs text-yellow-400 flex items-center gap-1.5 bg-yellow-500/10 px-2 py-1 rounded-full border border-yellow-500/30">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                    Save now
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 bg-gray-950 border border-gray-700 rounded-lg p-3 min-w-0">
                                  <code className="flex-1 text-pink-300 break-all text-xs font-mono overflow-hidden">{rawToken}</code>
                                  <CopyToClipboard text={rawToken} onCopy={() => setCopied(true)}>
                                    <button className="bg-gray-800 hover:bg-gray-700 p-2 rounded-lg transition-all hover:scale-105 flex-shrink-0" title="Copy token">
                                      {copied ? <CheckCircleIcon className="text-green-400" fontSize="small" /> : <ContentCopyIcon className="text-gray-400" fontSize="small" />}
                                    </button>
                                  </CopyToClipboard>
                                </div>
                              </div>
                            )}

                            {/* Sliding Tab Navigation */}
                            <div className="relative bg-gray-800/50 rounded-xl p-1 mb-4 border border-gray-700/50">
                              <div
                                className="absolute top-1 bottom-1 bg-pink-500/20 border border-pink-500/50 rounded-lg transition-all duration-300 ease-out"
                                style={{
                                  left: showTokenList ? '50%' : '4px',
                                  right: showTokenList ? '4px' : '50%',
                                }}
                              />
                              <div className="relative flex gap-1">
                                <button
                                  onClick={() => setShowTokenList(false)}
                                  className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all duration-200 z-10 ${!showTokenList
                                    ? 'text-pink-400'
                                    : 'text-gray-400 hover:text-gray-300'
                                    }`}
                                >
                                  Generate Token
                                </button>
                                <button
                                  onClick={() => setShowTokenList(true)}
                                  className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all duration-200 z-10 ${showTokenList
                                    ? 'text-pink-400'
                                    : 'text-gray-400 hover:text-gray-300'
                                    }`}
                                >
                                  Active Tokens ({tokens.length})
                                </button>
                              </div>
                            </div>

                            {/* Token Generation Form */}
                            {!showTokenList ? (
                              <>
                                <div className="relative">
                                  <input
                                    autoComplete="off"
                                    type="text"
                                    value={tokenName}
                                    onChange={(e) => setTokenName(e.target.value)}
                                    placeholder="(e.g., Production, Staging)"
                                    className={`popup__name-input input my-0 px-4 py-3.5 pr-14 w-full h-14 rounded-xl text-white bg-gray-900/50 border ${tokenName.trim().length === 0 && dirty
                                      ? "border-red-500 focus:ring-red-500"
                                      : "border-gray-600 focus:border-pink-500"
                                      } focus:outline-none focus:ring-2 focus:ring-pink-500/50 placeholder-gray-500 transition-all`}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        createToken();
                                      }
                                    }}
                                  />
                                  <button
                                    onClick={createToken}
                                    disabled={isLoading}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-80 transition-opacity"
                                    title="Generate token"
                                  >
                                    {isLoading ? <CircularProgress size={20} className="text-white" /> : <AddBoxIcon className="text-white text-2xl" />}
                                  </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Press Enter to generate</p>
                              </>
                            ) : (
                              <div className="max-h-96 overflow-y-auto">
                                {tokens.length === 0 ? (
                                  <div className="text-center py-8">
                                    <p className="text-gray-500 text-sm">No tokens generated</p>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {tokens.map((token) => (
                                      <div key={token.id} className="border border-gray-700/50 bg-gray-900/30 rounded-xl p-4 hover:border-pink-500/30 hover:bg-gray-900/50 transition-all group">
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                          <code className="text-white font-semibold text-sm break-all">{token.name}</code>
                                          <button
                                            onClick={() => deleteToken(token.id)}
                                            className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all flex-shrink-0"
                                            title="Delete token"
                                          >
                                            <DeleteIcon fontSize="small" />
                                          </button>
                                        </div>
                                        <div className="text-xs text-gray-400 space-y-1.5">
                                          <div className="flex items-center gap-1.5">
                                            <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                            <span className="font-mono text-gray-300">{token.created_at ? moment(token.created_at).isValid() ? moment(token.created_at).format("MMM DD, YYYY") : "Invalid" : "--"}</span>
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-gray-500">Last: </span>
                                            <span className="font-mono text-gray-300">{token.last_used_at ? moment(token.last_used_at).format("MMM DD") : "Never"}</span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Step 3 */}
                        <div className="flex gap-4">
                          <div className="flex-shrink-0 w-8 h-8 bg-pink-500/10 border-2 border-pink-500/50 rounded-lg flex items-center justify-center text-pink-400 font-bold text-sm">
                            3
                          </div>
                          <div className="flex-1">
                            <p className="text-gray-100 font-semibold mb-2 text-base">Authenticate with the CLI</p>
                            <p className="text-gray-400 text-sm mb-2">Run the login command and paste your token when prompted:</p>
                            <code className="bg-gray-950 border border-gray-700/50 px-3 py-1.5 rounded-lg text-pink-300 font-mono text-sm inline-block">smartloop login</code>
                          </div>
                        </div>
                      </div>

                      <div className="mt-8 pt-6 border-t border-gray-700/50">
                        <div className="flex items-start gap-3 text-sm bg-pink-500/5 border border-pink-500/20 rounded-lg p-4">
                          <svg className="w-5 h-5 text-pink-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                          <div>
                            <p className="text-gray-200 font-medium mb-1">Need help getting started?</p>
                            <p className="text-gray-400">Check out our <a href="https://www.smartloop.ai/docs/getting-started" target="_blank" className="text-pink-400 hover:text-pink-300 hover:underline font-medium transition-colors">detailed documentation and screencast →</a></p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        </>
      )}
    </>
  );
}

