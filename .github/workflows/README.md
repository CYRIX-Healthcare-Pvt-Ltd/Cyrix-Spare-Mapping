# Workflows

## `apply-migrations.yml`

Runs `supabase db push` against the production project whenever a file under
`supabase/migrations/` reaches `main`, and on demand via **Actions → Apply
migrations → Run workflow**.

It needs three repository secrets (**Settings → Secrets and variables →
Actions**):

| Secret | Where it comes from |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens → Generate new token |
| `SUPABASE_PROJECT_REF` | the production project's ref — the `<ref>` in `supabase.com/dashboard/project/<ref>` |
| `SUPABASE_DB_PASSWORD` | the production database password (Project Settings → Database) |

The project ref must be the **production** project, not one of the preview
branch projects Supabase creates per pull request — those come and go with the
branch, and pushing to one leaves production untouched.
