# 🔑 GitHub Token Setup for Local Development

## Quick Start (2 minutes)

### 1. Create GitHub Personal Access Token

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token (classic)"**
3. Name: `DFuse Dashboard Storage`
4. Scope: Check **only** `gist` ✅
5. Click **"Generate token"**
6. **Copy the token** (starts with `ghp_...`)

### 2. Save Token Locally

**Option A: Using File (Recommended for Local)**

```bash
# In the backend/ directory, create github_token.txt
echo "ghp_your_token_here" > github_token.txt
```

**Option B: Using Environment Variable**

```bash
# Add to your ~/.zshrc or ~/.bashrc
export GITHUB_GIST_TOKEN=ghp_your_token_here
```

### 3. Restart Backend

```bash
cd backend
python app.py
```

You should see:
```
✅ Using GitHub token from local file: /path/to/backend/github_token.txt
```

or

```
✅ Using GitHub token from environment variable
```

---

## 🔒 Security

- ✅ `github_token.txt` is in `.gitignore` (won't be committed)
- ✅ Token has minimal permissions (only `gist` scope)
- ✅ Can be revoked anytime at https://github.com/settings/tokens

---

## 🧪 Testing

Test the setup:

```bash
curl -X POST http://localhost:8000/snapshots \
  -H "Content-Type: application/json" \
  -d '{
    "canvasState": {"test": "data"},
    "metadata": {"title": "Test Dashboard"},
    "expiresIn": 7
  }'
```

Expected response:
```json
{
  "success": true,
  "snapshot_id": "abc123...",
  "share_url": "http://localhost:3000?snapshot=abc123...",
  "gist_url": "https://gist.github.com/username/abc123...",
  ...
}
```

---

## ❌ Troubleshooting

### "No GitHub token found"

**Solution**: Make sure you created `github_token.txt` in the `backend/` directory.

### "Bad credentials"

**Solution**: Your token is invalid. Generate a new one and replace it.

### File not found

**Solution**: Make sure `github_token.txt` is in the same directory as `app.py`:

```
backend/
  ├── app.py
  ├── github_token.txt  ← Here!
  └── ...
```

---

## 🌍 Production (Render)

For production, **DO NOT** use the file method. Use environment variables:

1. Render Dashboard → Your Backend Service
2. Environment tab → Add variable:
   ```
   GITHUB_GIST_TOKEN=ghp_your_token_here
   ```
3. Save (auto-redeploys)

---

## 📝 Token Format

Your token should look like this:
```
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- Starts with `ghp_`
- 40 characters long
- No spaces or line breaks

---

**That's it! 🎉**

