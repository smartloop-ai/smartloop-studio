import React from 'react';

// Vite uses import.meta.env instead of process.env
const BASE_URL = import.meta.env.VITE_BASE_URL || "https://api.smartloop.ai";

export const API_ENDPOINT = `${BASE_URL}/v1`;
export const WS_ENDPOINT = `${BASE_URL}/ws`;
export const APP_URL = import.meta.env.VITE_APP_URL || "https://app.smartloop.ai";
export const API_BASE_URL = BASE_URL; // For OAuth app_url parameter

export const APP_DESCRIPTION = (
  <>
    <strong style={{ color: '#ec4899' }}> <a href="https://smartloop.ai" target="_blank" rel="noopener noreferrer" className="no-underline" style={{ color: '#ec4899', textDecoration: 'none' }}>Smartloop</a></strong> is an SLM platform designed to fine-tune and inference models on edge. Get started for free to extract information from your documents using AI tailored for developers and businesses with privacy and security at its core.
  </>
);

// Available color options for project labels
export const PROJECT_COLORS = [
  { name: 'Pink', value: 'rgba(244, 114, 182, 0.6)' },
  { name: 'Red', value: 'rgba(236, 153, 153, 0.6)' },
  { name: 'Orange', value: 'rgba(251, 146, 60, 0.6)' },
  { name: 'Yellow', value: 'rgba(251, 191, 36, 0.6)' },
  { name: 'Green', value: 'rgba(167, 243, 208, 0.6)' },
  { name: 'Teal', value: 'rgba(94, 234, 212, 0.6)' },
  { name: 'Blue', value: 'rgba(147, 197, 253, 0.6)' },
  { name: 'Indigo', value: 'rgba(129, 140, 248, 0.6)' },
  { name: 'Purple', value: 'rgba(196, 181, 253, 0.6)' },
  { name: 'Amber', value: 'rgba(252, 211, 77, 0.6)' },
];

// Default color (pink)
export const DEFAULT_COLOR = 'rgba(244, 114, 182, 0.6)';
