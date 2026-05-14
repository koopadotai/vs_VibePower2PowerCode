# Troubleshooting

Common issues and their solutions.

---

## Vibe Extraction

### Browser doesn't open / Playwright error
```
Error: browserType.launch: Executable doesn't exist
```
**Fix:** Install Playwright browsers:
```powershell
cd vibe-extractor
npx playwright install chromium
```

### Extractor captures no files
The Vibe app may use a different network pattern than expected.
**Fix:** Use the manual extraction method:
```powershell
node extract.js ./vibe-source
```
This opens the browser and waits for you to click through each file in the Vibe editor.

### Some files are missing from extraction
Not all files trigger network requests on load.
**Fix:** Use `console-extract.js` — paste it into the browser DevTools console while the Vibe editor is open. It expands the file tree and clicks each file automatically.

---

## Scaffolding

### `npx degit` fails
```
Error: Could not find commit hash
```
**Fix:** Check that the template URL is correct and the repo exists:
```
npx degit github:microsoft/PowerAppsCodeApps/templates/vite [ProjectName]
```

### `npx power-apps init` fails
**Fix:** Ensure PAC CLI is authenticated:
```powershell
pac auth list
pac auth create --environment https://[your-org].crm[N].dynamics.com/
```

---

## TypeScript Errors

### `Module has no exported member 'initialize'`
The `@microsoft/power-apps/app` SDK does not export `initialize`.
**Fix:** Remove the import and the `useEffect(() => { initialize(); }, [])` call. The Vite plugin handles SDK initialisation automatically.

### `Cannot find name 'process'`
Vite doesn't provide `process.env`.
**Fix:** Replace with Vite's equivalent:
```typescript
// Before
if (process.env.NODE_ENV !== 'production') { ... }
// After
if (import.meta.env.DEV) { ... }
```

### `Cannot find module 'next-themes'`
`next-themes` is a Next.js package not available in Power Apps.
**Fix:** Remove the import. In `sonner.tsx`, replace `useTheme()` with a hardcoded dark theme:
```typescript
// Before
const { theme = 'system' } = useTheme();
<Sonner theme={theme as ToasterProps['theme']} ... />
// After
<Sonner theme="dark" ... />
```

### File casing error (e.g. `app.tsx` vs `App.tsx`)
TypeScript is strict about casing even on case-insensitive Windows.
**Fix:** Change the import to match the exact casing of the file on disk:
```typescript
import App from '@/App.tsx'; // capital A if file is App.tsx
```

---

## Push Errors

### `AppSubtypeImmutable`
An existing app with the same `appId` was created as a Canvas App and cannot be changed to Power Code.
**Fix:** Set `"appId": null` in `power.config.json` — this creates a new app instead of updating the existing one.

### `ApplicationDisplayNameIsInUse`
The `appDisplayName` in `power.config.json` is already taken by another app in the environment.
**Fix:** Change `appDisplayName` to a unique name (e.g. add " v2").

### `Missing environmentId`
```
[powerApps] Error loading power.config.json: Invalid power.config.json structure. Missing environmentId.
```
**Fix:** Add `"environmentId"` to `power.config.json`:
```json
{
  "environmentId": "[your-env-id]",
  ...
}
```
Find your environment ID from `pac env list` or from your environment URL.

---

## Runtime Errors (in Power Apps Player)

### App shows 404 / Page Not Found
The app is using `BrowserRouter` which routes on the full URL path. Power Apps player hosts the app at a non-root path inside an iframe.
**Fix:** Change `BrowserRouter` to `HashRouter` in `App.tsx`:
```typescript
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
```

### CSP blocks network calls
```
Content Security Policy: connect-src 'none'
```
The Power Apps player blocks all direct `fetch()` / `XMLHttpRequest` calls from app code.
**Fix:** Replace `fetch()` with `executeAsync({ connectorOperation })` using the `@microsoft/power-apps/data` SDK. Add the connector with `npx power-apps add-data-source`.

### `Connection reference not found: [name]`
The data source was not registered correctly with `npx power-apps add-data-source`, or `dataSourcesInfo.ts` was edited manually.
**Fix:**
1. Re-run `npx power-apps add-data-source` for the connector
2. Rebuild and push
3. Never edit `dataSourcesInfo.ts` manually — the CLI generates required `/{connectionId}/` path parameters

### `React.createElement: type is invalid — got undefined`
A component import is resolving to `undefined`. Common causes:
- Circular import
- Named vs default import mismatch
- A component was not exported from its file

**Fix:** Check the import statement and the export in the source file. Ensure default exports use `export default` and named exports use `export { ... }`.

---

## Data Issues

### Dataverse fields not saving
The field name mapping in the adapter service may be incorrect.
**Fix:** Run `/map-fields` to review the mapping. Ensure the adapter's `toDataverse()` function maps all required fields correctly.

### `orderBy` not working
The `orderBy` option uses friendly names but the Dataverse service expects raw Dataverse names.
**Fix:** Ensure the adapter service translates `orderBy` options:
```typescript
const FIELD_TO_DV: Record<string, string> = {
  title: 'ws_title',
  // ... all fields
};
function translateOrderBy(orderBy?: string[]) {
  return orderBy?.map(clause => {
    const [field, dir] = clause.split(' ');
    return dir ? `${FIELD_TO_DV[field] ?? field} ${dir}` : (FIELD_TO_DV[field] ?? field);
  });
}
```
