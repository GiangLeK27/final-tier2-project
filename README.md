# Final Tier 2 Production CI/CD Runbook

## 1. Project Overview

This project implements a production-grade CI/CD system for the Startup X final project.

Selected architecture:

**Tier 2 - Single-server containerized deployment using Docker Compose**

The production system runs on an AWS EC2 Ubuntu server and is exposed through a public HTTPS domain.

## 2. Production URLs

- Application: https://devops20.online
- Health endpoint: https://devops20.online/health
- Database endpoint: https://devops20.online/db
- Metrics endpoint: https://devops20.online/metrics
- Grafana: https://grafana.devops20.online

## 3. Repository and Registry

- GitHub repository: https://github.com/GiangLeK27/final-tier2-project
- Docker Hub image: docker.io/legiang2090/final-tier2-app

Production Docker images use explicit Git commit SHA tags, for example:

```text
docker.io/legiang2090/final-tier2-app:sha-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

The production deployment does not rely on the `latest` tag.

## 4. Architecture

The production environment is a multi-container Docker Compose system running on a single Ubuntu server.

| Service | Purpose |
|---|---|
| `caddy` | HTTPS reverse proxy and TLS termination |
| `app` | Node.js web application, scaled to 2 replicas |
| `db` | PostgreSQL database with persistent volume |
| `prometheus` | Metrics collection |
| `grafana` | Metrics dashboard and alerting |
| `cadvisor` | Container-level metrics |
| `node-exporter` | Host-level metrics |

## 5. Tier 2 Features

- Single cloud server
- Docker Compose orchestration
- Multi-container production deployment
- Reverse proxy container
- HTTPS with custom domain
- Persistent database storage
- Explicit service separation
- Application service scaled to 2 replicas
- Prometheus and Grafana monitoring
- Grafana alerting for application downtime

## 6. Infrastructure Provisioning

The cloud infrastructure is provisioned manually on AWS EC2.

A structured provisioning script is included to prepare a fresh Ubuntu server:

```bash
bash scripts/provision-server.sh
```

The script performs the following tasks:

- Installs required system packages
- Installs Docker if missing
- Enables and starts the Docker service
- Adds the deployment user to the Docker group
- Configures firewall rules for SSH, HTTP, and HTTPS
- Creates `/opt/final-tier2`
- Verifies Docker, Docker Compose, and firewall status

## 7. CI/CD Pipeline

The CI/CD pipeline is implemented using GitHub Actions.

Main workflow file:

```text
.github/workflows/ci.yml
```

A push to the `main` branch automatically triggers the full pipeline.

### Continuous Integration

CI stages:

1. Checkout source code
2. Setup Node.js
3. Restore dependency cache
4. Install dependencies using `npm ci`
5. Run linting
6. Build application artifact
7. Build Docker image with version tags
8. Scan Docker image using Trivy
9. Push Docker image to Docker Hub

### Continuous Delivery

After CI succeeds, CD deploys to the production EC2 server through SSH:

1. Connect to the EC2 production server
2. Log in to Docker Hub
3. Update `APP_IMAGE` in the production `.env`
4. Pull the new versioned image
5. Recreate application containers using Docker Compose
6. Keep the application scaled to 2 replicas
7. Print deployment metadata and container status
8. Run post-deployment health checks

## 8. Post-deployment Health Gate

The CD pipeline validates production after deployment:

```bash
curl -f https://devops20.online/health
curl -f https://devops20.online/db
```

If either endpoint fails, the CD job fails.

This confirms both application availability and database connectivity after deployment.

## 9. Security Integration

Trivy is integrated into the CI pipeline.

The pipeline scans the Docker image for `HIGH` and `CRITICAL` vulnerabilities. If such vulnerabilities are detected, the CI job fails.

The Dockerfile was hardened by using a production runtime image and removing unnecessary package manager files from the runtime layer.

## 10. Rollback

The project supports rollback using two methods.

### Method 1: Server Rollback Script

Rollback script:

```text
scripts/rollback.sh
```

Usage:

```bash
cd /opt/final-tier2
bash scripts/rollback.sh docker.io/legiang2090/final-tier2-app:sha-OLD_COMMIT
```

The script:

- Reads the current `APP_IMAGE`
- Updates `.env` to the selected rollback image
- Pulls the selected Docker image
- Recreates the application containers
- Validates `/health` and `/db`
- Restores the previous image if rollback validation fails

### Method 2: GitHub Actions Manual Rollback

Manual rollback workflow:

```text
.github/workflows/rollback.yml
```

It can be triggered from GitHub:

```text
Actions → Rollback Production → Run workflow
```

Input example:

```text
sha-25a922e296fc5e4ddea4b089c6bc30ade1b3ff38
```

The workflow connects to the production server through SSH, updates `APP_IMAGE`, pulls the selected image, recreates app containers, and validates `/health` and `/db`.

## 11. Monitoring and Observability

The monitoring stack includes:

- Prometheus
- Grafana
- cAdvisor
- node-exporter
- Application-level metrics from the Node.js app

Grafana dashboard metrics include:

- Server CPU usage
- Server memory usage
- Container CPU usage
- Container memory usage
- Prometheus target status
- Application request rate
- Application 5xx error rate
- HTTP request duration P95

## 12. Application-level Metrics

The application exposes metrics at:

```text
https://devops20.online/metrics
```

Custom application metrics:

```text
app_http_requests_total
app_http_request_duration_seconds
```

Example PromQL queries:

```promql
sum(rate(app_http_requests_total[1m]))
```

```promql
sum(rate(app_http_requests_total{status_code=~"5.."}[5m])) or vector(0)
```

```promql
histogram_quantile(0.95, sum(rate(app_http_request_duration_seconds_bucket[5m])) by (le))
```

## 13. Grafana Alerting

Grafana alert rule for application downtime:

```promql
min(up{job="app"})
```

Condition:

```text
IS BELOW 1 for 1 minute
```

This detects when the production application target is down.

During failure simulation, the app can be scaled to zero replicas:

```bash
cd /opt/final-tier2
docker compose -f docker-compose.prod.yml up -d --scale app=0
```

Expected alert behavior:

```text
Normal → Pending → Firing
```

Restore the app:

```bash
docker compose -f docker-compose.prod.yml up -d --scale app=2
```

Expected alert behavior after recovery:

```text
Firing → Normal
```

## 14. Failure Simulation

Failure simulation command:

```bash
cd /opt/final-tier2
docker compose -f docker-compose.prod.yml up -d --scale app=0
```

Expected result:

- The application target becomes unavailable.
- Grafana alert changes to `Pending` and then `Firing`.
- Monitoring dashboard reflects the failure.

Recovery command:

```bash
docker compose -f docker-compose.prod.yml up -d --scale app=2
docker compose -f docker-compose.prod.yml ps
curl https://devops20.online/health
curl https://devops20.online/db
```

Expected result:

- Two app containers become healthy.
- The production website is accessible through HTTPS.
- Grafana alert returns to `Normal`.

## 15. Production Operations Commands

Check production status:

```bash
cd /opt/final-tier2
docker compose -f docker-compose.prod.yml ps
```

Start or restore production:

```bash
docker compose -f docker-compose.prod.yml up -d --scale app=2
```

View app logs:

```bash
docker compose -f docker-compose.prod.yml logs app --tail=80
```

View Caddy logs:

```bash
docker compose -f docker-compose.prod.yml logs caddy --tail=80
```

Verify production endpoints:

```bash
curl https://devops20.online/health
curl https://devops20.online/db
```

## 16. Local Development

Install dependencies:

```bash
cd app
npm install
```

Run lint:

```bash
npm run lint
```

Run build:

```bash
npm run build
```

Build Docker image locally:

```bash
docker build -t final-tier2-app:local .
```

Run locally:

```bash
docker run --rm -p 3000:3000 final-tier2-app:local
```

Open locally:

```text
http://localhost:3000
http://localhost:3000/health
http://localhost:3000/metrics
```

## 17. Environment Variables

Production uses a `.env` file on the server.

The real `.env` file is not committed to GitHub.

An example file is provided:

```text
.env.example
```

Important variables:

```env
APP_IMAGE=docker.io/legiang2090/final-tier2-app:sha-xxxxxxxx
APP_VERSION=local-dev
DATABASE_URL=postgres://finaluser:password@db:5432/finaldb
POSTGRES_DB=finaldb
POSTGRES_USER=finaluser
POSTGRES_PASSWORD=change-me
GRAFANA_USER=admin
GRAFANA_PASSWORD=change-me
DOMAIN=devops20.online
```

## 18. GitHub Actions Secrets

The following secrets are configured in the GitHub repository:

```text
DOCKERHUB_USERNAME
DOCKERHUB_TOKEN
PROD_HOST
PROD_USER
PROD_SSH_KEY
```

## 19. Security Notes

Do not commit:

```text
.env
*.pem
*.key
*.crt
Docker Hub token
SSH private key
database password
Grafana password
```

Secrets must be stored in GitHub Actions repository secrets or in the production server `.env` file.

## 20. Final Demo Flow

The final demonstration should follow this sequence:

1. Show production website through HTTPS.
2. Make a visible source code change.
3. Commit and push to the `main` branch.
4. Show GitHub Actions CI pipeline.
5. Show Docker image build, Trivy scan, and Docker Hub push.
6. Show CD deployment to EC2.
7. Verify the updated application at `https://devops20.online`.
8. Show Docker Hub image tag.
9. Open Grafana dashboard.
10. Simulate failure by scaling the app to zero replicas.
11. Show Grafana alert entering `Firing`.
12. Restore the app to two replicas.
13. Show alert returning to `Normal`.
14. Demonstrate rollback using GitHub Actions or `scripts/rollback.sh`.

## 21. Final Submission Contents

The final submission ZIP should include:

```text
app/
Dockerfile
docker-compose.prod.yml
Caddyfile.prod
prometheus/
grafana/
scripts/
.github/workflows/
.env.example
README.md
technical-report.pdf
```

The final submission ZIP must not include:

```text
.env
node_modules/
app/node_modules/
.git/
*.pem
tokens
passwords
private keys
```
