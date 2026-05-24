import React from 'react';

// Vite uses import.meta.env instead of process.env
const BASE_URL = import.meta.env.VITE_BASE_URL || "https://api.smartloop.ai";

export const API_ENDPOINT = `${BASE_URL}/v1`;
export const WS_ENDPOINT = `${BASE_URL}/ws`;
export const APP_URL = import.meta.env.VITE_APP_URL || "https://app.smartloop.ai";
export const API_BASE_URL = BASE_URL; // For OAuth app_url parameter

// Local SLP service endpoint (cached)
let _localApiUrl = null;
let _localApiUrlPromise = null;

// Listen for service-ready event to update cached URL
if (typeof window !== 'undefined' && window.electronAPI?.onSlpServiceReady) {
  window.electronAPI.onSlpServiceReady((data) => {
    if (data?.baseUrl) {
      console.log('[Constants] SLP service ready, updating URL to:', data.baseUrl);
      _localApiUrl = data.baseUrl;
      _localApiUrlPromise = null;
      // Notify any listeners
      window.dispatchEvent(new CustomEvent('slpServiceReady', { detail: data }));
    }
  });
}

// Listen for bootstrap progress events from main process and re-dispatch as DOM events
// Data is already normalised by the shared BootstrapProgress module in the main process.
if (typeof window !== 'undefined' && window.electronAPI?.onBootstrapProgress) {
  window.electronAPI.onBootstrapProgress((progress) => {
    console.log(`[Constants] Bootstrap progress: ${progress.percent}% — ${progress.status}`);

    // Dispatch modelInitStatus so chat knows a model is loading
    window.dispatchEvent(new CustomEvent('modelInitStatus', {
      detail: { loading: progress.downloading, model: progress.model }
    }));

    // Only dispatch download progress while still in progress.
    // When complete (downloading: false), modelInitStatus above already clears the UI —
    // dispatching here too would overwrite the null in the same React batch and keep the panel visible.
    if (progress.downloading) {
      window.dispatchEvent(new CustomEvent('modelDownloadProgress', {
        detail: { downloading: progress.downloading, model: progress.model, percent: progress.percent, status: progress.status, stage: progress.stage }
      }));
    }
  });
}

/**
 * Get the local SLP API base URL (e.g. http://localhost:38383)
 * Fetches from Electron main process; updates when service comes online.
 */
export const getLocalApiEndpoint = async () => {
  if (_localApiUrl) return _localApiUrl;

  try {
    if (typeof window !== 'undefined' && window.electronAPI?.getLocalApiUrl) {
      const url = await window.electronAPI.getLocalApiUrl();
      if (url) {
        _localApiUrl = url;
        return url;
      }
    }
  } catch (e) {
    console.warn('[Constants] Failed to get local API URL from Electron:', e);
  }
  // Return null if service isn't ready — don't cache so next call retries
  return null;
};

export const APP_DESCRIPTION = (
  <>
    <strong style={{ color: 'var(--sl-brand-primary)' }}> <a href="https://smartloop.ai" target="_blank" rel="noopener noreferrer" className="no-underline" style={{ color: 'var(--sl-brand-primary)', textDecoration: 'none' }}>Smartloop</a></strong> is an SLM platform designed to fine-tune and inference models on edge. Get started for free to extract information from your documents using AI tailored for developers and businesses with privacy and security at its core.
  </>
);

// Available color options for project labels (ordered by priority: critical to normal)
export const PROJECT_COLORS = [
  { name: 'Red', value: '#EC999999' },      // Critical
  { name: 'Orange', value: '#FB923C99' },    // High priority
  { name: 'Pink', value: '#F472B699' },     // High priority
  { name: 'Yellow', value: '#FBBF2499' },    // Medium priority
  { name: 'Amber', value: '#FCD34D99' },     // Medium priority
  { name: 'Purple', value: '#C4B5FD99' },   // Normal
  { name: 'Indigo', value: '#818CF899' },   // Normal
  { name: 'Blue', value: '#93C5FD99' },     // Normal
  { name: 'Teal', value: '#5EEAD499' },      // Low priority
  { name: 'Green', value: '#A7F3D099' },    // Low priority
];

// Default color (pink)
export const DEFAULT_COLOR = '#F472B699';
