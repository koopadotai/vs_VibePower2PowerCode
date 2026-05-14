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

### Step 2 — Find the connection ID
Tell the developer to run:
```powershell
pac connection list --environment [their-environment-url]
```
Find the row for the connector they need. The `Id` column is the connection ID. Make sure the `Status` is `Connected`.

### Step 3 — Add the data source
Tell the developer to run:
```powershell
cd [ProjectName]
npx power-apps add-data-source
```

At the prompts:
- **API ID:** `[api-id from table above]`
- **Are you using a connection reference?** → **No**
- **Connection ID:** `[connection-id from pac connection list]`

This updates `power.config.json` and `.power/schemas/appschemas/dataSourcesInfo.ts` automatically.

### Step 4 — Update the calling code
Replace any direct `fetch()` calls with `executeAsync({ connectorOperation })`:

```typescript
import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

const client = getClient(dataSourcesInfo);

const result = await client.executeAsync({
    connectorOperation: {
        tableName: '[data-source-name]',   // the key used when adding data source
        operationName: '[OperationName]',   // from dataSourcesInfo apis section
        parameters: { /* see dataSourcesInfo for parameter names */ },
    },
});

if (!result.success) throw result.error;
```

### Step 5 — Build and push
```powershell
npm run build
npx power-apps push
```

## Important rules

- **Never edit `dataSourcesInfo.ts` manually** — the CLI generates correct `/{connectionId}/` path prefixes that are required by the SDK
- If you get `Connection reference not found: [name]` at runtime, the data source was not added correctly — re-run `npx power-apps add-data-source`
- The `tableName` in `connectorOperation` must exactly match the key that was registered when you ran `add-data-source`
