# 🔗 Shareable Dashboard Links - Setup Guide

This document explains how to set up and use the GitHub Gist-based dashboard sharing feature.

---

## ✅ What You Get

- **📤 Share Button**: Create shareable links for your dashboards
- **🔗 Auto-Load**: Opening a shared link automatically loads the dashboard
- **💾 GitHub Gist Storage**: Free, unlimited storage via GitHub
- **📋 Copy to Clipboard**: Shareable link is automatically copied
- **⏰ Expiration Tracking**: Set how long links should be valid
- **🔄 Version History**: Built-in version control via GitHub

---

## 🚀 Setup Instructions

### **For Local Development** 💻

#### **Step 1: Create GitHub Personal Access Token** (2 minutes)

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Fill in the details:
   - **Note**: `DFuse Dashboard Storage`
   - **Expiration**: No expiration (or choose your preference)
   - **Scopes**: Check **only** `gist` ✅
4. Click **"Generate token"**
5. **Copy the token** (starts with `ghp_...`)
   - ⚠️ **Important**: Save it somewhere safe! You won't be able to see it again.

---

#### **Step 2: Save Token to Local File** (1 minute)

1. Navigate to the `backend/` directory
2. Create a file named `github_token.txt`
3. Paste your token into the file:
   ```
   ghp_your_token_here
   ```
4. Save the file
5. **That's it!** The backend will automatically read the token from this file

**Note:** This file is already in `.gitignore` and will NOT be committed to version control.

**Alternative:** You can also set it as an environment variable:
```bash
export GITHUB_GIST_TOKEN=ghp_your_token_here
```

---

### **For Production (Render)** ☁️

### **Step 1: Create GitHub Personal Access Token** (if not already done)

Follow the same steps as above.

---

### **Step 2: Add Token to Render Environment Variables** (1 minute)

#### **For Backend:**

1. Go to your Render dashboard
2. Navigate to your **Backend service** (`dfusenew-backend`)
3. Go to **Environment** tab
4. Click **"Add Environment Variable"**
5. Add:
   ```
   Key: GITHUB_GIST_TOKEN
   Value: ghp_your_token_here
   ```
6. Click **"Save Changes"**
7. Backend will automatically redeploy

#### **For Frontend (Optional):**

If you want to customize the frontend URL displayed in share links:

1. Go to your **Frontend service** (`dfusenew`)
2. Go to **Environment** tab
3. Add:
   ```
   Key: REACT_APP_API_URL
   Value: https://dfusenew-backend.onrender.com
   ```
   ```
   Key: FRONTEND_URL
   Value: https://dfusenew.onrender.com
   ```
4. Frontend will automatically redeploy

---

### **Step 3: Wait for Deployment** (2-3 minutes)

Render will automatically redeploy both services. Wait for the deployment to complete.

---

## 📊 How to Use

### **Creating a Shareable Link:**

1. Create your dashboard with charts
2. Click the **Share** button (📤) in the left sidebar
3. The shareable link is automatically copied to your clipboard
4. Share the link with anyone!

**Example link:**
```
https://dfusenew.onrender.com?snapshot=a1b2c3d4
```

### **Opening a Shared Dashboard:**

1. Simply open the shared link in your browser
2. The dashboard will automatically load
3. You'll see a confirmation message

---

## 🔍 Features

### **Current Features:**
- ✅ Create shareable links
- ✅ Auto-load shared dashboards
- ✅ Copy to clipboard
- ✅ Expiration tracking (metadata only, not enforced)
- ✅ Version history via GitHub
- ✅ Secret gists (not indexed by Google)

### **How It Works:**

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend  │────▶│   Backend    │────▶│ GitHub Gist  │
│  (DFuse)    │     │  (FastAPI)   │     │   (Storage)  │
└─────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                    Returns share URL
                    ?snapshot={gist_id}
