# GitHub Actions Setup for Electron Build & Deploy

This document explains how to set up GitHub Actions to build and deploy the Smartloop Studio Electron app.

## Overview

The workflow builds the Electron app for:
- **Linux**: `.AppImage`, `.deb`, `.rpm`
- **macOS**: `.dmg`, `.zip`
- **Windows**: `.exe`

Then uploads all builds to a Google Cloud Storage bucket.

## Setup Instructions

### 1. Create a GCP Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **IAM & Admin** > **Service Accounts**
3. Click **Create Service Account**
4. Name it: `github-actions-electron-deploy`
5. Grant roles:
   - **Storage Object Admin** (for uploading files)
   - Or **Storage Admin** (for full bucket access)
6. Click **Done**

### 2. Create Service Account Key

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** > **Create new key**
4. Choose **JSON** format
5. Download the JSON file (keep it secure!)

### 3. Set Up GitHub Secrets

Go to your GitHub repository:
1. Navigate to **Settings** > **Secrets and variables** > **Actions**
2. Click **New repository secret**
3. Add the following secrets:

#### Required Secrets:

**`GCP_SA_KEY`**
- Paste the entire contents of the JSON key file downloaded in step 2
- This authenticates GitHub Actions to upload to GCP

**`VITE_BASE_URL`**
- Production API URL
- Example: `https://api.smartloop.ai`

**`VITE_APP_URL`**
- Production companion app URL  
- Example: `https://docgpt.smartloop.ai`

#### Note on GH_TOKEN:

The workflow automatically uses `GITHUB_TOKEN` (provided by GitHub Actions) for:
- Publishing releases
- Auto-update functionality
- Accessing repository information

**No manual setup required** - `GITHUB_TOKEN` is automatically available with `contents: write` permission.

### 4. Update Workflow Configuration

Edit `.github/workflows/build-and-deploy.yml`:

```yaml
env:
  GCP_BUCKET: gs://your-bucket-name/electron-releases  # Update this!
  APP_NAME: smartloop-studio
```

Replace `your-bucket-name` with your actual GCS bucket name.

### 5. Create the GCP Bucket (if not exists)

```bash
# Create bucket
gsutil mb -p YOUR_PROJECT_ID -c STANDARD -l US gs://your-bucket-name

# Optional: Make it publicly accessible
gsutil iam ch allUsers:objectViewer gs://your-bucket-name
```

## Triggering Builds

### Automatic Triggers

The workflow runs automatically on:
- Push to `main` branch
- Push to `develop` branch
- Creating a version tag (e.g., `v1.0.0`)

### Manual Trigger

1. Go to **Actions** tab in GitHub
2. Select **Build and Deploy Electron App**
3. Click **Run workflow**
4. Choose the branch
5. Click **Run workflow**

## Version Tagging

To create a release with version number:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This will:
- Build all platforms
- Upload to: `gs://your-bucket-name/electron-releases/v1.0.0/`
- Also update: `gs://your-bucket-name/electron-releases/latest/`

## Download URLs

After a successful build, files will be available at:

```
gs://your-bucket-name/electron-releases/
├── v1.0.0/                    # Versioned release
│   ├── linux/
│   │   ├── smartloop-studio-1.0.0.AppImage
│   │   ├── smartloop-studio_1.0.0_amd64.deb
│   │   └── smartloop-studio-1.0.0.x86_64.rpm
│   ├── macos/
│   │   ├── smartloop-studio-1.0.0.dmg
│   │   └── smartloop-studio-1.0.0-mac.zip
│   ├── windows/
│   │   └── smartloop-studio-Setup-1.0.0.exe
│   └── manifest.json          # Build metadata
└── latest/                    # Always points to latest build
    ├── linux/
    ├── macos/
    ├── windows/
    └── manifest.json
```

## Public Access (Optional)

To make files publicly downloadable:

```bash
# Make a specific version public
gsutil -m acl ch -r -u AllUsers:R gs://your-bucket-name/electron-releases/v1.0.0/

# Or make everything public
gsutil -m acl ch -r -u AllUsers:R gs://your-bucket-name/electron-releases/
```

Then files can be downloaded via:
```
https://storage.googleapis.com/your-bucket-name/electron-releases/v1.0.0/linux/smartloop-studio-1.0.0.AppImage
```

## Monitoring

- View build progress in the **Actions** tab
- Check build logs for errors
- Download URLs are shown in the workflow summary

## Troubleshooting

### Build fails on specific platform
- Check the platform-specific job logs
- Ensure all dependencies are properly listed in `package.json`

### Upload fails
- Verify GCP_SA_KEY secret is set correctly
- Check service account has Storage Object Admin role
- Ensure bucket name is correct in workflow file

### Missing files in bucket
- Check if build step succeeded (green checkmark)
- Verify artifacts were created in the build step
- Check upload step logs for errors

## Security Notes

1. **Never commit the GCP service account JSON key** to the repository
2. Store it only in GitHub Secrets
3. Rotate keys periodically
4. Use least-privilege principle for service account roles
5. Consider using Workload Identity Federation for better security

## Cost Considerations

- GitHub Actions: Free for public repos, minutes-based billing for private
- GCS Storage: Pay for storage used
- GCS Egress: Pay for download bandwidth if public

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Electron Builder Documentation](https://www.electron.build/)
- [GCS Documentation](https://cloud.google.com/storage/docs)

