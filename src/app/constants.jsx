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
