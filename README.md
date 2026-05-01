# Final Tier 2 Production CI/CD Project

## 1. Project Overview

This project implements a production-grade CI/CD system for the Startup X final project.

The selected architecture is:

**Tier 2 - Single-server containerized deployment using Docker Compose**

The production system is deployed on an AWS EC2 Ubuntu server and exposed through a public HTTPS domain.

## 2. Production URLs

- Application: https://devops20.online
- Health endpoint: https://devops20.online/health
- Database endpoint: https://devops20.online/db
- Metrics endpoint: https://devops20.online/metrics
- Grafana: https://grafana.devops20.online

## 3. Repository and Registry

- GitHub Repository: https://github.com/GiangLeK27/final-tier2-project
- Docker Hub Image: docker.io/legiang2090/final-tier2-app

Docker images are tagged using the Git commit SHA, for example:

```text
docker.io/legiang2090/final-tier2-app:sha-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

The project does not rely on the `latest` tag for production deployment.

## 4. Architecture

The production environment runs as a multi-container Docker Compose system on a single Ubuntu server.

### Services

| Service | Purpose |
|---|---|
| `caddy` | Reverse proxy and HTTPS termination |
| `app` | Node.js web application, scaled to 2 replicas |
| `db` | PostgreSQL database with persistent volume |
| `prometheus` | Metrics collection |
| `grafana` | Metrics visualization and alerting |
| `cadvisor` | Container-level metrics |
| `node-exporter` | Host-level metrics |

### Tier 2 Features

- Single cloud server
- Docker Compose orchestration
- Multi-container deployment
- Reverse proxy container
- HTTPS domain exposure
- Persistent database storage
- Service separation
- Application service scaled to 2 replicas
- Monitoring and observability stack

## 5. Infrastructure Provisioning

The cloud infrastructure is provisioned manually through AWS Academy / AWS EC2.

A structured provisioning script is also provided to prepare a fresh Ubuntu server:

```bash
bash scripts/provision-server.sh
```

The script performs the following tasks:

- Installs required system packages
- Installs Docker if missing
- Enables and starts the Docker service
- Adds the deployment user to the Docker group
- Configures firewall rules for SSH, HTTP, and HTTPS
- Creates the production directory `/opt/final-tier2`
- Verifies Docker, Docker Compose, and firewall status

This improves reproducibility while keeping the infrastructure simple for the Tier 2 architecture.

## 6. CI/CD Pipeline

The CI/CD pipeline is implemented using GitHub Actions.

The workflow file is located at:

```text
.github/workflows/ci.yml
```

A push to the `main` branch automatically triggers the full pipeline.

### Continuous Integration Stages

1. Checkout source code
2. Setup Node.js
3. Restore dependency cache
4. Install dependencies with `npm ci`
5. Run linting
6. Build the application artifact
7. Build Docker image with version tags
8. Scan Docker image with Trivy
9. Push Docker image to Docker Hub

### Continuous Delivery Stages

After CI succeeds, the CD job automatically deploys to production by SSH:

1. Connect to the production EC2 server
2. Log in to Docker Hub
3. Update `APP_IMAGE` in the production `.env` file
4. Pull the new versioned image
5. Recreate application containers using Docker Compose
6. Keep the application scaled to 2 replicas
7. Display deployment logs and container status
8. Run post-deployment health checks

### Post-deployment Health Gate

The CD pipeline validates the production system after deployment:

```bash
curl -f https://devops20.online/health
curl -f https://devops20.online/db
```

If either endpoint fails, the CD job fails.

## 7. Security Integration

Security scanning is performed using Trivy in the CI pipeline.

The pipeline scans the Docker image for `HIGH` and `CRITICAL` vulnerabilities. If such vulnerabilities are detected, the pipeline fails.

The Dockerfile was hardened by using a production runtime image and removing unnecessary package manager files from the runtime layer.

## 8. Rollback

The project supports rollback using two methods.

### Method 1: Server rollback script

The rollback script is located at:

```text
scripts/rollback.sh
```

Usage:

```bash
bash scripts/rollback.sh docker.io/legiang2090/final-tier2-app:sha-OLD_COMMIT
```

The script:

- Reads the current `APP_IMAGE`
- Updates `.env` to the selected rollback image
- Pulls the selected image
- Recreates application containers
- Validates `/health` and `/db`
- Restores the previous image if rollback validation fails

### Method 2: GitHub Actions manual rollback

The manual rollback workflow is located at:

```text
.github/workflows/rollback.yml
```

It can be triggered from:

```text
GitHub → Actions → Rollback Production → Run workflow
```

The operator enters an old Docker image tag, for example:

```text
sha-25a922e296fc5e4ddea4b089c6bc30ade1b3ff38
```

The workflow connects to the production server through SSH and performs the rollback automatically.

## 9. Monitoring and Observability

The monitoring stack uses:

- Prometheus
- Grafana
- cAdvisor
- node-exporter
- Application-level metrics from the Node.js app

### Dashboard Metrics

Grafana dashboards include:

- Server CPU usage
- Server memory usage
- Container CPU usage
- Container memory usage
- Prometheus target status
- Application request rate
- Application 5xx error rate
- HTTP request duration P95

### Application Metrics

The app exposes custom metrics through:

```text
https://devops20.online/metrics
```

Custom metrics include:

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

## 10. Grafana Alerting

Grafana Alerting is configured to detect application downtime.

Alert rule:

```promql
min(up{job="app"})
```

Alert condition:

```text
IS BELOW 1 for 1 minute
```

During the failure simulation, the application service can be scaled down to zero replicas:

```bash
docker compose -f docker-compose.prod.yml up -d --scale app=0
```

The alert enters the `Pending` state and then the `Firing` state.

To restore the system:

```bash
docker compose -f docker-compose.prod.yml up -d --scale app=2
```

After recovery, the alert returns to `Normal`.

## 11. Failure Simulation

A failure simulation is performed by scaling the app service to zero replicas:

```bash
cd /opt/final-tier2
docker compose -f docker-compose.prod.yml up -d --scale app=0
```

Expected result:

- The application target becomes unavailable.
- Grafana alert changes from `Normal` to `Pending` and then `Firing`.
- Monitoring dashboards reflect the change in container/service status.

Recovery:

```bash
docker compose -f docker-compose.prod.yml up -d --scale app=2
docker compose -f docker-compose.prod.yml ps
curl https://devops20.online/health
curl https://devops20.online/db
```

Expected result:

- Two app containers become healthy again.
- The application is accessible through HTTPS.
- Grafana alert returns to `Normal`.

## 12. Production Deployment Commands

Check production status:

```bash
cd /opt/final-tier2
docker compose -f docker-compose.prod.yml ps
```

Start production stack:

```bash
docker compose -f docker-compose.prod.yml up -d --scale app=2
```

Check logs:

```bash
docker compose -f docker-compose.prod.yml logs app --tail=80
docker compose -f docker-compose.prod.yml logs caddy --tail=80
```

Verify endpoints:

```bash
curl https://devops20.online/health
curl https://devops20.online/db
```

## 13. Local Development

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

Build Docker image:

```bash
docker build -t final-tier2-app:local .
```

Run locally:

```bash
docker run --rm -p 3000:3000 final-tier2-app:local
```

Open:

```text
http://localhost:3000
http://localhost:3000/health
http://localhost:3000/metrics
```

## 14. Environment Variables

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

## 15. Important Security Notes

The following files must not be committed:

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

Secrets are stored using GitHub Actions repository secrets:

```text
DOCKERHUB_USERNAME
DOCKERHUB_TOKEN
PROD_HOST
PROD_USER
PROD_SSH_KEY
```

## 16. Final Demo Flow

The final demonstration follows this sequence:

1. Show production website through HTTPS.
2. Make a visible source code change.
3. Commit and push to the `main` branch.
4. Show GitHub Actions CI pipeline.
5. Show Docker image build, Trivy scan, and Docker Hub push.
6. Show CD deployment to EC2.
7. Verify the updated application on `https://devops20.online`.
8. Show Grafana dashboard.
9. Simulate a failure by scaling the app to zero replicas.
10. Show Grafana alert entering `Firing`.
11. Restore the app to two replicas.
12. Show alert returning to `Normal`.
13. Demonstrate rollback using GitHub Actions or `scripts/rollback.sh`.

## 17. Submission Contents

The final submission zip should include:

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

The final submission zip must not include:

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
