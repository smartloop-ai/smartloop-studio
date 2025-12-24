'use client'

import '../styles/login.css';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';


import { API_ENDPOINT, APP_DESCRIPTION } from '@/app/constants';
import { isValidEmail } from '@/app/shared/utils';
import { Box, CircularProgress, IconButton, InputAdornment, TextField, Popover, Typography } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SocialLogin from '@/app/components/social-login';


export default function Signup() {
	const navigate = useNavigate();
	const [successMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [helpAnchorEl, setHelpAnchorEl] = useState<HTMLElement | null>(null);
	const [inviteCode, setInviteCode] = useState("");
	const [formData, setFormData] = useState({
		password: "",
		name: "",
		email: ""
	});

	useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const inviteCodeParam = urlParams.get('inviteCode');
		if (inviteCodeParam) {
			setInviteCode(inviteCodeParam);
			console.log("Found inviteCode: " + inviteCode + " using it for signup.");
		}
	});

	const handleInput = (e: any) => {
		const fieldName = e.target.name;
		const fieldValue = e.target.value;

		setFormData((prevState) => ({
			...prevState,
			[fieldName]: fieldValue
		}));
	}

	const submitForm = async (e: any) => {
		e.preventDefault();

		setErrorMessage("");
		setDirty(true);

		const url = `${API_ENDPOINT}/auth/register`;

		if (formData.email.length === 0
			|| formData.password.length === 0
			|| formData.name.length === 0) {
			return;
		}

		if (formData.name.split(' ').length == 1) {
			setErrorMessage("Name must contain first and last name separated by a space");
			return;
		}

		if (!isValidEmail(formData.email)) {
			setErrorMessage("Email address is invalid");
			return;
		}

		setIsLoading(true);

		const options = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				password: formData.password,
				email: formData.email,
				name: formData.name,
				invite_code: inviteCode
			})
		}

		try {
			const response = await fetch(url, options);
			const result = await response.json();

			setIsLoading(false);

			if (response.ok) {
				navigate('/login');
			} else {
				setErrorMessage(result.detail || "Registration failed. Please try again.");
			}
		} catch (error) {
			setIsLoading(false);
			setErrorMessage("An error occurred. Please try again.");
		}
	}

	return (
		<Box className="min-h-screen bg-black flex flex-col">
			{/* Top Navigation */}
			<Box className="flex justify-between items-center p-6">
				<a href="/" className="flex items-center gap-0">
					<span className="text-xl font-bold text-white">smartloop</span>
					<span className="text-pink-500 text-xl font-bold">.</span>
				</a>
				<IconButton
					onClick={(e) => setHelpAnchorEl(e.currentTarget)}
					sx={{
						border: '1px solid #374151',
						borderRadius: '8px',
						color: 'white',
						'&:hover': {
							bgcolor: '#1a1a1a',
						},
					}}
				>
					<HelpOutlineIcon />
				</IconButton>
				<Popover
					open={Boolean(helpAnchorEl)}
					anchorEl={helpAnchorEl}
					onClose={() => setHelpAnchorEl(null)}
					anchorOrigin={{
						vertical: 'bottom',
						horizontal: 'right',
					}}
					transformOrigin={{
						vertical: 'top',
						horizontal: 'right',
					}}
					PaperProps={{
						sx: {
							bgcolor: '#1a1a1a',
							border: '1px solid #2a2a2a',
							borderRadius: '12px',
							maxWidth: '400px',
							mt: 1,
						}
					}}
				>
					<Box sx={{ p: 3 }}>
						<Typography variant="body2" sx={{ color: '#e5e7eb', lineHeight: 1.6 }}>
							{APP_DESCRIPTION}
						</Typography>
					</Box>
				</Popover>
			</Box>

			{/* Main Content */}
			<Box className="flex-1 flex items-center justify-center px-6">
				<Box
					sx={{
						maxWidth: '460px',
						width: '100%',
						bgcolor: '#0a0a0a',
						border: '1px solid #1a1a1a',
						borderRadius: '16px',
						padding: '40px',
					}}
				>
					<h1 className="text-3xl font-normal text-white mb-8">Join Smartloop</h1>

					{successMessage.length > 0 && (
						<Box className="mb-4 p-3 bg-green-900 bg-opacity-20 border border-green-800 rounded-lg">
							<p className="text-green-400 text-sm">{successMessage}</p>
						</Box>
					)}

					{errorMessage.length > 0 && (
						<Box className="mb-4 p-3 bg-red-900 bg-opacity-20 border border-red-800 rounded-lg">
							<p className="text-red-400 text-sm">{errorMessage}</p>
						</Box>
					)}

					<form onSubmit={submitForm}>
						{/* Social Login Buttons */}
						<SocialLogin onError={(msg: string) => setErrorMessage(msg)} />

						{/* Divider */}
						<Box className="my-6">
							<p className="text-gray-400 text-sm">Or, sign up with your email</p>
						</Box>

						{/* Name Input */}
						<Box className="mb-4">
							<TextField
								id="name"
								name="name"
								type="text"
								placeholder="Name*"
								value={formData.name}
								onChange={handleInput}
								fullWidth
								error={formData.name.length === 0 && dirty}
								sx={{
									'& .MuiOutlinedInput-root': {
										bgcolor: '#0a0a0a',
										color: 'white',
										borderRadius: '8px',
										'& fieldset': {
											borderColor: '#374151',
										},
										'&:hover fieldset': {
											borderColor: '#4b5563',
										},
										'&.Mui-focused fieldset': {
											borderColor: '#6b7280',
										},
										'&.Mui-error fieldset': {
											borderColor: '#ef4444',
										},
									},
									'& .MuiInputBase-input': {
										color: 'white',
										'&::placeholder': {
											color: '#9ca3af',
											opacity: 1,
										},
									},
								}}
							/>
						</Box>

						{/* Email Input */}
						<Box className="mb-4">
							<TextField
								id="email"
								name="email"
								type="email"
								placeholder="Email*"
								value={formData.email}
								onChange={handleInput}
								fullWidth
								error={formData.email.length === 0 && dirty}
								sx={{
									'& .MuiOutlinedInput-root': {
										bgcolor: '#0a0a0a',
										color: 'white',
										borderRadius: '8px',
										'& fieldset': {
											borderColor: '#374151',
										},
										'&:hover fieldset': {
											borderColor: '#4b5563',
										},
										'&.Mui-focused fieldset': {
											borderColor: '#6b7280',
										},
										'&.Mui-error fieldset': {
											borderColor: '#ef4444',
										},
									},
									'& .MuiInputBase-input': {
										color: 'white',
										'&::placeholder': {
											color: '#9ca3af',
											opacity: 1,
										},
									},
								}}
							/>
						</Box>

						{/* Password Input */}
						<Box className="mb-4">
							<TextField
								id="password"
								name="password"
								type={showPassword ? 'text' : 'password'}
								placeholder="Password*"
								value={formData.password}
								onChange={handleInput}
								fullWidth
								error={formData.password.length === 0 && dirty}
								InputProps={{
									endAdornment: (
										<InputAdornment position="end">
											<IconButton
												onClick={() => setShowPassword(!showPassword)}
												edge="end"
												sx={{ color: '#9ca3af' }}
											>
												{showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
											</IconButton>
										</InputAdornment>
									),
								}}
								sx={{
									'& .MuiOutlinedInput-root': {
										bgcolor: '#0a0a0a',
										color: 'white',
										borderRadius: '8px',
										'& fieldset': {
											borderColor: '#374151',
										},
										'&:hover fieldset': {
											borderColor: '#4b5563',
										},
										'&.Mui-focused fieldset': {
											borderColor: '#6b7280',
										},
										'&.Mui-error fieldset': {
											borderColor: '#ef4444',
										},
									},
									'& .MuiInputBase-input': {
										color: 'white',
										'&::placeholder': {
											color: '#9ca3af',
											opacity: 1,
										},
									},
								}}
							/>
						</Box>

						{/* Invite Code Input (if present) */}
						{inviteCode && (
							<Box className="mb-4">
								<TextField
									id="inviteCode"
									name="inviteCode"
									type="text"
									placeholder="Invite Code"
									value={inviteCode}
									disabled
									fullWidth
									sx={{
										'& .MuiOutlinedInput-root': {
											bgcolor: '#0a0a0a',
											color: 'white',
											borderRadius: '8px',
											'& fieldset': {
												borderColor: '#374151',
											},
										},
										'& .MuiInputBase-input': {
											color: '#9ca3af',
										},
									}}
								/>
							</Box>
						)}

						{/* Forgot Password Link */}
						<Box className="mb-6 text-left">
							<a
								href="/forgot"
								className="text-sm text-gray-300 hover:text-white underline"
							>
								Forgot your password?
							</a>
						</Box>

						{/* Create Account Button */}
						<button
							type="submit"
							disabled={isLoading}
							className="w-full py-3 rounded-lg font-medium transition-all mb-6"
							style={{
								background: 'linear-gradient(to right, #e9d5ff, #ddd6fe)',
								color: '#1f2937',
							}}
						>
							{isLoading ? <CircularProgress size={20} sx={{ color: '#1f2937' }} /> : 'Create Account'}
						</button>

						{/* Footer Text */}
						<Box className="text-center">
							<p className="text-sm text-gray-400">
								By joining, you agree to the{' '}
								<a href="/terms" className="underline hover:text-white">
									Terms and Privacy Policy.
								</a>
							</p>
						</Box>
					</form>
				</Box>
			</Box>
		</Box>
	);
}

