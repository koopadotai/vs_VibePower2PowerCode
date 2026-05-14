# Why AI Is Required for This Migration

A script can automate roughly 60–70% of this migration. The remaining 30% requires reasoning that only AI can do.

---

## The Core Principle

> **A script works on what the code says. AI works on what the code means.**

---

## Step-by-Step Analysis

### Step 1 — Discover Source Format
**Script can do this.** Detect Vite-transformed files by checking for `__vite__createHotContext`.

### Step 2 — Extract TypeScript from Source Maps
**Script can do most of this.** The decoding is mechanical: find base64 → decode → read `sourcesContent[0]`.

**AI is needed for edge cases:**
- `index.css` is wrapped in a JS string literal, not a source map — requires a custom parser written on the spot
- Some files have no source map and HMR code — the original is lost and must be reconstructed from context
- Decision: which files to skip (the `generated/` folder) — requires understanding intent

### Step 3 — Build the Data Adapter Layer
**AI is essential. This is the hardest step.**

The Vibe app and Power Code use incompatible field naming conventions. The mismatch is not always predictable.

**Example of what breaks scripts:**

A Vibe model has:
```typescript
interface MyEntity {
  title: string;       // maps to ws_title — strip prefix, done
  description: string; // maps to ws_description — strip prefix, done
  photo?: string;      // maps to cr1e9_photo — DIFFERENT prefix
}
```

A script that strips a single prefix (`ws_`) from all Dataverse fields would fail on `cr1e9_photo`. It would either:
- Silently map `photo` to a non-existent `ws_photo` field
- Crash on the mismatch with no useful error

**AI reads both schemas simultaneously, understands field intent by name + type, and asks when ambiguous.**

Beyond field mapping, the adapter also requires:
- Translating `orderBy` option strings from friendly names to Dataverse names at runtime
- Knowing which fields are required vs optional for Dataverse `create` operations
- Structuring TypeScript generics to match the Power Code service interface
- Writing correct mapping functions for all CRUD operations

None of this can be templated. It requires understanding both codebases at once.

### Step 4 — Add npm Dependencies
**Script can do most of this.** Scan imports, resolve package names.

**AI is needed for:**
- `next-themes` — a script installs it. AI removes it (it's Next.js specific, wrong for Power Apps)
- `motion/react` — the package name is `motion`, not `motion/react`. A script may get this wrong
- Knowing which packages to remove vs install when they are present in the Vibe source but incompatible with Power Apps

### Step 5 — Update Config Files
**Script can do this.** JSON/TypeScript transformations are mechanical.

### Step 6 — Fix TypeScript Errors
**AI is essential for the non-obvious errors.**

| Error | Script | AI |
|---|---|---|
| File casing mismatch | Fix (string compare) | Fix |
| `process.env.NODE_ENV` | Fix (known Vite pattern) | Fix |
| `initialize()` not in SDK | Crash — doesn't know replacement | Removes call (Vite plugin handles it) |
| `next-themes` missing | Installs the package | Removes the dependency entirely |

For `initialize()`: the `@microsoft/power-apps/app` module only exports `setConfig` and `getContext`. A script would try to fix the import but wouldn't know the correct action. AI understands that the Vite plugin initialises the SDK automatically — the call should be deleted, not replaced.

### Step 7 — Fix Routing
**AI diagnoses from symptoms.**

The app showed a "404 Page Not Found" screen after deployment. No TypeScript error. No crash. The root cause — `BrowserRouter` doesn't work inside Power Apps player iframes — requires understanding how the Power Apps player hosts code apps. A script cannot diagnose this from symptoms.

### Step 8 — Build and Push
**Script can run the commands.**

**AI handles push errors:**
- `AppSubtypeImmutable` — a script fails. AI knows to set `appId: null`
- `ApplicationDisplayNameIsInUse` — a script fails. AI knows to rename

---

## Summary Table

| Step | Script | AI | Reason |
|---|---|---|---|
| Discover source format | Yes | — | String detection |
| Extract TypeScript | Mostly | Edge cases | CSS in JS, missing maps |
| Build adapter layer | No | Essential | Publisher prefix ambiguity, schema reasoning |
| Add dependencies | Mostly | REMOVE not install | next-themes, package name mismatches |
| Update config files | Yes | — | Mechanical transformations |
| Fix TypeScript errors | Partly | Non-obvious errors | SDK API surface knowledge |
| Fix routing | No | Diagnose from symptoms | Platform hosting knowledge |
| Build and push | Mostly | Error interpretation | Push error recovery |