```

1. User clicks **Share** button
2. Frontend exports canvas state as JSON
3. Backend creates a GitHub Gist with the JSON
4. Gist ID is returned and used in shareable URL
5. Anyone with the URL can load the dashboard

---

## 📈 Rate Limits

**GitHub API (Authenticated):**
- **5,000 requests per hour** per token
- Resets every hour

**Your Capacity:**
- ~2,500 shares + 2,500 loads per hour
- **60,000 total operations per day**

This is **more than enough** for a dashboard app! Even with 1,000 active users, you'd only use ~10% of the limit.

---

## 🎯 Viewing Your Gists

All created dashboard snapshots are stored as GitHub Gists in your account:

1. Go to: `https://gist.github.com/{your_github_username}`
2. You'll see all dashboard snapshots
3. Each gist contains a `dashboard.json` file
4. You can manually view, edit, or delete gists

---

## 🛠️ Troubleshooting

### **"GitHub Gist token not configured"**

**Solution**: Make sure you've added `GITHUB_GIST_TOKEN` to your Render backend environment variables.

### **"Failed to create gist: Bad credentials"**

**Solution**: Your token is invalid or expired. Generate a new token and update the environment variable.

### **"Snapshot not found"**

**Possible causes**:
- The gist was deleted
- The gist ID in the URL is incorrect
- Network issue

### **Share button does nothing**

**Solution**: 
1. Check browser console for errors
2. Make sure your backend is running
3. Verify `REACT_APP_API_URL` is set correctly

---

## 🔐 Security

- **Secret Gists**: Gists are created as "secret" (not indexed by Google)
- **URL-based Access**: Anyone with the link can view the dashboard
- **No Authentication**: No login required to view shared dashboards
- **Token Security**: Keep your `GITHUB_GIST_TOKEN` private

---

## 🚧 Future Enhancements

Potential improvements:

1. **Password Protection**: Add optional password for shared links
2. **Expiration Enforcement**: Automatically delete expired gists
3. **Analytics**: Track views, most shared dashboards
4. **Custom URLs**: User-friendly URLs instead of random IDs
5. **Collaborative Editing**: Real-time collaboration on shared dashboards
6. **QR Codes**: Generate QR codes for easy mobile sharing

---

## 📝 API Endpoints

### **POST /snapshots**
Save a dashboard snapshot to GitHub Gist

**Request:**
```json
{
  "canvasState": { "schema": {...}, "records": [...] },
  "metadata": { "title": "My Dashboard", "chartCount": 3 },
  "expiresIn": 7
}
```

**Response:**
```json
{
  "success": true,
  "snapshot_id": "a1b2c3d4e5f6g7h8",
  "share_url": "https://dfusenew.onrender.com?snapshot=a1b2c3d4e5f6g7h8",
  "gist_url": "https://gist.github.com/username/a1b2c3d4e5f6g7h8",
  "created_at": "2025-11-30T12:00:00Z",
  "expires_at": "2025-12-07T12:00:00Z"
}
```

### **GET /snapshots/{gist_id}**
Retrieve a dashboard snapshot from GitHub Gist

**Response:**
```json
{
  "success": true,
  "canvasState": { "schema": {...}, "records": [...] },
  "metadata": { "title": "My Dashboard", "chartCount": 3 },
  "created_at": "2025-11-30T12:00:00Z",
  "expires_at": "2025-12-07T12:00:00Z"
}
```

---

## ✅ Checklist

- [ ] Created GitHub Personal Access Token
- [ ] Added `GITHUB_GIST_TOKEN` to Render backend
- [ ] Backend redeployed successfully
- [ ] Tested Share button
- [ ] Tested opening a shared link
- [ ] Shared link copied to clipboard

---

## 📞 Support

If you encounter any issues:

1. Check the browser console for errors
2. Check Render backend logs
3. Verify your GitHub token is valid
4. Test with a simple dashboard first

---

**🎉 You're all set! Enjoy sharing your dashboards!**

