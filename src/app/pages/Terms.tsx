'use client';

import { Box, IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <Box className="min-h-screen bg-black text-white">
      <Box className="p-8 max-w-4xl mx-auto">
          {/* Back Button */}
          <Box className="mb-6">
            <IconButton
              onClick={() => navigate(-1)}
              className="text-gray-400 hover:text-white"
              sx={{
                color: 'var(--sl-text-muted)',
                '&:hover': { color: 'var(--sl-text-primary)' }
              }}
            >
              <ArrowBackIcon />
            </IconButton>
          </Box>

          <Box className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Terms and Conditions</h1>
            <p className="text-gray-400">Effective Date: November 30, 2025</p>
          </Box>

          <Box className="prose prose-invert max-w-none space-y-8">
            {/* Introduction */}
            <Box className="rounded-xl p-6" sx={{ bgcolor: 'var(--sl-brand-alpha-5)', border: '1px solid var(--sl-brand-alpha-20)' }}>
              <p className="text-gray-300 leading-relaxed">
                These Terms and Conditions (the "Agreement") constitute a legally binding agreement between you ("User", "you", or "your") and Smartloop Inc., a corporation organized and existing under the laws of California ("Company", "we", "us", or "our"), concerning your access to and use of the Smartloop platform and related services (collectively, the "Service").
              </p>
              <p className="text-gray-300 leading-relaxed mt-4 font-semibold">
                BY ACCESSING OR USING THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THIS AGREEMENT. If you do not agree to these terms, you must not access or use the Service.
              </p>
            </Box>

            {/* Acceptance of Terms */}
            <Box>
              <h2 className="text-2xl font-bold text-white mb-4">Acceptance of Terms</h2>
              <Box className="text-gray-300 space-y-4 leading-relaxed">
                <p>By creating an account, accessing, or using any part of the Service, you expressly acknowledge and agree to be bound by this Agreement and our Privacy Policy, which is incorporated herein by reference.</p>
                <p>This Agreement may be updated from time to time at our sole discretion. We will provide notice of material changes through the Service or via email. Your continued use of the Service after such notice constitutes acceptance of the modified terms.</p>
                <p>You represent and warrant that you have the legal authority to enter into this Agreement and that you are at least eighteen (18) years of age or the age of majority in your jurisdiction, whichever is greater.</p>
              </Box>
            </Box>

            {/* Service Description */}
            <Box>
              <h2 className="text-2xl font-bold text-white mb-4">Service Description and Scope</h2>
              <Box className="text-gray-300 space-y-4 leading-relaxed">
                <p>The Service provides an enterprise-grade, no-code platform for fine-tuning Small Language Models (SLMs) using proprietary and custom data sources.</p>
                <p>The Service includes, but is not limited to: document processing, data vectorization, model fine-tuning capabilities, API access, and related infrastructure services.</p>
                <p>We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time with reasonable notice to users.</p>
              </Box>
            </Box>

            {/* User Responsibilities */}
            <Box>
              <h2 className="text-2xl font-bold text-white mb-4">User Responsibilities and Content</h2>
              <Box className="text-gray-300 space-y-4 leading-relaxed">
                <p><strong className="text-white">Content Ownership and Responsibility.</strong> You retain all rights, title, and interest in and to the content, data, and materials you upload, submit, or otherwise make available through the Service ("User Content").</p>
                <p><strong className="text-white">Content Compliance.</strong> You represent and warrant that your User Content:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Does not violate any applicable laws, regulations, or third-party rights;</li>
                  <li>Does not contain malicious code, viruses, or other harmful components;</li>
                  <li>Does not infringe upon intellectual property rights of any third party;</li>
                  <li>Does not contain personally identifiable information without proper authorization;</li>
                  <li>Complies with all applicable data protection and privacy laws.</li>
                </ul>
                <p><strong className="text-white">Indemnification.</strong> You agree to indemnify, defend, and hold harmless the Company from and against any claims, damages, losses, or expenses arising from your User Content or violation of this Agreement.</p>
              </Box>
            </Box>

            {/* Account Management */}
            <Box>
              <h2 className="text-2xl font-bold text-white mb-4">Account Management and Security</h2>
              <Box className="text-gray-300 space-y-4 leading-relaxed">
                <p><strong className="text-white">Account Creation.</strong> To access certain features of the Service, you must create an account by providing accurate, complete, and current information.</p>
                <p><strong className="text-white">Account Security.</strong> You are solely responsible for:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Maintaining the confidentiality of your account credentials;</li>
                  <li>All activities that occur under your account;</li>
                  <li>Immediately notifying us of any unauthorized access or security breaches.</li>
                </ul>
                <p><strong className="text-white">Account Termination.</strong> We reserve the right to suspend or terminate your account at our sole discretion for violation of this Agreement or for any other reason with reasonable notice.</p>
              </Box>
            </Box>

            {/* Fair Usage */}
            <Box>
              <h2 className="text-2xl font-bold text-white mb-4">Fair Usage and Service Limitations</h2>
              <Box className="text-gray-300 space-y-4 leading-relaxed">
                <p><strong className="text-white">Fair Usage Policy.</strong> To ensure optimal performance and equitable access for all users, the Service is subject to fair usage limitations regarding:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Data storage and processing capacity;</li>
                  <li>API request limits and rate limiting;</li>
                  <li>Computational resources and bandwidth utilization;</li>
                  <li>Model training and fine-tuning operations.</li>
                </ul>
                <p><strong className="text-white">Usage Monitoring.</strong> We monitor usage patterns and reserve the right to implement additional restrictions or require plan upgrades for users exceeding reasonable usage thresholds.</p>
                <p><strong className="text-white">Service Availability.</strong> While we strive for high availability, we do not guarantee uninterrupted access to the Service and reserve the right to perform maintenance and updates.</p>
              </Box>
            </Box>

            {/* Data Handling */}
            <Box>
              <h2 className="text-2xl font-bold text-white mb-4">Data Handling and Privacy</h2>
              <Box className="text-gray-300 space-y-4 leading-relaxed">
                <p><strong className="text-white">Data Collection and Processing.</strong> Our collection, use, and processing of personal data is governed by our Privacy Policy, which forms an integral part of this Agreement.</p>
                <p><strong className="text-white">Data Security Measures.</strong> We implement industry-standard security measures including:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Encryption of data in transit and at rest;</li>
                  <li>Access controls and authentication mechanisms;</li>
                  <li>Regular security audits and vulnerability assessments;</li>
                  <li>Compliance with applicable data protection regulations.</li>
                </ul>
                <p><strong className="text-white">Data Retention and Deletion.</strong> We retain your data only as long as necessary to provide the Service or as required by applicable law. Upon account termination, we will delete or anonymize your data in accordance with our data retention policies.</p>
                <p><strong className="text-white">Data Location and Transfer.</strong> Your data may be processed and stored in facilities located in the United States or other jurisdictions where we or our service providers operate.</p>
              </Box>
            </Box>

            {/* Intellectual Property */}
            <Box>
              <h2 className="text-2xl font-bold text-white mb-4">Intellectual Property Rights</h2>
              <Box className="text-gray-300 space-y-4 leading-relaxed">
                <p><strong className="text-white">Company IP.</strong> The Service, including all software, technology, content, and materials provided by us, is protected by intellectual property laws and remains our exclusive property.</p>
                <p><strong className="text-white">Limited License.</strong> Subject to this Agreement, we grant you a limited, non-exclusive, non-transferable license to access and use the Service for your internal business purposes.</p>
                <p><strong className="text-white">User Content License.</strong> By uploading User Content, you grant us a limited license to process, store, and use such content solely for the purpose of providing the Service to you.</p>
              </Box>
            </Box>

            {/* Disclaimers */}
            <Box>
              <h2 className="text-2xl font-bold text-white mb-4">Disclaimers and Limitation of Liability</h2>
              <Box className="text-gray-300 space-y-4 leading-relaxed">
                <p><strong className="text-white">Service Disclaimer.</strong> THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.</p>
                <p><strong className="text-white">Limitation of Liability.</strong> TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE COMPANY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR USE.</p>
                <p><strong className="text-white">Maximum Liability.</strong> Our total liability for any claims arising from or related to this Agreement shall not exceed the amount paid by you for the Service during the twelve (12) months preceding the claim.</p>
              </Box>
            </Box>

            {/* Governing Law */}
            <Box>
              <h2 className="text-2xl font-bold text-white mb-4">Governing Law and Dispute Resolution</h2>
              <Box className="text-gray-300 space-y-4 leading-relaxed">
                <p><strong className="text-white">Governing Law.</strong> This Agreement shall be governed by and construed in accordance with the laws of the State of California, United States, without regard to its conflict of law principles.</p>
                <p><strong className="text-white">Jurisdiction.</strong> Any disputes arising from this Agreement shall be resolved exclusively in the state and federal courts located in California, and you consent to the personal jurisdiction of such courts.</p>
                <p><strong className="text-white">Alternative Dispute Resolution.</strong> Prior to initiating any legal proceedings, the parties agree to attempt to resolve disputes through good faith negotiations for a period of thirty (30) days.</p>
              </Box>
            </Box>

            {/* General Provisions */}
            <Box>
              <h2 className="text-2xl font-bold text-white mb-4">General Provisions</h2>
              <Box className="text-gray-300 space-y-4 leading-relaxed">
                <p><strong className="text-white">Entire Agreement.</strong> This Agreement, together with our Privacy Policy, constitutes the entire agreement between you and the Company regarding the Service.</p>
                <p><strong className="text-white">Severability.</strong> If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.</p>
                <p><strong className="text-white">Assignment.</strong> You may not assign or transfer your rights under this Agreement without our prior written consent. We may assign this Agreement without restriction.</p>
                <p><strong className="text-white">Contact Information.</strong> For questions regarding this Agreement, please contact us at <a href="mailto:tos@smartloop.ai" className="text-pink-400 hover:text-pink-300">tos@smartloop.ai</a>.</p>
              </Box>
            </Box>

            {/* Footer */}
            <Box className="mt-12 pt-8 border-t border-gray-700">
              <p className="text-gray-400 text-sm">Initial Version: 1.0 | Effective Date: November 30, 2025</p>
            </Box>
          </Box>
        </Box>
      </Box>
  );
}
