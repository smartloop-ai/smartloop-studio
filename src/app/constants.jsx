import React from 'react';

// Vite uses import.meta.env instead of process.env
const BASE_URL = import.meta.env.VITE_BASE_URL || "https://api.smartloop.ai";

export const API_ENDPOINT = `${BASE_URL}/v1`;
export const WS_ENDPOINT = `${BASE_URL}/ws`;

export const APP_DESCRIPTION = (
  <>
    <strong style={{ color: '#ec4899' }}> <a href="https://smartloop.ai" target="_blank" rel="noopener noreferrer" className="no-underline" style={{ color: '#ec4899', textDecoration: 'none' }}>Smartloop</a></strong> is an SLM platform designed to fine-tune and inference models on edge. Get started for free to extract information from your documents using AI tailored for developers and businesses with privacy and security at its core.
  </>
);
