# Legal Ops Documentation

Welcome to the Legal Ops certificate checking system documentation.

## 📚 Documentation Files

### [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
**Complete deployment and frontend refactoring guide**

Contains:
- **Part 1:** Step-by-step GitHub + Render deployment instructions
- **Part 2:** Frontend refactoring for dynamic source loading
- Troubleshooting common issues
- Rollback strategies
- Testing checklists

👉 **Start here** if you're deploying the refactored backend or updating the frontend.

---

## 🚀 Quick Start

### Deploy Backend to Render

```bash
# 1. Prepare Git
git add src/ package.json .env.example index.legacy.js .gitignore docs/
git commit -m "Refactor: Config-driven modular architecture"
git push origin main

# 2. Configure Render
# - Set environment variables (SUPABASE_URL, SUPABASE_KEY, INFOSIMPLES_TOKEN)
# - Deploy latest commit
# - Verify logs show successful initialization

# 3. Test
curl https://your-app.onrender.com/
```

### Add New Certificate Source

```bash
# 1. Edit sources.json
# Add new source configuration

# 2. (Optional) Create custom source class if needed
# src/sources/your-source.source.js

# 3. Register in certificate.service.js
# sourceRegistry.registerSourceClass('your_source', YourSource);

# 4. Deploy
git add src/config/sources.json
git commit -m "Add new source: your_source"
git push origin main

# Frontend automatically shows new source!
```

---

## 📁 Project Structure

```
legal-ops/
├── src/                        # Refactored modular backend
│   ├── config/                 # Configuration files
│   │   ├── sources.json        # ⭐ Certificate sources config
│   │   ├── environment.js      # Environment variables
│   │   └── database.js         # Supabase client
│   ├── services/               # Business logic
│   │   ├── certificate.service.js
│   │   ├── api-client.service.js
│   │   ├── file-processor.service.js
│   │   └── database.service.js
│   ├── sources/                # Source implementations
│   │   ├── source-registry.js  # Factory pattern
│   │   ├── base-source.js      # Abstract base
│   │   └── *.source.js         # Specific sources
│   ├── routes/                 # API routes
│   │   └── certificates.routes.js
│   └── utils/                  # Utilities
├── frontend/                   # Frontend application
├── docs/                       # 📚 You are here
├── index.legacy.js             # Backup of original code
└── package.json
```

---

## 🔧 Configuration

### Environment Variables

Required in `.env` (local) and Render (production):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
INFOSIMPLES_TOKEN=your-infosimples-api-token
PORT=3000
NODE_ENV=production
```

### Sources Configuration

Edit `src/config/sources.json` to add/modify certificate sources.

**Example:**
```json
{
  "source_id": {
    "id": "source_id",
    "name": "Display Name",
    "enabled": true,
    "api": { "url": "...", "timeout": 600 },
    "requirements": {
      "accepts": ["CPF", "CNPJ"],
      "requiresName": true,
      "requiresBirthdate": false
    },
    "parameters": { ... },
    "fileProcessing": { "customProcessor": null }
  }
}
```

---

## 🧪 Testing

### Test Backend Locally

```bash
npm start
curl http://localhost:3000/
curl http://localhost:3000/sources
```

### Test Frontend Locally

1. Open `frontend/index.html` in browser
2. Open browser console (F12)
3. Login and test certificate processing

### Test Production

```bash
# Health check
curl https://your-app.onrender.com/

# Sources endpoint
curl https://your-app.onrender.com/sources

# Process batch (requires authentication)
# Use frontend to test full flow
```

---

## 🔄 Deployment Workflow

### Typical Workflow

1. **Make changes** to code
2. **Test locally** (`npm start`)
3. **Commit** to Git
4. **Push** to GitHub
5. **Render auto-deploys** (2-5 min)
6. **Verify** deployment in logs
7. **Test** production endpoint

### Rollback if Needed

```bash
# Option 1: Revert commit
git revert HEAD
git push origin main

# Option 2: Edit package.json to use legacy
"start": "node index.legacy.js"

# Option 3: Use Render dashboard rollback
```

---

## 📖 API Endpoints

### GET /
Health check - returns API version and status

### POST /consultar-lote
Process certificate batch

**Request:**
```json
{
  "user_id": "uuid",
  "nome": "NOME",
  "documento": "12345678900",
  "data_nascimento": "1990-01-01",
  "nome_mae": "NOME MAE",
  "fontes_escolhidas": ["trt4", "policia_federal"]
}
```

**Response:**
```json
{
  "batch_id": "uuid",
  "resultados": [
    {
      "origem": "trt4",
      "status": "SUCESSO",
      "arquivo": "https://...",
      "dados": { ... }
    }
  ]
}
```

### GET /sources
Get available certificate sources (for dynamic frontend)

**Response:**
```json
{
  "sources": [
    {
      "id": "trt4",
      "name": "TRT4 - Certidão de Ações Trabalhistas",
      "accepts": ["CPF", "CNPJ"]
    }
  ]
}
```

---

## 🐛 Troubleshooting

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed troubleshooting.

**Quick Fixes:**

- **Missing env vars:** Add to Render environment
- **Module not found:** Commit and push missing files
- **Port in use:** `lsof -ti:3000 | xargs kill`
- **CORS errors:** Verify API_BASE_URL in frontend

---

## 📞 Support

- Check Render logs: Dashboard → Your Service → Logs
- Check browser console: F12 → Console tab
- Review code comments in `src/` modules
- Refer to deployment guide for detailed help

---

## 🎯 Architecture Benefits

✅ **Config-driven:** Add sources via JSON, no code changes
✅ **Modular:** Clear separation of concerns
✅ **Testable:** Each component independently testable
✅ **Maintainable:** Easy to understand and modify
✅ **Scalable:** Easy to add new features
✅ **Backward compatible:** Same API contract

---

Last updated: February 2026
