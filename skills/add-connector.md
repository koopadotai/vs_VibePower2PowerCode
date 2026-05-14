# /add-connector

Guide the developer through adding a Power Platform connector as a data source to their Power Code project.

## When to use
When the migrated app uses a connector (Office 365 Outlook, SharePoint, etc.) that was previously called via direct `fetch()` in the Vibe app. Direct `fetch()` is blocked by CSP in Power Apps player. This skill replaces it with the proper SDK connector call.

## What you do

### Step 1 — Identify the connector
Ask: *"Which connector do you need to add? (e.g. Office 365 Outlook, SharePoint)"*

Common API IDs:
| Connector | API ID |
|---|---|
| Office 365 Outlook | `shared_office365` |
| SharePoint | `shared_sharepointonline` |
| Microsoft Teams | `shared_teams` |
| OneDrive for Business | `shared_onedriveforbusiness` |
| Excel Online (Business) | `shared_excelonlinebusiness` |
| Power Automate (flow) | `shared_logicflows` |

### Step 2 — Find the Connection ID from the portal

Tell the developer to:

1. Go to **[make.powerapps.com](https://make.powerapps.com)**
2. Make sure you are in the correct environment (top-right environment selector)
3. In the left sidebar click **More** → **Connections**
4. Find the connector you need (e.g. Office 365 Outlook)
5. Click the **three dots (...)** next to it → **Details** — OR click directly on the connection name
6. Look at the **browser URL** — it will look like:
   ```
   https://make.powerapps.com/environments/[env-id]/connections/[api-id]/[CONNECTION-ID]/details
   ```
   The `CONNECTION-ID` part is what you need (e.g. `shared-office365-ecb327de-373b-46d2-ac82-78581b464924`)

If the connection doesn't exist yet, click **New connection** and create one for the required connector first.

### Step 3 — Add the data source

Tell the developer to run:
```powershell
cd [ProjectName]
npx power-apps add-data-source
```

At the prompts:
- **API ID:** `[api-id from table above]`
- **Are you using a connection reference?** → **No**
- **Connection ID:** `[connection-id from Step 2]`

This updates `power.config.json` and `.power/schemas/appschemas/dataSourcesInfo.ts` automatically.

### Step 4 — Find your Environment ID (if needed for power.config.json)

If the developer needs their environment ID:

1. Go to **[make.powerapps.com](https://make.powerapps.com)**
2. Look at the URL when you're in the maker portal — it contains:
   ```
   https://make.powerapps.com/environments/[ENVIRONMENT-ID]/...
   ```
3. OR go to **Settings (gear icon)** → **Session details** — the Environment ID is listed there

### Step 5 — Update the calling code

Replace any direct `fetch()` calls with `executeAsync({ connectorOperation })`:

```typescript
import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

const client = getClient(dataSourcesInfo);

const result = await client.executeAsync({
    connectorOperation: {
        tableName: '[data-source-name]',   // key used when running add-data-source
        operationName: '[OperationName]',   // from dataSourcesInfo apis section
        parameters: { /* see dataSourcesInfo for parameter names */ },
    },
});

if (!result.success) throw result.error;
```

### Step 6 — Build and push
```powershell
npm run build
npx power-apps push
```

## Important rules

- **Never edit `dataSourcesInfo.ts` manually** — the CLI generates correct `/{connectionId}/` path prefixes required by the SDK
- If you get `Connection reference not found: [name]` at runtime, re-run `npx power-apps add-data-source`
- The `tableName` in `connectorOperation` must exactly match the key registered when you ran `add-data-source`
