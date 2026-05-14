# /map-fields

Discover and document the field name mapping between the Vibe source model and the Power Code Dataverse model.

## When to use
During Step 4 of the migration, when both the Vibe source and the Power Code generated models are available and the AI needs to build the data adapter layer.

## What you do

1. Read all model files in `./vibe-source/src/generated/models/` — these use friendly field names
2. Read all model files in `./[ProjectName]/src/generated/models/` — these use raw Dataverse names
3. For each Vibe model entity, find the matching Dataverse entity
4. For each field in the Vibe model, find the matching Dataverse field by:
   - Strip the Dataverse publisher prefix (e.g. `ws_`, `cr1e9_`, `new_`) from the Dataverse field name
   - Normalise both to lowercase, no separators
   - If the normalised names match → automatic mapping
   - If they don't match → flag it and ask the developer
5. Build the mapping table and write it to `CONTEXT.md`

## Output format

```markdown
## Field Mappings: [EntityName]

| Vibe (friendly) | Dataverse (raw) | Confidence |
|---|---|---|
| title | ws_title | Auto |
| description | ws_description | Auto |
| photo | cr1e9_photo | Manual — different publisher prefix |
```

## Rules

- Never assume a mapping — when in doubt, ask
- The `id` field in the Vibe model always maps to the Dataverse primary key field (`[prefix]_[entityname]id`)
- Always ask when the publisher prefix differs between fields in the same entity
- Write the final confirmed mapping to `CONTEXT.md` immediately
