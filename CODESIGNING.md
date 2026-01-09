# macOS Code Signing Setup Guide

This guide explains how to set up code signing for your macOS Electron app to prevent the "app is corrupt" error.

## Prerequisites

1. **Apple Developer Account** - You need an active Apple Developer Program membership ($99/year)
2. **Certificates** - Developer ID Application certificate from Apple
3. **App-Specific Password** - For notarization

## Step 1: Create Developer ID Certificate

1. Go to [Apple Developer Certificates](https://developer.apple.com/account/resources/certificates/list)
2. Click the **+** button to create a new certificate
3. Select **Developer ID Application** (for distribution outside Mac App Store)
4. Follow the prompts to create a Certificate Signing Request (CSR) using Keychain Access on your Mac
5. Upload the CSR and download your certificate
6. Double-click to install it in your Keychain

## Step 2: Export Certificate as P12

1. Open **Keychain Access** on your Mac
2. Find your "Developer ID Application" certificate under "My Certificates"
3. Right-click and select **Export**
4. Save as `.p12` format with a strong password
5. Convert to base64:
   ```bash
   base64 -i certificate.p12 | pbcopy
   ```
   This copies the base64 string to your clipboard

## Step 3: Generate App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in with your Apple ID
3. In the "Security" section, click **Generate Password** under "App-Specific Passwords"
4. Label it something like "Electron Builder Notarization"
5. Save the generated password (you can't see it again)

## Step 4: Find Your Team ID

1. Go to [Apple Developer Membership](https://developer.apple.com/account/#/membership)
2. Your Team ID is listed there (10-character alphanumeric string)

## Step 5: Add GitHub Secrets

Add these secrets to your GitHub repository:

1. Go to your repository on GitHub
2. Navigate to **Settings → Secrets and variables → Actions**
3. Click **New repository secret** and add each of these:

| Secret Name | Value | Description |
|------------|-------|-------------|
| `APPLE_CERTIFICATE_BASE64` | Base64 string from Step 2 | Your exported .p12 certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password from Step 2 | Password you used when exporting the .p12 |
| `APPLE_ID` | Your Apple ID email | The email for your Apple Developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | Password from Step 3 | App-specific password for notarization |
| `APPLE_TEAM_ID` | Team ID from Step 4 | Your 10-character team identifier |

## Step 6: Test the Build

1. Push your changes to trigger the GitHub Action
2. The workflow will now:
   - Import your certificates
   - Sign the macOS app with your Developer ID
   - Notarize the app with Apple
   - Create a DMG and ZIP file

## Local Building with Code Signing

To build locally with code signing:

```bash
# Set environment variables
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your_certificate_password
export APPLE_ID=your@apple-id.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX

# Build for macOS
make build-electron-mac
```

## Troubleshooting

### "App is damaged and can't be opened"
- Ensure `hardenedRuntime: true` is set in electron-builder.yml ✅
- Verify certificates are valid and not expired
- Check that notarization completed successfully

### "Code signing failed"
- Verify `APPLE_CERTIFICATE_BASE64` is correct (proper base64 encoding)
- Check that `APPLE_CERTIFICATE_PASSWORD` matches the password used during export
- Ensure certificate hasn't expired

### "Notarization failed"
- Verify `APPLE_ID` is correct (the email associated with your developer account)
- Check that `APPLE_APP_SPECIFIC_PASSWORD` is an app-specific password, not your regular Apple ID password
- Confirm `APPLE_TEAM_ID` matches your developer team ID
- Check GitHub Actions logs for specific notarization errors

### "Certificate not found"
- Make sure you're using "Developer ID Application" certificate, not "Mac Developer" or "Mac App Distribution"
- Certificate must be valid and installed in your Keychain

## Additional Resources

- [Electron Builder Code Signing](https://www.electron.build/code-signing)
- [Apple Notarization Documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Electron Code Signing Guide](https://www.electronjs.org/docs/latest/tutorial/code-signing)

## Security Notes

⚠️ **Never commit certificates or passwords to your repository!**
- Always use GitHub Secrets for sensitive data
- Use `.gitignore` to exclude `.p12` files
- Rotate app-specific passwords periodically
- Use repository secrets, not environment secrets for better security
