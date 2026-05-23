# Plausible (self-hosted) — setup

Lives alongside the API stack but in its own compose file so it can crash
without taking down aldocarrera.com.

## Resource budget
- Postgres: ~150 MB RAM
- Clickhouse: ~600 MB RAM (idle), more under query load
- Plausible app: ~250 MB RAM
- **Total**: budget ~2 GB. Check `free -h` on the NAS before starting.

## First-time setup (do once)

```bash
ssh nas
cd "/volume2/Ingesting 2/aldocarrera-server/Aldo Carrera Photography Website/nas-server/plausible"

# 1. Generate secrets
cp plausible-conf.env.example plausible-conf.env
SECRET=$(openssl rand -base64 64 | tr -d '\n')
PG_PW=$(openssl rand -hex 24)
sed -i "s|REPLACE_ME_64_BYTE_RANDOM_STRING|$SECRET|" plausible-conf.env
sed -i "s|REPLACE_ME_POSTGRES_PASSWORD|$PG_PW|g" plausible-conf.env

# 2. Bring it up
sudo docker-compose -f docker-compose.yml up -d

# 3. Watch logs — wait for "Running PlausibleWeb.Endpoint with cowboy" line
sudo docker logs -f plausible
```

## DNS + Cloudflare tunnel routing

1. Add a Cloudflare DNS CNAME: `analytics.aldocarrera.com` → tunnel hostname
2. In the Cloudflare Zero Trust dashboard, add a public hostname to the existing
   tunnel: `analytics.aldocarrera.com` → `http://plausible:8000`
3. (Plausible container shares the docker network; cloudflared resolves by service name.)

## Create admin account

Visit `https://analytics.aldocarrera.com/register` once, create your account,
then set `DISABLE_REGISTRATION=invite_only` in `plausible-conf.env` and:

```bash
sudo docker-compose -f docker-compose.yml restart plausible
```

## Add the site

In the Plausible UI: **Add site** → `aldocarrera.com`. It'll show you a snippet —
the snippet we already have in `index.html` matches the default, so just flip
the `PLAUSIBLE_ENABLED` flag (see below) to activate.

## Activate tracking on the site

In `index.html`, uncomment the Plausible script tag (search for `PLAUSIBLE`).
Then commit + push so Netlify deploys.

## Custom events already wired

The site fires these via `window.plausible(...)` when present:

| Event | Props | Fires when |
|---|---|---|
| `Project View` | `{ name, client }` | A project is opened (desktop or mobile) |
| `Gallery Submit` | `{ gallery }` | A client submits picks in a portal |

Add goals for these in Plausible UI → Site settings → Goals.

## Upgrade / teardown

```bash
# Upgrade image version (edit docker-compose.yml first):
sudo docker-compose -f docker-compose.yml pull
sudo docker-compose -f docker-compose.yml up -d

# Backup before doing anything destructive:
sudo docker run --rm -v aldocarrera-server_plausible-db:/data -v $(pwd):/backup alpine tar czf /backup/plausible-db-$(date +%F).tgz /data

# Nuke and start over:
sudo docker-compose -f docker-compose.yml down -v
```
