# RecordShield deployment

One EC2 instance runs the whole backend with Docker Compose: MySQL 8.4, the audit service, the mock EMR and the API. Caddy on ports 80/443 is the only thing exposed; the API and the other services stay on the internal Compose network.

## 1. Create the server

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/recordshield_deploy    # passphrase-less key used only for deploys
cp infra/terraform.tfvars.example infra/terraform.tfvars   # set ssh_allowed_cidr to your IP /32
terraform -chdir=infra init
terraform -chdir=infra apply
```

The output prints the public IP. The instance installs Docker on first boot; give it about two minutes.

## 2. Configure secrets on the server

```bash
ssh ubuntu@<public-ip>
cd /srv/recordshield
```

Then create `/srv/recordshield/.env.production` from `.env.production.example` with fresh random values (`openssl rand -hex 32` for each). The first deploy must happen before this file is needed, so the order below works either way: `deploy.sh` syncs the files first and fails clearly if the env file is missing.

## 3. Deploy

```bash
infra/deploy.sh <public-ip>
```

This syncs the backend, builds the images on the server, starts the stack and runs `alembic upgrade head`. Re-run it for every update. The API is then at `http://<public-ip>/api/v1/health`.

Caddy terminates TLS with a Let's Encrypt certificate for `SITE_ADDRESS` from `.env.production` and redirects HTTP to HTTPS. Without a domain, use `<ip-with-dashes>.sslip.io` (for example `34-237-67-194.sslip.io`); with a domain, point an A record at the Elastic IP and set `SITE_ADDRESS` to it. The API is then at `https://<site-address>/api/v1/health`, docs at `https://<site-address>/docs`. If your public IP changes, update `ssh_allowed_cidr` and re-run `terraform apply`.

`terraform.tfvars` and the state files are ignored by git. The state holds no secrets, but `.env.production` on the server does; never copy it into the repository.
