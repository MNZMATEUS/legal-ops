# GitHub + Render Deployment & Frontend Refactoring Guide

## Table of Contents
1. [Backend Deployment to GitHub + Render](#part-1-backend-deployment)
2. [Frontend Dynamic Sources Refactoring](#part-2-frontend-refactoring)

---

# PART 1: BACKEND DEPLOYMENT TO GITHUB + RENDER

## Step 1: Prepare Git Repository

### 1.1 Create `.gitignore`

**File:** `.gitignore` (in project root)

```gitignore
# Environment variables (CRITICAL - Never commit secrets!)
.env

# Node modules
node_modules/

# Logs
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE files
.vscode/
.idea/

# Temporary files
*.tmp
*.temp
```

**Why:** Prevents API keys from being exposed on GitHub.

### 1.2 Verify .env is NOT Staged

```bash
cd /Users/mateus/Desktop/Legal-ops/legal-ops
git status
```

✅ `.env` should NOT appear
❌ If it appears: `git rm --cached .env`

---

## Step 2: Commit Refactored Code

### 2.1 Check Current Status

```bash
git status
```

You should see:
- New `src/` folder with all modules
- Modified `package.json`
- New `.env.example`
- New `index.legacy.js` (backup)

### 2.2 Stage All Changes

```bash
git add src/
git add package.json
git add .env.example
git add index.legacy.js
git add .gitignore
git add docs/
```

### 2.3 Commit with Descriptive Message

```bash
git commit -m "Refactor: Migrate to config-driven modular architecture

- Extract services: database, file-processor, api-client, certificate
- Implement source registry factory pattern
- Add source classes: trt4, policia_federal, receita_federal
- Create sources.json for configuration-driven sources
- Consolidate duplicate code (DB inserts, file processing)
- Maintain backward compatibility with /consultar-lote endpoint
- Backup original index.js to index.legacy.js
- Update package.json to use src/index.js
- Add deployment documentation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

### 2.4 Push to GitHub

```bash
git push origin main
```

**Troubleshooting:**
- **Rejected:** `git pull --rebase origin main` then `git push`
- **No remote:** `git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git`
- **Different branch:** Replace `main` with `master` if that's your default branch

---

## Step 3: Configure Render Environment

### 3.1 Access Render Dashboard

1. Go to https://render.com/dashboard
2. Find your backend service (e.g., "legal-ops-1" or similar)
3. Click on the service name

### 3.2 Set Environment Variables

Click **Environment** tab on the left sidebar, then add these variables:

| Key | Value | Notes |
|-----|-------|-------|
| `SUPABASE_URL` | `https://zqbxevggjeokwnzwndns.supabase.co` | From your current .env |
| `SUPABASE_KEY` | `eyJhbGciOiJ...` | Your Supabase anon key |
| `INFOSIMPLES_TOKEN` | `your-token-here` | Your InfoSimples API token |
| `PORT` | `3000` | Optional (Render auto-assigns if not set) |
| `NODE_ENV` | `production` | Recommended for production |

⚠️ **CRITICAL:**
- These values must match what's in your local `.env` file
- Never paste your actual secrets in documentation or commit them to Git
- Click "Save Changes" after adding all variables

### 3.3 Update Build & Start Commands

In Render **Settings** tab:

- **Build Command:** `npm install`
- **Start Command:** `npm start` (this now runs `node src/index.js`)
- **Node Version:** Leave as default or set to match your local version

### 3.4 Verify Branch

In **Settings** → **Branch:**
- Ensure it's set to `main` (or `master` depending on your repo)
- Enable "Auto-Deploy" so new commits trigger deployments automatically

---

## Step 4: Deploy to Render

### 4.1 Trigger Manual Deploy

1. Go to **Manual Deploy** section at top of page
2. Click **Deploy latest commit** button
3. Wait for deployment (usually 2-5 minutes)

### 4.2 Monitor Build Logs

Watch the deployment logs for success indicators:

✅ **Success indicators:**
```
==> Downloading dependencies
==> Running 'npm install'
added 50 packages
==> Running 'npm start'

> backend-api@1.0.0 start
> node src/index.js

[SourceRegistry] Configuration loaded successfully
[SourceRegistry] Registered source class: trt4
[SourceRegistry] Registered source class: policia_federal
[SourceRegistry] Registered source class: receita_federal
[SourceRegistry] Initialized source: trt4 using TRT4Source
[SourceRegistry] Initialized source: policia_federal using PoliciaFederalSource
[SourceRegistry] Initialized source: receita_federal using ReceitaFederalSource
[CertificateService] Initialized successfully
===========================================
  API rodando na porta 3000
  Version: 6.0.0 (Refactored)
===========================================
Your service is live 🎉
```

❌ **Error indicators:**
```
Error: Missing required environment variables: SUPABASE_URL, INFOSIMPLES_TOKEN
```
**Fix:** Go back to Step 3.2 and add missing env vars.

```
Error: Cannot find module './config/sources.json'
```
**Fix:** Ensure all files were committed and pushed to GitHub.

### 4.3 Verify Deployment

Once deployed, test the API:

**Method 1: Browser**
- Visit: `https://your-app.onrender.com/`
- Should return:
```json
{
  "service": "Certificate Checking API",
  "version": "6.0.0 (Refactored)",
  "status": "online",
  "message": "Config-driven architecture"
}
```

**Method 2: cURL**
```bash
curl https://your-app.onrender.com/
```

**Method 3: Check Logs**
- In Render dashboard, go to **Logs** tab
- Verify no errors appear
- Look for the startup messages listed above

---

## Step 5: Test with Frontend

### 5.1 Update Frontend API URL (if needed)

In `frontend/index.html`, find line 267 and verify:
```javascript
const CONFIG = {
    SUPABASE_URL: '...',
    SUPABASE_KEY: '...',
    API_BASE_URL: 'https://legal-ops-1.onrender.com'  // <-- Update this
};
```

If your Render URL is different, update it to match your actual deployment URL (shown in Render dashboard).

### 5.2 Test End-to-End Flow

1. Open `frontend/index.html` in browser
2. Login with your credentials
3. Create a test cadastro (CPF or CNPJ)
4. Go to "Execução" tab
5. Select checkboxes for sources (TRT4, PF, Receita)
6. Click "PROCESSAR SELECIONADOS"
7. Verify console shows successful responses

**Expected console output:**
```
> Enviando NOME DA PESSOA...
> Sucesso (Batch: 550e8400-e29b-41d4-a716-446655440000).
```

### 5.3 Check Database

1. Go to Supabase dashboard
2. Open `certidoes_emitidas` table
3. Verify new records were created
4. Check `url_arquivo` field has Supabase storage URLs

---

## Step 6: Rollback Plans (If Issues Arise)

### Option 1: Quick Rollback via Package.json

1. **Edit package.json directly on GitHub:**
   - Go to your GitHub repo
   - Navigate to `package.json`
   - Click "Edit" button
   - Change `"start": "node src/index.js"` to `"start": "node index.legacy.js"`
   - Commit changes

2. **Render auto-redeploys** with the legacy version (2-3 minutes)

### Option 2: Git Revert

```bash
git revert HEAD
git push origin main
```

Render will automatically deploy the previous version.

### Option 3: Manual Rollback in Render

1. In Render dashboard, go to **Events** tab
2. Find previous successful deployment
3. Click **Rollback to this version**

---

## Troubleshooting Common Issues

### Issue 1: "Module not found: 'dotenv'"

**Cause:** Dependencies not installed or package-lock.json missing

**Fix:**
```bash
npm install
git add package-lock.json
git commit -m "Add package-lock.json"
git push origin main
```

### Issue 2: "Cannot find module './config/sources.json'"

**Cause:** File not committed to Git

**Fix:**
```bash
git status  # Check if src/ folder was added
git add src/config/sources.json
git commit -m "Add sources.json config file"
git push origin main
```

### Issue 3: "Missing required environment variables"

**Cause:** Environment variables not set in Render

**Fix:**
1. Go to Render dashboard → Environment
2. Add all required variables from Step 3.2
3. Click "Save Changes"
4. Redeploy manually

### Issue 4: Port Already in Use (Local Development)

**Cause:** Another process using port 3000

**Fix:**
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill

# Or use a different port
PORT=3001 npm start
```

### Issue 5: CORS Errors in Frontend

**Cause:** Frontend URL not allowed or incorrect API URL

**Fix:**
1. Verify `API_BASE_URL` in frontend matches Render URL
2. Check CORS is enabled in backend (already configured in `src/index.js`)

---

# PART 2: FRONTEND DYNAMIC SOURCES REFACTORING

## Context

**Current Problem:** Hardcoded source checkboxes in `frontend/index.html` (lines 235-237):

```html
<label><input type="checkbox" value="trt4" checked> TRT4</label>
<label><input type="checkbox" value="receita_federal" checked> Receita</label>
<label><input type="checkbox" value="policia_federal" checked> PF</label>
```

**Issues:**
- ❌ Adding new sources requires editing HTML
- ❌ Cannot reflect backend configuration changes
- ❌ Abbreviated names ("PF" vs "Polícia Federal - Antecedentes Criminais")
- ❌ No automatic filtering by document type (CPF vs CNPJ)

**Goal:** Make the frontend **dynamically load available sources** from the backend, so adding new sources to `sources.json` automatically appears in the UI.

---

## Solution Overview

### Architecture Flow

```
Backend:  sources.json → SourceRegistry → GET /sources API
               ↓
Frontend: Fetch sources → Store in STATE → Render checkboxes dynamically
```

### Benefits
✅ Config-driven frontend (matches backend)
✅ Zero HTML changes when adding sources
✅ Automatic updates: Add source to backend → appears in frontend
✅ Better UX: Full source names instead of abbreviations
✅ Document type awareness: Can filter sources by CPF/CNPJ compatibility

---

## Implementation Steps

### Step 1: Create Backend `/sources` Endpoint

**File:** `src/routes/certificates.routes.js`

**Add this route after the existing `/consultar-lote` route:**

```javascript
// GET /sources - Return available certificate sources
router.get('/sources', async (req, res) => {
    try {
        const sourceRegistry = require('../sources/source-registry');

        // Initialize if not yet done
        if (!sourceRegistry.sources || sourceRegistry.sources.size === 0) {
            const certificateService = require('../services/certificate.service');
            certificateService.initialize();
        }

        // Get all enabled sources
        const enabledSources = sourceRegistry.getAllEnabledSources();

        // Map to frontend-friendly format
        const sources = enabledSources.map(source => ({
            id: source.id,
            name: source.name,
            accepts: source.config.requirements.accepts
        }));

        res.json({ sources });
    } catch (error) {
        console.error('[GET /sources] Error:', error.message);
        res.status(500).json({
            erro: 'Erro ao buscar fontes disponíveis'
        });
    }
});
```

**Expected API Response:**
```json
{
  "sources": [
    {
      "id": "trt4",
      "name": "TRT4 - Certidão de Ações Trabalhistas",
      "accepts": ["CPF", "CNPJ"]
    },
    {
      "id": "policia_federal",
      "name": "Polícia Federal - Antecedentes Criminais",
      "accepts": ["CPF"]
    },
    {
      "id": "receita_federal",
      "name": "Receita Federal - Certidão CNPJ",
      "accepts": ["CNPJ"]
    }
  ]
}
```

---

### Step 2: Update Frontend HTML Structure

**File:** `frontend/index.html`

**Find lines 234-238 (the hardcoded checkboxes section) and replace with:**

```html
<div style="background:var(--bg-panel); padding:20px; border-radius:8px; border:1px solid var(--border); margin-bottom:20px;">
    <label>1. Selecione o Grupo:</label>
    <select id="filtro-execucao" style="margin-top:5px; width:100%; max-width:400px; margin-bottom:15px;"></select>

    <label>2. Selecione as Fontes:</label>
    <div id="sources-container" style="display:flex; flex-wrap:wrap; gap:15px; margin:10px 0 15px 0;">
        <span style="color:#64748b; font-size:0.85rem;">Carregando fontes...</span>
    </div>

    <button id="btn-processar" class="btn-primary" style="background:var(--success);">PROCESSAR SELECIONADOS</button>
</div>
```

**Changes:**
- ✅ Replaced hardcoded checkboxes with empty container `<div id="sources-container">`
- ✅ Added loading message while sources are fetched

---

### Step 3: Update STATE Object

**File:** `frontend/index.html`

**Find the STATE object (around line 279-284) and add `availableSources`:**

```javascript
const STATE = {
    user: null,
    entidades: [],
    certidoes: [], // Cache das certidões
    supabase: null,
    availableSources: [] // <-- NEW: Store available sources from backend
};
```

---

### Step 4: Add Functions to Load & Render Sources

**File:** `frontend/index.html`

**Add these functions after the `fazerLogout` function (around line 397):**

```javascript
// ==========================================
// DYNAMIC SOURCES LOADING (NEW)
// ==========================================

/**
 * Fetch available sources from backend API
 */
async function carregarFontesDisponiveis() {
    try {
        console.log('Carregando fontes do backend...');

        const response = await fetch(`${CONFIG.API_BASE_URL}/sources`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Erro ao buscar fontes`);
        }

        const data = await response.json();
        STATE.availableSources = data.sources || [];

        renderizarCheckboxesFontes();

        console.log('✅ Fontes carregadas:', STATE.availableSources.length, 'fontes');
    } catch (error) {
        console.error('❌ Erro ao carregar fontes:', error);

        // Fallback: Use hardcoded sources if backend fails
        console.warn('⚠️ Usando fontes fallback (hardcoded)');
        STATE.availableSources = [
            { id: 'trt4', name: 'TRT4', accepts: ['CPF', 'CNPJ'] },
            { id: 'policia_federal', name: 'Polícia Federal', accepts: ['CPF'] },
            { id: 'receita_federal', name: 'Receita Federal', accepts: ['CNPJ'] }
        ];

        renderizarCheckboxesFontes();
    }
}

/**
 * Render source checkboxes dynamically from STATE.availableSources
 */
function renderizarCheckboxesFontes() {
    const container = document.getElementById('sources-container');

    if (!container) {
        console.warn('⚠️ sources-container element not found');
        return;
    }

    if (STATE.availableSources.length === 0) {
        container.innerHTML = '<span style="color:var(--danger);">Nenhuma fonte disponível</span>';
        return;
    }

    // Clear container
    container.innerHTML = '';

    // Create checkbox for each source
    STATE.availableSources.forEach(fonte => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer;';

        // Shorten long names for display
        const displayName = fonte.name.length > 30
            ? fonte.name.substring(0, 30) + '...'
            : fonte.name;

        // Document types accepted by this source
        const acceptsText = fonte.accepts.join(' / ');

        // Create checkbox HTML
        label.innerHTML = `
            <input type="checkbox" class="chk-fonte" value="${fonte.id}" checked>
            <span style="font-size:0.9rem;" title="${fonte.name}\nAceita: ${acceptsText}">
                ${displayName}
            </span>
        `;

        container.appendChild(label);
    });

    console.log('✅ Checkboxes renderizados:', STATE.availableSources.length);
}
```

**What these functions do:**
- ✅ `carregarFontesDisponiveis()`: Fetches sources from `GET /sources` endpoint
- ✅ Stores sources in `STATE.availableSources`
- ✅ Falls back to hardcoded sources if API fails
- ✅ `renderizarCheckboxesFontes()`: Dynamically creates checkboxes
- ✅ Adds tooltips showing full name and accepted document types
- ✅ Logs to console for debugging

---

### Step 5: Call on App Initialization

**File:** `frontend/index.html`

**Find the `initApp` function (around line 311-315) and add the call:**

```javascript
async function initApp() {
    try {
        // Configura Supabase
        if (typeof supabase === 'undefined') throw new Error("Supabase Library not loaded");
        STATE.supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

        // Setup de Event Listeners (Botões e Inputs)
        setupEventListeners();

        // Verifica Sessão
        const { data: { session } } = await STATE.supabase.auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return;
        }

        STATE.user = session.user;
        document.getElementById('user-email').innerText = STATE.user.email;
        console.log("Sistema iniciado para:", STATE.user.email);

        // Carregamento Inicial de Dados
        await Promise.all([
            atualizarSaldo(),
            carregarEntidades(), // Carrega cadastros e preenche selects
            carregarFontesDisponiveis() // <-- NEW: Load available sources
        ]);

        // Carrega Dash automaticamente (Prevenção de Tela Vazia)
        atualizarDashboard();

    } catch (e) {
        console.error("Erro fatal na inicialização:", e);
        alert("Erro ao iniciar sistema. Verifique o console.");
    }
}
```

---

### Step 6: Optional Enhancement - Filter by Document Type

**Add this function to enable smart source filtering based on CPF/CNPJ:**

```javascript
/**
 * Filter sources by document type (CPF or CNPJ)
 * Disables incompatible sources
 */
function filtrarFontesPorTipo(documentType) {
    const checkboxes = document.querySelectorAll('.chk-fonte');

    checkboxes.forEach(checkbox => {
        const sourceId = checkbox.value;
        const fonte = STATE.availableSources.find(s => s.id === sourceId);

        if (fonte) {
            const isCompatible = fonte.accepts.includes(documentType);

            // Disable and gray out incompatible sources
            checkbox.disabled = !isCompatible;
            checkbox.parentElement.style.opacity = isCompatible ? '1' : '0.5';

            // Uncheck if incompatible
            if (!isCompatible) {
                checkbox.checked = false;
            }
        }
    });

    console.log(`Filtrado para: ${documentType}`);
}
```

**Then call it when rendering the execution table:**

Find the `renderTabelaExecucao` function and add at the beginning:

```javascript
function renderTabelaExecucao() {
    const grupo = document.getElementById('filtro-execucao').value;
    const tbody = document.getElementById('tbody-exec');
    tbody.innerHTML = '';

    let lista = STATE.entidades;
    if(grupo && grupo !== 'TODOS') lista = lista.filter(e => (e.grupo||'Geral') === grupo);

    // NEW: Filter sources by document type of first entity
    if (lista.length > 0) {
        const firstDoc = lista[0].documento.replace(/\D/g, '');
        const docType = firstDoc.length > 11 ? 'CNPJ' : 'CPF';
        filtrarFontesPorTipo(docType);
    }

    if(lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center;">Nenhum cadastro encontrado.</td></tr>';
        return;
    }

    // ... rest of the function remains the same
}
```

---

## Deployment Workflow

### Phase 1: Deploy Backend Changes

1. **Edit:** `src/routes/certificates.routes.js` - add `/sources` endpoint

2. **Test locally** (optional):
   ```bash
   npm start
   curl http://localhost:3000/sources
   ```

3. **Commit & Push:**
   ```bash
   git add src/routes/certificates.routes.js
   git commit -m "Add GET /sources endpoint for dynamic source loading"
   git push origin main
   ```

4. **Wait for Render** to auto-deploy (2-5 minutes)

5. **Verify endpoint works:**
   ```bash
   curl https://your-app.onrender.com/sources
   ```

   Should return JSON with sources array.

### Phase 2: Deploy Frontend Changes

1. **Edit:** `frontend/index.html` - implement all changes from Steps 2-5

2. **Test locally:**
   - Open `frontend/index.html` in browser
   - Open browser console (F12)
   - Verify logs show: `✅ Fontes carregadas: 3 fontes`
   - Check that checkboxes appear dynamically

3. **Commit & Push:**
   ```bash
   git add frontend/index.html
   git commit -m "Frontend: Dynamic source loading from backend API

   - Replace hardcoded checkboxes with dynamic rendering
   - Fetch sources from GET /sources endpoint
   - Add fallback to hardcoded sources
   - Display full source names with tooltips"
   git push origin main
   ```

4. **Deploy frontend** (method depends on your hosting):
   - If GitHub Pages: Automatically deployed on push
   - If Netlify/Vercel: Auto-deploys from Git
   - If served by backend: Just push to Git

---

## Testing Checklist

### Backend `/sources` Endpoint

Test the endpoint:
```bash
curl https://your-app.onrender.com/sources | jq
```

Verify:
- [ ] Returns JSON with `sources` array
- [ ] Each source has `id`, `name`, `accepts` fields
- [ ] Only enabled sources appear (check `enabled: true` in sources.json)
- [ ] Disabled sources are excluded

### Frontend Dynamic Loading

Open browser console (F12) and verify:
- [ ] Console shows: `Carregando fontes do backend...`
- [ ] Console shows: `✅ Fontes carregadas: 3 fontes`
- [ ] Console shows: `✅ Checkboxes renderizados: 3`
- [ ] Checkboxes appear in "Execução" tab
- [ ] Source names match backend configuration
- [ ] Checking/unchecking sources works
- [ ] Batch processing still works correctly

Test flow:
1. Go to "Execução" tab
2. Select a group
3. Verify checkboxes match backend sources
4. Select entities
5. Click "PROCESSAR SELECIONADOS"
6. Verify success messages

---

## Adding New Source (Complete Example)

### Example: Adding "Detran CNH" Certificate

**Step 1: Backend Configuration**

Edit `src/config/sources.json`, add:

```json
{
  "sources": {
    "trt4": { ... },
    "policia_federal": { ... },
    "receita_federal": { ... },
    "detran_cnh": {
      "id": "detran_cnh",
      "name": "Detran - Verificação CNH",
      "enabled": true,
      "api": {
        "url": "https://api.infosimples.com/api/v2/consultas/detran/cnh",
        "timeout": 600
      },
      "requirements": {
        "accepts": ["CPF"],
        "requiresName": true,
        "requiresBirthdate": true,
        "requiresMotherName": false
      },
      "parameters": {
        "cpf": "{{cpf}}",
        "nome": "{{nome}}",
        "birthdate": "{{data_nascimento}}",
        "token": "{{token}}"
      },
      "fileProcessing": {
        "supportedTypes": ["pdf"],
        "customProcessor": null
      },
      "storage": {
        "bucket": "arquivos-teste",
        "pathTemplate": "{{user_id}}/{{batch_id}}/{{source}}_{{timestamp}}.{{extension}}"
      }
    }
  }
}
```

**Step 2: Register Source Class (if using standard processing, skip this)**

If custom processing needed, create `src/sources/detran-cnh.source.js`:

```javascript
const BaseSource = require('./base-source');

class DetranCNHSource extends BaseSource {
    // Add custom processing only if needed
}

module.exports = DetranCNHSource;
```

Then register in `src/services/certificate.service.js`:

```javascript
const DetranCNHSource = require('../sources/detran-cnh.source');

initialize() {
    if (this.initialized) return;

    sourceRegistry.loadConfiguration();

    sourceRegistry.registerSourceClass('trt4', TRT4Source);
    sourceRegistry.registerSourceClass('policia_federal', PoliciaFederalSource);
    sourceRegistry.registerSourceClass('receita_federal', ReceitaFederalSource);
    sourceRegistry.registerSourceClass('detran_cnh', DetranCNHSource); // <-- NEW

    sourceRegistry.initializeSources();
    this.initialized = true;
}
```

**Step 3: Deploy**

```bash
git add src/config/sources.json
git add src/sources/detran-cnh.source.js  # if custom class created
git add src/services/certificate.service.js  # if registration added
git commit -m "Add Detran CNH certificate source"
git push origin main
```

**Step 4: Frontend (NO CHANGES NEEDED!)**

After Render deploys:
1. Refresh frontend
2. Go to "Execução" tab
3. **New checkbox appears automatically:**
   ```
   ☑ Detran - Verificação CNH
   ```

---

## Benefits Summary

### Before (Hardcoded Frontend)

- ❌ 3 sources hardcoded in HTML
- ❌ To add source: Edit HTML + backend code
- ❌ Abbreviated names ("PF", "TRT4")
- ❌ No compatibility checks
- ❌ Manual sync between frontend/backend

### After (Dynamic Frontend)

- ✅ Sources loaded from backend API
- ✅ To add source: Edit `sources.json` only
- ✅ Full descriptive names
- ✅ Document type filtering (optional)
- ✅ Single source of truth (backend)
- ✅ Automatic frontend updates

---

## Troubleshooting

### Issue: "sources-container not found"

**Symptom:** Console error, checkboxes don't appear

**Cause:** HTML not updated correctly

**Fix:**
1. Verify Step 2 changes were applied
2. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

### Issue: Sources Not Loading

**Symptom:** "Carregando fontes..." message stays forever

**Cause:** `/sources` endpoint not deployed or failing

**Fix:**
1. Test endpoint: `curl https://your-app.onrender.com/sources`
2. Check Render logs for errors
3. Verify environment variables are set
4. Check CORS is enabled (already configured)

### Issue: Checkboxes Still Hardcoded

**Symptom:** Old checkboxes appear instead of dynamic ones

**Cause:** Browser cache or changes not deployed

**Fix:**
1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Clear browser cache
3. Verify `frontend/index.html` changes were committed

### Issue: Fallback Sources Appearing

**Symptom:** Console shows `⚠️ Usando fontes fallback`

**Cause:** Backend `/sources` endpoint failing

**Fix:**
1. Check Render logs for errors
2. Verify backend deployed successfully
3. Test endpoint manually
4. Check environment variables

### Issue: Source Names Too Long

**Symptom:** Checkbox labels overflow or look bad

**Fix:** Already handled! Names > 30 chars are truncated with "..."
Hover over checkbox to see full name in tooltip.

---

## Summary Checklist

Use this to verify everything is set up correctly:

### Backend Deployment ✅

- [ ] `.gitignore` created and `.env` excluded
- [ ] All `src/` files committed and pushed to GitHub
- [ ] Render environment variables configured
- [ ] Render build/start commands verified
- [ ] Deployment successful (check logs)
- [ ] API health check returns 6.0.0 (Refactored)
- [ ] Frontend can connect to backend

### Frontend Dynamic Sources ✅

- [ ] `/sources` endpoint added to backend
- [ ] `/sources` endpoint returns correct JSON
- [ ] Frontend HTML updated (sources-container)
- [ ] STATE object has `availableSources`
- [ ] Load/render functions added
- [ ] Functions called on init
- [ ] Browser console shows successful loading
- [ ] Checkboxes appear dynamically
- [ ] Batch processing still works

### Testing ✅

- [ ] Can create new cadastro
- [ ] Can select sources in Execução tab
- [ ] Can process batch successfully
- [ ] Results appear in dashboard
- [ ] Database records created correctly
- [ ] Files uploaded to Supabase storage

---

## Next Steps

1. ✅ Complete backend deployment to Render
2. ✅ Test `/sources` endpoint
3. ✅ Implement frontend changes
4. ✅ Test dynamic source loading
5. ✅ Add a new test source to verify everything works
6. ✅ Monitor production logs for any issues
7. ✅ Update your team/documentation

---

## Support

If you encounter issues:

1. **Check Render Logs:** Dashboard → Your Service → Logs
2. **Check Browser Console:** F12 → Console tab
3. **Test Endpoints:** Use cURL or Postman
4. **Rollback if Needed:** Use options from Step 6

For questions about the refactored architecture, refer to the main plan file or the code comments in `src/` modules.
